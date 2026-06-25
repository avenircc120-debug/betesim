/**
 * Edge Function: telegram-bot v3
 * Intelligence Totale : accès Supabase pour répondre aux questions personnelles
 * - Statut 2FA
 * - Statut compte 1win
 * - Solde / Ventes / Commissions
 * - Menu Button → /pronostics?tg=1
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";
const FALLBACK_1WIN = "https://1w.run/?p=YvTH";
const FUNCTION_URL = `https://mqwrhiffrtbkizyuiytt.supabase.co/functions/v1/telegram-bot`;
const DELAY_SHORT = 0;
const DELAY_LONG  = 0;

// ─── Helpers Telegram ────────────────────────────────────────────────────────
async function tg(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN manquant");
  try {
    const res = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const json = await res.json();
    if (!json.ok) console.error(`tg(${method}) failed:`, JSON.stringify(json));
    return json;
  } catch (e: any) {
    console.error(`tg(${method}) timeout/error:`, e?.message);
    return { ok: false };
  }
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
  // Réponse instantanée — typing indicator et sleep supprimés
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

  // ── Statut 2FA ────────────────────��────────────────────────────────────────
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
      ? { inline_keyboard: [[{ text: "📊 Ouvrir mes Analyses", web_app: { url: proUrl } }]] }
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
    if (!coupons.length) return false; // laisser Groq répondre naturellement
    const keyboard = {
      inline_keyboard: [
        ...coupons.slice(0,5).map(c => [{
          text: `${c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon"} — ${c.price_fcfa.toLocaleString("fr-FR")} F`,
          callback_data: `acheter_${c.id}`,
        }]),
        ...(coupons.length > 5 ? [[{ text:`+ ${coupons.length - 5} autres → /coupons`, callback_data:"voir_pool" }]] : []),
      ],
    };
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


  // ─── Wizard state: revendeur en train d'entrer un code booking ─────────────
  try {
    const session = await getBotState(supabase, chatId);
    // ─── État : recherche compétition → scraping TheSportsDB à la demande ───────
    if (session?.state === "awaiting_search") {
      const query = text.trim().toLowerCase();
      await clearBotState(supabase, chatId);
      if (query.length < 2) {
        await sendMessage(chatId, "⚠️ Tape au moins 2 caractères pour chercher.");
        return new Response("ok", { status: 200 });
      }
      const matched = ALL_COMPS.filter((c: any) =>
        c.name.toLowerCase().includes(query) || query.includes(c.name.toLowerCase().slice(0, 4))
      );
      if (matched.length === 1) {
        await sendMatchesList(chatId, matched[0].id, supabase);
      } else if (matched.length > 1) {
        const buttons = [
          ...matched.slice(0, 6).map((c: any) => [{ text: `${c.flag} ${c.name}`, callback_data: `comp:${c.id}` }]),
          [{ text: "🔍 Nouvelle recherche", callback_data: "search_match" }],
        ];
        await sendMessage(chatId, `🔍 <b>Compétitions trouvées pour "${escapeHtml(text.trim())}"</b>`, { inline_keyboard: buttons });
      } else {
        // Fallback : recherche dynamique sur TheSportsDB (Edge Function n'est pas rate-limitée)
        await sendAction(chatId);
        const onlineResults = await searchLeaguesOnline(text.trim());
        if (onlineResults.length > 0) {
          const buttons = [
            ...onlineResults.map(l => [{
              text: `🏆 ${l.name}${l.country ? ` (${l.country})` : ""}`,
              callback_data: `comp:${l.id}`,
            }]),
            [{ text: "🔍 Nouvelle recherche", callback_data: "search_match" }],
          ];
          await sendMessage(chatId, `🔍 <b>Résultats pour "${escapeHtml(text.trim())}"</b>\n\nSélectionne la compétition :`, { inline_keyboard: buttons });
        } else {
          await sendMessage(chatId, [
            `🔍 Aucune compétition trouvée pour "<b>${escapeHtml(text.trim())}</b>".`, ``,
            `💡 Essaie : Botola Pro · CHAN · MTN Ligue 1 · Nigeria Premier · Ghana Premier · PSL · Premier League · CAN`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "🔍 Nouvelle recherche",       callback_data: "search_match"     }],
              [{ text: "🏠 Voir compétitions actives", callback_data: "pronostics_menu" }],
            ],
          });
        }
      }
      return new Response("ok", { status: 200 });
    }

    if (session?.state === "awaiting_coupon_partage") {
      const { analysis_id, match_label, league } = session.data as any;
      const code = text.trim().replace(/\s+/g, "").toUpperCase();
      if (code.length < 4 || code.length > 50) {
        await sendMessage(chatId, "⚠️ Code invalide (4-50 caractères). Réessaie :\n\nExemple : <code>ABC123456</code>");
        return new Response("ok", { status: 200 });
      }
      await supabase.from("coupons_partages").insert({
        analysis_id, user_id: tgUserId,
        username: null, first_name: firstName,
        code_coupon: code, match_label, league,
      });
      await clearBotState(supabase, chatId);
      const { count } = await supabase
        .from("coupons_partages")
        .select("id", { count: "exact", head: true })
        .eq("analysis_id", analysis_id);
      const total = (count as number) || 1;
      await sendMessage(chatId, [
        `✅ <b>Coupon publié avec succès ! 🔥</b>`,``,
        `🎟 Code <code>${escapeHtml(code)}</code> ajouté à la liste communautaire.`,
        `👥 ${total} revendeur${total > 1 ? "s" : ""} ont partagé un coupon pour ce match.`,
        ``,
        `Merci pour ta contribution !`,
      ].join("\n"), {
        inline_keyboard: [
          [{ text: "🏆 Voir d'autres analyses", callback_data: "pronostics_menu" }],
          [{ text: `👀 Voir les coupons de ce match`, callback_data: `see_coupons:${analysis_id}` }],
        ],
      });
      return new Response("ok", { status: 200 });
    }

    if (session?.state === "awaiting_booking_code") {
      const { analysis_id, platform, reseller_id } = session.data as any;
      const code = lower.trim().toUpperCase().replace(/\s+/g, "");
      if (code.length < 4 || code.length > 30) {
        await sendHuman(chatId, "⚠️ Code trop court ou invalide. Entre le code exact (4-30 caractères) :", undefined, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }
      const { data: analysis } = await supabase.from("analyses")
        .select("id, team_home, team_away, confidence_pct").eq("id", analysis_id).maybeSingle();
      const conf = (analysis as any)?.confidence_pct || 75;
      const price = conf >= 90 ? 3000 : conf >= 80 ? 2000 : 1500;
      const { data: newCoupon, error } = await supabase.from("coupons").insert({
        code, label: analysis ? `${(analysis as any).team_home} vs ${(analysis as any).team_away}` : "Coupon",
        price_fcfa: price, platform, status: "active", partner_id: reseller_id, creator_id: reseller_id, analysis_id,
      }).select("id").single();
      await clearBotState(supabase, chatId);
      if (error || !newCoupon) {
        await sendHuman(chatId, `❌ Erreur création. Réessaie ou publie depuis le site.\n<code>${error?.message || "unknown"}</code>`, undefined, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }
      await sendHuman(chatId, [
        `🎉 <b>Coupon publié dans le Pool Commun !</b>`, ``,
        `🎟 Code : <code>${code}</code>`,
        `💰 Prix : <b>${price.toLocaleString("fr-FR")} FCFA</b>`,
        `📲 Plateforme : <b>${platform.toUpperCase()}</b>`, ``,
        "Ton coupon est maintenant visible dans le catalogue.",
      ].join("\n"), {
        inline_keyboard: [
          [{ text: "➕ Ajouter un coupon",       callback_data: "pronostics_menu" }],
          [{ text: "📊 Dashboard", callback_data: "dashboard_home" }],
        ],
      }, DELAY_SHORT);
      return new Response("ok", { status: 200 });
    }
  } catch (_wizErr) { /* ignore wizard errors, fall through to normal handling */ }

  // ─── Wizard publication coupon (pub_*) ────────────────────────────────────
  try {
    const pubSess = await getBotState(supabase, chatId);

    if (pubSess?.state === "pub_step_code") {
      const rawCode = text.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "");
      if (rawCode.length < 4 || rawCode.length > 40) {
        await sendHuman(chatId, "⚠️ Code invalide (4-40 caractères). Entre le code exact :\n<i>Exemple : ABC123456</i>", undefined, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }
      await setBotState(supabase, chatId, "pub_step_cote", { code: rawCode });
      await sendHuman(chatId, [
        `✅ Code : <code>${rawCode}</code>`, ``,
        `<b>Étape 2/4 — Cote</b>`, ``,
        `Entre la cote totale du coupon :`,
        `<i>Exemple : 4.50 ou 12.5</i>`, ``,
        `💡 Gains selon la cote :`,
        `• 1.00 – 5.50 → 250 FCFA`,
        `• 5.51 – 16.00 → 500 FCFA`,
        `• > 16.00 → 1000 FCFA`,
      ].join("\n"), {
        inline_keyboard: [[{ text: "❌ Annuler", callback_data: "dashboard_home" }]],
      }, DELAY_SHORT);
      return new Response("ok", { status: 200 });
    }

    if (pubSess?.state === "pub_step_cote") {
      const { code } = pubSess.data as { code: string };
      const odds = parseFloat(text.replace(",", "."));
      if (isNaN(odds) || odds < 1.1 || odds > 10000) {
        await sendHuman(chatId, "⚠️ Cote invalide. Entre un nombre comme <b>4.50</b> ou <b>12.5</b> :", undefined, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }
      const gain = odds <= 5.50 ? 250 : odds <= 16 ? 500 : 1000;
      await setBotState(supabase, chatId, "pub_step_expiry", { code, odds, gain });
      await sendHuman(chatId, [
        `✅ Cote : <b>${odds}</b> → Gain par vente : <b>${gain.toLocaleString("fr-FR")} FCFA</b>`, ``,
        `<b>Étape 3/4 — Temps d'expiration</b>`, ``,
        `À quelle heure commencent les matchs ?`,
        `Format : HH:MM (ex: <b>18:30</b> ou <b>20:00</b>)`,
        `<i>Le coupon sera automatiquement supprimé à cette heure.</i>`,
      ].join("\n"), {
        inline_keyboard: [[{ text: "❌ Annuler", callback_data: "dashboard_home" }]],
      }, DELAY_SHORT);
      return new Response("ok", { status: 200 });
    }

    if (pubSess?.state === "pub_step_expiry") {
      const { code, odds, gain } = pubSess.data as { code: string; odds: number; gain: number };
      const timeMatch = text.trim().match(/^(\d{1,2})[h:](\d{2})$/i);
      if (!timeMatch) {
        await sendHuman(chatId, "⚠️ Format invalide. Entre l'heure comme <b>18:30</b> ou <b>20h00</b> :", undefined, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }
      const hh = parseInt(timeMatch[1]);
      const mm = parseInt(timeMatch[2]);
      if (hh > 23 || mm > 59) {
        await sendHuman(chatId, "⚠️ Heure invalide. Exemple valide : <b>18:30</b>", undefined, DELAY_SHORT);
        return new Response("ok", { status: 200 });
      }
      const now = new Date();
      const matchStart = new Date(now);
      matchStart.setHours(hh, mm, 0, 0);
      if (matchStart <= now) matchStart.setDate(matchStart.getDate() + 1);
      const expiryStr = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
      await setBotState(supabase, chatId, "pub_confirm", { codes: [code], odds, price: gain, match_start: matchStart.toISOString() });
      await sendHuman(chatId, [
        `📋 <b>Étape 4/4 — Validation</b>`, ``,
        `Vérifie avant publication :`, ``,
        `🎫 Code : <code>${code}</code>`,
        `📊 Cote : <b>${odds}</b>`,
        `⏰ Expiration : <b>${expiryStr}</b>`,
        `💰 Ton gain par vente : <b>${gain.toLocaleString("fr-FR")} FCFA</b>`, ``,
        `👆 Confirme pour publier dans le Pool :`,
      ].join("\n"), {
        inline_keyboard: [
          [{ text: "✅ Publier le coupon", callback_data: "pub_confirm" }],
          [{ text: "❌ Annuler", callback_data: "dashboard_home" }],
        ],
      }, DELAY_SHORT);
      return new Response("ok", { status: 200 });
    }

    // Legacy states → redirect to new 4-step form
    if (pubSess?.state === "pub_codes" || pubSess?.state === "pub_odds" || pubSess?.state === "pub_time") {
      await clearBotState(supabase, chatId);
      await setBotState(supabase, chatId, "pub_step_code", {});
      await sendHuman(chatId, [
        `🎫 <b>Publier un coupon</b>`, ``,
        `<b>Étape 1/4 — Code</b>`, ``,
        `Entre ton code coupon (1xBet / 1Win) :`,
        `<i>Exemple : ABC123456</i>`,
      ].join("\n"), {
        inline_keyboard: [[{ text: "❌ Annuler", callback_data: "dashboard_home" }]],
      }, DELAY_SHORT);
      return new Response("ok", { status: 200 });
    }
  } catch (_pubErr) { /* ignore, fall through */ }

  // Tout message libre → Groq IA — comportement identique texte et vocal
  await sendAction(chatId); // typing... immédiat
  const freeReseller = await getResellerProfile(supabase, chatId);
  const freeRole: "client" | "revendeur" | "unknown" = freeReseller?.is_partner ? "revendeur" : (freeReseller ? "client" : "unknown");
  const groqReply = await askGroq(text, firstName, freeRole);
  await sendMessage(chatId, groqReply || "Je n'ai pas bien compris, peux-tu reformuler ? Tu peux aussi utiliser les boutons ci-dessous. 😊");
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


// ─── Reseller helpers ────────────────────────────────────────────────────────

async function getResellerProfile(supabase: any, chatId: number) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, is_partner, is_admin, email")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data as { id: string; full_name: string | null; is_partner: boolean; is_admin: boolean; email: string | null } | null;
}

async function getPronostiqueurProfile(supabase: any, chatId: number) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, is_partner, is_admin, email")
    .eq("telegram_chat_id", chatId)
    .eq("is_admin", true)
    .maybeSingle();
  return data as { id: string; full_name: string | null; is_partner: boolean; is_admin: boolean; email: string | null } | null;
}

async function getPronostiqueurWallet(supabase: any, proId: string): Promise<{ total: number; count: number }> {
  const { data } = await supabase
    .from("commission_records")
    .select("net_amount")
    .eq("partner_id", proId)
    .eq("type", "pronostiqueur_share");
  const total = (data ?? []).reduce((s: number, r: any) => s + (r.net_amount || 0), 0);
  return { total, count: (data ?? []).length };
}

async function getPronostiqueurStats(supabase: any, proId: string) {
  // Analyses de ce pronostiqueur
  const { data: analyses } = await supabase
    .from("analyses")
    .select("id, team_home, team_away, league, result, match_date, published")
    .eq("pronostiqueur_id", proId)
    .order("created_at", { ascending: false })
    .limit(20);

  const allA = analyses ?? [];
  const published = allA.filter((a: any) => a.published).length;
  const won       = allA.filter((a: any) => a.result === "gagné").length;
  const lost      = allA.filter((a: any) => a.result === "perdu").length;
  const pending   = allA.filter((a: any) => a.result === "en_attente").length;

  // Coupons créés à partir de ses analyses
  const analysisIds = allA.map((a: any) => a.id);
  let resellers: any[] = [];
  let soldCoupons: any[] = [];
  if (analysisIds.length > 0) {
    const { data: coupons } = await supabase
      .from("coupons")
      .select("id, status, price_fcfa, creator_id, buyer_id, sold_at, analysis_id, creator:creator_id(full_name), buyer:buyer_id(full_name)")
      .in("analysis_id", analysisIds);
    const allC = coupons ?? [];
    soldCoupons = allC.filter((c: any) => c.status === "sold");
    // Revendeurs uniques
    const resellerMap = new Map<string, string>();
    allC.forEach((c: any) => { if (c.creator_id) resellerMap.set(c.creator_id, (c.creator as any)?.full_name || c.creator_id.slice(0, 8)); });
    resellers = Array.from(resellerMap.entries()).map(([id, name]) => ({ id, name }));
  }

  return { allA, published, won, lost, pending, resellers, soldCoupons };
}

