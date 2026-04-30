/**
 * Edge Function: pronostic-analysis
 *
 * Analyse autonome d'un match sportif avec recherche web GRATUITE (DuckDuckGo)
 * et raisonnement par Groq (Llama 3).
 *
 * Pipeline :
 *   1. Recherche DDG HTML (sans clé API) ciblant SofaScore / Flashscore
 *   2. Récupère le contenu textuel des 2-3 meilleurs résultats
 *   3. Envoie ces stats brutes à Groq (llama-3.3-70b-versatile)
 *   4. Groq produit une analyse de probabilités ORIGINALE (pas un copier-coller)
 *      + un texte d'expert argumenté pour pousser à l'inscription 1win
 *
 * Protection quota :
 *   • Rate limiter atomique côté Postgres (RPC consume_groq_rate_limit) : 25 req/min
 *   • Cache des analyses en DB (table pronostic_cache) : si la même analyse a
 *     été demandée < 30 min, on la renvoie sans nouvel appel à Groq.
 *   • Toutes les données utilisateur connues sont lues depuis la DB par l'appelant
 *     (le client envoie juste le nom du match, on ne demande rien à Groq qu'on a déjà).
 *
 * Body (POST JSON) :
 *   { match: "Real Madrid vs Barcelone", sport?: "football", firstName?: "Mamadou" }
 *
 * Réponse :
 *   {
 *     source: "groq" | "cache" | "fallback",
 *     match: "...",
 *     analysis: {
 *       summary: string,             // 1-2 phrases de synthèse
 *       probabilities: {             // pourcentages estimés (somme ≈ 100)
 *         home: number, draw: number, away: number
 *       },
 *       keyFactors: string[],        // 3-5 facteurs clés (forme, blessés, etc.)
 *       prediction: string,          // pronostic argumenté
 *       expertText: string,          // texte vendeur final pour pousser au 1win
 *       confidence: "low" | "medium" | "high"
 *     },
 *     sourcesUsed: string[],         // URLs scrapées (transparence)
 *     cachedUntil?: string           // ISO timestamp si mis en cache
 *   }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const CACHE_TTL_MIN = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── 1. Recherche DuckDuckGo (HTML scraping, gratuit, sans clé) ─────────────
/**
 * Interroge le endpoint HTML de DuckDuckGo (https://html.duckduckgo.com/html/)
 * et renvoie les URLs des résultats. C'est volontairement très simple :
 * on extrait toutes les balises <a class="result__a" href="..."> du HTML.
 */
async function ddgSearch(query: string, max = 5): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        // DDG accepte la plupart des UA — on se fait passer pour un navigateur récent
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; SM-A055F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
      },
    });
    if (!res.ok) {
      console.error("ddg search failed:", res.status);
      return [];
    }
    const html = await res.text();
    // DDG enveloppe les vraies URLs dans /l/?uddg=<encoded> — on les déchiffre.
    const out: string[] = [];
    const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      let href = m[1];
      // Si c'est un lien proxy DDG, extraire l'URL réelle
      const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch) {
        try {
          href = decodeURIComponent(uddgMatch[1]);
        } catch {
          /* skip */
        }
      }
      if (href.startsWith("http") && !out.includes(href)) {
        out.push(href);
        if (out.length >= max) break;
      }
    }
    return out;
  } catch (err: any) {
    console.error("ddgSearch error:", err?.message ?? err);
    return [];
  }
}

// ─── 2. Extraction du contenu textuel d'une URL ─────────────────────────────
/**
 * Récupère une page web et extrait grossièrement son texte (sans parseur HTML).
 * On vire les <script>, <style>, et on collapse les balises restantes.
 */
async function fetchAndExtractText(url: string, maxChars = 3500): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; SM-A055F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, maxChars);
  } catch (err: any) {
    console.error(`fetchAndExtractText(${url}) error:`, err?.message ?? err);
    return "";
  }
}

// ─── 3. Appel à Groq pour l'analyse de probabilités ─────────────────────────
async function callGroqForAnalysis(
  match: string,
  sport: string,
  rawStats: string,
  firstName: string,
): Promise<any | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    console.error("GROQ_API_KEY non configuré");
    return null;
  }

  const systemPrompt = [
    "Tu es un analyste sportif francophone spécialisé en pronostics paris sportifs.",
    "Tu rédiges des analyses ORIGINALES, jamais de copier-coller depuis les sources.",
    "Tu raisonnes à partir des stats brutes (forme, possession, blessés, scores récents)",
    "et tu donnes une probabilité chiffrée argumentée.",
    "Tu termines toujours par un texte vendeur (sans être agressif) qui pousse l'utilisateur",
    "à passer à l'action sur 1win, en mettant en avant la confiance dans l'analyse.",
    "",
    "Tu DOIS répondre UNIQUEMENT en JSON strict, avec EXACTEMENT cette structure :",
    "{",
    '  "summary": string,',
    '  "probabilities": { "home": number, "draw": number, "away": number },',
    '  "keyFactors": string[],',
    '  "prediction": string,',
    '  "expertText": string,',
    '  "confidence": "low" | "medium" | "high"',
    "}",
    "Les 3 probabilités doivent additionner à 100. Pas de texte hors JSON.",
  ].join("\n");

  const userPrompt = [
    `Match à analyser : ${match}`,
    sport ? `Sport : ${sport}` : "",
    firstName ? `Utilisateur : ${firstName}` : "",
    "",
    "Données brutes scrappées depuis SofaScore / Flashscore via DuckDuckGo :",
    "---",
    rawStats || "(aucune donnée brute disponible — analyse par déduction)",
    "---",
    "",
    "Produis l'analyse JSON demandée. Sois précis, original, argumenté.",
    firstName ? `Adresse-toi à ${firstName} dans le champ "expertText".` : "",
  ].join("\n");

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 900,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error("Groq HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    // Validation minimale de la structure
    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.probabilities?.home !== "number" ||
      typeof parsed.probabilities?.draw !== "number" ||
      typeof parsed.probabilities?.away !== "number" ||
      !Array.isArray(parsed.keyFactors) ||
      typeof parsed.prediction !== "string" ||
      typeof parsed.expertText !== "string"
    ) {
      console.error("Groq JSON invalide:", parsed);
      return null;
    }
    return parsed;
  } catch (err: any) {
    console.error("callGroqForAnalysis error:", err?.message ?? err);
    return null;
  }
}

