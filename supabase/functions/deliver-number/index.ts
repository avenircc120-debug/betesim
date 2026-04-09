
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIVESIM_BASE = "https://5sim.net/v1";

// All valid 5sim.net service identifiers accepted
// Any service name from 5sim.net catalogue is accepted (whatsapp, tiktok, instagram, etc.)

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

    // Validate service name (alphanumeric only, no injection)
    if (!/^[a-z0-9_]+$/.test(service)) {
      throw new Error("Nom de service invalide");
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

    // Purchase number from 5sim.net (country: any, operator: any)
    const purchaseRes = await fetch(
      `${FIVESIM_BASE}/user/buy/activation/any/any/${service}`,
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
      console.error("5sim error:", errText);
      throw new Error(`Numéro indisponible pour ce service. Essayez un autre service.`);
    }

    const numberData = await purchaseRes.json();
    const virtualNumber = numberData.phone;

    if (!virtualNumber) throw new Error("Numéro non reçu de 5sim");

    const amount = product_type === "partner" ? 2500 : 2000;
    const isPartner = product_type === "partner";

    // Record number purchase transaction
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user.id,
      type: "number_purchase",
      status: "validated",
      amount_fcfa: amount,
      description: `Numéro ${service} — ${virtualNumber}`,
      virtual_number: virtualNumber,
      fedapay_transaction_id: fedapay_transaction_id,
    });

    if (txError) throw txError;

    // If partner pack, activate partner status
    if (isPartner) {
      await supabase
        .from("profiles")
        .update({ is_partner: true })
        .eq("id", user.id);

      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "partner_activation",
        status: "validated",
        amount_fcfa: 0,
        description: "Activation Pack Partenaire — parrainage débloqué",
      });
    }

    // Process referral: check if user was referred by a partner
    const { data: referral } = await supabase
      .from("referrals")
      .select("referrer_id, activated")
      .eq("referred_id", user.id)
      .maybeSingle();

    if (referral?.referrer_id) {
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
          description: `Commission parrainage — filleul a acheté un numéro ${service} (${commission} FCFA)`,
        });
      }

      // Mark referral as activated if not already
      if (!referral.activated) {
        await supabase
          .from("referrals")
          .update({ activated: true })
          .eq("referred_id", user.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        number: virtualNumber,
        service: service,
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
