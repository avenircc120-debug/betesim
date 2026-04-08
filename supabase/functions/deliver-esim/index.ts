import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const FIVE_SIM_API = "https://5sim.net/v1";

// Services selon le type de machine
const MACHINE_SERVICES: Record<string, string[]> = {
  pro:   ["whatsapp"],
  elite: ["whatsapp", "telegram"],
};

async function buyNumber(service: string, country: string, apiKey: string) {
  const url = `${FIVE_SIM_API}/user/buy/activation/${country}/any/${service}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`5sim error (${res.status}): ${err}`);
  }

  const data = await res.json();
  if (!data?.phone) throw new Error("Pas de numéro retourné par 5sim");

  return {
    id: data.id as number,
    phone: data.phone as string,
    country: data.country ?? country,
    operator: data.operator ?? "any",
  };
}

async function cancelOrder(orderId: number, apiKey: string) {
  try {
    await fetch(`${FIVE_SIM_API}/user/cancel/${orderId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
  } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Deux modes d'appel :
    // 1. Depuis le front (utilisateur authentifié) — Authorization Bearer
    // 2. Depuis activate-machine (interne) — X-Internal-Secret

    const authHeader = req.headers.get("Authorization");
    const internalSecret = req.headers.get("X-Internal-Secret");
    const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");

    let userId: string;
    let isInternalCall = false;

    if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
      // Appel interne depuis activate-machine
      isInternalCall = true;
      const body = await req.json();
      userId = body.user_id;

      if (!userId) {
        return new Response(JSON.stringify({ error: "user_id requis" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Appel interne sans pays choisi → skip (l'utilisateur choisira depuis le front)
      return new Response(
        JSON.stringify({ success: true, message: "L'utilisateur doit choisir son pays depuis l'app" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Appel depuis le front : vérifier l'auth
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = user.id;

    const body = await req.json();
    const { machine_type, service, country } = body;

    if (!machine_type || !service || !country) {
      return new Response(JSON.stringify({ error: "machine_type, service et country requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vérifier que la machine autorise ce service
    const allowedServices = MACHINE_SERVICES[machine_type] ?? [];
    if (!allowedServices.includes(service)) {
      return new Response(JSON.stringify({ error: `Service ${service} non inclus dans la machine ${machine_type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vérifier que l'utilisateur a bien une machine active (pro ou elite)
    const { data: session } = await adminClient
      .from("mining_sessions")
      .select("id, machine_type")
      .eq("user_id", userId)
      .eq("machine_type", machine_type)
      .eq("status", "active")
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ error: "Aucune machine active trouvée pour cet utilisateur" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vérifier qu'il n'a pas déjà reçu ce service
    const { data: existingDelivery } = await adminClient
      .from("esim_deliveries")
      .select("id, phone, status")
      .eq("user_id", userId)
      .eq("service", service)
      .in("status", ["delivered", "pending"])
      .maybeSingle();

    if (existingDelivery?.status === "delivered") {
      return new Response(
        JSON.stringify({
          success: true,
          deliveries: [{ service, phone: existingDelivery.phone, status: "delivered" }],
          message: "Numéro déjà livré",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("FIVE_SIM_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Clé API 5sim non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Créer l'enregistrement pending
    const { data: delivery, error: insertError } = await adminClient
      .from("esim_deliveries")
      .insert({
        user_id: userId,
        machine_type,
        service,
        country,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Acheter le numéro sur 5sim.net
    let number;
    try {
      number = await buyNumber(service, country, apiKey);
    } catch (err: any) {
      await adminClient
        .from("esim_deliveries")
        .update({ status: "failed", error_message: err.message })
        .eq("id", delivery.id);

      await adminClient.from("notifications").insert({
        user_id: userId,
        type: "warning",
        title: `Numéro ${service} indisponible ⚠️`,
        message: `Aucun numéro ${service} disponible dans ce pays. Essayez un autre pays.`,
      });

      return new Response(
        JSON.stringify({ error: err.message, retry: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mettre à jour avec le numéro obtenu
    await adminClient
      .from("esim_deliveries")
      .update({
        order_id: number.id,
        phone: number.phone,
        operator: number.operator,
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);

    // Notification push
    const serviceLabel = service === "whatsapp" ? "WhatsApp" : "Telegram";
    await adminClient.from("notifications").insert({
      user_id: userId,
      type: "success",
      title: `Numéro ${serviceLabel} livré 🎉`,
      message: `Votre numéro : ${number.phone}\nUtilisez-le pour créer votre compte ${serviceLabel}.`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        deliveries: [{ service, phone: number.phone, status: "delivered" }],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("deliver-esim error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
