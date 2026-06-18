/**
 * Edge Function: telegram-bot v3
 * Intelligence Totale : accès Supabase pour répondre aux questions personnelles
 * - Statut 2FA
 * - Statut compte 1win
 * - Solde / Ventes / Commissions
 * - Menu Button → /pronostics?tg=1
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";
const FALLBACK_1WIN = "https://1w.run/?p=YvTH";
const FUNCTION_URL = `https://mqwrhiffrtbkizyuiytt.supabase.co/functions/v1/telegram-bot`;
const DELAY_SHORT = 1200;
const DELAY_LONG  = 2500;

// ─── Helpers Telegram ────────────────────────────────────────────────────────
async function tg(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN manquant");
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) console.error(`tg(${method}) failed:`, JSON.stringify(json));
  return json;
}

const sendMessage = (chatId: number, text: string, keyboard?: unknown) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: keyboard });

const editMessage = (chatId: number, messageId: number, text: string, keyboard?: unknown) =>
  tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: keyboard });

const answerCallback = (id: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: id, text });

const sendAction = (chatId: number) =>
  tg("sendChatAction", { chat_id: chatId, action: "typing" });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function sendHuman(chatId: number, text: string, kb?: unknown, delay = DELAY_SHORT) {
  await sendAction(chatId);
  await sleep(delay);
  return sendMessage(chatId, text, kb);
}

function escapeHtml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─── App URL helpers ─────────────────────────────────────────────────────────
async function getBase(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("app_settings").select("value").eq("key","app_base_url").maybeSingle();
  let base = ((data as any)?.value || "").trim();
  if (!base) base = "https://betesim.vercel.app";
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  return base.replace(/\/+$/,"");
}

async function pronosticsUrl(supabase: any) {
  return (await getBase(supabase)) + "/pronostics?tg=1";
}

async function getPartnerLink(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("app_settings").select("value").eq("key","partner_link").maybeSingle();
  return (data as any)?.value || FALLBACK_1WIN;
}

async function getPackByTgUser(supabase: any, tgUserId: number) {
  const { data } = await supabase
    .from("partner_packs").select("*")
    .eq("telegram_user_id", tgUserId)
    .order("bot_started_at", { ascending: false })
    .limit(1).maybeSingle();
  return data;
}

// ─── Intelligence DB : répond aux questions personnelles ─────────────────────
async function handleDBQuery(
  chatId: number,
  text: string,
  firstName: string,
  tgUserId: number,
  supabase: any,
) {
  const lower = text.toLowerCase();
  const pack = await getPackByTgUser(supabase, tgUserId);

  // ── Statut 2FA ─────────────────────────────────────────────────────────────
  if (lower.match(/\b(2fa|2 fa|deux.?facteurs|protection|vérif|securis|sécuris|authenti)\b/)) {
    if (!pack) {
      await sendHuman(chatId, `🔍 Je ne trouve pas ton compte lié à ce Telegram. Tape /start pour commencer.`, undefined, DELAY_SHORT);
      return true;
    }
    if (pack.secured_2fa_at) {
      const date = new Date(pack.secured_2fa_at).toLocaleDateString("fr-FR");
      await sendHuman(chatId, [
        `🛡️ <b>Oui ${escapeHtml(firstName)}, ta 2FA est activée !</b>`,
        ``,
        `✅ Activée le : <b>${date}</b>`,
        ``,
        `Ton compte Telegram est sécurisé. Si tu as une question, je suis là.`,
      ].join("\n"), undefined, DELAY_SHORT);
    } else {
      await sendHuman(chatId, [
        `⚠️ <b>Non ${escapeHtml(firstName)}, ta 2FA n'est pas encore activée.</b>`,
        ``,
        `C'est obligatoire pour accéder au Pack Officiel.`,
        `Clique ici pour l'activer en 1 minute :`,
      ].join("\n"), {
        inline_keyboard: [[
          { text: "🔒 Activer ma 2FA maintenant", url: "tg://settings/2fa" },
        ]],
      }, DELAY_SHORT);
    }
    return true;
  }

  // ── Statut compte / 1win ────────────────────────────────────────────────────
  if (lower.match(/\b(compte|statut|inscri|1win|activé|accès|logiciel|débloqu|partenaire)\b/)) {
    if (!pack) {
      await sendHuman(chatId, `🔍 Aucun compte trouvé pour ce Telegram. Tape /start pour démarrer.`, undefined, DELAY_SHORT);
      return true;
    }
    const steps: string[] = [];
    steps.push(pack.bot_started_at
      ? `✅ Démarrage bot : ${new Date(pack.bot_started_at).toLocaleDateString("fr-FR")}`
      : `❌ Bot pas encore démarré`);
    steps.push(pack.secured_2fa_at
      ? `✅ 2FA activée : ${new Date(pack.secured_2fa_at).toLocaleDateString("fr-FR")}`
      : `❌ 2FA non activée`);
    steps.push(pack.telegram_username
      ? `✅ Username Telegram : @${pack.telegram_username}`
      : `❌ Pas d'@username Telegram`);
    steps.push(pack.partner_clicked_at
      ? `✅ Inscrit sur 1win : ${new Date(pack.partner_clicked_at).toLocaleDateString("fr-FR")}`
      : `❌ Pas encore inscrit sur 1win`);
    steps.push(pack.software_unlocked_at
      ? `🎉 Logiciel débloqué : ${new Date(pack.software_unlocked_at).toLocaleDateString("fr-FR")}`
      : `🔒 Logiciel pas encore débloqué`);

    const unlocked = !!pack.software_unlocked_at;
    const proUrl = await pronosticsUrl(supabase);
    const kb = unlocked
      ? { inline_keyboard: [[{ text: "📊 Ouvrir mes Pronostics", web_app: { url: proUrl } }]] }
      : undefined;

    await sendHuman(chatId, [
      `📋 <b>Ton statut de compte, ${escapeHtml(firstName)} :</b>`,
      ``,
      ...steps,
      ``,
      unlocked
        ? `🚀 Tu as un accès complet au Pack Officiel !`
        : `👉 Tape /start pour continuer le parcours d'activation.`,
    ].join("\n"), kb, DELAY_LONG);
    return true;
  }

  // ── Solde / Ventes / Commissions ────────────────────────────────────────────
  // Catalogue coupons
  if (lower.match(/\b(coupon|coupons|catalogue|acheter|achat|prono|pronostic|disponible|pool)\b/)) {
    const coupons = await fetchPoolCoupons(supabase);
    const keyboard = coupons.length > 0 ? {
      inline_keyboard: [
        ...coupons.slice(0,5).map(c => [{
          text: `${c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon"} — ${c.price_fcfa.toLocaleString("fr-FR")} F`,
          callback_data: `acheter_${c.id}`,
        }]),
        ...(coupons.length > 5 ? [[{ text:`+ ${coupons.length - 5} autres → /coupons`, callback_data:"voir_pool" }]] : []),
      ],
    } : undefined;
    await sendHuman(chatId, formatCouponList(coupons), keyboard, DELAY_SHORT);
    return true;
  }

  if (lower.match(/\b(solde|vente|vendu|argent|combien|gagné|gagner|commission|retrait|wallet|earning)\b/)) {
    if (!pack?.software_unlocked_at) {
      await sendHuman(chatId, `🔒 Cette information est disponible après l'activation de ton compte. Tape /start pour commencer.`, undefined, DELAY_SHORT);
      return true;
    }
    // On cherche le profil utilisateur par pack.id → profiles
    const { data: commissions } = await supabase
      .from("commission_records")
      .select("type, net_amount, gross_amount, commission_amount, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    const sales = (commissions ?? []).filter((r: any) => r.type === "coupon_sale");
    const totalNet   = sales.reduce((s: number, r: any) => s + (r.net_amount ?? 0), 0);
    const totalGross = sales.reduce((s: number, r: any) => s + (r.gross_amount ?? 0), 0);
    const totalComm  = sales.reduce((s: number, r: any) => s + (r.commission_amount ?? 0), 0);

    if (sales.length === 0) {
      await sendHuman(chatId, [
        `💰 <b>Ton portefeuille vendeur, ${escapeHtml(firstName)} :</b>`,
        ``,
        `📦 Tu n'as pas encore fait de ventes de coupon.`,
        ``,
        `Pour commencer à vendre, ouvre l'application, sélectionne des matchs et crée ton coupon !`,
      ].join("\n"), {
        inline_keyboard: [[{
          text: "📊 Créer mon premier coupon",
          web_app: { url: await pronosticsUrl(supabase) },
        }]],
      }, DELAY_SHORT);
    } else {
      await sendHuman(chatId, [
        `💰 <b>Ton portefeuille vendeur, ${escapeHtml(firstName)} :</b>`,
        ``,
        `📦 Coupons vendus : <b>${sales.length}</b>`,
        `💵 Total brut : <b>${totalGross.toLocaleString("fr-FR")} FCFA</b>`,
        `🏦 Commission plateforme (30%) : − <b>${totalComm.toLocaleString("fr-FR")} FCFA</b>`,
        `✅ Tu as reçu : <b>${totalNet.toLocaleString("fr-FR")} FCFA</b>`,
        ``,
        `📲 Pour retirer ton argent via MTN, ouvre l'espace vendeur.`,
      ].join("\n"), {
        inline_keyboard: [[{
          text: "💸 Ouvrir mon portefeuille vendeur",
          web_app: { url: (await getBase(supabase)) + "/vendeur?tg=1" },
        }]],
      }, DELAY_LONG);
    }
    return true;
  }

  return false; // pas une question DB
}

// ─── Handler message libre ───────────────────────────────────────────────────
async function handleFreeText(chatId: number, text: string, firstName: string, tgUserId: number, supabase: any) {
  // D'abord vérifier si c'est une question DB
  const handled = await handleDBQuery(chatId, text, firstName, tgUserId, supabase);
  if (handled) return;

  const lower = text.toLowerCase();
  const proUrl = await pronosticsUrl(supabase);
  const proKb = { inline_keyboard: [[{ text: "📊 Voir les Pronostics", web_app: { url: proUrl } }]] };

  const greetKw = ["salut","bonjour","hello","hi","allo","allô","bonsoir","yo","slt","bjr","bj"];
  const openKw  = ["pronostic","prono","match","voir","logiciel","coupon","pack","ouvrir","start","analyse"];
  const helpKw  = ["aide","help","?","comment","quoi","kess","kes ke","info"];

  const isGreet = greetKw.some(k => lower.includes(k));
  const isOpen  = openKw.some(k => lower.includes(k));
  const isHelp  = helpKw.some(k => lower.includes(k));

  let reply: string;
  let kb: unknown = proKb;

  if (isGreet && !isOpen) {
    reply = [
      `👋 <b>Salut ${escapeHtml(firstName)} !</b>`,
      ``,
      `Bienvenue dans <b>Pack Officiel</b> 🎯`,
      ``,
      `Tu peux me demander :`,
      `• Mon 2FA est actif ?`,
      `• Quel est mon statut de compte ?`,
      `• Quel est mon solde ?`,
      ``,
      `Ou touche le bouton pour voir les pronostics du jour 👇`,
    ].join("\n");
  } else if (isOpen) {
    reply = [
      `📊 <b>Tes pronostics t'attendent, ${escapeHtml(firstName)} !</b>`,
      ``,
      `Appuie sur le bouton ci-dessous 👇`,
    ].join("\n");
  } else if (isHelp) {
    reply = [
      `🤖 <b>Voici ce que je peux faire pour toi :</b>`,
      ``,
      `🛡️ <b>Vérifier ton 2FA</b> → "Mon 2FA est activé ?"`,
      `📋 <b>Voir ton statut</b> → "Quel est mon statut ?"`,
      `💰 <b>Voir ton solde</b> → "C'est quoi mon solde ?"`,
      ``,
      `📊 <b>Commandes rapides :</b>`,
      `• /start — Démarrer le parcours`,
      `• /app — Ouvrir les pronostics`,
    ].join("\n");
  } else {
    // Message non reconnu → guide simple
    reply = [
      `🤔 Je n'ai pas bien compris, ${escapeHtml(firstName)}.`,
      ``,
      `Essaie :`,
      `• "Mon 2FA est actif ?" — pour vérifier ta sécurité`,
      `• "Quel est mon statut ?" — pour voir ton compte`,
      `• "Quel est mon solde ?" — pour tes ventes`,
      ``,
      `Ou touche le bouton pour accéder aux pronostics 👇`,
    ].join("\n");
  }

  await sendAction(chatId);
  await sleep(DELAY_SHORT);
  await sendMessage(chatId, reply, kb);
}

// ─── Flow /start ─────────────────────────────────────────────────────────────
function welcomeMessage(firstName: string) {
  return [
    `🎉 <b>Salut ${escapeHtml(firstName)} !</b>`,
    ``,
    `Bienvenue dans <b>Pack Officiel</b>. Avant de débloquer ton accès,`,
    `on va sécuriser ton compte en 3 minutes chrono. Suis-moi étape par étape 👇`,
  ].join("\n");
}

function step1Message() {
  return [
    `🔒 <b>ÉTAPE 1 / 3 — Sécurise ton compte (2FA)</b>`,
    ``,
    `C'est l'étape la plus importante. Sans 2FA, n'importe qui peut prendre`,
    `ton numéro et tes gains.`,
    ``,
    `Quand tu cliques sur le bouton, Telegram va te demander :`,
    ``,
    `1️⃣  Un <b>mot de passe de 8 caractères minimum</b>`,
    `      → choisis quelque chose dont tu te souviens (ex : <code>Bete2026!</code>)`,
    ``,
    `2️⃣  Une <b>adresse Gmail de récupération</b>`,
    `      → mets celle <b>déjà sur ton téléphone</b> (Play Store / Samsung)`,
    ``,
    `Une fois fait, reviens ici et clique sur "✅ J'ai activé la 2FA".`,
  ].join("\n");
}

const step1Keyboard = {
  inline_keyboard: [
    [{ text: "🔒 Activer la 2FA maintenant", url: "tg://settings/2fa" }],
    [{ text: "✅ J'ai activé la 2FA", callback_data: "done_2fa" }],
  ],
};

function step2Infos(firstName: string, username: string | null) {
  const tmeLink = username ? `https://t.me/${username}` : null;
  if (!username) {
    return [
      `📋 <b>ÉTAPE 2 / 3 — Tes infos perso</b>`,
      ``,
      `⚠️ <b>Tu n'as pas encore d'@username Telegram.</b>`,
      ``,
      `C'est obligatoire pour la suite. Voilà comment faire (30 secondes) :`,
      `1. Ouvre <b>Réglages</b> Telegram → <b>Modifier le profil</b>`,
      `2. Touche <b>Nom d'utilisateur</b> et choisis-en un`,
      ``,
      `Une fois fait, clique sur "🔄 J'ai créé mon username".`,
    ].join("\n");
  }
  return [
    `📋 <b>ÉTAPE 2 / 3 — Tes infos pour la suite</b>`,
    ``,
    `📛 <b>Ton prénom :</b> <code>${escapeHtml(firstName)}</code>`,
    `🔖 <b>Ton @username :</b> <code>@${escapeHtml(username)}</code>`,
    `🌐 <b>Ton lien Telegram :</b> <code>${tmeLink}</code>`,
    ``,
    `👇 Quand tu es prêt(e), passe à l'étape finale.`,
  ].join("\n");
}

function step2Keyboard(hasUsername: boolean) {
  return hasUsername
    ? { inline_keyboard: [[{ text: "🚀 Continuer vers l'étape 3", callback_data: "goto_1win" }]] }
    : { inline_keyboard: [
        [{ text: "📖 Tuto vidéo (1 min)", url: "https://telegram.org/faq#q-how-do-i-get-a-username" }],
        [{ text: "🔄 J'ai créé mon username", callback_data: "recheck_username" }],
      ]};
}

function step3Message(username: string, partnerLink: string) {
  return [
    `🚀 <b>ÉTAPE 3 / 3 — Inscription Partenaire 1win</b>`,
    ``,
    `Lien d'inscription : ${partnerLink}`,
    ``,
    `⚠️ <b>3 CHOIX OBLIGATOIRES :</b>`,
    ``,
    `1️⃣  <b>Messagerie préférée</b> → <b>Telegram</b>`,
    `2️⃣  <b>Niveau d'expérience</b> → <b>Aucune expérience</b>`,
    `3️⃣  <b>Site Web</b> → colle ton lien : <code>https://t.me/${escapeHtml(username)}</code>`,
    ``,
    `Une fois inscrit, clique sur "✅ Je me suis inscrit".`,
  ].join("\n");
}

const step3Keyboard = (link: string) => ({
  inline_keyboard: [
    [{ text: "🔗 Ouvrir 1win maintenant", url: link }],
    [{ text: "✅ Je me suis inscrit sur 1win", callback_data: "done_1win" }],
  ],
});

function unlockedMessage(firstName: string, hasUrl: boolean) {
  return [
    `🎊 <b>BRAVO ${firstName.toUpperCase()} !</b>`,
    ``,
    `Ton compte est <b>100 % sécurisé et activé</b>. Tu fais maintenant`,
    `partie du Pack Officiel.`,
    ``,
    hasUrl
      ? `Touche le bouton ci-dessous pour ouvrir <b>tes pronostics du jour</b> en plein écran.`
      : `Reste connecté(e), le lien du logiciel arrive dans un instant.`,
  ].join("\n");
}


// ─── Pool Commun helpers ──────────────────────────────────────────────────────
async function fetchPoolCoupons(supabase: any) {
  const { data } = await supabase
    .from("coupons")
    .select("id, code, label, price_fcfa, platform, creator_id, analyses:analysis_id(team_home, team_away, league, result)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as Array<{
    id: string; code: string; label: string | null; price_fcfa: number;
    platform: string | null; creator_id: string | null;
    analyses: { team_home: string; team_away: string; league: string | null; result: string } | null;
  }>;
}

function formatCouponList(coupons: ReturnType<typeof fetchPoolCoupons> extends Promise<infer T> ? T : never): string {
  if (!coupons.length) return "📭 <b>Aucun coupon disponible en ce moment.</b>\n\nRevenez dans quelques heures !";
  const lines = coupons.map((c, i) => {
    const match = c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon";
    const platform = c.platform ? ` [${c.platform.toUpperCase()}]` : "";
    return `${i+1}. <b>${match}${platform}</b> — <code>${c.price_fcfa.toLocaleString("fr-FR")} FCFA</code>`;
  });
  return [`🎟 <b>Coupons disponibles (${coupons.length})</b>\n`, ...lines, `\n👇 Clique sur un coupon pour l'acheter`].join("\n");
}

async function deliverCoupon(chatId: number, couponCode: string, platform: string | null, price: number) {
  const platformLabel = platform ? platform.toUpperCase() : "1xBet/1Win";
  await sendMessage(chatId, [
    `✅ <b>Paiement confirmé — Voici ton code !</b>\n`,
    `🎟 <b>Ton code booking ${platformLabel} :</b>\n<code>${couponCode}</code>\n`,
    `<b>Comment l'utiliser :</b>\n`,
    `1️⃣ Ouvre ${platformLabel}\n`,
    `2️⃣ Va dans <b>Paris → Entrer un code</b>\n`,
    `3️⃣ Colle : <code>${couponCode}</code>\n`,
    `4️⃣ Confirme et mise !`,
    `\n💰 <i>Prix payé : ${price.toLocaleString("fr-FR")} FCFA</i>`,
  ].join(""));
}

async function buildSoftwareUrl(supabase: any, packId: string) {
  return (await getBase(supabase)) + `/pronostics?pack_id=${packId}&tg=1`;
}

// ─── Serve ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get("action");
  const token  = Deno.env.get("TELEGRAM_BOT_TOKEN");

  const makeSupabase = () => createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── GET ?action=info ──────────────────────────────────────────────────────
  if (req.method === "GET" && action === "info") {
    if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 500 });
    const r = await fetch(`${TG_API}/bot${token}/getWebhookInfo`);
    return new Response(await r.text(), { headers: { "Content-Type": "application/json" } });
  }

  // ── GET ?action=register ──────────────────────────────────────────────────
  if (req.method === "GET" && action === "register") {
    if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 500 });
    const r = await fetch(`${TG_API}/bot${token}/setWebhook`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: FUNCTION_URL, allowed_updates: ["message","callback_query"] }),
    });
    return new Response(await r.text(), { headers: { "Content-Type": "application/json" } });
  }

  // ── GET ?action=set-menu-button ───────────────────────────────────────────
  if (req.method === "GET" && action === "set-menu-button") {
    if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 500 });
    const sb = makeSupabase();
    const pUrl = await pronosticsUrl(sb);
    const r = await fetch(`${TG_API}/bot${token}/setChatMenuButton`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu_button: { type:"web_app", text:"📊 Pronostics", web_app:{ url: pUrl } } }),
    });
    const json = await r.json();
    return new Response(JSON.stringify({ ...json, pronosticsUrl: pUrl }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") return new Response("OK", { status: 200 });

  const supabase = makeSupabase();
  let update: any;
  try { update = await req.json(); }
  catch { return new Response("ok", { status: 200 }); }

  try {
    // ── /app ─────────────────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/app")) {
      const chatId = update.message.chat.id;
      const pUrl = await pronosticsUrl(supabase);
      await sendMessage(chatId, `🎯 Ouvre <b>Pack Officiel</b> en plein écran :`, {
        inline_keyboard: [[{ text:"📊 Voir les Pronostics", web_app:{ url: pUrl } }]],
      });
      return new Response("ok", { status: 200 });
    }

    // ── /coupons /catalogue ───────────────────────────────────────────────
    if (update.message?.text?.match(/^\/coupons|^\/catalogue|^\/pool/)) {
      const chatId = update.message.chat.id;
      const coupons = await fetchPoolCoupons(supabase);
      const keyboard = coupons.length > 0 ? {
        inline_keyboard: coupons.map(c => [{
          text: `${c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon"} — ${c.price_fcfa.toLocaleString("fr-FR")} F`,
          callback_data: `acheter_${c.id}`,
        }]),
      } : undefined;
      await sendMessage(chatId, formatCouponList(coupons), keyboard);
      return new Response("ok", { status: 200 });
    }

    // ── /confirmer (admin) ────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/confirmer")) {
      const chatId = update.message.chat.id;
      const parts = update.message.text.split(" ");
      const couponId = parts[1];
      const buyerChatId = Number(parts[2]);
      if (!couponId || !buyerChatId) {
        await sendMessage(chatId, "Usage : /confirmer {coupon_id} {buyer_chat_id}");
        return new Response("ok", { status: 200 });
      }
      const { data: coupon } = await supabase.from("coupons").select("id,code,price_fcfa,platform,status").eq("id", couponId).maybeSingle();
      if (!coupon) { await sendMessage(chatId, "❌ Coupon introuvable"); return new Response("ok", { status: 200 }); }
      if (coupon.status !== "active") { await sendMessage(chatId, "❌ Coupon déjà vendu ou inactif"); return new Response("ok", { status: 200 }); }
      await supabase.from("coupons").update({ status:"sold", sold_at: new Date().toISOString(), buyer_id: String(buyerChatId) }).eq("id", couponId);
      await deliverCoupon(buyerChatId, coupon.code, coupon.platform, coupon.price_fcfa);
      await sendMessage(chatId, `✅ Paiement confirmé. Code <code>${coupon.code}</code> envoyé au client ${buyerChatId}.`);
      return new Response("ok", { status: 200 });
    }

    // ── /start <pack_id> ─────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/start")) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const tgUser = msg.from;
      const firstName = tgUser?.first_name || "Partenaire";
      const username  = tgUser?.username || null;
      const tgUserId  = tgUser?.id;
      const packId    = msg.text.split(" ")[1]?.trim();

      if (!packId) {
        const pUrl = await pronosticsUrl(supabase);
        await sendMessage(chatId, [
          `👋 <b>Bienvenue ${escapeHtml(firstName)} sur Pack Officiel !</b>`,
          ``,
          `🎯 Touche le bouton ci-dessous pour démarrer.`,
        ].join("\n"), {
          inline_keyboard: [[{ text:"📊 Voir les Pronostics", web_app:{ url: pUrl } }]],
        });
        return new Response("ok", { status: 200 });
      }

      const { data: pack, error } = await supabase
        .from("partner_packs")
        .update({ telegram_user_id: tgUserId, telegram_username: username,
          telegram_first_name: firstName, bot_started_at: new Date().toISOString() })
        .eq("id", packId).select().maybeSingle();

      if (error || !pack) {
        await sendMessage(chatId, `❌ Pack introuvable. Contactez le support.`);
        return new Response("ok", { status: 200 });
      }

      if (pack.software_unlocked_at) {
        const softUrl = await buildSoftwareUrl(supabase, pack.id);
        await sendHuman(chatId, unlockedMessage(firstName, true), {
          inline_keyboard: [
          [{ text:"📊 Ouvrir le Pack Officiel", web_app:{ url: softUrl } }],
          [{ text:"🎟 Voir les coupons disponibles", callback_data:"voir_pool" }],
        ],
        }, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }

      await sendMessage(chatId, welcomeMessage(firstName));
      await sendHuman(chatId, step1Message(), step1Keyboard, DELAY_LONG);
      return new Response("ok", { status: 200 });
    }

    // ── Callback buttons ─────────────────────────────────────────────────
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId    = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const tgUserId  = cb.from.id;
      const username  = cb.from.username || null;
      const firstName = cb.from.first_name || "Partenaire";
      const data = cb.data;
      const pack = await getPackByTgUser(supabase, tgUserId);

      if (!pack) {
        await answerCallback(cb.id, "Session expirée — tape /start");
        return new Response("ok", { status: 200 });
      }

      if (data === "done_2fa") {
        await supabase.from("partner_packs").update({
          secured_2fa_at: new Date().toISOString(),
          telegram_username: username ?? pack.telegram_username,
          telegram_first_name: firstName ?? pack.telegram_first_name,
        }).eq("id", pack.id);
        await answerCallback(cb.id, "✅ 2FA confirmée");
        await editMessage(chatId, messageId, `✅ <b>2FA activée — bravo !</b>`);
        await sendHuman(chatId, step2Infos(firstName, username ?? pack.telegram_username ?? null),
          step2Keyboard(!!(username ?? pack.telegram_username)), DELAY_LONG);
        return new Response("ok", { status: 200 });
      }

      if (data === "recheck_username") {
        const uname = username ?? null;
        if (!uname) {
          await answerCallback(cb.id, "Toujours pas d'@username…");
          await sendHuman(chatId, `🤔 Je ne vois toujours pas d'@username.\n\nVa dans <b>Réglages → Modifier le profil → Nom d'utilisateur</b> puis réessaie.`,
            step2Keyboard(false), DELAY_SHORT);
          return new Response("ok", { status: 200 });
        }
        await supabase.from("partner_packs").update({ telegram_username: uname }).eq("id", pack.id);
        await answerCallback(cb.id, "✅ Username détecté !");
        await sendHuman(chatId, step2Infos(firstName, uname), step2Keyboard(true), DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }

      if (data === "goto_1win") {
        const uname = username ?? pack.telegram_username ?? null;
        if (!uname) { await answerCallback(cb.id, "Crée d'abord ton @username"); return new Response("ok", { status: 200 }); }
        const partnerLink = await getPartnerLink(supabase);
        await answerCallback(cb.id);
        await sendHuman(chatId, step3Message(uname, partnerLink), step3Keyboard(partnerLink), DELAY_LONG);
        return new Response("ok", { status: 200 });
      }

      if (data === "done_1win") {
        const now = new Date().toISOString();
        await supabase.from("partner_packs").update({
          partner_clicked_at: now, software_unlocked_at: now,
        }).eq("id", pack.id);
        const softUrl = await buildSoftwareUrl(supabase, pack.id);
        await answerCallback(cb.id, "🚀 Accès débloqué !");
        await editMessage(chatId, messageId, `✅ <b>Inscription 1win enregistrée.</b>`);
        await sendHuman(chatId, unlockedMessage(firstName, true), {
          inline_keyboard: [[{ text:"📊 Ouvrir le Pack Officiel", web_app:{ url: softUrl } }],[{ text:"🎟 Voir les coupons disponibles", callback_data:"voir_pool" }]],
        }, DELAY_LONG);
        return new Response("ok", { status: 200 });
      }

      // Voir catalogue coupons
      if (data === "voir_pool") {
        const coupons = await fetchPoolCoupons(supabase);
        const keyboard = coupons.length > 0 ? {
          inline_keyboard: coupons.map(c => [{
            text: `${c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon"} — ${c.price_fcfa.toLocaleString("fr-FR")} F`,
            callback_data: `acheter_${c.id}`,
          }]),
        } : undefined;
        await answerCallback(cb.id);
        await sendMessage(chatId, formatCouponList(coupons), keyboard);
        return new Response("ok", { status: 200 });
      }

      // Acheter un coupon
      if (data.startsWith("acheter_")) {
        const couponId = data.replace("acheter_","");
        const { data: coupon } = await supabase.from("coupons")
          .select("id, code, label, price_fcfa, platform, status, analyses:analysis_id(team_home, team_away)")
          .eq("id", couponId).maybeSingle();
        if (!coupon) { await answerCallback(cb.id, "Coupon introuvable"); return new Response("ok", { status: 200 }); }
        if (coupon.status !== "active") { await answerCallback(cb.id, "Ce coupon n'est plus disponible"); return new Response("ok", { status: 200 }); }
        const match = coupon.analyses ? `${(coupon.analyses as any).team_home} vs ${(coupon.analyses as any).team_away}` : coupon.label || "Coupon";
        const platform = coupon.platform?.toUpperCase() || "1xBet/1Win";
        await answerCallback(cb.id);
        await sendHuman(chatId, [
          `🛒 <b>${match} [${platform}]</b>\n`,
          `💰 Prix : <b>${coupon.price_fcfa.toLocaleString("fr-FR")} FCFA</b>\n`,
          `Pour acheter ce coupon, effectue un paiement de <b>${coupon.price_fcfa.toLocaleString("fr-FR")} FCFA</b>\n`,
          `📲 Envoie le paiement par Mobile Money, puis envoie la capture ici.\n`,
          `⚡ Un admin confirmera et tu recevras ton code automatiquement.\n`,
          `📌 Référence commande : <code>COUP-${couponId.slice(0,8).toUpperCase()}</code>`,
        ].join(""), {
          inline_keyboard: [[{ text:"❌ Annuler", callback_data:"voir_pool" }]],
        }, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }

      await answerCallback(cb.id);
      return new Response("ok", { status: 200 });
    }

    // ── Messages texte libres ─────────────────────────────────────────────
    if (update.message?.text && !update.message.text.startsWith("/")) {
      const chatId   = update.message.chat.id;
      const tgUserId = update.message.from?.id ?? 0;
      const firstName = update.message.from?.first_name || "ami";
      await handleFreeText(chatId, update.message.text, firstName, tgUserId, supabase);
      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("telegram-bot error:", err?.message ?? err);
    return new Response("ok", { status: 200 });
  }
});
