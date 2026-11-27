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
type Tenant = { token: string; businessId: string };
const A = {} as Tenant;
const B = {} as Tenant;
const http = () => request(app.getHttpServer());
const as = (t: Tenant) => ({ Authorization: `Bearer ${t.token}` });
const signup = async (email: string, businessName: string): Promise<Tenant> => {
  const res = await http().post('/auth/signup').send({ email, password: 'correct-horse-9', name: 'Owner', businessName, category: 'fashion', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' });
  expect(res.status).toBe(201);
  return { token: res.body.token, businessId: res.body.business.id };
};

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  process.env.WHATSAPP_DRY_RUN = 'true';
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = 'e'.repeat(64);
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  Object.assign(A, await signup(`sa-${run}@example.com`, `Stock Alpha ${run}`));
  Object.assign(B, await signup(`sb-${run}@example.com`, `Stock Beta ${run}`));
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [A.businessId, B.businessId] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:sa-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

describe('stock per size', () => {
  let shoeId: string;

  it('saves stock per size and makes the product total the sum', async () => {
    const r = await http().post('/products').set(as(A)).send({ name: 'Runner', priceMinor: 4500000, stockQty: 0, variants: [{ name: '42', stockQty: 2 }, { name: '43', stockQty: 0 }], restockNote: 'Back in 2 weeks', allowPreorder: true });
    expect(r.status).toBe(201);
    shoeId = r.body.id;
    expect(r.body).toMatchObject({ stockQty: 2, restockNote: 'Back in 2 weeks', allowPreorder: true });
  });

  it('rejects half-filled or duplicate sizes', async () => {
    const half = await http().post('/products').set(as(A)).send({ name: 'Bad', priceMinor: 100, stockQty: 1, variants: [{ name: 'S', stockQty: 1 }, { name: 'M' }] });
    expect(half.status).toBe(400);
    const dup = await http().post('/products').set(as(A)).send({ name: 'Bad2', priceMinor: 100, stockQty: 1, variants: [{ name: 'S' }, { name: 's' }] });
    expect(dup.status).toBe(400);
  });

  it('taking payment reduces that size only, and not a pre-order line', async () => {
    const cust = await prisma.customer.create({ data: { businessId: A.businessId, waId: `234${Math.floor(Math.random() * 1e9)}` } });
    const mk = (items: object[]) => prisma.order.create({ data: { businessId: A.businessId, customerId: cust.id, items: items as never, subtotalMinor: 1, totalMinor: 1 } });
    const o = await mk([{ product_id: shoeId, name: 'Runner', variant: '42', quantity: 1, unit_price_minor: 1, line_total_minor: 1 }]);
    expect((await http().post(`/orders/${o.id}/mark-paid`).set(as(A))).status).toBe(200);
    let p = await prisma.product.findFirstOrThrow({ where: { id: shoeId } });
    expect(p.stockQty).toBe(1);
    expect((p.variants as { name: string; stockQty: number }[]).map((v) => `${v.name}:${v.stockQty}`)).toEqual(['42:1', '43:0']);
    const pre = await mk([{ product_id: shoeId, name: 'Runner', variant: '43', quantity: 1, unit_price_minor: 1, line_total_minor: 1, preorder: true }]);
    await http().post(`/orders/${pre.id}/mark-paid`).set(as(A));
    p = await prisma.product.findFirstOrThrow({ where: { id: shoeId } });
    expect(p.stockQty).toBe(1);
  });

  describe('waitlist', () => {
    let customerId: string;
    let conversationId: string;
    beforeAll(async () => {
      const c = await prisma.customer.create({ data: { businessId: A.businessId, waId: `234${Math.floor(Math.random() * 1e9)}`, name: 'Ada' } });
      customerId = c.id;
      conversationId = (await prisma.conversation.create({ data: { businessId: A.businessId, customerId, windowExpiresAt: new Date(Date.now() + 3600_000) } })).id;
      await prisma.whatsappAccount.create({ data: { businessId: A.businessId, wabaId: 'w', phoneNumberId: `pn-${run}`, displayNumber: '+234', accessTokenEncrypted: 'x' } });
      await prisma.waitlistEntry.create({ data: { businessId: A.businessId, productId: shoeId, variant: '43', customerId } });
    });

    it('lists who is waiting for what, and that it cannot be sent yet', async () => {
      const r = await http().get('/waitlist').set(as(A));
      expect(r.body).toHaveLength(1);
      expect(r.body[0]).toMatchObject({ name: 'Runner', variant: '43', inStock: false });
      expect(r.body[0].people[0]).toMatchObject({ name: 'Ada' });
      expect((await http().get('/waitlist').set(as(B))).body).toEqual([]); // another business sees nothing
    });

    it('notifies nobody while it is still sold out', async () => {
      const r = await http().post('/waitlist/notify').set(as(A)).send({ productId: shoeId, variant: '43' });
      expect(r.body).toEqual({ notified: 0, outsideWindow: 0 });
    });

    it('after restocking, the update says how many are waiting, and notifying messages them once', async () => {
      const upd = await http().patch(`/products/${shoeId}`).set(as(A)).send({ variants: [{ name: '42', stockQty: 1 }, { name: '43', stockQty: 5 }] });
      expect(upd.body).toMatchObject({ stockQty: 6, waitingNow: 1 });
      const r = await http().post('/waitlist/notify').set(as(A)).send({ productId: shoeId, variant: '43' });
      expect(r.body).toEqual({ notified: 1, outsideWindow: 0 });
      const msg = await prisma.message.findFirstOrThrow({ where: { conversationId } });
      expect(msg.body).toMatch(/Runner \(43\) is back in stock/);
      expect((await http().post('/waitlist/notify').set(as(A)).send({ productId: shoeId, variant: '43' })).body).toEqual({ notified: 0, outsideWindow: 0 });
      expect((await http().get('/waitlist').set(as(A))).body).toEqual([]);
    });

    it('leaves people outside the 24-hour window on the list and says so', async () => {
      await prisma.conversation.update({ where: { id: conversationId }, data: { windowExpiresAt: new Date(Date.now() - 1000) } });
      await prisma.waitlistEntry.create({ data: { businessId: A.businessId, productId: shoeId, variant: '43', customerId } });
      const r = await http().post('/waitlist/notify').set(as(A)).send({ productId: shoeId, variant: '43' });
      expect(r.body).toEqual({ notified: 0, outsideWindow: 1 });
      const list = (await http().get('/waitlist').set(as(A))).body;
      expect(list[0].people).toHaveLength(1);
      const del = await http().delete(`/waitlist/${list[0].people[0].id}`).set(as(A));
      expect(del.status).toBe(204);
      expect((await http().delete(`/waitlist/${list[0].people[0].id}`).set(as(A))).status).toBe(404);
    });

    it('cannot notify or remove another business’s waitlist', async () => {
      expect((await http().post('/waitlist/notify').set(as(B)).send({ productId: shoeId })).status).toBe(404);
    });
  });
});
