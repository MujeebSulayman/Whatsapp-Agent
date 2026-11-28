import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import type { PaystackClient } from '@wa/shared';
import { AppModule } from '../src/app.module.js';
import { INBOUND_QUEUE, REDIS } from '../src/infra.module.js';
import { PAYSTACK_CLIENT } from '../src/payments/payments.controller.js';
import type { Redis } from 'ioredis';

/** Money and stock when several things happen at the same instant. */
const SECRET = 'sk_test_concurrency';
const prisma = createPrisma();
const run = Math.random().toString(36).slice(2, 8);
let app: INestApplication;
let redis: Redis;
let token = '';
let businessId = '';
let verifyAmount = 0;
const http = () => request(app.getHttpServer());
const auth = () => ({ Authorization: `Bearer ${token}` });
const fake: PaystackClient = {
  listBanks: async () => [], resolveAccount: async () => ({ accountName: 'X' }), createSubaccount: async () => ({ subaccountCode: 'A' }), initialize: async (o) => ({ url: 'u', reference: o.reference }),
  verify: async (reference) => ({ status: 'success', amountMinor: verifyAmount, currency: 'NGN', reference })
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
  const su = await http().post('/auth/signup').send({ email: `cc-${run}@example.com`, password: 'correct-horse-9', name: 'Owner', businessName: `CC ${run}`, category: 'fashion', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' });
  token = su.body.token; businessId = su.body.business.id;
  await prisma.whatsappAccount.create({ data: { businessId, wabaId: 'w', phoneNumberId: `pn-cc-${run}`, displayNumber: '+234', accessTokenEncrypted: 'x' } });
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:cc-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

const customer = () => prisma.customer.create({ data: { businessId, waId: `234${Math.floor(Math.random() * 1e9)}` } });
const orderFor = async (productId: string, qty = 1, total = 100000) => {
  const c = await customer();
  return prisma.order.create({ data: { businessId, customerId: c.id, items: [{ product_id: productId, name: 'P', variant: null, quantity: qty, unit_price_minor: total, line_total_minor: total * qty }], subtotalMinor: total * qty, totalMinor: total * qty } });
};
const product = (stockQty: number) => prisma.product.create({ data: { businessId, name: `P${Math.random()}`, priceMinor: 100000, stockQty, trackStock: true } });

describe('marking an order paid', () => {
  it('six taps at once take the stock and count the sale once', async () => {
    const p = await product(5);
    const o = await orderFor(p.id, 2);
    await Promise.all(Array.from({ length: 6 }, () => http().post(`/orders/${o.id}/mark-paid`).set(auth())));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBe(3);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: o.customerId } })).totalSpentMinor).toBe(200000);
    expect(await prisma.auditLog.count({ where: { businessId, action: 'order.mark_paid', payload: { path: ['orderId'], equals: o.id } } })).toBe(1);
  });

  it('a payment confirmation and a manual tap at the same instant count once', async () => {
    const p = await product(5);
    const o = await orderFor(p.id, 1);
    const reference = `cv-${o.id}-race`;
    await prisma.payment.create({ data: { businessId, orderId: o.id, reference, amountMinor: 100000 } });
    verifyAmount = 100000;
    const raw = JSON.stringify({ event: 'charge.success', data: { reference } });
    const sig = createHmac('sha512', SECRET).update(raw).digest('hex');
    const hook = () => http().post('/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw);
    await Promise.all([hook(), http().post(`/orders/${o.id}/mark-paid`).set(auth()), hook(), http().post(`/orders/${o.id}/mark-paid`).set(auth()), hook()]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBe(4);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: o.customerId } })).totalSpentMinor).toBe(100000);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('paid');
  });

  it('two orders paid at once for the last unit never push stock below zero', async () => {
    const p = await product(1);
    const [a, b] = [await orderFor(p.id, 1), await orderFor(p.id, 1)];
    await Promise.all([http().post(`/orders/${a.id}/mark-paid`).set(auth()), http().post(`/orders/${b.id}/mark-paid`).set(auth())]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBe(0);
  });

  it('a payment for the wrong amount is never accepted, even if sent many times', async () => {
    const p = await product(5);
    const o = await orderFor(p.id, 1);
    const reference = `cv-${o.id}-short`;
    await prisma.payment.create({ data: { businessId, orderId: o.id, reference, amountMinor: 100000 } });
    verifyAmount = 5000; // Paystack says they only paid a fraction
    const raw = JSON.stringify({ event: 'charge.success', data: { reference } });
    const sig = createHmac('sha512', SECRET).update(raw).digest('hex');
    await Promise.all(Array.from({ length: 4 }, () => http().post('/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw)));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('unpaid');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBe(5);
  });
});

describe('telling waiting customers it is back', () => {
  it('several taps at once message each person only once', async () => {
    const p = await prisma.product.create({ data: { businessId, name: 'Waited', priceMinor: 100, stockQty: 0, trackStock: true } });
    const people = await Promise.all(Array.from({ length: 3 }, customer));
    for (const c of people) {
      await prisma.conversation.create({ data: { businessId, customerId: c.id, windowExpiresAt: new Date(Date.now() + 3600_000) } });
      await prisma.waitlistEntry.create({ data: { businessId, productId: p.id, customerId: c.id } });
    }
    await prisma.product.update({ where: { id: p.id }, data: { stockQty: 5 } });
    const results = await Promise.all(Array.from({ length: 4 }, () => http().post('/waitlist/notify').set(auth()).send({ productId: p.id })));
    const sent = results.reduce((s, r) => s + (r.body.notified ?? 0), 0);
    expect(sent).toBe(3);
    expect(await prisma.message.count({ where: { businessId, body: { contains: 'Waited is back in stock' } } })).toBe(3);
  });
});
