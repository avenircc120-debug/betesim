/**
 * Edge Function: telegram-bot
 *
 * Webhook du Bot Telegram "Pack Officiel" — version pilotée par l'IA Groq
 * avec rythme humain (typing 2-3 s entre chaque message).
 *
 * Parcours complet (3 étapes) :
 *
 *   /start <pack_id>
 *     ↓ accueil personnalisé
 *   ÉTAPE 1 — Sécurité 2FA (Gmail + mot de passe 8 caractères)
 *     bouton → tg://settings/2fa
 *     callback "done_2fa"
 *     ↓
 *   ÉTAPE 2 — Extraction auto (Nom / Username / lien t.me)
 *     blocs <code> copiables sur Samsung A05
 *     callback "goto_1win"
 *     ↓
 *   ÉTAPE 3 — Inscription 1win avec choix forcés
 *     • Messagerie : Telegram (obligatoire)
 *     • Expérience : Aucune expérience (obligatoire)
 *     • Site Web   : https://t.me/<username>
 *     callback "done_1win"
 *     ↓
 *   ✅ Logiciel débloqué (bouton WebApp plein écran)
 *
 * Optimisation quota :
 *   • Toutes les données utilisateur viennent de partner_packs (DB-first).
 *   • Aucun appel Groq dans le bot tant que les infos sont déjà connues.
 *   • Les messages "narratifs" sont écrits en dur ; Groq n'est appelé que pour
 *     l'analyse de pronostics (autre Edge Function : pronostic-analysis).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";
const FALLBACK_1WIN = "https://1w.run/?p=YvTH";

// Délais "humains" entre messages (ms). 2-3 s comme demandé.
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
  if (!json.ok) console.error(`tg(${method}) failed:`, json);
  return json;
}

const sendMessage = (chatId: number, text: string, keyboard?: unknown) =>
  tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });

const editMessage = (chatId: number, messageId: number, text: string, keyboard?: unknown) =>
  tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });

const answerCallback = (callbackId: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: callbackId, text });

const sendChatAction = (chatId: number, action: "typing" | "upload_photo" = "typing") =>
  tg("sendChatAction", { chat_id: chatId, action });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envoie un message avec rythme humain : active "typing…" puis attend
 * `delayMs` avant d'envoyer le message. Crée l'illusion d'un humain qui
 * réfléchit et tape — booste fortement la conversion.
 */
async function sendHuman(
  chatId: number,
  text: string,
  keyboard?: unknown,
  delayMs: number = TYPING_DELAY_MS,
) {
  await sendChatAction(chatId, "typing");
  await sleep(delayMs);
  return sendMessage(chatId, text, keyboard);
}

