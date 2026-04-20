import { logger } from "./logger.js";

const SMSPOOL_BASE = "https://api.smspool.net";
const API_KEY = process.env.SMSPOOL_API_KEY ?? "";

export interface SMSPoolCountry {
  ID: number | string;
  name: string;
  short_name: string;
  cc?: string;
  region?: string;
}

export interface SMSPoolService {
  ID: number | string;
  name: string;
  instock?: number;
  price?: number;
}

export interface SMSPoolOrder {
  order_id: string;
  number: string;
  country: string;
  service: string;
  pool?: string;
  expires_in?: number;
  sms?: string;
  full_sms?: string;
  status: number;
  // 1=pending, 2=received, 3=cancelled, 6=banned/invalid
}

export interface SMSPoolOrderResult {
  success: number;
  number: string;
  order_id: string;
  country: string;
  service: string;
  pool?: string;
  expires_in?: number;
  message?: string;
  cost?: number;
}

async function smspoolPost(endpoint: string, body: Record<string, string>): Promise<any> {
  const params = new URLSearchParams({ key: API_KEY, ...body });
  const res = await fetch(`${SMSPOOL_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ endpoint, status: res.status, text }, "SMSPool POST error");
    throw new Error(`SMSPool error ${res.status}: ${text}`);
  }
  return res.json();
}

async function smspoolGet(endpoint: string): Promise<any> {
  const res = await fetch(`${SMSPOOL_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ endpoint, status: res.status }, "SMSPool GET error");
    throw new Error(`SMSPool GET error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getCountries(): Promise<SMSPoolCountry[]> {
  const data = await smspoolGet("/country/retrieve_all");
  return Array.isArray(data) ? data : Object.values(data);
}

export async function getServices(): Promise<SMSPoolService[]> {
  const data = await smspoolGet("/service/retrieve_all");
  return Array.isArray(data) ? data : Object.values(data);
}

export async function getServicesByCountry(country: string): Promise<SMSPoolService[]> {
  const data = await smspoolPost("/service/retrieve_all_country", { country });
  return Array.isArray(data) ? data : Object.values(data);
}

export async function orderNumber(
  country: string,
  service: string,
  pool?: string
): Promise<SMSPoolOrderResult> {
  const body: Record<string, string> = { country, service };
  if (pool) body.pool = pool;

  const data = await smspoolPost("/purchase/sms/", body);

  if (!data.success || !data.number) {
    throw new Error(data.message ?? "SMSPool: no number available");
  }

  logger.info({ orderId: data.order_id, number: data.number, country, service }, "SMSPool number ordered");
  return data as SMSPoolOrderResult;
}

export async function checkSMS(orderId: string): Promise<SMSPoolOrder> {
  const data = await smspoolPost("/sms/check/", { order_id: orderId });
  return data as SMSPoolOrder;
}

export async function cancelOrder(orderId: string): Promise<boolean> {
  const data = await smspoolPost("/request/cancel/", { order_id: orderId });
  logger.info({ orderId, result: data }, "SMSPool order cancelled");
  return !!data.success;
}

export async function getBalance(): Promise<number> {
  const data = await smspoolGet("/request/balance");
  return Number(data.balance ?? 0);
}
