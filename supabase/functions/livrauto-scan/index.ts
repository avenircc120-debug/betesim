/**
 * Edge Function: livrauto-scan
 * QR Code scan endpoint — libère les fonds du séquestre
 * Flux : Livreur présente QR → Client scanne → fonds libérés → wallets crédités
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";

async function tgNotify(chatId: number, text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token || !chatId) return;
  try {
    await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(6000),
    });
  } catch { /* non-blocking */ }
}

const SCAN_HTML = (ok: boolean, msg: string) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ok ? "✅ Livraison Confirmée" : "❌ Erreur"} — Livrauto</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: ${ok ? "#f0fdf4" : "#fef2f2"}; }
    .card { background: white; border-radius: 16px; padding: 40px 32px; max-width: 400px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,.1); }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 700; color: ${ok ? "#16a34a" : "#dc2626"}; margin: 0 0 12px; }
    p { color: #64748b; font-size: 16px; line-height: 1.5; margin: 0; }
    .badge { display: inline-block; background: ${ok ? "#dcfce7" : "#fee2e2"}; color: ${ok ? "#15803d" : "#b91c1c"}; padding: 8px 20px; border-radius: 999px; font-weight: 600; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? "✅" : "❌"}</div>
    <h1>${ok ? "Livraison confirmée !" : "Scan invalide"}</h1>
    <p>${msg}</p>
    <div class="badge">Livrauto</div>
  </div>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const url   = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(SCAN_HTML(false, "Lien de livraison invalide ou expiré."), {
      headers: { "Content-Type": "text/html; charset=utf-8" }, status: 400,
    });
  }

  // ── Trouver la commande par QR token ─────────────────────────────────────
  const { data: order } = await sb
    .from("lv_orders")
    .select("*")
    .eq("qr_token", token)
    .maybeSingle();

  if (!order) {
    return new Response(SCAN_HTML(false, "Ce QR code est invalide ou n'existe pas."), {
      headers: { "Content-Type": "text/html; charset=utf-8" }, status: 404,
    });
  }

  if (order.status === "completed") {
    return new Response(SCAN_HTML(true, "Cette livraison a déjà été validée. Fonds libérés."), {
      headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200,
    });
  }

  if (order.status !== "pending_delivery") {
    return new Response(SCAN_HTML(false, `Commande au statut inattendu : ${order.status}. Contacte le support.`), {
      headers: { "Content-Type": "text/html; charset=utf-8" }, status: 400,
    });
  }

  // ── Libérer les fonds (séquestre → completed) ─────────────────────────────
  await sb.from("lv_orders").update({
    status:            "completed",
    qr_scanned_at:     new Date().toISOString(),
    funds_released_at: new Date().toISOString(),
  }).eq("id", order.id);

  const resellerGain = Number(order.reseller_gain || 0);
  const platformFee  = Number(order.platform_fee  || 0);
  const total        = Number(order.total_amount  || 0);

  // ── Créditer le wallet du revendeur ──────────────────────────────────────
  if (order.reseller_id && resellerGain > 0) {
    const { data: reseller } = await sb
      .from("lv_resellers")
      .select("id, lv_wallet_balance, telegram_chat_id")
      .eq("id", order.reseller_id)
      .maybeSingle();
    if (reseller) {
      const newBal = Number(reseller.lv_wallet_balance || 0) + resellerGain;
      await sb.from("lv_resellers").update({ lv_wallet_balance: newBal }).eq("id", order.reseller_id);
      if (reseller.telegram_chat_id) {
        await tgNotify(Number(reseller.telegram_chat_id), [
          `💰 <b>Fonds libérés !</b>`,
          ``,
          `+<b>${resellerGain.toLocaleString("fr-FR")} FCFA</b> crédité sur ton wallet.`,
          `👛 Nouveau solde : <b>${newBal.toLocaleString("fr-FR")} FCFA</b>`,
          `📦 Commande #${order.id.slice(0, 8)} — Scan QR confirmé.`,
        ].join("\n"));
      }
    }
  }

  // ── Créditer le livreur ───────────────────────────────────────────────────
  const { data: delivery } = await sb
    .from("lv_deliveries")
    .select("*")
    .eq("order_id", order.id)
    .maybeSingle();

  if (delivery?.delivery_person_id) {
    const { data: courier } = await sb
      .from("lv_delivery_persons")
      .select("id, lv_wallet_balance, telegram_chat_id")
      .eq("id", delivery.delivery_person_id)
      .maybeSingle();
    if (courier) {
      const gain   = Number(delivery.amount_fcfa || 1000);
      const newBal = Number(courier.lv_wallet_balance || 0) + gain;
      await sb.from("lv_delivery_persons").update({ lv_wallet_balance: newBal }).eq("id", courier.id);
      await sb.from("lv_deliveries").update({
        status:       "delivered",
        delivered_at: new Date().toISOString(),
      }).eq("id", delivery.id);
      if (courier.telegram_chat_id) {
        await tgNotify(Number(courier.telegram_chat_id), [
          `🎉 <b>Livraison validée par scan QR !</b>`,
          `+<b>${gain.toLocaleString("fr-FR")} FCFA</b> sur ton wallet.`,
          `👛 Solde : <b>${newBal.toLocaleString("fr-FR")} FCFA</b>`,
        ].join("\n"));
      }
    }
  }

  // ── Notifier l'acheteur ───────────────────────────────────────────────────
  if (order.buyer_chat_id) {
    await tgNotify(Number(order.buyer_chat_id), [
      `✅ <b>Livraison confirmée !</b>`,
      `📦 Commande <b>#${order.id.slice(0, 8)}</b> validée.`,
      `💰 ${total.toLocaleString("fr-FR")} FCFA payé.`,
    ].join("\n"));
  }

  // ── Enregistrer les transactions ──────────────────────────────────────────
  await sb.from("lv_transactions").insert([
    {
      order_id:    order.id,
      actor_type:  "platform",
      type:        "platform_fee",
      amount:      platformFee,
      description: `Commission 10% — #${order.id.slice(0, 8)}`,
    },
    {
      order_id:    order.id,
      actor_type:  "reseller",
      type:        "reseller_gain",
      amount:      resellerGain,
      description: `Gain revendeur — #${order.id.slice(0, 8)}`,
    },
  ]);

  return new Response(
    SCAN_HTML(true, `Commande #${order.id.slice(0, 8)} validée. ${resellerGain.toLocaleString("fr-FR")} FCFA libérés.`),
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 },
  );
});
