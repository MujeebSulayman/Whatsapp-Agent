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
// A real 1x1 JPEG (starts with the JPEG signature) and a text file pretending to be one.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF'), Buffer.alloc(40, 1)]);
const jpegUrl = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
const fakeUrl = `data:image/jpeg;base64,${Buffer.from('<script>alert(1)</script> not an image').toString('base64')}`;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  Object.assign(A, await signup(`ma-${run}@example.com`, `Media Alpha ${run}`));
  Object.assign(B, await signup(`mb-${run}@example.com`, `Media Beta ${run}`));
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [A.businessId, B.businessId] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:ma-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

describe('photos', () => {
  let url: string;
  it('needs a login to upload, and rejects anything that is not really an image', async () => {
    expect((await http().post('/media').send({ data: jpegUrl })).status).toBe(401);
    expect((await http().post('/media').set(as(A)).send({ data: fakeUrl })).status).toBe(400);
    expect((await http().post('/media').set(as(A)).send({ data: 'data:text/html;base64,PGI+' })).status).toBe(400);
    const big = `data:image/jpeg;base64,${Buffer.concat([JPEG, Buffer.alloc(450_000)]).toString('base64')}`;
    expect((await http().post('/media').set(as(A)).send({ data: big })).status).toBeGreaterThanOrEqual(400); // 413 from the body limit or 400 from our own size check
  });

  it('stores a photo and serves it publicly with the right type and long caching', async () => {
    const up = await http().post('/media').set(as(A)).send({ data: jpegUrl });
    expect(up.status).toBe(201);
    url = up.body.url;
    const got = await http().get(url); // no login: WhatsApp fetches it this way
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['cache-control']).toMatch(/immutable/);
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(got.body).equals(JPEG)).toBe(true);
    expect((await http().get('/media/doesnotexistdoesnotexist1')).status).toBe(404);
  });

  it('a product can use its own photos but not another business’s', async () => {
    const mine = await http().post('/products').set(as(A)).send({ name: 'Tee', priceMinor: 100, stockQty: 1, imageUrls: [url], variants: [{ name: 'Red', image: url }] });
    expect(mine.status).toBe(201);
    const theirs = await http().post('/products').set(as(B)).send({ name: 'Steal', priceMinor: 100, stockQty: 1, imageUrls: [url] });
    expect(theirs.status).toBe(400);
    expect((await http().post('/products').set(as(B)).send({ name: 'Bad', priceMinor: 100, stockQty: 1, imageUrls: ['javascript:alert(1)'] })).status).toBe(400);
  });

  it('removing a photo from a product deletes it from storage; deleting the product deletes the rest', async () => {
    const up2 = (await http().post('/media').set(as(A)).send({ data: jpegUrl })).body.url as string;
    const p = (await http().post('/products').set(as(A)).send({ name: 'Cap', priceMinor: 100, stockQty: 1, imageUrls: [up2] })).body;
    const id = up2.split('/').pop()!;
    await http().patch(`/products/${p.id}`).set(as(A)).send({ imageUrls: [] });
    expect(await prisma.media.count({ where: { id } })).toBe(0);
    const up3 = (await http().post('/media').set(as(A)).send({ data: jpegUrl })).body.url as string;
    const q = (await http().post('/products').set(as(A)).send({ name: 'Hat', priceMinor: 100, stockQty: 1, imageUrls: [up3] })).body;
    await http().delete(`/products/${q.id}`).set(as(A));
    expect(await prisma.media.count({ where: { id: up3.split('/').pop()! } })).toBe(0);
  });
});
