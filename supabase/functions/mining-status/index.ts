import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Authoritative Server: returns only safe display data for mining sessions
// Never exposes reserve_balance, max_earnings, or internal rates
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

    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch active session but only return sanitized data
    const { data: session } = await adminClient
      .from("mining_sessions")
      .select("id, pi_earned, started_at, ends_at, status, rate_per_hour, machine_type")
      .eq("user_id", userId)
      .eq("status", "active")
      .neq("machine_type", "referral_bonus")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return new Response(
        JSON.stringify({ active: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return only display-safe information
    const daysRemaining = Math.max(0, Math.ceil((new Date(session.ends_at).getTime() - Date.now()) / 86400000));

    return new Response(
      JSON.stringify({
        active: true,
        id: session.id,
        pi_earned: session.pi_earned,
        rate_per_hour: session.rate_per_hour,
        days_remaining: daysRemaining,
        started_at: session.started_at,
        ends_at: session.ends_at,
        // Internal fields like reserve_balance, max_earnings are NEVER sent
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
