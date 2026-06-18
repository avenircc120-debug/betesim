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
  if (lower.match(/\b(coupon|coupons|catalogue|acheter|achat|prono|pronostic|disponible|pool|tip|paris|pari|veux|liste|voir|buy)\b/)) {
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
    await sendHuman(chatId, formatCatalog(coupons), keyboard, DELAY_SHORT);
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


// ─── Pool Commun helpers ─────────────────────────────────────────────────────

async function getAdminChatId(supabase: any): Promise<number | null> {
  const envId = Deno.env.get("ADMIN_CHAT_ID");
  if (envId) return Number(envId);
  const { data } = await supabase.from("app_settings").select("value").eq("key","admin_chat_id").maybeSingle();
  return data?.value ? Number(data.value) : null;
}

async function fetchPoolCoupons(supabase: any) {
  const { data } = await supabase
    .from("coupons")
    .select("id, code, label, price_fcfa, platform, creator_id, analyses:analysis_id(team_home, team_away, league, result)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(15);
  return (data ?? []) as Array<{
    id: string; code: string; label: string | null; price_fcfa: number;
    platform: string | null; creator_id: string | null;
    analyses: { team_home: string; team_away: string; league: string | null; result: string } | null;
  }>;
}

function partialCode(code: string): string {
  if (!code || code.length < 3) return "●●●●●●";
  return code.slice(0, 3) + "●".repeat(Math.max(4, code.length - 3));
}

function couponDisplayName(c: { label: string | null; analyses: { team_home: string; team_away: string } | null }): string {
  if (c.analyses) return `${c.analyses.team_home} vs ${c.analyses.team_away}`;
  return c.label || "Coupon";
}

function formatCatalog(coupons: Awaited<ReturnType<typeof fetchPoolCoupons>>): string {
  if (!coupons.length) return [
    "📭 <b>Aucun coupon disponible pour le moment.</b>",
    "",
    "💡 Revenez dans quelques heures !",
  ].join("\n");
  const lines = coupons.map((c, i) => {
    const name = couponDisplayName(c);
    const plat = c.platform ? ` [${c.platform.toUpperCase()}]` : "";
    return `${i + 1}. 🎟 <b>${name}${plat}</b> — <b>${c.price_fcfa.toLocaleString("fr-FR")} FCFA</b>`;
  });
  return [`🎰 <b>Coupons disponibles (${coupons.length})</b>`, `<i>Sélectionne un coupon pour l'acheter.</i>`, "", ...lines].join("\n");
}

async function getMobileMoneyNumber(supabase: any): Promise<string> {
  const { data } = await supabase.from("app_settings").select("value").eq("key","mobile_money_number").maybeSingle();
  return data?.value || Deno.env.get("MOBILE_MONEY_NUMBER") || "XX XX XX XX XX";
}

async function createBotOrder(supabase: any, couponId: string, buyerChatId: number, buyerName: string, amount: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("bot_orders")
    .insert({ coupon_id: couponId, buyer_chat_id: buyerChatId, buyer_name: buyerName, amount_fcfa: amount, status: "pending" })
    .select("id").single();
  if (error) { console.error("createBotOrder:", error.message); return null; }
  return (data as { id: string }).id;
}

async function confirmBotOrder(supabase: any, orderId: string) {
  const { data: order } = await supabase
    .from("bot_orders")
    .select("id, buyer_chat_id, amount_fcfa, coupons(id, code, platform, price_fcfa, creator_id, referrer_id)")
    .eq("id", orderId).maybeSingle();
  if (!order) return null;
  const coupon = (order as any).coupons;
  if (!coupon) return null;
  await supabase.from("coupons").update({ status: "sold", sold_at: new Date().toISOString(), buyer_id: String(order.buyer_chat_id) }).eq("id", coupon.id);
  await supabase.from("bot_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
  const gross = coupon.price_fcfa;
  const creatorShare = Math.round(gross * 0.70);
  const referrerShare = Math.round(gross * 0.10);
  const platformShare = gross - creatorShare - referrerShare;
  const records: any[] = [
    { coupon_id: coupon.id, type: "coupon_sale", gross_amount: gross, commission_amount: platformShare, net_amount: creatorShare, description: "Vente coupon (70%)", partner_id: coupon.creator_id },
  ];
  if (coupon.referrer_id) records.push({ coupon_id: coupon.id, type: "referral_commission", gross_amount: gross, commission_amount: platformShare, net_amount: referrerShare, description: "Commission parrain (10%)", partner_id: coupon.referrer_id });
  if (records.length) await supabase.from("commission_records").insert(records);
  return { couponCode: coupon.code, buyerChatId: order.buyer_chat_id, platform: coupon.platform, amount: gross };
}

async function notifyAdmin(supabase: any, orderId: string, buyerName: string, buyerChatId: number, name: string, amount: number) {
  const adminChatId = await getAdminChatId(supabase);
  if (!adminChatId) return;
  const shortRef = orderId.slice(0, 8).toUpperCase();
  await sendMessage(adminChatId, [
    `💳 <b>Nouveau paiement client</b>`, ``,
    `👤 Client : <b>${escapeHtml(buyerName)}</b> (ID: ${buyerChatId})`,
    `🎟 Coupon : <b>${escapeHtml(name)}</b>`,
    `💰 Montant : <b>${amount.toLocaleString("fr-FR")} FCFA</b>`,
    `📌 Réf : <code>${shortRef}</code>`, ``,
    `Confirme ou refuse ce paiement :`,
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "✅ Confirmer le paiement", callback_data: `confirm_${orderId}` }],
      [{ text: "❌ Refuser", callback_data: `refuse_${orderId}` }],
    ],
  });
}

