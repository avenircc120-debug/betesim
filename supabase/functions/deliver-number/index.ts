
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 5sim.net API base URL
const FIVESIM_BASE = "https://5sim.net/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fivesimKey = Deno.env.get("FIVESIM_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Utilisateur non trouvé");

    const { service, product_type, fedapay_transaction_id } = await req.json();

    if (!service || !product_type || !fedapay_transaction_id) {
      throw new Error("Paramètres manquants: service, product_type, fedapay_transaction_id");
    }

    // Check transaction not already processed
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("fedapay_transaction_id", fedapay_transaction_id)
      .maybeSingle();

    if (existingTx) {
      return new Response(JSON.stringify({ error: "Transaction déjà traitée" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Map service to 5sim service name
    const serviceMap: Record<string, string> = {
      whatsapp: "whatsapp",
      tiktok: "tiktok",
    };
    const fivesimService = serviceMap[service];
    if (!fivesimService) throw new Error("Service non supporté");

    // Purchase number from 5sim.net (use "any" country for best availability)
    const purchaseRes = await fetch(
      `${FIVESIM_BASE}/user/buy/activation/any/any/${fivesimService}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${fivesimKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!purchaseRes.ok) {
      const errText = await purchaseRes.text();
      throw new Error(`5sim error: ${errText}`);
    }

    const numberData = await purchaseRes.json();
    const virtualNumber = numberData.phone;

    if (!virtualNumber) throw new Error("Numéro non reçu de 5sim");

    const amount = product_type === "partner" ? 2500 : 2000;
    const isPartner = product_type === "partner";

    // Record transaction
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user.id,
      type: "number_purchase",
      status: "validated",
      amount_fcfa: amount,
      description: `Numéro ${service === "whatsapp" ? "WhatsApp" : "TikTok"} — ${virtualNumber}`,
      virtual_number: virtualNumber,
      fedapay_transaction_id: fedapay_transaction_id,
    });

    if (txError) throw txError;

    // If partner, activate partner status
    if (isPartner) {
      await supabase
        .from("profiles")
        .update({ is_partner: true })
        .eq("id", user.id);

      // Record partner activation transaction
      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "partner_activation",
        status: "validated",
        amount_fcfa: 0,
        description: "Activation Pack Partenaire — parrainage débloqué",
      });
    }

    // Process referral commission if applicable
    const { data: referral } = await supabase
      .from("referrals")
      .select("referrer_id")
      .eq("referred_id", user.id)
      .maybeSingle();

    if (referral?.referrer_id) {
      // Check if referrer is a partner
      const { data: referrerProfile } = await supabase
        .from("profiles")
        .select("is_partner, fcfa_balance")
        .eq("id", referral.referrer_id)
        .single();

      if (referrerProfile?.is_partner) {
        const commission = Math.round(amount * 0.1); // 10% commission
        await supabase
          .from("profiles")
          .update({ fcfa_balance: (referrerProfile.fcfa_balance ?? 0) + commission })
          .eq("id", referral.referrer_id);

        await supabase.from("transactions").insert({
          user_id: referral.referrer_id,
          type: "referral_bonus",
          status: "validated",
          amount_fcfa: commission,
          description: `Commission parrainage — achat numéro filleul (${commission} FCFA)`,
        });
      }
    }

    // Mark referral as activated
    if (referral?.referrer_id) {
      await supabase
        .from("referrals")
        .update({ activated: true })
        .eq("referred_id", user.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        number: virtualNumber,
        service: fivesimService,
        status: "delivered",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("deliver-number error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
