import { logger } from "./logger";

export type FedaPayMode = "sandbox" | "live";

export interface FedaPayConfig {
  mode: FedaPayMode;
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  apiBase: string;
}

export function getFedaPayConfig(): FedaPayConfig {
  const mode: FedaPayMode =
    (process.env.FEDAPAY_MODE as FedaPayMode) === "live" ? "live" : "sandbox";

  const secretKey =
    mode === "live"
      ? (process.env.FEDAPAY_SECRET_KEY_LIVE ?? process.env.FEDAPAY_SECRET_KEY ?? "")
      : (process.env.FEDAPAY_SECRET_KEY_SANDBOX ?? process.env.FEDAPAY_SECRET_KEY ?? "");

  const publicKey =
    mode === "live"
      ? (process.env.FEDAPAY_PUBLIC_KEY_LIVE ?? "")
      : (process.env.FEDAPAY_PUBLIC_KEY_SANDBOX ?? "");

  const webhookSecret =
    mode === "live"
      ? (process.env.FEDAPAY_WEBHOOK_SECRET_LIVE ?? process.env.FEDAPAY_WEBHOOK_SECRET ?? "")
      : (process.env.FEDAPAY_WEBHOOK_SECRET_SANDBOX ?? process.env.FEDAPAY_WEBHOOK_SECRET ?? "");

  const apiBase =
    mode === "live"
      ? "https://api.fedapay.com/v1"
      : "https://sandbox-api.fedapay.com/v1";

  if (!secretKey) {
    logger.warn({ mode }, "FedaPay secret key not set for mode");
  }
  if (!webhookSecret) {
    logger.warn({ mode }, "FedaPay webhook secret not set for mode");
  }

  return { mode, secretKey, publicKey, webhookSecret, apiBase };
}