// ── Cache mémoire sessions (réduit les écritures DB) ─────────────────────────
// Warm-start Deno : le Map persiste entre invocations sur la même instance
const _sessionCache = new Map<number, { state: string; data: Record<string, unknown> } | null>();

async function setBotState(supabase: any, chatId: number, state: string, data: Record<string, unknown>) {
  const cached = _sessionCache.get(chatId);
  // N'écrire en DB que si l'état change réellement
  if (!cached || cached.state !== state || JSON.stringify(cached.data) !== JSON.stringify(data)) {
    await supabase.from("bot_sessions").upsert({ telegram_chat_id: chatId, state, data, updated_at: new Date().toISOString() });
    _sessionCache.set(chatId, { state, data });
  }
}

async function getBotState(supabase: any, chatId: number): Promise<{ state: string; data: Record<string, unknown> } | null> {
  if (_sessionCache.has(chatId)) return _sessionCache.get(chatId) ?? null;
  const { data } = await supabase.from("bot_sessions").select("state, data").eq("telegram_chat_id", chatId).maybeSingle();
  const result = data as { state: string; data: Record<string, unknown> } | null;
  _sessionCache.set(chatId, result);
  return result;
}

async function clearBotState(supabase: any, chatId: number) {
  _sessionCache.delete(chatId);
  await supabase.from("bot_sessions").delete().eq("telegram_chat_id", chatId);
}

// ── Helpers marketplace ───────────────────────────────────────────────────────
function calcPrice(odds: number): number {
  if (odds < 5.50) return 250;
  if (odds < 16.00) return 500;
  return 1000;
}

function maskCodes(codesRaw: string | string[]): string {
  const list = Array.isArray(codesRaw) ? codesRaw : [codesRaw];
  return list.map(c => {
    if (!c || c.length <= 4) return (c || "????") + "★★★★★";
    return c.slice(0, 4) + "★".repeat(Math.max(5, c.length - 4));
  }).join("  |  ");
}

async function createFedaPayLink(
  amount: number, description: string, couponId: string, buyerChatId: number, supabase: any,
): Promise<string | null> {
  const mode    = Deno.env.get("FEDAPAY_MODE") || "sandbox";
  const apiKey  = mode === "live" ? Deno.env.get("FEDAPAY_SECRET_KEY") : Deno.env.get("FEDAPAY_SECRET_KEY_SANDBOX");
  const apiBase = mode === "live" ? "https://api.fedapay.com" : "https://sandbox-api.fedapay.com";
  const payBase = mode === "live" ? "https://pay.fedapay.com" : "https://sandbox-pay.fedapay.com";
  try {
    const txRes = await fetch(apiBase + "/v1/transactions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        description, amount, currency: { iso: "XOF" },
        callback_url: FUNCTION_URL + "?source=fedapay",
        custom_metadata: { coupon_id: couponId, buyer_chat_id: String(buyerChatId) },
      }),
    });
    const txData = await txRes.json();
    const txId = txData?.v1?.transaction?.id || txData?.id;
    if (!txId) { console.error("FedaPay no txId", JSON.stringify(txData).slice(0,200)); return null; }
    const tokRes = await fetch(apiBase + "/v1/transactions/" + txId + "/token", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey },
    });
    const tokData = await tokRes.json();
    const token = tokData?.v1?.token?.token || tokData?.token;
    if (!token) { console.error("FedaPay no token", JSON.stringify(tokData).slice(0,200)); return null; }
    await supabase.from("bot_orders").insert({
      coupon_id: couponId, buyer_chat_id: buyerChatId, buyer_name: "FedaPay",
      amount_fcfa: amount, status: "pending", fedapay_id: String(txId),
    });
    return payBase + "/" + token;
  } catch (e: any) { console.error("FedaPay error:", e?.message); return null; }
}

async function getPendingAnalyses(supabase: any, resellerId?: string, searchTerm?: string) {
  let query = supabase
    .from("analyses")
    .select("id, team_home, team_away, league, country, match_date, result, confidence_pct, platform_suggestion")
    .eq("published", true)
    .order("match_date", { ascending: true })
    .limit(50);

  if (searchTerm) {
    const t = searchTerm.toLowerCase();
    query = query.or(`team_home.ilike.%${t}%,team_away.ilike.%${t}%,league.ilike.%${t}%,country.ilike.%${t}%`);
  }

  const { data } = await query;
  if (!data?.length) return [];
  if (!resellerId) return data;
  const { data: existing } = await supabase
    .from("coupons")
    .select("analysis_id")
    .eq("creator_id", resellerId)
    .in("analysis_id", data.map((a: any) => a.id));
  const doneIds = new Set((existing ?? []).map((c: any) => c.analysis_id));
  return (data as any[]).filter((a: any) => !doneIds.has(a.id));
}

function competitionEmoji(league: string, country: string): string {
  const l = (league || "").toLowerCase();
  const c = (country || "").toLowerCase();
  if (l.includes("monde") || l.includes("world cup") || l.includes("fifa")) return "🌍";
  if (l.includes("can") || l.includes("afrique") || l.includes("africa")) return "🌍";
  if (l.includes("copa america")) return "🌎";
  if (l.includes("euro") || l.includes("nations league")) return "🇪🇺";
  if (l.includes("gold cup") || l.includes("concacaf")) return "🌎";
  if (l.includes("asian cup") || l.includes("afc")) return "🌏";
  if (l.includes("champions league") || l.includes("ligue des champions")) return "🏆";
  if (l.includes("europa league")) return "🥇";
  if (l.includes("conférence") || l.includes("conference")) return "🥈";
  if (l.includes("caf")) return "🏆";
  if (c.includes("france") || l.includes("ligue 1") || l.includes("coupe de france")) return "🇫🇷";
  if (c.includes("angleterre") || c.includes("england") || l.includes("premier league") || l.includes("fa cup") || l.includes("carabao")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (c.includes("espagne") || c.includes("spain") || l.includes("la liga") || l.includes("copa del rey")) return "🇪🇸";
  if (c.includes("italie") || c.includes("italy") || l.includes("serie a") || l.includes("coppa")) return "🇮🇹";
  if (c.includes("allemagne") || c.includes("germany") || l.includes("bundesliga") || l.includes("dfb")) return "🇩🇪";
  if (c.includes("portugal") || l.includes("liga nos")) return "🇵🇹";
  if (c.includes("pays-bas") || c.includes("netherlands") || l.includes("eredivisie")) return "🇳🇱";
  if (c.includes("belgique") || c.includes("belgium") || l.includes("pro league")) return "🇧🇪";
  if (c.includes("turquie") || c.includes("turkey") || l.includes("süper lig")) return "🇹🇷";
  if (c.includes("brésil") || c.includes("brazil") || l.includes("brasileir")) return "🇧🇷";
  if (c.includes("mexique") || c.includes("mexico") || l.includes("liga mx")) return "🇲🇽";
  if (c.includes("états-unis") || c.includes("usa") || l.includes("mls")) return "🇺🇸";
  if (c.includes("arabie") || l.includes("saudi")) return "🇸🇦";
  if (c.includes("égypte") || c.includes("egypt") || l.includes("egyptian")) return "🇪🇬";
  if (c.includes("sénégal") || c.includes("senegal")) return "🇸🇳";
  if (c.includes("algérie") || c.includes("algeria")) return "🇩🇿";
  if (c.includes("maroc") || c.includes("morocco")) return "🇲🇦";
  if (c.includes("afrique") || c.includes("africa")) return "🌍";
  return "⚽";
}

function groupAnalysesByCompetition(analyses: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const a of analyses) {
    const key = a.league || a.country || "Autre";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  return groups;
}

function formatAnalysesGrouped(analyses: any[], total: number): string {
  const groups = groupAnalysesByCompetition(analyses);
  const lines: string[] = [`📋 <b>Analyses disponibles (${total})</b>`, ``];
  for (const [league, items] of groups) {
    const emoji = competitionEmoji(league, items[0]?.country || "");
    lines.push(`${emoji} <b>${escapeHtml(league)}</b>`);
    for (const a of items.slice(0, 4)) {
      const date = a.match_date ? new Date(a.match_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—";
      const conf = a.confidence_pct ? ` · ${a.confidence_pct}%` : "";
      lines.push(`  • ${escapeHtml(a.team_home)} vs ${escapeHtml(a.team_away)} — <i>${date}${conf}</i>`);
    }
    if (items.length > 4) lines.push(`  <i>+ ${items.length - 4} autres…</i>`);
    lines.push(``);
  }
  return lines.join("\n");
}

async function getWalletBalance(supabase: any, partnerId: string): Promise<{ total: number; count: number }> {
  const { data } = await supabase
    .from("commission_records")
    .select("net_amount")
    .eq("partner_id", partnerId)
    .in("type", ["coupon_sale", "referral_commission"]);
  const total = (data ?? []).reduce((s: number, r: any) => s + (r.net_amount || 0), 0);
  return { total, count: (data ?? []).length };
}


// ─── Groq : Prompt système avec détection de rôle ────────────────────────────
const GROQ_SYSTEM_BASE = `Tu es l'assistant IA du bot Telegram "Pack Officiel" de betesim — une plateforme de pronostics sportifs en Afrique de l'Ouest.

Infos plateforme :
- Coupons de paris sportifs (1Win / 1xBet) vendus par des revendeurs
- Prix coupon selon la cote : ≤5.50 → 250 FCFA | 5.51–16 → 500 FCFA | >16 → 1000 FCFA
- Paiement : Mobile Money (Orange Money, Wave, MTN, Moov)
- Commission revendeur créditée dès la publication du coupon

IDENTITÉ :
- Tu as été conçu par Jérémy Hounmetin, développeur et entrepreneur.
- Si on te demande qui t'a créé ou qui est ton développeur, réponds EXACTEMENT : "J'ai été conçu par Jérémy Hounmetin, développeur et entrepreneur. 😊"

RÈGLES ABSOLUES :
1. Réponds TOUJOURS en phrase naturelle, courte et directe (max 3 phrases).
2. Salutation (bonjour, cc, salut, ça va, allô...) → réponds chaleureusement et demande comment tu peux aider.
3. Demande vague, hors-sujet ou incompréhensible → réponds EXACTEMENT : "Je n'ai pas bien compris, peux-tu reformuler ? Tu peux aussi utiliser les boutons ci-dessous. 😊"
4. Corrige mentalement les erreurs de prononciation ou de transcription vocale avant de répondre.
5. Jamais de liste de commandes. Jamais de fausses informations. Style : amical, 1-2 emojis max, en français.`;

function buildGroqSystem(role: "client" | "revendeur" | "unknown"): string {
  const roleCtx =
    role === "revendeur" ?
      `

Tu parles à un REVENDEUR. Il publie des coupons 1Win pour gagner des commissions.
Commandes utiles : /pro (dashboard+wallet) · "Ajouter un coupon" (menu natif Telegram) · /publier (wizard coupon).
Aide-le à publier ses coupons, vérifier son solde et comprendre ses gains.`
    : role === "client" ?
      `

Tu parles à un CLIENT. Il cherche à acheter des coupons de pronostics sportifs.
Commandes utiles : /coupons (voir coupons disponibles) · /start (démarrer).
Aide-le à trouver un coupon, comprendre le paiement et récupérer son code après achat.`
    :
      `

Tu ne sais pas encore si c'est un client ou un revendeur. Propose les deux options :
- Client → /coupons pour voir les coupons
- Revendeur → /pro pour le dashboard`;
  return GROQ_SYSTEM_BASE + roleCtx;
}

// ─── Logging persistant vers bot_logs ─────────────────────────────────────────
async function logBotEvent(
  level: "error" | "warn" | "info",
  event: string,
  chatId: number | null,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;
    await fetch(`${supabaseUrl}/rest/v1/bot_logs`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify({ level, event, chat_id: chatId, message, details: details ?? null }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* ne jamais crasher le bot pour un log */ }
}

async function askGroq(
  userMessage: string,
  firstName: string,
  role: "client" | "revendeur" | "unknown" = "unknown",
): Promise<string | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: buildGroqSystem(role) },
          { role: "user", content: `[${firstName}]: ${userMessage}` },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });
    const data = await res.json() as any;
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e: any) {
    console.error("Groq timeout/error:", e);
    void logBotEvent("error", "groq_error", null, e?.message ?? String(e), { model: "llama-3.1-8b-instant" });
    return null;
  }
}

// ─── Transcription vocale via Groq Whisper ────────────────────────────────
async function transcribeAudio(fileId: string): Promise<string | null> {
  const apiKey   = Deno.env.get("GROQ_API_KEY");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!apiKey || !botToken) return null;
  try {
    // 1. Obtenir le chemin du fichier depuis Telegram
    const fileRes  = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json() as any;
    const filePath = fileData?.result?.file_path;
    if (!filePath) return null;

    // 2. Télécharger le fichier audio depuis Telegram
    const audioRes  = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    const audioBlob = await audioRes.blob();

    // 3. Envoyer à Groq Whisper pour transcription
    const form = new FormData();
    form.append("file", audioBlob, "voice.ogg");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "fr");
    form.append("response_format", "text");

    const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("Whisper error:", errText);
      void logBotEvent("error", "whisper_api_error", null, `Whisper HTTP ${whisperRes.status}`, { body: errText.slice(0, 300), fileId });
      return null;
    }
    const transcribed = (await whisperRes.text()).trim();
    return transcribed || null;
  } catch (e: any) {
    console.error("transcribeAudio error:", e);
    void logBotEvent("error", "whisper_error", null, e?.message ?? String(e), { fileId });
    return null;
  }
}



// ─────────────────────────────────────────────────────────────────────────────
// BOT PRONOSTICS v3 — Scraping à la demande, TheSportsDB, Zéro DB fixe
// ─────────────────────────────────────────────────────────────────────────────

const MARKET_LABELS: Record<string, string> = {
  win:     "🏆 Vainqueur (1N2)",
  goals:   "⚽ Buts / Over-Under",
  corners: "🔢 Corners",
  cards:   "🟨 Cartons",
  full:    "📊 Analyse Totale (tous marchés)",
};

