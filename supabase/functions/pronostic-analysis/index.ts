/**
 * Edge Function: pronostic-analysis v2
 * Analyse complète avec TOUS les marchés de paris :
 *   1X2, Double chance, Over/Under (1.5/2.5/3.5/4.5), BTTS,
 *   Corners (8.5/10.5), Mi-temps, Handicap asiatique, Top picks
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const CACHE_TTL_MIN = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function ddgSearch(query: string, max = 5): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile Safari/537.36", "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const out: string[] = [];
    const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      let href = m[1];
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch { continue; } }
      if (href.startsWith("http") && !out.includes(href)) { out.push(href); if (out.length >= max) break; }
    }
    return out;
  } catch { return []; }
}

async function fetchAndExtractText(url: string, maxChars = 3500): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile Safari/537.36", "Accept": "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
      .slice(0, maxChars);
  } catch { return ""; }
}

async function callGroqForAnalysis(match: string, sport: string, rawStats: string, firstName: string): Promise<any | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;

  const systemPrompt = `Tu es un analyste sportif francophone expert en paris sportifs.
Tu produis des analyses COMPLÈTES couvrant TOUS les marchés de paris.
Tu DOIS répondre UNIQUEMENT en JSON strict avec EXACTEMENT cette structure :
{
  "summary": string,
  "probabilities": { "home": number, "draw": number, "away": number },
  "markets": {
    "result_1x2": { "home": number, "draw": number, "away": number },
    "double_chance": { "1x": number, "12": number, "x2": number },
    "over_under": {
      "over_1_5": number, "under_1_5": number,
      "over_2_5": number, "under_2_5": number,
      "over_3_5": number, "under_3_5": number,
      "over_4_5": number, "under_4_5": number
    },
    "btts": { "yes": number, "no": number },
    "corners": { "over_8_5": number, "under_8_5": number, "over_10_5": number, "under_10_5": number },
    "halftime": { "home": number, "draw": number, "away": number },
    "asian_handicap": { "home_minus_0_5": number, "away_minus_0_5": number }
  },
  "top_picks": string[],
  "keyFactors": string[],
  "prediction": string,
  "expertText": string,
  "confidence": "low" | "medium" | "high"
}
Règles :
- result_1x2 : home+draw+away = 100
- double_chance : 1x=home+draw, 12=home+away, x2=draw+away (cap 100)
- over/under : over_X + under_X = 100 pour chaque paire
- btts yes+no = 100, corners over+under = 100, halftime = 100, asian_handicap = 100
- top_picks : exactement 3 paris recommandés, format "Marché — XX% de probabilité"
- keyFactors : 4-6 facteurs argumentés (forme, blessés, confrontations, domicile/extérieur, tactique, corners moyens)
Pas de texte hors JSON.`;

  const userPrompt = `Match : ${match}\nSport : ${sport}${firstName ? `\nUtilisateur : ${firstName}` : ""}\n\nDonnées scrappées (SofaScore/Flashscore) :\n---\n${rawStats || "(pas de données — analyse par expertise)"}\n---\n\nProduis l'analyse JSON complète avec TOUS les marchés.${firstName ? `\nAdresse-toi à ${firstName} dans expertText.` : ""}`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.5,
        max_tokens: 1600,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { console.error("Groq HTTP", res.status); return null; }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.probabilities?.home !== "number" ||
      !parsed.markets?.result_1x2 ||
      !parsed.markets?.over_under ||
      !parsed.markets?.btts ||
      !parsed.markets?.corners ||
      !Array.isArray(parsed.top_picks) ||
      !Array.isArray(parsed.keyFactors) ||
      typeof parsed.prediction !== "string"
    ) {
      console.error("Groq JSON invalide:", JSON.stringify(parsed).slice(0, 300));
      return null;
    }
    return parsed;
  } catch (err: any) { console.error("callGroq error:", err?.message); return null; }
}

function fallbackAnalysis(match: string, firstName: string) {
  const fn = firstName || "ami";
  return {
    summary: `Analyse rapide pour ${match}.`,
    probabilities: { home: 40, draw: 27, away: 33 },
    markets: {
      result_1x2: { home: 40, draw: 27, away: 33 },
      double_chance: { "1x": 67, "12": 73, x2: 60 },
      over_under: { over_1_5: 75, under_1_5: 25, over_2_5: 52, under_2_5: 48, over_3_5: 30, under_3_5: 70, over_4_5: 15, under_4_5: 85 },
      btts: { yes: 50, no: 50 },
      corners: { over_8_5: 55, under_8_5: 45, over_10_5: 35, under_10_5: 65 },
      halftime: { home: 35, draw: 45, away: 20 },
      asian_handicap: { home_minus_0_5: 40, away_minus_0_5: 60 },
    },
    top_picks: ["Over 1.5 buts — 75% de probabilité", "Double chance 1X — 67% de probabilité", "Over 2.5 buts — 52% de probabilité"],
    keyFactors: ["Données en cours de collecte", "Domicile avec léger avantage", "Surveillez les compositions 1h avant"],
    prediction: "Match équilibré avec légère faveur domicile.",
    expertText: `${fn}, mise sur Over 1.5 buts pour sécuriser ton pari. Inscris-toi sur 1win via mon lien partenaire.`,
    confidence: "low" as const,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });

  let body: any = {};
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const match = (body.match || "").toString().trim();
  const sport = (body.sport || "football").toString().trim();
  const firstName = (body.firstName || "").toString().trim();

  if (!match) return new Response(JSON.stringify({ error: "match requis" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Cache
  const cacheKey = `v2|${sport}|${match.toLowerCase()}`;
  const cacheSince = new Date(Date.now() - CACHE_TTL_MIN * 60 * 1000).toISOString();
  try {
    const { data: cached } = await supabase.from("pronostic_cache").select("analysis, sources, created_at")
      .eq("cache_key", cacheKey).gte("created_at", cacheSince).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cached?.analysis?.markets) {
      return new Response(JSON.stringify({ source: "cache", match, analysis: cached.analysis, sourcesUsed: cached.sources ?? [], cachedUntil: new Date(new Date(cached.created_at).getTime() + CACHE_TTL_MIN * 60 * 1000).toISOString() }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  } catch (err: any) { console.warn("cache skipped:", err?.message); }

  // Rate limit
  let rateOk = true;
  try {
    const { data, error } = await supabase.rpc("consume_groq_rate_limit", { p_caller: "pronostic-analysis", p_max_per_min: 25 });
    if (!error) rateOk = data === true;
  } catch (err: any) { console.warn("rate limit skipped:", err?.message); }

  if (!rateOk) {
    return new Response(JSON.stringify({ source: "fallback", match, analysis: fallbackAnalysis(match, firstName), sourcesUsed: [], rateLimited: true, retryAfterSec: 60 }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Scraping multi-requêtes
  const queries = [
    `${match} stats buts corners possession site:sofascore.com`,
    `${match} statistiques forme blessés corners site:flashscore.fr`,
    `${match} pronostic analyse buts corners over under football`,
  ];
  const allUrls: string[] = [];
  for (const q of queries) {
    const urls = await ddgSearch(q, 3);
    for (const u of urls) { if (!allUrls.includes(u)) allUrls.push(u); if (allUrls.length >= 6) break; }
    if (allUrls.length >= 6) break;
  }
  const texts: string[] = [];
  const sourcesUsed: string[] = [];
  for (const u of allUrls.slice(0, 3)) {
    const t = await fetchAndExtractText(u, 3000);
    if (t.length > 200) { texts.push(`### ${u}\n${t}`); sourcesUsed.push(u); }
  }
  const rawStats = texts.join("\n\n").slice(0, 9000);

  // Groq
  let analysis = await callGroqForAnalysis(match, sport, rawStats, firstName);
  let source: "groq" | "fallback" = "groq";
  if (!analysis) { analysis = fallbackAnalysis(match, firstName); source = "fallback"; }

  // Save cache
  try { await supabase.from("pronostic_cache").insert({ cache_key: cacheKey, match, sport, analysis, sources: sourcesUsed }); } catch {}

  return new Response(JSON.stringify({ source, match, analysis, sourcesUsed }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
});
