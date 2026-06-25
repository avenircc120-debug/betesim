import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Compte de test : réinitialisé automatiquement à chaque connexion ─────────
const TEST_EMAILS = new Set(["jeremyhounmetin@gmail.com"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { user_id, email, display_name, photo_url, phone_number } = await req.json();
    if (!user_id) throw new Error("user_id requis");

    const isTestAccount = email && TEST_EMAILS.has(email.toLowerCase().trim());

    // ── Compte test : remise à zéro complète à chaque connexion ──────────────
    if (isTestAccount) {
      await Promise.all([
        supabase.from("partner_packs").delete().eq("user_id", user_id),
        supabase.from("subscriptions").delete().eq("user_id", user_id),
        supabase.from("transactions").delete().eq("user_id", user_id),
        supabase.from("notifications").delete().eq("user_id", user_id),
        supabase.from("referrals").delete().or(`referred_id.eq.${user_id},referrer_id.eq.${user_id}`),
      ]);

      // Réinitialise le profil (solde, partenaire, code parrainage)
      await supabase.from("profiles").upsert({
        id: user_id,
        email: email ?? null,
        display_name: display_name ?? null,
        username: display_name ?? null,
        photo_url: photo_url ?? null,
        phone_number: phone_number ?? null,
        fcfa_balance: 0,
        fcfa_locked_balance: 0,
        is_partner: false,
        is_admin: false,
        referral_code: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      return new Response(
        JSON.stringify({ success: true, test_reset: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Compte normal : créer le profil s'il n'existe pas encore ─────────────
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, referral_code")
      .eq("id", user_id)
      .maybeSingle();

    if (!existing) {
      // Nouveau compte : génère un code de parrainage unique
      const refCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      await supabase.from("profiles").insert({
        id: user_id,
        email: email ?? null,
        display_name: display_name ?? null,
        username: display_name ?? null,
        photo_url: photo_url ?? null,
        phone_number: phone_number ?? null,
        fcfa_balance: 0,
        fcfa_locked_balance: 0,
        is_partner: false,
        is_admin: false,
        referral_code: refCode,
      });
    } else {
      // Compte existant : met à jour les infos de base uniquement
      await supabase.from("profiles").update({
        email: email ?? null,
        display_name: display_name ?? null,
        username: display_name ?? null,
        photo_url: photo_url ?? null,
        phone_number: phone_number ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", user_id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("ensure-profile error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message ?? "Erreur interne" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
