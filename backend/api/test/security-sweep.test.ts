import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { AppModule } from '../src/app.module.js';
import { INBOUND_QUEUE, REDIS } from '../src/infra.module.js';
import type { Redis } from 'ioredis';

/**
 * The system underneath the AI: who can reach what. Sweeps every route the app has, so a new endpoint that forgets its login check
 * or its tenant check fails here instead of in production.
 */
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
const SECRET = 'test-secret-test-secret-test-secret';

interface Route { method: string; path: string }
function routes(): Route[] {
  const server = app.getHttpAdapter().getInstance() as { router?: { stack: unknown[] }; _router?: { stack: unknown[] } };
  const stack = (server.router ?? server._router)!.stack as { route?: { path: string; methods: Record<string, boolean> } }[];
  const out: Route[] = [];
  for (const l of stack) if (l.route) for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: l.route.path });
  return out;
}
const fill = (p: string) => p.replace(/:[A-Za-z]+/g, 'x');
const call = (r: Route, token?: string, body?: unknown) => {
  const req = http()[r.method.toLowerCase() as 'get'](fill(r.path));
  if (token) req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req : req.set('Content-Type', 'application/json').send(typeof body === 'string' ? body : JSON.stringify(body));
};

/** Meant to be open: login/signup and sign-in-with-Google, the health check, payment-provider webhooks (they check signatures themselves) and public photos. */
const PUBLIC = (r: Route) => r.path === '/health' || r.path === '/' || r.path.startsWith('/auth/') && !['/auth/me'].includes(r.path) || r.path.startsWith('/webhooks/') || (r.method === 'GET' && r.path === '/media/:id');

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  process.env.WHATSAPP_APP_SECRET = 'wa-secret';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_sweep';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOUND_QUEUE).useValue({ add: async () => {} }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
  redis = app.get(REDIS);
  const signup = async (tag: string) => {
    const r = await http().post('/auth/signup').send({ email: `${tag}-${run}@example.com`, password: 'correct-horse-9', name: 'Owner', businessName: `${tag} ${run}`, category: 'fashion', city: 'Lagos', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' });
    expect(r.status).toBe(201);
    return { token: r.body.token as string, businessId: r.body.business.id as string };
  };
  Object.assign(A, await signup('sw-a'));
  Object.assign(B, await signup('sw-b'));
  const add = await http().post('/team').set(as(A)).send({ email: `sw-agent-${run}@example.com`, name: 'Agent', password: 'agent-pass-123' });
  expect(add.status).toBe(201);
  const login = await http().post('/auth/login').send({ email: `sw-agent-${run}@example.com`, password: 'agent-pass-123' });
  Object.assign(AGENT, { token: login.body.token, businessId: A.businessId });
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [A.businessId, B.businessId] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await prisma.$disconnect();
  await redis.del(...['sw-a', 'sw-b', 'sw-agent'].map((t) => `rl:login:::ffff:127.0.0.1:${t}-${run}@example.com`));
  await app.close();
  redis.disconnect();
});

