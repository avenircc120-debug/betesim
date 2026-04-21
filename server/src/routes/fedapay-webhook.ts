import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { deliverValidNumber } from "../lib/number-delivery-engine.js";

const router = Router();

const SECURITY_TIPS = [
  "Utilisez la 4G/5G mobile (pas le WiFi) pour recevoir votre SMS de vérification.",
  "Activez immédiatement la double authentification (2FA) sur le compte créé.",
  "Ne partagez jamais ce numéro ou le code reçu avec un tiers.",
  "Le numéro est valide 30 jours — renouvelez avant expiration pour le conserver.",
];

// ─── Dual-mode config ────────────────────────────────────────────────────────
// Les deux modes (sandbox ET live) fonctionnent en même temps.
// Le webhook vérifie la signature avec les deux secrets et détecte le mode automatiquement.

function getSandboxSecret(): string {
  return (
    process.env.FEDAPAY_WEBHOOK_SECRET_SANDBOX ??
    process.env.FEDAPAY_WEBHOOK_SECRET ??
    ""
  );
}

function getLiveSecret(): string {
  return process.env.FEDAPAY_WEBHOOK_SECRET_LIVE ?? "";
}

function hmac(rawBody: Buffer, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Vérifie la signature et retourne le mode détecté ("sandbox" | "live" | null).
 * Teste d'abord sandbox, puis live — les deux modes coexistent.
 */
function detectModeFromSignature(
  rawBody: Buffer,
  signature: string
): "sandbox" | "live" | null {
  if (!signature) return null;

  const sandboxSecret = getSandboxSecret();
  if (sandboxSecret) {
    try {
      const expected = hmac(rawBody, sandboxSecret);
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
        return "sandbox";
      }
    } catch {}
  }

  const liveSecret = getLiveSecret();
  if (liveSecret) {
    try {
      const expected = hmac(rawBody, liveSecret);
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
        return "live";
      }
    } catch {}
  }

  return null;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleNumberPurchase(
  fedapayTransactionId: string,
  userId: string,
  service: string,
  country: string,
  productType: "simple" | "partner",
  amount: number,
  mode: "sandbox" | "live"
) {
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("fedapay_transaction_id", fedapayTransactionId)
    .maybeSingle();

  if (existing) {
    logger.info({ fedapayTransactionId, mode }, "Transaction already processed — skipping");
    return { skipped: true };
  }

  const delivery = await deliverValidNumber(country || "0", service);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const isPartner = productType === "partner";

  await supabase.from("subscriptions").insert({
    user_id: userId,
    number: delivery.number,
    country: delivery.country,
    service,
    smspool_order_id: delivery.orderId,
    fedapay_transaction_id: fedapayTransactionId,
    status: "active",
    expires_at: expiresAt,
    attempts: delivery.attempts,
  });

  await supabase.from("transactions").insert({
    user_id: userId,
    type: "number_purchase",
    status: "validated",
    amount_fcfa: amount,
    description: `[${mode.toUpperCase()}] Numéro ${service} (${delivery.country}) — ${delivery.number}`,
    virtual_number: delivery.number,
    fedapay_transaction_id: fedapayTransactionId,
  });

  if (isPartner) {
    await supabase.from("profiles").update({ is_partner: true }).eq("id", userId);
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "partner_activation",
      status: "validated",
      amount_fcfa: 0,
      description: "Activation Pack Partenaire",
    });
  }

  const { data: referral } = await supabase
    .from("referrals")
    .select("referrer_id, activated")
    .eq("referred_id", userId)
    .maybeSingle();

  if (referral?.referrer_id) {
    const { data: referrerProfile } = await supabase
      .from("profiles")
      .select("is_partner, fcfa_balance")
      .eq("id", referral.referrer_id)
      .single();

    if (referrerProfile?.is_partner) {
      const commission = Math.round(amount * 0.1);
      await supabase
        .from("profiles")
        .update({ fcfa_balance: (referrerProfile.fcfa_balance ?? 0) + commission })
        .eq("id", referral.referrer_id);

      await supabase.from("transactions").insert({
        user_id: referral.referrer_id,
        type: "referral_bonus",
        status: "validated",
        amount_fcfa: commission,
        description: `Commission parrainage — ${service} (${commission} FCFA)`,
      });
    }

    if (!referral.activated) {
      await supabase.from("referrals").update({ activated: true }).eq("referred_id", userId);
    }
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Numéro livré avec succès !",
    message: `Votre numéro ${service} est prêt : ${delivery.number}\n\n${SECURITY_TIPS.join("\n")}`,
    type: "payment_success",
  });

  logger.info(
    { userId, service, number: delivery.number, attempts: delivery.attempts, mode },
    "Number delivered via SMSPool"
  );
  return { delivered: delivery.number, attempts: delivery.attempts, expiresAt };
}

