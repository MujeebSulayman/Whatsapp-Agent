import 'reflect-metadata';
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { AppModule } from '../src/app.module.js';
import { GOOGLE_CLIENT, type OidcClient, type SocialProfile } from '../src/auth/google.client.js';
import { INBOUND_QUEUE, REDIS } from '../src/infra.module.js';
import type { Redis } from 'ioredis';

const prisma = createPrisma();
const run = Math.random().toString(36).slice(2, 8);
const profiles: Record<string, SocialProfile> = {};
let configured = true;
const seenUrls: string[] = [];

/** Stands in for Google: no network, profiles are looked up by the "code" the test sends back. */
const fakeGoogle: OidcClient = {
  configured: () => configured,
  authUrl: ({ state, challenge, nonce }) => {
    const u = `https://accounts.example/auth?state=${state}&nonce=${nonce}&code_challenge=${challenge}&code_challenge_method=S256`;
    seenUrls.push(u);
    return u;
  },
  exchange: async ({ code }) => {
    const p = profiles[code];
    if (!p) throw new Error('bad code');
    return p;
  }
};

let app: INestApplication;
let redis: Redis;
const http = () => request(app.getHttpServer());
const emailOf = (tag: string) => `${tag}-${run}@example.com`;
const business = { businessName: 'Social Bakery', category: 'Food & drink', kind: 'goods', city: 'Lagos', country: 'NG', timezone: 'Africa/Lagos' };

