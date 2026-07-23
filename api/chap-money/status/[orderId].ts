import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  chapRequest,
  getSupabase,
  json,
  requireUser,
  statusFromChap,
} from "../_shared.js";

async function settleApproved(
  orderId: string,
  transactionId: string,
  amount: number,
) {
  const { data, error } = await getSupabase().rpc("credit_coin_order", {
    p_order_id: orderId,
    p_chap_transaction_id: transactionId,
    p_amount_fcfa: amount,
  });
  if (error) throw new Error(error.message);
  return data?.[0] ?? data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET")
    return json(res, 405, { error: "Méthode non autorisée" });
  try {
    const user = await requireUser(req);
    const orderId = String(req.query.orderId ?? "");
    const supabase = getSupabase();
    const { data: order, error } = await supabase
      .from("coin_orders")
      .select("id,user_id,amount_fcfa,pack_coins,chap_transaction_id,status")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();
    if (error || !order)
      return json(res, 404, { error: "Commande introuvable" });

    if (order.status === "pending" && order.chap_transaction_id) {
      const payment = await chapRequest(
        `/api/checkout/status/${encodeURIComponent(order.chap_transaction_id)}`,
        {
          method: "GET",
        },
      );
      const chapStatus = statusFromChap(payment);
      if (chapStatus === "approved") {
        await settleApproved(
          order.id,
          order.chap_transaction_id,
          order.amount_fcfa,
        );
        order.status = "completed";
      } else if (chapStatus === "failed") {
        await supabase
          .from("coin_orders")
          .update({
            status: "failed",
            failure_reason: String(payment.status ?? "Paiement refusé"),
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)
          .eq("status", "pending");
        order.status = "failed";
      }
    }

    return json(res, 200, {
      orderId: order.id,
      transactionId: order.chap_transaction_id,
      status: order.status,
      coins: order.pack_coins,
    });
  } catch (error: any) {
    const message =
      error?.message === "UNAUTHORIZED"
        ? "Non authentifié."
        : (error?.message ?? "Impossible de consulter le paiement.");
    return json(res, message === "Non authentifié." ? 401 : 400, {
      error: message,
    });
  }
}
