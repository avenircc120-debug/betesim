// WINPACK — Catalogue interne (pays & services).
// L'API du fournisseur de numéros n'est jamais exposée au client.
// Le frontend appelle uniquement cette fonction côté serveur.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pays mis en avant (IDs internes)
const PINNED_IDS = new Set(["1", "2", "23", "55", "24", "79", "68", "22"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!apiKey) throw new Error("Catalogue indisponible");

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "countries";

    let result: any[] = [];

    if (action === "countries") {
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
        }))
        .filter((c: any) => c.id && c.name);

      const pinned = mapped
        .filter((c: any) => PINNED_IDS.has(c.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      const rest = mapped
        .filter((c: any) => !PINNED_IDS.has(c.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      result = [...pinned, ...rest];

    } else if (action === "services") {
      // POST /service/retrieve_all_country is Cloudflare-blocked from server environments.
      // GET /service/retrieve_all with Bearer auth works and returns all available services.
      const res = await fetch("https://api.smspool.net/service/retrieve_all", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const raw = await res.json();

      // SMSpool can return an array directly or { services: [...] } or { data: [...] }
      let arr: any[] = [];
      if (Array.isArray(raw)) {
        arr = raw;
      } else if (Array.isArray(raw.services)) {
        arr = raw.services;
      } else if (Array.isArray(raw.data)) {
        arr = raw.data;
      } else {
        // Flat object like { "1": { name: "WhatsApp", ... }, "2": { ... } }
        arr = Object.values(raw).filter(
          (v: any) => typeof v === "object" && v !== null && !Array.isArray(v)
        );
      }

      result = arr
        .map((s: any) => ({
          id: String(s.ID ?? s.id ?? s.service_id ?? ""),
          name: (s.name ?? s.service_name ?? "").trim(),
          instock: Number(s.instock ?? s.available ?? 0),
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
