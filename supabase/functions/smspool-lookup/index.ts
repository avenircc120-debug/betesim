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
    const action = url.searchParams.get("action") ?? "countries";
    const country = url.searchParams.get("country") ?? "";

    let result: any[] = [];

    if (action === "countries") {
      const res = await fetch("https://api.smspool.net/country/retrieve_all", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);

      // Mapper TOUS les pays sans filtrage autre que id+name obligatoires
      const mapped = arr
        .map((c: any) => ({
          id: String(c.ID ?? c.id ?? ""),
          name: c.name ?? c.long_name ?? "",
          short_name: c.short_name ?? c.cc ?? "",
        }))
        .filter((c: any) => c.id && c.name);

      // Séparer épinglés et reste
      const pinned = mapped
        .filter((c: any) => PINNED_IDS.has(c.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      const rest = mapped
        .filter((c: any) => !PINNED_IDS.has(c.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      result = [...pinned, ...rest];

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
      // Retourner TOUS les services — aucun filtrage par instock
      result = arr
        .map((s: any) => ({
          id: String(s.ID ?? s.id ?? ""),
          name: s.name ?? "",
          instock: Number(s.instock ?? 0),
          price: Number(s.price ?? 0),
        }))
        .filter((s: any) => s.id && s.name)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
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
