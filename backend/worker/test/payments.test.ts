import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { createPaymentLink, createPaymentsPort } from '@wa/agent';
import type { ToolContext } from '@wa/agent';
import { buildSystemPrompt } from '@wa/agent';
import type { PaystackClient } from '@wa/shared';

const prisma = createPrisma();
const slugs = ['pay-ng', 'pay-none', 'pay-us'];
const inits: Parameters<PaystackClient['initialize']>[0][] = [];
const fake: PaystackClient = {
  listBanks: async () => [], resolveAccount: async () => ({ accountName: 'X' }), createSubaccount: async () => ({ subaccountCode: 'ACCT_X' }), verify: async () => ({ status: 'success', amountMinor: 0, currency: 'NGN', reference: '' }),
  initialize: async (o) => (inits.push(o), { url: `https://checkout.paystack.com/${o.reference}`, reference: o.reference })
};
let ng: { id: string; cust: string; other: string; order: string; paid: string; cancelled: string; foreign: string };
let none: { id: string; cust: string; order: string };
let us: { id: string; cust: string; order: string };

const ctx = (b: { id: string; cust: string }, withPay = true): ToolContext => ({
  db: prisma, businessId: b.id, currency: 'NGN', kind: 'goods', conversationId: 'c', customerId: b.cust, state: { handedOff: false },
  ...(withPay ? { payments: createPaymentsPort({ db: prisma, paystack: fake, businessId: b.id, customerId: b.cust }) } : {})
});

async function mk(slug: string, o: { currency: string; country: string; sub: string | null }) {
  const b = await prisma.business.create({
    data: { name: slug, slug, category: 'Fashion', kind: 'goods', city: 'x', country: o.country, currency: o.currency, paystackSubaccountCode: o.sub, customers: { create: [{ waId: `1${Math.floor(Math.random() * 1e9)}a` }, { waId: `1${Math.floor(Math.random() * 1e9)}b` }] } },
    include: { customers: true }
  });
  const order = (customerId: string, extra: object = {}) => prisma.order.create({ data: { businessId: b.id, customerId, items: [], subtotalMinor: 1450000, totalMinor: 1450000, ...extra } });
  return { b, order };
}

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  const a = await mk('pay-ng', { currency: 'NGN', country: 'NG', sub: 'ACCT_NG' });
  const [c1, c2] = a.b.customers;
  ng = { id: a.b.id, cust: c1!.id, other: c2!.id, order: (await a.order(c1!.id)).id, paid: (await a.order(c1!.id, { paymentStatus: 'paid', status: 'paid' })).id, cancelled: (await a.order(c1!.id, { status: 'cancelled' })).id, foreign: (await a.order(c2!.id)).id };
  const n = await mk('pay-none', { currency: 'NGN', country: 'NG', sub: null });
  none = { id: n.b.id, cust: n.b.customers[0]!.id, order: (await n.order(n.b.customers[0]!.id)).id };
  const u = await mk('pay-us', { currency: 'USD', country: 'US', sub: 'ACCT_US' });
  us = { id: u.b.id, cust: u.b.customers[0]!.id, order: (await u.order(u.b.customers[0]!.id)).id };
});
afterAll(async () => { await prisma.business.deleteMany({ where: { slug: { in: slugs } } }); await prisma.$disconnect(); });

