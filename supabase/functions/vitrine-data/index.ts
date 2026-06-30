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

    const url     = new URL(req.url);
    const chatId  = url.searchParams.get("chatId");
    const prodId  = url.searchParams.get("product_id"); // comments for one product
    const query   = url.searchParams.get("q")?.trim();   // search term

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

    // ══ Produits en deux sources ═════════════════════════════════════════════

    // SOURCE 1 — Publications des revendeurs (lv_reseller_products)
    const rpQuery = sb
      .from("lv_reseller_products")
      .select(`
        id, retail_price, created_at,
        product:product_id(id, name, description, image_url, stock),
        reseller:reseller_id(id, full_name, shop_name)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(query ? 5 : 25);

    // SOURCE 2 — Produits grossistes (lv_products) pas encore listés en revendeur
    const wpQuery = sb
      .from("lv_products")
      .select(`
        id, base_price, created_at,
        name, description, image_url, stock,
        wholesaler:wholesaler_id(id, full_name, shop_name)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(query ? 5 : 15);

    // Exécuter les deux requêtes en parallèle
    const [{ data: rpItems }, { data: wpItems }] = await Promise.all([rpQuery, wpQuery]);

    // ── Filtrage par mot-clé (si recherche) ──────────────────────────────────
    const normalize = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

    const matchesQuery = (name: string, desc: string | null) => {
      if (!query) return true;
      const q = normalize(query);
      const tokens = q.split(/\s+/).filter(t => t.length > 1);
      const haystack = normalize(`${name} ${desc ?? ""}`);
      return tokens.some(t => haystack.includes(t));
    };

    // ── Construire la liste unifiée ──────────────────────────────────────────
    // Garder les product_id déjà présents via revendeurs pour éviter doublons
    const seenProductIds = new Set<string>();
    const products: any[] = [];

    for (const rp of (rpItems ?? [])) {
      const p = rp.product as any;
      if (!p || !matchesQuery(p.name, p.description)) continue;
      seenProductIds.add(p.id);
      products.push({
        id:           rp.id,
        source:       "reseller",
        retail_price: Number(rp.retail_price),
        created_at:   rp.created_at,
        name:         p.name ?? "Produit",
        description:  p.description ?? null,
        image_url:    p.image_url ?? null,
        stock:        p.stock ?? 0,
        reseller_name: (rp.reseller as any)?.shop_name || (rp.reseller as any)?.full_name || "Boutique",
        comment_count: 0,
      });
    }

    for (const wp of (wpItems ?? [])) {
      if (seenProductIds.has(wp.id)) continue; // déjà listé par un revendeur
      if (!matchesQuery(wp.name, wp.description)) continue;
      products.push({
        id:           `wp_${wp.id}`, // préfixe pour différencier
        source:       "wholesaler",
        retail_price: Number(wp.base_price),
        created_at:   wp.created_at,
        name:         wp.name ?? "Produit",
        description:  wp.description ?? null,
        image_url:    wp.image_url ?? null,
        stock:        wp.stock ?? 0,
        reseller_name: (wp.wholesaler as any)?.shop_name || (wp.wholesaler as any)?.full_name || "Grossiste",
        comment_count: 0,
      });
    }

    // Trier par date décroissante
    products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // ── Comptage commentaires ────────────────────────────────────────────────
    const resellerIds = products.filter(p => p.source === "reseller").map(p => p.id);
    if (resellerIds.length > 0) {
      const { data: counts } = await sb
        .from("lv_product_comments")
        .select("reseller_product_id")
        .in("reseller_product_id", resellerIds);
      const map: Record<string, number> = {};
      for (const c of counts ?? []) {
        map[c.reseller_product_id] = (map[c.reseller_product_id] || 0) + 1;
      }
      for (const p of products) {
        if (map[p.id]) p.comment_count = map[p.id];
      }
    }

    // ── Taille du panier ─────────────────────────────────────────────────────
    let cartCount = 0;
    if (chatId) {
      const { count } = await sb
        .from("lv_carts")
        .select("id", { count: "exact", head: true })
        .eq("buyer_chat_id", Number(chatId));
      cartCount = count ?? 0;
    }

    return ok({ products, cart_count: cartCount, query: query ?? null });
  } catch (e: any) {
    console.error("vitrine-data:", e?.message);
    return ok({ error: e?.message }, 500);
  }
});
