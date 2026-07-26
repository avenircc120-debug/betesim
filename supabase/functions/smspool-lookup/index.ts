
    const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    const PINNED_IDS = new Set(["1", "2", "23", "55", "24", "79", "68", "22"]);

    // ── Règles tarifaires betesim ─────────────────────────────────────────────────
    // 1 Coin = 100 FCFA
    const AFRICAN_NAMES = new Set([
    "benin","bj","egypt","eg","ethiopia","et","uganda","ug","mali","ml",
    "mauritania","mr","mauritius","mu","rwanda","rw","eritrea","er",
    "nigeria","ng","ghana","gh","senegal","sn","ivory coast","cote d'ivoire","ci",
    "cameroon","cm","kenya","ke","tanzania","tz","mozambique","mz","zambia","zm",
    "zimbabwe","zw","south africa","za","morocco","ma","algeria","dz","tunisia","tn",
    "libya","ly","sudan","sd","somalia","so","djibouti","dj","comoros","km",
    "madagascar","mg","seychelles","sc","democratic republic of the congo","cd",
    "republic of the congo","congo","cg","gabon","ga","equatorial guinea","gq",
    "central african republic","cf","chad","td","niger","ne","burkina faso","bf",
    "guinea","gn","guinea-bissau","gw","sierra leone","sl","liberia","lr",
    "togo","tg","gambia","gm","cape verde","cv","sao tome and principe","st",
    "angola","ao","namibia","na","botswana","bw","lesotho","ls","eswatini",
    "swaziland","malawi","mw","south sudan","ss","burundi","bi",
    ]);
    const TELEGRAM_SPECIAL_AFRICAN = new Set(["benin","bj","egypt","eg","ethiopia","et","uganda","ug"]);

    function computeSalePriceFcfa(serviceName, countryName, countryShort) {
    const svc = serviceName.toLowerCase().trim();
    const cty = countryName.toLowerCase().trim();
    const csh = (countryShort || "").toLowerCase().trim();
    const isAfrican = AFRICAN_NAMES.has(cty) || AFRICAN_NAMES.has(csh);
    const isWA = svc === "whatsapp";
    const isTG = svc === "telegram";
    if (isAfrican) {
      if (isTG && (TELEGRAM_SPECIAL_AFRICAN.has(cty) || TELEGRAM_SPECIAL_AFRICAN.has(csh))) return 1500;
      return 1000;
    }
    if (isWA) {
      if (cty === "italy")   return 10000;
      if (cty === "france")  return 7000;
      if (cty === "belgium") return 8486;
      if (cty === "israel")  return 8348;
      if (["germany","spain","ireland","ukraine"].includes(cty)) return 5000;
    }
    if (isTG) {
      if (cty === "ukraine") return 9350;
      if (cty === "belgium") return 5606;
      if (["germany","spain","ireland","italy","france","israel"].includes(cty)) return 5000;
    }
    return 2500;
    }

    Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      const apiKey = Deno.env.get("SMSPOOL_API_KEY");
      if (!apiKey) throw new Error("SMSPOOL_API_KEY non configuree");

      const url = new URL(req.url);
      let action = "countries";
      let country = "";
      let service = "";
      let service_name = "";
      let country_name = "";
      let country_short = "";
      let country_ids = "";
      let pairs = [];

      if (req.method === "POST") {
        try {
          const body = await req.json();
          action        = body.action        ?? url.searchParams.get("action")        ?? "countries";
          country       = body.country       ?? url.searchParams.get("country")       ?? "";
          service       = body.service       ?? url.searchParams.get("service")       ?? "";
          service_name  = body.service_name  ?? url.searchParams.get("service_name")  ?? "";
          country_name  = body.country_name  ?? url.searchParams.get("country_name")  ?? "";
          country_short = body.country_short ?? url.searchParams.get("country_short") ?? "";
          country_ids   = body.country_ids   ?? url.searchParams.get("country_ids")   ?? "";
          pairs         = body.pairs         ?? [];
        } catch {
          action        = url.searchParams.get("action")        ?? "countries";
          country       = url.searchParams.get("country")       ?? "";
          service       = url.searchParams.get("service")       ?? "";
          service_name  = url.searchParams.get("service_name")  ?? "";
          country_name  = url.searchParams.get("country_name")  ?? "";
          country_short = url.searchParams.get("country_short") ?? "";
          country_ids   = url.searchParams.get("country_ids")   ?? "";
        }
      } else {
        action        = url.searchParams.get("action")        ?? "countries";
        country       = url.searchParams.get("country")       ?? "";
        service       = url.searchParams.get("service")       ?? "";
        service_name  = url.searchParams.get("service_name")  ?? "";
        country_name  = url.searchParams.get("country_name")  ?? "";
        country_short = url.searchParams.get("country_short") ?? "";
        country_ids   = url.searchParams.get("country_ids")   ?? "";
      }

      let result = [];

      if (action === "countries") {
        const res = await fetch("https://api.smspool.net/country/retrieve_all", {
          headers: { Authorization: "Bearer " + apiKey },
        });
        const raw = await res.json();
        const arr = Array.isArray(raw) ? raw : Object.values(raw);
        const mapped = arr.map((c) => ({
          id: String(c.ID ?? c.id ?? ""),
          name: c.name ?? "",
          short_name: c.short_name ?? c.cc ?? "",
          region: c.region ?? "",
        })).filter((c) => c.id && c.name);
        const pinned = mapped.filter((c) => PINNED_IDS.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
        const rest   = mapped.filter((c) => !PINNED_IDS.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
        result = [...pinned, ...rest];

      } else if (action === "all_services") {
        const params = new URLSearchParams({ key: apiKey });
        const res = await fetch("https://api.smspool.net/service/retrieve_all", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const raw = await res.json();
        const arr = Array.isArray(raw) ? raw : Object.values(raw);
        result = arr.map((s) => ({
          id: String(s.ID ?? s.id ?? ""),
          name: s.name ?? "",
          favourite: Number(s.favourite ?? 0),
        })).filter((s) => s.id && s.name)
          .sort((a, b) => b.favourite - a.favourite || a.name.localeCompare(b.name));

      } else if (action === "price_lookup") {
        if (!country || !service) throw new Error("country et service requis");
        // Prix betesim calculé en premier — ne dépend PAS de SMSpool
        const nameToUse = service_name || service;
        const sale_price_fcfa = computeSalePriceFcfa(nameToUse, country_name, country_short);
        const sale_price_coins = Math.ceil(sale_price_fcfa / 100);
        // Stock SMSpool récupéré séparément — une erreur ici ne bloque plus le prix
        let instock = 0; // défaut honnête : inconnu = 0, pas de faux "1 dispo"
        let smspoolPriceUsd = 0;
        try {
          const params = new URLSearchParams({ key: apiKey, country });
          const svcsRes = await fetch("https://api.smspool.net/service/retrieve_all_country", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
            signal: AbortSignal.timeout(12000),
          });
          const svcsRaw = await svcsRes.json();
          const svcs = Array.isArray(svcsRaw) ? svcsRaw : Object.values(svcsRaw);
          if (svcs.length > 0) {
            // API a répondu — on vérifie si le service existe pour ce pays
            const match = svcs.find((s) =>
              String(s.ID ?? s.id ?? s.service_id ?? "") === String(service)
            );
            instock = match ? Number(match.instock ?? match.amount ?? 0) : 0;
            smspoolPriceUsd = match ? Number(match.price ?? 0) : 0;
          }
        } catch {
          // API SMSpool indisponible ou timeout — on renvoie quand même le prix betesim
        }
        result = [{ instock, sale_price_coins }];

      } else if (action === "get_price") {
        if (!country || !service) throw new Error("country et service requis");
        const res = await fetch(
          "https://api.smspool.net/request/price?key=" + apiKey + "&country=" + country + "&service=" + service
        );
        const raw = await res.json();
        result = { available: Number(raw.price ?? 0) > 0 };

      } else if (action === "bulk_prices") {
        if (!pairs.length) throw new Error("pairs requis");
        const CHUNK = 30;
        const results = [];
        for (let i = 0; i < pairs.length; i += CHUNK) {
          const chunk = pairs.slice(i, i + CHUNK);
          const fetched = await Promise.all(chunk.map(async (p) => {
            try {
              const res = await fetch(
                "https://api.smspool.net/request/price?key=" + apiKey + "&country=" + p.country + "&service=" + p.service,
                { signal: AbortSignal.timeout(10000) }
              );
              const raw = await res.json();
              if (raw.price == null) return null;
              return { country_id: p.country, service_id: p.service, available: Number(raw.price ?? 0) > 0 };
            } catch { return null; }
          }));
          results.push(...fetched.filter(Boolean));
          if (i + CHUNK < pairs.length) await new Promise(r => setTimeout(r, 150));
        }
        result = results;

      } else if (action === "countries_with_stock") {
        // 2 appels parallèles :
        //   1. country/retrieve_all  → tous les pays (ID, nom, région)
        //   2. request/success_rate  → pays disponibles pour le service + stock réel
        // Pas de clé API requise pour success_rate (endpoint public)
        if (!service) throw new Error("service requis");

        const [countriesRes, stockRes] = await Promise.all([
          fetch("https://api.smspool.net/country/retrieve_all", {
            headers: { Authorization: "Bearer " + apiKey },
            signal: AbortSignal.timeout(10000),
          }),
          fetch("https://api.smspool.net/request/success_rate", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ service }).toString(),
            signal: AbortSignal.timeout(10000),
          }),
        ]);

        const countriesRaw = await countriesRes.json();
        const allCountries = (Array.isArray(countriesRaw) ? countriesRaw : Object.values(countriesRaw))
          .map((c: any) => ({
            id:         String(c.ID ?? c.id ?? ""),
            name:       String(c.name ?? ""),
            short_name: String(c.short_name ?? c.cc ?? ""),
            region:     String(c.region ?? ""),
          }))
          .filter((c) => c.id && c.name);

        // Construire un map country_id → stock réel depuis success_rate
        const stockMap: Record<string, number> = {};
        try {
          const stockRaw = await stockRes.json();
          const arr = Array.isArray(stockRaw) ? stockRaw : Object.values(stockRaw);
          for (const entry of arr as any[]) {
            const cid = String(entry.country_id ?? entry.country ?? "");
            if (cid) stockMap[cid] = Number(entry.stock ?? 0);
          }
        } catch { /* success_rate indisponible → tous affichés sans badge */ }

        const withStock = allCountries.map((c) => ({
          ...c,
          instock: stockMap[c.id] ?? -1, // -1 = service non disponible dans ce pays
        }));

        // Pinned en tête triés par stock desc, reste par stock desc puis alpha
        const pinned = withStock.filter((c) => PINNED_IDS.has(c.id))
          .sort((a, b) => b.instock - a.instock || a.name.localeCompare(b.name));
        const rest = withStock.filter((c) => !PINNED_IDS.has(c.id))
          .sort((a, b) => b.instock - a.instock || a.name.localeCompare(b.name));
        result = [...pinned, ...rest];

      } else {
        throw new Error("Action inconnue: " + action);
      }

      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    });
