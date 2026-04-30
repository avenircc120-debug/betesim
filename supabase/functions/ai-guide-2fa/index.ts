/**
 * Edge Function: ai-guide-2fa
 *
 * Génère, via Groq, le message du guide IA qui aide l'utilisateur à
 * configurer son Gmail de récupération 2FA dans Telegram.
 *
 * Le message respecte STRICTEMENT la structure suivante (JSON), pour que
 * le front puisse le rendre proprement dans des bulles distinctes :
 *
 * {
 *   "intro":             string,   // 1 phrase d'accroche
 *   "explanation":       string,   // explication "Gmail miroir"
 *   "callToAction":      string,   // invite à cliquer sur "Ouvrir le formulaire"
 *   "mirrorTip":         string,   // astuce "même Gmail que Play Store"
 *   "securityReminder":  string    // rappel sur les 2 clés secrètes
 * }
 *
 * En cas d'échec Groq (clé manquante, rate-limit, parsing JSON), on retourne
 * un message statique de secours pour ne JAMAIS bloquer l'utilisateur.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Modèle rapide et bon marché chez Groq (Llama 3.1 8B). Si Groq déprécie ce
// modèle un jour, il suffira de mettre à jour cette constante.
const GROQ_MODEL = "llama-3.1-8b-instant";

const FALLBACK = {
  intro:
    "Pour sécuriser ton compte, utilise simplement l'adresse Gmail qui est déjà dans ton téléphone.",
  explanation:
    "📱 C'est ton Gmail principal, celui que tu utilises pour tout. En mettant celui-là, tu es sûr de ne jamais perdre l'accès à tes gains, même si tu changes de téléphone ou si tu réinitialises ton Samsung.",
  callToAction:
    "👇 Clique sur le bouton pour ouvrir le formulaire, tape tes 8 caractères et ton Gmail habituel pour valider définitivement ton compte de récupération.",
  mirrorTip:
    "Astuce miroir : utilise le même Gmail que celui de ton Play Store / téléphone. N'en crée surtout pas un nouveau, tu risquerais de l'oublier.",
  securityReminder:
    "Ton Gmail et ton code de 8 caractères sont tes deux clés secrètes. Garde-les bien.",
};

const SYSTEM_PROMPT = `Tu es un assistant IA bienveillant qui aide des utilisateurs francophones (souvent en Afrique de l'Ouest) à sécuriser leur compte Telegram avec la 2FA.

Tu dois rédiger un message court, très clair, en TUTOIEMENT, en français simple, sans jargon technique.

Le but du message : convaincre l'utilisateur d'utiliser comme Gmail de récupération 2FA le MÊME Gmail que celui déjà configuré sur son téléphone (celui du Play Store), pour ne jamais perdre l'accès à son compte.

Tu dois renvoyer UNIQUEMENT un objet JSON valide (sans markdown, sans \`\`\`), avec EXACTEMENT ces 5 clés et rien d'autre :

{
  "intro":            "1 phrase d'accroche (max 25 mots) qui invite à utiliser le Gmail déjà dans le téléphone.",
  "explanation":      "1 paragraphe (max 50 mots) commençant par l'emoji 📱, qui explique que c'est son Gmail principal et qu'il ne perdra jamais l'accès à ses gains, même en cas de changement ou réinitialisation de téléphone (mentionne Samsung).",
  "callToAction":     "1 paragraphe (max 40 mots) commençant par l'emoji 👇, qui invite à cliquer sur le bouton pour ouvrir le formulaire, taper ses 8 caractères et son Gmail habituel.",
  "mirrorTip":        "1 phrase (max 35 mots) qui rappelle d'utiliser le MÊME Gmail que celui du Play Store / téléphone, et SURTOUT pas d'en créer un nouveau qu'il oublierait.",
  "securityReminder": "1 phrase (max 25 mots) rappelant que le Gmail et le code de 8 caractères sont ses 2 clés secrètes à garder précieusement."
}

Aucun autre texte, aucune explication. Uniquement ce JSON.`;

interface GroqMessage {
  role: "system" | "user";
  content: string;
}

async function callGroq(apiKey: string, firstName?: string): Promise<typeof FALLBACK | null> {
  const userPrompt = firstName
    ? `Rédige le message en t'adressant à ${firstName} (utilise son prénom une fois, naturellement).`
    : `Rédige le message.`;

  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error("[ai-guide-2fa] Groq HTTP", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const raw: unknown = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return null;

    const parsed = JSON.parse(raw);
    // Validation stricte : toutes les clés doivent être des strings non-vides.
    const keys: (keyof typeof FALLBACK)[] = [
      "intro",
      "explanation",
      "callToAction",
      "mirrorTip",
      "securityReminder",
    ];
    const out = { ...FALLBACK };
    for (const k of keys) {
      const v = parsed?.[k];
      if (typeof v === "string" && v.trim().length > 0) {
        out[k] = v.trim();
      }
    }
    return out;
  } catch (err) {
    clearTimeout(timer);
    console.error("[ai-guide-2fa] Groq call failed:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let firstName: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.firstName === "string") {
      firstName = body.firstName.slice(0, 40); // safety cap
    }
  } catch { /* noop */ }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    console.warn("[ai-guide-2fa] GROQ_API_KEY missing — serving fallback");
    return new Response(
      JSON.stringify({ source: "fallback", message: FALLBACK }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const ai = await callGroq(apiKey, firstName);
  return new Response(
    JSON.stringify({
      source: ai ? "groq" : "fallback",
      message: ai ?? FALLBACK,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