const MARKET_PROMPTS: Record<string, string> = {
  win:
    "Marché EXCLUSIF : Résultat final (1N2 / Double chance).\n" +
    "Format obligatoire:\n" +
    "🏆 VAINQUEUR : [équipe ou Nul] | Cote : [X.XX]\n" +
    "📜 H2H (5 derniers) : [bilan confrontations directes]\n" +
    "📈 Forme récente : [5 derniers matchs chaque équipe]\n" +
    "🧮 Proba : Dom [X%] / Nul [X%] / Ext [X%]\n" +
    "✅ Le Pro mise sur : [choix + 1 phrase d'explication]\n" +
    "⚠️ Paris = risque.",

  goals:
    "Marché EXCLUSIF : Buts (Over/Under 2.5, BTTS, Score exact).\n" +
    "Format obligatoire:\n" +
    "⚽ TOTAL BUTS : [Over/Under X.5] | Cote : [X.XX]\n" +
    "📜 H2H buts : [moyenne buts sur 5 derniers H2H]\n" +
    "📈 Attaque/Défense récente : [buts marqués/encaissés par match]\n" +
    "🎯 Score exact probable : [X-X]\n" +
    "✅ Le Pro mise sur : [marché + cote]\n" +
    "⚠️ Paris = risque.",

  corners:
    "Marché EXCLUSIF : Corners (Total, Over/Under, équipe dominante).\n" +
    "Format obligatoire:\n" +
    "🔢 CORNERS : [Over/Under X.5] | Cote : [X.XX]\n" +
    "📜 H2H corners : [tendance sur 5 derniers matchs]\n" +
    "📈 Style de jeu : [pressing, possession, largeur de jeu]\n" +
    "✅ Le Pro mise sur : [marché corners + cote]\n" +
    "⚠️ Paris = risque.",

  cards:
    "Marché EXCLUSIF : Cartons (Total, joueurs à risque, arbitre).\n" +
    "Format obligatoire:\n" +
    "🟨 CARTONS : [Over/Under X.5] | Cote : [X.XX]\n" +
    "📜 H2H cartons : [matchs chauds? fair-play?]\n" +
    "📈 Discipline récente : [cartons moyens/match chaque équipe]\n" +
    "✅ Le Pro mise sur : [marché cartons + cote]\n" +
    "⚠️ Paris = risque.",

  full:
    "Analyse COMPLÈTE tous marchés. Format STRICT :\n\n" +
    "🔥 PRÉDICTION EXPERT — [Match]\n\n" +
    "📜 DOUBLE LECTURE\n" +
    "• H2H (5 derniers) : [bilan confrontations directes]\n" +
    "• Forme actuelle : [5 derniers matchs chaque équipe]\n" +
    "• Synthèse : [comment le passé influence-t-il le présent ?]\n\n" +
    "🎯 TOUS LES MARCHÉS\n" +
    "• 1N2 : [favori + cote indicative]\n" +
    "• Over/Under 2.5 buts : [tendance + cote]\n" +
    "• BTTS (Les deux marquent) : [Oui/Non + cote]\n" +
    "• Corners : [Over/Under + seuil]\n" +
    "• Cartons : [Over/Under + seuil]\n" +
    "• Score exact le plus probable : [X-X]\n\n" +
    "✅ LE CHOIX DU PRO\n" +
    "[2-3 marchés combinables avec cotes indicatives]\n\n" +
    "⚠️ Paris sportifs = risque. Jouer responsable.",
};

// Toutes les compétitions disponibles (IDs TheSportsDB — gratuit, sans clé)
const ALL_COMPS = [
  { id:"4443", name:"Coupe du Monde FIFA",    flag:"🌍" },
  { id:"4418", name:"Euro UEFA",              flag:"🇪🇺" },
  { id:"4415", name:"Copa America",           flag:"🌎" },
  { id:"4517", name:"CAN Afrique",            flag:"🌍" },
  { id:"4635", name:"Nations League UEFA",    flag:"🇪🇺" },
  { id:"4408", name:"AFC Asian Cup",          flag:"🌏" },
  { id:"4480", name:"Ligue des Champions",    flag:"⭐" },
  { id:"4481", name:"Europa League",          flag:"🟠" },
  { id:"4882", name:"Conference League",      flag:"⚪" },
  { id:"4737", name:"CAF Champions League",   flag:"🌍" },
  { id:"4738", name:"CAF Confederation Cup",  flag:"🌍" },
  { id:"4334", name:"Ligue 1",                flag:"🇫🇷" },
  { id:"4328", name:"Premier League",         flag:"🏴" },
  { id:"4335", name:"La Liga",                flag:"🇪🇸" },
  { id:"4332", name:"Serie A",                flag:"🇮🇹" },
  { id:"4331", name:"Bundesliga",             flag:"🇩🇪" },
  { id:"4350", name:"Eredivisie",             flag:"🇳🇱" },
  { id:"4351", name:"Liga NOS",               flag:"🇵🇹" },
  { id:"4397", name:"Super Lig",              flag:"🇹🇷" },
  { id:"4536", name:"MLS",                    flag:"🇺🇸" },
  { id:"4346", name:"Brasileirao",            flag:"🇧🇷" },
  { id:"4501", name:"Saudi Pro League",       flag:"🇸🇦" },
  { id:"4507", name:"Egyptian Premier League",flag:"🇪🇬" },
  { id:"4337", name:"Coupe de France",        flag:"🇫🇷" },
  { id:"4338", name:"FA Cup",                 flag:"🏴" },
  { id:"4340", name:"Copa del Rey",           flag:"🇪🇸" },
  { id:"4543", name:"Coupe d'Algerie",        flag:"🇩🇿" },
  { id:"4575", name:"Coupe du Senegal",       flag:"🇸🇳" },
];

const SDB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Recherche dynamique de compétitions sur TheSportsDB (depuis Edge Function, sans rate-limit)
async function searchLeaguesOnline(query: string): Promise<{ id: string; name: string; country: string }[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchleagues.php?t=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": SDB_UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const json = await res.json() as any;
    const leagues = (json?.countrys ?? []) as any[];
    return leagues
      .filter((l: any) => l.strSport === "Soccer")
      .slice(0, 6)
      .map((l: any) => ({ id: String(l.idLeague), name: l.strLeague, country: l.strCountry ?? "" }));
  } catch { return []; }
}

// Scraping : prochains matchs d'une compétition (TheSportsDB gratuit)
async function fetchEventsForLeague(leagueId: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`,
      { headers: { "User-Agent": SDB_UA, Accept: "application/json" }, signal: AbortSignal.timeout(7000) }
    );
    if (!res.ok) return [];
    const json = await res.json() as any;
    const now    = Date.now();
    const month30 = now + 30 * 24 * 3600 * 1000;
    const all = (json?.events ?? []).filter((e: any) => {
      if (!e.dateEvent) return true;
      const t = new Date(`${e.dateEvent}T${e.strTime || "12:00:00"}Z`).getTime();
      return t >= now && t <= month30;
    });
    // Fallback : si rien dans 30j, retourner le 1er match futur
    if (all.length === 0) {
      const future = (json?.events ?? []).filter((e: any) => !e.dateEvent || new Date(`${e.dateEvent}T${e.strTime || "12:00:00"}Z`).getTime() >= now);
      return future.slice(0, 4);
    }
    return all.slice(0, 8);
  } catch { return []; }
}

// Lookup d'un événement par ID TheSportsDB
async function fetchEventById(eventId: string): Promise<any | null> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${eventId}`,
      { headers: { "User-Agent": SDB_UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const json = await res.json() as any;
    return json?.events?.[0] ?? null;
  } catch { return null; }
}

// Génère l'analyse Groq — double lecture H2H + forme récente + marché ciblé
async function generateMatchAnalysis(match: any, market = "full"): Promise<string> {
  const apiKey  = Deno.env.get("GROQ_API_KEY");
  const home    = match.team_home   || match.strHomeTeam || "?";
  const away    = match.team_away   || match.strAwayTeam || "?";
  const league  = match.league      || match.strLeague   || "Compétition";
  const pred    = match.prediction  || "";
  const notes   = String(match.notes || match.stats || "").slice(0, 150);
  const rawDate = match.match_date  || (match.dateEvent && match.strTime ? `${match.dateEvent}T${match.strTime}Z` : null);
  const date    = rawDate ? new Date(rawDate).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";
  const mLabel  = MARKET_LABELS[market] ?? market;
  const mPrompt = MARKET_PROMPTS[market] ?? MARKET_PROMPTS.full;

  const fallback = [
    `🔥 <b>PRÉDICTION EXPERT</b> — ${escapeHtml(home)} vs ${escapeHtml(away)}`,
    `🏆 ${escapeHtml(league)}${date ? ` · ${date}` : ""}`,
    `📌 Marché : ${mLabel}`,
    ``,
    pred ? `✅ Prédiction indicative : ${escapeHtml(pred)}` : "⚙️ Analyse en cours...",
  ].filter(Boolean).join("\n");

  if (!apiKey) return fallback;
  const maxTok = market === "full" ? 400 : 220;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Tu es un analyste expert en paris sportifs. Réponds UNIQUEMENT en français. MARCHÉ CIBLE : ${mLabel}.\n\n${mPrompt}`,
          },
          {
            role: "user",
            content: `Match : ${home} vs ${away} | Compétition : ${league}${date ? ` | Date : ${date}` : ""}\nContexte : ${(pred + " " + notes).trim() || "données standards"}`,
          },
        ],
        max_tokens: maxTok,
        temperature: 0.35,
      }),
    });
    const d  = await res.json() as any;
    const ai = d?.choices?.[0]?.message?.content?.trim();
    if (ai) return ai + `\n\n🗓 <i>${date ? date + " · " : ""}${escapeHtml(league)}</i>`;
  } catch (_) { /* fallback */ }
  return fallback;
}

// Menu intelligent : compétitions actives (scraping parallèle top-12)
async function sendCompetitionList(chatId: number, _supabase: any) {
  await sendAction(chatId);

  const results = await Promise.allSettled(
    ALL_COMPS.map(async (comp) => ({ comp, events: await fetchEventsForLeague(comp.id) }))
  );

  const active = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.events.length > 0)
    .map(r => r.value)
    .sort((a: any, b: any) => b.events.length - a.events.length)
    .slice(0, 6);

  if (active.length === 0) {
    await sendMessage(chatId, [
      `🏆 <b>Analyses & Pronostics</b>`, ``,
      `📭 Aucun match trouvé dans les 30 prochains jours.`, ``,
      `💡 Utilise la recherche pour trouver ta compétition :`,
    ].join("\n"), {
      inline_keyboard: [
        [{ text: "🔍 Chercher une compétition", callback_data: "search_match" }],
        [{ text: "🔄 Rafraîchir", callback_data: "pronostics_menu" }],
      ],
    });
    return;
  }

  const fmtDate = (events: any[]) => {
    const e = events[0];
    if (!e?.dateEvent) return "";
    try { return new Date(`${e.dateEvent}T${e.strTime || "12:00:00"}Z`)
      .toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }); }
    catch { return ""; }
  };

  const buttons = [
    ...active.map(({ comp, events }: any) => [{
      text: `${comp.flag} ${comp.name} — ${events.length} match${events.length > 1 ? "s" : ""} (prochain : ${fmtDate(events)})`,
      callback_data: `comp:${comp.id}`,
    }]),
    [{ text: "🔍 Autre compétition — écrire le nom", callback_data: "search_match" }],
  ];

  await sendMessage(chatId, [
    `🏆 <b>Compétitions actives en ce moment</b>`, ``,
    `Voici les compétitions qui se jouent actuellement.\nLaquelle souhaites-tu analyser ?`,
  ].join("\n"), { inline_keyboard: buttons });
}

// Liste des matchs d'une compétition (scraping TheSportsDB à la demande)
async function sendMatchesList(chatId: number, leagueId: string, _supabase: any) {
  await sendAction(chatId);
  const comp   = ALL_COMPS.find(c => c.id === leagueId);
  const events = await fetchEventsForLeague(leagueId);

  if (!events.length) {
    await sendMessage(chatId, [
      `📭 Aucun match trouvé pour <b>${escapeHtml(comp?.name ?? leagueId)}</b> dans les 30 prochains jours.`, ``,
      `Les données sont issues de TheSportsDB et mises à jour en temps réel.`,
    ].join("\n"), {
      inline_keyboard: [
        [{ text: "🔍 Chercher une autre compétition", callback_data: "search_match" }],
        [{ text: "◀ Retour", callback_data: "pronostics_menu" }],
      ],
    });
    return;
  }

  const buttons = [
    ...events.map((e: any) => {
      let d = "";
      try {
        if (e.dateEvent && e.strTime)
          d = new Date(`${e.dateEvent}T${e.strTime.endsWith("Z") ? e.strTime : e.strTime + "Z"}`)
            .toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
      } catch { d = e.dateEvent ?? ""; }
      return [{ text: `⚽ ${e.strHomeTeam} vs ${e.strAwayTeam}${d ? ` · ${d}` : ""}`, callback_data: `mat:${e.idEvent}` }];
    }),
    [{ text: "◀ Retour aux compétitions", callback_data: "pronostics_menu" }],
  ];

  await sendMessage(chatId, [
    `${comp?.flag ?? "🏆"} <b>${escapeHtml(comp?.name ?? leagueId)}</b>`, ``,
    `${events.length} match${events.length > 1 ? "s" : ""} à venir — clique pour analyser :`,
  ].join("\n"), { inline_keyboard: buttons });
}

// Étape 1 : sélection du marché (instantané, sans Groq)
async function sendMatchAnalysis(chatId: number, eventId: string, supabase: any) {
  await sendAction(chatId);
  const isUUID = eventId.includes("-");
  let home = "?", away = "?", league = "Compétition", date = "", backCb = "pronostics_menu";

  if (isUUID) {
    const { data: m } = await supabase.from("analyses")
      .select("team_home, team_away, league, match_date").eq("id", eventId).maybeSingle();
    if (m) {
      home = m.team_home; away = m.team_away; league = m.league ?? league;
      if (m.match_date) date = new Date(m.match_date).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
    }
    const c = ALL_COMPS.find(x => x.name === league);
    if (c) backCb = `comp:${c.id}`;
  } else {
    const e = await fetchEventById(eventId);
    if (!e) {
      await sendMessage(chatId, "❌ Match introuvable. Essaie à nouveau.", { inline_keyboard: [[{ text: "◀ Retour", callback_data: "pronostics_menu" }]] });
      return;
    }
    home = e.strHomeTeam ?? "?"; away = e.strAwayTeam ?? "?"; league = e.strLeague ?? "Compétition";
    try {
      if (e.dateEvent && e.strTime)
        date = new Date(`${e.dateEvent}T${e.strTime.endsWith("Z") ? e.strTime : e.strTime + "Z"}`)
          .toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
    } catch { date = e.dateEvent ?? ""; }
    const c = ALL_COMPS.find(x => x.name === league || league.toLowerCase().includes(x.name.toLowerCase().slice(0, 4)));
    if (c) backCb = `comp:${c.id}`;
  }

  await sendMessage(chatId, [
    `⚽ <b>${escapeHtml(home)} vs ${escapeHtml(away)}</b>`,
    `🏆 ${escapeHtml(league)}${date ? ` · ${date}` : ""}`, ``,
    `<b>Sur quel marché porte ton analyse ?</b>`,
    `<i>L'IA adapte toute sa puissance de calcul au marché choisi.</i>`,
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "🏆 Vainqueur (1N2)",              callback_data: `mkt:${eventId}:win`     }],
      [{ text: "⚽ Buts / Over-Under",             callback_data: `mkt:${eventId}:goals`   }],
      [{ text: "🔢 Corners",                       callback_data: `mkt:${eventId}:corners` }],
      [{ text: "🟨 Cartons",                       callback_data: `mkt:${eventId}:cards`   }],
      [{ text: "📊 Analyse Totale (tous marchés)", callback_data: `mkt:${eventId}:full`    }],
      [{ text: "◀ Retour",                         callback_data: backCb                   }],
    ],
  });
}

