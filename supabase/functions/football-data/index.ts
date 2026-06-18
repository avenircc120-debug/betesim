/**
 * Edge Function: football-data
 * Récupère les matchs depuis plusieurs sources avec failover automatique.
 *   Source A : TheSportsDB (gratuit, sans clé)
 *   Source B : OpenLigaDB  (Bundesliga, gratuit)
 *   Source C : Alerte URGENTE admin si tout tombe → passage en saisie manuelle
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
];
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const LEAGUES = [
  { id: "4334", name: "Ligue 1",       country: "France" },
  { id: "4328", name: "Premier League", country: "Angleterre" },
  { id: "4335", name: "La Liga",        country: "Espagne" },
  { id: "4332", name: "Serie A",        country: "Italie" },
  { id: "4737", name: "CAF Champions League", country: "Afrique" },
];

// ── Source A : TheSportsDB ───────────────────────────────────────────────────
async function fetchSourceA(): Promise<any[]> {
  const matches: any[] = [];
  for (const league of LEAGUES) {
    try {
      await delay(300 + Math.random() * 400); // délai anti-ban
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${league.id}`,
        { headers: { "User-Agent": randomUA(), "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const json = await res.json();
      for (const e of (json?.events ?? []).slice(0, 5)) {
        const dateStr = e.dateEvent && e.strTime
          ? `${e.dateEvent}T${e.strTime.endsWith("Z") ? e.strTime : e.strTime + "Z"}`
          : null;
        matches.push({
          external_id: `sdb_${e.idEvent}`,
          source: "thesportsdb",
          team_home: e.strHomeTeam ?? "?",
          team_away: e.strAwayTeam ?? "?",
          league: league.name,
          country: league.country,
          match_date: dateStr ? new Date(dateStr).toISOString() : null,
          status: "scheduled",
          raw_data: { id: e.idEvent, venue: e.strVenue ?? null },
        });
      }
    } catch (_) { continue; }
  }
  return matches;
}

// ── Source B : OpenLigaDB (Bundesliga) ───────────────────────────────────────
async function fetchSourceB(): Promise<any[]> {
  try {
    const res = await fetch(
      "https://api.openligadb.de/getmatchdata/bl1/2024",
      { headers: { "User-Agent": randomUA() }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const json: any[] = await res.json();
    const now = Date.now();
    return json
      .filter((m: any) => !m.matchIsFinished && new Date(m.matchDateTimeUTC).getTime() > now)
      .slice(0, 8)
      .map((m: any) => ({
        external_id: `oldb_${m.matchID}`,
        source: "openligadb",
        team_home: m.team1?.teamName ?? "Équipe A",
        team_away: m.team2?.teamName ?? "Équipe B",
        league: "Bundesliga",
        country: "Allemagne",
        match_date: m.matchDateTimeUTC ?? null,
        status: "scheduled",
        score_home: null,
        score_away: null,
        raw_data: { id: m.matchID },
      }));
  } catch (_) { return []; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "fetch");

    // ── FETCH : récupérer les matchs avec failover ───────────────────────────
    if (action === "fetch") {
      let matches: any[] = [];
      let sourceUsed = "";
      const errors: string[] = [];

      // Tentative Source A
      try {
        matches = await fetchSourceA();
        if (matches.length > 0) sourceUsed = "thesportsdb";
      } catch (e: any) { errors.push(`A: ${e.message}`); }

      // Tentative Source B si A vide
      if (matches.length === 0) {
        try {
          matches = await fetchSourceB();
          if (matches.length > 0) sourceUsed = "openligadb";
        } catch (e: any) { errors.push(`B: ${e.message}`); }
      }

      // Source C : Alerte URGENTE si tout tombe
      if (matches.length === 0) {
        await supabase.from("notifications").insert({
          user_id: null,
          title: "⚠️ URGENT — Données foot indisponibles",
          message: `Toutes les sources de matchs sont hors ligne. Passez en saisie manuelle dans l'interface analyste. Erreurs : ${errors.join(" | ") || "inconnues"}`,
          type: "system_alert",
        });
        return ok({ success: false, error: "Toutes les sources indisponibles — alerte envoyée", matches: [] });
      }

      // Upsert dans football_matches
      let saved = 0;
      for (const m of matches) {
        const { error } = await supabase
          .from("football_matches")
          .upsert(m, { onConflict: "external_id" });
        if (!error) saved++;
      }

      return ok({ success: true, source: sourceUsed, fetched: matches.length, saved });
    }

    // ── LIST : lister les matchs stockés (depuis hier pour couvrir les fuseaux horaires) ─
    if (action === "list") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("football_matches")
        .select("*")
        .gte("match_date", since)
        .order("match_date", { ascending: true })
        .limit(50);
      return ok({ success: true, matches: data ?? [] });
    }

    return ok({ success: false, error: "Action inconnue" });
  } catch (e: any) {
    console.error("football-data error:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" });
  }
});
