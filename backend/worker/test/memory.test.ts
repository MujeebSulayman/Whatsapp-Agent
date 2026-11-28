import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { buildContext, recentLookups } from '@wa/agent';

const prisma = createPrisma();
const search = { name: 'search_products', args: {}, result: { results: [{ product_id: 'p-rice', name: 'Rice (50kg)', price: '₦85,000', in_stock: true }, { product_id: 'p-shoe', name: 'Air Runner', price: '₦45,000', in_stock: true, variants: [{ name: '42' }, { name: '43' }] }] } };
const list = { name: 'list_catalog', args: {}, result: { items: [{ product_id: 'p-salt', name: 'Salt (1kg)', price: '₦1,500', available: false }, { product_id: 'p-rice', name: 'Rice (50kg)', price: '₦90,000', available: true }] } };
const fee = { name: 'get_delivery_fee', args: {}, result: { found: true, area: 'Lekki Phase 1', fee: '₦2,000', eta: '45-60 minutes' } };

describe('what the assistant remembers from earlier in the chat', () => {
  it('turns earlier lookups into a short list with ids, prices, options and delivery fees', () => {
    const m = recentLookups([{ toolCalls: [list, fee] }, { toolCalls: [search] }])!;
    expect(m).toMatch(/RECENTLY LOOKED UP/);
    expect(m).toContain('- Salt (1kg) | id=p-salt | ₦1,500 | sold out');
    expect(m).toContain('- Air Runner | id=p-shoe | ₦45,000 | options: 42, 43');
    expect(m).toContain('Delivery: Lekki Phase 1: ₦2,000, 45-60 minutes');
  });

  it('keeps the newest version of an item (runs are newest first) and each item once', () => {
    const m = recentLookups([{ toolCalls: [list] }, { toolCalls: [search] }])!;
    expect(m).toContain('Rice (50kg) | id=p-rice | ₦90,000');
    expect(m).not.toContain('₦85,000');
    expect(m.match(/p-rice/g)).toHaveLength(1);
  });

  it('is empty when nothing useful was looked up, and ignores failed lookups', () => {
    expect(recentLookups([])).toBeNull();
    expect(recentLookups([{ toolCalls: [{ name: 'search_products', result: { error: 'x' } }, { name: 'handoff_to_human', result: { handed_off: true } }] }])).toBeNull();
    expect(recentLookups([{ toolCalls: null }, { toolCalls: 'junk' }])).toBeNull();
  });

  it('is capped, so a long chat cannot bloat the instructions', () => {
    const many = { name: 'list_catalog', result: { items: Array.from({ length: 80 }, (_, i) => ({ product_id: `p${i}`, name: `Item ${i}`, price: '₦1,000', available: true })) } };
    expect(recentLookups([{ toolCalls: [many] }])!.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(40);
  });
});

describe('the owner can switch off "try once to keep them"', () => {
  let b: { id: string; cust: string; conv: string };
  beforeAll(async () => {
    await prisma.business.deleteMany({ where: { slug: 'mem-keep' } });
    const x = await prisma.business.create({ data: { name: 'mem-keep', slug: 'mem-keep', category: 'Groceries', kind: 'goods', city: 'x', country: 'NG', currency: 'NGN', customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] } }, include: { customers: true } });
    const conv = await prisma.conversation.create({ data: { businessId: x.id, customerId: x.customers[0]!.id } });
    b = { id: x.id, cust: x.customers[0]!.id, conv: conv.id };
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { slug: 'mem-keep' } }); });

  it('is on by default: one friendly attempt, then respect a no', async () => {
    const c = await buildContext(prisma, { businessId: b.id, conversationId: b.conv, customerId: b.cust });
    expect(c.keepCustomers).toBe(true);
    expect(c.system).toMatch(/send ONE short, warm message/);
  });

  it('when off, the assistant is told to let them go gracefully and not to argue', async () => {
    await prisma.aiRules.upsert({ where: { businessId: b.id }, create: { businessId: b.id, escalateKeywords: [], forbiddenTopics: [], keepCustomers: false }, update: { keepCustomers: false } });
    const c = await buildContext(prisma, { businessId: b.id, conversationId: b.conv, customerId: b.cust });
    expect(c.keepCustomers).toBe(false);
    expect(c.system).toMatch(/let go gracefully/);
    expect(c.system).toMatch(/do not try to change their mind/);
    expect(c.system).not.toMatch(/send ONE short, warm message/);
  });
});

describe('it reaches the assistant for a real conversation, and only that one', () => {
  let a: { id: string; cust: string; conv: string; otherConv: string };
  beforeAll(async () => {
    await prisma.business.deleteMany({ where: { slug: 'mem-a' } });
    const b = await prisma.business.create({ data: { name: 'mem-a', slug: 'mem-a', category: 'Groceries', kind: 'goods', city: 'x', country: 'NG', currency: 'NGN', customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] } }, include: { customers: true } });
    const cust = b.customers[0]!.id;
    const conv = await prisma.conversation.create({ data: { businessId: b.id, customerId: cust } });
    const otherConv = await prisma.conversation.create({ data: { businessId: b.id, customerId: cust } });
    await prisma.agentRun.create({ data: { businessId: b.id, conversationId: conv.id, kind: 'chat', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, toolCalls: [search, fee] as never, latencyMs: 1 } });
    await prisma.agentRun.create({ data: { businessId: b.id, conversationId: otherConv.id, kind: 'chat', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, toolCalls: [list] as never, latencyMs: 1 } });
    await prisma.agentRun.create({ data: { businessId: b.id, conversationId: conv.id, kind: 'preview', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, toolCalls: [list] as never, latencyMs: 1 } });
    a = { id: b.id, cust, conv: conv.id, otherConv: otherConv.id };
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { slug: 'mem-a' } }); await prisma.$disconnect(); });

  it('puts this conversation’s lookups in the instructions', async () => {
    const { system } = await buildContext(prisma, { businessId: a.id, conversationId: a.conv, customerId: a.cust });
    expect(system).toContain('Rice (50kg) | id=p-rice | ₦85,000');
    expect(system).toContain('Delivery: Lekki Phase 1');
    expect(system).not.toContain('Salt (1kg)'); // from a practice run and another conversation
  });
});