// ─── 4. Fallback statique si Groq tombe ─────────────────────────────────────
function fallbackAnalysis(match: string, firstName: string) {
  const fn = firstName || "ami";
  return {
    summary: `Analyse rapide pour ${match}.`,
    probabilities: { home: 40, draw: 25, away: 35 },
    keyFactors: [
      "Forme récente des deux équipes équilibrée",
      "Domicile bénéficie d'un léger avantage statistique",
      "Match-up tactique incertain — surveiller les blessés de dernière minute",
    ],
    prediction: "Match équilibré avec un léger avantage à domicile (probabilité 40 %).",
    expertText:
      `${fn}, sur un match aussi serré, place ton pari avec méthode. ` +
      `Inscris-toi sur 1win via mon lien partenaire et applique l'analyse — ` +
      `c'est comme ça qu'on transforme une intuition en gain régulier.`,
    confidence: "low" as const,
  };
}

// ─── 5. Webhook ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const match = (body.match || "").toString().trim();
  const sport = (body.sport || "football").toString().trim();
  const firstName = (body.firstName || "").toString().trim();

  if (!match) {
    return new Response(JSON.stringify({ error: "match requis" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 5a. CACHE : cherche une analyse récente pour ce match ──────────
  const cacheKey = `${sport}|${match.toLowerCase()}`;
  const cacheSince = new Date(Date.now() - CACHE_TTL_MIN * 60 * 1000).toISOString();
  try {
    const { data: cached } = await supabase
      .from("pronostic_cache")
      .select("analysis, sources, created_at")
      .eq("cache_key", cacheKey)
      .gte("created_at", cacheSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached?.analysis) {
      return new Response(
        JSON.stringify({
          source: "cache",
          match,
          analysis: cached.analysis,
          sourcesUsed: cached.sources ?? [],
          cachedUntil: new Date(
            new Date(cached.created_at).getTime() + CACHE_TTL_MIN * 60 * 1000,
          ).toISOString(),
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
  } catch (err: any) {
    // Si la table n'existe pas encore, on continue sans cache
    console.warn("pronostic_cache lookup skipped:", err?.message ?? err);
  }

  // ── 5b. RATE LIMIT : on protège Groq AVANT d'appeler quoi que ce soit ──
  let rateOk = true;
  try {
    const { data, error } = await supabase.rpc("consume_groq_rate_limit", {
      p_caller: "pronostic-analysis",
      p_max_per_min: 25,
    });
    if (error) {
      console.warn("rate limit RPC error (laissé passer):", error.message);
    } else {
      rateOk = data === true;
    }
  } catch (err: any) {
    console.warn("rate limit RPC threw (laissé passer):", err?.message ?? err);
  }

  if (!rateOk) {
    return new Response(
      JSON.stringify({
        source: "fallback",
        match,
        analysis: fallbackAnalysis(match, firstName),
        sourcesUsed: [],
        rateLimited: true,
        retryAfterSec: 60,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // ── 5c. RECHERCHE WEB : DuckDuckGo cible SofaScore + Flashscore ────────
  const queries = [
    `${match} stats site:sofascore.com`,
    `${match} statistiques site:flashscore.fr`,
    `${match} forme récente blessés ${sport}`,
  ];
  const allUrls: string[] = [];
  for (const q of queries) {
    const urls = await ddgSearch(q, 3);
    for (const u of urls) {
      if (!allUrls.includes(u)) allUrls.push(u);
      if (allUrls.length >= 5) break;
    }
    if (allUrls.length >= 5) break;
  }

  // ── 5d. EXTRACTION : on récupère le texte des 2-3 premières URLs ───────
  const texts: string[] = [];
  const sourcesUsed: string[] = [];
  for (const u of allUrls.slice(0, 3)) {
    const t = await fetchAndExtractText(u, 3000);
    if (t.length > 200) {
      texts.push(`### Source : ${u}\n${t}`);
      sourcesUsed.push(u);
    }
  }
  const rawStats = texts.join("\n\n").slice(0, 9000);

  // ── 5e. ANALYSE Groq ───────────────────────────────────────────────────
  let analysis = await callGroqForAnalysis(match, sport, rawStats, firstName);
  let source: "groq" | "fallback" = "groq";
  if (!analysis) {
    analysis = fallbackAnalysis(match, firstName);
    source = "fallback";
  }

  // ── 5f. CACHE : on stocke pour les 30 prochaines minutes ───────────────
  try {
    await supabase
      .from("pronostic_cache")
      .insert({
        cache_key: cacheKey,
        match,
        sport,
        analysis,
        sources: sourcesUsed,
      });
  } catch (err: any) {
    console.warn("pronostic_cache insert skipped:", err?.message ?? err);
  }

  return new Response(
    JSON.stringify({
      source,
      match,
      analysis,
      sourcesUsed,
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
