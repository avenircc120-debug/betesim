/**
 * Edge Function: football-data v3
 * Toutes compétitions : ligues, coupes nationales, compétitions internationales
 *   Coupe du Monde FIFA, Euro UEFA, Copa America, CAN, Nations League,
 *   Champions League, Europa League, Conférence League, et toutes les coupes nationales
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

// ── Toutes les compétitions TheSportsDB ──────────────────────────────────────
const ALL_COMPETITIONS = [
  // ── Compétitions internationales majeures ──
  { id: "4443", name: "Coupe du Monde FIFA",        country: "Monde",       type: "international" },
  { id: "4418", name: "Euro UEFA",                  country: "Europe",      type: "international" },
  { id: "4415", name: "Copa America",               country: "Amérique Sud",type: "international" },
  { id: "4517", name: "CAN — Coupe d'Afrique",      country: "Afrique",     type: "international" },
  { id: "4635", name: "UEFA Nations League",        country: "Europe",      type: "international" },
  { id: "4406", name: "Gold Cup CONCACAF",          country: "Amérique Nord",type: "international" },
  { id: "4408", name: "AFC Asian Cup",              country: "Asie",        type: "international" },

  // ── Clubs UEFA ──
  { id: "4480", name: "Ligue des Champions",        country: "Europe",      type: "clubs_europe" },
  { id: "4481", name: "Europa League",              country: "Europe",      type: "clubs_europe" },
  { id: "4882", name: "Conférence League",          country: "Europe",      type: "clubs_europe" },

  // ── Clubs CAF / Afrique ──
  { id: "4737", name: "CAF Champions League",       country: "Afrique",     type: "clubs_afrique" },
  { id: "4738", name: "CAF Confederation Cup",      country: "Afrique",     type: "clubs_afrique" },

  // ── Ligues nationales ──
  { id: "4334", name: "Ligue 1",                    country: "France",      type: "ligue" },
  { id: "4328", name: "Premier League",             country: "Angleterre",  type: "ligue" },
  { id: "4335", name: "La Liga",                    country: "Espagne",     type: "ligue" },
  { id: "4332", name: "Serie A",                    country: "Italie",      type: "ligue" },
  { id: "4331", name: "Bundesliga",                 country: "Allemagne",   type: "ligue" },
  { id: "4350", name: "Eredivisie",                 country: "Pays-Bas",    type: "ligue" },
  { id: "4351", name: "Liga NOS",                   country: "Portugal",    type: "ligue" },
  { id: "4397", name: "Süper Lig",                  country: "Turquie",     type: "ligue" },
  { id: "4424", name: "Pro League Belgique",        country: "Belgique",    type: "ligue" },
  { id: "4536", name: "MLS",                        country: "États-Unis",  type: "ligue" },
  { id: "4346", name: "Brasileirão Série A",        country: "Brésil",      type: "ligue" },
  { id: "4406", name: "Liga MX",                    country: "Mexique",     type: "ligue" },
  { id: "4501", name: "Saudi Pro League",           country: "Arabie Saoudite", type: "ligue" },
  { id: "4507", name: "Egyptian Premier League",    country: "Égypte",      type: "ligue" },

  // ── Coupes nationales ──
  { id: "4337", name: "Coupe de France",            country: "France",      type: "coupe" },
  { id: "4338", name: "FA Cup",                     country: "Angleterre",  type: "coupe" },
  { id: "4339", name: "Carabao Cup (EFL)",          country: "Angleterre",  type: "coupe" },
  { id: "4340", name: "Copa del Rey",               country: "Espagne",     type: "coupe" },
  { id: "4342", name: "DFB Pokal",                  country: "Allemagne",   type: "coupe" },
  { id: "4344", name: "Coppa Italia",               country: "Italie",      type: "coupe" },
  { id: "4345", name: "Coupe de France",            country: "France",      type: "coupe" },
  { id: "4543", name: "Coupe d'Algérie",            country: "Algérie",     type: "coupe" },
  { id: "4575", name: "Coupe du Sénégal",           country: "Sénégal",     type: "coupe" },
];

// ── Source A : TheSportsDB (multi-ligues, multi-coupes) ──────────────────────
async function fetchSourceA(): Promise<any[]> {
  const matches: any[] = [];
  const seenIds = new Set<string>();

  for (const comp of ALL_COMPETITIONS) {
    try {
      await delay(150 + Math.random() * 200);
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${comp.id}`,
        { headers: { "User-Agent": randomUA(), "Accept": "application/json" }, signal: AbortSignal.timeout(7000) }
      );
      if (!res.ok) continue;
      const json = await res.json();
      for (const e of (json?.events ?? []).slice(0, 6)) {
        const extId = `sdb_${e.idEvent}`;
        if (seenIds.has(extId)) continue;
        seenIds.add(extId);
        const dateStr = e.dateEvent && e.strTime
          ? `${e.dateEvent}T${e.strTime.endsWith("Z") ? e.strTime : e.strTime + "Z"}`
          : null;
        matches.push({
          external_id: extId,
          source: "thesportsdb",
          team_home: e.strHomeTeam ?? "?",
          team_away: e.strAwayTeam ?? "?",
          league: comp.name,
          country: comp.country,
          competition_type: comp.type,
          match_date: dateStr ? new Date(dateStr).toISOString() : null,
          status: "scheduled",
          raw_data: { id: e.idEvent, venue: e.strVenue ?? null, thumb: e.strThumb ?? null, competition_type: comp.type },
        });
      }
    } catch { continue; }
  }
  return matches;
}

// ── Source B : OpenLigaDB (Bundesliga live) ──────────────────────────────────
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
        competition_type: "ligue",
        match_date: m.matchDateTimeUTC ?? null,
        status: "scheduled",
        raw_data: { id: m.matchID },
      }));
  } catch { return []; }
}

// ── Source C : API-Football via RapidAPI (si clé dispo — données premium) ───
async function fetchSourceC(): Promise<any[]> {
  const apiKey = Deno.env.get("RAPIDAPI_KEY");
  if (!apiKey) return [];
  try {
    const today = new Date().toISOString().split("T")[0];
    // Fetch matchs du jour + demain
    const urls = [
      `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${today}&next=30`,
    ];
    const allMatches: any[] = [];
    const seenIds = new Set<string>();

    for (const url of urls) {
      const res = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      for (const f of (json?.response ?? [])) {
        const extId = `apif_${f.fixture.id}`;
        if (seenIds.has(extId)) continue;
        seenIds.add(extId);
        allMatches.push({
          external_id: extId,
          source: "api-football",
          team_home: f.teams.home.name,
          team_away: f.teams.away.name,
          league: f.league.name,
          country: f.league.country,
          competition_type: f.league.type === "Cup" ? "coupe" : "ligue",
          match_date: new Date(f.fixture.timestamp * 1000).toISOString(),
          status: f.fixture.status.short === "NS" ? "scheduled" : f.fixture.status.short,
          raw_data: {
            id: f.fixture.id,
            venue: f.fixture.venue?.name ?? null,
            referee: f.fixture.referee ?? null,
            league_id: f.league.id,
            logo_home: f.teams.home.logo ?? null,
            logo_away: f.teams.away.logo ?? null,
            round: f.league.round ?? null,
          },
        });
      }
    }
    return allMatches;
  } catch (e: any) { console.error("Source C error:", e?.message); return []; }
}

// ── Handler principal ────────────────────────────────────────────────────────
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
      // ── Purge automatique : supprimer les matchs dont la date est passée ──
      await supabase.from("football_matches").delete().lt("match_date", new Date().toISOString());

      let matches: any[] = [];
      const errors: string[] = [];
      const sources: string[] = [];

      // Source A : TheSportsDB — toutes compétitions
      try {
        const a = await fetchSourceA();
        if (a.length > 0) { matches = [...matches, ...a]; sources.push("thesportsdb"); }
      } catch (e: any) { errors.push(`A: ${e.message}`); }

      // Source B : OpenLigaDB en complément
      try {
        const existingIds = new Set(matches.map(m => m.external_id));
        const b = (await fetchSourceB()).filter(m => !existingIds.has(m.external_id));
        if (b.length > 0) { matches = [...matches, ...b]; sources.push("openligadb"); }
      } catch (e: any) { errors.push(`B: ${e.message}`); }

      // Source C : API-Football (premium, si clé disponible)
      try {
        const existingIds = new Set(matches.map(m => m.external_id));
        const c = (await fetchSourceC()).filter(m => !existingIds.has(m.external_id));
        if (c.length > 0) { matches = [...matches, ...c]; sources.push("api-football"); }
      } catch (e: any) { errors.push(`C: ${e.message}`); }

      if (matches.length === 0) {
        await supabase.from("notifications").insert({
          user_id: null,
          title: "⚠️ URGENT — Données foot indisponibles",
          message: `Toutes les sources hors ligne. Passez en saisie manuelle. Erreurs : ${errors.join(" | ")}`,
          type: "system_alert",
        }).catch(() => {});
        return ok({ success: false, error: "Toutes les sources indisponibles", matches: [] });
      }

      // Upsert dans football_matches
      let saved = 0;
      for (const m of matches) {
        const { error } = await supabase.from("football_matches").upsert(m, { onConflict: "external_id" });
        if (!error) saved++;
      }

      return ok({ success: true, sources: sources.join("+"), fetched: matches.length, saved });
    }

    if (action === "list") {
      // Seulement les matchs à venir (WHERE match_date > NOW())
      const { data } = await supabase
        .from("football_matches").select("*")
        .gte("match_date", new Date().toISOString())
        .order("match_date", { ascending: true }).limit(200);
      return ok({ success: true, matches: data ?? [] });
    }

    if (action === "list_by_type") {
      const type = body.competition_type ?? null;
      // Seulement les matchs à venir (WHERE match_date > NOW())
      let query = supabase.from("football_matches").select("*").gte("match_date", new Date().toISOString()).order("match_date", { ascending: true }).limit(100);
      if (type) query = query.eq("competition_type", type);
      const { data } = await query;
      return ok({ success: true, matches: data ?? [] });
    }

    return ok({ success: false, error: "Action inconnue (fetch | list | list_by_type)" });
  } catch (e: any) {
    console.error("football-data error:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" });
  }
});
