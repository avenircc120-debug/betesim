/**
 * Edge Function: auto-analyse
 * Pipeline automatique : football-data → pronostic-analysis → analyses table
 *
 * Appelable via :
 *   - Supabase Scheduled Functions (toutes les 2h dans le dashboard)
 *   - Bot Telegram commande admin "🤖 Générer analyses"
 *   - Manuellement depuis n'importe quel client POST
 *
 * Corps de la requête : {} (aucun paramètre obligatoire)
 *
 * Déduplication : external_match_id empêche de créer deux fois l'analyse d'un même match.
 * Rate limit : max 6 analyses par appel, 2s de pause entre chaque pour respecter Groq.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function mapConfidence(c: string): string {
  const map: Record<string, string> = { low: "faible", medium: "moyen", high: "fort" };
  return map[c] ?? "moyen";
}

function pause(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 0. Purge analyses expirées (matchs déjà joués) ─────────────────────
    const now = new Date().toISOString();
    await supabase.from("analyses").delete().not("match_date", "is", null).lt("match_date", now);

    // ── 1. Rafraîchir les matchs depuis les APIs foot ───────────────────────
    const fetchRes = await supabase.functions.invoke("football-data", {
      body: { action: "fetch" },
    });
    const fetchData = fetchRes.data as { fetched?: number; source?: string } | null;


    // ── 2. Lister les matchs dans les 48h à venir ────────────────────────────
    console.log("▶ Étape 2 : récupération des matchs dans les 48h…");
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const { data: matches } = await supabase
      .from("football_matches")
      .select("*")
      .gte("match_date", now.toISOString())
      .lte("match_date", in48h)
      .order("match_date", { ascending: true })
      .limit(15);

    if (!matches || matches.length === 0) {
      console.log("  ⚠ Aucun match dans les 48h.");
      return ok({ success: true, message: "Aucun match dans les 48h", created: 0 });
    }


    // ── 3. Déduplication : filtrer ceux qui ont déjà une analyse ─────────────
    console.log("▶ Étape 3 : vérification des doublons…");
    const externalIds = matches.map((m: any) => m.external_id).filter(Boolean);
    const { data: existingAnalyses } = await supabase
      .from("analyses")
      .select("external_match_id")
      .in("external_match_id", externalIds);

    const alreadyDone = new Set(
      (existingAnalyses ?? []).map((a: any) => a.external_match_id)
    );
    const toAnalyse = matches.filter((m: any) => !alreadyDone.has(m.external_id));


    if (toAnalyse.length === 0) {
      return ok({ success: true, message: "Toutes les analyses sont déjà générées", created: 0 });
    }

    // ── 4. Générer une analyse IA pour chaque match (max 6) ──────────────────
    console.log("▶ Étape 4 : génération des analyses IA…");
    const created: string[] = [];
    const errors: string[] = [];

    for (const match of toAnalyse.slice(0, 6)) {
      const matchLabel = `${match.team_home} vs ${match.team_away}`;


      try {
        const analysisRes = await supabase.functions.invoke("pronostic-analysis", {
          body: {
            match: matchLabel,
            sport: "football",
            firstName: "ami",
          },
        });

        const aData = analysisRes.data as any;
        const analysis = aData?.analysis;

        if (!analysis?.prediction) {
          console.error(`  ✗ Pas de prédiction pour ${matchLabel}`);
          errors.push(`${matchLabel}: aucune prédiction retournée`);
          continue;
        }

        // Cote indicative calculée depuis la probabilité domicile
        const probHome = analysis.probabilities?.home ?? 40;
        const odds = probHome > 0 ? parseFloat((100 / probHome).toFixed(2)) : null;

        const { error: insertErr } = await supabase.from("analyses").insert({
          title: matchLabel,
          team_home: match.team_home,
          team_away: match.team_away,
          league: match.league ?? null,
          country: match.country ?? null,
          match_date: match.match_date ?? null,
          prediction: analysis.prediction,
          confidence: mapConfidence(analysis.confidence ?? "medium"),
          odds,
          markets: analysis.markets ?? null,
          stats: {
            probabilities: analysis.probabilities ?? {},
            keyFactors: analysis.keyFactors ?? [],
            summary: analysis.summary ?? "",
            expertText: analysis.expertText ?? "",
            aiSource: aData.source ?? "groq",
            sourcesUsed: aData.sourcesUsed ?? [],
          },
          notes: analysis.summary ?? null,
          published: true,
          source: "auto",
          external_match_id: match.external_id ?? null,
        });

        if (insertErr) {
          console.error(`  ✗ Insert échoué pour ${matchLabel}: ${insertErr.message}`);
          errors.push(`${matchLabel}: ${insertErr.message}`);
        } else {
          console.log(`  ✓ Analyse sauvegardée : ${matchLabel}`);
          created.push(matchLabel);
        }
      } catch (err: any) {
        console.error(`  ✗ Erreur pour ${matchLabel}: ${err?.message}`);
        errors.push(`${matchLabel}: ${err?.message ?? "erreur inconnue"}`);
      }

      // Pause anti-rate-limit entre chaque appel Groq
      await pause(2500);
    }

    console.log(`▶ Terminé : ${created.length} analyse(s) créée(s), ${errors.length} erreur(s)`);

    return ok({
      success: true,
      created: created.length,
      analyses: created,
      errors,
    });
  } catch (e: any) {
    console.error("auto-analyse fatal:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" }, 500);
  }
});