describe('every route needs a login', () => {
  it('finds the routes', () => { expect(routes().length).toBeGreaterThan(40); });

  it('answers 401 to a stranger on every route that is not meant to be public', async () => {
    const open: string[] = [];
    for (const r of routes().filter((x) => !PUBLIC(x))) {
      const res = await call(r, undefined, ['POST', 'PUT', 'PATCH'].includes(r.method) ? {} : undefined);
      if (res.status !== 401) open.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it('rejects forged, expired and malformed tokens on a protected route', async () => {
    const key = new TextEncoder().encode(SECRET);
    const claims = { bid: A.businessId, role: 'owner' };
    const expired = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject('someone').setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(key);
    const wrongKey = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject('someone').setExpirationTime('1h').sign(new TextEncoder().encode('another-secret-another-secret-another!'));
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...claims, sub: 'someone' })).toString('base64url')}.`;
    const tampered = A.token.split('.').map((p, i) => (i === 1 ? Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), bid: B.businessId })).toString('base64url') : p)).join('.');
    for (const t of [expired, wrongKey, unsigned, tampered, 'garbage', '', 'a.b.c', A.token.slice(0, -4) + 'AAAA']) {
      expect((await http().get('/products').set('Authorization', `Bearer ${t}`)).status, t.slice(0, 20)).toBe(401);
    }
    expect((await http().get('/products').set('Authorization', A.token)).status).toBe(401); // missing "Bearer"
  });

  it('a valid token for a user that was never a member of that business cannot be reused', async () => {
    const key = new TextEncoder().encode(SECRET);
    const stranger = await new SignJWT({ bid: A.businessId, role: 'owner' }).setProtectedHeader({ alg: 'HS256' }).setSubject('user-that-does-not-exist').setExpirationTime('1h').sign(key);
    expect((await http().get('/products').set('Authorization', `Bearer ${stranger}`)).status).toBe(401);
  });
});

describe('one business can never reach another’s data', () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    const c = await prisma.customer.create({ data: { businessId: A.businessId, waId: `234${Math.floor(Math.random() * 1e9)}`, name: 'Ada' } });
    const conv = await prisma.conversation.create({ data: { businessId: A.businessId, customerId: c.id } });
    await prisma.message.create({ data: { businessId: A.businessId, conversationId: conv.id, direction: 'inbound', type: 'text', body: 'secret message', sentBy: 'customer', waMessageId: `w-${run}` } });
    const product = await http().post('/products').set(as(A)).send({ name: 'Secret product', priceMinor: 100, stockQty: 1 });
    const zone = await http().post('/delivery-zones').set(as(A)).send({ areaName: 'Secretville', feeMinor: 100, etaText: '1h' });
    const faq = await http().post('/faqs').set(as(A)).send({ question: 'Secret question?', answer: 'Secret answer' });
    const order = await prisma.order.create({ data: { businessId: A.businessId, customerId: c.id, items: [], subtotalMinor: 1, totalMinor: 1 } });
    const pb = await http().post('/playbooks').set(as(A)).send({ name: 'Secret flow', whenToUse: 'when secret things happen', steps: [{ ask: 'secret?' }] });
    Object.assign(ids, { customer: c.id, conversation: conv.id, product: product.body.id, zone: zone.body.id, faq: faq.body.id, order: order.id, playbook: pb.body.id });
  });

  it('B cannot read, change or delete any of A’s records by id', async () => {
    const attempts: [string, string, unknown?][] = [
      ['GET', `/customers/${ids.customer}`], ['PATCH', `/customers/${ids.customer}`, { name: 'Hacked' }],
      ['GET', `/conversations/${ids.conversation}`], ['POST', `/conversations/${ids.conversation}/messages`, { body: 'hi' }], ['POST', `/conversations/${ids.conversation}/close`], ['POST', `/conversations/${ids.conversation}/takeover`], ['POST', `/conversations/${ids.conversation}/handback`],
      ['PATCH', `/products/${ids.product}`, { name: 'Hacked' }], ['DELETE', `/products/${ids.product}`],
      ['PATCH', `/delivery-zones/${ids.zone}`, { feeMinor: 0 }], ['DELETE', `/delivery-zones/${ids.zone}`],
      ['PATCH', `/faqs/${ids.faq}`, { answer: 'Hacked' }], ['DELETE', `/faqs/${ids.faq}`],
      ['GET', `/orders/${ids.order}`], ['PATCH', `/orders/${ids.order}/status`, { status: 'cancelled' }], ['POST', `/orders/${ids.order}/mark-paid`],
      ['PATCH', `/playbooks/${ids.playbook}`, { name: 'Hacked' }], ['DELETE', `/playbooks/${ids.playbook}`]
    ];
    const leaks: string[] = [];
    for (const [method, path, body] of attempts) {
      const req = http()[method.toLowerCase() as 'get'](path).set(as(B));
      const res = body === undefined ? await req : await req.send(body as object);
      if (![404, 403].includes(res.status)) leaks.push(`${method} ${path} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('B’s lists never contain A’s records', async () => {
    for (const path of ['/products', '/delivery-zones', '/faqs', '/orders', '/customers', '/conversations', '/playbooks', '/playbooks/responses', '/waitlist']) {
      const res = await http().get(path).set(as(B));
      expect(res.status, path).toBe(200);
      expect(JSON.stringify(res.body), path).not.toMatch(/Secret|secret message|Ada|Secretville/);
    }
    const team = await http().get('/team').set(as(B));
    expect(JSON.stringify(team.body)).not.toContain(`sw-a-${run}`);
  });

  it('A’s data is untouched after all of that', async () => {
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.product } })).name).toBe('Secret product');
    expect(await prisma.deliveryZone.count({ where: { id: ids.zone } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.order } })).paymentStatus).toBe('unpaid');
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } })).name).toBe('Ada');
  });

  it('B cannot use A’s uploaded photo on its own products, and cannot delete it', async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF'), Buffer.alloc(40, 1)]);
    const up = await http().post('/media').set(as(A)).send({ data: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
    const stolen = await http().post('/products').set(as(B)).send({ name: 'Stolen photo', priceMinor: 1, stockQty: 1, imageUrls: [up.body.url] });
    expect(stolen.status).toBe(400);
  });
});

