/**
 * Edge Function: request-withdrawal
 *
 * Crée une demande de retrait Mobile Money (MTN / Moov / Orange) en respectant
 * la règle du wallet bloqué :
 *
 *   solde retirable = fcfa_balance - fcfa_locked_balance
 *
 * fcfa_locked_balance correspond aux remboursements de livraisons SMSPool
 * échouées. Cet argent ne peut servir qu'à racheter une SIM, jamais à retirer.
 * Les gains de parrainage, eux, créditent fcfa_balance uniquement et restent
 * donc retirables.
 *
 * NOTE: Cette fonction n'effectue PAS le payout côté FedaPay — elle inscrit la
 * demande dans `withdrawal_requests` (statut `pending`) afin que le job de
 * paiement existant la traite. Le code de réception de paiement n'est pas
 * touché.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_PROVIDERS = new Set(["mtn", "moov", "orange"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { user_id, amount_fcfa, phone_number, provider } = body ?? {};

    if (!user_id) throw new Error("user_id requis");
    if (!amount_fcfa || typeof amount_fcfa !== "number" || amount_fcfa <= 0) {
      throw new Error("Montant invalide");
    }
    if (!phone_number || String(phone_number).trim().length < 8) {
      throw new Error("Numéro de téléphone invalide");
    }
    const providerNorm = String(provider ?? "").toLowerCase();
    if (!ALLOWED_PROVIDERS.has(providerNorm)) {
      throw new Error("Opérateur non supporté");
    }

    // Récupérer les soldes du profil
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("fcfa_balance, fcfa_locked_balance")
      .eq("id", user_id)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    if (!profile) throw new Error("Profil introuvable");

    const balance = (profile as any).fcfa_balance ?? 0;
    const locked = (profile as any).fcfa_locked_balance ?? 0;
    const withdrawable = Math.max(0, balance - locked);

    if (amount_fcfa > withdrawable) {
      const lockedMsg = locked > 0
        ? ` (${locked.toLocaleString("fr-FR")} FCFA sont bloqués pour réachat de SIM uniquement)`
        : "";
      throw new Error(
        `Solde retirable insuffisant. Disponible : ${withdrawable.toLocaleString("fr-FR")} FCFA${lockedMsg}.`
      );
    }

    // ── Commission 20% pour les partenaires ──────────────────────────────
    const { data: profFull } = await supabase
      .from("profiles").select("is_partner").eq("id", user_id).maybeSingle();
    const isPartner = !!(profFull as any)?.is_partner;

    let netAmount   = amount_fcfa;
    let commission  = 0;
    if (isPartner) {
      commission = Math.round(amount_fcfa * 0.20);
      netAmount  = amount_fcfa - commission;
    }

    // Débiter le wallet (montant brut demandé)
    const newBalance = balance - amount_fcfa;
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ fcfa_balance: newBalance })
      .eq("id", user_id);
    if (updErr) throw new Error(updErr.message);

    // Créer la demande de retrait (montant net reçu par l'utilisateur)
    const { data: wd, error: wdErr } = await supabase
      .from("withdrawal_requests")
      .insert({
        user_id,
        amount_fcfa: netAmount,
        phone_number: String(phone_number).trim(),
        provider: providerNorm,
        status: "pending",
      })
      .select("id")
      .single();
    if (wdErr) {
      await supabase.from("profiles").update({ fcfa_balance: balance }).eq("id", user_id);
      throw new Error(wdErr.message);
    }

    // Enregistrer la commission si partenaire
    if (isPartner && commission > 0) {
      await supabase.from("commission_records").insert({
        partner_id: user_id,
        type: "withdrawal",
        gross_amount: amount_fcfa,
        commission_amount: commission,
        net_amount: netAmount,
        reference_id: wd.id,
        description: `Commission 20% sur retrait ${providerNorm.toUpperCase()} de ${amount_fcfa.toLocaleString("fr-FR")} FCFA`,
      });
    }

    await supabase.from("transactions").insert({
      user_id,
      type: "withdrawal_request",
      status: "pending",
      amount_fcfa: netAmount,
      description: isPartner
        ? `Retrait ${providerNorm.toUpperCase()} vers ${phone_number} (${netAmount.toLocaleString("fr-FR")} FCFA après commission 20%)`
        : `Demande de retrait ${providerNorm.toUpperCase()} vers ${phone_number}`,
    });

    return new Response(
      JSON.stringify({ success: true, withdrawal_id: wd.id, amount_fcfa: netAmount, commission_fcfa: commission }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const msg = err?.message ?? String(err) ?? "Erreur interne";
    console.error("request-withdrawal error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
