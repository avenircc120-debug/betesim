import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN    = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TG_API       = "https://api.telegram.org";

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

async function sendTg(chatId: number, text: string) {
  try {
    await fetch(`${TG_API}/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (e: any) {
    console.error("TG send error:", e?.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const ct = req.headers.get("content-type") || "";

    let chatId: number;
    let wholesalerId: string;
    let name: string;
    let basePrice: number;
    let stock: number;
    let description: string | null = null;
    let imageUrl: string | null = null;

    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      chatId      = Number(fd.get("chatId"));
      wholesalerId = String(fd.get("wholesalerId") ?? "");
      name        = String(fd.get("name") ?? "").trim();
      basePrice   = parseFloat(String(fd.get("base_price") ?? "0").replace(/[^0-9.]/g, ""));
      stock       = parseInt(String(fd.get("stock") ?? "0").replace(/[^0-9]/g, ""), 10);
      description = fd.get("description") ? String(fd.get("description")).trim() || null : null;

      const img = fd.get("image") as File | null;
      if (img && img.size > 0) {
        const ext      = img.name.split(".").pop() || "jpg";
        const filename = `${wholesalerId}/${Date.now()}.${ext}`;
        const { data: up, error: upErr } = await supabase.storage
          .from("product-images")
          .upload(filename, img, { contentType: img.type });
        if (!upErr && up) {
          const { data: { publicUrl } } = supabase.storage
            .from("product-images")
            .getPublicUrl(filename);
          imageUrl = publicUrl;
        } else {
          console.error("Upload err:", upErr?.message);
        }
      }
    } else {
      const b      = await req.json();
      chatId       = Number(b.chatId);
      wholesalerId = String(b.wholesalerId ?? "");
      name         = String(b.name ?? "").trim();
      basePrice    = parseFloat(String(b.base_price ?? "0").replace(/[^0-9.]/g, ""));
      stock        = parseInt(String(b.stock ?? "0").replace(/[^0-9]/g, ""), 10);
      description  = b.description ? String(b.description).trim() || null : null;
    }

    // Validation
    if (!chatId || !wholesalerId)
      return ok({ success: false, error: "chatId et wholesalerId requis" }, 400);
    if (!name)
      return ok({ success: false, error: "Le nom du produit est requis" }, 400);
    if (isNaN(basePrice) || basePrice <= 0)
      return ok({ success: false, error: "Prix invalide (doit être > 0)" }, 400);
    if (isNaN(stock) || stock < 0)
      return ok({ success: false, error: "Stock invalide" }, 400);

    // Vérifier que le grossiste correspond bien au chatId
    const { data: wholesaler } = await supabase
      .from("lv_wholesalers")
      .select("id, shop_name, full_name")
      .eq("id", wholesalerId)
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (!wholesaler)
      return ok({ success: false, error: "Non autorisé : grossiste introuvable" }, 403);

    // Insérer le produit (avec fallback si colonnes optionnelles absentes)
    const baseInsert: Record<string, unknown> = {
      wholesaler_id: wholesalerId,
      name,
      base_price: basePrice,
      stock,
      is_active: true,
    };
    if (description) baseInsert.description = description;
    if (imageUrl)    baseInsert.image_url    = imageUrl;

    let product: Record<string, unknown> | null = null;

    const { data: p1, error: e1 } = await supabase
      .from("lv_products")
      .insert(baseInsert)
      .select("id, name, base_price, stock")
      .single();

    if (e1) {
      // Fallback : sans colonnes optionnelles
      console.warn("Insert with optional fields failed, retrying:", e1.message);
      const { data: p2, error: e2 } = await supabase
        .from("lv_products")
        .insert({ wholesaler_id: wholesalerId, name, base_price: basePrice, stock, is_active: true })
        .select("id, name, base_price, stock")
        .single();
      if (e2) {
        console.error("Insert fatal:", e2.message);
        return ok({ success: false, error: "Erreur lors de l'ajout du produit" }, 500);
      }
      product = p2;
    } else {
      product = p1;
    }

    // Notification Telegram
    await sendTg(chatId, [
      `✅ <b>Produit ajouté avec succès !</b>`,
      ``,
      `📦 <b>${name}</b>`,
      `💰 Prix de base : <b>${basePrice.toLocaleString("fr-FR")} FCFA</b>`,
      `🏷️ Stock initial : <b>${stock}</b>`,
      imageUrl ? `🖼️ Photo : ajoutée` : "",
      ``,
      `Ton produit est maintenant visible dans ton catalogue.`,
    ].filter(Boolean).join("\n"));

    return ok({ success: true, product });
  } catch (e: any) {
    console.error("add-product-web fatal:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" }, 500);
  }
});
