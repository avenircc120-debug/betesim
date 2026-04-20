/**
 * Edge Function: expire-subscriptions
 * Appelée par un cron job Supabase (ou manuellement) pour libérer
 * les numéros expirés après 30 jours sans renouvellement.
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find all active subscriptions that have expired
    const { data: expired, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, number, service, country")
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    if (error) throw error;

    const count = expired?.length ?? 0;

    if (count > 0) {
      // Mark them all as expired
      const ids = expired!.map((s) => s.id);
      await supabase
        .from("subscriptions")
        .update({ status: "expired" })
        .in("id", ids);

      // Send notifications to each user
      const notifications = expired!.map((s) => ({
        user_id: s.user_id,
        title: "Numéro expiré",
        message: `Votre numéro ${s.service} (${s.number}) a expiré. Renouvelez pour le conserver.`,
        type: "subscription_expired",
      }));

      await supabase.from("notifications").insert(notifications);

      console.log(`Expired ${count} subscriptions`);
    }

    return new Response(
      JSON.stringify({ success: true, expired_count: count }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("expire-subscriptions error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
