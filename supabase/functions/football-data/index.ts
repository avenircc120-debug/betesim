/**
 * Edge Function: football-data v2
 * Récupère les matchs depuis plusieurs sources avec failover.
 * Ligues couvertes : Ligue 1, Premier League, La Liga, Serie A,
 *   Bundesliga, Ligue des Champions, Europa League, CAF CL, AFCON
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// TheSportsDB league IDs
const LEAGUES = [
  { id: "4334", name: "Ligue 1",              country: "France"       },
  { id: "4328", name: "Premier League",        country: "Angleterre"   },
  { id: "4335", name: "La Liga",               country: "Espagne"      },
  { id: "4332", name: "Serie A",               country: "Italie"       },
  { id: "4331", name: "Bundesliga",            country: "Allemagne"    },
  { id: "4480", name: "Ligue des Champions",   country: "Europe"       },
  { id: "4481", name: "Europa League",         country: "Europe"       },
  { id: "4737", name: "CAF Champions League",  country: "Afrique"      },
  { id: "4536", name: "MLS",                   country: "États-Unis"   },
  { id: "4350", name: "Eredivisie",            country: "Pays-Bas"     },
  { id: "4351", name: "Liga NOS",              country: "Portugal"     },
  { id: "4397", name: "Super Lig",             country: "Turquie"      },
];

async function fetchSourceA(): Promise<any[]> {
  const matches: any[] = [];
  for (const league of LEAGUES) {
    try {
      await delay(200 + Math.random() * 300);
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${league.id}`,
        { headers: { "User-Agent": randomUA(), "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const json = await res.json();
      for (const e of (json?.events ?? []).slice(0, 8)) {
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
          raw_data: { id: e.idEvent, venue: e.strVenue ?? null, thumb: e.strThumb ?? null },
        });
      }
    } catch { continue; }
  }
  return matches;
}

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
      .slice(0, 10)
      .map((m: any) => ({
        external_id: `oldb_${m.matchID}`,
        source: "openligadb",
        team_home: m.team1?.teamName ?? "Équipe A",
        team_away: m.team2?.teamName ?? "Équipe B",
        league: "Bundesliga",
        country: "Allemagne",
        match_date: m.matchDateTimeUTC ?? null,
        status: "scheduled",
        raw_data: { id: m.matchID },
      }));
  } catch { return []; }
}

// Source C : API-Football via RapidAPI (si clé dispo)
async function fetchSourceC(): Promise<any[]> {
  const apiKey = Deno.env.get("RAPIDAPI_KEY");
  if (!apiKey) return [];
  try {
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(
      `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${today}&next=20`,
      {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.response ?? []).slice(0, 20).map((f: any) => ({
      external_id: `apif_${f.fixture.id}`,
      source: "api-football",
      team_home: f.teams.home.name,
      team_away: f.teams.away.name,
      league: f.league.name,
      country: f.league.country,
      match_date: new Date(f.fixture.timestamp * 1000).toISOString(),
      status: f.fixture.status.short === "NS" ? "scheduled" : f.fixture.status.short,
      raw_data: {
        id: f.fixture.id,
        venue: f.fixture.venue?.name ?? null,
        referee: f.fixture.referee ?? null,
        league_id: f.league.id,
        logo_home: f.teams.home.logo ?? null,
        logo_away: f.teams.away.logo ?? null,
      },
    }));
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "fetch");

    if (action === "fetch") {
      let matches: any[] = [];
      let sourceUsed = "";
      const errors: string[] = [];

      // Source A : TheSportsDB (12 ligues)
      try {
        matches = await fetchSourceA();
        if (matches.length > 0) sourceUsed = "thesportsdb";
      } catch (e: any) { errors.push(`A: ${e.message}`); }

      // Source B : OpenLigaDB en complément
      try {
        const bMatches = await fetchSourceB();
        const existingIds = new Set(matches.map(m => m.external_id));
        const newB = bMatches.filter(m => !existingIds.has(m.external_id));
        matches = [...matches, ...newB];
        if (sourceUsed && newB.length > 0) sourceUsed += "+openligadb";
        else if (!sourceUsed && newB.length > 0) sourceUsed = "openligadb";
      } catch (e: any) { errors.push(`B: ${e.message}`); }

      // Source C : API-Football si clé disponible
      try {
        const cMatches = await fetchSourceC();
        if (cMatches.length > 0) {
          const existingIds = new Set(matches.map(m => m.external_id));
          const newC = cMatches.filter(m => !existingIds.has(m.external_id));
          matches = [...matches, ...newC];
          if (newC.length > 0) sourceUsed += "+api-football";
        }
      } catch (e: any) { errors.push(`C: ${e.message}`); }

      if (matches.length === 0) {
        await supabase.from("notifications").insert({
          user_id: null,
          title: "⚠️ URGENT — Données foot indisponibles",
          message: `Toutes les sources sont hors ligne. Passez en saisie manuelle. Erreurs : ${errors.join(" | ")}`,
          type: "system_alert",
        }).catch(() => {});
        return ok({ success: false, error: "Toutes les sources indisponibles", matches: [] });
      }

      let saved = 0;
      for (const m of matches) {
        const { error } = await supabase.from("football_matches").upsert(m, { onConflict: "external_id" });
        if (!error) saved++;
      }

      return ok({ success: true, source: sourceUsed, fetched: matches.length, saved });
    }

    if (action === "list") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("football_matches").select("*")
        .gte("match_date", since).order("match_date", { ascending: true }).limit(100);
      return ok({ success: true, matches: data ?? [] });
    }

    return ok({ success: false, error: "Action inconnue" });
  } catch (e: any) {
    console.error("football-data error:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" });
  }
});
