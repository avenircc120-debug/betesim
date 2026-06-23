/**
 * Edge Function: inject-to-pool v3
 *
 * Modes :
 *   - Mode "coupon libre" (nouveau) : code bookmaker + cote totale + heure de début
 *     Body: { coupon_code, total_odds, match_start_time, label? }
 *     → Prix auto-calculé depuis la cote (barème officiel)
 *
 *   - Mode "analyse complète" : crée l'analyse + le coupon
 *     Body: { analysis_data: { team_home, team_away, prediction, ... }, coupon_code, label?, price_fcfa }
 *
 *   - Mode "lien coupon seul" : lie à une analyse existante
 *     Body: { analysis_id?, label?, price_fcfa, code? }
 *
 * Barème cote → prix :
 *   2.00 – 5.49  → 250 FCFA
 *   5.50 – 15.99 → 500 FCFA
 *   16.00+       → 1000 FCFA
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomCode(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function calcPriceFromOdds(odds: number): number {
  if (odds < 5.50) return 250;
  if (odds < 16.00) return 500;
  return 1000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader         = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Session invalide" }), { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await admin.from("profiles").select("id, is_partner, display_name, referral_code").eq("id", user.id).single();
    if (!profile?.is_partner) return new Response(JSON.stringify({ error: "Accès revendeur requis. Devenez partenaire d'abord." }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const {
      analysis_data,
      coupon_code,
      label,
      code,
      analysis_id: existingAnalysisId,
      total_odds,
      match_start_time,
    } = body;

    let price_fcfa: number = body.price_fcfa ?? 0;
    let finalAnalysisId: string | null = existingAnalysisId ?? null;

    // ── Mode "coupon libre" : cote fournie → prix auto-calculé ─────────────
    if (!analysis_data && !existingAnalysisId && total_odds != null) {
      const odds = parseFloat(String(total_odds));
      if (isNaN(odds) || odds < 2.0) {
        return new Response(JSON.stringify({ error: "Cote invalide (minimum 2.00)" }), { status: 400, headers: corsHeaders });
      }
      price_fcfa = calcPriceFromOdds(odds);
    }

    // ── Mode "analyse complète" ─────────────────────────────────────────────
    if (analysis_data) {
      const { team_home, team_away, prediction } = analysis_data;
      if (!team_home || !team_away || !prediction) {
        return new Response(JSON.stringify({ error: "team_home, team_away et prediction sont requis" }), { status: 400, headers: corsHeaders });
      }
      const { data: analysis, error: anaErr } = await admin.from("analyses").insert({
        title:      `${team_home} vs ${team_away}`,
        team_home:  team_home.trim(),
        team_away:  team_away.trim(),
        league:     analysis_data.league?.trim() ?? null,
        prediction: prediction.trim(),
        confidence: analysis_data.confidence ?? "moyen",
        odds:       analysis_data.odds ?? null,
        notes:      analysis_data.notes ?? null,
        published:  true,
        source:     "revendeur",
      }).select("id").single();
      if (anaErr) throw anaErr;
      finalAnalysisId = analysis.id;

      // Prix depuis price_fcfa explicite, ou fallback barème si odds fournie
      if (!price_fcfa || price_fcfa < 100) {
        price_fcfa = analysis_data.odds ? calcPriceFromOdds(parseFloat(String(analysis_data.odds))) : 500;
      }
    }

    // Validation prix final
    if (!price_fcfa || price_fcfa < 100) {
      return new Response(JSON.stringify({ error: "Prix minimum : 100 FCFA" }), { status: 400, headers: corsHeaders });
    }

    // ── Déterminer le code ──────────────────────────────────────────────────
    const rawCode   = coupon_code ?? code;
    const finalCode = rawCode ? String(rawCode).toUpperCase().trim() : randomCode();

    const { data: existing } = await admin.from("coupons").select("id").eq("code", finalCode).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: `Code "${finalCode}" déjà utilisé. Essayez un autre code.` }), { status: 409, headers: corsHeaders });
    }

    // ── Injecter dans le Pool ───────────────────────────────────────────────
    const insertPayload: Record<string, unknown> = {
      partner_id:  user.id,
      creator_id:  user.id,
      analysis_id: finalAnalysisId,
      code:        finalCode,
      label:       label?.trim() ?? null,
      price_fcfa,
      status:      "active",
    };

    if (total_odds != null) {
      insertPayload.total_odds = parseFloat(String(total_odds));
    }
    if (match_start_time) {
      insertPayload.match_start_time = match_start_time;
    }

    const { data: coupon, error: insertErr } = await admin.from("coupons").insert(insertPayload).select().single();
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        success:          true,
        coupon_id:        coupon.id,
        code:             coupon.code,
        creator_id:       coupon.creator_id,
        analysis_id:      coupon.analysis_id,
        price_fcfa:       coupon.price_fcfa,
        total_odds:       coupon.total_odds,
        match_start_time: coupon.match_start_time,
        label:            coupon.label,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("inject-to-pool error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
