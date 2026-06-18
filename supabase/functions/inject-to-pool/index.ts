/**
 * Edge Function: inject-to-pool v2
 *
 * Permet à un revendeur (partner) d'injecter un pronostic complet dans le Pool Commun.
 * Deux modes :
 *   - Mode "analyse complète" : crée l'analyse + le coupon en une seule action
 *     Body: { analysis_data: { team_home, team_away, league?, prediction, confidence?, odds? },
 *             coupon_code, label?, price_fcfa }
 *   - Mode "lien coupon seul" : lie un coupon à une analyse existante
 *     Body: { analysis_id?, label?, price_fcfa, code? }
 *
 * Dans les deux cas, creator_id = auth.uid() du revendeur (auto-taggé).
 * Retourne: { coupon_id, code, creator_id, analysis_id }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomCode(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader         = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: corsHeaders });

    // Identifier le revendeur
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Session invalide" }), { status: 401, headers: corsHeaders });

    // Vérifier statut partenaire
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await admin.from("profiles").select("id, is_partner, display_name, referral_code").eq("id", user.id).single();
    if (!profile?.is_partner) return new Response(JSON.stringify({ error: "Accès revendeur requis. Devenez partenaire d'abord." }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { analysis_data, coupon_code, label, price_fcfa = 500, code, analysis_id: existingAnalysisId } = body;

    if (!price_fcfa || price_fcfa < 100) return new Response(JSON.stringify({ error: "Prix minimum : 100 FCFA" }), { status: 400, headers: corsHeaders });

    let finalAnalysisId: string | null = existingAnalysisId ?? null;

    // ── Mode "analyse complète" : créer l'analyse d'abord ──────────────────
    if (analysis_data) {
      const { team_home, team_away, prediction } = analysis_data;
      if (!team_home || !team_away || !prediction) {
        return new Response(JSON.stringify({ error: "team_home, team_away et prediction sont requis" }), { status: 400, headers: corsHeaders });
      }
      const { data: analysis, error: anaErr } = await admin.from("analyses").insert({
        title:       `${team_home} vs ${team_away}`,
        team_home:   team_home.trim(),
        team_away:   team_away.trim(),
        league:      analysis_data.league?.trim() ?? null,
        prediction:  prediction.trim(),
        confidence:  analysis_data.confidence ?? "moyen",
        odds:        analysis_data.odds ?? null,
        notes:       analysis_data.notes ?? null,
        published:   true,
        source:      "revendeur",
      }).select("id").single();
      if (anaErr) throw anaErr;
      finalAnalysisId = analysis.id;
    }

    // ── Déterminer le code du coupon ────────────────────────────────────────
    // En mode "analyse complète", le coupon_code est le code bookmaker (1xbet/1win).
    // En mode simple, on utilise `code` ou on génère automatiquement.
    const rawCode = coupon_code ?? code;
    const finalCode = rawCode ? String(rawCode).toUpperCase().trim() : randomCode();

    // Vérifier unicité
    const { data: existing } = await admin.from("coupons").select("id").eq("code", finalCode).maybeSingle();
    if (existing) return new Response(JSON.stringify({ error: `Code "${finalCode}" déjà utilisé. Essayez un autre code ou laissez vide pour auto-générer.` }), { status: 409, headers: corsHeaders });

    // ── Injecter le coupon dans le Pool Commun ──────────────────────────────
    const { data: coupon, error: insertErr } = await admin.from("coupons").insert({
      partner_id:  user.id,
      creator_id:  user.id,
      analysis_id: finalAnalysisId,
      code:        finalCode,
      label:       label?.trim() ?? null,
      price_fcfa,
      status:      "active",
    }).select().single();
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        success:     true,
        coupon_id:   coupon.id,
        code:        coupon.code,
        creator_id:  coupon.creator_id,
        analysis_id: coupon.analysis_id,
        price_fcfa:  coupon.price_fcfa,
        label:       coupon.label,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("inject-to-pool error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
