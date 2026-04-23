/**
 * Edge Function: purchase-with-wallet
 * Permet d'acheter une SIM avec le solde wallet (incluant les remboursements bloqués)
 * Appelé quand l'utilisateur veut réutiliser un remboursement pour racheter une SIM
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMSPOOL_BASE = "https://api.smspool.net";
const MAX_ATTEMPTS = 5;

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const smspoolKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!smspoolKey) throw new Error("SMSPOOL_API_KEY non configurée");

    const { service, country, product_type, user_id } = await req.json();
    if (!service || !user_id) throw new Error("service et user_id requis");

    const amount = product_type === "partner" ? 2500 : 2000;

    // Check user balance
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("fcfa_balance, fcfa_locked_balance, is_partner")
      .eq("id", user_id)
      .single();

    if (profileErr || !profile) throw new Error("Profil introuvable");
    if ((profile.fcfa_balance ?? 0) < amount) throw new Error("Solde wallet insuffisant");

    const smspoolService = SERVICE_MAP[service.toLowerCase()] ?? service;
    const orderCountry = country || "0";

    // Try to deliver number
    let delivery: any = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const data = await smspoolPost("/purchase/sms/", {
          country: orderCountry,
          service: smspoolService,
        }, smspoolKey);

        if (!data.success || !data.number) {
          lastErr = data.message ?? "Aucun numéro disponible";
          continue;
        }

        // Quick ban check
        const check = await smspoolPost("/sms/check/", { order_id: data.order_id }, smspoolKey);
        if (check.status === 6 || check.status === 3) {
          await smspoolPost("/request/cancel/", { order_id: data.order_id }, smspoolKey);
          continue;
        }

        delivery = { orderId: data.order_id, number: data.number, country: data.country, attempts: attempt };
        break;
      } catch (e: any) {
        lastErr = e.message;
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (!delivery) {
      // Delivery failed — keep money locked (already in wallet)
      await supabase.from("notifications").insert({
        user_id,
        title: "Livraison impossible",
        message: `Aucun numéro ${service} disponible. Votre solde est conservé. Réessayez dans quelques minutes.`,
        type: "payment_failed",
      });
      throw new Error(`Livraison impossible pour ${service}: ${lastErr}`);
    }

    // Deduct from wallet
    const newBalance = (profile.fcfa_balance ?? 0) - amount;
    const newLocked = Math.max(0, (profile.fcfa_locked_balance ?? 0) - amount);
    await supabase.from("profiles")
      .update({ fcfa_balance: newBalance, fcfa_locked_balance: newLocked })
      .eq("id", user_id);

    const isPartner = product_type === "partner" && !profile.is_partner;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Save subscription
    await supabase.from("subscriptions").insert({
      user_id,
      number: delivery.number,
      country: delivery.country,
      service,
      smspool_order_id: delivery.orderId,
      status: "active",
      expires_at: expiresAt,
      attempts: delivery.attempts,
    });

    // Save transaction
    await supabase.from("transactions").insert({
      user_id,
      type: "wallet_purchase",
      status: "validated",
      amount_fcfa: amount,
      description: `Numéro ${service} (${delivery.country}) acheté avec wallet — ${delivery.number}`,
      virtual_number: delivery.number,
    });

    // Activate partner if needed
    if (isPartner) {
      await supabase.from("profiles").update({ is_partner: true }).eq("id", user_id);
    }

    await supabase.from("notifications").insert({
      user_id,
      title: "Numéro livré !",
      message: `Votre numéro ${service} est prêt : ${delivery.number}`,
      type: "payment_success",
    });

    return new Response(JSON.stringify({
      success: true,
      number: delivery.number,
      country: delivery.country,
      expires_at: expiresAt,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("purchase-with-wallet error:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
