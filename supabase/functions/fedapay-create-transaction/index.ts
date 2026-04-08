import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { amount, description, user_id, payment_type, callback_url } = await req.json();

    if (!amount || !description || !user_id || !payment_type || !callback_url) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants : amount, description, user_id, payment_type, callback_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Récupérer les infos client depuis Supabase ──
    let customerEmail = "client@pireel.com";
    let customerFirstName = "";
    let customerLastName = "";

    try {
      const authHeader = req.headers.get("Authorization");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (authHeader && supabaseUrl && serviceKey) {
        const adminClient = createClient(supabaseUrl, serviceKey);
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await adminClient.auth.getUser(token);

        if (user?.email) customerEmail = user.email;

        const { data: profile } = await adminClient
          .from("profiles")
          .select("full_name")
          .eq("id", user?.id ?? "")
          .maybeSingle();

        if (profile?.full_name) {
          const parts = profile.full_name.trim().split(" ");
          customerFirstName = parts[0] ?? "";
          customerLastName = parts.slice(1).join(" ") || parts[0] || "";
        }
      }
    } catch (_) {}

    // ── Mode sandbox ou live (contrôlé par FP_MODE) ──
    // Secrets à configurer dans Supabase :
    //   FP_MODE          = "sandbox" ou "live"
    //   FP_SECRET_SANDBOX = sk_sandbox_...
    //   FP_SECRET_LIVE    = sk_live_...
    //   FEDAPAY_SECRET_KEY = fallback si les deux ci-dessus sont absents
    const mode = Deno.env.get("FP_MODE") || "sandbox";
    const secretKey =
      mode === "live"
        ? (Deno.env.get("FP_SECRET_LIVE")    || Deno.env.get("FEDAPAY_SECRET_KEY") || "")
        : (Deno.env.get("FP_SECRET_SANDBOX") || Deno.env.get("FEDAPAY_SECRET_KEY") || "");

    if (!secretKey) {
      return new Response(
        JSON.stringify({
          error: `Clé FedaPay manquante. Configurez FP_SECRET_${mode.toUpperCase()} (ou FEDAPAY_SECRET_KEY) dans vos secrets Supabase.`,
          mode,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const environment = (mode === "live" || secretKey.startsWith("sk_live")) ? "live" : "sandbox";

    const apiBase =
      environment === "live"
        ? "https://api.fedapay.com/v1"
        : "https://sandbox-api.fedapay.com/v1";

    const authHeaders = {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    };

    // ── Créer la transaction FedaPay ──
    const txBody = {
      description,
      amount,
      currency: { iso: "XOF" },
      callback_url,
      custom_metadata: { user_id, payment_type },
      customer: {
        email: customerEmail,
        ...(customerFirstName ? { firstname: customerFirstName } : {}),
        ...(customerLastName ? { lastname: customerLastName } : {}),
      },
    };

    const txRes = await fetch(`${apiBase}/transactions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(txBody),
    });

    const txData = await txRes.json();
    console.log(`FedaPay [${environment}] create tx (${txRes.status}):`, JSON.stringify(txData).slice(0, 600));

    if (!txRes.ok) {
      const msg =
        txData?.message ||
        txData?.error ||
        (Array.isArray(txData?.errors) ? txData.errors.join(", ") : null) ||
        JSON.stringify(txData);
      throw new Error(`FedaPay create transaction (${txRes.status}): ${msg}`);
    }

    // L'API FedaPay renvoie la transaction sous la clé "v1/transaction"
    const tx =
      txData?.["v1/transaction"] ||
      txData?.["v1"]?.["transaction"] ||
      txData?.transaction ||
      txData?.data ||
      txData;

    const transactionId = tx?.id;
    const paymentUrl = tx?.payment_url;

    if (!transactionId) {
      console.error("Réponse complète FedaPay:", JSON.stringify(txData));
      throw new Error("ID de transaction introuvable dans la réponse FedaPay.");
    }

    // Si l'URL de paiement est déjà dans la réponse (nouveau comportement FedaPay)
    if (paymentUrl) {
      return new Response(
        JSON.stringify({
          payment_url: paymentUrl,
          transaction_id: transactionId,
          environment,
          customer_email: customerEmail,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sinon générer le token séparément (ancien comportement)
    const tokenRes = await fetch(`${apiBase}/transactions/${transactionId}/token`, {
      method: "POST",
      headers: authHeaders,
    });

    const tokenData = await tokenRes.json();
    console.log(`FedaPay [${environment}] token (${tokenRes.status}):`, JSON.stringify(tokenData).slice(0, 300));

    if (!tokenRes.ok) {
      const msg = tokenData?.message || tokenData?.error || JSON.stringify(tokenData);
      throw new Error(`FedaPay token (${tokenRes.status}): ${msg}`);
    }

    const tokenUrl =
      tokenData?.["v1/token"]?.url ||
      tokenData?.token?.url ||
      tokenData?.data?.url ||
      tokenData?.url;

    if (!tokenUrl) {
      console.error("Réponse token complète:", JSON.stringify(tokenData));
      throw new Error("URL de paiement introuvable dans la réponse FedaPay.");
    }

    return new Response(
      JSON.stringify({
        payment_url: tokenUrl,
        transaction_id: transactionId,
        environment,
        customer_email: customerEmail,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fedapay-create-transaction error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