describe('create_payment_link', () => {
  it('starts a payment for the customer’s own order: right amount, the business’s subaccount, the seller bears the fee', async () => {
    const r = (await createPaymentLink.run(ctx(ng), { order_id: ng.order })) as { payment_link: string; amount: string; next: string };
    expect(r.payment_link).toMatch(/^https:\/\/checkout\.paystack\.com\/cv-/);
    expect(r.amount).toBe('₦14,500');
    expect(r.next).toMatch(/Do NOT say it is paid/);
    expect(inits.at(-1)).toMatchObject({ amountMinor: 1450000, currency: 'NGN', subaccount: 'ACCT_NG', bearer: 'subaccount', metadata: { orderId: ng.order, businessId: ng.id } });
    expect(inits.at(-1)!.email).toMatch(/^c-.+@/); // no phone number or name goes to Paystack
    expect(await prisma.payment.count({ where: { orderId: ng.order, status: 'pending' } })).toBe(1);
  });

  it('asking again returns the same link instead of creating a second charge', async () => {
    const before = inits.length;
    const a = (await createPaymentLink.run(ctx(ng), { order_id: ng.order })) as { payment_link: string };
    const b = (await createPaymentLink.run(ctx(ng), { order_id: ng.order })) as { payment_link: string };
    expect(a.payment_link).toBe(b.payment_link);
    expect(inits.length).toBe(before);
  });

  it('a customer cannot get a link for someone else’s order, nor for one that is paid or cancelled', async () => {
    for (const id of [ng.foreign, ng.paid, ng.cancelled, 'nope']) expect(await createPaymentLink.run(ctx(ng), { order_id: id })).toMatchObject({ error: expect.any(String) });
  });

  it('falls back to the owner’s payment details when payments are not set up, not available, or not supported', async () => {
    expect(await createPaymentLink.run(ctx(none), { order_id: none.order })).toMatchObject({ error: expect.stringMatching(/not set up.*payment details/s) });
    expect(await createPaymentLink.run(ctx(ng, false), { order_id: ng.order })).toMatchObject({ error: expect.stringMatching(/not available/) });
    expect(await createPaymentLink.run(ctx(us), { order_id: us.order })).toMatchObject({ error: expect.stringMatching(/currency/) });
  });

  it('a payment provider failure becomes a polite fallback, not a crash', async () => {
    const broken = { ...fake, initialize: async () => { throw new Error('boom'); } };
    const c: ToolContext = { ...ctx(ng), payments: createPaymentsPort({ db: prisma, paystack: broken, businessId: ng.id, customerId: ng.cust }) };
    const o = await prisma.order.create({ data: { businessId: ng.id, customerId: ng.cust, items: [], subtotalMinor: 5000, totalMinor: 5000 } });
    expect(await createPaymentLink.run(c, { order_id: o.id })).toMatchObject({ error: expect.stringMatching(/Could not create/) });
  });
});

describe('what the assistant is told about paying', () => {
  const base = { businessName: 'X', category: 'c', city: '', country: 'Nigeria', currency: 'NGN', kind: 'goods' as const, maxDiscountPct: 0, hours: '', paymentMethods: 'p', returnPolicy: '', customInstructions: '', tone: 'friendly', forbiddenTopics: [], faqs: [] };
  it('only mentions payment links when the business really has them, and always asks for the order summary', () => {
    const on = buildSystemPrompt({ ...base, onlinePayments: true });
    const off = buildSystemPrompt({ ...base, onlinePayments: false });
    expect(on).toMatch(/call create_payment_link/);
    expect(off).not.toMatch(/call create_payment_link/);
    expect(off).toMatch(/NO online payment link/);
    for (const p of [on, off]) expect(p).toMatch(/items, (the )?delivery fee and (the )?total/);
  });
  it('replies in plain English unless the customer writes in Pidgin', () => {
    const p = buildSystemPrompt({ ...base, country: 'Kenya' });
    expect(p).toMatch(/standard English.*reply in clear, simple standard English/);
    expect(p).toMatch(/Never switch to slang or a dialect on your own/);
    expect(p).not.toMatch(/Pidgin/); // only named for Nigerian businesses
    expect(buildSystemPrompt({ ...base, country: 'Nigeria' })).toMatch(/such as Nigerian Pidgin/);
  });
  it('teaches it to try once to keep a customer who declines, then respect a firm no', () => {
    const p = buildSystemPrompt(base);
    expect(p).toMatch(/WHEN A CUSTOMER SAYS NO/);
    expect(p).toMatch(/send ONE short, warm message/);
    expect(p).toMatch(/Respect a clear no completely/);
    expect(p).toMatch(/Never invent offers, deadlines, scarcity/);
  });
  it('only offers a discount when the owner allows one', () => {
    expect(buildSystemPrompt({ ...base, maxDiscountPct: 10 })).toMatch(/discount of up to 10% \(never more\)/);
    expect(buildSystemPrompt({ ...base, maxDiscountPct: 0 })).toMatch(/there is no discount to offer/);
  });
  it('tells it never to claim an action it did not take', () => {
    expect(buildSystemPrompt(base)).toMatch(/Never say you have done something.*unless the matching tool returned success/);
  });
  it('tells it not to use markdown on WhatsApp and never to guess product ids', () => {
    const p = buildSystemPrompt(base);
    expect(p).toMatch(/does not show markdown/);
    expect(p).toMatch(/Never guess a product_id/);
  });
});
