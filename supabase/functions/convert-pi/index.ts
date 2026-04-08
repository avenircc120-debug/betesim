import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // ─── 1. Vérification JWT via getUser() ──────────────────────────────────
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
    const { amount_pi, timestamp } = body;

    // ─── 2. Anti-replay : rejeter les requêtes > 30 secondes ─────────────────
    if (timestamp && Math.abs(Date.now() - Number(timestamp)) > 30_000) {
      return new Response(JSON.stringify({ error: "Requête expirée. Veuillez réessayer." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. Validation du montant ─────────────────────────────────────────────
    if (!amount_pi || typeof amount_pi !== "number" || amount_pi <= 0 || amount_pi > 100_000) {
      return new Response(JSON.stringify({ error: "Montant invalide (doit être entre 0 et 100 000 π)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── 4. Taux de conversion actuel ─────────────────────────────────────────
    const { data: rateData } = await adminClient
      .from("conversion_rates")
      .select("pi_to_fcfa")
      .order("effective_at", { ascending: false })
      .limit(1)
      .single();

    const rate = rateData?.pi_to_fcfa ?? 1;
    const amount_fcfa = Math.floor(amount_pi * rate);

    // ─── 5. Vérification du solde côté serveur ───────────────────────────────
    const { data: profile } = await adminClient
      .from("profiles")
      .select("pi_balance, fcfa_balance")
      .eq("id", userId)
      .single();

    if (!profile || profile.pi_balance < amount_pi) {
      return new Response(JSON.stringify({ error: "Solde π insuffisant pour cette conversion." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 6. Mise à jour atomique des soldes ───────────────────────────────────
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        pi_balance:   profile.pi_balance   - amount_pi,
        fcfa_balance: profile.fcfa_balance + amount_fcfa,
      })
      .eq("id", userId);

    if (updateError) throw updateError;

    // ─── 7. Enregistrement de la transaction ──────────────────────────────────
    await adminClient.from("transactions").insert({
      user_id:     userId,
      type:        "conversion",
      amount_pi,
      amount_fcfa,
      status:      "validated",
      description: `Conversion de ${amount_pi} π → ${amount_fcfa} FCFA (taux : ${rate} FCFA/π)`,
    });

    return new Response(
      JSON.stringify({
        success:          true,
        amount_pi,
        amount_fcfa,
        rate_used:        rate,
        new_pi_balance:   profile.pi_balance   - amount_pi,
        new_fcfa_balance: profile.fcfa_balance + amount_fcfa,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("convert-pi error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur interne." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
