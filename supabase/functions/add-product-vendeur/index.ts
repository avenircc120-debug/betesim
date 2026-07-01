/**
 * Edge Function: add-product-vendeur
 * ─────────────────────────────────────────────────────────────────────────────
 * Flux VENDEUR SIMPLE — totalement isolé du système Grossiste / Revendeur.
 * - Vérifie l'identité via lv_vendors (JAMAIS lv_wholesalers)
 * - Insère dans lv_vendor_own_products (JAMAIS lv_products)
 * - Envoie une notification Telegram au vendeur
 * - Supporte multipart/form-data (avec photo) et JSON
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
    let vendorId: string;
    let name: string;
    let price: number;
    let stock: number;
    let description: string | null = null;
    let photoUrl: string | null    = null;

    // ── Parse request ──────────────────────────────────────────────────────
    if (ct.includes("multipart/form-data")) {
      const fd   = await req.formData();
      chatId     = Number(fd.get("chatId"));
      vendorId   = String(fd.get("vendorId") ?? "").trim();
      name       = String(fd.get("name") ?? "").trim();
      price      = parseFloat(String(fd.get("price") ?? "0").replace(/[^0-9.]/g, ""));
      stock      = parseInt(String(fd.get("stock") ?? "0").replace(/[^0-9]/g, ""), 10);
      description = fd.get("description") ? String(fd.get("description")).trim() || null : null;

      const img = fd.get("photo") as File | null;
      if (img && img.size > 0) {
        const ext      = img.name.split(".").pop() || "jpg";
        const filename = `vendeur/${vendorId}/${Date.now()}.${ext}`;
        const { data: up, error: upErr } = await supabase.storage
          .from("product-images")
          .upload(filename, img, { contentType: img.type, upsert: false });
        if (!upErr && up) {
          const { data: { publicUrl } } = supabase.storage
            .from("product-images")
            .getPublicUrl(filename);
          photoUrl = publicUrl;
        } else {
          console.error("Photo upload error:", upErr?.message);
        }
      }
    } else {
      const b    = await req.json();
      chatId     = Number(b.chatId);
      vendorId   = String(b.vendorId ?? "").trim();
      name       = String(b.name ?? "").trim();
      price      = parseFloat(String(b.price ?? "0").replace(/[^0-9.]/g, ""));
      stock      = parseInt(String(b.stock ?? "0").replace(/[^0-9]/g, ""), 10);
      description = b.description ? String(b.description).trim() || null : null;
    }

    // ── Validation de base ─────────────────────────────────────────────────
    if (!chatId || !vendorId)
      return ok({ success: false, error: "chatId et vendorId requis" }, 400);
    if (!name || name.length < 2)
      return ok({ success: false, error: "Nom du produit requis (2 caractères min.)" }, 400);
    if (isNaN(price) || price <= 0)
      return ok({ success: false, error: "Prix invalide (doit être > 0 FCFA)" }, 400);
    if (isNaN(stock) || stock < 0)
      return ok({ success: false, error: "Stock invalide (doit être ≥ 0)" }, 400);

    // ── RBAC : vérifier que ce vendorId appartient bien à ce chatId ────────
    // Utilise lv_vendors, JAMAIS lv_wholesalers (isolation stricte)
    const { data: vendor, error: vendorErr } = await supabase
      .from("lv_vendors")
      .select("id, full_name")
      .eq("id", vendorId)
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (vendorErr) console.error("Vendor lookup error:", vendorErr.message);
    if (!vendor)
      return ok({ success: false, error: "Non autorisé : profil Vendeur introuvable" }, 403);

    // ── Insertion dans lv_vendor_own_products ──────────────────────────────
    // JAMAIS dans lv_products (table Grossiste)
    const { data: product, error: insertErr } = await supabase
      .from("lv_vendor_own_products")
      .insert({
        vendor_id:   vendorId,
        name,
        price,
        stock,
        description,
        photo_url: photoUrl,
        is_active: true,
      })
      .select("id, name, price, stock")
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr.message);
      return ok({ success: false, error: "Erreur lors de l'enregistrement du produit" }, 500);
    }

    // ── Notification Telegram ──────────────────────────────────────────────
    await sendTg(chatId, [
      `✅ <b>Produit ajouté avec succès !</b>`,
      ``,
      `📦 <b>${name}</b>`,
      `💰 Prix de vente : <b>${price.toLocaleString("fr-FR")} FCFA</b>`,
      `🏷️ Stock initial : <b>${stock}</b>`,
      description ? `📝 Description : ${description.slice(0, 80)}${description.length > 80 ? "…" : ""}` : "",
      photoUrl ? `🖼️ Photo enregistrée` : "",
      ``,
      `<i>Ton produit est maintenant dans ton stock personnel.
Aucun grossiste ni revendeur n'y a accès.</i>`,
    ].filter(Boolean).join("\n"));

    return ok({ success: true, product });

  } catch (e: any) {
    console.error("add-product-vendeur fatal:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" }, 500);
  }
});
