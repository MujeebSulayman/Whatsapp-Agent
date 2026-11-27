import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PaystackError, createPaystackClient, verifyPaystackSignature } from './paystack.js';

const reply = (data: unknown, ok = true, status = 200) => new Response(JSON.stringify({ status: ok, message: ok ? 'ok' : 'bad', data }), { status });
const seen: { url: string; init: RequestInit }[] = [];
const client = (r: Response) => createPaystackClient('sk_test_x', (async (url: string, init: RequestInit) => (seen.push({ url, init }), r)) as unknown as typeof fetch);

describe('paystack client', () => {
  it('starts a payment with the amount in minor units, the seller’s subaccount, and the seller paying the fee', async () => {
    seen.length = 0;
    const r = await client(reply({ authorization_url: 'https://checkout.paystack.com/abc', reference: 'ref1' })).initialize({ email: 'a@b.co', amountMinor: 1450000, currency: 'NGN', reference: 'ref1', subaccount: 'ACCT_1', bearer: 'subaccount', metadata: { orderId: 'o1' } });
    expect(r).toEqual({ url: 'https://checkout.paystack.com/abc', reference: 'ref1' });
    expect(seen[0]!.url).toBe('https://api.paystack.co/transaction/initialize');
    expect(JSON.parse(seen[0]!.init.body as string)).toMatchObject({ amount: 1450000, subaccount: 'ACCT_1', bearer: 'subaccount', currency: 'NGN' });
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_x');
  });

  it('creates a subaccount and resolves account names', async () => {
    expect(await client(reply({ subaccount_code: 'ACCT_9' })).createSubaccount({ businessName: 'Shop', bankCode: '058', accountNumber: '0123456789', percentageCharge: 0 })).toEqual({ subaccountCode: 'ACCT_9' });
    expect(await client(reply({ account_name: 'ADA OBI' })).resolveAccount('0123456789', '058')).toEqual({ accountName: 'ADA OBI' });
    expect(await client(reply([{ name: 'GTBank', code: '058', slug: 'x' }])).listBanks('nigeria')).toEqual([{ name: 'GTBank', code: '058' }]);
  });

  it('turns Paystack errors into a PaystackError with the message', async () => {
    await expect(client(reply(null, false, 422)).resolveAccount('1', '2')).rejects.toBeInstanceOf(PaystackError);
  });

  it('verifies webhook signatures and rejects anything else', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    const sig = createHmac('sha512', 'sk_test_x').update(body).digest('hex');
    expect(verifyPaystackSignature(body, sig, 'sk_test_x')).toBe(true);
    expect(verifyPaystackSignature(body + ' ', sig, 'sk_test_x')).toBe(false);
    expect(verifyPaystackSignature(body, sig, 'other')).toBe(false);
    expect(verifyPaystackSignature(body, undefined, 'sk_test_x')).toBe(false);
    expect(verifyPaystackSignature(body, 'short', 'sk_test_x')).toBe(false);
  });
});
