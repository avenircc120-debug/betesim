// ============================================================
//  UTILITAIRE FEDAPAY — PI REAL
//  Toute la logique de paiement passe par les Edge Functions
//  Supabase. Aucune clé n'est stockée dans le frontend.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export interface CreatePaymentOptions {
  amount: number;
  description: string;
  userId: string;
  paymentType: string;
  callbackUrl: string;
}

export interface CreatePaymentResult {
  paymentUrl: string;
  transactionId: string;
  environment: "sandbox" | "live";
  customerEmail: string;
}

/**
 * Crée une transaction FedaPay via la Edge Function Supabase
 * et retourne l'URL de paiement pour la redirection.
 */
export async function createFedaPayTransaction(
  options: CreatePaymentOptions
): Promise<CreatePaymentResult> {
  const { data, error } = await supabase.functions.invoke(
    "fedapay-create-transaction",
    {
      body: {
        amount: options.amount,
        description: options.description,
        user_id: options.userId,
        payment_type: options.paymentType,
        callback_url: options.callbackUrl,
      },
    }
  );

  // Cas où supabase-js renvoie une erreur HTTP (ex. 5xx, network)
  if (error) {
    // Tente de lire le corps réel pour avoir le vrai message
    let detail: string | undefined;
    try {
      const ctx: any = (error as any).context;
      if (ctx?.response) {
        const body = await ctx.response.clone().json();
        detail = body?.error || body?.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail || error.message || "Erreur lors de la création du paiement FedaPay.");
  }

  // Cas où la fonction renvoie 200 mais avec success:false
  if (data?.success === false) {
    throw new Error(data?.error || "Erreur lors de la création du paiement FedaPay.");
  }

  if (!data?.payment_url) {
    throw new Error("URL de paiement non reçue depuis FedaPay.");
  }

  return {
    paymentUrl: data.payment_url,
    transactionId: data.transaction_id,
    environment: data.environment,
    customerEmail: data.customer_email,
  };
}
