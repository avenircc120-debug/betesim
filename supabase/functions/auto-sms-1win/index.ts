/**
 * Edge Function: auto-sms-1win
 *
 * Accès STRICTEMENT réservé à jeremyhounmetin@gmail.com
 *
 * Actions :
 *   - "get-number"  : commander un numéro SMSPool pour 1win
 *   - "check-sms"   : vérifier l'arrivée du SMS et extraire le code 1win
 *   - "cancel"      : annuler une commande en cours
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMSPOOL_BASE = "https://api.smspool.net";
const OWNER_EMAIL = "jeremyhounmetin@gmail.com";

// Noms de service SMSPool possibles pour 1win
const WIN1_SERVICE_NAMES = ["1win", "1Win", "1WIN"];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function smspoolGet(endpoint: string, apiKey: string) {
  const res = await fetch(`${SMSPOOL_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`SMSPool GET ${res.status}`);
  return res.json();
}

// Extraire le code de validation 1win depuis le texte du SMS
function extract1winCode(smsText: string): string | null {
  if (!smsText) return null;
  // Patterns courants pour les codes 1win
  const patterns = [
    /\b(\d{4,8})\b/g,           // Code numérique 4-8 chiffres
    /code[:\s]+(\d{4,8})/i,     // "code: 12345"
    /verification[:\s]+(\d{4,8})/i,
    /confirm[:\s]+(\d{4,8})/i,
  ];
  for (const pattern of patterns) {
    const match = smsText.match(pattern);
    if (match) {
      // Retourner le premier code trouvé
      const numMatch = match[0].match(/\d{4,8}/);
      if (numMatch) return numMatch[0];
    }
  }
  return null;
}

async function orderNumber(apiKey: string, country = "0"): Promise<{ orderId: string; number: string; country: string }> {
  let lastError = "";
  for (const service of WIN1_SERVICE_NAMES) {
    try {
      const data = await smspoolPost("/purchase/sms/", { country, service }, apiKey);
      if (data.success && data.number) {
        // Vérification anti-ban immédiate
        const check = await smspoolPost("/sms/check/", { order_id: String(data.order_id) }, apiKey);
        if (check.status === 6 || check.status === 3) {
          await smspoolPost("/request/cancel/", { order_id: String(data.order_id) }, apiKey).catch(() => {});
          lastError = "Numéro banni détecté, annulé automatiquement";
          continue;
        }
        return {
          orderId: String(data.order_id),
          number: String(data.number),
          country: String(data.country ?? country),
        };
      }
      lastError = data.message ?? "Aucun numéro disponible";
    } catch (e: any) {
      lastError = e.message;
    }
    await delay(1000);
  }
  throw new Error(`Impossible d'obtenir un numéro 1win: ${lastError}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smspoolKey = Deno.env.get("SMSPOOL_API_KEY");

    if (!smspoolKey) throw new Error("SMSPOOL_API_KEY non configurée");

    // Vérification JWT — récupérer l'email de l'utilisateur connecté
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── VÉRIFICATION ACCÈS PROPRIÉTAIRE ──────────────────────────────────
    const userEmail = (user.email ?? "").toLowerCase().trim();
    if (userEmail !== OWNER_EMAIL.toLowerCase()) {
      return new Response(
        JSON.stringify({ success: false, error: "Accès refusé — fonctionnalité réservée au propriétaire" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, order_id, country } = body;

    // ── ACTION: get-number ───────────────────────────────────────────────
    if (action === "get-number") {
      const orderCountry = country || "0";
      const order = await orderNumber(smspoolKey, orderCountry);
      return new Response(
        JSON.stringify({
          success: true,
          order_id: order.orderId,
          number: order.number,
          country: order.country,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: check-sms ────────────────────────────────────────────────
    if (action === "check-sms") {
      if (!order_id) throw new Error("order_id requis");
      const check = await smspoolPost("/sms/check/", { order_id: String(order_id) }, smspoolKey);

      // Status SMSPool: 1=en attente, 2=reçu, 3=expiré, 6=banni
      const smsText = check.sms ?? check.full_sms ?? check.code ?? "";
      const code = smsText ? extract1winCode(String(smsText)) : null;

      return new Response(
        JSON.stringify({
          success: true,
          status: check.status,
          sms_received: check.status === 2,
          sms_text: smsText,
          code_1win: code,
          raw: check,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: cancel ───────────────────────────────────────────────────
    if (action === "cancel") {
      if (!order_id) throw new Error("order_id requis");
      const result = await smspoolPost("/request/cancel/", { order_id: String(order_id) }, smspoolKey);
      return new Response(
        JSON.stringify({ success: true, cancelled: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Action inconnue: ${action}`);

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
