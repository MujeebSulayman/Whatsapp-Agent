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
const AGENT = {} as Tenant;
const http = () => request(app.getHttpServer());
const as = (t: Tenant) => ({ Authorization: `Bearer ${t.token}` });
const signup = async (email: string, businessName: string): Promise<Tenant> => {
  const res = await http().post('/auth/signup').send({ email, password: 'correct-horse-9', name: 'Owner', businessName, category: 'education', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' });
  expect(res.status).toBe(201);
  return { token: res.body.token, businessId: res.body.business.id };
};

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  Object.assign(A, await signup(`pa-${run}@example.com`, `Play Alpha ${run}`));
  Object.assign(B, await signup(`pb-${run}@example.com`, `Play Beta ${run}`));
  const add = await http().post('/team').set(as(A)).send({ email: `pagent-${run}@example.com`, name: 'Agent', password: 'agent-pass-123' });
  expect(add.status).toBe(201);
  const login = await http().post('/auth/login').send({ email: `pagent-${run}@example.com`, password: 'agent-pass-123' });
  Object.assign(AGENT, { token: login.body.token, businessId: A.businessId });
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [A.businessId, B.businessId] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(`rl:login:::ffff:127.0.0.1:pa-${run}@example.com`, `rl:login:::ffff:127.0.0.1:pagent-${run}@example.com`);
  await app.close();
  redis.disconnect();
});

const body = { name: 'Quote request', whenToUse: 'Someone wants a price for a job', steps: [{ ask: 'What do you need done?', required: true }, { ask: 'Where is it?' }, { ask: 'Any photos?', required: false }], finish: 'handoff', finishMessage: 'Thanks, we will send a quote.' };

describe('playbooks', () => {
  let id: string;
  it('the owner creates one; steps get stable ids and required defaults to true', async () => {
    const r = await http().post('/playbooks').set(as(A)).send(body);
    expect(r.status).toBe(201);
    id = r.body.id;
    expect(r.body.steps).toEqual([{ id: 's1', ask: 'What do you need done?', required: true }, { id: 's2', ask: 'Where is it?', required: true }, { id: 's3', ask: 'Any photos?', required: false }]);
  });

  it('only owners change playbooks; agents can read them', async () => {
    expect((await http().post('/playbooks').set(as(AGENT)).send(body)).status).toBe(403);
    expect((await http().patch(`/playbooks/${id}`).set(as(AGENT)).send({ active: false })).status).toBe(403);
    expect((await http().delete(`/playbooks/${id}`).set(as(AGENT))).status).toBe(403);
    expect((await http().get('/playbooks').set(as(AGENT))).status).toBe(200);
  });

  it('rejects empty or oversized playbooks', async () => {
    expect((await http().post('/playbooks').set(as(A)).send({ ...body, steps: [] })).status).toBe(400);
    expect((await http().post('/playbooks').set(as(A)).send({ ...body, steps: Array.from({ length: 13 }, (_, i) => ({ ask: `Question ${i}` })) })).status).toBe(400);
    expect((await http().post('/playbooks').set(as(A)).send({ ...body, finish: 'explode' })).status).toBe(400);
  });

  it('editing keeps existing step ids so saved answers still line up', async () => {
    const cur = (await http().get('/playbooks').set(as(A))).body[0];
    const r = await http().patch(`/playbooks/${id}`).set(as(A)).send({ steps: [{ id: 's1', ask: 'What job is it?', required: true }, { ...cur.steps[1] }, { ask: 'Budget?', required: false }] });
    const ids = r.body.steps.map((s: { id: string }) => s.id);
    expect(ids.slice(0, 2)).toEqual(['s1', 's2']);
    expect(ids[2]).toMatch(/^s[a-z0-9]{5}$/);
    expect(ids[2]).not.toBe('s3'); // the removed step's id is never reused
  });

  it('a business cannot see, change or delete another business’s playbook', async () => {
    expect((await http().get('/playbooks').set(as(B))).body).toEqual([]);
    expect((await http().patch(`/playbooks/${id}`).set(as(B)).send({ name: 'Hacked' })).status).toBe(404);
    expect((await http().delete(`/playbooks/${id}`).set(as(B))).status).toBe(404);
  });

  it('shows what customers answered, matched to the questions', async () => {
    const c = await prisma.customer.create({ data: { businessId: A.businessId, waId: `234${Math.floor(Math.random() * 1e9)}`, name: 'Ada' } });
    await prisma.playbookRun.create({ data: { businessId: A.businessId, playbookId: id, customerId: c.id, status: 'completed', completedAt: new Date(), answers: { s1: 'Paint two rooms', s2: 'Lekki' } } });
    const r = await http().get('/playbooks/responses').set(as(A));
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ status: 'completed', playbook: { name: 'Quote request' }, customer: { name: 'Ada' } });
    expect(r.body[0].answers).toEqual([{ ask: 'What job is it?', answer: 'Paint two rooms' }, { ask: 'Where is it?', answer: 'Lekki' }, { ask: 'Budget?', answer: null }]);
    expect((await http().get('/playbooks/responses').set(as(B))).body).toEqual([]);
  });

  it('deleting removes it and its responses', async () => {
    expect((await http().delete(`/playbooks/${id}`).set(as(A))).status).toBe(204);
    expect(await prisma.playbookRun.count({ where: { businessId: A.businessId } })).toBe(0);
  });

  it('allows at most 10 playbooks per business', async () => {
    for (let i = 0; i < 10; i++) expect((await http().post('/playbooks').set(as(A)).send({ ...body, name: `Flow ${i}` })).status).toBe(201);
    expect((await http().post('/playbooks').set(as(A)).send(body)).status).toBe(409);
  });
});
