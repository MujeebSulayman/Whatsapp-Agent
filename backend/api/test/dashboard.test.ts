import 'reflect-metadata';
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { AppModule } from '../src/app.module.js';
import { INBOUND_QUEUE, REDIS } from '../src/infra.module.js';
import type { Redis } from 'ioredis';

const prisma = createPrisma();
const run = Math.random().toString(36).slice(2, 8);
let app: INestApplication;
let redis: Redis;

type Tenant = { token: string; businessId: string; userId: string; email: string };
const A = {} as Tenant;
const B = {} as Tenant;
const http = () => request(app.getHttpServer());
const as = (t: Tenant) => ({ Authorization: `Bearer ${t.token}` });

async function signup(email: string, businessName: string): Promise<Tenant> {
  const res = await http().post('/auth/signup').send({ email, password: 'correct-horse-9', name: 'Owner', businessName, category: 'food', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' });
  expect(res.status).toBe(201);
  return { token: res.body.token, businessId: res.body.business.id, userId: res.body.user.id, email };
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  process.env.WHATSAPP_DRY_RUN = 'true';
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = 'e'.repeat(64);
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  Object.assign(A, await signup(`a-${run}@example.com`, `Alpha Foods ${run}`));
  Object.assign(B, await signup(`b-${run}@example.com`, `Beta Wears ${run}`));
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [A.businessId, B.businessId] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:a-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

describe('accounts', () => {
  it('signup creates an isolated business on a 14-day trial with the owner role', async () => {
    const me = await http().get('/auth/me').set(as(A));
    expect(me.body.role).toBe('owner');
    expect(me.body.business.plan).toBe('trial');
    const days = (new Date(me.body.business.trialEndsAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(A.businessId).not.toBe(B.businessId);
  });
  it('rejects duplicate emails and weak passwords', async () => {
    expect((await http().post('/auth/signup').send({ email: A.email, password: 'correct-horse-9', name: 'x', businessName: 'Dup Biz', city: 'Lagos', country: 'NG', currency: 'NGN' })).status).toBe(409);
    expect((await http().post('/auth/signup').send({ email: `w-${run}@example.com`, password: 'short', name: 'x', businessName: 'Weak Biz', city: 'Lagos', country: 'NG', currency: 'NGN' })).status).toBe(400);
  });
  it('logs in with the right password only', async () => {
    expect((await http().post('/auth/login').send({ email: A.email, password: 'correct-horse-9' })).body.token).toBeTruthy();
    expect((await http().post('/auth/login').send({ email: A.email, password: 'wrong-password' })).status).toBe(401);
    expect((await http().post('/auth/login').send({ email: `nobody-${run}@example.com`, password: 'whatever-123' })).status).toBe(401);
  });
  it('requires a valid token on every dashboard route', async () => {
    for (const path of ['/business', '/products', '/orders', '/conversations', '/customers', '/analytics/overview', '/team', '/faqs', '/delivery-zones']) {
      expect((await http().get(path)).status, path).toBe(401);
      expect((await http().get(path).set('Authorization', 'Bearer garbage')).status, path).toBe(401);
    }
  });
});

describe('tenant isolation: catalog', () => {
  let productId = '';
  let zoneId = '';
  let faqId = '';
  beforeAll(async () => {
    productId = (await http().post('/products').set(as(A)).send({ name: 'Jollof Pack', priceMinor: 500000, stockQty: 10 })).body.id;
    zoneId = (await http().post('/delivery-zones').set(as(A)).send({ areaName: 'Lekki', feeMinor: 200000, etaText: '1h' })).body.id;
    faqId = (await http().post('/faqs').set(as(A)).send({ question: 'Do you deliver?', answer: 'Yes' })).body.id;
  });
  it('owner sees their own data, the other tenant sees none of it', async () => {
    expect((await http().get('/products').set(as(A))).body).toHaveLength(1);
    for (const p of ['/products', '/delivery-zones', '/faqs']) expect((await http().get(p).set(as(B))).body, p).toEqual([]);
  });
  it("another tenant can't edit or delete it (404, and the row is untouched)", async () => {
    for (const [path, body] of [[`/products/${productId}`, { name: 'hacked' }], [`/delivery-zones/${zoneId}`, { areaName: 'hacked' }], [`/faqs/${faqId}`, { question: 'hacked?' }]] as const) {
      expect((await http().patch(path).set(as(B)).send(body)).status, path).toBe(404);
      expect((await http().delete(path).set(as(B))).status, path).toBe(404);
    }
    expect((await http().get('/products').set(as(A))).body[0].name).toBe('Jollof Pack');
  });
  it('validates input', async () => {
    expect((await http().post('/products').set(as(A)).send({ name: 'x', priceMinor: 12.5, stockQty: 1 })).status).toBe(400);
    expect((await http().post('/products').set(as(A)).send({ name: 'x', priceMinor: -1, stockQty: 1 })).status).toBe(400);
  });
  it('imports a CSV with naira prices, updating existing names and reporting bad rows', async () => {
    const csv = 'name,description,price,stock,variants\nJollof Pack,updated,"₦6,500.50",4,\nSamosa Box,"crispy, hot",3000,20,Beef|Chicken\n,missing name,100,1,\nBad Price,x,abc,1,\n';
    const res = await http().post('/products/import').set(as(A)).send({ csv });
    expect(res.body).toMatchObject({ created: 1, updated: 1 });
    expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([4, 5]);
    const list = (await http().get('/products').set(as(A))).body as { name: string; priceMinor: number; variants: unknown }[];
    expect(list.find((p) => p.name === 'Jollof Pack')?.priceMinor).toBe(650050);
    expect(list.find((p) => p.name === 'Samosa Box')?.variants).toEqual([{ name: 'Beef' }, { name: 'Chicken' }]);
    expect((await http().get('/products').set(as(B))).body).toEqual([]);
  });
});

describe('tenant isolation: inbox, orders, customers', () => {
  let customerId = '';
  let conversationId = '';
  let orderId = '';
  let productId = '';
  beforeAll(async () => {
    productId = (await prisma.product.create({ data: { businessId: A.businessId, name: 'Party Pack', priceMinor: 1_200_000, stockQty: 5 } })).id;
    const c = await prisma.customer.create({ data: { businessId: A.businessId, waId: '2348055550001', name: 'Ada' } });
    customerId = c.id;
    conversationId = (await prisma.conversation.create({ data: { businessId: A.businessId, customerId, windowExpiresAt: new Date(Date.now() + 3600_000) } })).id;
    await prisma.message.create({ data: { businessId: A.businessId, conversationId, direction: 'inbound', body: 'hello', sentBy: 'customer', waMessageId: `w-${run}-1` } });
    orderId = (await prisma.order.create({
      data: { businessId: A.businessId, customerId, subtotalMinor: 2_400_000, totalMinor: 2_600_000, deliveryFeeMinor: 200_000, items: [{ product_id: productId, name: 'Party Pack', quantity: 2, line_total_minor: 2_400_000 }] }
    })).id;
  });

  it("tenant B can't see or touch tenant A's chats, orders or customers", async () => {
    for (const p of ['/conversations', '/orders', '/customers']) expect((await http().get(p).set(as(B))).body, p).toEqual([]);
    const probes: [string, string, object?][] = [
      ['get', `/conversations/${conversationId}`], ['post', `/conversations/${conversationId}/takeover`], ['post', `/conversations/${conversationId}/handback`],
      ['post', `/conversations/${conversationId}/close`], ['post', `/conversations/${conversationId}/messages`, { body: 'hi' }],
      ['get', `/orders/${orderId}`], ['patch', `/orders/${orderId}/status`, { status: 'dispatched' }], ['post', `/orders/${orderId}/mark-paid`],
      ['get', `/customers/${customerId}`], ['patch', `/customers/${customerId}`, { name: 'hacked' }]
    ];
    for (const [m, path, body] of probes) {
      const res = await (http() as unknown as Record<string, (p: string) => request.Test>)[m]!(path).set(as(B)).send(body ?? {});
      expect(res.status, `${m} ${path}`).toBe(404);
    }
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name).toBe('Ada');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe('unpaid');
  });

  it('human takeover, reply and hand-back work for the owner (needs a connected number to reply)', async () => {
    expect((await http().post(`/conversations/${conversationId}/messages`).set(as(A)).send({ body: 'Hi Ada' })).status).toBe(400);
    expect((await http().put('/business/whatsapp').set(as(A)).send({ wabaId: 'WABA1', phoneNumberId: `PN-${run}`, displayNumber: '2348000000001', accessToken: 'EAAtesttoken123' })).status).toBe(200);
    // the same number cannot be claimed by another business
    expect((await http().put('/business/whatsapp').set(as(B)).send({ wabaId: 'WABA2', phoneNumberId: `PN-${run}`, displayNumber: '2348000000001', accessToken: 'EAAothertoken123' })).status).toBe(409);
    expect((await http().post(`/conversations/${conversationId}/takeover`).set(as(A))).body.status).toBe('human');
    const sent = await http().post(`/conversations/${conversationId}/messages`).set(as(A)).send({ body: 'Hi Ada' });
    expect(sent.status).toBe(201);
    expect(sent.body.sentBy).toBe('human');
    const detail = await http().get(`/conversations/${conversationId}`).set(as(A));
    expect(detail.body.messages.map((m: { body: string }) => m.body)).toEqual(['hello', 'Hi Ada']);
    expect((await http().post(`/conversations/${conversationId}/handback`).set(as(A))).body.status).toBe('ai');
    // the access token is stored encrypted and never returned
    const biz = (await http().get('/business').set(as(A))).body;
    expect(JSON.stringify(biz)).not.toContain('EAAtesttoken123');
    expect(biz.setup.whatsapp).toBe(true);
  });

  it('refuses to reply once the 24-hour window has closed', async () => {
    await prisma.conversation.update({ where: { id: conversationId }, data: { windowExpiresAt: new Date(Date.now() - 1000) } });
    expect((await http().post(`/conversations/${conversationId}/messages`).set(as(A)).send({ body: 'late' })).status).toBe(409);
    await prisma.conversation.update({ where: { id: conversationId }, data: { windowExpiresAt: new Date(Date.now() + 3600_000) } });
  });

  it('marks an order paid once: stock drops, customer totals update, second call changes nothing', async () => {
    expect((await http().post(`/orders/${orderId}/mark-paid`).set(as(A))).body.paymentStatus).toBe('paid');
    await http().post(`/orders/${orderId}/mark-paid`).set(as(A));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty).toBe(3);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).totalSpentMinor).toBe(2_600_000);
    expect((await http().get(`/orders/${orderId}`).set(as(A))).body.status).toBe('paid');
  });

  it('moves an order through dispatch and delivery, and blocks changes after that', async () => {
    expect((await http().patch(`/orders/${orderId}/status`).set(as(A)).send({ status: 'dispatched' })).status).toBe(200);
    expect((await http().patch(`/orders/${orderId}/status`).set(as(A)).send({ status: 'delivered' })).status).toBe(200);
    expect((await http().patch(`/orders/${orderId}/status`).set(as(A)).send({ status: 'cancelled' })).status).toBe(409);
    expect((await http().patch(`/orders/${orderId}/status`).set(as(A)).send({ status: 'paid' })).status).toBe(400);
  });

  it('reports analytics only for the caller', async () => {
    const a = (await http().get('/analytics/overview?days=7').set(as(A))).body;
    expect(a).toMatchObject({ orders: 1, paidOrders: 1, revenueMinor: 2_600_000, conversations: 1 });
    expect(a.topProducts[0].name).toBe('Party Pack');
    expect(a.series).toHaveLength(7);
    const b = (await http().get('/analytics/overview?days=7').set(as(B))).body;
    expect(b).toMatchObject({ orders: 0, revenueMinor: 0, conversations: 0 });
  });
});

describe('roles and team', () => {
  let agent = {} as Tenant;
  it('owner adds an agent who can work but not change settings or the team', async () => {
    const add = await http().post('/team').set(as(A)).send({ email: `agent-${run}@example.com`, name: 'Agent', password: 'agent-pass-123' });
    expect(add.status).toBe(201);
    const login = await http().post('/auth/login').send({ email: `agent-${run}@example.com`, password: 'agent-pass-123' });
    agent = { token: login.body.token, businessId: A.businessId, userId: add.body.userId, email: `agent-${run}@example.com` };
    expect((await http().get('/products').set(as(agent))).status).toBe(200);
    expect((await http().patch('/business').set(as(agent)).send({ name: 'Pwned Ltd' })).status).toBe(403);
    expect((await http().put('/business/ai-rules').set(as(agent)).send({ maxDiscountPct: 50, escalateKeywords: [], forbiddenTopics: [], customInstructions: null })).status).toBe(403);
    expect((await http().post('/team').set(as(agent)).send({ email: `x-${run}@example.com`, name: 'x', password: 'password-123' })).status).toBe(403);
    expect((await http().get('/business/export').set(as(agent))).status).toBe(403);
    expect((await http().get('/team').set(as(agent))).body).toHaveLength(2);
  });
  it('a removed agent is locked out immediately, even with a still-valid token', async () => {
    expect((await http().delete(`/team/${agent.userId}`).set(as(A))).status).toBe(204);
    expect((await http().get('/products').set(as(agent))).status).toBe(401);
    expect((await http().delete(`/team/${A.userId}`).set(as(A))).status).toBe(400);
  });
  it('owner updates settings and AI rules; the discount cap is bounded', async () => {
    expect((await http().patch('/business').set(as(A)).send({ tone: 'warm', aiEnabled: false })).status).toBe(200);
    const rules = { maxDiscountPct: 5, escalateKeywords: ['refund'], forbiddenTopics: ['politics'], customInstructions: 'Be brief' };
    expect((await http().put('/business/ai-rules').set(as(A)).send(rules)).status).toBe(200);
    expect((await http().put('/business/ai-rules').set(as(A)).send({ ...rules, maxDiscountPct: 90 })).status).toBe(400);
    const biz = (await http().get('/business').set(as(A))).body;
    expect(biz).toMatchObject({ tone: 'warm', aiEnabled: false, aiRules: { maxDiscountPct: 5 } });
    expect((await http().get('/business').set(as(B))).body.aiEnabled).toBe(true);
  });
});

describe('data export and deletion', () => {
  it('exports only the caller\'s data and deletes everything on confirmation', async () => {
    const exp = (await http().get('/business/export').set(as(A))).body;
    expect(exp.business.id).toBe(A.businessId);
    expect(exp.products.length).toBeGreaterThan(0);
    expect(JSON.stringify(exp)).not.toContain(B.businessId);
    expect(JSON.stringify(exp)).not.toContain('accessTokenEncrypted');

    expect((await http().delete('/business').set(as(A)).send({ confirm: 'wrong' })).status).toBe(400);
    const slug = (await http().get('/business').set(as(A))).body.slug;
    expect((await http().delete('/business').set(as(A)).send({ confirm: slug })).status).toBe(204);
    expect((await http().get('/products').set(as(A))).status).toBe(401);
    expect(await prisma.product.count({ where: { businessId: A.businessId } })).toBe(0);
    expect(await prisma.user.count({ where: { id: A.userId } })).toBe(0);
    expect((await http().get('/products').set(as(B))).status).toBe(200); // B untouched
  });
});

describe('any country, any currency', () => {
  const made: string[] = [];
  const signupIn = async (tag: string, country: string, currency: string, city: string, timezone: string) => {
    const res = await http().post('/auth/signup').send({ email: `${tag}-${run}@example.com`, password: 'correct-horse-9', name: 'Owner', businessName: `${tag} shop ${run}`, category: 'retail', city, country, currency, timezone });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    made.push(res.body.business.id);
    return { token: res.body.token, businessId: res.body.business.id, userId: res.body.user.id, email: `${tag}-${run}@example.com` } as Tenant;
  };
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: made } } });
  });

  it('rejects a made-up country, currency or timezone at signup', async () => {
    const base = { email: `bad-${run}@example.com`, password: 'correct-horse-9', name: 'x', businessName: 'Bad Shop', city: 'Accra', country: 'GH', currency: 'GHS' };
    expect((await http().post('/auth/signup').send({ ...base, country: 'XX' })).status).toBe(400);
    expect((await http().post('/auth/signup').send({ ...base, country: 'gh' })).status).toBe(400);
    expect((await http().post('/auth/signup').send({ ...base, currency: 'ZZZ' })).status).toBe(400);
    expect((await http().post('/auth/signup').send({ ...base, timezone: 'Mars/Base' })).status).toBe(400);
    expect((await http().post('/auth/signup').send({ ...base, country: undefined })).status).toBe(400);
  });

  it('stores each business with its own country, currency and timezone', async () => {
    const us = await signupIn('us', 'US', 'USD', 'Austin', 'America/Chicago');
    const jp = await signupIn('jp', 'JP', 'JPY', 'Osaka', 'Asia/Tokyo');
    const gh = await signupIn('gh', 'GH', 'GHS', 'Accra', 'Africa/Accra');
    expect((await http().get('/business').set(as(us))).body).toMatchObject({ country: 'US', currency: 'USD', timezone: 'America/Chicago', city: 'Austin' });
    expect((await http().get('/business').set(as(jp))).body).toMatchObject({ country: 'JP', currency: 'JPY' });
    expect((await http().get('/business').set(as(gh))).body).toMatchObject({ country: 'GH', currency: 'GHS' });
  });

  it('imports CSV prices in the business currency (cents for USD, whole yen for JPY)', async () => {
    const us = await signupIn('usc', 'US', 'USD', 'Austin', 'America/Chicago');
    const jp = await signupIn('jpc', 'JP', 'JPY', 'Osaka', 'Asia/Tokyo');
    const csv = 'name,price,stock\nCoffee,$19.99,5\nTea,3,2\nBad,10.5,1\n';
    const usRes = await http().post('/products/import').set(as(us)).send({ csv });
    expect(usRes.body).toMatchObject({ created: 3, updated: 0 });
    const usList = (await http().get('/products').set(as(us))).body as { name: string; priceMinor: number }[];
    expect(usList.find((p) => p.name === 'Coffee')?.priceMinor).toBe(1999);
    expect(usList.find((p) => p.name === 'Tea')?.priceMinor).toBe(300);
    const jpCsv = 'name,price,stock\nSoba,¥1200,5\nTea,3,2\nBad,10.5,1\n';
    const jpRes = await http().post('/products/import').set(as(jp)).send({ csv: jpCsv });
    expect(jpRes.body.created).toBe(2);
    expect(jpRes.body.errors).toEqual([{ row: 4, message: 'Invalid price "10.5"' }]); // yen have no fractions
    const jpList = (await http().get('/products').set(as(jp))).body as { name: string; priceMinor: number }[];
    expect(jpList.find((p) => p.name === 'Soba')?.priceMinor).toBe(1200); // whole yen, not x100
  });

  it("only lets the currency change while nothing is priced, and never touches another business", async () => {
    const t = await signupIn('lock', 'KE', 'KES', 'Nairobi', 'Africa/Nairobi');
    expect((await http().patch('/business').set(as(t)).send({ currency: 'UGX' })).status).toBe(200); // still empty: fine
    await http().post('/products').set(as(t)).send({ name: 'Maize', priceMinor: 500, stockQty: 1 });
    expect((await http().patch('/business').set(as(t)).send({ currency: 'TZS' })).status).toBe(409);
    expect((await http().patch('/business').set(as(t)).send({ currency: 'UGX' })).status).toBe(200); // same currency is not a change
    expect((await http().patch('/business').set(as(t)).send({ currency: 'NOPE' })).status).toBe(400);
    expect((await http().get('/business').set(as(t))).body.currency).toBe('UGX');
  });
});
