/**
 * Edge Function: smspool-webhook
 *
 * Reçoit les webhooks SMSPool lorsqu'un SMS arrive sur un numéro commandé.
 * SMSPool POST : { order_id, sms, full_sms, number, service, country, secret? }
 *
 * URL à configurer dans SMSPool :
 *   https://<project>.supabase.co/functions/v1/smspool-webhook
 *
 * Variable d'env optionnelle : SMSPOOL_WEBHOOK_SECRET
 * Si définie, le webhook doit envoyer le secret dans l'header x-webhook-secret
 * ou dans le champ "secret" du body.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSec  = Deno.env.get("SMSPOOL_WEBHOOK_SECRET") ?? "";

    // ── Parse body ──────────────────────────────────────────────────────────
    const raw = await req.text();
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback : form-urlencoded
      for (const [k, v] of new URLSearchParams(raw).entries()) parsed[k] = v;
    }

    // ── Vérification du secret ──────────────────────────────────────────────
    if (webhookSec) {
      const headerSec = req.headers.get("x-webhook-secret") ?? "";
      const bodySec   = parsed.secret ?? "";
      if (headerSec !== webhookSec && bodySec !== webhookSec) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { order_id, sms, full_sms } = parsed;

    if (!order_id || !sms) {
      return new Response(JSON.stringify({ error: "order_id et sms sont requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Stockage en base ────────────────────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { error } = await admin
      .from("subscriptions")
      .update({
        last_sms_code:  String(sms).trim(),
        last_sms_full:  String(full_sms ?? sms).trim(),
        sms_received_at: new Date().toISOString(),
      })
      .eq("smspool_order_id", order_id);

    if (error) {
      console.error("DB update error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Erreur interne" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
