/**
 * Edge Function: submit-coupon
 *
 * Reçoit les données d'un coupon depuis la page web (betesim.vercel.app/publier-coupon).
 * 1. Valide l'initData Telegram (HMAC-SHA256) pour authentifier l'utilisateur
 * 2. Trouve le profil revendeur via le chat_id (= user.id dans un chat privé Telegram)
 * 3. Insère le coupon dans la table `coupons`
 * 4. Crédite immédiatement le wallet selon les paliers de cote :
 *    - Cote 1.00 – 5.50 : 250 FCFA
 *    - Cote 5.51 – 16   : 500 FCFA
 *    - Cote > 16        : 1000 FCFA
 * 5. Enregistre dans commission_records
 * 6. Notifie le revendeur via Telegram
 *
 * Body (JSON) :
 *   { code: string, odds: number, temps: string, event_id: string, init_data: string }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TG_API = "https://api.telegram.org";

async function hmacSha256(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

async function importHmacKey(raw: string | ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMat = typeof raw === "string" ? enc.encode(raw) : raw;
  return crypto.subtle.importKey("raw", keyMat, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate Telegram WebApp initData.
 * Returns parsed user object if valid, null if invalid/expired.
 */
async function validateInitData(
  initData: string,
  botToken: string,
): Promise<{ user?: any; chat_instance?: string } | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    // secret = HMAC-SHA256("WebAppData", botToken)
    const secretKey = await importHmacKey("WebAppData");
    const secretRaw = await hmacSha256(secretKey, botToken);
    const signingKey = await importHmacKey(secretRaw);
    const expectedHashBuf = await hmacSha256(signingKey, dataCheckString);
    const expectedHash = bufToHex(expectedHashBuf);

    if (expectedHash !== hash) return null;

    // Check auth_date not too old (24h)
    const authDate = parseInt(params.get("auth_date") || "0");
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : undefined;
    return { user, chat_instance: params.get("chat_instance") ?? undefined };
  } catch {
    return null;
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  keyboard?: unknown,
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: corsHeaders });
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const botUsername = Deno.env.get("BOT_USERNAME") || "pack_officiel_expert_bot";

  if (!botToken || !supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Configuration serveur manquante" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON invalide" }), { status: 400, headers: corsHeaders });
  }

  const { code, odds, temps, event_id, init_data } = body;

  // ── Valider initData Telegram ─────────────────────────────────────────────
  let chatId: number;
  let firstName = "Revendeur";

  if (init_data && botToken) {
    const tgData = await validateInitData(String(init_data), botToken);
    if (!tgData) {
      return new Response(JSON.stringify({ error: "Session Telegram invalide ou expirée. Recommence depuis le bot." }), { status: 401, headers: corsHeaders });
    }
    if (!tgData.user?.id) {
      return new Response(JSON.stringify({ error: "Utilisateur Telegram non identifié." }), { status: 401, headers: corsHeaders });
    }
    chatId = Number(tgData.user.id);
    firstName = tgData.user.first_name || "Revendeur";
  } else {
    // Fallback : chat_id passé directement (moins sécurisé, pour tests)
    const rawChatId = body.chat_id;
    if (!rawChatId) {
      return new Response(JSON.stringify({ error: "init_data ou chat_id requis" }), { status: 400, headers: corsHeaders });
    }
    chatId = Number(rawChatId);
  }

  // ── Valider les champs du coupon ──────────────────────────────────────────
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

  // ── Trouver ou créer le profil revendeur ──────────────────────────────────
  let { data: reseller } = await supabase
    .from("profiles")
    .select("id, full_name, fcfa_balance, is_partner")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (!reseller) {
    const newId = `tg_${chatId}`;
    await supabase.from("profiles").upsert({
      id: newId, full_name: firstName, is_partner: true,
      telegram_chat_id: chatId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const { data: fp } = await supabase
      .from("profiles")
      .select("id, full_name, fcfa_balance, is_partner")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();
    reseller = fp;
  }

  if (!reseller) {
    return new Response(JSON.stringify({ error: "Profil revendeur introuvable. Utilise /connect dans le bot." }), { status: 404, headers: corsHeaders });
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
    return new Response(
      JSON.stringify({ error: `Erreur création coupon : ${cpErr?.message || "inconnue"}` }),
      { status: 500, headers: corsHeaders },
    );
  }

  // ── Créditer le wallet immédiatement ─────────────────────────────────────
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

  // ── Notification Telegram ─────────────────────────────────────────────────
  const clientLink = `https://t.me/${botUsername}?start=c_${chatId}`;
  const matchHour = matchStart
    ? new Date(matchStart).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" })
    : "—";

  const notifText = [
    `✅ <b>Coupon publié — Wallet crédité !</b>`, ``,
    `🎫 Code    : <code>${escapeHtml(cleanCode)}</code>`,
    `📊 Cote   : <b>${oddsNum}</b>`,
    `⏰ Matchs : <b>${matchHour}</b>`, ``,
    `💰 Gain crédité   : <b>+${gain.toLocaleString("fr-FR")} FCFA</b>`,
    `🏦 Nouveau solde  : <b>${newBalance.toLocaleString("fr-FR")} FCFA</b>`, ``,
    `💡 Partage ton lien pour que tes clients achètent :`,
  ].join("\n");

  await sendTelegramMessage(botToken, chatId, notifText, [
    [{ text: "🔗 Partager lien client", url: `https://t.me/share/url?url=${encodeURIComponent(clientLink)}&text=${encodeURIComponent(`🎟 Coupon disponible ! Cote ${oddsNum} — Achète ici : ${clientLink}`)}` }],
    [{ text: "➕ Ajouter un autre coupon", callback_data: "pronostics_menu" }],
    [{ text: "📊 Mon Dashboard", callback_data: "dashboard_home" }],
  ]);

  return new Response(
    JSON.stringify({
      success:       true,
      coupon_id:     newCoupon.id,
      gain_credited: gain,
      new_balance:   newBalance,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
