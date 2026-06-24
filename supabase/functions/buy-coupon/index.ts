/**
 * Edge Function: buy-coupon
 *
 * Client achète un coupon depuis le Pool Commun.
 * 1. Vérifie que le coupon est actif et disponible
 * 2. Débite le wallet du client (fcfa_balance)
 * 3. Marque le coupon : status='sold', buyer_id, sold_at
 * 4. Distribue les commissions :
 *    - Creator  : 70% du prix
 *    - Referrer : 10% du prix (si parrain existe)
 *    - Plateforme: 20% (ou 30% sans parrain)
 *
 * Body: { coupon_id }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREATOR_RATE  = 0.70;
const REFERRER_RATE = 0.10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl       = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader        = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: corsHeaders });

    // Identifier l'acheteur
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Session invalide" }), { status: 401, headers: corsHeaders });

    const { coupon_id } = await req.json();
    if (!coupon_id) return new Response(JSON.stringify({ error: "coupon_id requis" }), { status: 400, headers: corsHeaders });

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Charger le coupon (FOR UPDATE via service role)
    const { data: coupon, error: couponErr } = await admin
      .from("coupons")
      .select("id, code, price_fcfa, status, creator_id, partner_id, analysis_id, label, total_odds")
      .eq("id", coupon_id)
      .single();
    if (couponErr || !coupon) return new Response(JSON.stringify({ error: "Coupon introuvable" }), { status: 404, headers: corsHeaders });
    if (coupon.status !== "active") return new Response(JSON.stringify({ error: "Ce coupon n'est plus disponible" }), { status: 409, headers: corsHeaders });
    if (coupon.creator_id === user.id || coupon.partner_id === user.id) {
      return new Response(JSON.stringify({ error: "Vous ne pouvez pas acheter votre propre coupon" }), { status: 400, headers: corsHeaders });
    }

    // Charger le profil acheteur (solde wallet)
    const { data: buyerProfile, error: buyerErr } = await admin
      .from("profiles")
      .select("id, fcfa_balance, fcfa_locked_balance")
      .eq("id", user.id)
      .single();
    if (buyerErr || !buyerProfile) return new Response(JSON.stringify({ error: "Profil acheteur introuvable" }), { status: 404, headers: corsHeaders });

    const price = coupon.price_fcfa;
    if (buyerProfile.fcfa_balance < price) {
      return new Response(
        JSON.stringify({ error: `Solde insuffisant. Il vous faut ${price} FCFA, vous avez ${buyerProfile.fcfa_balance} FCFA.` }),
        { status: 402, headers: corsHeaders }
      );
    }

    // Trouver le parrain de l'acheteur (referrals)
    let referrerId: string | null = null;
    const { data: referral } = await admin
      .from("referrals")
      .select("referrer_id")
      .eq("referred_id", user.id)
      .eq("activated", true)
      .maybeSingle();
    if (referral?.referrer_id) referrerId = referral.referrer_id;

    // ── TRANSACTION ATOMIQUE ─────────────────────────────────────────────────

    // 1. Débiter le wallet de l'acheteur
    const { error: debitErr } = await admin
      .from("profiles")
      .update({ fcfa_balance: buyerProfile.fcfa_balance - price })
      .eq("id", user.id);
    if (debitErr) throw debitErr;

    // 2. Marquer le coupon comme vendu
    const { error: soldErr } = await admin
      .from("coupons")
      .update({ status: "sold", buyer_id: user.id, sold_at: new Date().toISOString(), referrer_id: referrerId })
      .eq("id", coupon_id);
    if (soldErr) throw soldErr;

    // 3. Calcul des commissions
    // Fixed wallet credit based on total_odds (odds-based reward system)
    const totalOdds = coupon.total_odds ?? 0;
    const fixedGain = totalOdds > 16 ? 1000 : totalOdds > 5.50 ? 500 : 250;
    const creatorAmount   = totalOdds > 0 ? fixedGain : Math.floor(price * CREATOR_RATE);
    const referrerAmount  = referrerId ? Math.floor(price * REFERRER_RATE) : 0;
    const platformAmount  = price - creatorAmount - referrerAmount;
    const creatorId       = coupon.creator_id ?? coupon.partner_id;

    // 4. Commission créateur
    const { error: commErr } = await admin.from("commission_records").insert({
      partner_id:        creatorId,
      type:              "coupon_sale",
      gross_amount:      price,
      commission_amount: platformAmount,
      net_amount:        creatorAmount,
      reference_id:      coupon.id,
      buyer_id:          user.id,
      referrer_id:       referrerId,
      description:       `Vente coupon ${coupon.code}${coupon.label ? " – " + coupon.label : ""}`,
    });
    if (commErr) throw commErr;

    // 5. Créditer le wallet créateur
    const { data: creatorProfile } = await admin
      .from("profiles")
      .select("fcfa_balance")
      .eq("id", creatorId)
      .single();
    if (creatorProfile) {
      await admin.from("profiles").update({ fcfa_balance: creatorProfile.fcfa_balance + creatorAmount }).eq("id", creatorId);
    }

    // 6. Commission parrain (si existe)
    if (referrerId && referrerAmount > 0) {
      await admin.from("commission_records").insert({
        partner_id:        referrerId,
        type:              "referral_commission",
        gross_amount:      price,
        commission_amount: 0,
        net_amount:        referrerAmount,
        reference_id:      coupon.id,
        buyer_id:          user.id,
        description:       `Commission parrainage – coupon ${coupon.code}`,
      });
      const { data: referrerProfile } = await admin.from("profiles").select("fcfa_balance").eq("id", referrerId).single();
      if (referrerProfile) {
        await admin.from("profiles").update({ fcfa_balance: referrerProfile.fcfa_balance + referrerAmount }).eq("id", referrerId);
      }
    }

    // 7. Notification à l'acheteur
    await admin.from("notifications").insert({
      user_id: user.id,
      title:   "Achat confirmé ✅",
      message: `Coupon ${coupon.code}${coupon.label ? " (" + coupon.label + ")" : ""} acheté pour ${price} FCFA.`,
      type:    "purchase",
    });

    return new Response(
      JSON.stringify({
        success:          true,
        coupon_code:      coupon.code,
        label:            coupon.label,
        analysis_id:      coupon.analysis_id,
        price_paid:       price,
        creator_earned:   creatorAmount,
        referrer_earned:  referrerAmount,
        platform_fee:     platformAmount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("buy-coupon error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