// ─── Étape 1 — 2FA (Gmail + mot de passe 8 caractères) ──────────────────────
function welcomeMessage(firstName: string) {
  return [
    `🎉 <b>Salut ${firstName} !</b>`,
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
    `      → SURTOUT pas un nouveau Gmail que tu vas oublier !`,
    ``,
    `📱 Sur Samsung A05 : appui sur le bouton → Telegram s'ouvre directement`,
    `sur la bonne page.`,
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

// ─── Étape 2 — Extraction auto des infos pour copier-coller ─────────────────
function step2Intro() {
  return [
    `🎯 <b>Parfait, ta 2FA est en place !</b>`,
    ``,
    `Je récupère automatiquement tes infos depuis ton profil Telegram…`,
  ].join("\n");
}

function step2Infos(firstName: string, username: string | null) {
  const tmeLink = username ? `https://t.me/${username}` : null;

  if (!username) {
    return [
      `📋 <b>ÉTAPE 2 / 3 — Tes infos perso</b>`,
      ``,
      `⚠️ <b>Tu n'as pas encore d'@username Telegram.</b>`,
      ``,
      `C'est obligatoire pour la suite. Voilà comment faire (30 secondes) :`,
      ``,
      `1. Ouvre <b>Réglages</b> Telegram (icône engrenage)`,
      `2. Touche <b>Modifier le profil</b>`,
      `3. Touche <b>Nom d'utilisateur</b>`,
      `4. Choisis un username (ex : <code>${firstName.toLowerCase().replace(/\s+/g, "")}_pro</code>)`,
      ``,
      `Une fois fait, reviens ici et tape /start <pack_id> à nouveau,`,
      `ou simplement clique sur "🔄 J'ai créé mon username".`,
    ].join("\n");
  }

  return [
    `📋 <b>ÉTAPE 2 / 3 — Tes infos pour la suite</b>`,
    ``,
    `Voilà tes 3 infos perso. Garde cet écran ouvert, tu vas en avoir besoin :`,
    ``,
    `📛 <b>Ton prénom :</b>`,
    `<code>${escapeHtml(firstName)}</code>`,
    ``,
    `🔖 <b>Ton @username :</b>`,
    `<code>@${escapeHtml(username)}</code>`,
    ``,
    `🌐 <b>Ton lien Telegram personnel :</b>`,
    `<code>${tmeLink}</code>`,
    ``,
    `📱 <b>Sur Samsung A05 :</b> appuie longuement sur un bloc gris ci-dessus`,
    `puis touche <b>"Copier"</b>. C'est instantané.`,
    ``,
    `👇 Quand tu es prêt(e), passe à l'étape finale.`,
  ].join("\n");
}

const step2Keyboard = (hasUsername: boolean) =>
  hasUsername
    ? {
        inline_keyboard: [
          [{ text: "🚀 Continuer vers l'étape 3", callback_data: "goto_1win" }],
        ],
      }
    : {
        inline_keyboard: [
          [{ text: "📖 Voir le tuto vidéo (1 min)", url: "https://telegram.org/faq#q-how-do-i-get-a-username" }],
          [{ text: "🔄 J'ai créé mon username", callback_data: "recheck_username" }],
        ],
      };

// ─── Étape 3 — 1win avec choix forcés ───────────────────────────────────────
function step3Message(username: string, partnerLink: string) {
  const tmeLink = `https://t.me/${username}`;
  return [
    `🚀 <b>ÉTAPE 3 / 3 — Inscription Partenaire 1win</b>`,
    ``,
    `Dernière ligne droite ! Le lien d'inscription :`,
    `${partnerLink}`,
    ``,
    `⚠️ <b>3 CHOIX OBLIGATOIRES</b> pendant l'inscription, sinon ton accès`,
    `ne pourra pas être validé :`,
    ``,
    `1️⃣  <b>Messagerie préférée</b>`,
    `     Dans le menu déroulant, choisis 👉 <b>Telegram</b>`,
    ``,
    `2️⃣  <b>Niveau d'expérience</b>`,
    `     Coche 👉 <b>Aucune expérience</b>`,
    ``,
    `3️⃣  <b>Site Web</b> (champ optionnel mais important)`,
    `     Colle ton lien Telegram personnel :`,
    `     <code>${tmeLink}</code>`,
    ``,
    `📱 <b>Astuce Samsung A05 :</b> garde ce chat ouvert, fais glisser entre`,
    `1win et Telegram pour copier-coller.`,
    ``,
    `Une fois inscrit, reviens et clique sur "✅ Je me suis inscrit".`,
  ].join("\n");
}

const step3Keyboard = (link: string) => ({
  inline_keyboard: [
    [{ text: "🔗 Ouvrir 1win maintenant", url: link }],
    [{ text: "✅ Je me suis inscrit sur 1win", callback_data: "done_1win" }],
  ],
});

// ─── Final — accès débloqué ─────────────────────────────────────────────────
function unlockedMessage(firstName: string, softwareUrl: string | null) {
  return [
    `🎊 <b>BRAVO ${firstName.toUpperCase()} !</b>`,
    ``,
    `Ton compte est <b>100 % sécurisé et activé</b>. Tu fais maintenant`,
    `partie du Pack Officiel.`,
    ``,
    softwareUrl
      ? `Touche le bouton ci-dessous pour ouvrir le logiciel <b>en plein écran directement dans Telegram</b>. Tes pronostics du jour t'attendent.`
      : `Le lien du logiciel arrive dans un instant. Reste connecté(e).`,
  ].join("\n");
}

const unlockedKeyboard = (softwareUrl: string | null) =>
  softwareUrl
    ? {
        inline_keyboard: [[
          { text: "📊 Ouvrir le Pack Officiel", web_app: { url: softwareUrl } },
        ]],
      }
    : undefined;

// ─── Utils ──────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Webhook handler ────────────────────────────────────────────────────────
const FUNCTION_URL = `https://mqwrhiffrtbkizyuiytt.supabase.co/functions/v1/telegram-bot`;

serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── GET ?action=info  → état du webhook Telegram ─────────────────────────
  if (req.method === "GET" && action === "info") {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN manquant" }), { status: 500 });
    const r = await fetch(`${TG_API}/bot${token}/getWebhookInfo`);
    const json = await r.json();
    return new Response(JSON.stringify(json, null, 2), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // ── GET ?action=register → enregistre le webhook Telegram ────────────────
  if (req.method === "GET" && action === "register") {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN manquant" }), { status: 500 });
    const r = await fetch(`${TG_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: FUNCTION_URL, allowed_updates: ["message", "callback_query"] }),
    });
    const json = await r.json();
    return new Response(JSON.stringify(json, null, 2), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  // Helper pour construire l'URL de la WebApp avec le pack_id
  async function buildSoftwareUrl(packId: string): Promise<string | null> {
    const { data: appUrlRow } = await supabase
      .from("app_settings").select("value").eq("key", "app_base_url").maybeSingle();
    let base = ((appUrlRow as any)?.value || "").trim();
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;
    base = base.replace(/\/+$/, "");
    return `${base}/pronostics?pack_id=${packId}&tg=1`;
  }

  async function getPartnerLink(): Promise<string> {
    const { data: linkRow } = await supabase
      .from("app_settings").select("value").eq("key", "partner_link").maybeSingle();
    return (linkRow as any)?.value || FALLBACK_1WIN;
  }

  // Récupère les infos Telegram fraîches (DB-first ; on n'appelle Groq pour rien)
  async function getPackByTgUser(tgUserId: number) {
    const { data } = await supabase
      .from("partner_packs")
      .select("*")
      .eq("telegram_user_id", tgUserId)
      .order("bot_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  try {
    // ── /app : ouvre la Mini App plein écran ─────────────────────────────
    if (update.message?.text?.startsWith("/app")) {
      const chatId = update.message.chat.id;
      const { data: appUrlRow } = await supabase
        .from("app_settings").select("value").eq("key", "app_base_url").maybeSingle();
      let base = ((appUrlRow as any)?.value || "").trim();
      if (base) {
        if (!/^https?:\/\//i.test(base)) base = "https://" + base;
        base = base.replace(/\/+$/, "");
        await sendMessage(
          chatId,
          `🎯 Ouvre Pack Officiel <b>en plein écran</b> directement ici :`,
          { inline_keyboard: [[
            { text: "📊 Voir les Pronostics", web_app: { url: `${base}/pronostics?tg=1` } },
          ]] },
        );
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

      // Helper : ouvre la Mini App en plein écran depuis le bot
      const openAppBaseKeyboard = async () => {
        const { data: appUrlRow } = await supabase
          .from("app_settings").select("value").eq("key", "app_base_url").maybeSingle();
        let base = ((appUrlRow as any)?.value || "").trim();
        if (base) {
          if (!/^https?:\/\//i.test(base)) base = "https://" + base;
          base = base.replace(/\/+$/, "");
          return {
            inline_keyboard: [[
              { text: "📊 Voir les Pronostics", web_app: { url: `${base}/pronostics?tg=1` } },
            ]],
          };
        }
        return undefined;
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
          await openAppBaseKeyboard(),
        );
        return new Response("ok", { status: 200 });
      }

      // Lier le pack à l'utilisateur Telegram (récupération auto ID + username)
      const { data: pack, error } = await supabase
        .from("partner_packs")
        .update({
          telegram_user_id: tgUserId,
          telegram_username: username,
          telegram_first_name: firstName,
          bot_started_at: new Date().toISOString(),
        })
        .eq("id", packId)
        .select()
        .maybeSingle();

      if (error || !pack) {
        await sendMessage(
          chatId,
          `❌ Pack introuvable. Contactez le support si vous avez bien payé votre Pack Officiel.`,
        );
        return new Response("ok", { status: 200 });
      }

      // Si déjà débloqué, renvoyer directement vers le logiciel
      if (pack.software_unlocked_at) {
        const softwareUrl = await buildSoftwareUrl(pack.id);
        await sendHuman(chatId, unlockedMessage(firstName, softwareUrl), unlockedKeyboard(softwareUrl), TYPING_DELAY_MS);
        return new Response("ok", { status: 200 });
      }

      // Parcours rythmé : accueil → typing → étape 1
      await sendMessage(chatId, welcomeMessage(escapeHtml(firstName)));
      await sendHuman(chatId, step1Message(), step1Keyboard, TYPING_DELAY_LONG_MS);
      return new Response("ok", { status: 200 });
    }

    // ── Callback buttons ─────────────────────────────────────────────────
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const tgUserId = cb.from.id;
      const tgUsernameLive = cb.from.username || null;
      const tgFirstNameLive = cb.from.first_name || "Partenaire";
      const data = cb.data;

      const pack = await getPackByTgUser(tgUserId);

      if (!pack) {
        await answerCallback(cb.id, "Session expirée, faites /start à nouveau");
        return new Response("ok", { status: 200 });
      }

      // ── Callback : 2FA confirmée → ÉTAPE 2 (extraction auto) ────────
      if (data === "done_2fa") {
        await supabase
          .from("partner_packs")
          .update({
            secured_2fa_at: new Date().toISOString(),
            // Refresh username/firstName au cas où l'utilisateur les ait changés
            telegram_username: tgUsernameLive ?? pack.telegram_username,
            telegram_first_name: tgFirstNameLive ?? pack.telegram_first_name,
          })
          .eq("id", pack.id);

        await answerCallback(cb.id, "✅ 2FA confirmée");

        // Bulle de transition (édit) + 2 nouveaux messages au rythme humain
        await editMessage(chatId, messageId, [
          `✅ <b>2FA activée — bravo !</b>`,
          ``,
          `Ton compte est maintenant blindé. Passons à la suite.`,
        ].join("\n"));

        await sendHuman(chatId, step2Intro(), undefined, TYPING_DELAY_MS);

        const usernameForStep2 = tgUsernameLive ?? pack.telegram_username ?? null;
        const firstNameForStep2 = tgFirstNameLive ?? pack.telegram_first_name ?? "Partenaire";

        await sendHuman(
          chatId,
          step2Infos(firstNameForStep2, usernameForStep2),
          step2Keyboard(!!usernameForStep2),
          TYPING_DELAY_LONG_MS,
        );
        return new Response("ok", { status: 200 });
      }

      // ── Callback : recheck username (utilisateur a créé son @username) ──
      if (data === "recheck_username") {
        const username = tgUsernameLive ?? null;
        const firstName = tgFirstNameLive ?? pack.telegram_first_name ?? "Partenaire";

        if (!username) {
          await answerCallback(cb.id, "Toujours pas d'@username détecté…");
          await sendHuman(
            chatId,
            [
              `🤔 Je ne vois toujours pas d'@username sur ton compte.`,
              ``,
              `Vérifie : <b>Réglages Telegram</b> → <b>Modifier le profil</b> →`,
              `<b>Nom d'utilisateur</b>. Choisis-en un puis réessaie.`,
            ].join("\n"),
            step2Keyboard(false),
            TYPING_DELAY_MS,
          );
          return new Response("ok", { status: 200 });
        }

        await supabase
          .from("partner_packs")
          .update({ telegram_username: username })
          .eq("id", pack.id);

        await answerCallback(cb.id, "✅ Username détecté !");
        await sendHuman(chatId, step2Infos(firstName, username), step2Keyboard(true), TYPING_DELAY_MS);
        return new Response("ok", { status: 200 });
      }

      // ── Callback : passage à l'étape 1win ────────────────────────────
      if (data === "goto_1win") {
        const username = tgUsernameLive ?? pack.telegram_username ?? null;

        if (!username) {
          await answerCallback(cb.id, "Crée d'abord ton @username");
          return new Response("ok", { status: 200 });
        }

        const partnerLink = await getPartnerLink();
        await answerCallback(cb.id);
        await sendHuman(chatId, step3Message(username, partnerLink), step3Keyboard(partnerLink), TYPING_DELAY_LONG_MS);
        return new Response("ok", { status: 200 });
      }

      // ── Callback : 1win confirmée → DÉBLOCAGE ────────────────────────
      if (data === "done_1win") {
        const now = new Date().toISOString();
        await supabase
          .from("partner_packs")
          .update({
            partner_clicked_at: now,
            software_unlocked_at: now,
          })
          .eq("id", pack.id);

        const softwareUrl = await buildSoftwareUrl(pack.id);
        const firstName = tgFirstNameLive ?? pack.telegram_first_name ?? "Partenaire";

        await answerCallback(cb.id, "🚀 Accès débloqué !");
        await editMessage(chatId, messageId, [
          `✅ <b>Inscription 1win enregistrée.</b>`,
          ``,
          `Je débloque ton accès maintenant…`,
        ].join("\n"));
        await sendHuman(chatId, unlockedMessage(firstName, softwareUrl), unlockedKeyboard(softwareUrl), TYPING_DELAY_LONG_MS);
        return new Response("ok", { status: 200 });
      }

      await answerCallback(cb.id);
      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("telegram-bot error:", err?.message ?? err);
    return new Response("ok", { status: 200 });
  }
});
