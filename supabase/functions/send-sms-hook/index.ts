import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await req.json();
    const phone: string = payload?.user?.phone ?? "";
    const otp: string = payload?.sms?.otp ?? "";
    if (!phone || !otp) return new Response(JSON.stringify({ error: "phone and otp required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("VONAGE_API_KEY");
    const apiSecret = Deno.env.get("VONAGE_API_SECRET");
    const message = `Votre code betesim : ${otp}. Valide 10 min. Ne partagez jamais ce code.`;

    if (!apiKey || !apiSecret) {
      console.log(`[SMS TEST] → ${phone}: ${message}`);
    } else {
      const res = await fetch("https://rest.nexmo.com/sms/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, from: "betesim", to: phone.replace("+", ""), text: message }),
      });
      const data = await res.json();
      if (data?.messages?.[0]?.status !== "0") throw new Error(data?.messages?.[0]?.["error-text"] ?? "SMS failed");
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
