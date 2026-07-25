/**
 * Edge Function: check-sms
 *
 * Vérifie si un SMS de vérification a été reçu pour un numéro commandé.
 * 1. Cherche d'abord dans la table subscriptions (mis à jour par le webhook).
 * 2. Si pas encore reçu et ordre SMSPool encore actif, interroge SMSPool.
 * 3. Ne lève JAMAIS d'exception : retourne toujours { code, status }.
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

async function safePollSMSPool(
  orderId: string,
  apiKey: string,
): Promise<{ code: string | null; fullSms: string | null; status: string }> {
  try {
    const params = new URLSearchParams({ key: apiKey, order_id: orderId });
    const res = await fetch(`${SMSPOOL_BASE}/sms/check/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(12_000),
    });

    // SMSPool can return 404 HTML for expired/cancelled orders — handle silently
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`SMSPool /sms/check/ returned ${res.status} for order ${orderId}: ${text.slice(0, 100)}`);
      return { code: null, fullSms: null, status: "pending" };
    }

    const data = await res.json().catch(() => null);
    if (!data) return { code: null, fullSms: null, status: "pending" };

    // status 6 = banned, status 3 = cancelled
    if (data.status === 6 || data.status === 3) {
      return { code: null, fullSms: null, status: "expired" };
    }

    // SMS received
    const rawCode = data.sms ?? "";
    if (rawCode && String(rawCode).trim().length > 0) {
      return {
        code: String(rawCode).trim(),
        fullSms: String(data.full_sms ?? rawCode).trim(),
        status: "received",
      };
    }

    return { code: null, fullSms: null, status: "pending" };
  } catch (err: any) {
    // Network error, timeout, etc — treat as pending, not an error
    console.warn(`safePollSMSPool error for ${orderId}:`, err?.message ?? err);
    return { code: null, fullSms: null, status: "pending" };
  }
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
      return new Response(JSON.stringify({ code: null, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth:   { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ code: null, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Params ──────────────────────────────────────────────────────────────
    const url = new URL(req.url);
    let orderId = url.searchParams.get("order_id") ?? "";
    if (!orderId && req.method === "POST") {
      try { const b = await req.json(); orderId = b.order_id ?? ""; } catch { /* ignore */ }
    }
    if (!orderId) {
      return new Response(JSON.stringify({ code: null, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Lookup DB (webhook may have already stored the code) ─────────────────
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, last_sms_code, last_sms_full, sms_received_at, status")
      .eq("smspool_order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    // Code already stored (by webhook or a previous poll)
    if (sub?.last_sms_code) {
      return new Response(JSON.stringify({
        code:        sub.last_sms_code,
        full_sms:    sub.last_sms_full ?? sub.last_sms_code,
        received_at: sub.sms_received_at,
        status:      "received",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sub not found at all — still return pending (webhook flow is primary)
    if (!sub) {
      return new Response(JSON.stringify({ code: null, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Poll SMSPool as fallback (graceful — no throw) ───────────────────────
    if (smsApiKey) {
      const smsResult = await safePollSMSPool(orderId, smsApiKey);

      if (smsResult.status === "received" && smsResult.code) {
        const now = new Date().toISOString();
        // Persist so next call returns instantly
        await admin
          .from("subscriptions")
          .update({
            last_sms_code:  smsResult.code,
            last_sms_full:  smsResult.fullSms ?? smsResult.code,
            sms_received_at: now,
          })
          .eq("id", sub.id);

        return new Response(JSON.stringify({
          code:        smsResult.code,
          full_sms:    smsResult.fullSms ?? smsResult.code,
          received_at: now,
          status:      "received",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // expired/banned → tell frontend but don't crash the UI
      if (smsResult.status === "expired") {
        return new Response(JSON.stringify({ code: null, status: "expired" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // No SMS yet
    return new Response(JSON.stringify({ code: null, status: "pending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    // Never expose internal errors — always return a valid JSON response
    console.error("check-sms unexpected error:", err?.message ?? err);
    return new Response(JSON.stringify({ code: null, status: "pending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
