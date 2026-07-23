import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getSupabase,
  json,
  readRawBody,
  statusFromChap,
  verifyChapSignature,
  config,
} from "./_shared.js";

export { config };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return json(res, 405, { error: "Méthode non autorisée" });
  const rawBody = await readRawBody(req);
  if (!verifyChapSignature(rawBody, req.headers["x-chap-signature"])) {
    return json(res, 401, { error: "Signature invalide" });
  }

  try {
    const payload = JSON.parse(rawBody.toString("utf8"));
    const transactionId = String(
      payload?.fedapayId ?? payload?.transaction?.id ?? "",
    );
    if (!transactionId)
      return json(res, 400, { error: "Transaction introuvable" });
    const status = statusFromChap(payload);
    const supabase = getSupabase();
    const { data: order, error } = await supabase
      .from("coin_orders")
      .select("id,amount_fcfa,chap_transaction_id,status")
      .eq("chap_transaction_id", transactionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return json(res, 200, { received: true });

    const transactionAmount = Number(
      payload?.transaction?.amount ?? payload?.amount ?? 0,
    );
    if (transactionAmount !== order.amount_fcfa) {
      await supabase
        .from("coin_orders")
        .update({
          status: "failed",
          failure_reason: "Montant du paiement différent du pack",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending");
      return json(res, 400, { error: "Montant incorrect" });
    }

    if (status === "approved" && order.status === "pending") {
      const { error: creditError } = await supabase.rpc("credit_coin_order", {
        p_order_id: order.id,
        p_chap_transaction_id: transactionId,
        p_amount_fcfa: order.amount_fcfa,
      });
      if (creditError) throw new Error(creditError.message);
    } else if (status === "failed" && order.status === "pending") {
      await supabase
        .from("coin_orders")
        .update({
          status: "failed",
          failure_reason: String(
            payload?.status ?? payload?.event ?? "Paiement refusé",
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending");
    }
    return json(res, 200, { received: true });
  } catch (error: any) {
    return json(res, 500, { error: error?.message ?? "Erreur webhook" });
  }
}
