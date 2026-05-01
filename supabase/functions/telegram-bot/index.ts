/**
 * Edge Function: telegram-bot
 * Version avec :
 *  - Bouton Menu configuré sur /pronostics?tg=1 (?action=set-menu-button)
 *  - Réponse aux messages libres (texte quelconque)
 *  - Parcours 3 étapes Pack Officiel
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";
const FALLBACK_1WIN = "https://1w.run/?p=YvTH";
const TYPING_DELAY_MS = 2200;
const TYPING_DELAY_LONG_MS = 2800;

// ─── Helpers Telegram ───────────────────────────────────────────────────────
async function tg(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN non configuré");
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
  tg("sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });

const editMessage = (chatId: number, messageId: number, text: string, keyboard?: unknown) =>
  tg("editMessageText", {
    chat_id: chatId, message_id: messageId, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: keyboard,
  });

const answerCallback = (callbackId: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: callbackId, text });

const sendChatAction = (chatId: number) =>
  tg("sendChatAction", { chat_id: chatId, action: "typing" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendHuman(chatId: number, text: string, keyboard?: unknown, delayMs = TYPING_DELAY_MS) {
  await sendChatAction(chatId);
  await sleep(delayMs);
  return sendMessage(chatId, text, keyboard);
}

// ─── Helpers App ─────────────────────────────────────────────────────────────
async function getAppBaseUrl(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings").select("value").eq("key", "app_base_url").maybeSingle();
  let base = ((data as any)?.value || "").trim();
  if (!base) return null;
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  return base.replace(/\/+$/, "");
}

async function buildSoftwareUrl(supabase: any, packId: string): Promise<string | null> {
  const base = await getAppBaseUrl(supabase);
  if (!base) return null;
  return `${base}/pronostics?pack_id=${packId}&tg=1`;
}

async function getPronosticsUrl(supabase: any): Promise<string | null> {
  const base = await getAppBaseUrl(supabase);
  if (!base) return null;
  return `${base}/pronostics?tg=1`;
}

async function getPartnerLink(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("app_settings").select("value").eq("key", "partner_link").maybeSingle();
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

// ─── Messages étapes ────────────────────────────────────────────────────────
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
    `📛 <b>Ton prénom :</b>`,
    `<code>${escapeHtml(firstName)}</code>`,
    ``,
    `🔖 <b>Ton @username :</b>`,
    `<code>@${escapeHtml(username)}</code>`,
    ``,
    `🌐 <b>Ton lien Telegram :</b>`,
    `<code>${tmeLink}</code>`,
    ``,
    `👇 Quand tu es prêt(e), passe à l'étape finale.`,
  ].join("\n");
}

const step2Keyboard = (hasUsername: boolean) =>
  hasUsername
    ? { inline_keyboard: [[{ text: "🚀 Continuer vers l'étape 3", callback_data: "goto_1win" }]] }
    : { inline_keyboard: [
        [{ text: "📖 Tuto vidéo (1 min)", url: "https://telegram.org/faq#q-how-do-i-get-a-username" }],
        [{ text: "🔄 J'ai créé mon username", callback_data: "recheck_username" }],
      ]};

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Handler message libre ───────────────────────────────────────────────────
async function handleFreeText(chatId: number, text: string, firstName: string, supabase: any) {
  const pronosticsUrl = await getPronosticsUrl(supabase);
  const lower = text.toLowerCase();

  // Mots-clés qui ouvrent directement les pronostics
  const openKeywords = ["pronostic", "prono", "match", "voir", "logiciel", "coupon", "pack", "ouvrir", "start"];
  const greetKeywords = ["salut", "bonjour", "hello", "hi", "allo", "allô", "bonsoir", "yo", "slt"];
  const helpKeywords  = ["aide", "help", "?", "comment", "quoi", "c'est quoi", "kes ke"];

  const isGreet   = greetKeywords.some(k => lower.includes(k));
  const isOpen    = openKeywords.some(k => lower.includes(k));
  const isHelp    = helpKeywords.some(k => lower.includes(k));

  let reply: string;
  let keyboard: unknown | undefined;

  const pronoKeyboard = pronosticsUrl
    ? { inline_keyboard: [[{ text: "📊 Voir les Pronostics", web_app: { url: pronosticsUrl } }]] }
    : undefined;

  if (isGreet && !isOpen) {
    reply = [
      `👋 <b>Salut ${escapeHtml(firstName)} !</b>`,
      ``,
      `Je suis le bot de <b>Pack Officiel</b> 🎯`,
      ``,
      `Touche le bouton ci-dessous pour voir les pronostics du jour directement ici dans Telegram.`,
    ].join("\n");
    keyboard = pronoKeyboard;
  } else if (isOpen || isHelp) {
    reply = [
      `📊 <b>Tes pronostics t'attendent, ${escapeHtml(firstName)} !</b>`,
      ``,
      `Appuie sur le bouton pour ouvrir les analyses en plein écran.`,
    ].join("\n");
    keyboard = pronoKeyboard;
  } else {
    reply = [
      `🤖 Je suis le bot <b>Pack Officiel</b>.`,
      ``,
      `Je comprends ces commandes :`,
      `• /start — Démarrer le parcours`,
      `• /app — Ouvrir les pronostics`,
      ``,
      `Ou touche le bouton ci-dessous 👇`,
    ].join("\n");
    keyboard = pronoKeyboard;
  }

  await sendChatAction(chatId);
  await sleep(1200);
  await sendMessage(chatId, reply, keyboard);
}

// ─── Webhook handler ─────────────────────────────────────────────────────────
const FUNCTION_URL = `https://mqwrhiffrtbkizyuiytt.supabase.co/functions/v1/telegram-bot`;

serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");

  // ── GET ?action=info ──────────────────────────────────────────────────────
  if (req.method === "GET" && action === "info") {
    if (!token) return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN manquant" }), { status: 500 });
    const r = await fetch(`${TG_API}/bot${token}/getWebhookInfo`);
    return new Response(await r.text(), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // ── GET ?action=register ──────────────────────────────────────────────────
  if (req.method === "GET" && action === "register") {
    if (!token) return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN manquant" }), { status: 500 });
    const r = await fetch(`${TG_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: FUNCTION_URL, allowed_updates: ["message", "callback_query"] }),
    });
    return new Response(await r.text(), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // ── GET ?action=set-menu-button → configure le bouton menu du bot ─────────
  if (req.method === "GET" && action === "set-menu-button") {
    if (!token) return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN manquant" }), { status: 500 });

    // Récupère l'URL de l'app depuis Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: appUrlRow } = await supabase
      .from("app_settings").select("value").eq("key", "app_base_url").maybeSingle();
    let base = ((appUrlRow as any)?.value || "").trim();
    if (!base) base = "https://betesim.vercel.app";
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;
    base = base.replace(/\/+$/, "");
    const pronosticsUrl = `${base}/pronostics?tg=1`;

    const r = await fetch(`${TG_API}/bot${token}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "📊 Pronostics",
          web_app: { url: pronosticsUrl },
        },
      }),
    });
    const json = await r.json();
    return new Response(JSON.stringify({ ...json, pronosticsUrl }, null, 2), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") return new Response("OK", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let update: any;
  try { update = await req.json(); }
  catch { return new Response("ok", { status: 200 }); }

  try {
    // ── /app ──────────────────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/app")) {
      const chatId = update.message.chat.id;
      const pronosticsUrl = await getPronosticsUrl(supabase);
      if (pronosticsUrl) {
        await sendMessage(chatId, `🎯 Ouvre <b>Pack Officiel</b> en plein écran :`, {
          inline_keyboard: [[{ text: "📊 Voir les Pronostics", web_app: { url: pronosticsUrl } }]],
        });
      } else {
        await sendMessage(chatId, `Application non configurée. Contactez le support.`);
      }
      return new Response("ok", { status: 200 });
    }

    // ── /start <pack_id> ──────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/start")) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const tgUser = msg.from;
      const firstName = tgUser?.first_name || "Partenaire";
      const username = tgUser?.username || null;
      const tgUserId = tgUser?.id;
      const parts = msg.text.split(" ");
      const packId = parts[1]?.trim();

      const openAppKeyboard = async () => {
        const pronosticsUrl = await getPronosticsUrl(supabase);
        return pronosticsUrl
          ? { inline_keyboard: [[{ text: "📊 Voir les Pronostics", web_app: { url: pronosticsUrl } }]] }
          : undefined;
      };

      if (!packId) {
        await sendMessage(
          chatId,
          [
            `👋 <b>Bienvenue ${escapeHtml(firstName)} sur Pack Officiel !</b>`,
            ``,
            `🎯 <b>Tout se passe ici, dans Telegram, en plein écran.</b>`,
            ``,
            `Touche le bouton ci-dessous pour démarrer.`,
          ].join("\n"),
          await openAppKeyboard(),
        );
        return new Response("ok", { status: 200 });
      }

      const { data: pack, error } = await supabase
        .from("partner_packs")
        .update({
          telegram_user_id: tgUserId,
          telegram_username: username,
          telegram_first_name: firstName,
          bot_started_at: new Date().toISOString(),
        })
        .eq("id", packId).select().maybeSingle();

      if (error || !pack) {
        await sendMessage(chatId, `❌ Pack introuvable. Contactez le support.`);
        return new Response("ok", { status: 200 });
      }

      if (pack.software_unlocked_at) {
        const softwareUrl = await buildSoftwareUrl(supabase, pack.id);
        const kbd = softwareUrl
          ? { inline_keyboard: [[{ text: "📊 Ouvrir le Pack Officiel", web_app: { url: softwareUrl } }]] }
          : undefined;
        await sendHuman(chatId, unlockedMessage(firstName, !!softwareUrl), kbd, TYPING_DELAY_MS);
        return new Response("ok", { status: 200 });
      }

      await sendMessage(chatId, welcomeMessage(firstName));
      await sendHuman(chatId, step1Message(), step1Keyboard, TYPING_DELAY_LONG_MS);
      return new Response("ok", { status: 200 });
    }

    // ── Callback buttons ──────────────────────────────────────────────────
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const tgUserId = cb.from.id;
      const tgUsernameLive = cb.from.username || null;
      const tgFirstNameLive = cb.from.first_name || "Partenaire";
      const data = cb.data;
      const pack = await getPackByTgUser(supabase, tgUserId);

      if (!pack) {
        await answerCallback(cb.id, "Session expirée, faites /start à nouveau");
        return new Response("ok", { status: 200 });
      }

      if (data === "done_2fa") {
        await supabase.from("partner_packs").update({
          secured_2fa_at: new Date().toISOString(),
          telegram_username: tgUsernameLive ?? pack.telegram_username,
          telegram_first_name: tgFirstNameLive ?? pack.telegram_first_name,
        }).eq("id", pack.id);
        await answerCallback(cb.id, "✅ 2FA confirmée");
        await editMessage(chatId, messageId, `✅ <b>2FA activée — bravo !</b>\n\nTon compte est maintenant blindé. Passons à la suite.`);
        await sendHuman(chatId, `🎯 <b>Parfait, ta 2FA est en place !</b>\n\nJe récupère automatiquement tes infos depuis ton profil Telegram…`, undefined, TYPING_DELAY_MS);
        const usernameForStep2 = tgUsernameLive ?? pack.telegram_username ?? null;
        const firstNameForStep2 = tgFirstNameLive ?? pack.telegram_first_name ?? "Partenaire";
        await sendHuman(chatId, step2Infos(firstNameForStep2, usernameForStep2), step2Keyboard(!!usernameForStep2), TYPING_DELAY_LONG_MS);
        return new Response("ok", { status: 200 });
      }

      if (data === "recheck_username") {
        const username = tgUsernameLive ?? null;
        const firstName = tgFirstNameLive ?? pack.telegram_first_name ?? "Partenaire";
        if (!username) {
          await answerCallback(cb.id, "Toujours pas d'@username détecté…");
          await sendHuman(chatId, `🤔 Je ne vois toujours pas d'@username.\n\nVérifie : <b>Réglages</b> → <b>Modifier le profil</b> → <b>Nom d'utilisateur</b>. Choisis-en un puis réessaie.`, step2Keyboard(false), TYPING_DELAY_MS);
          return new Response("ok", { status: 200 });
        }
        await supabase.from("partner_packs").update({ telegram_username: username }).eq("id", pack.id);
        await answerCallback(cb.id, "✅ Username détecté !");
        await sendHuman(chatId, step2Infos(firstName, username), step2Keyboard(true), TYPING_DELAY_MS);
        return new Response("ok", { status: 200 });
      }

      if (data === "goto_1win") {
        const username = tgUsernameLive ?? pack.telegram_username ?? null;
        if (!username) { await answerCallback(cb.id, "Crée d'abord ton @username"); return new Response("ok", { status: 200 }); }
        const partnerLink = await getPartnerLink(supabase);
        await answerCallback(cb.id);
        await sendHuman(chatId, step3Message(username, partnerLink), step3Keyboard(partnerLink), TYPING_DELAY_LONG_MS);
        return new Response("ok", { status: 200 });
      }

      if (data === "done_1win") {
        const now = new Date().toISOString();
        await supabase.from("partner_packs").update({
          partner_clicked_at: now, software_unlocked_at: now,
        }).eq("id", pack.id);
        const softwareUrl = await buildSoftwareUrl(supabase, pack.id);
        const firstName = tgFirstNameLive ?? pack.telegram_first_name ?? "Partenaire";
        await answerCallback(cb.id, "🚀 Accès débloqué !");
        await editMessage(chatId, messageId, `✅ <b>Inscription 1win enregistrée.</b>\n\nJe débloque ton accès maintenant…`);
        const kbd = softwareUrl
          ? { inline_keyboard: [[{ text: "📊 Ouvrir le Pack Officiel", web_app: { url: softwareUrl } }]] }
          : undefined;
        await sendHuman(chatId, unlockedMessage(firstName, !!softwareUrl), kbd, TYPING_DELAY_LONG_MS);
        return new Response("ok", { status: 200 });
      }

      await answerCallback(cb.id);
      return new Response("ok", { status: 200 });
    }

    // ── Messages texte libres (tout ce qui n'est pas une commande) ────────
    if (update.message?.text && !update.message.text.startsWith("/")) {
      const chatId = update.message.chat.id;
      const firstName = update.message.from?.first_name || "ami";
      const text = update.message.text || "";
      await handleFreeText(chatId, text, firstName, supabase);
      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("telegram-bot error:", err?.message ?? err);
    return new Response("ok", { status: 200 });
  }
});
