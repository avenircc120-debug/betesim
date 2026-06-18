/**
 * Edge Function: inject-to-pool
 *
 * Permet à un revendeur (partner) d'injecter un coupon dans le Pool Commun.
 * Le creator_id est automatiquement posé = auth.uid() du revendeur.
 *
 * Body: { analysis_id?, label?, price_fcfa, code? }
 * Retourne: { coupon_id, code, creator_id }
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: corsHeaders });

    // Client utilisateur pour identifier le revendeur
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Session invalide" }), { status: 401, headers: corsHeaders });

    // Vérifier que l'utilisateur est bien partenaire
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile, error: profErr } = await adminClient
      .from("profiles")
      .select("id, is_partner, display_name")
      .eq("id", user.id)
      .single();
    if (profErr || !profile) return new Response(JSON.stringify({ error: "Profil introuvable" }), { status: 404, headers: corsHeaders });
    if (!profile.is_partner) return new Response(JSON.stringify({ error: "Accès revendeur requis" }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { analysis_id, label, price_fcfa = 500, code } = body;

    if (!price_fcfa || price_fcfa < 100) {
      return new Response(JSON.stringify({ error: "Prix minimum : 100 FCFA" }), { status: 400, headers: corsHeaders });
    }

    const couponCode = (code ?? randomCode()).toUpperCase();

    // Vérifier unicité du code
    const { data: existing } = await adminClient.from("coupons").select("id").eq("code", couponCode).maybeSingle();
    if (existing) return new Response(JSON.stringify({ error: "Ce code existe déjà, essayez sans code pour en générer un automatiquement" }), { status: 409, headers: corsHeaders });

    // Injecter le coupon dans le Pool Commun
    const { data: coupon, error: insertErr } = await adminClient
      .from("coupons")
      .insert({
        partner_id: user.id,
        creator_id: user.id,
        analysis_id: analysis_id ?? null,
        code: couponCode,
        label: label ?? null,
        price_fcfa,
        status: "active",
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ success: true, coupon_id: coupon.id, code: coupon.code, creator_id: coupon.creator_id, price_fcfa: coupon.price_fcfa }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("inject-to-pool error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