async function deliverCode(chatId: number, code: string, platform: string | null, amount: number) {
  const plat = platform ? platform.toUpperCase() : "1xBet/1Win";
  await sendMessage(chatId, [
    `✅ <b>Paiement confirmé — Voici ton code !</b>`, ``,
    `🎟 <b>Code booking ${plat} :</b>`, ``,
    `<code>${code}</code>`, ``,
    `<b>Comment l'utiliser :</b>`,
    `1️⃣ Ouvre ${plat}`,
    `2️⃣ Va dans <b>Paris → Entrer un code</b>`,
    `3️⃣ Colle le code ci-dessus`,
    `4️⃣ Confirme et mise !`, ``,
    `💰 <i>Montant payé : ${amount.toLocaleString("fr-FR")} FCFA</i>`,
  ].join("\n"));
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
        inline_keyboard: [
          [{ text:"📊 Voir les Pronostics", web_app:{ url: pUrl } }],
          [{ text:"🎟 Voir les coupons disponibles", callback_data:"voir_pool" }],
        ],
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
      await sendMessage(chatId, formatCatalog(coupons), keyboard);
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


    // ── /coupons /catalogue ───────────────────────────────────────────────────
    if (update.message?.text?.match(/^\/coupons|^\/catalogue|^\/pool/i)) {
      const chatId = update.message.chat.id;
      const coupons = await fetchPoolCoupons(supabase);
      await sendMessage(chatId, formatCatalog(coupons), coupons.length > 0 ? {
        inline_keyboard: coupons.map(c => [{
          text: `${couponDisplayName(c)} — ${c.price_fcfa.toLocaleString("fr-FR")} F`,
          callback_data: `acheter_${c.id}`,
        }]),
      } : undefined);
      return new Response("ok", { status: 200 });
    }

    // ── /ordres (admin) ───────────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/ordres")) {
      const chatId = update.message.chat.id;
      const { data: orders } = await supabase
        .from("bot_orders")
        .select("id, buyer_name, buyer_chat_id, amount_fcfa, status, coupons(label, platform, analyses:analysis_id(team_home, team_away))")
        .in("status", ["pending","paid"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (!orders?.length) {
        await sendMessage(chatId, "📭 Aucune commande en attente.");
        return new Response("ok", { status: 200 });
      }
      const lines = (orders as any[]).map((o, i) => {
        const c = o.coupons;
        const n = c ? (c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon") : "?";
        const emoji = o.status === "paid" ? "✅" : "⏳";
        return `${emoji} ${i+1}. <b>${escapeHtml(o.buyer_name||"Client")}</b> — ${n} — ${o.amount_fcfa.toLocaleString("fr-FR")} F\n   Réf: <code>${o.id.slice(0,8).toUpperCase()}</code>`;
      });
      await sendMessage(chatId, [`📋 <b>Commandes récentes (${orders.length})</b>`, "", ...lines].join("\n"));
      return new Response("ok", { status: 200 });
    }

    // ── /confirmer {order_id} (admin) ─────────────────────────────────────────
    if (update.message?.text?.startsWith("/confirmer")) {
      const chatId = update.message.chat.id;
      const orderId = update.message.text.split(" ")[1]?.trim();
      if (!orderId) { await sendMessage(chatId, "Usage : <code>/confirmer {order_id}</code>\nVoir les IDs avec /ordres"); return new Response("ok", { status: 200 }); }
      const result = await confirmBotOrder(supabase, orderId);
      if (!result) { await sendMessage(chatId, "❌ Commande introuvable ou déjà traitée."); return new Response("ok", { status: 200 }); }
      await deliverCode(result.buyerChatId, result.couponCode, result.platform, result.amount);
      await sendMessage(chatId, `✅ Code <code>${result.couponCode}</code> livré au client ${result.buyerChatId}.`);
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


      // ── Voir catalogue ────────────────────────────────────────────────────
      if (data === "voir_pool" || data === "catalogue") {
        const coupons = await fetchPoolCoupons(supabase);
        await answerCallback(cb.id);
        await sendMessage(chatId, formatCatalog(coupons), coupons.length > 0 ? {
          inline_keyboard: coupons.map(c => [{
            text: `${couponDisplayName(c)} — ${c.price_fcfa.toLocaleString("fr-FR")} F`,
            callback_data: `acheter_${c.id}`,
          }]),
        } : undefined);
        return new Response("ok", { status: 200 });
      }

      // ── Sélection coupon → formulaire paiement ─────────────────────────────
      if (data.startsWith("acheter_")) {
        const couponId = data.replace("acheter_", "");
        const { data: coupon } = await supabase.from("coupons")
          .select("id, code, label, price_fcfa, platform, status, analyses:analysis_id(team_home, team_away)")
          .eq("id", couponId).maybeSingle();
        await answerCallback(cb.id);
        if (!coupon || coupon.status !== "active") {
          await sendHuman(chatId, coupon ? "❌ Ce coupon n'est plus disponible. Tape /coupons pour voir les autres." : "❌ Coupon introuvable.", undefined, DELAY_SHORT);
          return new Response("ok", { status: 200 });
        }
        const cName = couponDisplayName(coupon as any);
        const plat = (coupon as any).platform?.toUpperCase() || "1xBet/1Win";
        const mobileNum = await getMobileMoneyNumber(supabase);
        const buyerName = cb.from.first_name || "Client";
        const orderId = await createBotOrder(supabase, couponId, chatId, buyerName, (coupon as any).price_fcfa);
        if (!orderId) {
          await sendHuman(chatId, "❌ Erreur technique. Réessaie dans quelques instants.", undefined, DELAY_SHORT);
          return new Response("ok", { status: 200 });
        }
        const shortRef = orderId.slice(0, 8).toUpperCase();
        const partial = partialCode((coupon as any).code);
        await sendHuman(chatId, [
          `🎟 <b>${escapeHtml(cName)} [${plat}]</b>`, ``,
          `🔒 <b>Aperçu du code (incomplet) :</b>`,
          `<code>${partial}</code>`,
          `<i>Le code complet sera révélé après confirmation du paiement.</i>`, ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `💰 <b>Montant : ${(coupon as any).price_fcfa.toLocaleString("fr-FR")} FCFA</b>`,
          `📲 <b>Paiement Mobile Money :</b>`,
          `   Numéro : <code>${mobileNum}</code>`,
          `   Montant exact : <code>${(coupon as any).price_fcfa} FCFA</code>`,
          `   Référence (important) : <code>${shortRef}</code>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, ``,
          `Après ton paiement, clique sur le bouton ci-dessous :`,
        ].join("\n"), {
          inline_keyboard: [
            [{ text: "✅ J'ai payé — Confirmer mon paiement", callback_data: `paie_${orderId}` }],
            [{ text: "❌ Annuler", callback_data: "catalogue" }],
          ],
        }, DELAY_LONG);
        return new Response("ok", { status: 200 });
      }

      // ── Client confirme avoir payé ─────────────────────────────────────────
      if (data.startsWith("paie_")) {
        const orderId = data.replace("paie_", "");
        const { data: order } = await supabase.from("bot_orders")
          .select("*, coupons(label, platform, price_fcfa, analyses:analysis_id(team_home, team_away))")
          .eq("id", orderId).maybeSingle();
        await answerCallback(cb.id, "⏳ Vérification en cours…");
        if (!order || order.status !== "pending") {
          await sendHuman(chatId, "⚠️ Cette commande a déjà été traitée.", undefined, DELAY_SHORT);
          return new Response("ok", { status: 200 });
        }
        const c = (order as any).coupons;
        const name = c ? (c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon") : "Coupon";
        await notifyAdmin(supabase, orderId, cb.from.first_name || "Client", chatId, name, (order as any).amount_fcfa);
        await sendHuman(chatId, [
          `⏳ <b>Paiement en cours de vérification</b>`, ``,
          `Notre équipe vérifie ton paiement. Tu recevras le code complet <b>dans les prochaines minutes</b>.`, ``,
          `📌 Réf : <code>${orderId.slice(0,8).toUpperCase()}</code>`,
        ].join("\n"), undefined, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }

      // ── Admin confirme paiement ────────────────────────────────────────────
      if (data.startsWith("confirm_")) {
        const orderId = data.replace("confirm_", "");
        await answerCallback(cb.id);
        const result = await confirmBotOrder(supabase, orderId);
        if (!result) {
          await editMessage(chatId, messageId, "⚠️ Commande introuvable ou déjà traitée.");
          return new Response("ok", { status: 200 });
        }
        await deliverCode(result.buyerChatId, result.couponCode, result.platform, result.amount);
        await editMessage(chatId, messageId, `✅ <b>Confirmé !</b>\nCode <code>${result.couponCode}</code> livré au client.`);
        return new Response("ok", { status: 200 });
      }

      // ── Admin refuse paiement ─────────────────────────────────────────────
      if (data.startsWith("refuse_")) {
        const orderId = data.replace("refuse_", "");
        await supabase.from("bot_orders").update({ status: "cancelled" }).eq("id", orderId);
        await answerCallback(cb.id, "❌ Refusé");
        await editMessage(chatId, messageId, `❌ <b>Paiement refusé.</b>`);
        const { data: order } = await supabase.from("bot_orders").select("buyer_chat_id").eq("id", orderId).maybeSingle();
        if (order?.buyer_chat_id) {
          await sendMessage(order.buyer_chat_id, "❌ <b>Paiement non confirmé.</b>\n\nContacte le support ou tape /coupons pour voir d'autres coupons.");
        }
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
