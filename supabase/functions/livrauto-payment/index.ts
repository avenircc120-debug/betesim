/**
 * Edge Function: livrauto-payment
 * Webhook FedaPay dédié Livrauto — séparé des données Betesim
 * Déclenche la répartition des gains après paiement confirmé
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";
const PLATFORM_FEE_PCT = 0.10;

async function tgNotify(chatId: number, text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token || !chatId) return;
  try {
    await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* never crash for notification */ }
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (req.method === "GET") {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id");
    return new Response(JSON.stringify({ ok: true, webhook: "livrauto-payment", order_id: orderId }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id");

    // FedaPay envoie le payload dans le body
    const payload = await req.json().catch(() => ({})) as any;
    const status  = payload?.data?.status ?? payload?.status ?? "";
    const ref     = payload?.data?.reference ?? payload?.reference ?? orderId ?? "";

    // Accepter approved, successful, paid
    const isPaid = ["approved","successful","paid","completed"].includes(String(status).toLowerCase());
    if (!isPaid && !orderId) {
      return new Response(JSON.stringify({ ok: false, reason: "not_paid", status }), { status: 200 });
    }

    // Trouver la commande
    const { data: order } = await supabase.from("lv_orders")
      .select("*")
      .or(`id.eq.${orderId ?? ""},payment_ref.eq.${ref}`)
      .eq("status", "pending")
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ ok: false, reason: "order_not_found_or_already_processed" }), { status: 200 });
    }

    const total       = Number(order.total_amount || 0);
    const platformFee = Number(order.platform_fee || Math.round(total * PLATFORM_FEE_PCT));
    const resellerGain = Number(order.reseller_gain || 0);

    // ── 1. Marquer la commande payée ─────────────────────────────────────────
    await supabase.from("lv_orders").update({
      status: "paid", payment_ref: ref || orderId, paid_at: new Date().toISOString(),
    }).eq("id", order.id);

    // ── 2. Créditer le wallet du revendeur ───────────────────────────────────
    if (order.reseller_id && resellerGain > 0) {
      const { data: reseller } = await supabase.from("lv_resellers")
        .select("id, lv_wallet_balance, telegram_chat_id").eq("id", order.reseller_id).maybeSingle();
      if (reseller) {
        const newBal = Number(reseller.lv_wallet_balance || 0) + resellerGain;
        await supabase.from("lv_resellers").update({ lv_wallet_balance: newBal }).eq("id", order.reseller_id);

        // Notifier le revendeur
        if (reseller.telegram_chat_id) {
          await tgNotify(Number(reseller.telegram_chat_id), [
            `🎉 <b>Nouvelle vente !</b>`,
            ``,
            `💰 +<b>${resellerGain.toLocaleString("fr-FR")} FCFA</b> crédité sur ton wallet.`,
            `👛 Nouveau solde : <b>${newBal.toLocaleString("fr-FR")} FCFA</b>`,
            ``,
            `Commande #${order.id.slice(0,8)} confirmée.`,
          ].join("\n"));
        }
      }
    }

    // ── 3. Déclencher la livraison : notifier les livreurs disponibles ────────
    const { data: deliveryPersons } = await supabase.from("lv_delivery_persons")
      .select("id, telegram_chat_id, full_name").eq("is_available", true).limit(10);

    if (deliveryPersons && deliveryPersons.length > 0) {
      // Créer la mission de livraison
      const { data: delivery } = await supabase.from("lv_deliveries").insert({
        order_id:   order.id,
        buyer_name: order.buyer_name || "Client",
        buyer_phone: "", // sera complété si le flux le permet
        zone:       "", // sera indiqué par le revendeur
        amount_fcfa: 1000, // gain livreur fixe
        status:     "pending",
      }).select("id").single();

      if (delivery) {
        // Notification texte à chaque livreur disponible
        const notif = [
          `🚚 <b>Nouvelle mission de livraison disponible !</b>`,
          ``,
          `👤 Client : <b>${order.buyer_name || "Client"}</b>`,
          `💰 Gain : <b>1 000 FCFA</b>`,
          ``,
          `⚡ Première arrivée, première servie !`,
        ].join("\n");

        const keyboard = JSON.stringify({
          inline_keyboard: [[{
            text: "✅ Je prends cette livraison",
            callback_data: `lv_take_delivery:${delivery.id}`,
          }]],
        });

        for (const dp of deliveryPersons) {
          if (dp.telegram_chat_id) {
            const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
            if (token) {
              await fetch(`${TG_API}/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: dp.telegram_chat_id, text: notif,
                  parse_mode: "HTML", reply_markup: keyboard,
                }),
                signal: AbortSignal.timeout(5000),
              }).catch(() => {});
            }
          }
        }
      }
    }

    // ── 4. Notifier l'acheteur ────────────────────────────────────────────────
    if (order.buyer_chat_id) {
      await tgNotify(Number(order.buyer_chat_id), [
        `✅ <b>Paiement confirmé !</b>`,
        ``,
        `🛒 Commande <b>#${order.id.slice(0,8)}</b> en cours de traitement.`,
        `💰 Montant : <b>${total.toLocaleString("fr-FR")} FCFA</b>`,
        ``,
        `Un livreur sera assigné sous peu. Tu recevras une notification.`,
      ].join("\n"));
    }

    // ── 5. Enregistrer la transaction ─────────────────────────────────────────
    await supabase.from("lv_transactions").insert([
      {
        order_id: order.id, actor_type: "platform",
        actor_chat_id: null, type: "platform_fee",
        amount: platformFee, description: `Commission plateforme 10% — commande #${order.id.slice(0,8)}`,
      },
      {
        order_id: order.id, actor_type: "reseller",
        actor_chat_id: null, type: "reseller_gain",
        amount: resellerGain, description: `Gain revendeur — commande #${order.id.slice(0,8)}`,
      },
    ]);

    return new Response(JSON.stringify({ ok: true, processed: order.id }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[livrauto-payment] Error:", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), { status: 500 });
  }
});
