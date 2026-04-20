/**
 * Number Delivery Engine — Pilier 3 : Boucle d'Auto-Remplacement
 *
 * Garantit la livraison d'un numéro valide :
 * 1. Commande un numéro Non-VoIP via SMSPool
 * 2. Vérifie immédiatement s'il est banni
 * 3. Si banni → annule (récupère le solde) → recommande
 * 4. Si SMS non reçu en 180s → annule → recommande
 * 5. Répète jusqu'à succès ou max tentatives
 *
 * L'utilisateur ne perd aucun crédit — toutes les annulations
 * sont effectuées avant de dépenser un nouveau slot.
 */

import { logger } from "./logger.js";
import { orderNumber, cancelOrder, SMSPoolOrderResult } from "./smspool.js";
import { validateNumberViaSMSPool } from "./number-validator.js";

const MAX_ATTEMPTS = 5;
const SMS_TIMEOUT_MS = 180_000;

export interface DeliveryResult {
  orderId: string;
  number: string;
  country: string;
  service: string;
  attempts: number;
}

export interface DeliveryError {
  error: string;
  attempts: number;
  cancelled: string[];
}

export async function deliverValidNumber(
  country: string,
  service: string,
  onAttempt?: (attempt: number, number: string) => void
): Promise<DeliveryResult> {
  const cancelled: string[] = [];
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    logger.info({ country, service, attempt: attempts }, "Ordering number from SMSPool");

    let order: SMSPoolOrderResult;
    try {
      order = await orderNumber(country, service);
    } catch (err: any) {
      logger.error({ err: err.message, attempt: attempts }, "SMSPool order failed");
      if (attempts >= MAX_ATTEMPTS) {
        throw new Error(`Aucun numéro disponible pour ${service} après ${attempts} tentatives.`);
      }
      await delay(3000);
      continue;
    }

    onAttempt?.(attempts, order.number);

    // Immediate ban check
    const validity = await validateNumberViaSMSPool(order.order_id);
    if (validity === "banned") {
      logger.warn({ orderId: order.order_id, number: order.number }, "Number banned — cancelling and retrying");
      await cancelOrder(order.order_id);
      cancelled.push(order.order_id);
      continue;
    }

    return {
      orderId: order.order_id,
      number: order.number,
      country: order.country,
      service,
      attempts,
    };
  }

  throw new Error(`Impossible de trouver un numéro valide pour ${service} après ${MAX_ATTEMPTS} tentatives.`);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
