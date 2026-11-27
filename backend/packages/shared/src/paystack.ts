import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PaystackBank { name: string; code: string }

/** What we use from Paystack. A small interface so tests (and other providers later) can stand in for the real thing. */
export interface PaystackClient {
  listBanks(country: string): Promise<PaystackBank[]>;
  resolveAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string }>;
  createSubaccount(o: { businessName: string; bankCode: string; accountNumber: string; percentageCharge: number }): Promise<{ subaccountCode: string }>;
  initialize(o: { email: string; amountMinor: number; currency: string; reference: string; subaccount: string; bearer: 'account' | 'subaccount'; metadata?: Record<string, unknown> }): Promise<{ url: string; reference: string }>;
  verify(reference: string): Promise<{ status: string; amountMinor: number; currency: string; reference: string }>;
}

export class PaystackError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const BASE = 'https://api.paystack.co';

export function createPaystackClient(secretKey: string, fetchImpl: typeof fetch = fetch): PaystackClient {
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (!res.ok || json.status === false || json.data === undefined) throw new PaystackError(json.message ?? `Paystack error ${res.status}`, res.status);
    return json.data;
  }
  return {
    async listBanks(country) {
      const rows = await call<{ name: string; code: string }[]>('GET', `/bank?country=${encodeURIComponent(country)}&perPage=200&use_cursor=false`);
      return rows.map((b) => ({ name: b.name, code: b.code }));
    },
    async resolveAccount(accountNumber, bankCode) {
      const d = await call<{ account_name: string }>('GET', `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
      return { accountName: d.account_name };
    },
    async createSubaccount(o) {
      const d = await call<{ subaccount_code: string }>('POST', '/subaccount', { business_name: o.businessName, settlement_bank: o.bankCode, account_number: o.accountNumber, percentage_charge: o.percentageCharge });
      return { subaccountCode: d.subaccount_code };
    },
    async initialize(o) {
      const d = await call<{ authorization_url: string; reference: string }>('POST', '/transaction/initialize', {
        email: o.email, amount: o.amountMinor, currency: o.currency, reference: o.reference, subaccount: o.subaccount, bearer: o.bearer, ...(o.metadata ? { metadata: o.metadata } : {})
      });
      return { url: d.authorization_url, reference: d.reference };
    },
    async verify(reference) {
      const d = await call<{ status: string; amount: number; currency: string; reference: string }>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
      return { status: d.status, amountMinor: d.amount, currency: d.currency, reference: d.reference };
    }
  };
}

/** Paystack signs each webhook body with HMAC-SHA512 using your secret key. Compared in constant time. */
export function verifyPaystackSignature(rawBody: Buffer | string, signature: string | undefined, secretKey: string): boolean {
  if (!signature || !secretKey) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
