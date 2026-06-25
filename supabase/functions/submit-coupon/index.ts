/**
 * Edge Function: submit-coupon v2
 *
 * Reçoit les données d'un coupon depuis la page web (/vendeur?tg=1).
 * Auth (par priorité) :
 *   1. Authorization: Bearer <supabase_jwt>  → auth web standard
 *   2. body.init_data (Telegram WebApp HMAC) → compat bot
 *
 * Body (JSON) :
 *   { code: string, odds: number, temps?: string, event_id?: string, init_data?: string }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TG_API = "https://api.telegram.org";

// ── Telegram initData validation ──────────────────────────────────────────────
async function hmacSha256(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
}
async function importHmacKey(raw: string | ArrayBuffer): Promise<CryptoKey> {
  const keyMat = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  return crypto.subtle.importKey("raw", keyMat, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function validateInitData(initData: string, botToken: string): Promise<{ user?: any } | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
    const secretKey = await importHmacKey("WebAppData");
    const secretRaw = await hmacSha256(secretKey, botToken);
    const signingKey = await importHmacKey(secretRaw);
    const expectedHash = bufToHex(await hmacSha256(signingKey, dataCheckString));
    if (expectedHash !== hash) return null;
    const authDate = parseInt(params.get("auth_date") || "0");
    if (Math.floor(Date.now() / 1000) - authDate > 86400) return null;
    const userStr = params.get("user");
    return { user: userStr ? JSON.parse(userStr) : undefined };
  } catch { return null; }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string, keyboard?: unknown): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: corsHeaders });
  }

  const botToken    = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const botUsername = Deno.env.get("BOT_USERNAME") || "pack_officiel_expert_bot";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Configuration serveur manquante" }), { status: 500, headers: corsHeaders });
  }

  // Service client pour toutes les opérations DB
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "JSON invalide" }), { status: 400, headers: corsHeaders }); }

  const { code, odds, temps, event_id, init_data } = body;

  // ── Résolution de l'identité (Auth) ────────────────────────────────────────
  let profileId: string | null = null;
  let telegramChatId: number | null = null;
  let firstName = "Revendeur";

  // Priorité 1 : JWT Supabase (auth web standard)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const jwt = authHeader.slice(7);
    // Vérifier le JWT via un client anon
    const anonClient = createClient(supabaseUrl, anonKey || serviceKey);
    const { data: { user }, error } = await anonClient.auth.getUser(jwt);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Session expirée. Reconnecte-toi." }), { status: 401, headers: corsHeaders });
    }
    profileId = user.id;
    firstName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Revendeur";

    // Récupérer le telegram_chat_id du profil si disponible (pour la notif)
    const { data: prof } = await supabase.from("profiles").select("telegram_chat_id, full_name").eq("id", profileId).maybeSingle();
    if (prof) {
      telegramChatId = prof.telegram_chat_id ?? null;
      firstName = prof.full_name || firstName;
    }
  }
  // Priorité 2 : Telegram initData (compat bot / WebApp)
  else if (init_data && botToken) {
    const tgData = await validateInitData(String(init_data), botToken);
    if (!tgData?.user?.id) {
      return new Response(JSON.stringify({ error: "Session Telegram invalide ou expirée." }), { status: 401, headers: corsHeaders });
    }
    telegramChatId = Number(tgData.user.id);
    firstName = tgData.user.first_name || "Revendeur";

    // Trouver le profil par telegram_chat_id
    const { data: prof } = await supabase.from("profiles").select("id, full_name").eq("telegram_chat_id", telegramChatId).maybeSingle();
    profileId = prof?.id ?? null;
    if (prof?.full_name) firstName = prof.full_name;

    // Créer le profil si inexistant
    if (!profileId) {
      const newId = `tg_${telegramChatId}`;
      await supabase.from("profiles").upsert({
        id: newId, full_name: firstName, is_partner: true,
        telegram_chat_id: telegramChatId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      profileId = newId;
    }
  }
  else {
    return new Response(JSON.stringify({ error: "Authentification requise (JWT Supabase ou init_data Telegram)" }), { status: 401, headers: corsHeaders });
  }

  if (!profileId) {
    return new Response(JSON.stringify({ error: "Profil introuvable. Reconnecte-toi." }), { status: 404, headers: corsHeaders });
  }

  // ── Validation des champs ──────────────────────────────────────────────────
  if (!code || !odds) {
    return new Response(JSON.stringify({ error: "Champs code et odds requis" }), { status: 400, headers: corsHeaders });
  }
  const cleanCode = String(code).trim().toUpperCase().replace(/\s+/g, "");
  if (cleanCode.length < 4 || cleanCode.length > 60) {
    return new Response(JSON.stringify({ error: "Code coupon invalide (4–60 caractères)" }), { status: 400, headers: corsHeaders });
  }
  const oddsNum = parseFloat(String(odds).replace(",", "."));
  if (isNaN(oddsNum) || oddsNum < 1.01 || oddsNum > 100000) {
    return new Response(JSON.stringify({ error: "Cote invalide (ex: 4.50 ou 12.5)" }), { status: 400, headers: corsHeaders });
  }

  // ── Calcul gain selon palier ──────────────────────────────────────────────
  const gain = oddsNum <= 5.50 ? 250 : oddsNum <= 16 ? 500 : 1000;

  // ── Parse heure expiration ────────────────────────────────────────────────
  let matchStart: string | null = null;
  if (temps) {
    const tm = String(temps).trim().match(/^(\d{1,2})[h:](\d{2})$/i);
    if (tm) {
      const hh = parseInt(tm[1]), mm = parseInt(tm[2]);
      if (hh <= 23 && mm <= 59) {
        const ms = new Date();
        ms.setHours(hh, mm, 0, 0);
        if (ms <= new Date()) ms.setDate(ms.getDate() + 1);
        matchStart = ms.toISOString();
      }
    }
  }

  // ── Récupérer le profil complet ───────────────────────────────────────────
  const { data: reseller } = await supabase
    .from("profiles")
    .select("id, full_name, fcfa_balance, is_partner")
    .eq("id", profileId)
    .maybeSingle();

  if (!reseller) {
    return new Response(JSON.stringify({ error: "Profil introuvable." }), { status: 404, headers: corsHeaders });
  }

  const isUUID = event_id && String(event_id).includes("-");

  // ── Insérer le coupon ─────────────────────────────────────────────────────
  const { data: newCoupon, error: cpErr } = await supabase.from("coupons").insert({
    code:             cleanCode,
    codes_json:       [cleanCode],
    total_odds:       oddsNum,
    price_fcfa:       gain,
    match_start_time: matchStart,
    status:           "active",
    partner_id:       reseller.id,
    creator_id:       reseller.id,
    label:            `Coupon ${oddsNum}x — 1Win`,
    ...(isUUID ? { analysis_id: event_id } : {}),
  }).select("id").single();

  if (cpErr || !newCoupon) {
    console.error("submit-coupon insert error:", cpErr);
    return new Response(JSON.stringify({ error: `Erreur création coupon : ${cpErr?.message || "inconnue"}` }), { status: 500, headers: corsHeaders });
  }

  // ── Créditer le wallet ────────────────────────────────────────────────────
  const currentBalance = reseller.fcfa_balance ?? 0;
  const newBalance = currentBalance + gain;
  await supabase.from("profiles")
    .update({ fcfa_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", reseller.id);

  // ── Enregistrer la commission ─────────────────────────────────────────────
  await supabase.from("commission_records").insert({
    partner_id:        reseller.id,
    type:              "coupon_published",
    gross_amount:      gain,
    commission_amount: 0,
    net_amount:        gain,
    reference_id:      newCoupon.id,
    description:       `Publication coupon ${cleanCode} — cote ${oddsNum}`,
  });

  // ── Notification Telegram (si chat_id connu) ──────────────────────────────
  if (telegramChatId && botToken) {
    const matchHour = matchStart
      ? new Date(matchStart).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" })
      : "—";
    const clientLink = `https://t.me/${botUsername}?start=c_${telegramChatId}`;
    await sendTelegramMessage(botToken, telegramChatId, [
      `✅ <b>Coupon publié — Wallet crédité !</b>`, ``,
      `🎫 Code    : <code>${escapeHtml(cleanCode)}</code>`,
      `📊 Cote   : <b>${oddsNum}</b>`,
      `⏰ Matchs : <b>${matchHour}</b>`, ``,
      `💰 Crédité  : <b>+${gain.toLocaleString("fr-FR")} FCFA</b>`,
      `🏦 Solde   : <b>${newBalance.toLocaleString("fr-FR")} FCFA</b>`,
    ].join("\n"), [
      [{ text: "🔗 Partager lien client", url: `https://t.me/share/url?url=${encodeURIComponent(clientLink)}` }],
      [{ text: "📊 Mon Dashboard", callback_data: "dashboard_home" }],
    ]);
  }

  return new Response(
    JSON.stringify({ success: true, coupon_id: newCoupon.id, gain_credited: gain, new_balance: newBalance }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
