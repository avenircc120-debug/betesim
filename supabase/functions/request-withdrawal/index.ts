import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map provider IDs to FedaPay mobile money network codes
const PROVIDER_NETWORK: Record<string, string> = {
  mtn: "MTN",
  moov: "MOOV",
  orange: "ORANGE",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const body = await req.json();
    const { amount_fcfa, phone_number, provider, timestamp } = body;

    // Anti-replay
    if (timestamp && Math.abs(Date.now() - timestamp) > 30000) {
      return new Response(JSON.stringify({ error: "Requête expirée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate
    if (!amount_fcfa || typeof amount_fcfa !== "number" || amount_fcfa <= 0 || amount_fcfa > 10_000_000) {
      return new Response(JSON.stringify({ error: "Montant invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!phone_number || typeof phone_number !== "string" || phone_number.trim().length < 8) {
      return new Response(JSON.stringify({ error: "Numéro de téléphone invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!provider || !PROVIDER_NETWORK[provider]) {
      return new Response(JSON.stringify({ error: "Opérateur invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check FCFA balance
    const { data: profile } = await adminClient
      .from("profiles")
      .select("fcfa_balance")
      .eq("id", userId)
      .single();

    if (!profile || profile.fcfa_balance < amount_fcfa) {
      return new Response(JSON.stringify({ error: "Solde FCFA insuffisant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct balance immediately (will be refunded if FedaPay fails)
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ fcfa_balance: profile.fcfa_balance - amount_fcfa })
      .eq("id", userId);

    if (updateError) throw updateError;

    const mode = Deno.env.get("FP_MODE") || "sandbox";
    const secretKey =
      mode === "live"
        ? (Deno.env.get("FP_SECRET_LIVE")    || Deno.env.get("FEDAPAY_SECRET_KEY") || "")
        : (Deno.env.get("FP_SECRET_SANDBOX") || Deno.env.get("FEDAPAY_SECRET_KEY") || "");
    const fedapayEnv = (mode === "live" || secretKey.startsWith("sk_live")) ? "live" : "sandbox";
    const fedapayBase = fedapayEnv === "live"
      ? "https://api.fedapay.com/v1"
      : "https://sandbox-api.fedapay.com/v1";

    // Create FedaPay payout transaction
    let fedapayTransactionId: string | null = null;
    let fedapayError: string | null = null;

    try {
      const fedapayRes = await fetch(`${fedapayBase}/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify({
          amount: amount_fcfa,
          currency: { iso: "XOF" },
          description: `Retrait utilisateur`,
          customer: {
            phone_number: {
              number: phone_number.trim(),
              country: "BJ",
            },
          },
          payment_method: PROVIDER_NETWORK[provider],
          metadata: {
            user_id: userId,
            payment_type: "withdrawal",
          },
        }),
      });

      const fedapayData = await fedapayRes.json();

      if (!fedapayRes.ok) {
        fedapayError = fedapayData?.message ?? "Erreur FedaPay";
      } else {
        fedapayTransactionId = fedapayData?.v1?.id?.toString() ?? fedapayData?.id?.toString() ?? null;

        // Send the payout
        if (fedapayTransactionId) {
          await fetch(`${fedapayBase}/payouts/${fedapayTransactionId}/send_now`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${secretKey}` },
          });
        }
      }
    } catch (err) {
      fedapayError = err instanceof Error ? err.message : "Erreur réseau FedaPay";
    }

    // If FedaPay failed, refund the balance
    if (fedapayError) {
      await adminClient
        .from("profiles")
        .update({ fcfa_balance: profile.fcfa_balance })
        .eq("id", userId);

      return new Response(JSON.stringify({ error: `Paiement échoué : ${fedapayError}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create withdrawal record
    const { data: withdrawal, error: withdrawalError } = await adminClient
      .from("withdrawal_requests")
      .insert({
        user_id: userId,
        amount_fcfa,
        phone_number: phone_number.trim(),
        provider,
        payment_method: "mobile_money",
        fedapay_transaction_id: fedapayTransactionId,
        status: "pending",
      })
      .select()
      .single();

    if (withdrawalError) throw withdrawalError;

    // Record transaction
    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "withdrawal",
      amount_fcfa,
      status: "pending",
      description: `Retrait de ${amount_fcfa} FCFA via ${provider.toUpperCase()} (${phone_number.trim()})`,
    });

    return new Response(
      JSON.stringify({ success: true, withdrawal_id: withdrawal.id, amount_fcfa }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Withdrawal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