async function startState(): Promise<string> {
  const res = await http().get('/auth/google/start');
  expect(res.status).toBe(200);
  return new URL(res.body.url).searchParams.get('state')!;
}
/** Runs start -> Google -> callback, returns the ticket the browser would receive (or the error redirect). */
async function signInWith(code: string): Promise<{ location: string; ticket: string | null }> {
  const state = await startState();
  const cb = await http().get(`/auth/google/callback?code=${code}&state=${state}`);
  expect(cb.status).toBe(302);
  const location = cb.headers.location as string;
  return { location, ticket: new URL(location).searchParams.get('ticket') };
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} })
    .overrideProvider(GOOGLE_CLIENT).useValue(fakeGoogle)
    .compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { contains: `-${run}@example.com` } }, select: { id: true, memberships: { select: { businessId: true } } } });
  await prisma.business.deleteMany({ where: { id: { in: users.flatMap((u) => u.memberships.map((m) => m.businessId)) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
  await app.close();
  redis.disconnect();
});

describe('provider availability', () => {
  it('tells the dashboard which providers are configured, and refuses to start an unconfigured one', async () => {
    expect((await http().get('/auth/providers')).body).toEqual({ google: true });
    configured = false;
    expect((await http().get('/auth/providers')).body).toEqual({ google: false });
    expect((await http().get('/auth/google/start')).status).toBe(404);
    configured = true;
  });
});

describe('start and callback safety', () => {
  it('sends PKCE (S256), a state and a nonce to Google', async () => {
    seenUrls.length = 0;
    await http().get('/auth/google/start');
    const u = new URL(seenUrls[0]!);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')!.length).toBeGreaterThan(30);
    expect(u.searchParams.get('state')!.length).toBeGreaterThan(20);
    expect(u.searchParams.get('nonce')!.length).toBeGreaterThan(20);
  });
  it('redirects to the login page with a message when cancelled, expired or replayed (never an API error)', async () => {
    const cancelled = await http().get('/auth/google/callback?error=access_denied');
    expect([cancelled.status, cancelled.headers.location]).toEqual([302, expect.stringContaining('/login?error=')]);
    const forged = await http().get('/auth/google/callback?code=x&state=never-issued');
    expect(forged.headers.location).toContain('expired');

    profiles['replay-code'] = { sub: `sub-replay-${run}`, email: emailOf('replay'), emailVerified: true, name: 'Replay' };
    const state = await startState();
    expect((await http().get(`/auth/google/callback?code=replay-code&state=${state}`)).headers.location).toContain('/auth/callback?ticket=');
    expect((await http().get(`/auth/google/callback?code=replay-code&state=${state}`)).headers.location).toContain('/login?error=');
  });
  it('fails safely when Google rejects the code, and refuses unverified emails', async () => {
    expect((await signInWith('no-such-code')).location).toContain('/login?error=Google%20sign-in%20failed');
    profiles['unverified'] = { sub: `sub-unv-${run}`, email: emailOf('unverified'), emailVerified: false, name: 'Un Verified' };
    expect((await signInWith('unverified')).location).toContain('not%20verified');
    expect(await prisma.user.count({ where: { email: emailOf('unverified') } })).toBe(0);
  });
});

describe('a new person signs up with Google', () => {
  let ticket = '';
  it('is shown as pending, with the details Google gave us, and no account yet', async () => {
    profiles['new-user'] = { sub: `sub-new-${run}`, email: emailOf('Newbie').toUpperCase(), emailVerified: true, name: 'Nia Newbie' };
    const r = await signInWith('new-user');
    ticket = r.ticket!;
    expect(r.location).toMatch(/^http:\/\/localhost:3000\/auth\/callback\?ticket=/);
    const ex = await http().post('/auth/social/exchange').send({ ticket });
    expect(ex.body).toEqual({ pending: { provider: 'google', email: emailOf('newbie'), name: 'Nia Newbie' } });
    expect(ex.body.token).toBeUndefined();
    expect(await prisma.user.count({ where: { email: emailOf('newbie') } })).toBe(0);
  });
  it('rejects invalid business details without using up the ticket', async () => {
    expect((await http().post('/auth/social/complete').send({ ticket, ...business, country: 'XX' })).status).toBe(400);
    expect((await http().post('/auth/social/complete').send({ ticket, ...business, businessName: 'x' })).status).toBe(400);
  });
  it('creates a password-less owner account with its own isolated business, once', async () => {
    const res = await http().post('/auth/social/complete').send({ ticket, ...business });
    expect(res.status).toBe(201);
    expect(res.body.business).toMatchObject({ country: 'NG', currency: 'NGN', kind: 'goods' });
    const me = await http().get('/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body).toMatchObject({ role: 'owner', user: { email: emailOf('newbie') }, business: { plan: 'trial' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emailOf('newbie') }, include: { identities: true } });
    expect(user.passwordHash).toBeNull();
    expect(user.identities).toMatchObject([{ provider: 'google', subject: `sub-new-${run}` }]);
    // the ticket is single-use
    expect((await http().post('/auth/social/complete').send({ ticket, ...business })).status).toBe(401);
    expect((await http().post('/auth/social/exchange').send({ ticket })).status).toBe(401);
    // an account without a password can't be entered with a guessed one
    expect((await http().post('/auth/login').send({ email: emailOf('newbie'), password: 'anything-at-all-1' })).status).toBe(401);
  });
  it('signs the same person straight back in next time, with no second business', async () => {
    const before = await prisma.business.count({ where: { memberships: { some: { user: { email: emailOf('newbie') } } } } });
    const r = await signInWith('new-user');
    const ex = await http().post('/auth/social/exchange').send({ ticket: r.ticket });
    expect(ex.status).toBe(200);
    expect(ex.body.user.email).toBe(emailOf('newbie'));
    expect((await http().get('/auth/me').set('Authorization', `Bearer ${ex.body.token}`)).status).toBe(200);
    expect(await prisma.business.count({ where: { memberships: { some: { user: { email: emailOf('newbie') } } } } })).toBe(before);
  });
});

describe('a person who already has an email-and-password account', () => {
  it('is signed into that same account and Google is linked to it', async () => {
    const signup = await http().post('/auth/signup').send({ email: emailOf('both'), password: 'correct-horse-9', name: 'Both Ways', ...business, businessName: 'Both Ways Ltd' });
    expect(signup.status).toBe(201);
    profiles['both'] = { sub: `sub-both-${run}`, email: emailOf('both'), emailVerified: true, name: 'Both Ways' };
    const r = await signInWith('both');
    const ex = await http().post('/auth/social/exchange').send({ ticket: r.ticket });
    expect(ex.body.business.id).toBe(signup.body.business.id); // same business, not a new one
    expect(await prisma.authIdentity.count({ where: { subject: `sub-both-${run}` } })).toBe(1);
    // and the password still works
    expect((await http().post('/auth/login').send({ email: emailOf('both'), password: 'correct-horse-9' })).status).toBe(200);
  });
  it('a login ticket works exactly once', async () => {
    const r = await signInWith('both');
    expect((await http().post('/auth/social/exchange').send({ ticket: r.ticket })).status).toBe(200);
    expect((await http().post('/auth/social/exchange').send({ ticket: r.ticket })).status).toBe(401);
  });
  it('rejects garbage tickets', async () => {
    expect((await http().post('/auth/social/exchange').send({ ticket: 'does-not-exist-123456' })).status).toBe(401);
    expect((await http().post('/auth/social/exchange').send({})).status).toBe(400);
    expect((await http().post('/auth/social/complete').send({ ticket: 'does-not-exist-123456', ...business })).status).toBe(401);
  });
});
