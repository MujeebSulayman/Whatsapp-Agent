import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { PaystackError, type PaystackClient } from '@wa/shared';
import { AppModule } from '../src/app.module.js';
import { INBOUND_QUEUE, REDIS } from '../src/infra.module.js';
import { PAYSTACK_CLIENT } from '../src/payments/payments.controller.js';
import type { Redis } from 'ioredis';

const SECRET = 'sk_test_unit_secret';
const prisma = createPrisma();
const run = Math.random().toString(36).slice(2, 8);
let app: INestApplication;
let redis: Redis;
type Tenant = { token: string; businessId: string };
const A = {} as Tenant;
const US = {} as Tenant;
const AGENT = {} as Tenant;
const http = () => request(app.getHttpServer());
const as = (t: Tenant) => ({ Authorization: `Bearer ${t.token}` });

let verifyResult: { status: string; amountMinor: number; currency: string } = { status: 'success', amountMinor: 0, currency: 'NGN' };
const created: unknown[] = [];
const fake: PaystackClient = {
  listBanks: async () => [{ name: 'Zenith Bank', code: '057' }, { name: 'Access Bank', code: '044' }],
  resolveAccount: async (n) => { if (n === '0000000000') throw new PaystackError('Could not resolve account name', 422); return { accountName: 'ADA OBI' }; },
  createSubaccount: async (o) => (created.push(o), { subaccountCode: 'ACCT_test1' }),
  initialize: async (o) => ({ url: `https://checkout.paystack.com/${o.reference}`, reference: o.reference }),
  verify: async (ref) => ({ ...verifyResult, reference: ref })
};

const signup = async (email: string, name: string, country = 'NG', currency = 'NGN'): Promise<Tenant> => {
  const res = await http().post('/auth/signup').send({ email, password: 'correct-horse-9', name: 'Owner', businessName: name, category: 'fashion', city: 'Lagos', country, currency, timezone: 'Africa/Lagos' });
  expect(res.status).toBe(201);
  return { token: res.body.token, businessId: res.body.business.id };
};

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  process.env.WHATSAPP_DRY_RUN = 'true';
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = 'e'.repeat(64);
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).overrideProvider(PAYSTACK_CLIENT).useValue(fake).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  Object.assign(A, await signup(`pay-a-${run}@example.com`, `Pay Alpha ${run}`));
  Object.assign(US, await signup(`pay-us-${run}@example.com`, `Pay US ${run}`, 'US', 'USD'));
  const add = await http().post('/team').set(as(A)).send({ email: `pay-agent-${run}@example.com`, name: 'Agent', password: 'agent-pass-123' });
  expect(add.status).toBe(201);
  const login = await http().post('/auth/login').send({ email: `pay-agent-${run}@example.com`, password: 'agent-pass-123' });
  Object.assign(AGENT, { token: login.body.token, businessId: A.businessId });
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [A.businessId, US.businessId] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:pay-a-${run}@example.com`, `rl:login:::ffff:127.0.0.1:pay-agent-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

describe('payout account setup', () => {
  it('starts not connected, and lists banks', async () => {
    expect((await http().get('/payments/status').set(as(A))).body).toMatchObject({ available: true, supported: true, connected: false });
    expect((await http().get('/payments/banks').set(as(A))).body.map((b: { name: string }) => b.name)).toEqual(['Access Bank', 'Zenith Bank']);
  });

  it('only owners can connect, look up or disconnect an account', async () => {
    const body = { bankCode: '057', accountNumber: '0123456789' };
    expect((await http().post('/payments/payout-account').set(as(AGENT)).send(body)).status).toBe(403);
    expect((await http().post('/payments/resolve-account').set(as(AGENT)).send(body)).status).toBe(403);
    expect((await http().delete('/payments/payout-account').set(as(AGENT))).status).toBe(403);
  });

  it('shows the account name for confirmation, rejects bad numbers, and reports unknown accounts', async () => {
    expect((await http().post('/payments/resolve-account').set(as(A)).send({ bankCode: '057', accountNumber: '0123456789' })).body).toEqual({ accountName: 'ADA OBI' });
    expect((await http().post('/payments/resolve-account').set(as(A)).send({ bankCode: '057', accountNumber: '12345' })).status).toBe(400);
    expect((await http().post('/payments/resolve-account').set(as(A)).send({ bankCode: '057', accountNumber: '0000000000' })).status).toBe(400);
  });

  it('connects the business’s own bank account as a subaccount and keeps only the last 4 digits', async () => {
    const r = await http().post('/payments/payout-account').set(as(A)).send({ bankCode: '057', accountNumber: '0123456789' });
    expect(r.body).toEqual({ connected: true, bankName: 'Zenith Bank', accountName: 'ADA OBI', last4: '6789' });
    expect(created[0]).toMatchObject({ bankCode: '057', accountNumber: '0123456789', percentageCharge: 0 });
    const biz = await prisma.business.findUniqueOrThrow({ where: { id: A.businessId } });
    expect(biz).toMatchObject({ paystackSubaccountCode: 'ACCT_test1', payoutAccountLast4: '6789' });
    expect(JSON.stringify(biz)).not.toContain('0123456789');
    expect((await http().get('/payments/status').set(as(A))).body).toMatchObject({ connected: true, last4: '6789' });
  });

  it('is not offered to businesses paid in other currencies', async () => {
    expect((await http().get('/payments/status').set(as(US))).body).toMatchObject({ supported: false });
    expect((await http().post('/payments/payout-account').set(as(US)).send({ bankCode: '057', accountNumber: '0123456789' })).status).toBe(400);
  });
});

