import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    // Verify FedaPay webhook signature
    // ✅ FIX : Le secret s'appelle FP_WEBHOOK_SECRET dans les secrets Supabase (pas FEDAPAY_WEBHOOK_SECRET)
    const signature = req.headers.get("X-FedaPay-Signature");
    const webhookSecret = Deno.env.get("FP_WEBHOOK_SECRET") || Deno.env.get("FEDAPAY_WEBHOOK_SECRET");
    
    if (webhookSecret && signature) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
      const expectedSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      
      if (signature !== expectedSig) {
        console.error("Invalid webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = JSON.parse(rawBody);

    // FedaPay sends event data with entity containing transaction details
    const event = body?.entity;
    if (!event) {
      return new Response(JSON.stringify({ error: "No entity in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transactionId = event.id?.toString();
    const status = event.status; // "approved", "declined", "canceled"
    const customMetadata = event.custom_metadata || {};
    const userId = customMetadata.user_id;
    const paymentType = customMetadata.payment_type; // "machine_activation" or "withdrawal"

    if (!transactionId || !status) {
      return new Response(JSON.stringify({ error: "Missing transaction data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (paymentType === "machine_activation") {
      if (status === "approved") {
        // ✅ FIX : Déterminer le type de machine depuis le montant de la transaction
        const PRICES: Record<number, string> = { 2500: "starter", 3500: "pro", 4500: "elite" };
        const RESERVE:  Record<string, number> = { starter: 1000, pro: 1400, elite: 1800 };
        const RATE:     Record<string, number> = { starter: 0.005, pro: 0.008, elite: 0.012 };
        const FEATURES: Record<string, string> = {
          starter: "Minage automatique",
          pro:     "Minage + numéro virtuel WhatsApp (5esim.net)",
          elite:   "Minage + numéro virtuel WhatsApp & Telegram (5esim.net)",
        };

        const txAmount   = Number(event.amount ?? 0);
        const machineType = PRICES[txAmount] || "starter";

        console.log(`Machine activation approved: user=${userId} amount=${txAmount} machine=${machineType}`);

        // Anti-double spend : vérifier que cette transaction n'a pas déjà été traitée
        const { data: alreadyUsed } = await adminClient
          .from("transactions")
          .select("id")
          .eq("fedapay_transaction_id", transactionId)
          .maybeSingle();

        if (alreadyUsed) {
          console.log(`Transaction ${transactionId} déjà utilisée, ignorée.`);
        } else if (userId) {
          // Vérifier qu'une machine n'est pas déjà active pour cet utilisateur
          const { data: existingSession } = await adminClient
            .from("mining_sessions")
            .select("id")
            .eq("user_id", userId)
            .neq("machine_type", "referral_bonus")
            .limit(1)
            .maybeSingle();

          if (!existingSession) {
            // ✅ CRÉER LA SESSION DE MINAGE (machine activée)
            const now    = new Date();
            const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            const { error: miningError } = await adminClient.from("mining_sessions").insert({
              user_id:         userId,
              machine_type:    machineType,
              boost_type:      machineType,
              status:          "active",
              started_at:      now.toISOString(),
              ends_at:         endsAt.toISOString(),
              rate_per_hour:   RATE[machineType],
              reserve_balance: RESERVE[machineType],
              pi_earned:       0,
            });

            if (miningError) {
              console.error("Erreur création mining_session:", miningError);
            } else {
              // Enregistrer la transaction pour anti-double spend
              await adminClient.from("transactions").insert({
                user_id:                userId,
                type:                   "deposit",
                amount_fcfa:            txAmount,
                status:                 "validated",
                fedapay_transaction_id: transactionId,
                description:            `Activation machine ${machineType.toUpperCase()} - ${txAmount} FCFA (webhook FedaPay)`,
              });

              // Notification de succès
              await adminClient.from("notifications").insert({
                user_id: userId,
                type:    "success",
                title:   `Machine ${machineType.charAt(0).toUpperCase() + machineType.slice(1)} activée ! 🚀`,
                message: `Votre machine est en route. Inclus : ${FEATURES[machineType]}.`,
              });

              // Activer le bonus de parrainage
              await adminClient.rpc("activate_referral_bonus", { p_referred_id: userId }).catch(
                (e: Error) => console.error("activate_referral_bonus error:", e)
              );

              // Livraison eSIM pour Pro et Elite
              if (machineType === "pro" || machineType === "elite") {
                const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
                const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
                fetch(`${supabaseUrl}/functions/v1/deliver-esim`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Internal-Secret": internalSecret },
                  body: JSON.stringify({ user_id: userId, machine_type: machineType }),
                }).catch((e: Error) => console.error("deliver-esim error:", e));
              }

              console.log(`✅ Machine ${machineType} activée pour user ${userId}`);
            }
          } else {
            console.log(`User ${userId} a déjà une machine active, activation ignorée.`);
          }
        }

      } else if (status === "declined" || status === "canceled") {
        if (userId) {
          await adminClient.from("notifications").insert({
            user_id: userId,
            type:    "warning",
            title:   "Paiement échoué ❌",
            message: "Votre paiement pour l'activation de la machine a échoué. Veuillez réessayer.",
          });
        }
        console.log(`Machine activation ${status} for user ${userId}`);
      }
    } else if (paymentType === "withdrawal") {
      // Handle withdrawal payout confirmation
      if (status === "approved") {
        await adminClient
          .from("withdrawal_requests")
          .update({
            status: "completed",
            fedapay_transaction_id: transactionId,
            processed_at: new Date().toISOString(),
          })
          .eq("fedapay_transaction_id", transactionId)
          .eq("status", "pending");
      } else if (status === "declined" || status === "canceled") {
        // Get withdrawal to refund user
        const { data: withdrawal } = await adminClient
          .from("withdrawal_requests")
          .select("user_id, amount_fcfa")
          .eq("fedapay_transaction_id", transactionId)
          .eq("status", "pending")
          .maybeSingle();

        if (withdrawal) {
          await adminClient
            .from("withdrawal_requests")
            .update({
              status: "failed",
              error_message: `FedaPay: ${status}`,
              processed_at: new Date().toISOString(),
            })
            .eq("fedapay_transaction_id", transactionId);

          // Refund FCFA balance
          await adminClient
            .from("profiles")
            .update({
              fcfa_balance: adminClient.rpc ? undefined : 0, // handled below
            })
            .eq("id", withdrawal.user_id);

          // Use raw SQL via RPC or direct update for balance refund
          const { data: profile } = await adminClient
            .from("profiles")
            .select("fcfa_balance")
            .eq("id", withdrawal.user_id)
            .single();

          if (profile) {
            await adminClient
              .from("profiles")
              .update({ fcfa_balance: profile.fcfa_balance + withdrawal.amount_fcfa })
              .eq("id", withdrawal.user_id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
