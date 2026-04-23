/**
 * Edge Function: smspool-lookup
 * Renvoie les pays et services disponibles sur SMSPool
 * action=countries → liste des pays
 * action=services&country=<id> → services pour un pays
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMSPOOL_BASE = "https://api.smspool.net";

async function smspoolGet(endpoint: string, apiKey: string) {
  const res = await fetch(`${SMSPOOL_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`SMSPool GET error ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : Object.values(data);
}

async function smspoolPost(endpoint: string, body: Record<string, string>, apiKey: string) {
  const params = new URLSearchParams({ key: apiKey, ...body });
  const res = await fetch(`${SMSPOOL_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`SMSPool POST error ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : Object.values(data);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!apiKey) throw new Error("SMSPOOL_API_KEY non configurée");

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "countries";
    const country = url.searchParams.get("country") ?? "";

    let result;

    if (action === "countries") {
      const raw = await smspoolGet("/country/retrieve_all", apiKey);
      // Normalize: each country has ID, name, short_name
      result = raw.map((c: any) => ({
        id: String(c.ID ?? c.id ?? ""),
        name: c.name ?? c.long_name ?? "",
        short_name: c.short_name ?? c.cc ?? "",
      })).filter((c: any) => c.id && c.name);
    } else if (action === "services") {
      if (!country) throw new Error("country requis pour action=services");
      const raw = await smspoolPost("/service/retrieve_all_country", { country }, apiKey);
      result = raw.map((s: any) => ({
        id: String(s.ID ?? s.id ?? ""),
        name: s.name ?? "",
        instock: Number(s.instock ?? 0),
        price: Number(s.price ?? 0),
      })).filter((s: any) => s.id && s.name && s.instock > 0);
    } else {
      throw new Error(`action inconnue: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("smspool-lookup error:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
