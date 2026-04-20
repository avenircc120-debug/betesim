/**
 * Routes — Gestion des numéros virtuels
 * Piliers 1, 3, 4
 */

import { Router, type Request, type Response } from "express";
import { supabase } from "../lib/supabase.js";
import { getCountries, getServices, getServicesByCountry, getBalance } from "../lib/smspool.js";
import { deliverValidNumber } from "../lib/number-delivery-engine.js";
import { waitForSMS, validateNumberViaSMSPool } from "../lib/number-validator.js";
import { cancelOrder } from "../lib/smspool.js";

const router = Router();

const SECURITY_TIPS = [
  "Utilisez la 4G/5G mobile (pas le WiFi) pour recevoir votre SMS de vérification.",
  "Activez immédiatement la double authentification (2FA) sur le compte créé.",
  "Ne partagez jamais ce numéro ou le code reçu avec un tiers.",
  "Le numéro est valide 30 jours — renouvelez avant expiration pour le conserver.",
];

async function getAuthUser(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id ?? null;
}

// GET /api/numbers/countries
router.get("/numbers/countries", async (req: Request, res: Response) => {
  try {
    const countries = await getCountries();
    res.json({ countries });
  } catch (err: any) {
    req.log.error({ err: err.message }, "Failed to fetch countries");
    res.status(500).json({ error: "Impossible de récupérer la liste des pays." });
  }
});

// GET /api/numbers/services
router.get("/numbers/services", async (req: Request, res: Response) => {
  try {
    const { country } = req.query as { country?: string };
    const services = country
      ? await getServicesByCountry(country)
      : await getServices();
    res.json({ services });
  } catch (err: any) {
    req.log.error({ err: err.message }, "Failed to fetch services");
    res.status(500).json({ error: "Impossible de récupérer la liste des services." });
  }
});

// GET /api/numbers/balance
router.get("/numbers/balance", async (_req: Request, res: Response) => {
  try {
    const balance = await getBalance();
    res.json({ balance });
  } catch (err: any) {
    res.status(500).json({ error: "Balance check failed" });
  }
});

// POST /api/numbers/order
// Body: { country, service, user_id? }
router.post("/numbers/order", async (req: Request, res: Response) => {
  const userId = await getAuthUser(req.headers.authorization);
  const { country, service, product_type, fedapay_transaction_id } = req.body as {
    country: string;
    service: string;
    product_type?: "simple" | "partner";
    fedapay_transaction_id?: string;
  };

  if (!country || !service) {
    res.status(400).json({ error: "country et service sont requis." });
    return;
  }

  if (!userId) {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }

  // Check for duplicate fedapay transaction
  if (fedapay_transaction_id) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("fedapay_transaction_id", fedapay_transaction_id)
      .maybeSingle();
    if (existing) {
      res.status(409).json({ error: "Transaction déjà traitée." });
      return;
    }
  }

  try {
    req.log.info({ country, service, userId }, "Starting number delivery");

    const delivery = await deliverValidNumber(country, service);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const isPartner = product_type === "partner";
    const amount = isPartner ? 2500 : 2000;

    const { error: subError } = await supabase.from("subscriptions").insert({
      user_id: userId,
      number: delivery.number,
      country: delivery.country,
      service,
      smspool_order_id: delivery.orderId,
      fedapay_transaction_id: fedapay_transaction_id ?? null,
      status: "active",
      expires_at: expiresAt,
      attempts: delivery.attempts,
    });
    if (subError) {
      req.log.error({ subError }, "Failed to save subscription");
    }

    await supabase.from("transactions").insert({
      user_id: userId,
      type: "number_purchase",
      status: "validated",
      amount_fcfa: amount,
      description: `Numéro ${service} (${delivery.country}) — ${delivery.number}`,
      virtual_number: delivery.number,
      fedapay_transaction_id: fedapay_transaction_id ?? null,
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

    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Numéro livré !",
      message: `Votre numéro ${service} est prêt : ${delivery.number}`,
      type: "payment_success",
    });

    res.json({
      success: true,
      number: delivery.number,
      order_id: delivery.orderId,
      country: delivery.country,
      service,
      expires_at: expiresAt,
      attempts: delivery.attempts,
      security_tips: SECURITY_TIPS,
    });
  } catch (err: any) {
    req.log.error({ err: err.message }, "Number delivery failed");
    res.status(500).json({ error: err.message ?? "Erreur livraison numéro." });
  }
});

// POST /api/numbers/check-sms
// Body: { order_id, subscription_id }
// Lance la vérification SMS en background (180s) et met à jour la DB
router.post("/numbers/check-sms", async (req: Request, res: Response) => {
  const userId = await getAuthUser(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Non authentifié." }); return; }

  const { order_id, subscription_id } = req.body as { order_id: string; subscription_id: string };
  if (!order_id) { res.status(400).json({ error: "order_id requis." }); return; }

  res.json({ status: "polling_started", message: "Vérification SMS lancée (max 180s)." });

  (async () => {
    const smsResult = await waitForSMS(order_id, 180_000, 5_000);

    if (smsResult) {
      await supabase.from("subscriptions").update({
        last_sms_code: smsResult.code,
        last_sms_full: smsResult.fullSms,
        sms_received_at: new Date().toISOString(),
      }).eq("smspool_order_id", order_id);

      await supabase.from("notifications").insert({
        user_id: userId,
        title: "SMS reçu !",
        message: `Code de vérification : ${smsResult.code}`,
        type: "sms_received",
      });
    } else {
      // Timeout — auto-replace
      const validity = await validateNumberViaSMSPool(order_id);
      await cancelOrder(order_id);

      await supabase.from("subscriptions").update({
        status: "replaced",
        replaced_reason: validity === "banned" ? "banned" : "sms_timeout",
      }).eq("smspool_order_id", order_id);

      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Remplacement automatique",
        message: "Aucun SMS reçu — un nouveau numéro vous sera attribué gratuitement.",
        type: "number_replaced",
      });
    }
  })().catch((err) => {
    console.error("Background SMS check error:", err);
  });
});

// GET /api/numbers/subscriptions
router.get("/numbers/subscriptions", async (req: Request, res: Response) => {
  const userId = await getAuthUser(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Non authentifié." }); return; }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ subscriptions: data ?? [] });
});

export default router;
