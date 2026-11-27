import 'reflect-metadata';
import { config } from 'dotenv';
config({ path: new URL('../../../.env', import.meta.url).pathname });
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { INBOUND_QUEUE, PRISMA } from '../src/infra.module.js';
import { WhatsappController } from '../src/webhooks/whatsapp.controller.js';
import { WhatsappService } from '../src/webhooks/whatsapp.service.js';

const SECRET = 'test-app-secret';
const fixturePath = new URL('../../tests/fixtures/whatsapp-text.json', import.meta.url);
const raw = readFileSync(fixturePath, 'utf8');
const sign = (body: string) => 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

const prisma = createPrisma();
const jobs: { data: { waMessageId: string; businessId: string } }[] = [];
let app: INestApplication;
let businessId = '';

beforeAll(async () => {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
  await prisma.business.deleteMany({ where: { slug: 'webhook-test' } });
  const b = await prisma.business.create({
    data: {
      name: 'Webhook Test', slug: 'webhook-test', category: 'x',
      whatsappAccounts: { create: { wabaId: 'W', phoneNumberId: 'PNID1', displayNumber: '2348000000000', accessTokenEncrypted: 'x' } }
    }
  });
  businessId = b.id;
  const mod = await Test.createTestingModule({
    controllers: [WhatsappController],
    providers: [
      WhatsappService,
      { provide: PRISMA, useValue: prisma },
      { provide: INBOUND_QUEUE, useValue: { add: async (_n: string, data: never) => void jobs.push({ data }) } }
    ]
  }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
});

beforeEach(async () => {
  jobs.length = 0;
  await prisma.message.deleteMany({ where: { businessId } });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: 'webhook-test' } });
  await prisma.$disconnect();
  await app.close();
});

describe('GET /webhooks/whatsapp (verify)', () => {
  it('echoes the challenge with the right token', async () => {
    const res = await request(app.getHttpServer()).get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1234');
    expect(res.status).toBe(200);
    expect(res.text).toBe('1234');
  });
  it('rejects a wrong token', async () => {
    const res = await request(app.getHttpServer()).get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1');
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/whatsapp', () => {
  const post = (body: string, sig?: string) =>
    request(app.getHttpServer()).post('/webhooks/whatsapp').set('Content-Type', 'application/json')
      .set(sig ? { 'x-hub-signature-256': sig } : {}).send(body);

  it('rejects a missing or wrong signature and queues nothing', async () => {
    expect((await post(raw)).status).toBe(401);
    expect((await post(raw, 'sha256=deadbeef')).status).toBe(401);
    expect(jobs).toHaveLength(0);
  });

  it('accepts a signed message: stores it and queues one job', async () => {
    const res = await post(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.data.businessId).toBe(businessId);
    expect(await prisma.message.count({ where: { businessId, waMessageId: 'wamid.FIXTURE1' } })).toBe(1);
  });

  it('is idempotent when Meta retries the same message', async () => {
    await post(raw, sign(raw));
    await post(raw, sign(raw));
    expect(jobs).toHaveLength(1);
    expect(await prisma.message.count({ where: { businessId } })).toBe(1);
  });

  it('ignores messages for an unknown phone_number_id', async () => {
    const other = raw.replace('PNID1', 'UNKNOWN');
    expect((await post(other, sign(other))).status).toBe(200);
    expect(jobs).toHaveLength(0);
  });
});
