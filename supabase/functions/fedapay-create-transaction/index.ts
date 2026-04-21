/**
 * Edge Function: fedapay-create-transaction
 *
 * Secrets Supabase requis (mêmes clés que dans Replit) :
 *   FEDAPAY_SECRET_KEY       — clé secrète sandbox
 *   FEDAPAY_PUBLIC_KEY_SANDBOX — clé publique sandbox
 *   FEDAPAY_SECRET_KEY_LIVE  — clé secrète live (optionnel, pour plus tard)
 *   FEDAPAY_MODE             — "sandbox" (défaut) ou "live"
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

    if (!secretKey) throw new Error("FEDAPAY_SECRET_KEY non configurée dans les secrets Supabase");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Utilisateur non trouvé");

    const { amount, description, user_id, payment_type, callback_url } = await req.json();

    if (!amount || !description || !callback_url) {
      throw new Error("Paramètres manquants: amount, description, callback_url");
    }

    const customerEmail = user.email ?? `${user.id}@betesim.app`;

    // Créer la transaction FedaPay
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
        customer: { email: customerEmail },
        metadata: {
          user_id: user_id ?? user.id,
          payment_type: payment_type ?? "number_purchase",
        },
      }),
    });

    const txData = await txRes.json();
    if (!txRes.ok) {
      console.error("FedaPay create tx error:", JSON.stringify(txData));
      throw new Error(txData?.message ?? "Erreur création transaction FedaPay");
    }

    const transactionId = txData?.v1?.transaction?.id ?? txData?.transaction?.id;
    if (!transactionId) throw new Error("ID transaction FedaPay non reçu");

    // Obtenir le token de paiement
    const tokenRes = await fetch(`${apiBase}/transactions/${transactionId}/token`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData?.message ?? "Impossible d'obtenir le token de paiement");

    const paymentToken = tokenData?.v1?.token?.token ?? tokenData?.token?.token ?? tokenData?.token;
    if (!paymentToken) throw new Error("Token de paiement FedaPay non reçu");

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: `https://checkout.fedapay.com/pay/${paymentToken}`,
        transaction_id: String(transactionId),
        environment: mode,
        customer_email: customerEmail,
        public_key: publicKey,
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
