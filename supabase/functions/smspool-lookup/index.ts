import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PINNED_IDS = new Set(["1", "2", "23", "55", "24", "79", "68", "22"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!apiKey) throw new Error("SMSPOOL_API_KEY non configurée");

    const url = new URL(req.url);
    let action = "countries";
    let country = "";
    let service = "";
    let pairs: { country: string; service: string }[] = [];

    if (req.method === "POST") {
      try {
        const body = await req.json();
        action  = body.action  ?? url.searchParams.get("action")  ?? "countries";
        country = body.country ?? url.searchParams.get("country") ?? "";
        service = body.service ?? url.searchParams.get("service") ?? "";
        pairs   = body.pairs   ?? [];
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

    let result: any = [];

    // ── countries ──────────────────────────────────────────────────────────────
    if (action === "countries") {
      const res = await fetch(`https://api.smspool.net/country/retrieve_all`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      const mapped = arr.map((c: any) => ({
        id: String(c.ID ?? c.id ?? ""),
        name: c.name ?? "",
        short_name: c.short_name ?? c.cc ?? "",
        region: c.region ?? "",
      })).filter((c: any) => c.id && c.name);
      const pinned = mapped.filter((c: any) => PINNED_IDS.has(c.id)).sort((a: any, b: any) => a.name.localeCompare(b.name));
      const rest   = mapped.filter((c: any) => !PINNED_IDS.has(c.id)).sort((a: any, b: any) => a.name.localeCompare(b.name));
      result = [...pinned, ...rest];

    // ── all_services ───────────────────────────────────────────────────────────
    } else if (action === "all_services") {
      const params = new URLSearchParams({ key: apiKey });
      const res = await fetch("https://api.smspool.net/service/retrieve_all", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      result = arr.map((s: any) => ({
        id: String(s.ID ?? s.id ?? ""),
        name: s.name ?? "",
        favourite: Number(s.favourite ?? 0),
      })).filter((s: any) => s.id && s.name)
        .sort((a: any, b: any) => b.favourite - a.favourite || a.name.localeCompare(b.name));

    // ── get_price — GET /request/price (contourne Cloudflare POST) ─────────────
    } else if (action === "get_price") {
      if (!country || !service) throw new Error("country et service requis");
      const res = await fetch(
        `https://api.smspool.net/request/price?key=${apiKey}&country=${country}&service=${service}`
      );
      const raw = await res.json();
      result = { price: Number(raw.price ?? 0), high_price: Number(raw.high_price ?? 0), success_rate: Number(raw.success_rate ?? 0) };

    // ── bulk_prices — prix pour plusieurs paires country+service ───────────────
    } else if (action === "bulk_prices") {
      // pairs = [{ country: "1", service: "907" }, ...]
      if (!pairs.length) throw new Error("pairs requis (tableau de {country, service})");

      const CHUNK = 30;
      const results: any[] = [];
      for (let i = 0; i < pairs.length; i += CHUNK) {
        const chunk = pairs.slice(i, i + CHUNK);
        const fetched = await Promise.all(chunk.map(async (p) => {
          try {
            const res = await fetch(
              `https://api.smspool.net/request/price?key=${apiKey}&country=${p.country}&service=${p.service}`,
              { signal: AbortSignal.timeout(10000) }
            );
            const raw = await res.json();
            if (raw.price == null) return null;
            return {
              country_id: p.country,
              service_id: p.service,
              price: Number(raw.price),
              high_price: Number(raw.high_price ?? raw.price),
              success_rate: Number(raw.success_rate ?? 0),
            };
          } catch { return null; }
        }));
        results.push(...fetched.filter(Boolean));
        if (i + CHUNK < pairs.length) await new Promise(r => setTimeout(r, 150));
      }
      result = results;

    } else {
      throw new Error(`Action inconnue: ${action}`);
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
