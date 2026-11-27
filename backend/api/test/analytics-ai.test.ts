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
let token = '';
let businessId = '';

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  const res = await request(app.getHttpServer()).post('/auth/signup').send({ email: `an-${run}@example.com`, password: 'correct-horse-9', name: 'Owner', businessName: `An ${run}`, category: 'fashion', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' });
  token = res.body.token; businessId = res.body.business.id;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:an-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

describe('analytics: what the AI did', () => {
  it('counts only replies to customers, never the owner’s own setup help or practice chats, and never shows what it costs', async () => {
    const mk = (kind: string) => prisma.agentRun.create({ data: { businessId, kind, model: 'm', inputTokens: 10, outputTokens: 5, costUsd: 0.5, toolCalls: [], latencyMs: 1 } });
    await mk('setup'); await mk('preview'); await mk('preview');
    expect((await request(app.getHttpServer()).get('/analytics/overview?days=30').set('Authorization', `Bearer ${token}`)).body.aiRuns).toBe(0);
    await mk('chat'); await mk('chat');
    const r = await request(app.getHttpServer()).get('/analytics/overview?days=30').set('Authorization', `Bearer ${token}`);
    expect(r.body.aiRuns).toBe(2);
    expect(JSON.stringify(r.body)).not.toMatch(/cost/i);
  });
});
