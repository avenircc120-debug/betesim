import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pays épinglés en tête (par ID SMSPool)
const PINNED_IDS = new Set(["1", "2", "23", "55", "24", "79", "68", "22"]);
// 1=USA, 2=UK, 23=France, 55=Spain, 24=Germany, 79=Italy, 68=Brazil, 22=USA Virtual

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!apiKey) throw new Error("SMSPOOL_API_KEY non configurée");

    const url = new URL(req.url);
    let action = "countries";
    let country = "";
    let service = "";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        action  = body.action  ?? url.searchParams.get("action")  ?? "countries";
        country = body.country ?? url.searchParams.get("country") ?? "";
        service = body.service ?? url.searchParams.get("service") ?? "";
      } catch {
        action  = url.searchParams.get("action")  ?? "countries";
        country = url.searchParams.get("country") ?? "";
        service = url.searchParams.get("service") ?? "";
      }
    } else {
      action  = url.searchParams.get("action")  ?? "countries";
      country = url.searchParams.get("country") ?? "";
      service = url.searchParams.get("service") ?? "";
    }

    let result: any[] = [];

    if (action === "countries") {
      // Tous les pays SMSPool
      const res = await fetch("https://api.smspool.net/country/retrieve_all", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);

      const mapped = arr
        .map((c: any) => ({
          id: String(c.ID ?? c.id ?? ""),
          name: c.name ?? c.long_name ?? "",
          short_name: c.short_name ?? c.cc ?? "",
          region: c.region ?? "",
        }))
        .filter((c: any) => c.id && c.name);

      const pinned = mapped.filter((c: any) => PINNED_IDS.has(c.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      const rest = mapped.filter((c: any) => !PINNED_IDS.has(c.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      result = [...pinned, ...rest];

    } else if (action === "all_services") {
      // ── FIX : POST + clé dans le body (Bearer ne fonctionne pas pour cet endpoint) ──
      const params = new URLSearchParams({ key: apiKey });
      const res = await fetch("https://api.smspool.net/service/retrieve_all", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);

      result = arr
        .map((s: any) => ({
          id: String(s.ID ?? s.id ?? ""),
          name: s.name ?? "",
          favourite: Number(s.favourite ?? 0),
        }))
        .filter((s: any) => s.id && s.name)
        .sort((a: any, b: any) => {
          if (a.favourite !== b.favourite) return b.favourite - a.favourite;
          return a.name.localeCompare(b.name);
        });

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

      result = arr
        .map((s: any) => ({
          id: String(s.ID ?? s.id ?? ""),
          name: s.name ?? "",
          instock: Number(s.instock ?? 0),
          price: Number(s.price ?? 0),
        }))
        .filter((s: any) => s.id && s.name)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

    } else if (action === "price_lookup") {
      if (!country || !service) throw new Error("country et service requis");
      const params = new URLSearchParams({ key: apiKey, country });
      const res = await fetch("https://api.smspool.net/service/retrieve_all_country", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      const found = arr.find((s: any) => String(s.ID ?? s.id) === service);
      result = found
        ? [{ id: String(found.ID ?? found.id), name: found.name ?? "", instock: Number(found.instock ?? 0), price: Number(found.price ?? 0) }]
        : [];
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
