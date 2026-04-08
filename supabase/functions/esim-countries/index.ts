import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIVE_SIM_API = "https://5sim.net/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth requise
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const service = url.searchParams.get("service"); // "whatsapp" ou "telegram"
    if (!service) {
      return new Response(JSON.stringify({ error: "Paramètre service requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("FIVE_SIM_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Clé API 5sim non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupérer tous les pays disponibles pour ce service
    // GET https://5sim.net/v1/guest/products/{country}/{service}
    // On utilise "any" pour obtenir tous les pays
    const res = await fetch(`${FIVE_SIM_API}/guest/products/any/any`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("5sim API error:", errorText);
      return new Response(JSON.stringify({ error: "Erreur API 5sim.net" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Réponse : { "country_name": { "service_name": { "Category": "...", "Qty": N, "Price": N } } }
    const allProducts: Record<string, Record<string, { Category: string; Qty: number; Price: number }>> = await res.json();

    // Filtrer uniquement les pays qui ont le service demandé avec des numéros disponibles
    const available: Array<{
      country: string;       // clé slug ex: "indonesia"
      label: string;         // nom affiché ex: "Indonesia"
      qty: number;           // nombre de numéros dispo
      price: number;         // prix en crédits 5sim
      flag: string;          // emoji drapeau
    }> = [];

    // Map pays slug → label + drapeau emoji
    const COUNTRY_META: Record<string, { label: string; flag: string }> = {
      russia: { label: "Russie", flag: "🇷🇺" },
      ukraine: { label: "Ukraine", flag: "🇺🇦" },
      indonesia: { label: "Indonésie", flag: "🇮🇩" },
      india: { label: "Inde", flag: "🇮🇳" },
      brazil: { label: "Brésil", flag: "🇧🇷" },
      philippines: { label: "Philippines", flag: "🇵🇭" },
      myanmar: { label: "Myanmar", flag: "🇲🇲" },
      vietnam: { label: "Vietnam", flag: "🇻🇳" },
      cambodia: { label: "Cambodge", flag: "🇰🇭" },
      thailand: { label: "Thaïlande", flag: "🇹🇭" },
      kenya: { label: "Kenya", flag: "🇰🇪" },
      nigeria: { label: "Nigeria", flag: "🇳🇬" },
      ghana: { label: "Ghana", flag: "🇬🇭" },
      ethiopia: { label: "Éthiopie", flag: "🇪🇹" },
      tanzania: { label: "Tanzanie", flag: "🇹🇿" },
      morocco: { label: "Maroc", flag: "🇲🇦" },
      egypt: { label: "Égypte", flag: "🇪🇬" },
      usa: { label: "États-Unis", flag: "🇺🇸" },
      england: { label: "Royaume-Uni", flag: "🇬🇧" },
      france: { label: "France", flag: "🇫🇷" },
      germany: { label: "Allemagne", flag: "🇩🇪" },
      spain: { label: "Espagne", flag: "🇪🇸" },
      italy: { label: "Italie", flag: "🇮🇹" },
      portugal: { label: "Portugal", flag: "🇵🇹" },
      turkey: { label: "Turquie", flag: "🇹🇷" },
      pakistan: { label: "Pakistan", flag: "🇵🇰" },
      bangladesh: { label: "Bangladesh", flag: "🇧🇩" },
      malaysia: { label: "Malaisie", flag: "🇲🇾" },
      mexico: { label: "Mexique", flag: "🇲🇽" },
      colombia: { label: "Colombie", flag: "🇨🇴" },
      iran: { label: "Iran", flag: "🇮🇷" },
      china: { label: "Chine", flag: "🇨🇳" },
      uzbekistan: { label: "Ouzbékistan", flag: "🇺🇿" },
      kazakhstan: { label: "Kazakhstan", flag: "🇰🇿" },
      cambodia: { label: "Cambodge", flag: "🇰🇭" },
      laos: { label: "Laos", flag: "🇱🇦" },
    };

    for (const [countrySlug, services] of Object.entries(allProducts)) {
      const serviceData = services[service];
      if (!serviceData || serviceData.Qty <= 0) continue;

      const meta = COUNTRY_META[countrySlug];
      available.push({
        country: countrySlug,
        label: meta?.label ?? countrySlug.charAt(0).toUpperCase() + countrySlug.slice(1),
        qty: serviceData.Qty,
        price: serviceData.Price,
        flag: meta?.flag ?? "🌍",
      });
    }

    // Trier par quantité décroissante (les pays avec le plus de numéros en premier)
    available.sort((a, b) => b.qty - a.qty);

    return new Response(
      JSON.stringify({ countries: available, service }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("esim-countries error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