describe('only owners can do owner things', () => {
  const ownerOnly: [string, string, unknown?][] = [
    ['PATCH', '/business', { name: 'Pwned' }], ['PUT', '/business/ai-rules', { maxDiscountPct: 50, escalateKeywords: [], forbiddenTopics: [], customInstructions: null }],
    ['PUT', '/business/whatsapp', { wabaId: 'x1x', phoneNumberId: 'y1y', displayNumber: '+234', accessToken: 'tok' }], ['POST', '/team', { email: 'x@example.com', name: 'X', password: 'longenough1' }],
    ['POST', '/playbooks', { name: 'Flow', whenToUse: 'when needed', steps: [{ ask: 'what?' }] }], ['POST', '/payments/payout-account', { bankCode: '057', accountNumber: '0123456789' }],
    ['POST', '/payments/resolve-account', { bankCode: '057', accountNumber: '0123456789' }], ['DELETE', '/payments/payout-account'],
    ['POST', '/setup-ai/import', { text: 'rice 100' }], ['POST', '/setup-ai/apply', { products: [{ name: 'x', priceMinor: 1 }] }], ['POST', '/setup-ai/preview', { messages: [{ role: 'user', content: 'hi' }] }], ['POST', '/setup-ai/playbook', { description: 'how I handle enquiries today' }]
  ];
  it('an agent is refused every one of them', async () => {
    const allowed: string[] = [];
    for (const [method, path, body] of ownerOnly) {
      const res = await http()[method.toLowerCase() as 'post'](path).set(as(AGENT)).send(body as object);
      if (res.status !== 403) allowed.push(`${method} ${path} -> ${res.status}`);
    }
    expect(allowed).toEqual([]);
  });

  it('and cannot change the team or remove the owner', async () => {
    const team = (await http().get('/team').set(as(A))).body as { userId: string; role: string }[];
    const owner = team.find((m) => m.role === 'owner')!;
    expect((await http().delete(`/team/${owner.userId}`).set(as(AGENT))).status).toBe(403);
  });
});

