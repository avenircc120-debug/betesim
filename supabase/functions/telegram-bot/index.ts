/**
 * Edge Function: telegram-bot
 *
 * Webhook du Bot Telegram "Pack Officiel".
 *
 * Parcours utilisateur (cahier des charges) :
 *   /start <pack_id>  → Accueil + bouton 2FA (tg://settings/security)
 *   callback done_2fa → Étape 1win : bouton lien partenaire + "J'ai cliqué"
 *   callback done_1win → Déblocage logiciel + bouton Web App PLEIN ÉCRAN
 *
 * Données auto récupérées : telegram_user_id, username, first_name.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";
const FALLBACK_1WIN = "https://1w.run/?p=YvTH";

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

// ─── Étapes du parcours ─────────────────────────────────────────────────────
function welcomeMessage(firstName: string) {
  return [
    `🎉 <b>Bienvenue ${firstName} sur Pack Officiel !</b>`,
    ``,
    `Votre numéro Telegram est livré. Avant d'accéder au logiciel, suivons 2 étapes rapides pour sécuriser votre compte.`,
    ``,
    `<b>ÉTAPE 1 — Sécuriser votre compte (2FA obligatoire)</b>`,
    ``,
    `Cliquez sur le bouton ci-dessous, puis dans Telegram :`,
    `• Activez la <b>Double Authentification</b>`,
    `• Mettez votre <b>Gmail personnel</b> (indispensable pour ne jamais perdre votre compte)`,
    ``,
    `Une fois fait, revenez ici et cliquez sur "J'ai activé la 2FA".`,
  ].join("\n");
}

const welcomeKeyboard = {
  inline_keyboard: [
    [{ text: "🔒 Activer la 2FA (Gmail)", url: "tg://settings/security" }],
    [{ text: "✅ J'ai activé la 2FA", callback_data: "done_2fa" }],
  ],
};

function partnerMessage() {
  return [
    `<b>ÉTAPE 2 — Inscription Partenaire 1win</b>`,
    ``,
    `Inscrivez-vous via le lien partenaire 1win ci-dessous pour valider votre accès au Pack Officiel.`,
    ``,
    `⚠️ L'accès au logiciel reste bloqué tant que vous n'avez pas confirmé votre inscription.`,
  ].join("\n");
}

const partnerKeyboard = (link: string) => ({
  inline_keyboard: [
    [{ text: "🔗 S'inscrire sur 1win", url: link }],
    [{ text: "✅ Je me suis inscrit sur 1win", callback_data: "done_1win" }],
  ],
});

function unlockedMessage(softwareUrl: string | null) {
  return [
    `🚀 <b>Accès débloqué !</b>`,
    ``,
    `Félicitations, votre Pack Officiel est maintenant actif.`,
    ``,
    softwareUrl
      ? `Cliquez ci-dessous pour ouvrir le logiciel <b>en plein écran directement dans Telegram</b>.`
      : `Votre accès est validé. Le lien du logiciel vous sera communiqué dans un instant.`,
  ].join("\n");
}

/**
 * Bouton WebApp plein écran (mode immersion).
 * Telegram ouvre l'URL dans une web app intégrée — la page React appelle
 * `Telegram.WebApp.expand()` et `requestFullscreen()` pour passer en grand.
 */
const unlockedKeyboard = (softwareUrl: string | null) =>
  softwareUrl
    ? {
        inline_keyboard: [[
          { text: "📊 Ouvrir le Pack Officiel", web_app: { url: softwareUrl } },
        ]],
      }
    : undefined;

// ─── Webhook handler ────────────────────────────────────────────────────────
serve(async (req) => {
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
          `🎯 Ouvrez Pack Officiel <b>en plein écran</b> directement ici :`,
          { inline_keyboard: [[
            { text: "🎯 Ouvrir Pack Officiel", web_app: { url: `${base}/?tg=1` } },
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
              { text: "🎯 Ouvrir Pack Officiel", web_app: { url: `${base}/?tg=1` } },
            ]],
          };
        }
        return undefined;
      };

      if (!packId) {
        // Lien promo / start direct → on propose d'ouvrir l'app en plein écran
        await sendMessage(
          chatId,
          [
            `👋 <b>Bienvenue ${firstName} sur Pack Officiel !</b>`,
            ``,
            `🎯 <b>Tout se passe ici, dans Telegram, en plein écran.</b>`,
            ``,
            `Cliquez sur le bouton ci-dessous pour démarrer :`,
            `1. Choisir votre pack`,
            `2. Recevoir votre numéro Telegram sécurisé`,
            `3. Activer la 2FA + l'inscription 1win`,
            `4. Accéder aux pronostics du jour`,
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
        await sendMessage(chatId, unlockedMessage(softwareUrl), unlockedKeyboard(softwareUrl));
        return new Response("ok", { status: 200 });
      }

      // Sinon, démarrer le parcours sécurité
      await sendMessage(chatId, welcomeMessage(firstName), welcomeKeyboard);
      return new Response("ok", { status: 200 });
    }

    // ── Callback buttons ─────────────────────────────────────────────────
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const tgUserId = cb.from.id;
      const data = cb.data;

      // Retrouver le pack lié à ce Telegram user
      const { data: pack } = await supabase
        .from("partner_packs")
        .select("*")
        .eq("telegram_user_id", tgUserId)
        .order("bot_started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pack) {
        await answerCallback(cb.id, "Session expirée, faites /start à nouveau");
        return new Response("ok", { status: 200 });
      }

      if (data === "done_2fa") {
        await supabase
          .from("partner_packs")
          .update({ secured_2fa_at: new Date().toISOString() })
          .eq("id", pack.id);

        const { data: linkRow } = await supabase
          .from("app_settings").select("value").eq("key", "partner_link").maybeSingle();
        const partnerLink = (linkRow as any)?.value || FALLBACK_1WIN;

        await editMessage(chatId, messageId, partnerMessage(), partnerKeyboard(partnerLink));
        await answerCallback(cb.id, "✅ 2FA confirmée");
        return new Response("ok", { status: 200 });
      }

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
        await editMessage(chatId, messageId, unlockedMessage(softwareUrl), unlockedKeyboard(softwareUrl));
        await answerCallback(cb.id, "🚀 Accès débloqué !");
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
