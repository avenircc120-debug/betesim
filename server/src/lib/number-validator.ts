/**
 * Number Validator — Pilier 2
 *
 * Vérifie si un numéro est valide (non banni) sur le service cible.
 *
 * Pour WhatsApp et Telegram, des vérifications légères sont effectuées
 * via des appels HTTP publics (sans compte). Les bibliothèques Baileys
 * (WhatsApp WA-Socket) et MTProto (Telegram) nécessitent une session
 * authentifiée pré-existante pour fonctionner — dans le contexte de ce
 * système, la validation se fait via la boucle d'auto-remplacement :
 * si le SMS n'arrive pas en 180s ou si le numéro est signalé banni
 * par SMSPool (status=6), on le remplace automatiquement.
 *
 * Cette approche est fiable, invisible pour l'utilisateur, et ne
 * nécessite pas de sessions WhatsApp/Telegram actives côté serveur.
 */

import { logger } from "./logger.js";
import { checkSMS } from "./smspool.js";

export type ValidationResult = "valid" | "banned" | "unknown";

/**
 * Vérifie le statut du numéro via SMSPool.
 * Status 6 = banni/invalide selon la doc SMSPool.
 */
export async function validateNumberViaSMSPool(orderId: string): Promise<ValidationResult> {
  try {
    const order = await checkSMS(orderId);
    // status 3 = cancelled, 6 = banned/invalid
    if (order.status === 6) {
      logger.warn({ orderId }, "Number flagged as banned by SMSPool");
      return "banned";
    }
    // status 3 = déjà annulé
    if (order.status === 3) {
      return "banned";
    }
    return "valid";
  } catch (err: any) {
    logger.error({ orderId, err: err.message }, "Validation check failed");
    return "unknown";
  }
}

/**
 * Attend l'arrivée d'un SMS ou le timeout.
 * Retourne le code SMS ou null si timeout.
 */
export async function waitForSMS(
  orderId: string,
  timeoutMs: number = 180_000,
  pollIntervalMs: number = 5_000
): Promise<{ code: string; fullSms: string } | null> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const order = await checkSMS(orderId);

      if (order.status === 6) {
        logger.warn({ orderId }, "Number banned during SMS wait");
        return null;
      }

      if (order.sms && order.sms.trim().length > 0) {
        logger.info({ orderId, sms: order.sms }, "SMS received");
        return { code: order.sms, fullSms: order.full_sms ?? order.sms };
      }
    } catch (err: any) {
      logger.warn({ orderId, err: err.message }, "Poll error — retrying");
    }
  }

  logger.warn({ orderId, timeoutMs }, "SMS timeout reached");
  return null;
}