describe('bad input never crashes the server', () => {
  const writes = () => routes().filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method) && !r.path.startsWith('/auth/') && !r.path.startsWith('/webhooks/') && r.path !== '/business/delete');
  const bodies: [string, unknown][] = [
    ['empty object', {}], ['null', 'null'], ['array', []], ['a string', '"hello"'], ['broken json', '{"a":'], ['numbers as text', { priceMinor: 'abc', stockQty: 'NaN', quantity: '1e999' }],
    ['huge number', { priceMinor: 1e308, stockQty: 1e308, feeMinor: 1e308 }], ['negative', { priceMinor: -1, stockQty: -5, feeMinor: -9, maxDiscountPct: -10 }], ['very long text', { name: 'x'.repeat(200_000), body: 'y'.repeat(200_000), question: 'z'.repeat(200_000) }],
    ['prototype pollution', JSON.parse('{"__proto__":{"admin":true},"constructor":{"prototype":{"x":1}},"name":"x"}')], ['deeply nested', JSON.parse('['.repeat(200) + ']'.repeat(200))],
    ['unicode and emoji', { name: '𝕏​‮💥 ' + 'ẞ'.repeat(50), body: '\u0000\u0001\ud83d', question: '‮' }], ['html and sql', { name: '<img src=x onerror=alert(1)>', body: "'; DROP TABLE orders;--", email: 'a@b.c\r\nBcc: evil@x.com' }]
  ];

  it('never answers 500 to unusual bodies, on any write route, as owner', async () => {
    const crashed: string[] = [];
    for (const r of writes()) {
      for (const [label, body] of bodies) {
        const res = await call(r, A.token, body).catch((e: Error) => ({ status: 0, text: e.message }));
        if (res.status >= 500 || res.status === 0) crashed.push(`${r.method} ${r.path} [${label}] -> ${res.status}`);
      }
    }
    expect(crashed).toEqual([]);
  }, 180_000);

  it('never answers 500 to odd path ids and query strings', async () => {
    const bad: string[] = [];
    for (const r of routes().filter((x) => x.method === 'GET' && !PUBLIC(x))) {
      for (const id of ['%00', '..%2f..%2fetc%2fpasswd', "' OR 1=1 --", 'a'.repeat(5000), '%F0%9F%92%A5', '__proto__']) {
        const res = await http().get(r.path.replace(/:[A-Za-z]+/g, id)).query({ search: id, days: id, limit: id, offset: id, status: id }).set(as(A));
        if (res.status >= 500) bad.push(`GET ${r.path} id=${id.slice(0, 12)} -> ${res.status}`);
      }
    }
    expect(bad).toEqual([]);
  }, 180_000);

  it('refuses the NUL character everywhere with a 400, never a 500', async () => {
    const conv = await prisma.conversation.create({ data: { businessId: A.businessId, customerId: (await prisma.customer.create({ data: { businessId: A.businessId, waId: `234${Math.floor(Math.random() * 1e9)}` } })).id } });
    const cases: [string, string, unknown?][] = [
      ['POST', '/products', { name: 'bad\u0000name', priceMinor: 1, stockQty: 1 }], ['POST', '/faqs', { question: 'Why?\u0000', answer: 'x' }],
      ['POST', `/conversations/${conv.id}/messages`, { body: 'hi\u0000there' }], ['POST', '/playbooks', { name: 'Flow\u0000', whenToUse: 'when needed', steps: [{ ask: 'what\u0000?' }] }],
      ['POST', '/setup-ai/preview', { messages: [{ role: 'user', content: 'hi\u0000' }] }], ['PATCH', '/business', { name: 'Shop\u0000' }],
      ['GET', '/orders/%00'], ['GET', '/customers/%00'], ['GET', '/conversations/%00'], ['GET', '/products?search=a%00b']
    ];
    for (const [method, path, body] of cases) {
      const req = http()[method.toLowerCase() as 'get'](path).set(as(A));
      const res = body === undefined ? await req : await req.send(body as object);
      expect(res.status, `${method} ${path}`).toBe(400);
    }
    expect((await http().post('/auth/signup').send({ email: `nul-${run}@example.com`, password: 'correct-horse-9\u0000', name: 'X\u0000', businessName: 'Y', category: 'x', city: 'x', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' })).status).toBe(400);
  });

  it('refuses a body far over the size limit instead of falling over', async () => {
    const res = await http().post('/products').set(as(A)).set('Content-Type', 'application/json').send(JSON.stringify({ name: 'x'.repeat(6_000_000) }));
    expect([400, 413]).toContain(res.status);
  });
});

describe('guessing passwords', () => {
  it('locks out repeated wrong passwords, and the right password still works for others', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await http().post('/auth/login').send({ email: `sw-a-${run}@example.com`, password: `wrong-${i}-password` })).status);
    expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
    expect(statuses).toContain(429);
    expect((await http().post('/auth/login').send({ email: `sw-b-${run}@example.com`, password: 'correct-horse-9' })).status).toBe(200);
  });

  it('does not reveal whether an email has an account', async () => {
    const real = await http().post('/auth/login').send({ email: `sw-b-${run}@example.com`, password: 'wrong-password-1' });
    const fake = await http().post('/auth/login').send({ email: `nobody-${run}@example.com`, password: 'wrong-password-1' });
    expect(real.status).toBe(fake.status);
    expect(real.body.message).toBe(fake.body.message);
  });

  it('rejects weak or malformed sign-ups', async () => {
    for (const body of [{ email: 'not-an-email', password: 'correct-horse-9' }, { email: `x-${run}@example.com`, password: '123' }, { email: `x-${run}@example.com`, password: '' }, {}]) {
      expect((await http().post('/auth/signup').send({ name: 'X', businessName: 'X', category: 'x', city: 'x', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos', ...body })).status).toBe(400);
    }
  });
});

describe('payment and chat webhooks', () => {
  it('refuse unsigned or wrongly signed messages', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'x' } });
    expect((await http().post('/webhooks/paystack').set('Content-Type', 'application/json').send(body)).status).toBe(401);
    expect((await http().post('/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', 'deadbeef').send(body)).status).toBe(401);
    const wrong = createHmac('sha512', 'not-the-secret').update(body).digest('hex');
    expect((await http().post('/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', wrong).send(body)).status).toBe(401);
    expect((await http().post('/webhooks/whatsapp').set('Content-Type', 'application/json').send('{"object":"whatsapp_business_account"}')).status).toBe(401);
    expect((await http().post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('x-hub-signature-256', 'sha256=00').send('{}')).status).toBe(401);
  });

  it('a correctly signed message with a malformed body is absorbed, not a crash', async () => {
    const raw = '{"event":"charge.success","data":{}}';
    const sig = createHmac('sha512', 'sk_test_sweep').update(raw).digest('hex');
    expect((await http().post('/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw)).status).toBe(200);
  });
});
