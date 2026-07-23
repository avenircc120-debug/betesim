import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

export const CHAP_MONEY_URL = (
  process.env.CHAP_MONEY_URL ?? "https://chap-money.vercel.app"
).replace(/\/$/, "");
export const CHAP_MONEY_PUBLIC_KEY = process.env.CHAP_MONEY_PUBLIC_KEY ?? "";
export const CHAP_MONEY_WEBHOOK_KEY = process.env.CHAP_MONEY_WEBHOOK_KEY ?? "";

export const COIN_PACKS: Record<number, number> = {
  10: 1_000,
  20: 2_000,
  35: 3_000,
  46: 4_000,
  58: 5_000,
  118: 10_000,
  180: 15_000,
  250: 20_000,
  650: 50_000,
  1450: 100_000,
};

const OPERATORS_BY_COUNTRY: Record<string, Set<string>> = {
  bj: new Set(["mtn_open", "moov", "sbin", "momo_test"]),
  tg: new Set(["moov_tg", "togocel", "momo_test"]),
  ci: new Set(["mtn_ci", "momo_test"]),
  ne: new Set(["airtel_ne", "momo_test"]),
  sn: new Set(["free_sn", "momo_test"]),
  gn: new Set(["mtn_open_gn", "momo_test"]),
};

export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireUser(req: any) {
  const header = String(req.headers?.authorization ?? "");
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const { data, error } = await getSupabase().auth.getUser(header.slice(7));
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return data.user;
}

export function json(res: any, status: number, body: unknown) {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

export function normalizePhone(value: unknown): string {
  const phone = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");
  if (!/^\d{6,15}$/.test(phone))
    throw new Error("Numéro de téléphone invalide");
  return phone;
}

export function normalizeCountry(value: unknown): string {
  const country = String(value ?? "").toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) throw new Error("Pays invalide");
  return country;
}

export function normalizeOperator(value: unknown): string {
  const operator = String(value ?? "").toLowerCase();
  const allowed = new Set([
    "mtn_open",
    "moov",
    "sbin",
    "momo_test",
    "moov_tg",
    "togocel",
    "airtel_ne",
    "mtn_open_gn",
    "mtn_ci",
    "free_sn",
  ]);
  if (!allowed.has(operator)) throw new Error("Opérateur mobile invalide");
  return operator;
}

export function validateCountryOperator(
  country: string,
  operator: string,
): void {
  if (!OPERATORS_BY_COUNTRY[country]?.has(operator)) {
    throw new Error("Cette opération n’est pas disponible dans le pays choisi");
  }
}

export async function chapRequest(path: string, init: RequestInit = {}) {
  if (!CHAP_MONEY_PUBLIC_KEY)
    throw new Error("Chap Money configuration is missing");
  const response = await fetch(`${CHAP_MONEY_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": CHAP_MONEY_PUBLIC_KEY,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 300) };
  }
  if (!response.ok) {
    throw new Error(
      String(
        data.error ?? data.message ?? `Chap Money HTTP ${response.status}`,
      ),
    );
  }
  return data;
}

export async function readRawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function verifyChapSignature(
  rawBody: Buffer,
  signature: unknown,
): boolean {
  if (!CHAP_MONEY_WEBHOOK_KEY || typeof signature !== "string") return false;
  const expected = createHmac("sha256", CHAP_MONEY_WEBHOOK_KEY)
    .update(rawBody)
    .digest("hex");
  const actual = signature.trim().toLowerCase();
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function statusFromChap(payload: any): string {
  const event = String(payload?.event ?? "").toLowerCase();
  const status = String(
    payload?.status ?? payload?.transaction?.status ?? "",
  ).toLowerCase();
  if (
    event.includes("approved") ||
    status === "approved" ||
    status === "transferred"
  )
    return "approved";
  if (
    event.includes("declined") ||
    event.includes("canceled") ||
    event.includes("cancelled") ||
    event.includes("refunded") ||
    ["declined", "canceled", "cancelled", "refunded"].includes(status)
  ) {
    return "failed";
  }
  return "pending";
}

export const config = { api: { bodyParser: false } };
