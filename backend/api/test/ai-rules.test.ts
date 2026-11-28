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
let owner = '';
let agent = '';
let businessId = '';
const http = () => request(app.getHttpServer());
const rules = { maxDiscountPct: 5, escalateKeywords: ['refund'], forbiddenTopics: [], customInstructions: null };

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  const su = await http().post('/auth/signup').send({ email: `ar-${run}@example.com`, password: 'correct-horse-9', name: 'Owner', businessName: `AR ${run}`, category: 'fashion', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' });
  owner = su.body.token; businessId = su.body.business.id;
  await http().post('/team').set('Authorization', `Bearer ${owner}`).send({ email: `ar-agent-${run}@example.com`, name: 'Agent', password: 'agent-pass-123' });
  agent = (await http().post('/auth/login').send({ email: `ar-agent-${run}@example.com`, password: 'agent-pass-123' })).body.token;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:ar-${run}@example.com`, `rl:login:::ffff:127.0.0.1:ar-agent-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

describe('"try once to keep a customer who says no"', () => {
  const put = (token: string, body: object) => http().put('/business/ai-rules').set('Authorization', `Bearer ${token}`).send(body);

  it('is on unless the owner turns it off, and saving other rules does not change it', async () => {
    expect((await put(owner, rules)).body.keepCustomers).toBe(true);
    expect((await put(owner, { ...rules, keepCustomers: false })).body.keepCustomers).toBe(false);
    expect((await put(owner, { ...rules, maxDiscountPct: 10 })).body).toMatchObject({ keepCustomers: false, maxDiscountPct: 10 }); // left alone when not sent
    expect((await http().get('/business').set('Authorization', `Bearer ${owner}`)).body.aiRules.keepCustomers).toBe(false);
    expect((await put(owner, { ...rules, keepCustomers: true })).body.keepCustomers).toBe(true);
  });

  it('only the owner can change it, and it must be a yes or no', async () => {
    expect((await put(agent, { ...rules, keepCustomers: false })).status).toBe(403);
    expect((await put(owner, { ...rules, keepCustomers: 'maybe' })).status).toBe(400);
  });
});
