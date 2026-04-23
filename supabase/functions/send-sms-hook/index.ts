/**
 * Supabase SMS Hook — envoi d'OTP pour la connexion par téléphone
 * Remplace le reCAPTCHA Firebase par un flux OTP Supabase sans friction
 *
 * Configurer dans Supabase Management API:
 *   hook_send_sms_enabled: true
 *   hook_send_sms_uri: https://<project>.functions.supabase.co/send-sms-hook
 *   hook_send_sms_secrets: <hook_secret>
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendViaNexmo(phone: string, message: string): Promise<void> {
  const apiKey = Deno.env.get("VONAGE_API_KEY");
  const apiSecret = Deno.env.get("VONAGE_API_SECRET");

  if (!apiKey || !apiSecret) {
    // Fallback: log to console (visible in Supabase function logs)
    console.log(`[SMS TEST MODE] → ${phone}: ${message}`);
    return;
  }

  const res = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      api_secret: apiSecret,
      from: "betesim",
      to: phone.replace("+", ""),
      text: message,
    }),
  });

  const data = await res.json();
  const msgStatus = data?.messages?.[0]?.status;
  if (msgStatus !== "0") {
    const errText = data?.messages?.[0]?.["error-text"] ?? "Erreur inconnue";
    throw new Error(`SMS Vonage échoué (status ${msgStatus}): ${errText}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    // Supabase sends: { user: { phone }, sms: { otp } }
    const phone: string = payload?.user?.phone ?? "";
    const otp: string = payload?.sms?.otp ?? "";

    if (!phone || !otp) {
      console.error("send-sms-hook: phone or otp missing", payload);
      return new Response(JSON.stringify({ error: "phone and otp required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = `Votre code betesim : ${otp}. Valide 10 minutes. Ne partagez jamais ce code.`;
    await sendViaNexmo(phone, message);

    console.log(`OTP sent to ${phone.substring(0, 6)}***`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-sms-hook error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
