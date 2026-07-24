/**
 * Edge Function: purchase-from-wallet
 *
 * Permet à l'utilisateur de racheter une SIM en consommant son wallet.
 * Cas d'usage principal : la livraison SMSPool a échoué pour un pays donné,
 * l'argent a été remboursé sur le wallet (avec part bloquée). L'utilisateur
 * veut retenter l'achat sur un autre pays.
 *
 * Règles :
 *   - Le wallet (fcfa_balance, dont fcfa_locked_balance) peut financer
 *     l'achat d'une SIM Simple (2000 FCFA).
 *   - Le Pack Partenaire ne peut PAS être acheté depuis le wallet (il sert à
 *     activer le statut Partenaire et passe par le paiement initial).
 *   - Si la livraison réussit : on débite fcfa_balance de façon ATOMIQUE
 *     (condition gte pour éviter la race condition), et on libère la part
 *     bloquée correspondante (fcfa_locked_balance -= min(prix, locked)).
 *   - Si la livraison échoue : on ne débite rien, l'utilisateur peut retenter
 *     immédiatement sur un autre pays.
 *
 * Le code de réception de paiement (FedaPay/MoMo) n'est pas touché.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMSPOOL_BASE = "https://api.smspool.net";
const MAX_ATTEMPTS = 5;

const SECURITY_TIPS = [
  "Utilisez la 4G/5G mobile (pas le WiFi) pour recevoir votre SMS de vérification.",
  "Activez immédiatement la double authentification (2FA) sur le compte créé.",
  "Ne partagez jamais ce numéro ou le code reçu avec un tiers.",
  "Le numéro est valide 30 jours — renouvelez avant expiration pour le conserver.",
];

const SERVICE_MAP: Record<string, string> = {
  whatsapp: "WhatsApp", telegram: "Telegram", signal: "Signal", viber: "Viber",
  line: "Line", wechat: "WeChat", skype: "Skype", tiktok: "TikTok",
  instagram: "Instagram", facebook: "Facebook", twitter: "Twitter", snapchat: "Snapchat",
  linkedin: "LinkedIn", pinterest: "Pinterest", reddit: "Reddit", discord: "Discord",
  steam: "Steam", twitch: "Twitch", netflix: "Netflix", spotify: "Spotify",
  tinder: "Tinder", bumble: "Bumble", google: "Google", apple: "Apple",
  amazon: "Amazon", paypal: "PayPal", airbnb: "Airbnb", uber: "Uber",
  shein: "Shein", aliexpress: "AliExpress", ebay: "eBay", shopee: "Shopee",
};

async function smspoolPost(endpoint: string, body: Record<string, string>, apiKey: string) {
  const params = new URLSearchParams({ key: apiKey, ...body });
  const res = await fetch(`${SMSPOOL_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`SMSPool error ${res.status}`);
  return res.json();
}

async function deliverValidNumber(service: string, apiKey: string, country: string) {
  let attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const data = await smspoolPost("/purchase/sms/", { country, service }, apiKey);
    if (!data.success || !data.number) {
      if (attempts >= MAX_ATTEMPTS) throw new Error(data.message ?? "Aucun numéro disponible");
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    const check = await smspoolPost("/sms/check/", { order_id: data.order_id }, apiKey);
    if (check.status === 6 || check.status === 3) {
      await smspoolPost("/request/cancel/", { order_id: data.order_id }, apiKey);
      continue;
    }
    return { orderId: data.order_id, number: data.number, country: data.country, attempts };
  }
  throw new Error(`Aucun numéro valide après ${MAX_ATTEMPTS} tentatives`);
}


    // ── Règles tarifaires betesim ─────────────────────────────────────────────────
    // 1 Coin = 100 FCFA
    const AFRICAN_NAMES_PW = new Set([
    "benin","bj","egypt","eg","ethiopia","et","uganda","ug","mali","ml",
    "mauritania","mr","mauritius","mu","rwanda","rw","eritrea","er",
    "nigeria","ng","ghana","gh","senegal","sn","ivory coast","côte d'ivoire","ci",
    "cameroon","cm","kenya","ke","tanzania","tz","mozambique","mz","zambia","zm",
    "zimbabwe","zw","south africa","za","morocco","ma","algeria","dz","tunisia","tn",
    "libya","ly","sudan","sd","somalia","so","djibouti","dj","comoros","km",
    "madagascar","mg","seychelles","sc","democratic republic of the congo","cd",
    "republic of the congo","congo","cg","gabon","ga","equatorial guinea","gq",
    "central african republic","cf","chad","td","niger","ne","burkina faso","bf",
    "guinea","gn","guinea-bissau","gw","sierra leone","sl","liberia","lr",
    "togo","tg","gambia","gm","cape verde","cv","sao tome and principe","st",
    "angola","ao","namibia","na","botswana","bw","lesotho","ls","eswatini",
    "swaziland","malawi","mw","south sudan","ss","burundi","bi",
    ]);
    const TELEGRAM_SPECIAL_PW = new Set(["benin","bj","egypt","eg","ethiopia","et","uganda","ug"]);

    function computeSalePriceFcfa_PW(serviceName: string, countryName: string): number {
    const svc = serviceName.toLowerCase().trim();
    const cty = countryName.toLowerCase().trim();
    const isAfrican = AFRICAN_NAMES_PW.has(cty);
    const isWA = svc === "whatsapp";
    const isTG = svc === "telegram";
    if (isAfrican) {
      if (isTG && TELEGRAM_SPECIAL_PW.has(cty)) return 1500;
      return 1000;
    }
    if (isWA) {
      if (cty === "italy") return 10000;
      if (cty === "france") return 7000;
      if (cty === "belgium") return 8486;
      if (cty === "israel") return 8348;
      if (["germany","spain","ireland","ukraine"].includes(cty)) return 5000;
    }
    if (isTG) {
      if (cty === "ukraine") return 9350;
      if (cty === "belgium") return 5606;
      if (["germany","spain","ireland","italy","france","israel"].includes(cty)) return 5000;
    }
    return 2500;
    }

    Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smspoolKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!smspoolKey) throw new Error("SMSPOOL_API_KEY non configurée");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { user_id, service_id, country_id, service_name, country_name, country_short } = body;
    const service = body.service ?? service_name?.toLowerCase() ?? "";
    const country = body.country ?? country_id ?? "0";
    if (!user_id) throw new Error("user_id requis");
    if (!service) throw new Error("service requis");

    // Prix dynamique selon les règles tarifaires betesim
    const saleFcfa = computeSalePriceFcfa_PW(
      service_name || service,
      country_name || country
    );
    const PRICE = Math.ceil(saleFcfa / 100); // 1 Coin = 100 FCFA
    const orderCountry = country || "0";
    const smspoolService = SERVICE_MAP[String(service).toLowerCase()] ?? service;

    // Vérifier le solde wallet
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("coin_balance, fcfa_locked_balance")
      .eq("id", user_id)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    if (!profile) throw new Error("Profil introuvable");

    const balance = (profile as any).coin_balance ?? 0;
    const locked = (profile as any).fcfa_locked_balance ?? 0;
    if (balance < PRICE) {
      throw new Error(`Solde insuffisant. Disponible : ${balance.toLocaleString("fr-FR")} Coins (requis : ${PRICE} Coins).`);
    }

    // Tenter la livraison
    let delivery: Awaited<ReturnType<typeof deliverValidNumber>>;
    try {
      delivery = await deliverValidNumber(smspoolService, smspoolKey, orderCountry);
    } catch (deliveryErr: any) {
      // Pas de débit — l'utilisateur peut retenter sur un autre pays
      await supabase.from("notifications").insert({
        user_id,
        title: "Livraison impossible — réessayez sur un autre pays",
        message: `Aucun numéro ${service_name || service} disponible pour ce pays. Aucun débit sur votre wallet. Sélectionnez un autre pays et relancez l'achat.`,
        type: "payment_failed",
      });
      return new Response(JSON.stringify({
        success: false,
        wallet_charged: false,
        error: deliveryErr.message,
        retry_other_country: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Succès : débit ATOMIQUE du wallet.
    // La condition .gte("coin_balance", PRICE) garantit qu'on ne débite pas
    // si deux requêtes parallèles arrivent en même temps (race condition).
    const releaseLocked = Math.min(PRICE, locked);
    const newBalance = balance - PRICE;
    const newLocked = locked - releaseLocked;
    const { data: updatedRows, error: updErr } = await supabase
      .from("profiles")
      .update({ coin_balance: newBalance, fcfa_locked_balance: newLocked })
      .eq("id", user_id)
      .gte("coin_balance", PRICE)
      .select("id");
    if (updErr) throw new Error(updErr.message);
    if (!updatedRows || updatedRows.length === 0) {
      // Une opération parallèle a déjà débité — on annule le numéro commandé
      await smspoolPost("/request/cancel/", { order_id: delivery.orderId }, smspoolKey);
      throw new Error("Solde Coins insuffisant (opération simultanée détectée).");
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const walletTxId = `wallet_${user_id.slice(0, 8)}_${Date.now()}`;

    await supabase.from("subscriptions").insert({
      user_id,
      number: delivery.number,
      country: delivery.country,
      service,
      smspool_order_id: delivery.orderId,
      fedapay_transaction_id: walletTxId,
      status: "active",
      expires_at: expiresAt,
      attempts: delivery.attempts,
    });

    // Note: wallet purchase logged in subscriptions table above

    await supabase.from("notifications").insert({
      user_id,
      title: "Numéro livré avec succès !",
      message: `Votre numéro ${service} est prêt : ${delivery.number}\n\n${SECURITY_TIPS.join("\n")}`,
      type: "payment_success",
    });

    return new Response(JSON.stringify({
      success: true,
      number: delivery.number,
      service,
      country: delivery.country,
      order_id: delivery.orderId,
      expires_at: expiresAt,
      wallet_charged: true,
      amount_charged: PRICE,
      locked_released: releaseLocked,
      new_balance: newBalance,
      new_locked_balance: newLocked,
      security_tips: SECURITY_TIPS,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    const msg = err?.message ?? String(err) ?? "Erreur interne";
    console.error("purchase-from-wallet error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
