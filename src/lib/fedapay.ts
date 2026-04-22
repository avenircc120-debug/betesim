// ============================================================
//  UTILITAIRE FEDAPAY — PI REAL
//  Toute la logique de paiement passe par les Edge Functions
//  Supabase. Aucune clé n'est stockée dans le frontend.
//
//  Pour activer le mode live :
//    → Dans Supabase Dashboard > Edge Functions > Secrets :
//      FP_MODE=live
//      FP_SECRET_LIVE=sk_live_xxxx
//      FP_PUBLIC_LIVE=pk_live_xxxx
//  Pour rester en sandbox (par défaut) :
//      FP_MODE=sandbox (ou ne pas définir FP_MODE)
//      FP_SECRET_SANDBOX=sk_sandbox_xxxx
//      FP_PUBLIC_SANDBOX=pk_sandbox_xxxx (optionnel)
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
 *
 * Utilise supabase.functions.invoke() pour éviter tout problème
 * d'URL manquante ou de token incorrect.
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

  if (error) {
    throw new Error(error.message ?? "Erreur lors de la création du paiement FedaPay.");
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
