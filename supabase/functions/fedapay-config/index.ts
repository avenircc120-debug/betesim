const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Lire le mode et la clé publique depuis les secrets Supabase ──
  // Pour passer en live : définir FP_MODE=live et FEDAPAY_PUBLIC_KEY=pk_live_... dans vos secrets.
  const mode = Deno.env.get("FP_MODE") || "sandbox";

  const publicKey =
    mode === "live"
      ? (Deno.env.get("FP_PUBLIC_LIVE") || Deno.env.get("FEDAPAY_PUBLIC_KEY"))
      : (Deno.env.get("FP_PUBLIC_SANDBOX") || Deno.env.get("FEDAPAY_PUBLIC_KEY"));

  if (!publicKey) {
    const missing = mode === "live" ? "FP_PUBLIC_LIVE" : "FP_PUBLIC_SANDBOX";
    return new Response(
      JSON.stringify({
        error: `Clé publique FedaPay manquante. Ajoutez le secret "${missing}" dans vos secrets Supabase Edge Functions.`,
        mode,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Auto-détection de l'environnement selon le préfixe de la clé
  const environment = publicKey.startsWith("pk_live_") ? "live" : "sandbox";

  return new Response(
    JSON.stringify({ public_key: publicKey, environment, mode }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
