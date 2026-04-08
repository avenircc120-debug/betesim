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
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Call the credit_mining_earnings function
    const { error } = await adminClient.rpc("credit_mining_earnings");
    if (error) throw error;

    // Check for sessions running only on reserve (no referral boost) and notify
    const { data: lowSpeedSessions } = await adminClient
      .from("mining_sessions")
      .select("user_id, reserve_balance, rate_per_hour")
      .eq("status", "active")
      .lte("reserve_balance", 200)
      .gt("reserve_balance", 0);

    if (lowSpeedSessions && lowSpeedSessions.length > 0) {
      for (const session of lowSpeedSessions) {
        // Check if we already sent a low-speed notification in the last 24h
        const { data: existing } = await adminClient
          .from("notifications")
          .select("id")
          .eq("user_id", session.user_id)
          .eq("type", "low_speed")
          .gte("created_at", new Date(Date.now() - 86400000).toISOString())
          .limit(1);

        if (!existing || existing.length === 0) {
          await adminClient.from("notifications").insert({
            user_id: session.user_id,
            type: "low_speed",
            title: "⚠️ Vitesse en baisse : " + (session.reserve_balance / 720).toFixed(4) + " π/h",
            message: "Votre vitesse de minage diminue. Parrainez des amis pour l'augmenter !",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