describe('paystack webhook', () => {
  let orderId: string;
  let productId: string;
  let customerId: string;
  let conversationId: string;
  const reference = `cv-test-${run}`;
  const send = (payload: object, sig?: string) => {
    const raw = JSON.stringify(payload);
    return http().post('/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', sig ?? createHmac('sha512', SECRET).update(raw).digest('hex')).send(raw);
  };
  const charge = { event: 'charge.success', data: { reference } };

  beforeAll(async () => {
    const p = await prisma.product.create({ data: { businessId: A.businessId, name: 'Runner', priceMinor: 1450000, stockQty: 3, variants: [{ name: '42', stockQty: 3 }] } });
    productId = p.id;
    const c = await prisma.customer.create({ data: { businessId: A.businessId, waId: `234${Math.floor(Math.random() * 1e9)}` } });
    customerId = c.id;
    conversationId = (await prisma.conversation.create({ data: { businessId: A.businessId, customerId, windowExpiresAt: new Date(Date.now() + 3600_000) } })).id;
    await prisma.whatsappAccount.create({ data: { businessId: A.businessId, wabaId: 'w', phoneNumberId: `pn-pay-${run}`, displayNumber: '+234', accessTokenEncrypted: 'x' } });
    const o = await prisma.order.create({ data: { businessId: A.businessId, customerId, items: [{ product_id: productId, name: 'Runner', variant: '42', quantity: 1, unit_price_minor: 1450000, line_total_minor: 1450000 }], subtotalMinor: 1450000, totalMinor: 1450000 } });
    orderId = o.id;
    await prisma.payment.create({ data: { businessId: A.businessId, orderId, reference, amountMinor: 1450000 } });
  });

  it('rejects anything not signed by Paystack', async () => {
    expect((await send(charge, 'bad')).status).toBe(401);
    expect((await http().post('/webhooks/paystack').send(charge)).status).toBe(401);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe('unpaid');
  });

  it('does not believe the message if Paystack says the payment did not go through or the amount differs', async () => {
    verifyResult = { status: 'failed', amountMinor: 1450000, currency: 'NGN' };
    expect((await send(charge)).status).toBe(200);
    verifyResult = { status: 'success', amountMinor: 100, currency: 'NGN' };
    expect((await send(charge)).status).toBe(200);
    verifyResult = { status: 'success', amountMinor: 1450000, currency: 'USD' };
    await send(charge);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe('unpaid');
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference } })).status).toBe('pending');
  });

  it('ignores unknown references and other events', async () => {
    expect((await send({ event: 'charge.success', data: { reference: 'nope' } })).status).toBe(200);
    expect((await send({ event: 'transfer.success', data: { reference } })).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe('unpaid');
  });

  it('a confirmed payment marks the order paid, takes the stock, counts the sale and tells the customer', async () => {
    verifyResult = { status: 'success', amountMinor: 1450000, currency: 'NGN' };
    expect((await send(charge)).status).toBe(200);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ paymentStatus: 'paid', status: 'paid' });
    expect(await prisma.payment.findUniqueOrThrow({ where: { reference } })).toMatchObject({ status: 'paid' });
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(p.stockQty).toBe(2);
    expect((p.variants as { stockQty: number }[])[0]!.stockQty).toBe(2);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).totalSpentMinor).toBe(1450000);
    const msg = await prisma.message.findFirstOrThrow({ where: { conversationId } });
    expect(msg.body).toBe('Payment of ₦14,500 received. Thank you! Your order is confirmed and we will keep you updated.');
    expect(await prisma.auditLog.count({ where: { businessId: A.businessId, action: 'order.paid_online' } })).toBe(1);
  });

  it('Paystack sending the same event again changes nothing', async () => {
    await send(charge);
    await send(charge);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty).toBe(2);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).totalSpentMinor).toBe(1450000);
  });

  it('the owner pressing "mark paid" after an online payment does not take stock twice', async () => {
    await http().post(`/orders/${orderId}/mark-paid`).set(as(A));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty).toBe(2);
  });
});
