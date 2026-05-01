/**
 * generate-booking-code
 * Réservé au propriétaire (jeremyhounmetin@gmail.com).
 *
 * Actions :
 *  • generate  — sélectionne les meilleures analyses via Groq et génère un code
 *  • lookup    — retourne le détail d'un code existant
 *  • list      — liste les derniers codes (admin)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_EMAIL = "jeremyhounmetin@gmail.com";
const GROQ_URL    = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL  = "llama-3.3-70b-versatile";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: unknown)  { return new Response(JSON.stringify(data),  { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function err(msg: string, status = 400) { return new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

/** Génère un code alphanumérique unique (ex: WIN-A3F2K9) */
function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "WIN-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** URL de recherche 1win pour un match donné */
function onewinUrl(home: string, away: string): string {
  const q = encodeURIComponent(`${home} ${away}`);
  return `https://1win.com/betting#search=${q}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabaseUrl   = Deno.env.get("SUPABASE_URL")!;
  const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey       = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader    = req.headers.get("Authorization") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const supabaseUser  = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await supabaseUser.auth.getUser();

  const body = await req.json().catch(() => ({}));
  const { action = "generate" } = body;

  // ── LOOKUP (public) ───────────────────────────────────────────────────────
  if (action === "lookup") {
    const { code } = body;
    if (!code) return err("code manquant");
    const { data, error } = await supabaseAdmin
      .from("booking_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return err("Code introuvable ou expiré", 404);
    return ok({ success: true, booking: data });
  }

  // ── Vérifier propriétaire pour les actions admin ──────────────────────────
  if (!user || user.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    return err("Accès réservé au propriétaire", 403);
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const { data } = await supabaseAdmin
      .from("booking_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    return ok({ success: true, codes: data ?? [] });
  }

  // ── GENERATE ──────────────────────────────────────────────────────────────
  const { request: userRequest = "", count = 3 } = body;

  // 1. Récupérer les analyses publiées disponibles
  const { data: analyses, error: dbErr } = await supabaseAdmin
    .from("analyses")
    .select("id, title, team_home, team_away, league, country, match_date, prediction, confidence, odds")
    .eq("published", true)
    .in("result", ["en_attente"])
    .gt("match_date", new Date().toISOString())
    .order("confidence", { ascending: false })
    .limit(30);

  if (dbErr || !analyses?.length) {
    return err("Aucune analyse disponible pour aujourd'hui");
  }

  // 2. Demander à Groq de sélectionner les meilleures
  const groqKey = Deno.env.get("GROQ_API_KEY");
  let selections: typeof analyses = [];

  if (groqKey && analyses.length > Number(count)) {
    try {
      const prompt = `Tu es un expert en pronostics sportifs.
Voici ${analyses.length} analyses disponibles (JSON) :
${JSON.stringify(analyses, null, 2)}

Demande de l'admin : "${userRequest || `Sélectionne les ${count} meilleurs matchs pour un coupon`}"

Sélectionne exactement ${count} matchs avec le meilleur ratio confiance/cote.
Réponds UNIQUEMENT avec un tableau JSON des IDs sélectionnés, exemple: ["id1","id2","id3"]`;

      const groqRes = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });
      const groqData = await groqRes.json();
      const text = groqData.choices?.[0]?.message?.content ?? "";
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const ids: string[] = JSON.parse(match[0]);
        selections = analyses.filter(a => ids.includes(a.id));
      }
    } catch { /* fallback */ }
  }

  // Fallback : prendre les N premiers par confiance
  if (!selections.length) {
    selections = analyses.slice(0, Number(count));
  }

  // 3. Construire les détails de chaque sélection
  const selectionDetails = selections.map(a => ({
    analysis_id:  a.id,
    team_home:    a.team_home,
    team_away:    a.team_away,
    league:       a.league ?? "",
    country:      a.country ?? "",
    match_date:   a.match_date,
    prediction:   a.prediction,
    confidence:   a.confidence,
    odds:         a.odds,
    onewin_url:   onewinUrl(a.team_home, a.team_away),
  }));

  // 4. Calculer la cote totale
  const totalOdds = selectionDetails
    .reduce((acc, s) => acc * (Number(s.odds) || 1), 1)
    .toFixed(2);

  // 5. Générer un code unique
  let code = makeCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await supabaseAdmin
      .from("booking_codes")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    code = makeCode();
    attempts++;
  }

  // 6. Sauvegarder en base
  const { error: insertErr } = await supabaseAdmin.from("booking_codes").insert({
    code,
    selections: selectionDetails,
    note: userRequest || null,
    created_by: user.email,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (insertErr) return err("Erreur sauvegarde: " + insertErr.message);

  return ok({
    success:    true,
    code,
    total_odds: totalOdds,
    match_count: selectionDetails.length,
    selections: selectionDetails,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    message: `✅ Code **${code}** généré — ${selectionDetails.length} matchs, cote totale ×${totalOdds}`,
  });
});