async function handleWithdrawalApproved(
  fedapayTransactionId: string,
  userId: string,
  mode: "sandbox" | "live"
) {
  await supabase
    .from("withdrawal_requests")
    .update({ status: "completed" })
    .eq("fedapay_transaction_id", fedapayTransactionId);

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Retrait effectué",
    message: "Votre retrait a été envoyé avec succès sur votre Mobile Money.",
    type: "withdrawal_success",
  });

  logger.info({ userId, fedapayTransactionId, mode }, "Withdrawal completed");
}

async function handleTransactionDeclined(
  fedapayTransactionId: string,
  userId: string | undefined,
  mode: "sandbox" | "live"
) {
  if (!userId) return;
  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Paiement refusé",
    message: "Votre paiement FedaPay a été refusé. Veuillez réessayer.",
    type: "payment_failed",
  });
  logger.warn({ userId, fedapayTransactionId, mode }, "Transaction declined");
}

// ─── Route ───────────────────────────────────────────────────────────────────

router.post("/webhook/fedapay", async (req: Request, res: Response) => {
  const rawBody: Buffer = (req as any).rawBody;
  const signature = (req.headers["x-fedapay-signature"] as string) ?? "";

  // Détection automatique du mode (sandbox ou live) via la signature
  const mode = detectModeFromSignature(rawBody, signature);

  if (!mode) {
    logger.warn(
      { hasSandboxSecret: !!getSandboxSecret(), hasLiveSecret: !!getLiveSecret() },
      "Invalid FedaPay webhook signature — rejected"
    );
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const event: string = payload?.event ?? "";
  const transaction = payload?.object ?? {};
  const fedapayTransactionId = String(transaction?.id ?? "");
  const metadata = transaction?.metadata ?? {};
  const userId: string | undefined = metadata?.user_id;
  const paymentType: string = metadata?.payment_type ?? "";
  const service: string = metadata?.service ?? "whatsapp";
  const country: string = metadata?.country ?? "0";
  const productType: "simple" | "partner" =
    metadata?.product_type === "partner" ? "partner" : "simple";
  const amount: number = Number(transaction?.amount ?? 0);

  logger.info(
    { event, fedapayTransactionId, paymentType, mode, userId },
    `FedaPay webhook [${mode.toUpperCase()}] received`
  );

  // Réponse immédiate pour éviter le timeout FedaPay
  res.status(200).json({ received: true, mode });

  // Traitement asynchrone
  (async () => {
    try {
      if (event === "transaction.approved") {
        if (paymentType === "number_purchase" && userId) {
          await handleNumberPurchase(
            fedapayTransactionId, userId, service, country, productType, amount, mode
          );
        } else if (paymentType === "withdrawal" && userId) {
          await handleWithdrawalApproved(fedapayTransactionId, userId, mode);
        } else {
          logger.warn({ paymentType, userId, mode }, "Unhandled payment type or missing userId");
        }
      } else if (
        event === "transaction.declined" ||
        event === "transaction.canceled"
      ) {
        await handleTransactionDeclined(fedapayTransactionId, userId, mode);
      } else {
        logger.info({ event, mode }, "Unhandled webhook event — ignored");
      }
    } catch (err: any) {
      logger.error(
        { err: err?.message, event, fedapayTransactionId, mode },
        "Webhook async processing error"
      );
    }
  })();
});

export default router;
