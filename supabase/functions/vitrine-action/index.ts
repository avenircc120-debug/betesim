import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action, chatId, product_id, buyer_name, content } = body;

    // ── Ajouter au panier ────────────────────────────────────────────────────
    if (action === "add_cart") {
      if (!chatId || !product_id) return ok({ success: false, error: "chatId et product_id requis" }, 400);

      // Vérifier que le produit existe et est en stock
      const { data: rp } = await sb
        .from("lv_reseller_products")
        .select("id, product:product_id(stock)")
        .eq("id", product_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!rp) return ok({ success: false, error: "Produit introuvable ou indisponible" }, 404);
      if ((rp.product as any)?.stock <= 0) return ok({ success: false, error: "Produit en rupture de stock" }, 400);

      await sb.from("lv_carts").upsert(
        { buyer_chat_id: Number(chatId), reseller_product_id: product_id, quantity: 1 },
        { onConflict: "buyer_chat_id,reseller_product_id" },
      );

      const { count } = await sb
        .from("lv_carts")
        .select("id", { count: "exact", head: true })
        .eq("buyer_chat_id", Number(chatId));

      return ok({ success: true, cart_count: count ?? 1 });
    }

    // ── Supprimer du panier ──────────────────────────────────────────────────
    if (action === "remove_cart") {
      if (!chatId || !product_id) return ok({ success: false, error: "Paramètres manquants" }, 400);

      await sb.from("lv_carts")
        .delete()
        .eq("buyer_chat_id", Number(chatId))
        .eq("reseller_product_id", product_id);

      const { count } = await sb
        .from("lv_carts")
        .select("id", { count: "exact", head: true })
        .eq("buyer_chat_id", Number(chatId));

      return ok({ success: true, cart_count: count ?? 0 });
    }

    // ── Ajouter un commentaire ───────────────────────────────────────────────
    if (action === "comment") {
      if (!product_id || !content?.trim()) return ok({ success: false, error: "Produit et commentaire requis" }, 400);

      const name = (buyer_name || "Anonyme").trim().slice(0, 50);
      const text = content.trim().slice(0, 500);

      const { data: comment, error: err } = await sb
        .from("lv_product_comments")
        .insert({
          reseller_product_id: product_id,
          buyer_chat_id: chatId ? Number(chatId) : null,
          buyer_name: name,
          content: text,
        })
        .select("id, buyer_name, content, created_at")
        .single();

      if (err) {
        console.error("Comment insert:", err.message);
        return ok({ success: false, error: "Erreur lors de l'ajout du commentaire" }, 500);
      }

      return ok({ success: true, comment });
    }

    return ok({ success: false, error: "Action inconnue" }, 400);
  } catch (e: any) {
    console.error("vitrine-action:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" }, 500);
  }
});
