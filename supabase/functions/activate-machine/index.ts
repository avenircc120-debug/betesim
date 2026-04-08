import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tous les prix en FCFA
const MACHINE_PRICES: Record<string, number> = {
  starter: 2500,
  pro:     3500,
  elite:   4500,
};

// Réserve initiale identique pour toutes les machines : 1000π
const RESERVE_PI = 1000;

// Vitesse : 1000π ÷ 720h = 1.3889 π/h (environ 1.38 π/h)
const RATE_PER_HOUR = RESERVE_PI / 720;

// Fonctionnalités débloquées par machine
const MACHINE_FEATURES: Record<string, string[]> = {
  starter: ["Minage automatique"],
  pro:     ["Minage automatique", "Numéro WhatsApp virtuel (5sim.net)"],
  elite:   ["Minage automatique", "Numéro WhatsApp virtuel (5sim.net)", "Numéro Telegram virtuel (5sim.net)"],
};

const VALID_MACHINE_TYPES = ["starter", "pro", "elite"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── 1. Vérification du token JWT ───────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const body = await req.json();
    const { machine_type, fedapay_transaction_id, timestamp, country } = body;

    // ─── 2. Anti-replay : rejeter les requêtes de plus de 30 secondes ───────
    if (!timestamp || Math.abs(Date.now() - Number(timestamp)) > 30_000) {
      return new Response(JSON.stringify({ error: "Requête expirée. Veuillez réessayer." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. Validation du type de machine ────────────────────────────────────
    const selectedMachine = VALID_MACHINE_TYPES.includes(machine_type) ? machine_type : null;
    if (!selectedMachine) {
      return new Response(JSON.stringify({ error: "Type de machine invalide. Choisissez : starter, pro ou elite." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!fedapay_transaction_id) {
      return new Response(JSON.stringify({ error: "L'identifiant de transaction FedaPay est requis." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const machinePriceFcfa = MACHINE_PRICES[selectedMachine];
    const features = MACHINE_FEATURES[selectedMachine];

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── 4. Vérification FedaPay : transaction approuvée + montant correct ───
    const mode = Deno.env.get("FP_MODE") || "sandbox";
    const secretKey =
      mode === "live"
        ? (Deno.env.get("FP_SECRET_LIVE")    || Deno.env.get("FEDAPAY_SECRET_KEY") || "")
        : (Deno.env.get("FP_SECRET_SANDBOX") || Deno.env.get("FEDAPAY_SECRET_KEY") || "");

    const apiBase = (mode === "live" || secretKey.startsWith("sk_live"))
      ? "https://api.fedapay.com/v1"
      : "https://sandbox-api.fedapay.com/v1";

    const verifyRes = await fetch(`${apiBase}/transactions/${fedapay_transaction_id}`, {
      headers: { "Authorization": `Bearer ${secretKey}` },
    });

    if (!verifyRes.ok) {
      console.error("FedaPay verify failed:", verifyRes.status);
      return new Response(JSON.stringify({ error: "Transaction FedaPay introuvable ou invalide." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyData = await verifyRes.json();
    console.log("FedaPay verify response:", JSON.stringify(verifyData).slice(0, 800));

    // FedaPay retourne la clé "v1/transaction" (avec slash)
    const txObj =
      verifyData?.["v1/transaction"] ||
      verifyData?.transaction        ||
      verifyData?.data               ||
      verifyData;

    const txStatus = txObj?.status || verifyData?.status;
    console.log("txStatus:", txStatus, "| txObj keys:", Object.keys(txObj || {}).join(","));

    if (txStatus !== "approved") {
      return new Response(
        JSON.stringify({ error: `Paiement non approuvé (statut FedaPay : ${txStatus ?? "inconnu"}).` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier que le montant payé correspond au prix de la machine
    const txAmount = txObj?.amount ?? verifyData?.amount;
    if (txAmount && Number(txAmount) < machinePriceFcfa) {
      return new Response(
        JSON.stringify({
          error: `Montant insuffisant : ${txAmount} FCFA reçus, ${machinePriceFcfa} FCFA requis pour la machine ${selectedMachine}.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 5. Anti-double spend : même transaction ne peut pas activer deux machines ─
    const { data: alreadyUsed } = await adminClient
      .from("transactions")
      .select("id")
      .eq("fedapay_transaction_id", fedapay_transaction_id.toString())
      .maybeSingle();

    if (alreadyUsed) {
      return new Response(
        JSON.stringify({ error: "Cette transaction FedaPay a déjà été utilisée pour activer une machine." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 6. Un seul utilisateur = une seule machine ────────────────────────
    const { data: existingSession } = await adminClient
      .from("mining_sessions")
      .select("id")
      .eq("user_id", userId)
      .neq("machine_type", "referral_bonus")
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      return new Response(
        JSON.stringify({ error: "Vous avez déjà une machine active. Il est impossible d'en activer une seconde." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 7. Création de la session de minage permanente jusqu'en 2099 ────────
    const now = new Date();
    const permanentExpiry = new Date("2099-12-31T23:59:59.000Z");

    const { error: miningError } = await adminClient.from("mining_sessions").insert({
      user_id:        userId,
      machine_type:   selectedMachine,
      status:         "active",
      started_at:     now.toISOString(),
      ends_at:        permanentExpiry.toISOString(),
      boost_type:     selectedMachine,
      reserve_balance: RESERVE_PI,           // 1000π pour toutes les machines
      rate_per_hour:   RATE_PER_HOUR,        // 1000÷720 ≈ 1.3889 π/h
    });

    if (miningError) throw miningError;

    // ─── 8. Enregistrement de la transaction (anti-double spend) ─────────────
    await adminClient.from("transactions").insert({
      user_id:                userId,
      type:                   "deposit",
      amount_fcfa:            machinePriceFcfa,
      status:                 "validated",
      fedapay_transaction_id: fedapay_transaction_id.toString(),
      description:            `Activation machine ${selectedMachine.toUpperCase()} — ${machinePriceFcfa} FCFA via FedaPay`,
    });

    // ─── 9. Notification de succès à l'utilisateur ───────────────────────────
    await adminClient.from("notifications").insert({
      user_id: userId,
      type:    "success",
      title:   `Machine ${selectedMachine.charAt(0).toUpperCase() + selectedMachine.slice(1)} activée ! 🚀`,
      message: `Votre machine tourne désormais. Fonctionnalités incluses : ${features.join(", ")}.`,
    });

    // ─── 10. Bonus de parrainage pour le parrain ─────────────────────────────
    // La fonction RPC remplit d'abord la réserve du parrain jusqu'à 1000π
    // puis le surplus va en session turbo de 24h.
    await adminClient.rpc("activate_referral_bonus", { p_referred_id: userId });

    // ─── 11. Livraison eSIM pour Pro et Elite (arrière-plan) ─────────────────
    if (selectedMachine === "pro" || selectedMachine === "elite") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
      // Appel non bloquant : l'utilisateur choisira son pays depuis l'app
      fetch(`${supabaseUrl}/functions/v1/deliver-esim`, {
        method: "POST",
        headers: {
          "Content-Type":    "application/json",
          "X-Internal-Secret": internalSecret,
        },
        body: JSON.stringify({
          user_id:      userId,
          machine_type: selectedMachine,
          country:      country ?? "fr",
        }),
      }).catch((err) => console.error("deliver-esim background call failed:", err));
    }

    return new Response(
      JSON.stringify({
        success:      true,
        machine_type: selectedMachine,
        amount_fcfa:  machinePriceFcfa,
        features,
        reserve_pi:   RESERVE_PI,
        rate_per_hour: RATE_PER_HOUR.toFixed(4),
        session_expires: permanentExpiry.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("activate-machine error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur interne." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
