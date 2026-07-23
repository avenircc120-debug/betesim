import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import {
  COIN_PACKS,
  chapRequest,
  getSupabase,
  json,
  normalizeCountry,
  normalizeOperator,
  normalizePhone,
  requireUser,
} from "./_shared.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return json(res, 405, { error: "Méthode non autorisée" });

  try {
    const user = await requireUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const coins = Number(body.coins);
    const amount = COIN_PACKS[coins];
    if (!amount) return json(res, 400, { error: "Pack de coins invalide" });

    const country = normalizeCountry(body.country);
    const operator = normalizeOperator(body.operator);
    const phoneNumber = normalizePhone(body.phoneNumber);
    const supabase = getSupabase();
    const orderId = randomUUID();
    const description = `Betesim coins ${coins} - ${orderId}`;

    const { error: insertError } = await supabase.from("coin_orders").insert({
      id: orderId,
      user_id: user.id,
      pack_coins: coins,
      amount_fcfa: amount,
      operator,
      country,
      phone_number: phoneNumber,
      description,
    });
    if (insertError) throw new Error(insertError.message);

    const firstName = String(
      user.user_metadata?.first_name ??
        user.user_metadata?.full_name ??
        "Betesim",
    );
    const lastName = String(user.user_metadata?.last_name ?? "Client");
    const payment = await chapRequest("/api/checkout/mobile", {
      method: "POST",
      body: JSON.stringify({
        amount,
        description,
        customerEmail: user.email ?? "client@betesim.app",
        customerFirstname: firstName.slice(0, 80),
        customerLastname: lastName.slice(0, 80),
        phoneNumber,
        country,
        operator,
      }),
    });

    const transactionId = String(payment.transactionId ?? "");
    if (!transactionId)
      throw new Error("Identifiant de paiement Chap Money introuvable");
    const { error: updateError } = await supabase
      .from("coin_orders")
      .update({
        chap_transaction_id: transactionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("user_id", user.id);
    if (updateError) throw new Error(updateError.message);

    return json(res, 200, {
      orderId,
      transactionId,
      status: "pending",
      message: "Validez la demande de paiement sur votre téléphone.",
    });
  } catch (error: any) {
    const message =
      error?.message === "UNAUTHORIZED"
        ? "Non authentifié."
        : (error?.message ?? "Impossible de démarrer le paiement.");
    return json(res, message === "Non authentifié." ? 401 : 400, {
      error: message,
    });
  }
}
