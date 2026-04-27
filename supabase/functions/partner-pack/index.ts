/**
 * Edge Function: partner-pack
 *
 * Gère le flow Pack Partenaire simplifié + l'admin dashboard.
 *
 * Actions (champ `action` dans le body) :
 *   - "init"            : crée la ligne partner_pack après paiement FedaPay confirmé
 *   - "deliver"         : alloue le numéro Telegram via SMSPool et finalise le pack
 *   - "settings-get"    : retourne la valeur publique de partner_link
 *   - "admin-check"     : vérifie si l'email courant est admin
 *   - "admin-list"      : (admin) liste les partner_packs
 *   - "admin-set-link"  : (admin) met à jour partner_link
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMSPOOL_BASE = "https://api.smspool.net";
const TELEGRAM_SERVICE_NAME = "Telegram";
const MAX_ATTEMPTS = 5;

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function smspoolPost(endpoint: string, body: Record<string, string>, apiKey: string) {
  const params = new URLSearchParams({ key: apiKey, ...body });
  const res = await fetch(`${SMSPOOL_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`SMSPool ${res.status}: ${await res.text()}`);
  return res.json();
}

async function orderTelegram(apiKey: string, country = "0") {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const data = await smspoolPost("/purchase/sms/", { country, service: TELEGRAM_SERVICE_NAME }, apiKey);
      if (!data.success || !data.number) throw new Error(data.message ?? "Aucun numéro disponible");
      const check = await smspoolPost("/sms/check/", { order_id: String(data.order_id) }, apiKey);
      if (check.status === 6 || check.status === 3) {
        await smspoolPost("/request/cancel/", { order_id: String(data.order_id) }, apiKey).catch(() => {});
        continue;
      }
      return { orderId: String(data.order_id), number: String(data.number), country: String(data.country ?? country) };
    } catch (e) {
      if (attempt >= MAX_ATTEMPTS) throw e;
      await delay(2500);
    }
  }
  throw new Error(`Aucun numéro Telegram disponible après ${MAX_ATTEMPTS} tentatives.`);
}

async function isAdmin(supabase: any, userId: string | null, email: string | null): Promise<boolean> {
  const adminEnv = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase();
  if (email && adminEnv) {
    const list = adminEnv.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.includes(email.toLowerCase())) return true;
  }
  if (userId) {
    const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    if ((data as any)?.is_admin === true) return true;
  }
  return false;
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();

    // ─── Public : settings-get ───────────────────────────────────────────
    if (action === "settings-get") {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "partner_link").maybeSingle();
      return ok({ success: true, partner_link: (data as any)?.value ?? "" });
    }

    // ─── init : après paiement FedaPay confirmé ──────────────────────────
    if (action === "init") {
      const { user_id, fedapay_transaction_id } = body;
      if (!user_id) throw new Error("user_id requis");
      if (!fedapay_transaction_id) throw new Error("fedapay_transaction_id requis");

      const { data: existing } = await supabase
        .from("partner_packs")
        .select("*")
        .eq("fedapay_transaction_id", fedapay_transaction_id)
        .maybeSingle();
      if (existing) return ok({ success: true, pack: existing, already_existed: true });

      const { data: pack, error } = await supabase.from("partner_packs").insert({
        user_id,
        fedapay_transaction_id,
        amount_fcfa: 2500,
        status: "paid",
      }).select().single();
      if (error) throw new Error(error.message);

      await supabase.from("profiles").update({ is_partner: true }).eq("id", user_id);

      await supabase.from("transactions").insert({
        user_id,
        type: "partner_activation",
        status: "validated",
        amount_fcfa: 2500,
        description: "Pack Partenaire — paiement validé. Votre numéro Telegram est en cours de livraison.",
        fedapay_transaction_id,
      });

      await supabase.from("notifications").insert({
        user_id,
        title: "Pack Partenaire activé",
        message: "Votre paiement est confirmé. Votre numéro Telegram va être livré automatiquement.",
        type: "partner_activated",
      });

      return ok({ success: true, pack });
    }

    // ─── deliver : livraison directe du numéro Telegram ──────────────────
    if (action === "deliver") {
      const { user_id, pack_id, country } = body;
      if (!user_id || !pack_id) throw new Error("user_id et pack_id requis");

      const { data: pack } = await supabase
        .from("partner_packs").select("*").eq("id", pack_id).maybeSingle();
      if (!pack) throw new Error("Pack introuvable");
      if (pack.user_id !== user_id) throw new Error("Accès refusé");

      if (pack.status === "delivered" && pack.subscription_id) {
        const { data: sub } = await supabase.from("subscriptions").select("*").eq("id", pack.subscription_id).maybeSingle();
        return ok({ success: true, already_delivered: true, pack, subscription: sub });
      }

      const smspoolKey = Deno.env.get("SMSPOOL_API_KEY");
      if (!smspoolKey) throw new Error("SMSPOOL_API_KEY non configurée");

      const orderCountry = String(country ?? "0");
      const delivery = await orderTelegram(smspoolKey, orderCountry);

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: sub, error: subErr } = await supabase.from("subscriptions").insert({
        user_id,
        number: delivery.number,
        country: delivery.country,
        service: "telegram",
        smspool_order_id: delivery.orderId,
        status: "active",
        expires_at: expiresAt,
        attempts: 1,
      }).select().single();
      if (subErr) console.error("subscriptions insert:", subErr);

      const { data: updatedPack } = await supabase
        .from("partner_packs")
        .update({
          status: "delivered",
          subscription_id: sub?.id ?? null,
          telegram_number: delivery.number,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", pack_id).select().single();

      await supabase.from("transactions").insert({
        user_id,
        type: "number_purchase",
        status: "validated",
        amount_fcfa: 0,
        description: `Pack Partenaire — numéro Telegram livré (${delivery.country})`,
        virtual_number: delivery.number,
      });

      await supabase.from("notifications").insert({
        user_id,
        title: "Numéro Telegram livré",
        message: `Votre numéro Telegram est prêt : ${delivery.number}. Le code de connexion arrivera par SMS sur ce numéro.`,
        type: "payment_success",
      });

      return ok({ success: true, pack: updatedPack, subscription: sub });
    }

    // ─── Admin ───────────────────────────────────────────────────────────
    if (action === "admin-check") {
      const { user_id, email } = body;
      const admin = await isAdmin(supabase, user_id ?? null, email ?? null);
      return ok({ success: true, is_admin: admin });
    }

    if (action === "admin-list") {
      const { user_id, email, limit = 100, offset = 0, search } = body;
      if (!(await isAdmin(supabase, user_id ?? null, email ?? null))) {
        return ok({ success: false, error: "Accès refusé" }, 403);
      }
      let q = supabase
        .from("partner_packs")
        .select("*, profiles:user_id(email, username, phone_number)", { count: "exact" })
        .order("created_at", { ascending: false });
      if (search && String(search).trim()) {
        const s = `%${String(search).trim()}%`;
        q = q.or(`telegram_number.ilike.${s}`);
      }
      const { data, error, count } = await q.range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return ok({ success: true, packs: data, total: count ?? 0 });
    }

    if (action === "admin-set-link") {
      const { user_id, email, partner_link } = body;
      if (!(await isAdmin(supabase, user_id ?? null, email ?? null))) {
        return ok({ success: false, error: "Accès refusé" }, 403);
      }
      const value = String(partner_link ?? "").trim();
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "partner_link", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw new Error(error.message);
      return ok({ success: true, partner_link: value });
    }

    throw new Error(`Action inconnue: ${action}`);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("partner-pack error:", msg, err?.stack);
    return ok({ success: false, error: msg }, 200);
  }
});
