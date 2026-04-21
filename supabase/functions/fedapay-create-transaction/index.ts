/**
 * Edge Function: fedapay-create-transaction
 *
 * Crée une transaction FedaPay et retourne l'URL de paiement.
 * Le mode sandbox/live est contrôlé par les secrets Supabase :
 *   FP_MODE=sandbox|live (défaut: sandbox)
 *   FP_SECRET_SANDBOX=sk_sandbox_xxxx
 *   FP_SECRET_LIVE=sk_live_xxxx
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const mode = Deno.env.get("FP_MODE") === "live" ? "live" : "sandbox";
    const secretKey = mode === "live"
      ? (Deno.env.get("FP_SECRET_LIVE") ?? Deno.env.get("FEDAPAY_SECRET_KEY_LIVE") ?? "")
      : (Deno.env.get("FP_SECRET_SANDBOX") ?? Deno.env.get("FEDAPAY_SECRET_KEY") ?? "");
    const apiBase = mode === "live"
      ? "https://api.fedapay.com/v1"
      : "https://sandbox-api.fedapay.com/v1";

    if (!secretKey) throw new Error("Clé FedaPay non configurée pour le mode " + mode);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Utilisateur non trouvé");

    const { amount, description, user_id, payment_type, callback_url } = await req.json();

    if (!amount || !description || !callback_url) {
      throw new Error("Paramètres manquants: amount, description, callback_url");
    }

    // Get user email for FedaPay customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    const customerEmail = user.email ?? `${user.id}@betesim.app`;

    // Create FedaPay transaction
    const txPayload = {
      description,
      amount,
      currency: { iso: "XOF" },
      callback_url,
      customer: {
        email: customerEmail,
      },
      metadata: {
        user_id: user_id ?? user.id,
        payment_type: payment_type ?? "number_purchase",
      },
    };

    const txRes = await fetch(`${apiBase}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(txPayload),
    });

    const txData = await txRes.json();

    if (!txRes.ok) {
      console.error("FedaPay create tx error:", JSON.stringify(txData));
      throw new Error(txData?.message ?? "Erreur création transaction FedaPay");
    }

    const transactionId = txData?.v1?.transaction?.id ?? txData?.transaction?.id;
    if (!transactionId) {
      console.error("No transaction ID in response:", JSON.stringify(txData));
      throw new Error("ID transaction FedaPay non reçu");
    }

    // Get payment token
    const tokenRes = await fetch(`${apiBase}/transactions/${transactionId}/token`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("FedaPay token error:", JSON.stringify(tokenData));
      throw new Error(tokenData?.message ?? "Impossible d'obtenir le token de paiement");
    }

    const paymentToken = tokenData?.v1?.token?.token ?? tokenData?.token?.token ?? tokenData?.token;
    if (!paymentToken) {
      console.error("No token in response:", JSON.stringify(tokenData));
      throw new Error("Token de paiement FedaPay non reçu");
    }

    const paymentUrl = `https://checkout.fedapay.com/pay/${paymentToken}`;

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentUrl,
        transaction_id: String(transactionId),
        environment: mode,
        customer_email: customerEmail,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("fedapay-create-transaction error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
