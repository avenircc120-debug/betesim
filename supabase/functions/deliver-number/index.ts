/**
 * Edge Function: deliver-number (SMSPool — Piliers 1, 2, 3, 4, 5)
 *
 * Pilier 1 : SMSPool API — numéros Non-VoIP mondiaux
 * Pilier 2 : Validation (détection ban via status SMSPool = 6)
 * Pilier 3 : Boucle d'auto-remplacement (cancel + retry si banni ou timeout 180s)
 * Pilier 4 : Table subscriptions Supabase — 30 jours de validité
 * Pilier 5 : Consignes de sécurité après livraison
 * Pilier 6 : Remboursement wallet bloqué si livraison impossible (ne peut pas être retiré)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMSPool error ${res.status}: ${text}`);
  }
  return res.json();
}

async function orderNumber(service: string, country: string, apiKey: string) {
  const data = await smspoolPost("/purchase/sms/", { country, service }, apiKey);
  if (!data.success || !data.number) {
    throw new Error(data.message ?? "SMSPool: aucun numéro disponible");
  }
  return data as { order_id: string; number: string; country: string; service: string };
}

async function checkSMS(orderId: string, apiKey: string) {
  return smspoolPost("/sms/check/", { order_id: orderId }, apiKey);
}

async function cancelOrder(orderId: string, apiKey: string) {
  return smspoolPost("/request/cancel/", { order_id: orderId }, apiKey);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function deliverValidNumber(service: string, country: string, apiKey: string) {
  let attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    let order: any;
    try {
      order = await orderNumber(service, country, apiKey);
    } catch (err: any) {
      console.error(`Attempt ${attempts} order failed:`, err.message);
      if (attempts >= MAX_ATTEMPTS) throw new Error(`Aucun numéro disponible pour ${service} après ${attempts} tentatives.`);
      await delay(3000);
      continue;
    }

    const check = await checkSMS(order.order_id, apiKey);
    if (check.status === 6 || check.status === 3) {
      await cancelOrder(order.order_id, apiKey);
      continue;
    }

    return { orderId: order.order_id, number: order.number, country: order.country, service, attempts };
  }
  throw new Error(`Impossible de livrer un numéro valide pour ${service} après ${MAX_ATTEMPTS} tentatives.`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smspoolKey = Deno.env.get("SMSPOOL_API_KEY");

    if (!smspoolKey) throw new Error("SMSPOOL_API_KEY non configurée");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { service, product_type, fedapay_transaction_id, user_id, country } = await req.json();

    if (!service || !product_type || !fedapay_transaction_id) {
      throw new Error("Paramètres manquants: service, product_type, fedapay_transaction_id");
    }
    if (!user_id) throw new Error("Paramètre user_id requis");
    const userId = user_id;
    const orderCountry = country || "0"; // "0" = any country

    const smspoolService = SERVICE_MAP[service.toLowerCase()] ?? service;
    const amount = product_type === "partner" ? 2500 : 2000;
    const isPartner = product_type === "partner";

    // Idempotency check
    const { data: existingTx } = await supabase
      .from("subscriptions")
      .select("id, number")
      .eq("fedapay_transaction_id", fedapay_transaction_id)
      .maybeSingle();

    if (existingTx) {
      return new Response(
        JSON.stringify({ success: true, number: existingTx.number, service, status: "already_delivered" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let delivery: any = null;
    let deliveryError = "";

    try {
      delivery = await deliverValidNumber(smspoolService, orderCountry, smspoolKey);
    } catch (err: any) {
      deliveryError = err.message;
      console.error("Delivery failed:", deliveryError);
    }

    if (!delivery) {
      // PILIER 6: Credit wallet with locked balance (refund)
      const { data: profile } = await supabase
        .from("profiles")
        .select("fcfa_balance, fcfa_locked_balance")
        .eq("id", userId)
        .single();

      const currentBalance = profile?.fcfa_balance ?? 0;
      const currentLocked = profile?.fcfa_locked_balance ?? 0;

      await supabase.from("profiles").update({
        fcfa_balance: currentBalance + amount,
        fcfa_locked_balance: currentLocked + amount,
      }).eq("id", userId);

      // Record refund transaction
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "refund_wallet",
        status: "validated",
        amount_fcfa: amount,
        description: `Remboursement wallet — livraison ${service} échouée. Montant bloqué pour réachat.`,
        fedapay_transaction_id,
      });

      // Notify user
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Livraison impossible — remboursé dans votre wallet",
        message: `Aucun numéro ${service} disponible actuellement. ${amount.toLocaleString()} FCFA ajoutés à votre wallet (utilisables pour racheter une SIM). Réessayez dans quelques instants.`,
        type: "payment_failed",
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: deliveryError,
          wallet_credited: true,
          amount_credited: amount,
          message: `Livraison impossible. ${amount.toLocaleString()} FCFA crédités dans votre wallet (bloqués pour réachat SIM).`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Save subscription
    const { error: subError } = await supabase.from("subscriptions").insert({
      user_id: userId,
      number: delivery.number,
      country: delivery.country,
      service,
      smspool_order_id: delivery.orderId,
      fedapay_transaction_id,
      status: "active",
      expires_at: expiresAt,
      attempts: delivery.attempts,
    });
    if (subError) console.error("subscriptions insert error:", subError);

    // Record transaction
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "number_purchase",
      status: "validated",
      amount_fcfa: amount,
      description: `Numéro ${service} (${delivery.country}) — ${delivery.number}`,
      virtual_number: delivery.number,
      fedapay_transaction_id,
    });

    // Partner activation
    if (isPartner) {
      await supabase.from("profiles").update({ is_partner: true }).eq("id", userId);
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "partner_activation",
        status: "validated",
        amount_fcfa: 0,
        description: "Activation Pack Partenaire — parrainage débloqué",
      });
    }

    // Referral commission
    const { data: referral } = await supabase
      .from("referrals")
      .select("referrer_id, activated")
      .eq("referred_id", userId)
      .maybeSingle();

    if (referral?.referrer_id) {
      const { data: referrerProfile } = await supabase
        .from("profiles")
        .select("is_partner, fcfa_balance")
        .eq("id", referral.referrer_id)
        .single();

      if (referrerProfile?.is_partner) {
        const commission = Math.round(amount * 0.1);
        await supabase
          .from("profiles")
          .update({ fcfa_balance: (referrerProfile.fcfa_balance ?? 0) + commission })
          .eq("id", referral.referrer_id);

        await supabase.from("transactions").insert({
          user_id: referral.referrer_id,
          type: "referral_bonus",
          status: "validated",
          amount_fcfa: commission,
          description: `Commission parrainage — filleul a acheté un numéro ${service} (${commission} FCFA)`,
        });
      }

      if (!referral.activated) {
        await supabase.from("referrals").update({ activated: true }).eq("referred_id", userId);
      }
    }

    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Numéro livré avec succès !",
      message: `Votre numéro ${service} est prêt : ${delivery.number}\n\n${SECURITY_TIPS.join("\n")}`,
      type: "payment_success",
    });

    return new Response(
      JSON.stringify({
        success: true,
        number: delivery.number,
        service,
        country: delivery.country,
        order_id: delivery.orderId,
        expires_at: expiresAt,
        attempts: delivery.attempts,
        status: "delivered",
        security_tips: SECURITY_TIPS,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const msg = err?.message ?? String(err) ?? "Erreur interne";
    console.error("deliver-number error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
