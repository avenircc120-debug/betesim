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

    const url    = new URL(req.url);
    const chatId = url.searchParams.get("chatId");
    const prodId = url.searchParams.get("product_id"); // charger commentaires d'un produit précis

    // ── Commentaires d'un produit ────────────────────────────────────────────
    if (prodId) {
      const { data: comments } = await sb
        .from("lv_product_comments")
        .select("id,buyer_name,content,created_at")
        .eq("reseller_product_id", prodId)
        .order("created_at", { ascending: true })
        .limit(30);
      return ok({ comments: comments ?? [] });
    }

    // ── Liste des produits ───────────────────────────────────────────────────
    const { data: items } = await sb
      .from("lv_reseller_products")
      .select(`
        id, retail_price, created_at,
        product:product_id(id, name, description, image_url, stock),
        reseller:reseller_id(id, full_name, shop_name)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(30);

    // Compter les commentaires par produit
    const rpIds = (items ?? []).map((i: any) => i.id);
    let commentCounts: Record<string, number> = {};
    if (rpIds.length > 0) {
      const { data: counts } = await sb
        .from("lv_product_comments")
        .select("reseller_product_id")
        .in("reseller_product_id", rpIds);
      for (const c of counts ?? []) {
        commentCounts[c.reseller_product_id] = (commentCounts[c.reseller_product_id] || 0) + 1;
      }
    }

    // Panier de l'acheteur
    let cartCount = 0;
    if (chatId) {
      const { count } = await sb
        .from("lv_carts")
        .select("id", { count: "exact", head: true })
        .eq("buyer_chat_id", Number(chatId));
      cartCount = count ?? 0;
    }

    const products = (items ?? []).map((rp: any) => ({
      id: rp.id,
      retail_price: rp.retail_price,
      created_at: rp.created_at,
      name: rp.product?.name ?? "Produit",
      description: rp.product?.description ?? null,
      image_url: rp.product?.image_url ?? null,
      stock: rp.product?.stock ?? 0,
      reseller_name: rp.reseller?.shop_name || rp.reseller?.full_name || "Boutique",
      comment_count: commentCounts[rp.id] ?? 0,
    }));

    return ok({ products, cart_count: cartCount });
  } catch (e: any) {
    console.error("vitrine-data:", e?.message);
    return ok({ error: e?.message }, 500);
  }
});
