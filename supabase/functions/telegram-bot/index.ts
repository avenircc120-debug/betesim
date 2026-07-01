/**
 * Edge Function: telegram-bot — Livrauto v1
 * Plateforme multi-services : Acheteur · Grossiste · Revendeur · Vendeur · Livreur
 * Groq AI : guide les utilisateurs en langage naturel
 * FedaPay : paiements Mobile Money
 * Supabase : bot_sessions (réutilisé) + lv_* tables (Livrauto)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const TG_API    = "https://api.telegram.org";
const PLATFORM  = "Livrauto";
const MIN_WITHDRAWAL = 5000; // FCFA
const PLATFORM_FEE_PCT = 0.10; // 10%

// ─── Telegram helpers ─────────────────────────────────────────────────────────
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
    if (!json.ok) console.error(`tg(${method}) failed:`, JSON.stringify(json).slice(0,200));
    return json;
  } catch (e: any) {
    console.error(`tg(${method}) error:`, e?.message);
    return { ok: false };
  }
}

const sendMessage  = (chatId: number, text: string, keyboard?: unknown) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: keyboard });

const editMessage  = (chatId: number, messageId: number, text: string, keyboard?: unknown) =>
  tg("editMessageText", { chat_id: chatId, message_id: messageId, text,
    parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard });

const answerCallback = (id: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: id, text });

const sendAction   = (chatId: number) =>
  tg("sendChatAction", { chat_id: chatId, action: "typing" });

function escapeHtml(s: string) {
  return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─── Menu de navigation universel ────────────────────────────────────────────
const NAV_KEYBOARD = (chatId: number, extra: any[][] = []) => {
  const appUrl = Deno.env.get("APP_URL") || "https://betesim.vercel.app";
  return {
    inline_keyboard: [
      ...extra,
      [
        { text: "🏠 Accueil",    callback_data: "lv_home"      },
        { text: "📊 Dashboard",  callback_data: "lv_dashboard" },
      ],
      [
        { text: "💰 Mon Wallet", callback_data: "lv_wallet"    },
        { text: "📦 Boutiques",  callback_data: "lv_catalog"   },
      ],
      [
        { text: "🌐 Vitrine",    url: `${appUrl}/vitrine?chatId=${chatId}` },
      ],
    ],
  };
};

const sendWithMenu = (chatId: number, text: string, extra: any[][] = []) =>
  sendMessage(chatId, text, NAV_KEYBOARD(chatId, extra));

// ─── Groq IA — guide conversationnel ────────────────────────────────────────
const GROQ_SYSTEM = `Tu es l'assistant IA de ${PLATFORM}, plateforme de commerce et livraison en Afrique de l'Ouest (Bénin, Côte d'Ivoire, Sénégal…).
Tu aides SURTOUT les acheteurs à trouver des produits et finaliser leur achat.

Profils disponibles :
- 🛍️ Acheteur : parcourir le catalogue, ajouter au panier, payer via Mobile Money
- 💼 Grossiste : ajouter des produits, gérer les stocks, recruter des revendeurs
- 📦 Revendeur : choisir des produits d'un grossiste, fixer ses prix de revente
- 👤 Vendeur : partager un lien de parrainage, toucher des commissions
- 🚚 Livreur : recevoir des missions, confirmer les livraisons par scan QR

Règles :
1. Réponds en français ou dans la langue du message, 2-3 phrases max.
2. Si un CATALOGUE est fourni dans le contexte, utilise-le pour répondre précisément.
3. Produit trouvé dans le catalogue → cite son nom + prix + dis de cliquer sur «🛍️ Je veux acheter».
4. Produit absent → suggère de voir la vitrine complète.
5. Salutation → accueil chaleureux + propose de voir le catalogue.
6. Style : amical, direct, 1-2 emojis max. Jamais de liste de commandes.`;

async function askGroq(userMessage: string, firstName: string, context = ""): Promise<string | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: GROQ_SYSTEM + (context ? `\n\nContexte utilisateur : ${context}` : "") },
          { role: "user", content: `[${firstName}]: ${userMessage}` },
        ],
        max_tokens: 200, temperature: 0.6,
      }),
    });
    const d = await res.json() as any;
    return d?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e: any) {
    console.error("Groq error:", e?.message);
    return null;
  }
}


// ─── Catalogue réel pour contexte Groq ───────────────────────────────────────
async function fetchCatalogForGroq(sb: any): Promise<string> {
  try {
    // RBAC : le contexte Groq pour les Acheteurs n'inclut que les produits Revendeur/Vendeur
    const { data: rps } = await sb.from('lv_reseller_products')
      .select('retail_price, author_role, product:product_id(name, stock)')
      .eq('is_active', true)
      .in('author_role', ['revendeur', 'vendeur'])
      .limit(8);

    const { data: wps } = await sb.from('lv_products')
      .select('name, base_price, stock')
      .eq('is_active', true).limit(6);

    const lines: string[] = [];
    for (const rp of rps ?? []) {
      const p = rp.product as any;
      if (!p?.name) continue;
      const stk = p.stock != null ? ` (stock: ${p.stock})` : '';
      lines.push(`- ${p.name} : ${Number(rp.retail_price).toLocaleString('fr-FR')} FCFA${stk}`);
    }
    for (const wp of wps ?? []) {
      if (!lines.some(l => l.includes(wp.name))) {
        const stk = wp.stock != null ? ` (stock: ${wp.stock})` : '';
        lines.push(`- ${wp.name} : ${Number(wp.base_price).toLocaleString('fr-FR')} FCFA${stk}`);
      }
    }
    if (lines.length === 0) return 'Aucun produit disponible pour le moment.';
    return `Catalogue disponible sur ${PLATFORM} :\n${lines.slice(0, 10).join('\n')}`;
  } catch { return ''; }
}
// ─── Recherche produit — détection intention achat ──────────────────────────
const BUY_KEYWORDS = [
  "acheter","achète","commander","je veux","je voudrais","je cherche",
  "je voudrai","disponible","combien","produit","avoir","trouver",
  "montrez","montre moi","voir","affiche","j'ai besoin","besoin d'",
  "vente","vend","achète","koi","quoi",
];
const STOP_WORDS = new Set([
  "je","veux","voudrais","voudrai","acheter","achète","un","une","des",
  "le","la","les","du","de","à","et","ou","en","avec","pour",
  "sur","dans","par","qui","que","commander","cherche","chercher",
  "disponible","prix","avoir","voir","trouver","affiche","montre",
  "moi","svp","stp","please","merci","bonjour","salut","hey",
  "besoin","d","s","l","m","j","c","y","n","y",
]);

function detectProductSearch(text: string): string | null {
  const lower = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"");
  const hasBuyIntent = BUY_KEYWORDS.some(k => lower.includes(k));
  if (!hasBuyIntent) return null;
  const words = lower.split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g,""))
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return words.length > 0 ? words.slice(0,4).join(" ") : null;
}

async function searchProductsForBuyer(sb: any, keyword: string): Promise<any[]> {
  const kw = `%${keyword.replace(/ /g,"%")}%`;
  const { data: products } = await sb.from("lv_products")
    .select("id,name,description,image_url,stock")
    .eq("is_active",true)
    .or(`name.ilike.${kw},description.ilike.${kw}`)
    .limit(6);
  if (!products?.length) return [];

  const ids = products.map((p:any)=>p.id);
  // RBAC : exclure les publications Grossiste de la recherche Acheteur
  const { data: rps } = await sb.from("lv_reseller_products")
    .select("id,retail_price,product_id,author_role,reseller:reseller_id(shop_name,full_name)")
    .in("product_id",ids).eq("is_active",true)
    .in("author_role",["revendeur","vendeur"]).limit(4);

  const rpMap: Record<string,any> = {};
  for (const rp of rps??[]) rpMap[rp.product_id] = rp;

  return products.slice(0,3).map((p:any)=>{
    const rp = rpMap[p.id];
    return {
      id:    rp ? rp.id : `wp_${p.id}`,
      name:  p.name,
      price: rp ? Number(rp.retail_price) : null,
      stock: p.stock,
    };
  }).filter((p:any)=>p.stock>0||true);
}

// ─── State machine (réutilise bot_sessions existant) ─────────────────────────
const _cache = new Map<number, { state: string; data: Record<string, unknown> } | null>();

async function setBotState(sb: any, chatId: number, state: string, data: Record<string, unknown> = {}) {
  _cache.set(chatId, { state, data });
  await sb.from("bot_sessions").upsert({ telegram_chat_id: chatId, state, data, updated_at: new Date().toISOString() });
}

async function getBotState(sb: any, chatId: number) {
  if (_cache.has(chatId)) return _cache.get(chatId) ?? null;
  const { data } = await sb.from("bot_sessions").select("state,data").eq("telegram_chat_id", chatId).maybeSingle();
  _cache.set(chatId, data);
  return data as { state: string; data: Record<string, unknown> } | null;
}

async function clearBotState(sb: any, chatId: number) {
  _cache.delete(chatId);
  await sb.from("bot_sessions").delete().eq("telegram_chat_id", chatId);
}

// ─── DB helpers — profils Livrauto ───────────────────────────────────────────
async function getWholesaler(sb: any, chatId: number) {
  const { data } = await sb.from("lv_wholesalers").select("*").eq("telegram_chat_id", chatId).maybeSingle();
  return data;
}
async function getReseller(sb: any, chatId: number) {
  const { data } = await sb.from("lv_resellers").select("*").eq("telegram_chat_id", chatId).maybeSingle();
  return data;
}
async function getVendor(sb: any, chatId: number) {
  const { data } = await sb.from("lv_vendors").select("*").eq("telegram_chat_id", chatId).maybeSingle();
  return data;
}
async function getDelivery(sb: any, chatId: number) {
  const { data } = await sb.from("lv_delivery_persons").select("*").eq("telegram_chat_id", chatId).maybeSingle();
  return data;
}

// ─── RBAC : résolution du rôle Livrauto ──────────────────────────────────────
// Renvoie le rôle effectif d'un utilisateur à partir de son telegram_chat_id.
// Ordre de priorité : grossiste > revendeur > vendeur > livreur > acheteur.
async function getLvRole(sb: any, chatId: number): Promise<string> {
  const [w, r, v, d] = await Promise.all([
    getWholesaler(sb, chatId),
    getReseller(sb, chatId),
    getVendor(sb, chatId),
    getDelivery(sb, chatId),
  ]);
  if (w) return 'grossiste';
  if (r) return 'revendeur';
  if (v) return 'vendeur';
  if (d) return 'livreur';
  return 'acheteur';
}

function makeLink(chatId: number, role: string): string {
  const botName = Deno.env.get("BOT_USERNAME") || "livrauto_bot";
  return `https://t.me/${botName}?start=${role}_${chatId}`;
}

// ─── MESSAGES D'ACCUEIL ──────────────────────────────────────────────────────
function welcomeMsg(firstName: string): string {
  return [
    `👋 <b>Salut ${escapeHtml(firstName)} ! Bienvenue sur ${PLATFORM}.</b>`,
    ``,
    `Ici, tout est réuni pour simplifier tes achats et booster tes revenus.`,
    ``,
    `<b>Que souhaites-tu faire aujourd'hui ?</b>`,
  ].join("\n");
}

const WELCOME_KB = {
  inline_keyboard: [
    [{ text: "🛍️ Je veux acheter",        callback_data: "lv_buyer"    }],
    [{ text: "💼 Lancer mon activité",     callback_data: "lv_partner"  }],
    [{ text: "📞 Support",                 callback_data: "lv_support"  }],
  ],
};

const PARTNER_KB = {
  inline_keyboard: [
    [{ text: "📦 Revendeur",   callback_data: "lv_be_reseller"  }],
    [{ text: "🏗️ Grossiste",  callback_data: "lv_be_wholesaler" }],
    [{ text: "👤 Vendeur",    callback_data: "lv_be_vendor"     }],
    [{ text: "🚚 Livreur",    callback_data: "lv_be_delivery"   }],
    [{ text: "◀ Retour",      callback_data: "lv_home"          }],
  ],
};

// ─── DASHBOARD helpers ────────────────────────────────────────────────────────
async function sendWholesalerDashboard(chatId: number, w: any, sb: any) {
  const { data: products } = await sb.from("lv_products")
    .select("id,name,base_price,stock,is_active")
    .eq("wholesaler_id", w.id).order("created_at", { ascending: false }).limit(10);

  const { data: orders } = await sb.from("lv_orders")
    .select("id,total_amount,status").eq("wholesaler_id", w.id)
    .eq("status","paid").limit(100);
  const totalSales = (orders ?? []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);

  const { count: resellerCount } = await sb.from("lv_resellers")
    .select("id", { count: "exact", head: true }).eq("wholesaler_id", w.id);

  const lines = (products ?? []).slice(0,5).map((p: any) =>
    `  ${p.is_active?"🟢":"⚫"} <b>${escapeHtml(p.name)}</b> — ${Number(p.base_price).toLocaleString("fr-FR")} F · Stock: ${p.stock}`
  );

  await sendWithMenu(chatId, [
    `🏗️ <b>Dashboard Grossiste</b>`,
    `👤 ${escapeHtml(w.shop_name || w.full_name || "Grossiste")}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 Revenus ventes : <b>${totalSales.toLocaleString("fr-FR")} FCFA</b>`,
    `📦 Produits : <b>${(products??[]).length}</b> · Revendeurs : <b>${resellerCount??0}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    lines.length ? `\n<b>Mes produits :</b>\n${lines.join("\n")}` : `\n<i>Aucun produit encore.</i>`,
  ].join("\n"), [
    [{ text: "➕ Ajouter un produit",           callback_data: "lv_add_product"      }],
    [{ text: "📋 Gérer mes produits",            callback_data: "lv_my_products"      }],
    [{ text: "🔗 Lien recrutement revendeurs",   callback_data: "lv_recruit_link"     }],
    [{ text: "🏗️→👤 Affecter à un Vendeur",    callback_data: "lv_assign_to_vendor" }],
  ]);
}

async function sendResellerDashboard(chatId: number, r: any, sb: any) {
  const wallet = Number(r.lv_wallet_balance || 0);
  const { data: myProds } = await sb.from("lv_reseller_products")
    .select("id,retail_price,product:product_id(name,base_price,stock)")
    .eq("reseller_id", r.id).eq("is_active", true).limit(10);

  const { data: orders } = await sb.from("lv_orders")
    .select("id,reseller_gain,status").eq("reseller_id", r.id).eq("status","paid").limit(100);
  const totalGain = (orders ?? []).reduce((s: number, o: any) => s + (o.reseller_gain || 0), 0);

  const lines = (myProds ?? []).slice(0,5).map((rp: any) =>
    `  🛍️ <b>${escapeHtml(rp.product?.name||"Produit")}</b> — Mon prix: ${Number(rp.retail_price).toLocaleString("fr-FR")} F`
  );

  await sendWithMenu(chatId, [
    `📦 <b>Dashboard Revendeur</b>`,
    `👤 ${escapeHtml(r.full_name || "Revendeur")}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 Revenus ventes : <b>${totalGain.toLocaleString("fr-FR")} FCFA</b>`,
    `👛 Wallet : <b>${wallet.toLocaleString("fr-FR")} FCFA</b>`,
    `📦 Produits en boutique : <b>${(myProds??[]).length}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    lines.length ? `\n<b>Ma boutique :</b>\n${lines.join("\n")}` : `\n<i>Ajoute des produits à ta boutique.</i>`,
  ].join("\n"), [
    [{ text: "🛍️ Parcourir le catalogue",   callback_data: "lv_browse_wholesale"  }],
    [{ text: "🔗 Mon lien de revente",        callback_data: "lv_my_store_link"     }],
    [{ text: "💸 Retirer mes gains",          callback_data: "lv_withdraw"           }],
  ]);
}

async function sendVendorDashboard(chatId: number, v: any, _sb: any) {
  const wallet = Number(v.lv_wallet_balance || 0);
  const link = v.referral_link || makeLink(chatId, "buy");
  // RBAC : compter les produits affectés par des Grossistes à ce Vendeur
  const { count: assignedCount } = await _sb.from("lv_vendor_products")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", v.id).eq("is_active", true);

  await sendWithMenu(chatId, [
    `👤 <b>Dashboard Vendeur</b>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👁 Clics : <b>${v.total_clicks || 0}</b>`,
    `👥 Inscrits via ton lien : <b>${v.total_referrals || 0}</b>`,
    `💰 Revenus réseau : <b>${wallet.toLocaleString("fr-FR")} FCFA</b>`,
    assignedCount ? `📦 Produits reçus de Grossistes : <b>${assignedCount}</b>` : ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `🔗 Ton lien : <code>${link}</code>`,
  ].filter(Boolean).join("\n"), [
    [{ text: "📋 Copier mon lien",              callback_data: "lv_vendor_link"         }],
    [{ text: "📦 Mes produits reçus",           callback_data: "lv_vendor_assigned_prods" }],
    [{ text: "💸 Retirer mes gains",            callback_data: "lv_withdraw"             }],
  ]);
}

async function sendDeliveryDashboard(chatId: number, d: any, sb: any) {
  const wallet = Number(d.lv_wallet_balance || 0);
  const { data: missions } = await sb.from("lv_deliveries")
    .select("id,buyer_name,zone,status,amount_fcfa")
    .eq("delivery_person_id", d.id)
    .order("created_at", { ascending: false }).limit(5);

  const lines = (missions ?? []).map((m: any) =>
    `  ${m.status==="delivered"?"✅":"🕐"} ${escapeHtml(m.buyer_name||"Client")} · ${escapeHtml(m.zone||"?")} — ${Number(m.amount_fcfa).toLocaleString("fr-FR")} F`
  );

  const available = d.is_available ? "🟢 Disponible" : "🔴 Indisponible";
  await sendWithMenu(chatId, [
    `🚚 <b>Dashboard Livreur</b>`,
    `👤 ${escapeHtml(d.full_name || "Livreur")} — ${available}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 Wallet : <b>${wallet.toLocaleString("fr-FR")} FCFA</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    lines.length ? `\n<b>Dernières missions :</b>\n${lines.join("\n")}` : `\n<i>Aucune mission encore.</i>`,
  ].join("\n"), [
    [{ text: d.is_available ? "🔴 Me marquer indisponible" : "🟢 Me marquer disponible",
       callback_data: "lv_toggle_availability" }],
    [{ text: "💸 Retirer mes gains", callback_data: "lv_withdraw" }],
  ]);
}

// ─── BUYER — Catalogue & Panier ───────────────────────────────────────────────
async function sendBuyerCatalog(chatId: number, sb: any, resellerLink?: string) {
  let resellerId: string | null = null;

  if (resellerLink) {
    const { data: r } = await sb.from("lv_resellers")
      .select("id,full_name").eq("personal_link", resellerLink).maybeSingle();
    if (r) resellerId = r.id;
  }

  // RBAC : les Acheteurs ne voient que les publications Revendeur et Vendeur
  // Les publications author_role='grossiste' sont réservées aux Revendeurs (filtrage bot)
  let query = sb.from("lv_reseller_products")
    .select("id,retail_price,author_role,product:product_id(name,description,stock)")
    .eq("is_active", true)
    .in("author_role", ["revendeur", "vendeur"]);
  if (resellerId) query = query.eq("reseller_id", resellerId);

  const { data: items } = await query.limit(20);

  if (!items || items.length === 0) {
    await sendWithMenu(chatId, "📭 <b>Aucun produit disponible pour le moment.</b>\n\nReviens bientôt !");
    return;
  }

  const appUrl    = Deno.env.get("APP_URL") || "https://betesim.vercel.app";
  const vitrineUrl = `${appUrl}/vitrine?chatId=${chatId}`;
  const featured   = (items || []).slice(0, 4);

  const buttons = featured.map((rp: any) => [{
    text: `🛍️ ${rp.product?.name || "Produit"} — ${Number(rp.retail_price).toLocaleString("fr-FR")} F`,
    url: `${appUrl}/vitrine?chatId=${chatId}&id=${rp.id}`,
  }]);

  await sendMessage(chatId, [
    `🛒 <b>Catalogue ${PLATFORM}</b>`,
    ``,
    `${items.length} produit${items.length>1?"s":""} disponible${items.length>1?"s":""}. Clique sur un produit pour voir la publication :`,
  ].join("\n"), {
    inline_keyboard: [
      ...buttons,
      [{ text: "🌐 Voir toute la vitrine", url: vitrineUrl }],
      [{ text: "🛒 Mon Panier",             callback_data: "lv_cart" }],
      [{ text: "🏠 Accueil",                callback_data: "lv_home"  }],
    ],
  });
}

async function sendCart(chatId: number, sb: any) {
  const { data: items } = await sb.from("lv_carts")
    .select("id,quantity,rp:reseller_product_id(retail_price,product:product_id(name))")
    .eq("buyer_chat_id", chatId);

  if (!items || items.length === 0) {
    await sendMessage(chatId, "🛒 <b>Ton panier est vide.</b>", {
      inline_keyboard: [[{ text: "🛍️ Parcourir le catalogue", callback_data: "lv_catalog" }]],
    });
    return;
  }

  let total = 0;
  const lines = items.map((it: any) => {
    const price = Number(it.rp?.retail_price || 0);
    const qty = it.quantity || 1;
    total += price * qty;
    return `  • <b>${escapeHtml(it.rp?.product?.name || "Produit")}</b> × ${qty} — ${(price*qty).toLocaleString("fr-FR")} F`;
  });

  await sendMessage(chatId, [
    `🛒 <b>Mon Panier</b>`,
    ``,
    ...lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 Total : <b>${total.toLocaleString("fr-FR")} FCFA</b>`,
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "💳 Payer maintenant", callback_data: "lv_checkout" }],
      [{ text: "🗑️ Vider le panier",  callback_data: "lv_clear_cart" }],
      [{ text: "➕ Continuer",        callback_data: "lv_catalog" }],
    ],
  });
}

// ─── FedaPay — Paiement commande ─────────────────────────────────────────────
async function createFedaPayLink(amount: number, description: string, orderId: string, buyerChatId: number): Promise<string | null> {
  const mode   = Deno.env.get("FEDAPAY_MODE") || "sandbox";
  const apiKey = mode === "live" ? Deno.env.get("FEDAPAY_SECRET_KEY_LIVE") : Deno.env.get("FEDAPAY_SECRET_KEY");
  const apiBase = mode === "live" ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1";
  const payBase = mode === "live" ? "https://process.fedapay.com" : "https://sandbox-process.fedapay.com";

  if (!apiKey) return null;
  try {
    const res = await fetch(`${apiBase}/transactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        description, amount,
        currency: { iso: "XOF" },
        callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/livrauto-payment?order_id=${orderId}`,
        customer: { firstname: String(buyerChatId) },
      }),
    });
    const d = await res.json() as any;
    const txId = d?.v1?.id ?? d?.id;
    if (!txId) return null;
    const token = d?.v1?.token ?? d?.token;
    return `${payBase}/v1/${token}`;
  } catch { return null; }
}

async function handleCheckout(chatId: number, firstName: string, sb: any) {
  const { data: cartItems } = await sb.from("lv_carts")
    .select("id,quantity,rp:reseller_product_id(id,retail_price,reseller_id,product:product_id(id,name,base_price,wholesaler_id))")
    .eq("buyer_chat_id", chatId);

  if (!cartItems || cartItems.length === 0) {
    await sendMessage(chatId, "🛒 Ton panier est vide.", { inline_keyboard: [[{ text: "🛍️ Catalogue", callback_data: "lv_catalog" }]] });
    return;
  }

  let total = 0; let baseTotal = 0;
  let resellerId: string | null = null;
  let wholesalerId: string | null = null;

  for (const it of cartItems) {
    const price = Number(it.rp?.retail_price || 0);
    const base  = Number(it.rp?.product?.base_price || 0);
    const qty   = it.quantity || 1;
    total += price * qty;
    baseTotal += base * qty;
    if (!resellerId && it.rp?.reseller_id) resellerId = it.rp.reseller_id;
    if (!wholesalerId && it.rp?.product?.wholesaler_id) wholesalerId = it.rp.product.wholesaler_id;
  }

  const platformFee = Math.round(total * PLATFORM_FEE_PCT);
  const resellerGain = Math.round(total - platformFee - baseTotal);

  // Créer la commande en DB
  const { data: order } = await sb.from("lv_orders").insert({
    buyer_chat_id: chatId, buyer_name: firstName,
    reseller_id: resellerId, wholesaler_id: wholesalerId,
    total_amount: total, platform_fee: platformFee, reseller_gain: Math.max(0, resellerGain),
    status: "pending",
  }).select("id").single();

  if (!order) {
    await sendMessage(chatId, "❌ Erreur lors de la commande. Réessaie.");
    return;
  }

  // Insérer les lignes de commande
  const orderItems = cartItems.map((it: any) => ({
    order_id: order.id,
    product_id: it.rp?.product?.id,
    product_name: it.rp?.product?.name,
    quantity: it.quantity || 1,
    unit_price: it.rp?.retail_price,
    base_price: it.rp?.product?.base_price,
  }));
  await sb.from("lv_order_items").insert(orderItems);

  // Créer le lien FedaPay
  const payLink = await createFedaPayLink(total, `Commande ${PLATFORM} #${order.id.slice(0,8)}`, order.id, chatId);

  if (payLink) {
    await sendMessage(chatId, [
      `💳 <b>Paiement de ta commande</b>`,
      ``,
      `💰 Total : <b>${total.toLocaleString("fr-FR")} FCFA</b>`,
      `🏦 Plateforme : 10% = ${platformFee.toLocaleString("fr-FR")} F`,
      ``,
      `Appuie sur le bouton pour payer via Mobile Money :`,
    ].join("\n"), {
      inline_keyboard: [
        [{ text: "💳 Payer maintenant", url: payLink }],
        [{ text: "◀ Retour",            callback_data: "lv_cart" }],
      ],
    });
    // Vider le panier
    await sb.from("lv_carts").delete().eq("buyer_chat_id", chatId);
  } else {
    await sendMessage(chatId, [
      `✅ <b>Commande #${order.id.slice(0,8)} enregistrée !</b>`,
      ``,
      `💰 Total : <b>${total.toLocaleString("fr-FR")} FCFA</b>`,
      ``,
      `Le lien de paiement sera envoyé sous peu. Contacte le support si nécessaire.`,
    ].join("\n"), { inline_keyboard: [[{ text: "📞 Support", callback_data: "lv_support" }]] });
    await sb.from("lv_carts").delete().eq("buyer_chat_id", chatId);
  }
}

// ─── RETRAIT WALLET ───────────────────────────────────────────────────────────
async function startWithdrawal(chatId: number, sb: any) {
  // Trouver le wallet du bon acteur
  const [w, r, v, d] = await Promise.all([
    getWholesaler(sb, chatId), getReseller(sb, chatId),
    getVendor(sb, chatId), getDelivery(sb, chatId),
  ]);
  const actor = w || r || v || d;
  if (!actor) {
    await sendMessage(chatId, "❌ Profil introuvable. Tape /start.");
    return;
  }
  const balance = Number(actor.lv_wallet_balance || 0);
  if (balance < MIN_WITHDRAWAL) {
    await sendWithMenu(chatId, [
      `💰 <b>Wallet : ${balance.toLocaleString("fr-FR")} FCFA</b>`,
      ``,
      `⚠️ Seuil de retrait : <b>${MIN_WITHDRAWAL.toLocaleString("fr-FR")} FCFA</b>`,
      ``,
      `Il te manque <b>${(MIN_WITHDRAWAL - balance).toLocaleString("fr-FR")} FCFA</b> pour retirer.`,
    ].join("\n"));
    return;
  }
  await setBotState(sb, chatId, "lv_await_withdraw_amount", { balance, actorType: w?"wholesaler":r?"reseller":v?"vendor":"delivery" });
  await sendMessage(chatId, [
    `💸 <b>Retrait Mobile Money</b>`,
    ``,
    `💰 Solde disponible : <b>${balance.toLocaleString("fr-FR")} FCFA</b>`,
    ``,
    `Quel montant veux-tu retirer ? (min ${MIN_WITHDRAWAL.toLocaleString("fr-FR")} FCFA)`,
    `<i>Exemple : 10000</i>`,
  ].join("\n"), { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_dashboard" }]] });
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Webhook ping
  if (req.method === "GET") return new Response(JSON.stringify({ ok: true, bot: PLATFORM }), { headers: { "Content-Type": "application/json" } });

  const processing = (async () => {
    try {
      const update = await req.json();

      // ── Callbacks (boutons) ─────────────────────────────────────────────────
      if (update.callback_query) {
        const cb        = update.callback_query;
        const chatId    = cb.message.chat.id;
        const data      = cb.data as string;
        const firstName = cb.from.first_name || "ami";

        await answerCallback(cb.id);

        // ── Accueil & Navigation ──────────────────────────────────────────────
        if (data === "lv_home") {
          await clearBotState(sb, chatId);
          await sendMessage(chatId, welcomeMsg(firstName), WELCOME_KB);
          return;
        }

        if (data === "lv_dashboard") {
          const [w, r, v, d] = await Promise.all([
            getWholesaler(sb, chatId), getReseller(sb, chatId),
            getVendor(sb, chatId), getDelivery(sb, chatId),
          ]);
          if (w) await sendWholesalerDashboard(chatId, w, sb);
          else if (r) await sendResellerDashboard(chatId, r, sb);
          else if (v) await sendVendorDashboard(chatId, v, sb);
          else if (d) await sendDeliveryDashboard(chatId, d, sb);
          else await sendMessage(chatId, welcomeMsg(firstName), WELCOME_KB);
          return;
        }

        if (data === "lv_wallet") {
          await startWithdrawal(chatId, sb);
          return;
        }

        // ── Acheteur ─────────────────────────────────────────────────────────
        if (data === "lv_buyer" || data === "lv_catalog") {
          await sendBuyerCatalog(chatId, sb);
          return;
        }

        if (data === "lv_cart") {
          await sendCart(chatId, sb);
          return;
        }

        if (data === "lv_checkout") {
          await handleCheckout(chatId, firstName, sb);
          return;
        }

        if (data === "lv_clear_cart") {
          await sb.from("lv_carts").delete().eq("buyer_chat_id", chatId);
          await sendMessage(chatId, "🗑️ Panier vidé.", { inline_keyboard: [[{ text: "🛍️ Catalogue", callback_data: "lv_catalog" }]] });
          return;
        }

        // Détail produit → ajouter au panier
        if (data.startsWith("lv_item:")) {
          const rpId = data.slice(8);
          const { data: rp } = await sb.from("lv_reseller_products")
            .select("id,retail_price,product:product_id(name,description,stock)")
            .eq("id", rpId).maybeSingle();
          if (!rp) { await sendMessage(chatId, "❌ Produit introuvable."); return; }
          const p = rp.product as any;
          const appUrlItem = Deno.env.get("APP_URL") || "https://betesim.vercel.app";
          await sendMessage(chatId, [
            `🛍️ <b>${escapeHtml(p?.name || "Produit")}</b>`,
            p?.description ? `\n📝 ${escapeHtml(p.description)}` : "",
            ``,
            `💰 Prix : <b>${Number(rp.retail_price).toLocaleString("fr-FR")} FCFA</b>`,
            `📦 Stock : ${p?.stock > 0 ? `<b>${p.stock}</b> disponible${p.stock>1?"s":""}` : "<b>Rupture</b>"}`,
          ].filter(Boolean).join("\n"), {
            inline_keyboard: [
              [{ text: "🌐 Voir la publication", url: `${appUrlItem}/vitrine?chatId=${chatId}&id=${rpId}` }],
              p?.stock > 0 ? [{ text: "🛒 Ajouter au panier", callback_data: `lv_addcart:${rpId}` }] : [],
              [{ text: "◀ Retour catalogue",  callback_data: "lv_catalog" }],
            ].filter(r => r.length > 0),
          });
          return;
        }

        if (data.startsWith("lv_addcart:")) {
          const rpId = data.slice(11);
          await sb.from("lv_carts").upsert({ buyer_chat_id: chatId, reseller_product_id: rpId, quantity: 1 },
            { onConflict: "buyer_chat_id,reseller_product_id" });
          await sendMessage(chatId, "✅ <b>Ajouté au panier !</b>", {
            inline_keyboard: [
              [{ text: "🛒 Voir mon panier",      callback_data: "lv_cart"    }],
              [{ text: "🛍️ Continuer",            callback_data: "lv_catalog" }],
            ],
          });
          return;
        }

        // ── Devenir partenaire ────────────────────────────────────────────────
        if (data === "lv_partner") {
          await sendMessage(chatId, [
            `🚀 <b>Lancer mon activité</b>`,
            ``,
            `Bravo, c'est le premier pas pour booster tes revenus !`,
            ``,
            `<b>Quel est ton profil aujourd'hui ?</b>`,
          ].join("\n"), PARTNER_KB);
          return;
        }

        // ── Grossiste onboarding ──────────────────────────────────────────────
        if (data === "lv_be_wholesaler") {
          const existing = await getWholesaler(sb, chatId);
          if (existing) { await sendWholesalerDashboard(chatId, existing, sb); return; }
          await setBotState(sb, chatId, "lv_await_shop_name", {});
          await sendMessage(chatId, [
            `🏗️ <b>Devenir Grossiste</b>`,
            ``,
            `Quel est le nom de ta boutique/marque ?`,
            `<i>Exemple : Tech Store Abidjan</i>`,
          ].join("\n"), { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_home" }]] });
          return;
        }

        // ── Grossiste actions ─────────────────────────────────────────────────
        if (data === "lv_add_product") {
          const w = await getWholesaler(sb, chatId);
          if (!w) { await sendMessage(chatId, "🔒 Crée d'abord ton profil grossiste."); return; }
          const appUrl = Deno.env.get("APP_URL") || "https://betesim.vercel.app";
          const formUrl = `${appUrl}/ajouter-produit?chatId=${chatId}&wholesalerId=${encodeURIComponent(w.id)}`;
          await sendMessage(chatId, [
            `➕ <b>Ajouter un produit</b>`,
            ``,
            `Clique sur le bouton ci-dessous pour remplir le formulaire en ligne.`,
            ``,
            `📸 Tu pourras y ajouter le nom, le prix, le stock et une photo.`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "🌐 Remplir le formulaire", url: formUrl }],
              [{ text: "❌ Annuler", callback_data: "lv_dashboard" }],
            ],
          });
          return;
        }

        if (data === "lv_my_products") {
          const w = await getWholesaler(sb, chatId);
          if (!w) { await sendMessage(chatId, "🔒 Profil grossiste requis."); return; }
          const { data: products } = await sb.from("lv_products")
            .select("id,name,base_price,stock,is_active")
            .eq("wholesaler_id", w.id).order("created_at", { ascending: false }).limit(15);
          if (!products?.length) {
            await sendMessage(chatId, "📭 Aucun produit. Ajoutes-en un !", {
              inline_keyboard: [[{ text: "➕ Ajouter", callback_data: "lv_add_product" }]],
            });
            return;
          }
          const buttons = products.map((p: any) => [{
            text: `${p.is_active?"🟢":"⚫"} ${p.name} — ${Number(p.base_price).toLocaleString("fr-FR")} F · ${p.stock} en stock`,
            callback_data: `lv_editprod:${p.id}`,
          }]);
          await sendMessage(chatId, `📋 <b>Mes produits (${products.length})</b>`, {
            inline_keyboard: [...buttons, [{ text: "➕ Ajouter", callback_data: "lv_add_product" }]],
          });
          return;
        }

        if (data.startsWith("lv_editprod:")) {
          const prodId = data.slice(12);
          const { data: p } = await sb.from("lv_products").select("*").eq("id", prodId).maybeSingle();
          if (!p) { await sendMessage(chatId, "❌ Produit introuvable."); return; }
          await sendMessage(chatId, [
            `📦 <b>${escapeHtml(p.name)}</b>`,
            `💰 Prix de base : ${Number(p.base_price).toLocaleString("fr-FR")} F`,
            `📦 Stock : ${p.stock}`,
            `Statut : ${p.is_active ? "🟢 Actif" : "⚫ Inactif"}`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "✏️ Modifier le prix", callback_data: `lv_setprice:${prodId}` }],
              [{ text: "📦 Modifier le stock", callback_data: `lv_setstock:${prodId}` }],
              [{ text: p.is_active ? "⚫ Désactiver" : "🟢 Activer", callback_data: `lv_toggleprod:${prodId}` }],
              [{ text: "◀ Retour", callback_data: "lv_my_products" }],
            ],
          });
          return;
        }

        if (data.startsWith("lv_toggleprod:")) {
          const prodId = data.slice(14);
          const { data: p } = await sb.from("lv_products").select("is_active").eq("id", prodId).maybeSingle();
          if (!p) return;
          await sb.from("lv_products").update({ is_active: !p.is_active }).eq("id", prodId);
          await sendMessage(chatId, `${!p.is_active?"🟢 Produit activé":"⚫ Produit désactivé"}.`, {
            inline_keyboard: [[{ text: "◀ Retour", callback_data: "lv_my_products" }]],
          });
          return;
        }

        if (data.startsWith("lv_setprice:")) {
          const prodId = data.slice(12);
          await setBotState(sb, chatId, "lv_await_new_price", { prodId });
          await sendMessage(chatId, "💰 Nouveau prix de base (FCFA) ?\n<i>Exemple : 5000</i>", {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: `lv_editprod:${prodId}` }]],
          });
          return;
        }

        if (data.startsWith("lv_setstock:")) {
          const prodId = data.slice(12);
          await setBotState(sb, chatId, "lv_await_new_stock", { prodId });
          await sendMessage(chatId, "📦 Nouvelle quantité en stock ?\n<i>Exemple : 50</i>", {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: `lv_editprod:${prodId}` }]],
          });
          return;
        }

        // ── RBAC : Grossiste → affecter produits à un Vendeur ─────────────────
        if (data === "lv_assign_to_vendor") {
          const w = await getWholesaler(sb, chatId);
          if (!w) { await sendMessage(chatId, "🔒 Profil grossiste requis."); return; }
          // Lister les Vendeurs disponibles
          const { data: vendors } = await sb.from("lv_vendors")
            .select("id,full_name,telegram_chat_id")
            .order("created_at", { ascending: false }).limit(30);
          if (!vendors?.length) {
            await sendMessage(chatId, "📭 Aucun Vendeur inscrit sur la plateforme.",
              { inline_keyboard: [[{ text: "◀ Dashboard", callback_data: "lv_dashboard" }]] });
            return;
          }
          const buttons = vendors.map((v: any) => [{
            text: `👤 ${escapeHtml(v.full_name || "Vendeur")}`,
            callback_data: `lv_gv_pick_vendor:${v.id}`,
          }]);
          await sendMessage(chatId, [
            `🏗️→👤 <b>Affecter un produit à un Vendeur</b>`,
            ``,
            `Sélectionne le Vendeur qui recevra le produit.`,
            `Il apparaîtra dans son dashboard et sera visible par ses Acheteurs.`,
          ].join("\n"), {
            inline_keyboard: [...buttons, [{ text: "◀ Dashboard", callback_data: "lv_dashboard" }]],
          });
          return;
        }

        if (data.startsWith("lv_gv_pick_vendor:")) {
          const vendorId = data.slice(18);
          const w = await getWholesaler(sb, chatId);
          if (!w) { await sendMessage(chatId, "🔒 Profil grossiste requis."); return; }
          const { data: products } = await sb.from("lv_products")
            .select("id,name,base_price,stock")
            .eq("wholesaler_id", w.id).eq("is_active", true)
            .order("created_at", { ascending: false }).limit(25);
          if (!products?.length) {
            await sendMessage(chatId, "📭 Tu n'as pas encore de produits actifs.",
              { inline_keyboard: [[{ text: "➕ Ajouter un produit", callback_data: "lv_add_product" }]] });
            return;
          }
          const buttons = products.map((p: any) => [{
            text: `${escapeHtml(p.name)} — ${Number(p.base_price).toLocaleString("fr-FR")} F (stock: ${p.stock})`,
            callback_data: `lv_gv_pick_prod:${vendorId}:${p.id}`,
          }]);
          await sendMessage(chatId, [
            `📦 <b>Choisir le produit à affecter</b>`,
            ``,
            `Quel produit veux-tu pousser vers ce Vendeur ?`,
          ].join("\n"), {
            inline_keyboard: [...buttons, [{ text: "◀ Retour vendeurs", callback_data: "lv_assign_to_vendor" }]],
          });
          return;
        }

        if (data.startsWith("lv_gv_pick_prod:")) {
          const parts = data.slice(16).split(":");
          const vendorId = parts[0], prodId = parts[1];
          const w = await getWholesaler(sb, chatId);
          if (!w) { await sendMessage(chatId, "🔒 Profil grossiste requis."); return; }
          const { data: p } = await sb.from("lv_products").select("*").eq("id", prodId).maybeSingle();
          if (!p) { await sendMessage(chatId, "❌ Produit introuvable."); return; }
          await setBotState(sb, chatId, "lv_await_gv_price", {
            vendorId, prodId, wholesalerId: w.id,
            productName: p.name, basePrice: p.base_price,
          });
          await sendMessage(chatId, [
            `💰 <b>Fixer le prix de revente pour ce Vendeur</b>`,
            ``,
            `Produit : <b>${escapeHtml(p.name)}</b>`,
            `Prix de base : <b>${Number(p.base_price).toLocaleString("fr-FR")} FCFA</b>`,
            ``,
            `À quel prix doit-il vendre ? (doit être supérieur au prix de base)`,
            `<i>Exemple : ${Math.round(Number(p.base_price) * 1.25).toLocaleString("fr-FR")}</i>`,
          ].join("\n"), {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_assign_to_vendor" }]],
          });
          return;
        }

        // Liste des produits affectés à un Vendeur (vue Vendeur)
        if (data === "lv_vendor_assigned_prods") {
          const v = await getVendor(sb, chatId);
          if (!v) { await sendMessage(chatId, "🔒 Profil vendeur requis."); return; }
          const { data: assigned } = await sb.from("lv_vendor_products")
            .select("id,retail_price,is_active,note,product:product_id(name,description,stock),wholesaler:wholesaler_id(shop_name,full_name)")
            .eq("vendor_id", v.id).order("created_at", { ascending: false }).limit(20);
          if (!assigned?.length) {
            await sendWithMenu(chatId, [
              `📦 <b>Produits reçus de Grossistes</b>`,
              ``,
              `Aucun produit ne t'a encore été affecté par un Grossiste.`,
              ``,
              `<i>Quand un Grossiste t'affecte un produit, il apparaît ici et dans la vitrine Acheteurs.</i>`,
            ].join("\n"));
            return;
          }
          const lines = (assigned ?? []).map((a: any) => {
            const p = a.product as any;
            const w = a.wholesaler as any;
            const status = a.is_active ? "🟢" : "⚫";
            return `${status} <b>${escapeHtml(p?.name || "Produit")}</b> — ${Number(a.retail_price).toLocaleString("fr-FR")} FCFA\n   📦 Stock: ${p?.stock || 0} | 🏗️ ${escapeHtml(w?.shop_name || w?.full_name || "Grossiste")}${a.note ? `\n   💬 ${escapeHtml(a.note)}` : ""}\n`;
          });
          await sendWithMenu(chatId, [
            `📦 <b>Produits reçus de Grossistes (${assigned.length})</b>`,
            ``,
            ...lines,
            `<i>Ces produits sont visibles dans ta vitrine Acheteurs.</i>`,
          ].join("\n"));
          return;
        }

        if (data === "lv_recruit_link") {
          const w = await getWholesaler(sb, chatId);
          if (!w) { await sendMessage(chatId, "🔒 Profil grossiste requis."); return; }
          const link = w.recruitment_link || makeLink(chatId, "join_reseller");
          if (!w.recruitment_link) {
            await sb.from("lv_wholesalers").update({ recruitment_link: link }).eq("id", w.id);
          }
          await sendWithMenu(chatId, [
            `🔗 <b>Ton lien de recrutement revendeurs</b>`,
            ``,
            `<code>${link}</code>`,
            ``,
            `Partage ce lien avec tes revendeurs. Ils seront automatiquement associés à ta boutique.`,
          ].join("\n"));
          return;
        }

        // ── Revendeur onboarding ──────────────────────────────────────────────
        if (data === "lv_be_reseller") {
          const existing = await getReseller(sb, chatId);
          if (existing) { await sendResellerDashboard(chatId, existing, sb); return; }
          await setBotState(sb, chatId, "lv_await_reseller_name", {});
          await sendMessage(chatId, [
            `📦 <b>Devenir Revendeur</b>`,
            ``,
            `Quel est ton nom complet ?`,
          ].join("\n"), { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_home" }]] });
          return;
        }

        if (data === "lv_browse_wholesale") {
          const { data: wholesalers } = await sb.from("lv_wholesalers")
            .select("id,shop_name,full_name,telegram_chat_id")
            .eq("is_active", true).order("created_at", { ascending: false }).limit(30);
          if (!wholesalers?.length) {
            await sendMessage(chatId, "📭 Aucun grossiste disponible pour l'instant.",
              { inline_keyboard: [[{ text: "◀ Dashboard", callback_data: "lv_dashboard" }]] });
            return;
          }
          const buttons = wholesalers.map((w: any) => [{
            text: `🏗️ ${w.shop_name || w.full_name}`,
            callback_data: `lv_grossiste:${w.id}`,
          }]);
          await sendMessage(chatId, [
            `🛒 <b>Choisir un grossiste</b>`,
            ``,
            `Sélectionne un grossiste pour voir ses produits.`,
            `Tu peux choisir les articles que tu veux mettre dans ta boutique et fixer ton prix de revente.`,
          ].join("\n"), { inline_keyboard: [...buttons, [{ text: "◀ Dashboard", callback_data: "lv_dashboard" }]] });
          return;
        }

        if (data.startsWith("lv_grossiste:")) {
          const wholesalerId = data.slice(13);
          const { data: w } = await sb.from("lv_wholesalers")
            .select("id,shop_name,full_name").eq("id", wholesalerId).maybeSingle();
          const { data: products } = await sb.from("lv_products")
            .select("id,name,base_price,stock,photo_url")
            .eq("wholesaler_id", wholesalerId).eq("is_active", true)
            .order("created_at", { ascending: false }).limit(25);
          if (!products?.length) {
            await sendMessage(chatId, `📭 <b>${escapeHtml(w?.shop_name || "Ce grossiste")}</b> n'a pas encore de produits.`,
              { inline_keyboard: [[{ text: "◀ Retour grossistes", callback_data: "lv_browse_wholesale" }]] });
            return;
          }
          const buttons = products.map((p: any) => [{
            text: `${p.name} — ${Number(p.base_price).toLocaleString("fr-FR")} F (stock: ${p.stock})`,
            callback_data: `lv_selectprod:${p.id}`,
          }]);
          await sendMessage(chatId, [
            `🏗️ <b>${escapeHtml(w?.shop_name || "Grossiste")}</b>`,
            ``,
            `${products.length} produit${products.length > 1 ? "s" : ""} disponible${products.length > 1 ? "s" : ""}.`,
            `Clique sur un produit pour l'ajouter à ta boutique et fixer ton prix.`,
          ].join("\n"), { inline_keyboard: [...buttons, [{ text: "◀ Retour grossistes", callback_data: "lv_browse_wholesale" }]] });
          return;
        }

        if (data.startsWith("lv_selectprod:")) {
          const prodId = data.slice(14);
          const r = await getReseller(sb, chatId);
          if (!r) { await sendMessage(chatId, "🔒 Profil revendeur requis."); return; }
          const { data: p } = await sb.from("lv_products").select("*").eq("id", prodId).maybeSingle();
          if (!p) { await sendMessage(chatId, "❌ Produit introuvable."); return; }
          await setBotState(sb, chatId, "lv_await_retail_price", { prodId, resellerId: r.id, baseName: p.name, basePrice: p.base_price });
          await sendMessage(chatId, [
            `💰 <b>Fixer ton prix de revente</b>`,
            ``,
            `Produit : <b>${escapeHtml(p.name)}</b>`,
            `Prix de base grossiste : <b>${Number(p.base_price).toLocaleString("fr-FR")} FCFA</b>`,
            ``,
            `À quel prix veux-tu le revendre ? (supérieur au prix de base)`,
            `<i>Exemple : ${Math.round(Number(p.base_price) * 1.3).toLocaleString("fr-FR")}</i>`,
          ].join("\n"), { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_browse_wholesale" }]] });
          return;
        }

        if (data === "lv_my_store_link") {
          const r = await getReseller(sb, chatId);
          if (!r) { await sendMessage(chatId, "🔒 Profil revendeur requis."); return; }
          const link = r.personal_link || makeLink(chatId, "shop");
          if (!r.personal_link) {
            await sb.from("lv_resellers").update({ personal_link: link }).eq("id", r.id);
          }
          await sendWithMenu(chatId, [
            `🔗 <b>Mon lien de boutique</b>`,
            ``,
            `<code>${link}</code>`,
            ``,
            `Partage ce lien à tes clients. Ils verront uniquement tes produits sélectionnés.`,
          ].join("\n"));
          return;
        }

        // ── Vendeur onboarding ────────────────────────────────────────────────
        if (data === "lv_be_vendor") {
          const existing = await getVendor(sb, chatId);
          if (existing) { await sendVendorDashboard(chatId, existing, sb); return; }
          await setBotState(sb, chatId, "lv_await_vendor_name", {});
          await sendMessage(chatId, [
            `👤 <b>Devenir Vendeur (Apporteur d'affaires)</b>`,
            ``,
            `Tu partages un lien général et touches une commission sur chaque vente générée.`,
            ``,
            `Quel est ton nom complet ?`,
          ].join("\n"), { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_home" }]] });
          return;
        }

        if (data === "lv_vendor_link") {
          const v = await getVendor(sb, chatId);
          if (!v) { await sendMessage(chatId, "🔒 Profil vendeur requis."); return; }
          const link = v.referral_link || makeLink(chatId, "ref");
          await sendWithMenu(chatId, `🔗 <b>Mon lien d'apporteur</b>\n\n<code>${link}</code>\n\nChaque achat via ce lien te rapporte une commission.`);
          return;
        }

        // ── Livreur onboarding ────────────────────────────────────────────────
        if (data === "lv_be_delivery") {
          const existing = await getDelivery(sb, chatId);
          if (existing) { await sendDeliveryDashboard(chatId, existing, sb); return; }
          await setBotState(sb, chatId, "lv_await_delivery_name", {});
          await sendMessage(chatId, [
            `🚚 <b>Devenir Livreur</b>`,
            ``,
            `Tu reçois des notifications textuelles pour chaque livraison disponible.`,
            ``,
            `Quel est ton nom complet ?`,
          ].join("\n"), { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_home" }]] });
          return;
        }

        if (data === "lv_toggle_availability") {
          const d = await getDelivery(sb, chatId);
          if (!d) return;
          await sb.from("lv_delivery_persons").update({ is_available: !d.is_available }).eq("id", d.id);
          await sendMessage(chatId, `${!d.is_available ? "🟢 Tu es maintenant disponible !" : "🔴 Tu es maintenant indisponible."}`, {
            inline_keyboard: [[{ text: "📊 Dashboard", callback_data: "lv_dashboard" }]],
          });
          return;
        }

        // ── Livraison : prendre une mission ───────────────────────────────────
        if (data.startsWith("lv_take_delivery:")) {
          const delivId = data.slice(17);
          const courier = await getDelivery(sb, chatId);
          if (!courier) { await sendMessage(chatId, "🔒 Crée d'abord ton profil livreur."); return; }
          const { data: deliv } = await sb.from("lv_deliveries")
            .select("*").eq("id", delivId).eq("status","pending").maybeSingle();
          if (!deliv) {
            await sendMessage(chatId, "❌ Mission déjà prise ou introuvable.");
            return;
          }
          await sb.from("lv_deliveries").update({
            delivery_person_id: courier.id, status: "locked", locked_at: new Date().toISOString(),
          }).eq("id", delivId);
          await sendMessage(chatId, [
            `✅ <b>Mission verrouillée !</b>`,
            ``,
            `👤 Client : <b>${escapeHtml(deliv.buyer_name || "Client")}</b>`,
            `📍 Zone : <b>${escapeHtml(deliv.zone || "Non précisé")}</b>`,
            `📞 Tél : <b>${escapeHtml(deliv.buyer_phone || "Non précisé")}</b>`,
            `💰 Gain : <b>${Number(deliv.amount_fcfa).toLocaleString("fr-FR")} FCFA</b>`,
          ].join("\n"), {
            inline_keyboard: [
              [{ text: "📦 Marquer comme livré", callback_data: `lv_delivered:${delivId}` }],
              [{ text: "◀ Dashboard",             callback_data: "lv_dashboard" }],
            ],
          });
          return;
        }

        if (data.startsWith("lv_delivered:")) {
          const delivId = data.slice(13);
          const courier = await getDelivery(sb, chatId);
          if (!courier) return;
          const { data: deliv } = await sb.from("lv_deliveries")
            .select("*").eq("id", delivId).eq("delivery_person_id", courier.id).maybeSingle();
          if (!deliv || deliv.status === "delivered") {
            await sendMessage(chatId, deliv?.status === "delivered" ? "✅ Déjà livré." : "❌ Mission introuvable.");
            return;
          }
          await sb.from("lv_deliveries").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", delivId);
          const gain = Number(deliv.amount_fcfa || 0);
          await sb.from("lv_delivery_persons").update({
            lv_wallet_balance: (Number(courier.lv_wallet_balance || 0) + gain),
          }).eq("id", courier.id);
          await sendWithMenu(chatId, [
            `🎉 <b>Livraison confirmée !</b>`,
            ``,
            `💰 +<b>${gain.toLocaleString("fr-FR")} FCFA</b> crédité sur ton wallet.`,
            `👛 Nouveau solde : <b>${(Number(courier.lv_wallet_balance||0)+gain).toLocaleString("fr-FR")} FCFA</b>`,
          ].join("\n"));
          return;
        }

        // ── Retrait ───────────────────────────────────────────────────────────
        if (data === "lv_withdraw") {
          await startWithdrawal(chatId, sb);
          return;
        }

        // ── Support ───────────────────────────────────────────────────────────
        if (data === "lv_support") {
          const adminChatId = Deno.env.get("ADMIN_CHAT_ID");
          await sendWithMenu(chatId, [
            `📞 <b>Support ${PLATFORM}</b>`,
            ``,
            `Notre équipe est disponible 7j/7 pour t'aider.`,
            adminChatId ? `\n💬 Contacte l'admin directement : @livrauto_support` : "",
            ``,
            `Ou décris ton problème ici, l'IA va t'orienter.`,
          ].filter(Boolean).join("\n"));
          return;
        }

        // Fallback callback
        await sendMessage(chatId, welcomeMsg(firstName), WELCOME_KB);
        return;
      }

      // ── Messages texte ──────────────────────────────────────────────────────
      if (update.message?.text) {
        const chatId    = update.message.chat.id;
        const tgUserId  = update.message.from?.id ?? 0;
        const firstName = update.message.from?.first_name || "ami";
        const text      = update.message.text.trim();

        // /start — avec paramètre de lien (grossiste → revendeur, revendeur → acheteur)
        if (text.startsWith("/start")) {
          const param = text.split(" ")[1] || "";
          await clearBotState(sb, chatId);

          if (param.startsWith("join_reseller_")) {
            const wholesalerChatId = Number(param.replace("join_reseller_",""));
            const w = await getWholesaler(sb, wholesalerChatId);
            if (w) {
              await setBotState(sb, chatId, "lv_await_reseller_name", { wholesalerId: w.id });
              await sendMessage(chatId, [
                `📦 <b>Rejoindre ${escapeHtml(w.shop_name || "ce grossiste")}</b>`,
                ``,
                `Tu es invité à devenir revendeur de <b>${escapeHtml(w.shop_name || "ce grossiste")}</b>.`,
                ``,
                `Quel est ton nom complet ?`,
              ].join("\n"), { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_home" }]] });
              return;
            }
          }

          if (param.startsWith("shop_")) {
            const resellerChatId = Number(param.replace("shop_",""));
            const link = makeLink(resellerChatId, "shop");
            await sendBuyerCatalog(chatId, sb, link);
            return;
          }

          if (param.startsWith("ref_")) {
            const vendorChatId = Number(param.replace("ref_",""));
            const v = await getVendor(sb, vendorChatId);
            if (v) await sb.from("lv_vendors").update({ total_referrals: (v.total_referrals||0)+1 }).eq("id", v.id);
          }

          await sendMessage(chatId, welcomeMsg(firstName), WELCOME_KB);
          return;
        }

        if (text === "/dashboard" || text === "/pro") {
          const [w, r, v, d] = await Promise.all([
            getWholesaler(sb, chatId), getReseller(sb, chatId),
            getVendor(sb, chatId), getDelivery(sb, chatId),
          ]);
          if (w) await sendWholesalerDashboard(chatId, w, sb);
          else if (r) await sendResellerDashboard(chatId, r, sb);
          else if (v) await sendVendorDashboard(chatId, v, sb);
          else if (d) await sendDeliveryDashboard(chatId, d, sb);
          else await sendMessage(chatId, welcomeMsg(firstName), WELCOME_KB);
          return;
        }

        // ── State machine — saisies conversationnelles ─────────────────────
        const session = await getBotState(sb, chatId);

        // Grossiste : nom de boutique
        if (session?.state === "lv_await_shop_name") {
          if (text.length < 2) { await sendMessage(chatId, "⚠️ Nom trop court."); return; }
          const link = makeLink(chatId, "join_reseller");
          await sb.from("lv_wholesalers").insert({
            telegram_chat_id: chatId, shop_name: text, full_name: firstName,
            recruitment_link: link, is_active: true,
          });
          await clearBotState(sb, chatId);
          const w = await getWholesaler(sb, chatId);
          await sendWholesalerDashboard(chatId, w, sb);
          return;
        }

        // Saisie produit supprimée : flux redirigé vers formulaire web (/ajouter-produit)

        // Grossiste : modifier prix produit
        if (session?.state === "lv_await_new_price") {
          const d = session.data as any;
          const price = parseFloat(text.replace(/[^0-9.]/g,""));
          if (isNaN(price) || price <= 0) { await sendMessage(chatId, "⚠️ Prix invalide."); return; }
          await sb.from("lv_products").update({ base_price: price }).eq("id", d.prodId);
          await clearBotState(sb, chatId);
          await sendMessage(chatId, `✅ Prix mis à jour : <b>${price.toLocaleString("fr-FR")} FCFA</b>`, {
            inline_keyboard: [[{ text: "📋 Mes produits", callback_data: "lv_my_products" }]],
          });
          return;
        }

        if (session?.state === "lv_await_new_stock") {
          const d = session.data as any;
          const stock = parseInt(text.replace(/[^0-9]/g,""),10);
          if (isNaN(stock) || stock < 0) { await sendMessage(chatId, "⚠️ Stock invalide."); return; }
          await sb.from("lv_products").update({ stock }).eq("id", d.prodId);
          await clearBotState(sb, chatId);
          await sendMessage(chatId, `✅ Stock mis à jour : <b>${stock}</b>`, {
            inline_keyboard: [[{ text: "📋 Mes produits", callback_data: "lv_my_products" }]],
          });
          return;
        }

        // Revendeur : nom
        if (session?.state === "lv_await_reseller_name") {
          if (text.length < 2) { await sendMessage(chatId, "⚠️ Nom trop court."); return; }
          const d = session.data as any;
          const link = makeLink(chatId, "shop");
          await sb.from("lv_resellers").insert({
            telegram_chat_id: chatId, full_name: text,
            wholesaler_id: d.wholesalerId || null,
            personal_link: link, lv_wallet_balance: 0, is_active: true,
          });
          await clearBotState(sb, chatId);
          const r = await getReseller(sb, chatId);
          await sendResellerDashboard(chatId, r, sb);
          return;
        }

        // Revendeur : prix de revente
        if (session?.state === "lv_await_retail_price") {
          const d = session.data as any;
          const retail = parseFloat(text.replace(/[^0-9.]/g,""));
          if (isNaN(retail) || retail <= Number(d.basePrice || 0)) {
            await sendMessage(chatId, `⚠️ Prix doit être supérieur à ${Number(d.basePrice).toLocaleString("fr-FR")} FCFA.`);
            return;
          }
          // RBAC : tag author_role pour que ce produit soit visible aux Acheteurs
          await sb.from("lv_reseller_products").upsert({
            reseller_id: d.resellerId, product_id: d.prodId,
            retail_price: retail, is_active: true,
            author_role: 'revendeur',   // Publication Revendeur → visible Acheteurs
          }, { onConflict: "reseller_id,product_id" });
          await clearBotState(sb, chatId);
          const platformCut = Math.round(retail * PLATFORM_FEE_PCT);
          const grossistePays = Number(d.basePrice || 0);
          const myGain = Math.max(0, retail - platformCut - grossistePays);
          await sendWithMenu(chatId, [
            `✅ <b>${escapeHtml(d.baseName || "Produit")} ajouté à ta boutique !</b>`,
            ``,
            `💰 Ton prix : <b>${retail.toLocaleString("fr-FR")} FCFA</b>`,
            `🏦 Plateforme (-10%) : -${platformCut.toLocaleString("fr-FR")} FCFA`,
            `🏗️ Grossiste : -${grossistePays.toLocaleString("fr-FR")} FCFA`,
            `💵 <b>Ton gain net/vente : ${myGain.toLocaleString("fr-FR")} FCFA</b>`,
          ].join("\n"), [
            [{ text: "🛍️ Ajouter d'autres produits", callback_data: "lv_browse_wholesale" }],
          ]);
          return;
        }

        // RBAC : Grossiste → Vendeur — prix de revente saisi
        if (session?.state === "lv_await_gv_price") {
          const d = session.data as any;
          const retail = parseFloat(text.replace(/[^0-9.]/g,""));
          if (isNaN(retail) || retail <= Number(d.basePrice || 0)) {
            await sendMessage(chatId, `⚠️ Le prix doit être supérieur à ${Number(d.basePrice).toLocaleString("fr-FR")} FCFA.`);
            return;
          }
          // Upsert dans lv_vendor_products
          const { error } = await sb.from("lv_vendor_products").upsert({
            wholesaler_id: d.wholesalerId,
            vendor_id:     d.vendorId,
            product_id:    d.prodId,
            retail_price:  retail,
            is_active:     true,
          }, { onConflict: "vendor_id,product_id" });

          await clearBotState(sb, chatId);

          if (error) {
            await sendMessage(chatId, `❌ Erreur lors de l'affectation : ${error.message}`);
            return;
          }

          const platformCut = Math.round(retail * PLATFORM_FEE_PCT);
          const vendeurGain = Math.max(0, retail - platformCut - Number(d.basePrice || 0));
          await sendWithMenu(chatId, [
            `✅ <b>Produit affecté avec succès !</b>`,
            ``,
            `📦 <b>${escapeHtml(d.productName || "Produit")}</b>`,
            `💰 Prix de revente : <b>${retail.toLocaleString("fr-FR")} FCFA</b>`,
            `🏦 Plateforme (-10%) : -${platformCut.toLocaleString("fr-FR")} FCFA`,
            `🏗️ Ton prix de base : -${Number(d.basePrice).toLocaleString("fr-FR")} FCFA`,
            `💵 Gain net Vendeur/vente : ${vendeurGain.toLocaleString("fr-FR")} FCFA`,
            ``,
            `<i>Le produit est maintenant visible dans la vitrine Acheteurs du Vendeur.</i>`,
          ].join("\n"), [
            [{ text: "🏗️→👤 Affecter à un autre Vendeur", callback_data: "lv_assign_to_vendor" }],
          ]);
          return;
        }

        // Vendeur : nom
        if (session?.state === "lv_await_vendor_name") {
          if (text.length < 2) { await sendMessage(chatId, "⚠️ Nom trop court."); return; }
          const link = makeLink(chatId, "ref");
          await sb.from("lv_vendors").insert({
            telegram_chat_id: chatId, full_name: text,
            referral_link: link, lv_wallet_balance: 0,
          });
          await clearBotState(sb, chatId);
          const v = await getVendor(sb, chatId);
          await sendVendorDashboard(chatId, v, sb);
          return;
        }

        // Livreur : nom
        if (session?.state === "lv_await_delivery_name") {
          if (text.length < 2) { await sendMessage(chatId, "⚠️ Nom trop court."); return; }
          await setBotState(sb, chatId, "lv_await_delivery_phone", { name: text });
          await sendMessage(chatId, "📞 Ton numéro de téléphone ?", { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_home" }]] });
          return;
        }

        if (session?.state === "lv_await_delivery_phone") {
          const d = session.data as any;
          await setBotState(sb, chatId, "lv_await_delivery_zone", { ...d, phone: text });
          await sendMessage(chatId, "📍 Ta zone de livraison ? (quartier / ville)", { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_home" }]] });
          return;
        }

        if (session?.state === "lv_await_delivery_zone") {
          const d = session.data as any;
          await sb.from("lv_delivery_persons").insert({
            telegram_chat_id: chatId, full_name: d.name, phone: d.phone,
            zone: text, has_gps: false, is_available: true, lv_wallet_balance: 0,
          });
          await clearBotState(sb, chatId);
          const del = await getDelivery(sb, chatId);
          await sendDeliveryDashboard(chatId, del, sb);
          return;
        }

        // Retrait : montant
        if (session?.state === "lv_await_withdraw_amount") {
          const d = session.data as any;
          const amount = parseFloat(text.replace(/[^0-9.]/g,""));
          if (isNaN(amount) || amount < MIN_WITHDRAWAL || amount > Number(d.balance)) {
            await sendMessage(chatId, `⚠️ Montant invalide. Solde dispo : ${Number(d.balance).toLocaleString("fr-FR")} FCFA | Min : ${MIN_WITHDRAWAL.toLocaleString("fr-FR")} FCFA.`);
            return;
          }
          await setBotState(sb, chatId, "lv_await_withdraw_phone", { ...d, amount });
          await sendMessage(chatId, `📞 Numéro Mobile Money pour recevoir <b>${amount.toLocaleString("fr-FR")} FCFA</b> ?`, {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "lv_dashboard" }]],
          });
          return;
        }

        if (session?.state === "lv_await_withdraw_phone") {
          const d = session.data as any;
          await setBotState(sb, chatId, "lv_await_withdraw_provider", { ...d, phone: text });
          await sendMessage(chatId, "🏦 Quel opérateur ?", {
            inline_keyboard: [
              [{ text: "🟡 MTN",    callback_data: "lv_wprov:mtn"    },
               { text: "🔵 Moov",  callback_data: "lv_wprov:moov"   }],
              [{ text: "🟠 Orange",callback_data: "lv_wprov:orange"  }],
              [{ text: "❌ Annuler", callback_data: "lv_dashboard" }],
            ],
          });
          return;
        }

        // ── Message libre — recherche produit ou Groq IA ──────────────────────
        await sendAction(chatId);
        const [w, r, v, d] = await Promise.all([
          getWholesaler(sb, chatId), getReseller(sb, chatId),
          getVendor(sb, chatId), getDelivery(sb, chatId),
        ]);
        const role = w ? "grossiste" : r ? "revendeur" : v ? "vendeur" : d ? "livreur" : "visiteur";
        const actor = w || r || v || d;
        const balance = actor ? Number(actor.lv_wallet_balance || 0) : null;
        const actorName = actor ? (actor.full_name || actor.shop_name || firstName) : firstName;

        // Si l'utilisateur est acheteur/visiteur → tenter une recherche produit
        if (!w && !r && !d) {
          const keyword = detectProductSearch(text);
          if (keyword) {
            const found = await searchProductsForBuyer(sb, keyword);
            const appUrl = Deno.env.get("APP_URL") || "https://betesim.vercel.app";
            const vitrineUrl = `${appUrl}/vitrine?chatId=${chatId}`;

            if (found.length > 0) {
              const prodButtons = found.map((p:any) => [{
                text: `🛍️ ${p.name}${p.price ? ` — ${Number(p.price).toLocaleString("fr-FR")} F` : ""}`,
                url: `${appUrl}/vitrine?chatId=${chatId}&id=${p.id}`,
              }]);
              await sendMessage(chatId, [
                `🔍 J'ai trouvé <b>${found.length} produit${found.length>1?"s":""}</b> pour « ${escapeHtml(keyword)} » :`,
                ``,
                `Clique sur un produit pour voir la publication et l'ajouter au panier.`,
              ].join("\n"), {
                inline_keyboard: [
                  ...prodButtons,
                  [{ text: "😕 Pas satisfait ? Voir toute la vitrine", url: vitrineUrl }],
                  [{ text: "🛒 Mon Panier", callback_data: "lv_cart" }],
                ],
              });
              return;
            } else {
              // Aucun résultat → lien vers vitrine complète
              await sendMessage(chatId, [
                `😕 Je n'ai pas trouvé de produit pour « ${escapeHtml(keyword)} ».`,
                ``,
                `Mais notre vitrine regroupe tous les produits disponibles ! 👇`,
              ].join("\n"), {
                inline_keyboard: [
                  [{ text: "🌐 Voir toute la vitrine", url: vitrineUrl }],
                  [{ text: "🛍️ Parcourir le catalogue", callback_data: "lv_catalog" }],
                ],
              });
              return;
            }
          }
        }

        let ctx = role !== "visiteur"
          ? `L'utilisateur est ${role} sur ${PLATFORM}. Prénom : ${actorName}. Solde wallet : ${balance !== null ? balance.toLocaleString('fr-FR') + ' FCFA' : 'inconnu'}.`
          : "";
        // Acheteur/visiteur → injecter le catalogue réel pour que Groq réponde précisément
        if (!w && !r && !v && !d) {
          const catalog = await fetchCatalogForGroq(sb);
          if (catalog) ctx = catalog;
        }
        const reply = await askGroq(text, firstName, ctx);
        await sendWithMenu(chatId, reply || `Bonjour ${escapeHtml(firstName)} ! 👋 Comment puis-je t'aider ?`);
        return;
      }

      // Opérateur retrait (callback dans le flux withdrawal)
      if (update.callback_query?.data?.startsWith("lv_wprov:")) {
        const cb = update.callback_query;
        const chatId = cb.message.chat.id;
        const provider = cb.data.slice(9);
        await answerCallback(cb.id);
        const session = await getBotState(sb, chatId);
        if (session?.state !== "lv_await_withdraw_provider") {
          await sendMessage(chatId, welcomeMsg(cb.from.first_name || "ami"), WELCOME_KB);
          return;
        }
        const d = session.data as any;
        await sb.from("lv_withdrawal_requests").insert({
          actor_type: d.actorType, actor_chat_id: chatId,
          amount_fcfa: d.amount, phone_number: d.phone, provider, status: "pending",
        });
        // Déduire du wallet
        const table = d.actorType === "wholesaler" ? "lv_wholesalers"
          : d.actorType === "reseller" ? "lv_resellers"
          : d.actorType === "vendor" ? "lv_vendors" : "lv_delivery_persons";
        await sb.from(table).update({ lv_wallet_balance: Number(d.balance) - Number(d.amount) })
          .eq("telegram_chat_id", chatId);
        await clearBotState(sb, chatId);
        await sendWithMenu(chatId, [
          `✅ <b>Demande de retrait enregistrée !</b>`,
          ``,
          `💰 Montant : <b>${Number(d.amount).toLocaleString("fr-FR")} FCFA</b>`,
          `📞 Numéro : <b>${d.phone}</b>`,
          `🏦 Opérateur : <b>${provider.toUpperCase()}</b>`,
          ``,
          `Traitement sous 24-48h. Tu recevras une notification.`,
        ].join("\n"));
        return;
      }

    } catch (err: any) {
      console.error("[livrauto] Erreur:", err?.message, err?.stack?.slice(0,500));
    }
  })();

  EdgeRuntime.waitUntil(processing);
  return new Response("ok", { status: 200 });
});
