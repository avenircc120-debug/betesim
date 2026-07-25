/**
 * Edge Function: check-sms
 *
 * Vérifie si un SMS de vérification a été reçu pour un numéro commandé.
 * 1. Cherche d'abord dans la table subscriptions (stocké par le webhook).
 * 2. Si pas encore reçu, interroge SMSPool en direct.
 * 3. Stocke le code dans subscriptions pour les appels suivants.
 *
 * Params (GET ou POST JSON) : { order_id: string }
 * Auth : Bearer token Supabase de l'utilisateur
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMSPOOL_BASE = "https://api.smspool.net";

async function pollSMSPool(orderId: string, apiKey: string) {
  const params = new URLSearchParams({ key: apiKey, order_id: orderId });
  const res = await fetch(`${SMSPOOL_BASE}/sms/check/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SMSPool ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smsApiKey  = Deno.env.get("SMSPOOL_API_KEY") ?? "";

    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth:   { persistSession: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Params ──────────────────────────────────────────────────────────────
    const url = new URL(req.url);
    let orderId = url.searchParams.get("order_id") ?? "";

    if (!orderId && req.method === "POST") {
      try {
        const body = await req.json();
        orderId = body.order_id ?? "";
      } catch { /* ignore */ }
    }

    if (!orderId) {
      return new Response(JSON.stringify({ error: "order_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DB lookup ───────────────────────────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: sub, error: subError } = await admin
      .from("subscriptions")
      .select("id, last_sms_code, last_sms_full, sms_received_at, status")
      .eq("smspool_order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError || !sub) {
      return new Response(JSON.stringify({ error: "Abonnement introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Code déjà stocké (webhook ou appel précédent)
    if (sub.last_sms_code) {
      return new Response(JSON.stringify({
        code:        sub.last_sms_code,
        full_sms:    sub.last_sms_full ?? sub.last_sms_code,
        received_at: sub.sms_received_at,
        status:      "received",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Poll SMSPool ─────────────────────────────────────────────────────────
    if (!smsApiKey) {
      return new Response(JSON.stringify({ code: null, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let order: any;
    try {
      order = await pollSMSPool(orderId, smsApiKey);
    } catch (e: any) {
      return new Response(JSON.stringify({ code: null, status: "pending", detail: e.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SMS reçu ?
    const rawCode = order?.sms ?? "";
    if (rawCode && String(rawCode).trim().length > 0) {
      const code    = String(rawCode).trim();
      const fullSms = String(order?.full_sms ?? rawCode).trim();
      const now     = new Date().toISOString();

      await admin
        .from("subscriptions")
        .update({ last_sms_code: code, last_sms_full: fullSms, sms_received_at: now })
        .eq("id", sub.id);

      return new Response(JSON.stringify({
        code,
        full_sms:    fullSms,
        received_at: now,
        status:      "received",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Numéro banni ?
    if (order?.status === 6 || order?.status === 3) {
      return new Response(JSON.stringify({ code: null, status: "banned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ code: null, status: "pending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Erreur interne" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