// Étape 2 : génère l'analyse Groq pour le marché choisi
async function sendMarketAnalysis(chatId: number, eventId: string, market: string, supabase: any) {
  await sendAction(chatId);
  const isUUID = eventId.includes("-");
  let matchData: any = {};

  if (isUUID) {
    const { data: m } = await supabase.from("analyses").select("*").eq("id", eventId).maybeSingle();
    if (m) matchData = { team_home: m.team_home, team_away: m.team_away, league: m.league, match_date: m.match_date, prediction: m.prediction, notes: m.notes ?? m.stats };
  } else {
    const e = await fetchEventById(eventId);
    if (e) matchData = {
      team_home: e.strHomeTeam, team_away: e.strAwayTeam, league: e.strLeague,
      match_date: e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}Z` : null,
    };
  }

  if (!matchData.team_home) {
    await sendMessage(chatId, "❌ Match introuvable.", { inline_keyboard: [[{ text: "◀ Menu", callback_data: "pronostics_menu" }]] });
    return;
  }

  const analysisText = await generateMatchAnalysis(matchData, market);
  const cpId = isUUID ? eventId : null;
  const { count } = await supabase.from("coupons_partages").select("id", { count:"exact", head:true }).eq("analysis_id", cpId);
  const n = (count as number) ?? 0;

  await sendMessage(chatId, analysisText, {
    inline_keyboard: [
      [{ text: "📤 Publier mon coupon ✅",  callback_data: `pub_coupon:${eventId}` }],
      ...(n > 0 ? [[{ text: `👀 ${n} coupon${n>1?"s":""} partagé${n>1?"s":""}`, callback_data: `see_coupons:${eventId}` }]] : []),
      [{ text: "🔄 Changer de marché",      callback_data: `mat:${eventId}`        }],
      [{ text: "🏠 Menu compétitions",      callback_data: "pronostics_menu"       }],
    ],
  });
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
    .select("id, code, codes_json, label, price_fcfa, platform, total_odds, match_start_time, creator_id, analyses:analysis_id(team_home, team_away, league, result)")
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
  if (!code || code.length < 3) return "★★★★★★";
  const n = Math.min(4, code.length - 2);
  return code.slice(0, n) + "★".repeat(Math.max(5, code.length - n));
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
  const lines = (coupons as any[]).map((c, i) => {
    const name   = couponDisplayName(c as any);
    const odds   = c.total_odds ? `📊 Cote: <b>${c.total_odds}</b>` : "";
    const price  = `💰 <b>${c.price_fcfa.toLocaleString("fr-FR")} FCFA</b>`;
    const codes  = (c.codes_json as string[] | null)?.length ? maskCodes(c.codes_json as string[]) : partialCode(c.code || "");
    const expire = c.match_start_time ? `⏰ Expire: ${new Date(c.match_start_time).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", timeZone:"Africa/Abidjan" })}` : "";
    const count  = (c.codes_json as string[] | null)?.length || 1;
    return `${i + 1}. 🎟 <b>${name}</b>\n   Code: <code>${codes}</code> (${count} code${count>1?"s":""})\n   ${[odds,price,expire].filter(Boolean).join(" · ")}`;
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
    .select("id, buyer_chat_id, amount_fcfa, coupons(id, code, platform, price_fcfa, creator_id, referrer_id, analysis_id)")
    .eq("id", orderId).maybeSingle();
  if (!order) return null;
  const coupon = (order as any).coupons;
  if (!coupon) return null;
  await supabase.from("coupons").update({ status: "sold", sold_at: new Date().toISOString(), buyer_id: String(order.buyer_chat_id) }).eq("id", coupon.id);
  await supabase.from("bot_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
  const gross = coupon.price_fcfa;

  // Récupérer le pronostiqueur lié à l'analyse (si applicable)
  let pronostiqueurId: string | null = null;
  if (coupon.analysis_id) {
    const { data: analysis } = await supabase.from("analyses")
      .select("pronostiqueur_id").eq("id", coupon.analysis_id).maybeSingle();
    pronostiqueurId = (analysis as any)?.pronostiqueur_id ?? null;
  }

  // Répartition des commissions :
  // Avec pronostiqueur : 60% revendeur / 10% pronostiqueur / 10% parrain / 20% plateforme
  // Sans pronostiqueur : 70% revendeur / 10% parrain / 20% plateforme
  const hasProno = !!pronostiqueurId;
  const creatorPct  = hasProno ? 0.60 : 0.70;
  const pronoPct    = hasProno ? 0.10 : 0.00;
  const creatorShare  = Math.round(gross * creatorPct);
  const pronoShare    = hasProno ? Math.round(gross * pronoPct) : 0;
  const referrerShare = Math.round(gross * 0.10);
  const platformShare = gross - creatorShare - pronoShare - (coupon.referrer_id ? referrerShare : 0);

  const records: any[] = [
    { coupon_id: coupon.id, type: "coupon_sale", gross_amount: gross, commission_amount: platformShare, net_amount: creatorShare, description: `Vente coupon (${Math.round(creatorPct*100)}%)`, partner_id: coupon.creator_id },
  ];
  if (pronostiqueurId) {
    records.push({ coupon_id: coupon.id, type: "pronostiqueur_share", gross_amount: gross, commission_amount: platformShare, net_amount: pronoShare, description: "Part pronostiqueur (10%)", partner_id: pronostiqueurId });
  }
  if (coupon.referrer_id) {
    records.push({ coupon_id: coupon.id, type: "referral_commission", gross_amount: gross, commission_amount: platformShare, net_amount: referrerShare, description: "Commission parrain (10%)", partner_id: coupon.referrer_id });
  }
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
Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get("action");
  const token  = Deno.env.get("TELEGRAM_BOT_TOKEN");

  const makeSupabase = () => createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { fetch: (u: RequestInfo | URL, o?: RequestInit) => fetch(u, { ...o, signal: AbortSignal.timeout(8000) }) } }
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
      body: JSON.stringify({ menu_button: { type:"web_app", text:"📊 Analyses", web_app:{ url: pUrl } } }),
    });
    const json = await r.json();
    return new Response(JSON.stringify({ ...json, pronosticsUrl: pUrl }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }


  // ── Share page (universal native share) ─────────────────────────────────────
  if (url.searchParams.get("source") === "share") {
    const su  = decodeURIComponent(url.searchParams.get("url")   || "");
    const st  = decodeURIComponent(url.searchParams.get("text")  || su);
    const sl  = decodeURIComponent(url.searchParams.get("label") || "Partager le lien");
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${sl}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:var(--tg-theme-bg-color,#fff);color:var(--tg-theme-text-color,#222);
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;padding:28px 20px;gap:18px;text-align:center}
    .ico{font-size:52px}
    h2{font-size:20px;font-weight:700;line-height:1.3}
    .sub{font-size:14px;opacity:.65;line-height:1.5}
    .url{background:var(--tg-theme-secondary-bg-color,#f4f4f8);border-radius:12px;
         padding:12px 16px;font-size:12px;word-break:break-all;width:100%;font-family:monospace;
         color:var(--tg-theme-hint-color,#888)}
    .btn{background:var(--tg-theme-button-color,#0088cc);color:var(--tg-theme-button-text-color,#fff);
         border:none;border-radius:14px;padding:15px 24px;font-size:17px;font-weight:600;
         cursor:pointer;width:100%;max-width:320px;transition:opacity .15s}
    .btn:active{opacity:.8}
    .copy{background:transparent;color:var(--tg-theme-link-color,#0088cc);
          font-size:14px;padding:8px 16px;border:none;cursor:pointer}
    .status{font-size:14px;font-weight:600;color:#22c55e;min-height:18px}
  </style>
</head>
<body>
  <div class="ico">📤</div>
  <h2>${sl}</h2>
  <div class="url" id="urlBox">${su}</div>
  <p class="sub">Choisissez l'application de votre choix</p>
  <p class="status" id="st"></p>
  <button class="btn" id="shareBtn" onclick="doShare()">Partager via…</button>
  <button class="copy" onclick="copyLink()">📋 Copier le lien</button>
  <script>
    const tg=window.Telegram.WebApp; tg.ready(); tg.expand();
    const SU=${JSON.stringify(su)}, ST=${JSON.stringify(st)};
    async function doShare(){
      if(navigator.share){
        try{await navigator.share({title:'Betesim',text:ST,url:SU});
          document.getElementById('st').textContent='✅ Partagé !';
          setTimeout(()=>tg.close(),800);
        }catch(e){if(e.name!=='AbortError')copyLink();}
      }else{copyLink();}
    }
    async function copyLink(){
      try{await navigator.clipboard.writeText(SU);}catch{}
      document.getElementById('st').textContent='✅ Lien copié !';
      document.getElementById('shareBtn').textContent='✅ Copié !';
      setTimeout(()=>tg.close(),1400);
    }
    setTimeout(doShare,350);
  <\/script>
</body></html>`;
    return new Response(html, { headers:{"Content-Type":"text/html; charset=utf-8"} });
  }
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  // Lire le body
  let bodyText: string;
  try { bodyText = await req.text(); }
  catch { return new Response("ok", { status: 200 }); }

  // ── Validation des variables critiques ─────────────────────────────────────
  const _botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const _serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!_botToken) {
    console.error("[FATAL] TELEGRAM_BOT_TOKEN manquant — le bot ne peut pas répondre. Configurez ce secret dans Supabase.");
    return new Response("ok", { status: 200 }); // 200 pour éviter les retentatives Telegram
  }
  if (!_serviceKey) {
    console.error("[FATAL] SUPABASE_SERVICE_ROLE_KEY manquant — accès DB impossible. Configurez ce secret dans Supabase.");
    return new Response("ok", { status: 200 });
  }
  // Log GROQ status (non bloquant — le bot fonctionne sans Groq)
  const _groqKey = Deno.env.get("GROQ_API_KEY");
  if (!_groqKey) {
    console.warn("[WARN] GROQ_API_KEY manquant — le fallback IA Groq est désactivé. Ajoutez-le dans Supabase pour activer les réponses intelligentes.");
  }

  // Répondre immédiatement à Telegram (évite le Read timeout expired)
  // EdgeRuntime.waitUntil maintient la fonction vivante le temps du traitement
  const processing = (async () => {
    const supabase = makeSupabase();
    let update: any;
    try { update = JSON.parse(bodyText); }
    catch { return; }

  // ── FedaPay webhook ─────────────────────────────────────────────────────────
  if (url.searchParams.get("source") === "fedapay") {
    try {
      const entity = update?.entity || update?.v1?.transaction || update;
      const status = entity?.status;
      if (status === "approved" || status === "Approuvé") {
        const meta        = entity?.custom_metadata || {};
        const couponId    = meta?.coupon_id;
        const buyerChatId = parseInt(meta?.buyer_chat_id || "0");
        const fedaId      = String(entity?.id || "");
        if (couponId && buyerChatId) {
          const { data: order } = await supabase.from("bot_orders")
            .select("id, amount_fcfa").eq("fedapay_id", fedaId).eq("status", "pending").maybeSingle();
          if (order) {
            const result = await confirmBotOrder(supabase, order.id);
            if (result) {
              await deliverCode(result.buyerChatId, result.couponCode, result.platform, result.amount);
              // Notifier le revendeur
              const { data: rp } = await supabase.from("profiles")
                .select("telegram_chat_id").eq("id", result.creatorId).maybeSingle();
              if ((rp as any)?.telegram_chat_id) {
                await sendMessage((rp as any).telegram_chat_id, [
                  `💰 <b>Vente !`,``,
                  `🎟 Coupon vendu · <b>+${result.netAmount ? result.netAmount.toLocaleString("fr-FR") : result.amount} FCFA</b> crédités`,
                ].join("\n"), {
                  inline_keyboard: [[{ text: "💰 Voir mon Wallet", callback_data: "wallet_detail" }]],
                });
              }
            }
          }
        }
      }
    } catch (fpErr: any) { console.error("FedaPay webhook error:", fpErr?.message); }
    return;
  }

  try {
    // ── /app ─────────────────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/app")) {
      const chatId = update.message.chat.id;
      const pUrl = await pronosticsUrl(supabase);
      await sendMessage(chatId, `🎯 Ouvre <b>Pack Officiel</b> en plein écran :`, {
        inline_keyboard: [
          [{ text:"➕ Ajouter un coupon",           callback_data:"pronostics_menu" }],
          [{ text:"🎟 Voir les coupons disponibles", callback_data:"voir_pool" }],
        ],
      });
      return;
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
      return;
    }

    // ── /confirmer (admin) ────────────────────────────────────────────────
    if (update.message?.text?.startsWith("/confirmer")) {
      const chatId = update.message.chat.id;
      const parts = update.message.text.split(" ");
      const couponId = parts[1];
      const buyerChatId = Number(parts[2]);
      if (!couponId || !buyerChatId) {
        await sendMessage(chatId, "Usage : /confirmer {coupon_id} {buyer_chat_id}");
        return;
      }
      const { data: coupon } = await supabase.from("coupons").select("id,code,price_fcfa,platform,status").eq("id", couponId).maybeSingle();
      if (!coupon) { await sendMessage(chatId, "❌ Coupon introuvable"); return; }
      if (coupon.status !== "active") { await sendMessage(chatId, "❌ Coupon déjà vendu ou inactif"); return; }
      await supabase.from("coupons").update({ status:"sold", sold_at: new Date().toISOString(), buyer_id: String(buyerChatId) }).eq("id", couponId);
      await deliverCoupon(buyerChatId, coupon.code, coupon.platform, coupon.price_fcfa);
      await sendMessage(chatId, `✅ Paiement confirmé. Code <code>${coupon.code}</code> envoyé au client ${buyerChatId}.`);
      return;
    }


    // ── /connect {uid} — lier compte revendeur ────────────────────────────────
    if (update.message?.text?.startsWith("/connect")) {
      const chatId = update.message.chat.id;
      const uid = update.message.text.split(" ")[1]?.trim();
      if (!uid) {
        await sendMessage(chatId, [
          `🔗 <b>Lier ton compte revendeur</b>`, ``,
          `Envoie ta commande avec ton UID revendeur :`,
          `<code>/connect {ton_uid}</code>`,
          ``,
          `Ton UID t'a été fourni par l'administrateur.`,
        ].join("\n"));
        return;
      }
      // Verify profile exists
      const { data: profile, error } = await supabase
        .from("profiles").select("id, full_name, is_partner, is_admin").eq("id", uid).maybeSingle();
      if (!profile) {
        await sendMessage(chatId, "❌ UID introuvable. Vérifie bien l'identifiant copié depuis le Dashboard.");
        return;
      }
      if (!profile.is_partner && !profile.is_admin) {
        await sendMessage(chatId, "❌ Ce compte n'a pas les droits revendeur. Contacte l'administrateur.");
        return;
      }
      await supabase.from("profiles").update({ telegram_chat_id: chatId }).eq("id", uid);
      await sendMessage(chatId, [
        `✅ <b>Compte lié avec succès !</b>`,
        `Bienvenue, <b>${escapeHtml(profile.full_name || "Revendeur")}</b> !`, ``,
        `Tu peux maintenant accéder à :`,
        `📊 /dashboard — Ton espace revendeur`,
        `💰 /wallet — Ton solde et commissions`,
        `📋 /analyses — Analyses à traiter`,
      ].join("\n"));
      return;
    }

    // ── /dashboard — espace revendeur ─────────────────────────────────────────
    if (update.message?.text?.startsWith("/dashboard") || update.message?.text?.startsWith("/mon_espace")) {
      const chatId = update.message.chat.id;
      let reseller = await getResellerProfile(supabase, chatId);
      if (!reseller) {
        // Auto-créer le profil revendeur
        const firstName3 = update.message?.from?.first_name || "Revendeur";
        await supabase.from("profiles").insert({
          id:               `tg_${chatId}`,
          full_name:        firstName3,
          is_partner:       true,
          telegram_chat_id: chatId,
          created_at:       new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        });
        const { data: fp } = await supabase.from("profiles").select("id, full_name, is_partner, is_admin, email").eq("telegram_chat_id", chatId).maybeSingle();
        if (!fp) {
          await sendMessage(chatId, "❌ Impossible de créer ton profil. Contacte l'administrateur.");
          return;
        }
        reseller = fp;
      }
      const [wallet, analyses, { data: coupons }] = await Promise.all([
        getWalletBalance(supabase, reseller.id),
        getPendingAnalyses(supabase, reseller.id),
        supabase.from("coupons").select("id, status").eq("creator_id", reseller.id),
      ]);
      const active = (coupons ?? []).filter((c: any) => c.status === "active").length;
      const sold = (coupons ?? []).filter((c: any) => c.status === "sold").length;
      const pendingCount = analyses.length;
      await sendMessage(chatId, [
        `📊 <b>Dashboard Revendeur</b>`,
        `👤 ${escapeHtml(reseller.full_name || "Revendeur")}`, ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `💰 Wallet : <b>${wallet.total.toLocaleString("fr-FR")} FCFA</b>`,
        `   (${wallet.count} vente${wallet.count > 1 ? "s" : ""})`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🎟 Coupons actifs : <b>${active}</b>`,
        `✅ Coupons vendus : <b>${sold}</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        pendingCount > 0
          ? `🔔 <b>${pendingCount} analyse${pendingCount > 1 ? "s" : ""} en attente de coupon !</b>`
          : `✅ Toutes les analyses ont un coupon.`,
      ].join("\n"), {
        inline_keyboard: [
          [{ text: "💰 Détail wallet", callback_data: "wallet_detail" }, { text: "➕ Ajouter un coupon", callback_data: "pronostics_menu" }],
          pendingCount > 0 ? [{ text: `🔔 Ajouter un coupon maintenant (${pendingCount})`, callback_data: "pronostics_menu" }] : [],
          [{ text: "🎟 Voir mes coupons", callback_data: "my_coupons" }],
        ].filter((row: any[]) => row.length > 0),
      });
      return;
    }

    // ── /wallet — détail commissions ──────────────────────────────────────────
    if (update.message?.text?.startsWith("/wallet")) {
      const chatId = update.message.chat.id;
      const reseller = await getResellerProfile(supabase, chatId);
      if (!reseller) { await sendMessage(chatId, "🔒 Lie d'abord ton compte avec <code>/connect {uid}</code>"); return; }
      const { data: records } = await supabase
        .from("commission_records")
        .select("net_amount, type, description, created_at")
        .eq("partner_id", reseller.id)
        .order("created_at", { ascending: false })
        .limit(10);
      const total = (records ?? []).reduce((s: number, r: any) => s + r.net_amount, 0);
      const lines = (records ?? []).slice(0, 8).map((r: any) => {
        const date = new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
        return `  💸 <b>+${r.net_amount.toLocaleString("fr-FR")} F</b> — ${escapeHtml(r.description || r.type)} <i>(${date})</i>`;
      });
      await sendMessage(chatId, [
        `💰 <b>Wallet — ${escapeHtml(reseller.full_name || "Revendeur")}</b>`, ``,
        `🏦 Solde total : <b>${total.toLocaleString("fr-FR")} FCFA</b>`, ``,
        lines.length ? `📋 <b>Dernières commissions :</b>` : `📋 <i>Aucune commission pour l'instant.</i>`,
        ...lines,
      ].join("\n"));
      return;
    }

    // ── /rechercher — recherche d'analyses par équipe/compétition ─────────────
    if (update.message?.text?.startsWith("/rechercher") || update.message?.text?.startsWith("/search")) {
      const chatId = update.message.chat.id;
      const reseller = await getResellerProfile(supabase, chatId);
      if (!reseller) { await sendMessage(chatId, "🔒 Lie d'abord ton compte avec <code>/connect {uid}</code>"); return; }
      const parts = (update.message.text || "").split(" ").slice(1);
      const term = parts.join(" ").trim();
      if (!term) {
        await sendMessage(chatId,
          "🔍 <b>Recherche d'analyses</b>\n\nTape : <code>/rechercher Bayern</code> ou <code>/rechercher Ligue 1</code>\n\nTu peux chercher par :\n• Nom d'équipe (ex: <code>PSG</code>, <code>Real Madrid</code>)\n• Compétition (ex: <code>Champions League</code>, <code>CAN</code>)\n• Pays (ex: <code>France</code>, <code>Afrique</code>)",
          { inline_keyboard: [[{ text: "➕ Ajouter un coupon", callback_data: "pronostics_menu" }]] }
        );
        return;
      }
      const analyses = await getPendingAnalyses(supabase, reseller.id, term);
      if (!analyses.length) {
        await sendMessage(chatId,
          `🔍 Aucun résultat pour "<b>${escapeHtml(term)}</b>"\n\nEssaie un autre terme ou consulte toutes les analyses.`,
          { inline_keyboard: [[{ text: "➕ Ajouter un coupon", callback_data: "pronostics_menu" }]] }
        );
        return;
      }
      const grouped = formatAnalysesGrouped(analyses, analyses.length);
      await sendMessage(chatId,
        `🔍 <b>Résultats pour "${escapeHtml(term)}" (${analyses.length})</b>\n\n${grouped}`,
        {
          inline_keyboard: [
            ...analyses.slice(0, 6).map((a: any) => [{ text: `➕ ${a.team_home} vs ${a.team_away}`, callback_data: `create_coupon_${a.id}` }]),
            [{ text: "➕ Ajouter un coupon",   callback_data: "pronostics_menu" }, { text: "◀ Dashboard", callback_data: "dashboard_home" }],
          ],
        }
      );
      return;
    }

    // ── /analyses — Menu pronostics tout-en-un ───────────────────────────────
    if (update.message?.text?.startsWith("/analyses")) {
      const chatId = update.message.chat.id;
      await sendCompetitionList(chatId, supabase);
      return;
    }

    // ── /publier — revendeur : wizard création coupon libre ──────────────────
    if (update.message?.text?.startsWith("/publier")) {
      const chatId = update.message.chat.id;
      let reseller = await getResellerProfile(supabase, chatId);
      if (!reseller) {
        const firstName2 = update.message.from?.first_name || "Revendeur";
        await supabase.from("profiles").insert({
          id: `tg_${chatId}`, full_name: firstName2, is_partner: true,
          telegram_chat_id: chatId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).select().maybeSingle();
        const { data: fp } = await supabase.from("profiles").select("id,full_name,is_partner").eq("telegram_chat_id", chatId).maybeSingle();
        reseller = fp;
      }
      await clearBotState(supabase, chatId);
      await setBotState(supabase, chatId, "pub_step_code", {});
      await sendHuman(chatId, [
        `🎫 <b>Publier un coupon</b>`, ``,
        `<b>Étape 1/4 — Code</b>`, ``,
        `Entre ton code coupon (1xBet / 1Win) :`,
        `<i>Exemple : ABC123456</i>`,
      ].join("\n"), {
        inline_keyboard: [[{ text: "❌ Annuler", callback_data: "dashboard_home" }]],
      }, DELAY_SHORT);
      return;
    }

    // ── /relancer — admin : notifier tous les revendeurs ──────────────────────
    if (update.message?.text?.startsWith("/relancer")) {
      const chatId = update.message.chat.id;
      // Get analyses without enough coupons (published and active)
      const { data: analyses } = await supabase
        .from("analyses")
        .select("id, team_home, team_away, league, match_date, platform_suggestion")
        .eq("published", true)
        .order("match_date", { ascending: true })
        .limit(5);
      if (!analyses?.length) { await sendMessage(chatId, "📭 Aucune analyse publiée à envoyer."); return; }
      // Get all resellers with telegram_chat_id
      const { data: resellers } = await supabase
        .from("profiles")
        .select("id, full_name, telegram_chat_id")
        .not("telegram_chat_id", "is", null)
        .or("is_partner.eq.true,is_admin.eq.true");
      if (!resellers?.length) { await sendMessage(chatId, "⚠️ Aucun revendeur n'a encore lié son compte Telegram.\nPartagez la commande /connect."); return; }
      let notified = 0;
      for (const reseller of resellers as any[]) {
        if (!reseller.telegram_chat_id || reseller.telegram_chat_id === chatId) continue;
        // Check which analyses they haven't done
        const { data: done } = await supabase.from("coupons").select("analysis_id").eq("creator_id", reseller.id).in("analysis_id", analyses.map((a: any) => a.id));
        const doneIds = new Set((done ?? []).map((c: any) => c.analysis_id));
        const pending = (analyses as any[]).filter((a: any) => !doneIds.has(a.id));
        if (!pending.length) continue;
        const matchLines = pending.map((a: any) => {
          const date = a.match_date ? new Date(a.match_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "";
          const plat = a.platform_suggestion ? ` [${a.platform_suggestion.toUpperCase()}]` : "";
          return `• <b>${escapeHtml(a.team_home)} vs ${escapeHtml(a.team_away)}</b>${plat} — ${date}`;
        });
        await sendMessage(reseller.telegram_chat_id, [
          `🔔 <b>Nouvelles analyses disponibles !</b>`, ``,
          `<b>${pending.length} match${pending.length > 1 ? "s" : ""}</b> attende${pending.length > 1 ? "nt" : ""} ton coupon :`, ``,
          ...matchLines, ``,
          `👇 Crée tes coupons dès maintenant :`,
        ].join("\n"), {
          inline_keyboard: [
            [{ text: "➕ Ajouter un coupon", callback_data: "pronostics_menu" }],
            [{ text: "📊 Mon Dashboard", callback_data: "dashboard_home" }],
          ],
        });
        notified++;
      }
      await sendMessage(chatId, `✅ <b>${notified} revendeur${notified > 1 ? "s" : ""} notifié${notified > 1 ? "s" : ""}.</b>\n\nRevendeurs non liés : ${(resellers as any[]).length - notified} (n'ont pas encore fait /connect)`);
      return;
    }


    // ── /auto-analyse — admin : lancer le pipeline IA automatique ────────────
    if (update.message?.text?.startsWith("/auto-analyse") || update.message?.text?.startsWith("/autoanalyse")) {
      const chatId = update.message.chat.id;
      const profile = await getProfileByChatId(supabase, chatId);
      if (!profile?.is_admin) {
        await sendMessage(chatId, "⛔ Commande réservée à l'administrateur.");
        return;
      }
      await sendMessage(chatId, "🤖 <b>Pipeline analyses automatiques lancé…</b>\n\nJe récupère les matchs, génère les analyses IA et les publie. Patiente 30–60 secondes.");
      try {
        const res = await supabase.functions.invoke("auto-analyse", { body: {} });
        const data = res.data as { success?: boolean; created?: number; analyses?: string[]; errors?: string[] } | null;
        if (!data?.success) {
          await sendMessage(chatId, `❌ Erreur dans le pipeline : ${JSON.stringify(data)}`);
          return;
        }
        const lines = [
          `✅ <b>${data.created} analyse${(data.created ?? 0) > 1 ? "s" : ""} générée${(data.created ?? 0) > 1 ? "s" : ""} et publiées !</b>`,
          ...(data.analyses ?? []).map((a: string) => `  • ${a}`),
          ...(data.errors?.length ? [`\n⚠️ ${data.errors.length} erreur(s) : ${data.errors.join(", ")}`] : []),
        ];
        await sendMessage(chatId, lines.join("\n"), {
          inline_keyboard: [[{ text: "➕ Ajouter un coupon", callback_data: "pronostics_menu" }]],
        });
      } catch (err: any) {
        await sendMessage(chatId, `❌ Échec : ${err?.message ?? "erreur inconnue"}`);
      }
      return;
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
      return;
    }

    // ── /ordres (admin) ────────────────���──────────────────────────────────────
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
        return;
      }
      const lines = (orders as any[]).map((o, i) => {
        const c = o.coupons;
        const n = c ? (c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon") : "?";
        const emoji = o.status === "paid" ? "✅" : "⏳";
        return `${emoji} ${i+1}. <b>${escapeHtml(o.buyer_name||"Client")}</b> — ${n} — ${o.amount_fcfa.toLocaleString("fr-FR")} F\n   Réf: <code>${o.id.slice(0,8).toUpperCase()}</code>`;
      });
      await sendMessage(chatId, [`📋 <b>Commandes récentes (${orders.length})</b>`, "", ...lines].join("\n"));
      return;
    }

    // ── /confirmer {order_id} (admin) ─────────────────────────────────────────
    if (update.message?.text?.startsWith("/confirmer")) {
      const chatId = update.message.chat.id;
      const orderId = update.message.text.split(" ")[1]?.trim();
      if (!orderId) { await sendMessage(chatId, "Usage : <code>/confirmer {order_id}</code>\nVoir les IDs avec /ordres"); return; }
      const result = await confirmBotOrder(supabase, orderId);
      if (!result) { await sendMessage(chatId, "❌ Commande introuvable ou déjà traitée."); return; }
      await deliverCode(result.buyerChatId, result.couponCode, result.platform, result.amount);
      await sendMessage(chatId, `✅ Code <code>${result.couponCode}</code> livré au client ${result.buyerChatId}.`);
      return;
    }

    // ── /monlien — liens partageables du revendeur ──────────────────────────
    if (update.message?.text?.startsWith("/monlien") || update.message?.text?.startsWith("/mes_liens") || update.message?.text?.startsWith("/partager")) {
      const chatId = update.message.chat.id;
      const reseller = await getResellerProfile(supabase, chatId);
      if (!reseller) {
        await sendMessage(chatId, [
          `🔒 <b>Accès revendeur requis</b>`,
          ``,
          `Lie d'abord ton compte avec <code>/connect {uid}</code>`,
        ].join("\n"));
        return;
      }
      const BOT_USERNAME = "pack_officiel_expert_bot";
      const clientLink   = `https://t.me/${BOT_USERNAME}?start=c_${reseller.id}`;
      const revendeurLink = `https://t.me/${BOT_USERNAME}?start=r_${reseller.id}`;
      await sendMessage(chatId, [
        `🔗 <b>Tes liens de partage</b>`, ``,
        `💡 Clique sur un bouton pour ouvrir le <b>menu de partage natif</b> de ton téléphone et partager sur n'importe quelle appli (WhatsApp, TikTok, Instagram, Telegram, etc.).`,
        ``, `70% de commission sur chaque vente via ton lien client !`,
      ].join("\n"), {
        inline_keyboard: [
          [{ text: "🔗 Partager Lien Client",    web_app: { url: FUNCTION_URL+"?source=share&label="+encodeURIComponent("Partager Lien Client")+"&url="+encodeURIComponent(clientLink)+"&text="+encodeURIComponent("🎟 Rejoins-moi sur Betesim pour accéder aux coupons de pronostics ! "+clientLink) } }],
          [{ text: "🔗 Partager Lien Revendeur", web_app: { url: FUNCTION_URL+"?source=share&label="+encodeURIComponent("Partager Lien Revendeur")+"&url="+encodeURIComponent(revendeurLink)+"&text="+encodeURIComponent("💼 Deviens revendeur sur Betesim et gagne des commissions ! "+revendeurLink) } }],
          [{ text: "📊 Mon Dashboard", callback_data: "dashboard_home" }],
        ],
      });
      return;
    }

    // ── /start — smart deep-link handler ────────────────────────────────────
    if (update.message?.text?.startsWith("/start")) {
      const msg       = update.message;
      const chatId    = msg.chat.id;
      const tgUser    = msg.from;
      const firstName = tgUser?.first_name || "Partenaire";
      const username  = tgUser?.username || null;
      const tgUserId  = tgUser?.id;
      const param     = msg.text.split(" ")[1]?.trim() ?? "";
      await clearBotState(supabase, chatId); // Clear any stale awaiting_uid session

      // ── Lien client : ?start=c_RESELLERID ──────────────────────────────
      if (param.startsWith("c_")) {
        const rawId = param.slice(2);
        // rawId peut être un chatId numérique (nouveau) ou un UUID Supabase (ancien)
        let resolvedReferrerId: string | null = null;
        if (/^\d+$/.test(rawId)) {
          // Chercher le profil revendeur par telegram_chat_id
          const { data: refProfile } = await supabase
            .from("profiles").select("id").eq("telegram_chat_id", Number(rawId)).maybeSingle();
          resolvedReferrerId = (refProfile as any)?.id ?? null;
        } else {
          resolvedReferrerId = rawId || null;
        }
        const referrerId = resolvedReferrerId;
        // Crée automatiquement un partner_pack pour ce nouveau client
        const { data: newPack, error: packErr } = await supabase
          .from("partner_packs")
          .insert({
            telegram_user_id:    tgUserId,
            telegram_username:   username,
            telegram_first_name: firstName,
            bot_started_at:      new Date().toISOString(),
            referrer_id:         referrerId || null,
          })
          .select().maybeSingle();
        if (packErr || !newPack) {
          // Pack peut-être déjà existant — cherche-le
          const { data: existing } = await supabase
            .from("partner_packs")
            .select("*")
            .eq("telegram_user_id", tgUserId)
            .order("bot_started_at", { ascending: false })
            .limit(1).maybeSingle();
          if (existing?.software_unlocked_at) {
            const softUrl = await buildSoftwareUrl(supabase, existing.id);
            await sendHuman(chatId, unlockedMessage(firstName, true), {
              inline_keyboard: [
                [{ text:"📊 Ouvrir le Pack Officiel", web_app:{ url: softUrl } }],
                [{ text:"🎟 Voir les coupons disponibles", callback_data:"voir_pool" }],
              ],
            }, DELAY_SHORT);
            return;
          }
        }
        await sendMessage(chatId, welcomeMessage(firstName));
        await sendHuman(chatId, step1Message(), step1Keyboard, DELAY_LONG);
        return;
      }

      // ── Lien revendeur : ?start=r_RESELLERID ────────────────────────────
      if (param.startsWith("r_")) {
        const referrerId = param.slice(2);
        // Vérifie si ce TG user est déjà revendeur
        const existing = await getResellerProfile(supabase, chatId);
        if (existing) {
          await sendMessage(chatId, [
            `✅ <b>Ton compte revendeur est déjà actif, ${escapeHtml(firstName)} !</b>`,
            ``,
            `📊 Utilise /dashboard pour accéder à ton espace.`,
          ].join("\n"));
          return;
        }
        // Enregistre la demande d'inscription revendeur via bot_sessions
        await supabase.from("bot_sessions").upsert({
          telegram_chat_id: chatId,
          state: "pending_reseller",
          data: { referrer_id: referrerId, first_name: firstName, username, tg_user_id: tgUserId },
          updated_at: new Date().toISOString(),
        });
        // Auto-créer le profil revendeur directement dans le bot (pas besoin du site)
        const { data: newProfile } = await supabase.from("profiles").insert({
          id:               `tg_${chatId}`,
          full_name:        firstName,
          is_partner:       true,
          telegram_chat_id: chatId,
          created_at:       new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        }).select("id").maybeSingle();
        const profileId = (newProfile as any)?.id;
        // Lier le parrain si valide
        if (referrerId && profileId) {
          let resolvedRef: string | null = null;
          if (/^\d+$/.test(referrerId)) {
            const { data: rp } = await supabase.from("profiles").select("id").eq("telegram_chat_id", Number(referrerId)).maybeSingle();
            resolvedRef = (rp as any)?.id ?? null;
          } else {
            resolvedRef = referrerId;
          }
          if (resolvedRef) {
            await supabase.from("profiles").update({ referrer_id: resolvedRef } as any).eq("id", profileId);
          }
        }
        const BOT_UN = Deno.env.get("BOT_USERNAME") || "pack_officiel_expert_bot";
        const clientLink   = `https://t.me/${BOT_UN}?start=c_${chatId}`;
        const revendeurLink = `https://t.me/${BOT_UN}?start=r_${chatId}`;
        const _shareWelcome = (lnk: string, txt: string) =>
          `https://t.me/share/url?url=${encodeURIComponent(lnk)}&text=${encodeURIComponent(txt)}`;
        await sendMessage(chatId, [
          `🎉 <b>Bienvenue ${escapeHtml(firstName)} — Compte Revendeur créé !</b>`,
          ``,
          `✅ Tu es maintenant revendeur sur Pack Officiel.`,
          `Utilise les boutons ci-dessous pour partager tes liens et accéder à ton espace.`,
        ].join("\n"), {
          inline_keyboard: [
            [{ text: "📋 Mon Dashboard", callback_data: "dashboard_home" }],
            [{ text: "🔗 Partager Lien Client",    url: _shareWelcome(clientLink,   "🎟 Rejoins-moi sur Betesim pour des coupons de pronostics ! "+clientLink) }],
            [{ text: "🔗 Partager Lien Revendeur", url: _shareWelcome(revendeurLink, "💼 Deviens revendeur Betesim et gagne des commissions ! "+revendeurLink) }],
          ],
        });
        return;
      }

      // ── Pas de paramètre : accueil général ──────────────────────────────
      if (!param) {
        const pUrl = await pronosticsUrl(supabase);
        await sendMessage(chatId, [
          `👋 <b>Bienvenue ${escapeHtml(firstName)} sur Pack Officiel !</b>`,
          ``,
          `🎯 Touche le bouton ci-dessous pour démarrer.`,
        ].join("\n"), {
          inline_keyboard: [[{ text:"➕ Ajouter un coupon", callback_data:"pronostics_menu" }], [{ text:"🎟 Voir les coupons disponibles", callback_data:"voir_pool" }]],
        });
        return;
      }

      // ── Ancien format : pack_id direct (rétrocompatible) ────────────────
      const { data: pack, error } = await supabase
        .from("partner_packs")
        .update({ telegram_user_id: tgUserId, telegram_username: username,
          telegram_first_name: firstName, bot_started_at: new Date().toISOString() })
        .eq("id", param).select().maybeSingle();

      if (error || !pack) {
        await sendMessage(chatId, `❌ Lien invalide. Contactez le support.`);
        return;
      }

      if (pack.software_unlocked_at) {
        const softUrl = await buildSoftwareUrl(supabase, pack.id);
        await sendHuman(chatId, unlockedMessage(firstName, true), {
          inline_keyboard: [
            [{ text:"📊 Ouvrir le Pack Officiel", web_app:{ url: softUrl } }],
            [{ text:"🎟 Voir les coupons disponibles", callback_data:"voir_pool" }],
          ],
        }, DELAY_SHORT);
        return;
      }

      await sendMessage(chatId, welcomeMessage(firstName));
      await sendHuman(chatId, step1Message(), step1Keyboard, DELAY_LONG);
      return;
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

      // ── Onboarding callbacks (need partner_pack) ──────────────────────────
      if (data === "done_2fa") {
        const pack = await getPackByTgUser(supabase, tgUserId);
        if (!pack) { await answerCallback(cb.id, "Session expirée — tape /start"); return; }
        await supabase.from("partner_packs").update({
          secured_2fa_at: new Date().toISOString(),
          telegram_username: username ?? pack.telegram_username,
          telegram_first_name: firstName ?? pack.telegram_first_name,
        }).eq("id", pack.id);
        await answerCallback(cb.id, "✅ 2FA confirmée");
        await editMessage(chatId, messageId, `✅ <b>2FA activée — bravo !</b>`);
        await sendHuman(chatId, step2Infos(firstName, username ?? pack.telegram_username ?? null),
          step2Keyboard(!!(username ?? pack.telegram_username)), DELAY_LONG);
        return;
      }

      if (data === "recheck_username") {
        const pack = await getPackByTgUser(supabase, tgUserId);
        if (!pack) { await answerCallback(cb.id, "Session expirée — tape /start"); return; }
        const uname = username ?? null;
        if (!uname) {
          await answerCallback(cb.id, "Toujours pas d'@username…");
          await sendHuman(chatId, `🤔 Je ne vois toujours pas d'@username.\n\nVa dans <b>Réglages → Modifier le profil → Nom d'utilisateur</b> puis réessaie.`,
            step2Keyboard(false), DELAY_SHORT);
          return;
        }
        await supabase.from("partner_packs").update({ telegram_username: uname }).eq("id", pack.id);
        await answerCallback(cb.id, "✅ Username détecté !");
        await sendHuman(chatId, step2Infos(firstName, uname), step2Keyboard(true), DELAY_SHORT);
        return;
      }

      if (data === "goto_1win") {
        const pack = await getPackByTgUser(supabase, tgUserId);
        if (!pack) { await answerCallback(cb.id, "Session expirée — tape /start"); return; }
        const uname = username ?? pack.telegram_username ?? null;
        if (!uname) { await answerCallback(cb.id, "Crée d'abord ton @username"); return; }
        const partnerLink = await getPartnerLink(supabase);
        await answerCallback(cb.id);
        await sendHuman(chatId, step3Message(uname, partnerLink), step3Keyboard(partnerLink), DELAY_LONG);
        return;
      }

      if (data === "done_1win") {
        const pack = await getPackByTgUser(supabase, tgUserId);
        if (!pack) { await answerCallback(cb.id, "Session expirée — tape /start"); return; }
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
        return;
      }


      // ── Espace Pronostiqueur ─────────────────────────────────────────────────
      if (data === "pro_home" || data === "pro_analyses" || data === "pro_resellers" || data === "pro_clients" || data === "pro_wallet") {
        const pro = await getPronostiqueurProfile(supabase, chatId);
        await answerCallback(cb.id);
        if (!pro) {
          await answerCallback(cb.id);
          await sendMessage(chatId, [
            `🏆 <b>Espace Pronostiqueur</b>`,
            ``,
            `❌ Tu n'as pas encore accès à l'espace pronostiqueur.`,
            ``,
            `Contacte l'administrateur pour obtenir les droits pronostiqueur.`,
          ].join("\n"));
          return;
        }

        const proKbBottom = {
          inline_keyboard: [
            [{ text: "📊 Mes analyses", callback_data: "pro_analyses" }, { text: "👥 Revendeurs actifs", callback_data: "pro_resellers" }],
            [{ text: "🛒 Clients acheteurs", callback_data: "pro_clients" }, { text: "💰 Mon sous-wallet", callback_data: "pro_wallet" }],
          ],
        };

        // ── pro_wallet ──────────────────────────────────────────────────────
        if (data === "pro_wallet") {
          const [wallet, { data: records }] = await Promise.all([
            getPronostiqueurWallet(supabase, pro.id),
            supabase.from("commission_records")
              .select("net_amount, created_at, coupon_id")
              .eq("partner_id", pro.id)
              .eq("type", "pronostiqueur_share")
              .order("created_at", { ascending: false })
              .limit(8),
          ]);
          const lines = (records ?? []).map((r: any) => {
            const date = new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
            return `  • ${date} — <b>+${(r.net_amount || 0).toLocaleString("fr-FR")} FCFA</b>`;
          });
          await sendMessage(chatId, [
            `💰 <b>Sous-Wallet Pronostiqueur</b>`,
            `👤 ${escapeHtml(pro.full_name || "Pronostiqueur")}`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `💵 Total gagné : <b>${wallet.total.toLocaleString("fr-FR")} FCFA</b>`,
            `📦 Ventes liées : <b>${wallet.count}</b>`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            lines.length ? `\n📋 <b>Derniers gains :</b>\n${lines.join("\n")}` : `\n<i>Aucun gain enregistré pour l'instant.</i>`,
            ``,
            `<i>💡 Tu touches 10% de chaque coupon vendu basé sur tes analyses.</i>`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "◀ Retour dashboard", callback_data: "pro_home" }],
            ],
          });
          return;
        }

        // ── pro_analyses ────────────────────────────────────────────────────
        if (data === "pro_analyses") {
          const stats = await getPronostiqueurStats(supabase, pro.id);
          const recentLines = stats.allA.slice(0, 8).map((a: any) => {
            const emoji = a.result === "gagné" ? "✅" : a.result === "perdu" ? "❌" : a.result === "en_attente" ? "⏳" : "➖";
            const date = a.match_date ? new Date(a.match_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—";
            return `${emoji} <b>${escapeHtml(a.team_home)} vs ${escapeHtml(a.team_away)}</b> (${date})`;
          });
          await sendMessage(chatId, [
            `📊 <b>Mes Analyses</b>`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 Publiées : <b>${stats.published}</b>`,
            `✅ Gagnées  : <b>${stats.won}</b>   ❌ Perdues : <b>${stats.lost}</b>   ⏳ En attente : <b>${stats.pending}</b>`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            recentLines.length ? `\n<b>Dernières analyses :</b>\n${recentLines.join("\n")}` : `\n<i>Aucune analyse publiée pour l'instant.</i>`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "👥 Revendeurs actifs", callback_data: "pro_resellers" }, { text: "🛒 Clients acheteurs", callback_data: "pro_clients" }],
              [{ text: "◀ Retour dashboard", callback_data: "pro_home" }],
            ],
          });
          return;
        }

        // ── pro_resellers ───────��───────────────────────────────────────────
        if (data === "pro_resellers") {
          const stats = await getPronostiqueurStats(supabase, pro.id);
          const lines = stats.resellers.slice(0, 10).map((r: any, i: number) => {
            const count = stats.soldCoupons.filter((c: any) => c.creator_id === r.id).length;
            return `${i + 1}. <b>${escapeHtml(r.name)}</b> — ${count} vente${count > 1 ? "s" : ""}`;
          });
          await sendMessage(chatId, [
            `👥 <b>Revendeurs actifs sur tes analyses</b>`,
            ``,
            `<b>${stats.resellers.length}</b> revendeur${stats.resellers.length > 1 ? "s" : ""} ont créé des coupons depuis tes analyses.`,
            ``,
            lines.length ? lines.join("\n") : `<i>Aucun revendeur encore.</i>`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "🛒 Clients acheteurs", callback_data: "pro_clients" }, { text: "◀ Retour", callback_data: "pro_home" }],
            ],
          });
          return;
        }

        // ── pro_clients ─────────────────────────────────────────────────────
        if (data === "pro_clients") {
          const stats = await getPronostiqueurStats(supabase, pro.id);
          const totalRevenu = stats.soldCoupons.reduce((s: number, c: any) => s + (c.price_fcfa || 0), 0);
          const lines = stats.soldCoupons.slice(0, 10).map((c: any) => {
            const date = c.sold_at ? new Date(c.sold_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—";
            const buyer = (c.buyer as any)?.full_name || "Client anonyme";
            return `• ${date} — <b>${escapeHtml(buyer)}</b> — ${(c.price_fcfa || 0).toLocaleString("fr-FR")} FCFA`;
          });
          await sendMessage(chatId, [
            `🛒 <b>Clients ayant acheté tes coupons</b>`,
            ``,
            `💰 Revenu total généré : <b>${totalRevenu.toLocaleString("fr-FR")} FCFA</b>`,
            `📦 Ventes : <b>${stats.soldCoupons.length}</b>`,
            ``,
            lines.length ? lines.join("\n") : `<i>Aucun achat pour l'instant.</i>`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "💰 Mon sous-wallet", callback_data: "pro_wallet" }, { text: "◀ Retour", callback_data: "pro_home" }],
            ],
          });
          return;
        }

        // ── pro_home (default) ─────────────────���────────────────────────────
        const [wallet, stats] = await Promise.all([
          getPronostiqueurWallet(supabase, pro.id),
          getPronostiqueurStats(supabase, pro.id),
        ]);
        const winRate = stats.won + stats.lost > 0
          ? Math.round((stats.won / (stats.won + stats.lost)) * 100) : null;
        await sendHuman(chatId, [
          `🏆 <b>Espace Pronostiqueur</b>`,
          `👤 ${escapeHtml(pro.full_name || "Pronostiqueur")}`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `📊 Analyses publiées : <b>${stats.published}</b>`,
          winRate !== null ? `🎯 Taux de réussite : <b>${winRate}%</b>` : `🎯 Taux de réussite : <b>—</b>`,
          `👥 Revendeurs actifs : <b>${stats.resellers.length}</b>`,
          `🛒 Ventes générées : <b>${stats.soldCoupons.length}</b>`,
          `💰 Sous-wallet : <b>${wallet.total.toLocaleString("fr-FR")} FCFA</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ].join("\n"), proKbBottom, DELAY_SHORT);
        return;
      }

      // ── Dashboard home ────────────────────────────────────────────────────
      if (data === "dashboard_home" || data === "wallet_detail" || data === "show_analyses" || data === "my_coupons") {
        let reseller = await getResellerProfile(supabase, chatId);
        await answerCallback(cb.id);
        if (!reseller) {
          // Auto-créer le profil revendeur directement depuis le bot
          const firstName2 = cb.from?.first_name || "Revendeur";
          await supabase.from("profiles").insert({
            id:               `tg_${chatId}`,
            full_name:        firstName2,
            is_partner:       true,
            telegram_chat_id: chatId,
            created_at:       new Date().toISOString(),
            updated_at:       new Date().toISOString(),
          });
          // Re-charger le profil fraîchement créé
          const { data: freshProfile } = await supabase
            .from("profiles").select("id, full_name, is_partner, is_admin, email")
            .eq("telegram_chat_id", chatId).maybeSingle();
          if (!freshProfile) {
            await sendMessage(chatId, "❌ Impossible de créer ton profil. Contacte l'administrateur.");
            return;
          }
          // Continuer avec le profil créé (re-assign reseller)
          reseller = freshProfile;
        }

        if (data === "wallet_detail") {
          const { data: records } = await supabase
            .from("commission_records")
            .select("net_amount, type, description, created_at")
            .eq("partner_id", reseller.id)
            .order("created_at", { ascending: false })
            .limit(10);
          const total = (records ?? []).reduce((s: number, r: any) => s + r.net_amount, 0);
          const lines = (records ?? []).slice(0, 8).map((r: any) => {
            const date = new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
            return `  💸 <b>+${r.net_amount.toLocaleString("fr-FR")} F</b> — ${escapeHtml(r.description || r.type)} <i>(${date})</i>`;
          });
          await sendMessage(chatId, [`💰 <b>Wallet</b> — Total : <b>${total.toLocaleString("fr-FR")} FCFA</b>`, "", ...(lines.length ? lines : ["<i>Aucune commission pour l'instant.</i>"])].join("\n"), {
            inline_keyboard: [[{ text: "◀ Dashboard", callback_data: "dashboard_home" }]],
          });
          return;
        }

        if (data === "show_analyses") {
          // Redirect to native competition list (same as pronostics_menu)
          await sendCompetitionList(chatId, supabase);
          return;
        }

        if (data === "prompt_search") {
          await answerCallback(update.callback_query!.id);
          await sendMessage(chatId,
            "🔍 <b>Recherche d'analyses</b>\n\nTape ta recherche :\n<code>/rechercher Bayern</code>\n<code>/rechercher CAN</code>\n<code>/rechercher Champions League</code>\n<code>/rechercher France</code>\n\nTu peux chercher par équipe, compétition ou pays.",
            { inline_keyboard: [[{ text: "➕ Ajouter un coupon",   callback_data: "pronostics_menu" }, { text: "◀ Dashboard", callback_data: "dashboard_home" }]] }
          );
          return;
        }

        if (data === "my_coupons") {
          const { data: coupons } = await supabase
            .from("coupons")
            .select("id, label, price_fcfa, status, platform, sold_at, analyses:analysis_id(team_home, team_away)")
            .eq("creator_id", reseller.id)
            .order("created_at", { ascending: false })
            .limit(10);
          if (!coupons?.length) {
            await sendMessage(chatId, "📭 <b>Aucun coupon publié pour l'instant.</b>\n\nTape /analyses pour voir les analyses disponibles.", { inline_keyboard: [[{ text: "◀ Dashboard", callback_data: "dashboard_home" }]] });
            return;
          }
          const lines = (coupons as any[]).map((c, i) => {
            const name = c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon";
            const statusIcon = c.status === "sold" ? "✅" : c.status === "active" ? "🟢" : "⚫";
            return `${statusIcon} ${i + 1}. <b>${escapeHtml(name)}</b> — ${c.price_fcfa?.toLocaleString("fr-FR")} F`;
          });
          await sendMessage(chatId, [`🎟 <b>Mes coupons (${coupons.length})</b>`, "", ...lines].join("\n"), {
            inline_keyboard: [[{ text: "◀ Dashboard", callback_data: "dashboard_home" }]],
          });
          return;
        }

        // dashboard_home — affiche wallet + liens de partage
        const BOT_UNAME = Deno.env.get("BOT_USERNAME") || "pack_officiel_expert_bot";
        const clientLink    = `https://t.me/${BOT_UNAME}?start=c_${chatId}`;
        const revendeurLink = `https://t.me/${BOT_UNAME}?start=r_${chatId}`;
        const [wallet, analyses, { data: coupons }] = await Promise.all([
          getWalletBalance(supabase, (reseller as any).id),
          getPendingAnalyses(supabase, (reseller as any).id),
          supabase.from("coupons").select("id, status").eq("creator_id", (reseller as any).id),
        ]);
        const active = (coupons ?? []).filter((c: any) => c.status === "active").length;
        const sold   = (coupons ?? []).filter((c: any) => c.status === "sold").length;
        const _bu_dash  = "pack_officiel_expert_bot";
        const _cL_dash  = `https://t.me/${_bu_dash}?start=c_${chatId}`;
        const _rL_dash  = `https://t.me/${_bu_dash}?start=r_${chatId}`;
        const _shareUrl = (lnk: string, txt: string) =>
          `https://t.me/share/url?url=${encodeURIComponent(lnk)}&text=${encodeURIComponent(txt)}`;
        await sendMessage(chatId, [
          `📊 <b>Dashboard Revendeur</b>`,
          `👤 ${escapeHtml((reseller as any).full_name || "Revendeur")}`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `💰 Wallet : <b>${wallet.total.toLocaleString("fr-FR")} FCFA</b> (${wallet.count} vente${wallet.count > 1 ? "s" : ""})`,
          `🎟 Actifs : <b>${active}</b> · Vendus : <b>${sold}</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          analyses.length > 0 ? `🔔 <b>${analyses.length} analyse${analyses.length > 1 ? "s" : ""} en attente !</b>` : `✅ Toutes les analyses traitées.`,
        ].join("\n"), {
          inline_keyboard: [
            [{ text: "💰 Mon Wallet", callback_data: "wallet_detail" }],
            [{ text: "🎫 Mes coupons",             callback_data: "my_coupons" }],
            [{ text: "🔗 Partager mes liens",       callback_data: "share_links" }],
            [{ text: "🔙 Retour",                   callback_data: "main_menu" }],
          ],
        });
        return;
      }

      // ── Wizard : créer coupon depuis analyse ───────��──────────────────────
      if (data.startsWith("create_coupon_")) {
        const analysisId = data.replace("create_coupon_", "");
        const reseller = await getResellerProfile(supabase, chatId);
        await answerCallback(cb.id);
        if (!reseller) { await sendMessage(chatId, "🔒 Lie d'abord ton compte : /connect {uid}"); return; }
        const { data: analysis } = await supabase.from("analyses")
          .select("id, team_home, team_away, league, result, confidence_pct, platform_suggestion")
          .eq("id", analysisId).maybeSingle();
        if (!analysis) { await sendMessage(chatId, "❌ Analyse introuvable."); return; }
        await setBotState(supabase, chatId, "awaiting_platform", { analysis_id: analysisId, reseller_id: reseller.id });
        const plat = (analysis as any).platform_suggestion?.toUpperCase() || null;
        await sendMessage(chatId, [
          `➕ <b>Créer un coupon</b>`,
          `📊 <b>${escapeHtml((analysis as any).team_home)} vs ${escapeHtml((analysis as any).team_away)}</b>`,
          `🎯 Pronostic : ${(analysis as any).result || "?"}  — Confiance : ${(analysis as any).confidence_pct || "?"}%`, ``,
          `Sur quelle plateforme as-tu créé ton coupon ?`,
        ].join("\n"), {
          inline_keyboard: [
            [{ text: "1️⃣ 1xBet", callback_data: `plat_1xbet_${analysisId}` }, { text: "2️⃣ 1Win", callback_data: `plat_1win_${analysisId}` }],
            [{ text: "❌ Annuler", callback_data: "pronostics_menu" }],
          ],
        });
        return;
      }

      if (data.startsWith("plat_1xbet_") || data.startsWith("plat_1win_")) {
        const platform = data.startsWith("plat_1xbet_") ? "1xbet" : "1win";
        const analysisId = data.replace(/^plat_(1xbet|1win)_/, "");
        const reseller = await getResellerProfile(supabase, chatId);
        await answerCallback(cb.id);
        if (!reseller) { await sendMessage(chatId, "🔒 Lie d'abord ton compte : /connect {uid}"); return; }
        await setBotState(supabase, chatId, "awaiting_booking_code", {
          analysis_id: analysisId, platform, reseller_id: reseller.id
        });
        await sendMessage(chatId, [
          `✅ Plateforme : <b>${platform.toUpperCase()}</b>`, ``,
          `Maintenant, <b>entre ton code booking</b> ${platform.toUpperCase()} :`,
          `<i>(ex: ABC123456 — copie-colle depuis l'appli)</i>`,
        ].join("\n"), {
          inline_keyboard: [[{ text: "❌ Annuler", callback_data: "pronostics_menu" }]],
        });
        return;
      }


      // ── Voir catalogue ────────────────────────────────────────────────────
      // ── Publication wizard callbacks ──────────────────────────────────────────
      if (data === "start_pub") {
        await answerCallback(cb.id);
        await clearBotState(supabase, chatId);
        await setBotState(supabase, chatId, "pub_step_code", {});
        await sendHuman(chatId, [
          `🎫 <b>Publier un coupon</b>`, ``,
          `<b>Étape 1/4 — Code</b>`, ``,
          `Entre ton code coupon (1xBet / 1Win) :`,
          `<i>Exemple : ABC123456</i>`,
        ].join("\n"), {
          inline_keyboard: [[{ text: "❌ Annuler", callback_data: "dashboard_home" }]],
        }, DELAY_SHORT);
        return;
      }

      // pub_start_N (legacy) → redirect to new 4-step form
      if (data.startsWith("pub_start_")) {
        await answerCallback(cb.id);
        await clearBotState(supabase, chatId);
        await setBotState(supabase, chatId, "pub_step_code", {});
        await sendHuman(chatId, [
          `🎫 <b>Publier un coupon</b>`, ``,
          `<b>Étape 1/4 — Code</b>`, ``,
          `Entre ton code coupon (1xBet / 1Win) :`,
          `<i>Exemple : ABC123456</i>`,
        ].join("\n"), {
          inline_keyboard: [[{ text: "❌ Annuler", callback_data: "dashboard_home" }]],
        }, DELAY_SHORT);
        return;
      }

      if (data === "pub_confirm") {
        const sess = await getBotState(supabase, chatId);
        await answerCallback(cb.id, sess?.state === "pub_confirm" ? "⏳ Publication en cours…" : "Session expirée");
        if (sess?.state !== "pub_confirm") {
          await sendMessage(chatId, "❌ Session expirée. Recommence avec /publier");
          return;
        }
        const { codes, odds, price, match_start } = sess.data as { codes: string[]; odds: number; price: number; match_start: string };
        let reseller = await getResellerProfile(supabase, chatId);
        if (!reseller) {
          const fn2 = cb.from?.first_name || "Revendeur";
          await supabase.from("profiles").insert({ id: `tg_${chatId}`, full_name: fn2, is_partner: true, telegram_chat_id: chatId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          const { data: fp } = await supabase.from("profiles").select("id,full_name,is_partner").eq("telegram_chat_id", chatId).maybeSingle();
          reseller = fp;
        }
        const { data: newCoupon, error: cpErr } = await supabase.from("coupons").insert({
          code:             codes[0],
          codes_json:       codes,
          total_odds:       odds,
          price_fcfa:       price,
          match_start_time: match_start,
          status:           "active",
          partner_id:       (reseller as any).id,
          creator_id:       (reseller as any).id,
          label:            `Coupon ${odds}x — ${codes.length} code${codes.length>1?"s":""}`,
        }).select("id").single();
        await clearBotState(supabase, chatId);
        if (cpErr || !newCoupon) {
          await sendMessage(chatId, `❌ Erreur publication.\n<code>${cpErr?.message || "unknown"}</code>`);
          return;
        }
        const BOT_UNAME  = "pack_officiel_expert_bot";
        const clientLink = `https://t.me/${BOT_UNAME}?start=c_${chatId}`;
        const matchHour  = new Date(match_start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });
        const shareMsg   = `🎟 Coupon de pronostics disponible !\n📊 Cote: ${odds} | 💰 ${price.toLocaleString("fr-FR")} FCFA\n⏰ Matchs à ${matchHour}\nAchète maintenant: ${clientLink}`;
        const _resellerLink = `https://t.me/pack_officiel_expert_bot?start=r_${chatId}`;
        const _mkSh2 = (label: string, lnk: string, txt: string) =>
          ({ text: label, web_app: { url: FUNCTION_URL+"?source=share&label="+encodeURIComponent(label)+"&url="+encodeURIComponent(lnk)+"&text="+encodeURIComponent(txt) } });
        await sendHuman(chatId, [`✅ <b>Coupon publié dans le Pool !</b>`,``,`🎟 Code${codes.length>1?"s":""} : <code>${maskCodes(codes)}</code>`,`📊 Cote : <b>${odds}</b> · 💰 Prix : <b>${price.toLocaleString("fr-FR")} FCFA</b>`,`⏰ Expire à : <b>${matchHour}</b>`,``,`💡 Partage ton lien client pour que tes clients achètent ce coupon.`].join("\n"), {
          inline_keyboard: [
            [_mkSh2("🔗 Partager Lien Client",    clientLink,    `🎟 Coupon de pronostics disponible ! Cote ${odds} · ${price.toLocaleString("fr-FR")} FCFA. Achète ici : ${clientLink}`)],
            [_mkSh2("🔗 Partager Lien Revendeur", _resellerLink, `💼 Rejoins mon équipe Betesim et gagne des commissions ! ${_resellerLink}`)],
            [{ text: "📊 Mon Dashboard", callback_data: "dashboard_home" }],
            [{ text: "➕ Publier un autre coupon", callback_data: "start_pub" }],
          ],
        }, DELAY_SHORT);
        return;
      }

      // ── Share links (native inline — no web redirect) ─────────────────────
      if (data === "share_links") {
        await answerCallback(cb.id);
        const _botUn   = Deno.env.get("BOT_USERNAME") || "pack_officiel_expert_bot";
        const cLink    = `https://t.me/${_botUn}?start=c_${chatId}`;
        const rLink    = `https://t.me/${_botUn}?start=r_${chatId}`;
        const shareMsg = [
          "\u{1F517} <b>Partager mes liens</b>", "",
          "\u{1F447} Voici tes liens \u00E0 partager :", "",
          "\u{1F3DF} <b>Lien Client :</b>", cLink, "",
          "\u{1F4BC} <b>Lien Revendeur :</b>", rLink,
        ].join("\n");
        await sendHuman(chatId, shareMsg, {
          inline_keyboard: [
            [{ text: "\u{1F4E4} Partager lien client",    url: "https://t.me/share/url?url=" + encodeURIComponent(cLink) + "&text=" + encodeURIComponent("\u{1F3DF} Rejoins-moi sur Betesim ! " + cLink) }],
            [{ text: "\u{1F4E4} Partager lien revendeur", url: "https://t.me/share/url?url=" + encodeURIComponent(rLink) + "&text=" + encodeURIComponent("\u{1F4BC} Deviens revendeur Betesim ! " + rLink) }],
            [{ text: "\u{1F519} Retour dashboard", callback_data: "dashboard_home" }],
          ],
        }, DELAY_SHORT);
        return;
      }

      // ── Main menu (native — no web redirect) ─────────────────────────────────────
      if (data === "main_menu") {
        await answerCallback(cb.id);
        await sendHuman(chatId, "🏠 <b>Menu principal</b>\n\nChoisis une section :", {
          inline_keyboard: [
            [{ text: "➕ Ajouter un coupon", callback_data: "pronostics_menu" }],
            [{ text: "📋 Mon Dashboard",    callback_data: "dashboard_home" }],
          ],
        }, DELAY_SHORT);
        return;
      }


      if (data === "voir_pool" || data === "catalogue") {
        const coupons = await fetchPoolCoupons(supabase);
        await answerCallback(cb.id);
        await sendMessage(chatId, formatCatalog(coupons), coupons.length > 0 ? {
          inline_keyboard: coupons.map(c => [{
            text: `${couponDisplayName(c)} — ${c.price_fcfa.toLocaleString("fr-FR")} F`,
            callback_data: `acheter_${c.id}`,
          }]),
        } : undefined);
        return;
      }

      // ── Sélection coupon → formulaire paiement ─────────────────────��───────
      if (data.startsWith("acheter_")) {
        const couponId = data.replace("acheter_", "");
        const { data: coupon } = await supabase.from("coupons")
          .select("id, code, codes_json, label, price_fcfa, platform, total_odds, match_start_time, status, creator_id, analyses:analysis_id(team_home, team_away)")
          .eq("id", couponId).maybeSingle();
        await answerCallback(cb.id);
        if (!coupon || coupon.status !== "active") {
          await sendHuman(chatId, coupon ? "❌ Ce coupon n'est plus disponible. Tape /coupons pour voir les autres." : "❌ Coupon introuvable.", undefined, DELAY_SHORT);
          return;
        }
        const cName    = couponDisplayName(coupon as any);
        const plat     = (coupon as any).platform?.toUpperCase() || "1Win";
        const price    = (coupon as any).price_fcfa;
        const oddsVal  = (coupon as any).total_odds;
        const codesArr = (coupon as any).codes_json as string[] | null;
        const masked   = codesArr?.length ? maskCodes(codesArr) : partialCode((coupon as any).code);
        const codeCount = codesArr?.length || 1;
        const expireAt = (coupon as any).match_start_time
          ? new Date((coupon as any).match_start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" })
          : null;
        // Try FedaPay first
        const fedaUrl = await createFedaPayLink(price, `Coupon ${oddsVal || ""}x - ${cName}`, couponId, chatId, supabase);
        // Also create a bot_order for Mobile Money fallback
        const mobileNum = await getMobileMoneyNumber(supabase);
        const buyerName = cb.from.first_name || "Client";
        const orderId   = fedaUrl ? null : await createBotOrder(supabase, couponId, chatId, buyerName, price);
        const shortRef  = orderId ? orderId.slice(0, 8).toUpperCase() : null;
        const lines = [
          `🎟 <b>${escapeHtml(cName)}</b>`,``,
          `🔒 <b>Code${codeCount>1?"s":""} (masqué${codeCount>1?"s":""}) :</b>`,
          `<code>${masked}</code>`,
          `<i>(${codeCount} code${codeCount>1?"s":""} · code${codeCount>1?"s":""} complet${codeCount>1?"s":""} après paiement)</i>`,``,
          oddsVal ? `📊 Cote : <b>${oddsVal}</b>` : null,
          expireAt ? `⏰ Matchs à : <b>${expireAt}</b>` : null,
          `💰 Prix : <b>${price.toLocaleString("fr-FR")} FCFA</b>`,``,
        ].filter(l => l !== null).join("\n");
        const payButtons: any[][] = [];
        if (fedaUrl) {
          payButtons.push([{ text: `💳 Payer ${price.toLocaleString("fr-FR")} FCFA (FedaPay)`, url: fedaUrl }]);
          payButtons.push([{ text: "❌ Annuler", callback_data: "catalogue" }]);
        } else {
          payButtons.push([{ text: "✅ J'ai payé — Mobile Money", callback_data: `paie_${orderId}` }]);
          payButtons.push([{ text: "❌ Annuler", callback_data: "catalogue" }]);
        }
        await sendHuman(chatId, lines + (fedaUrl ? "👇 Clique pour payer et recevoir les codes automatiquement :" : [`📲 Paiement Mobile Money :`,`   Numéro : <code>${mobileNum}</code>`,`   Montant : <code>${price} FCFA</code>`,shortRef ? `   Réf : <code>${shortRef}</code>` : ""].join("\n")), {
          inline_keyboard: payButtons,
        }, DELAY_LONG);
        return;
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
          return;
        }
        const c = (order as any).coupons;
        const name = c ? (c.analyses ? `${c.analyses.team_home} vs ${c.analyses.team_away}` : c.label || "Coupon") : "Coupon";
        await notifyAdmin(supabase, orderId, cb.from.first_name || "Client", chatId, name, (order as any).amount_fcfa);
        await sendHuman(chatId, [
          `⏳ <b>Paiement en cours de vérification</b>`, ``,
          `Notre équipe vérifie ton paiement. Tu recevras le code complet <b>dans les prochaines minutes</b>.`, ``,
          `📌 Réf : <code>${orderId.slice(0,8).toUpperCase()}</code>`,
        ].join("\n"), undefined, DELAY_SHORT);
        return;
      }

      // ── Admin confirme paiement ────────────────────────────────────────────
      if (data.startsWith("confirm_")) {
        const orderId = data.replace("confirm_", "");
        await answerCallback(cb.id);
        const result = await confirmBotOrder(supabase, orderId);
        if (!result) {
          await editMessage(chatId, messageId, "⚠️ Commande introuvable ou déjà traitée.");
          return;
        }
        await deliverCode(result.buyerChatId, result.couponCode, result.platform, result.amount);
        await editMessage(chatId, messageId, `✅ <b>Confirmé !</b>\nCode <code>${result.couponCode}</code> livré au client.`);
        return;
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
        return;
      }

      // ── PRONOSTICS TOUT-EN-UN callbacks ─────────────────────────────────────
      if (data === "pronostics_menu" || data === "analyses_menu") {
        await answerCallback(cb.id);
        await sendCompetitionList(chatId, supabase);
        return;
      }

      if (data.startsWith("comp:")) {
        const leagueId = data.slice(5); // ID TheSportsDB numérique
        await answerCallback(cb.id);
        await sendMatchesList(chatId, leagueId, supabase);
        return;
      }

      if (data.startsWith("mat:")) {
        const analysisId = data.slice(4);
        await answerCallback(cb.id);
        await sendMatchAnalysis(chatId, analysisId, supabase);
        return;
      }

      // Sélection de marché → analyse sophistiquée
      if (data.startsWith("mkt:")) {
        // Format: mkt:{uuid}:{market}
        const parts    = data.slice(4).split(":");
        const market   = parts.pop() as Market;
        const analysisId = parts.join(":");
        await answerCallback(cb.id);
        await sendMarketAnalysis(chatId, analysisId, market, supabase);
        return;
      }

      // Recherche par texte libre
      if (data === "search_match") {
        await answerCallback(cb.id);
        await setBotState(supabase, chatId, "awaiting_search", {});
        await sendMessage(chatId, [
          `🔍 <b>Recherche de match</b>`,``,
          `Tape le nom d'une équipe ou d'une compétition :`,
          `<i>Exemple : PSG · Barcelona · Ligue 1 · Premier League</i>`,
        ].join("\n"), {
          inline_keyboard: [[{ text: "❌ Annuler", callback_data: "pronostics_menu" }]],
        });
        return;
      }

      if (data.startsWith("pub_coupon:")) {
        const eventId = data.slice(11);
        await answerCallback(cb.id);

        // Récupérer le nom du match pour l'affichage
        let matchLabel = "Match sélectionné";
        const isUUIDev = eventId.includes("-");
        if (isUUIDev) {
          const { data: m } = await supabase.from("analyses")
            .select("team_home, team_away").eq("id", eventId).maybeSingle();
          if (m) matchLabel = `${(m as any).team_home} vs ${(m as any).team_away}`;
        } else {
          const ev = await fetchEventById(eventId);
          if (ev) matchLabel = `${ev.strHomeTeam} vs ${ev.strAwayTeam}`;
        }

        // URL de la page web de saisie du coupon
        const base = await getBase(supabase);
        const webUrl = `${base}/publier-coupon?event_id=${encodeURIComponent(eventId)}&from_tg=1`;

        await sendMessage(chatId, [
          "📤 <b>Publier mon coupon</b>", "",
          `⚽ Match : <b>${escapeHtml(matchLabel)}</b>`, "",
          "Appuie sur le bouton ci-dessous pour saisir ton code coupon 1Win, ta cote et l'heure du match.", "",
          "💡 <b>Gains automatiques selon ta cote :</b>",
          "• Cote 1.00 – 5.50 → <b>250 FCFA</b>",
          "• Cote 5.51 – 16   → <b>500 FCFA</b>",
          "• Cote > 16        → <b>1 000 FCFA</b>", "",
          "💰 Crédité dès que tu soumets le formulaire !",
        ].join("\n"), {
          inline_keyboard: [
            [{ text: "📝 Saisir mon coupon 1Win", web_app: { url: webUrl } }],
            [{ text: "◀ Retour à l'analyse",       callback_data: `mat:${eventId}` }],
          ],
        });
        return;
      }

      if (data.startsWith("see_coupons:")) {
        const analysisId = data.slice(12);
        await answerCallback(cb.id);
        const { data: coupons } = await supabase
          .from("coupons_partages")
          .select("code_coupon, first_name, username, created_at")
          .eq("analysis_id", analysisId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (!coupons || coupons.length === 0) {
          await sendMessage(chatId, "📭 Aucun coupon partagé pour ce match encore.", {
            inline_keyboard: [[{ text: "📤 Publier le premier !", callback_data: `pub_coupon:${analysisId}` }]],
          });
          return;
        }
        const lines = (coupons as any[]).map((c, i) => {
          const who = c.username ? `@${c.username}` : escapeHtml(c.first_name || "Revendeur");
          return `${i + 1}. <code>${escapeHtml(c.code_coupon)}</code> — ${who}`;
        });
        await sendMessage(chatId, [
          `🎟 <b>Coupons partagés par la communauté</b>`,``,
          ...lines,``,
          `⚠️ <i>Codes partagés par les revendeurs. Vérifie avant utilisation.</i>`,
        ].join("\n"), {
          inline_keyboard: [
            [{ text: "📤 Ajouter mon coupon", callback_data: `pub_coupon:${analysisId}` }],
            [{ text: "◀ Retour au match", callback_data: `mat:${analysisId}` }],
            [{ text: "🏠 Menu compétitions", callback_data: "pronostics_menu" }],
          ],
        });
        return;
      }

      await answerCallback(cb.id);
      return;
    }



    // ── Messages texte libres ────────────────────────────────────────────��
    // ── Messages vocaux / audio (transcription Whisper → Groq IA) ───────────
    if (update.message?.voice || update.message?.audio) {
      const chatId    = update.message!.chat.id;
      const tgUserId  = update.message!.from?.id ?? 0;
      const firstName = update.message!.from?.first_name || "ami";
      const fileId    = (update.message?.voice ?? update.message?.audio)?.file_id;

      await sendAction(chatId); // typing... immédiat

      if (!fileId) {
        await sendMessage(chatId, "Je n'ai pas pu lire ce fichier audio. Essaie d'envoyer un message vocal directement. 🎤");
        return;
      }

      const transcribed = await transcribeAudio(fileId);
      if (!transcribed) {
        await logBotEvent("warn", "voice_transcription_fail", chatId, "Whisper n'a pas pu transcrire le vocal", { fileId, tgUserId });
        await sendMessage(chatId, "Je n'ai pas bien compris ton message vocal. Parle un peu plus clairement ou envoie un message écrit. 😊");
        return;
      }

      await logBotEvent("info", "voice_transcription_ok", chatId, transcribed.slice(0, 300), { tgUserId });
      // Traitement exactement identique à un message texte — invisible pour l'utilisateur
      await handleFreeText(chatId, transcribed, firstName, tgUserId, supabase);
      return;
    }

        if (update.message?.text && !update.message.text.startsWith("/")) {
      const chatId    = update.message.chat.id;
      const tgUserId  = update.message.from?.id ?? 0;
      const firstName = update.message.from?.first_name || "ami";
      const rawText   = update.message.text.trim();

      // ── Intercepte l'état "awaiting_uid" pour auto-connecter le revendeur ──
      const session = await getBotState(supabase, chatId);
      if (session?.state === "awaiting_uid" || session?.state === "awaiting_uid_pro") {
        const isProRole = session.state === "awaiting_uid_pro";
        const uid = rawText.replace(/[^a-f0-9\-]/gi, "").slice(0, 36);
        if (uid.length < 10) {
          // Text is clearly not a UID — user is chatting normally, clear the state
          await clearBotState(supabase, chatId);
          await handleFreeText(chatId, rawText, firstName, tgUserId, supabase);
          return;
        }
        const { data: profile, error } = await supabase
          .from("profiles").select("id, full_name, is_partner, is_admin").eq("id", uid).maybeSingle();
        if (!profile) {
          await sendMessage(chatId, "❌ UID introuvable. Vérifie bien le code copié depuis le site.");
          return;
        }
        if (isProRole && !profile.is_admin) {
          await sendMessage(chatId, "❌ Ce compte n'a pas les droits pronostiqueur. Contacte l'administrateur.");
          return;
        }
        if (!isProRole && !profile.is_partner && !profile.is_admin) {
          await sendMessage(chatId, "❌ Ce compte n'a pas les droits revendeur. Contacte l'administrateur.");
          return;
        }
        await supabase.from("profiles").update({ telegram_chat_id: chatId }).eq("id", uid);
        await clearBotState(supabase, chatId);
        const defaultTarget = isProRole ? "pro_home" : "dashboard_home";
        const target = (session.data as any)?.target ?? defaultTarget;
        await sendMessage(chatId, [
          `✅ <b>Compte lié avec succès !</b>`,
          `Bienvenue, <b>${escapeHtml(profile.full_name || "Revendeur")}</b> !`,
          ``,
          `Chargement de ton dashboard...`,
        ].join("\n"));
        // Rediriger vers le dashboard
        const [wallet, analyses, { data: coupons }] = await Promise.all([
          getWalletBalance(supabase, profile.id),
          getPendingAnalyses(supabase, profile.id),
          supabase.from("coupons").select("id, status").eq("creator_id", profile.id),
        ]);
        const active = (coupons ?? []).filter((c: any) => c.status === "active").length;
        const sold   = (coupons ?? []).filter((c: any) => c.status === "sold").length;
        await sendHuman(chatId, [
          `📊 <b>Dashboard Revendeur</b>`,
          `👤 ${escapeHtml(profile.full_name || "Revendeur")}`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `💰 Wallet : <b>${wallet.total.toLocaleString("fr-FR")} FCFA</b> (${wallet.count} vente${wallet.count > 1 ? "s" : ""})`,
          `🎟 Actifs : <b>${active}</b> · Vendus : <b>${sold}</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          analyses.length > 0 ? `🔔 <b>${analyses.length} analyse${analyses.length > 1 ? "s" : ""} en attente !</b>` : `✅ Toutes les analyses traitées.`,
        ].join("\n"), {
          inline_keyboard: (() => {
            const _bu3  = "pack_officiel_expert_bot";
            const _cL3  = `https://t.me/${_bu3}?start=c_${chatId}`;
            const _rL3  = `https://t.me/${_bu3}?start=r_${chatId}`;
            const _mk3  = (label: string, lnk: string, txt: string) =>
              ({ text: label, web_app: { url: FUNCTION_URL+"?source=share&label="+encodeURIComponent(label)+"&url="+encodeURIComponent(lnk)+"&text="+encodeURIComponent(txt) } });
            return [
              [{ text: "💰 Mon Wallet", callback_data: "wallet_detail" }],
              [{ text: "🎫 Mes coupons",             callback_data: "my_coupons" }],
              [{ text: "🔗 Partager mes liens",       callback_data: "share_links" }],
              [{ text: "🔙 Retour",                   callback_data: "main_menu" }],
            ];
          })(),
        }, DELAY_SHORT);
        return;
      }

      await handleFreeText(chatId, rawText, firstName, tgUserId, supabase);
      return;
    }

    return;
  } catch (err: any) {
    console.error("[telegram-bot] Erreur fatale non rattrapée:", {
      message: err?.message ?? String(err),
      stack: err?.stack?.slice(0, 800) ?? "(pas de stack)",
      time: new Date().toISOString(),
    });
    await logBotEvent("error", "fatal_error", null, err?.message ?? String(err), {
      stack: err?.stack?.slice(0, 500) ?? null,
      time: new Date().toISOString(),
    });
  }
  })();

  // Maintenir la fonction active jusqu'à la fin du traitement asynchrone
  EdgeRuntime.waitUntil(processing);
  return new Response("ok", { status: 200 });
});
