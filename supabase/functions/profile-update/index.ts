// Edge function: profile-update
// Met à jour les 3 champs obligatoires du profil (Mur d'identification).
// Auth Firebase côté client : on fait confiance au user_id passé dans le body
// (même pattern que les autres fonctions du projet : partner-pack, deliver-number, etc.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function clean(s: unknown): string {
  return (typeof s === "string" ? s : "").trim();
}

function looksLikePhone(s: string): boolean {
  // Format permissif : 6 chiffres minimum, possibles espaces / + / -
  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 20;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !srv) return json({ success: false, error: "Server misconfigured" }, 500);
  const sb = createClient(url, srv);

  let body: any;
  try { body = await req.json(); } catch { return json({ success: false, error: "Invalid JSON" }, 400); }

  const user_id = clean(body?.user_id);
  if (!user_id) return json({ success: false, error: "user_id required" }, 400);

  const full_name = clean(body?.full_name);
  const deposit_number = clean(body?.deposit_number);
  const withdrawal_number = clean(body?.withdrawal_number);

  if (full_name.length < 2) return json({ success: false, error: "Nom & Prénom requis (2 caractères minimum)" }, 400);
  if (!looksLikePhone(deposit_number)) return json({ success: false, error: "Numéro de dépôt invalide" }, 400);
  if (!looksLikePhone(withdrawal_number)) return json({ success: false, error: "Numéro de retrait invalide" }, 400);

  // S'assure que le profil existe (au cas où ensure-profile n'a pas tourné)
  const { data: existing } = await sb.from("profiles").select("id").eq("id", user_id).maybeSingle();
  if (!existing) {
    return json({ success: false, error: "Profil introuvable. Reconnectez-vous." }, 404);
  }

  const { error } = await sb
    .from("profiles")
    .update({
      full_name,
      deposit_number,
      withdrawal_number,
      profile_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user_id);

  if (error) return json({ success: false, error: error.message }, 500);

  return json({ success: true });
});
