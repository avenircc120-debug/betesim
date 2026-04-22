/**
 * Edge Function: fedapay-create-transaction
 *
 * NOTE: Cette appli utilise Firebase Auth (pas Supabase Auth).
 * On accepte donc user_id et customer_email envoyés par le frontend.
 *
 * Secrets Supabase requis :
 *   FEDAPAY_SECRET_KEY            — clé secrète sandbox
 *   FEDAPAY_PUBLIC_KEY_SANDBOX    — clé publique sandbox
 *   FEDAPAY_SECRET_KEY_LIVE       — clé secrète live (optionnel)
 *   FEDAPAY_PUBLIC_KEY_LIVE       — clé publique live (optionnel)
 *   FEDAPAY_MODE                  — "sandbox" (défaut) ou "live"
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const mode = Deno.env.get("FEDAPAY_MODE") === "live" ? "live" : "sandbox";

    const secretKey = mode === "live"
      ? (Deno.env.get("FEDAPAY_SECRET_KEY_LIVE") ?? "")
      : (Deno.env.get("FEDAPAY_SECRET_KEY") ?? "");

    const publicKey = mode === "live"
      ? (Deno.env.get("FEDAPAY_PUBLIC_KEY_LIVE") ?? "")
      : (Deno.env.get("FEDAPAY_PUBLIC_KEY_SANDBOX") ?? "");

    const apiBase = mode === "live"
      ? "https://api.fedapay.com/v1"
      : "https://sandbox-api.fedapay.com/v1";

    const checkoutBase = mode === "live"
      ? "https://process.fedapay.com"
      : "https://sandbox-process.fedapay.com";

    if (!secretKey) throw new Error("FEDAPAY_SECRET_KEY non configurée dans les secrets Supabase");

    const body = await req.json().catch(() => ({}));
    const {
      amount,
      description,
      user_id,
      payment_type,
      callback_url,
      customer_email,
    } = body ?? {};

    if (!amount || !description || !callback_url) {
      throw new Error("Paramètres manquants: amount, description, callback_url");
    }
    if (!user_id) throw new Error("Paramètre user_id requis (UID Firebase)");

    const email = customer_email || `${user_id}@betesim.app`;

    const txRes = await fetch(`${apiBase}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description,
        amount,
        currency: { iso: "XOF" },
        callback_url,
        customer: { email },
        metadata: {
          user_id,
          payment_type: payment_type ?? "number_purchase",
        },
      }),
    });

    const txData = await txRes.json();
    if (!txRes.ok) {
      console.error("FedaPay create tx error:", JSON.stringify(txData));
      throw new Error(txData?.message ?? "Erreur création transaction FedaPay");
    }

    const txObject =
      txData?.["v1/transaction"] ??
      txData?.v1?.transaction ??
      txData?.transaction ??
      txData;

    const transactionId = txObject?.id;
    if (!transactionId) {
      console.error("FedaPay tx response:", JSON.stringify(txData));
      throw new Error("ID transaction FedaPay non reçu");
    }

    const tokenRes = await fetch(`${apiBase}/transactions/${transactionId}/token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("FedaPay token error:", JSON.stringify(tokenData));
      throw new Error(tokenData?.message ?? "Impossible d'obtenir le token de paiement");
    }

    const paymentToken =
      tokenData?.token?.token ??
      tokenData?.v1?.token?.token ??
      tokenData?.token ??
      null;

    const paymentUrl =
      tokenData?.url ??
      tokenData?.token?.url ??
      (paymentToken ? `${checkoutBase}/${paymentToken}` : null);

    if (!paymentUrl) {
      console.error("FedaPay token response:", JSON.stringify(tokenData));
      throw new Error("URL de paiement FedaPay non reçue");
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentUrl,
        transaction_id: String(transactionId),
        environment: mode,
        customer_email: email,
        public_key: publicKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = (err as any)?.message ?? String(err) ?? "Erreur interne";
    const errorStack = (err as any)?.stack ?? null;
    console.error("fedapay-create-transaction error:", errorMessage, errorStack);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, stack: errorStack }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
