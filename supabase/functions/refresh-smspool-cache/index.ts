
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey   = Deno.env.get("SMSPOOL_API_KEY");
    const supaUrl  = Deno.env.get("SUPABASE_URL");
    const supaKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supaUrl || !supaKey) throw new Error("Variables manquantes");

    // 1. Récupérer tous les pays
    const countriesRes = await fetch("https://api.smspool.net/country/retrieve_all", {
      headers: { Authorization: "Bearer " + apiKey },
      signal: AbortSignal.timeout(12000),
    });
    const countriesRaw = await countriesRes.json();
    const countries: Array<{ id: string; name: string; short_name: string; region: string }> =
      (Array.isArray(countriesRaw) ? countriesRaw : Object.values(countriesRaw))
        .map((c: any) => ({
          id: String(c.ID ?? c.id ?? ""),
          name: String(c.name ?? ""),
          short_name: String(c.short_name ?? c.cc ?? ""),
          region: String(c.region ?? ""),
        }))
        .filter((c) => c.id && c.name);

    // 2. Pour chaque pays, récupérer tous les services disponibles + stock (batches de 15)
    const BATCH = 15;
    const rows: any[] = [];

    for (let i = 0; i < countries.length; i += BATCH) {
      const batch = countries.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (country) => {
          try {
            const params = new URLSearchParams({ key: apiKey, country: country.id });
            const res = await fetch("https://api.smspool.net/service/retrieve_all_country", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: params.toString(),
              signal: AbortSignal.timeout(8000),
            });
            const raw = await res.json();
            const services = Array.isArray(raw) ? raw : Object.values(raw);
            return services.map((s: any) => ({
              service_id:   String(s.ID ?? s.id ?? ""),
              country_id:   country.id,
              service_name: String(s.name ?? ""),
              country_name: country.name,
              country_short: country.short_name,
              region:       country.region,
              instock:      Number(s.instock ?? 0),
              updated_at:   new Date().toISOString(),
            })).filter((r) => r.service_id);
          } catch {
            return [];
          }
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") rows.push(...r.value);
      }
    }

    if (rows.length === 0) throw new Error("Aucune donnée récupérée depuis SMSpool");

    // 3. Upsert dans smspool_stock_cache par chunks de 500
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const upsertRes = await fetch(
        `${supaUrl}/rest/v1/smspool_stock_cache`,
        {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": "Bearer " + supaKey,
            "apikey":        supaKey,
            "Prefer":        "resolution=merge-duplicates",
          },
          body: JSON.stringify(chunk),
        }
      );
      if (!upsertRes.ok) {
        const err = await upsertRes.text();
        throw new Error(`Upsert échoué: ${err}`);
      }
      upserted += chunk.length;
    }

    return new Response(
      JSON.stringify({ success: true, rows_upserted: upserted, countries: countries.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
