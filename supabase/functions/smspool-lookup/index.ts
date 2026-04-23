import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!apiKey) throw new Error("SMSPOOL_API_KEY non configurée");

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "countries";
    const country = url.searchParams.get("country") ?? "";

    let result: any[] = [];

    if (action === "countries") {
      const res = await fetch("https://api.smspool.net/country/retrieve_all", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      result = arr.map((c: any) => ({
        id: String(c.ID ?? c.id ?? ""),
        name: c.name ?? c.long_name ?? "",
        short_name: c.short_name ?? c.cc ?? "",
      })).filter((c: any) => c.id && c.name);
    } else if (action === "services") {
      if (!country) throw new Error("country requis");
      const params = new URLSearchParams({ key: apiKey, country });
      const res = await fetch("https://api.smspool.net/service/retrieve_all_country", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      result = arr.map((s: any) => ({
        id: String(s.ID ?? s.id ?? ""),
        name: s.name ?? "",
        instock: Number(s.instock ?? 0),
        price: Number(s.price ?? 0),
      })).filter((s: any) => s.id && s.name && s.instock > 0);
    }

    return new Response(JSON.stringify({ success: true, data: result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
