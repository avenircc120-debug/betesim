
// =============================================================
//  5SIM.NET — Virtual Number Delivery
//  All API calls go through the Supabase Edge Function
//  `deliver-number` to protect the API key server-side.
//
//  Edge Function secrets required (Supabase Dashboard > Secrets):
//    FIVESIM_API_KEY=your_5sim_api_key
//
//  5sim service identifiers:
//    whatsapp → "whatsapp"
//    tiktok   → "tiktok"
// =============================================================

export type FiveSimService = "whatsapp" | "tiktok";

export interface DeliverNumberOptions {
  service: FiveSimService;
  productType: "simple" | "partner";
  fedapayTransactionId: string;
  userId: string;
  accessToken: string;
}

export interface DeliveredNumber {
  id: number;
  number: string;
  service: string;
  status: string;
  sms?: { code: string; text: string }[];
}

/**
 * Request a virtual number delivery via Supabase Edge Function.
 * The edge function calls 5sim.net and records the delivery in the DB.
 */
export async function deliverNumber(options: DeliverNumberOptions): Promise<DeliveredNumber> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const res = await fetch(`${supabaseUrl}/functions/v1/deliver-number`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${options.accessToken}`,
    },
    body: JSON.stringify({
      service: options.service,
      product_type: options.productType,
      fedapay_transaction_id: options.fedapayTransactionId,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error ?? "Erreur lors de la livraison du numéro.");
  }
  return data as DeliveredNumber;
}
