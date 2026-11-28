import 'reflect-metadata';
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { AppModule } from '../src/app.module.js';
import { EmbeddingService } from '../src/common/embedding.js';
import { INBOUND_QUEUE, REDIS } from '../src/infra.module.js';
import type { Redis } from 'ioredis';

const prisma = createPrisma();
const run = Math.random().toString(36).slice(2, 8);
let app: INestApplication;
let redis: Redis;
type Tenant = { token: string; businessId: string };
const A = {} as Tenant;
const B = {} as Tenant;
const SPA = {} as Tenant;
const http = () => request(app.getHttpServer());
const as = (t: Tenant) => ({ Authorization: `Bearer ${t.token}` });
const signup = async (tag: string, over: Record<string, unknown> = {}): Promise<Tenant> => {
  const res = await http().post('/auth/signup').send({ email: `${tag}-${run}@example.com`, password: 'correct-horse-9', name: 'Owner', businessName: `${tag} ${run}`, category: 'food', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos', ...over });
  expect(res.status).toBe(201);
  return { token: res.body.token, businessId: res.body.business.id };
};
const byName = (t: Tenant, name: string) => prisma.product.findFirstOrThrow({ where: { businessId: t.businessId, name } });

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).overrideProvider(EmbeddingService).useValue({ indexProducts: () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  Object.assign(A, await signup('su-a'));
  Object.assign(B, await signup('su-b'));
  Object.assign(SPA, await signup('su-spa', { category: 'Beauty & wellness', kind: 'services' }));
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [A.businessId, B.businessId, SPA.businessId] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:su-a-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

describe('items with no stock number are always available', () => {
  it('photo/paste import without stock numbers never makes items "sold out"', async () => {
    const r = await http().post('/setup-ai/apply').set(as(A)).send({ products: [{ name: 'Rice (50kg)', priceMinor: 8500000 }, { name: 'Bread', priceMinor: 200000, stockQty: null }] });
    expect(r.status).toBe(200);
    expect(await byName(A, 'Rice (50kg)')).toMatchObject({ trackStock: false, stockQty: 0 });
    expect(await byName(A, 'Bread')).toMatchObject({ trackStock: false });
  });

  it('a stock number the owner typed does count the item', async () => {
    await http().post('/setup-ai/apply').set(as(A)).send({ products: [{ name: 'Eggs (Crate)', priceMinor: 650000, stockQty: 4 }] });
    expect(await byName(A, 'Eggs (Crate)')).toMatchObject({ trackStock: true, stockQty: 4 });
  });

  it('re-importing a price list without numbers does not wipe stock the owner already entered', async () => {
    await http().post('/setup-ai/apply').set(as(A)).send({ products: [{ name: 'Eggs (Crate)', priceMinor: 700000 }] });
    expect(await byName(A, 'Eggs (Crate)')).toMatchObject({ trackStock: true, stockQty: 4, priceMinor: 700000 });
  });

  it('services never count stock, even when a number is sent', async () => {
    await http().post('/setup-ai/apply').set(as(SPA)).send({ products: [{ name: 'Full body massage', priceMinor: 2500000, stockQty: 5 }] });
    expect(await byName(SPA, 'Full body massage')).toMatchObject({ trackStock: false });
  });

  it('CSV: a blank stock cell means not counted, a number counts', async () => {
    const csv = 'name,description,price,stock,variants\nGarri (10kg),,18000,,\nBeans (25kg),,48000,6,\n';
    const r = await http().post('/products/import').set(as(A)).send({ csv });
    expect(r.body.errors).toEqual([]);
    expect(await byName(A, 'Garri (10kg)')).toMatchObject({ trackStock: false });
    expect(await byName(A, 'Beans (25kg)')).toMatchObject({ trackStock: true, stockQty: 6 });
  });

  it('"stop counting these" only changes this business’s own items', async () => {
    const mine = await prisma.product.create({ data: { businessId: A.businessId, name: 'Counted', priceMinor: 100, stockQty: 0, trackStock: true } });
    const theirs = await prisma.product.create({ data: { businessId: B.businessId, name: 'Theirs', priceMinor: 100, stockQty: 0, trackStock: true } });
    const r = await http().post('/products/stop-tracking').set(as(A)).send({ ids: [mine.id, theirs.id] });
    expect(r.body).toEqual({ updated: 1 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: mine.id } })).trackStock).toBe(false);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: theirs.id } })).trackStock).toBe(true);
    expect((await http().post('/products/stop-tracking').set(as(A)).send({ ids: [] })).status).toBe(400);
  });
});
