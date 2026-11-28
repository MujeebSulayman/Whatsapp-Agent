import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ChatMessage, LlmClient } from '@wa/ai';
import { createPrisma } from '@wa/db';
import { buildSystemPrompt, incompleteFullList, listCatalog, listNotShown, needsCatalogCall, listDeliveryAreas, runAgent, type Tool, type ToolContext } from '@wa/agent';

const prisma = createPrisma();
const slugs = ['br-a', 'br-b'];
let a: { id: string; cust: string };
const ctx = (): ToolContext => ({ db: prisma, businessId: a.id, currency: 'NGN', kind: 'goods', conversationId: 'c', customerId: a.cust, state: { handedOff: false } });
type Listing = { total: number; showing: string; items: { name: string; price: string; available: boolean; sold_out?: boolean }[]; has_more: boolean; next_offset?: number; remaining?: number; note: string };
const list = (args: { offset?: number; limit?: number; match?: string } = {}) => listCatalog.run(ctx(), { offset: 0, limit: 20, ...args }) as Promise<Listing>;

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  const mk = (slug: string, n: number) => prisma.business.create({
    data: { name: slug, slug, category: 'Groceries', kind: 'goods', city: 'x', country: 'NG', currency: 'NGN',
      customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] },
      products: { create: Array.from({ length: n }, (_, i) => ({ name: `Item ${String(i + 1).padStart(2, '0')}${i % 10 === 0 ? ' Rice' : ''}`, priceMinor: 100000 * (i + 1), stockQty: i === 3 ? 0 : 5, active: i !== 4 })) } },
    include: { customers: true }
  });
  const x = await mk('br-a', 35);
  a = { id: x.id, cust: x.customers[0]!.id };
  await mk('br-b', 3); // another business: must never appear
});
afterAll(async () => { await prisma.business.deleteMany({ where: { slug: { in: slugs } } }); await prisma.$disconnect(); });

describe('list_catalog', () => {
  it('lists A to Z with the real total, and says how many are left', async () => {
    const r = await list();
    expect(r.total).toBe(34); // 35 items, one switched off
    expect(r.items).toHaveLength(20);
    expect(r.items[0]).toMatchObject({ name: 'Item 01 Rice', price: '₦1,000' });
    expect(r).toMatchObject({ has_more: true, next_offset: 20, remaining: 14 });
    expect(r.note).toMatch(/34 items in total and 14 more.*Do not call this the full list/);
  });

  it('continues from where it stopped without repeating, and says when it is everything', async () => {
    const first = await list({ limit: 30 });
    const rest = await list({ offset: first.next_offset! });
    expect(first.items.length + rest.items.length).toBe(34);
    expect(new Set([...first.items, ...rest.items].map((i) => i.name)).size).toBe(34);
    expect(rest).toMatchObject({ has_more: false });
    expect(rest.note).toMatch(/then say that is everything/);
  });

  it('can list cheapest first or most expensive first, so those questions are answered by the tool', async () => {
    const low = await list({ limit: 3, sort: 'price_low' } as never);
    expect(low.items.map((i) => i.price)).toEqual(['₦1,000', '₦2,000', '₦3,000']);
    const high = await list({ limit: 2, sort: 'price_high' } as never);
    expect(high.items[0]!.price).toBe('₦35,000'); // Item 35 is the dearest of the 34 active items
    expect(Number(high.items[0]!.price.replace(/[^\d]/g, ''))).toBeGreaterThan(Number(high.items[1]!.price.replace(/[^\d]/g, '')));
  });

  it('asking for a page past the end starts again from the top instead of returning nothing', async () => {
    const r = await list({ offset: 100, limit: 5 });
    expect(r.items).toHaveLength(5);
    expect(r.items[0]!.name).toBe('Item 01 Rice');
    expect(r.note).toMatch(/past the end, so this is the list from the start/);
    expect((await list({ offset: 100, limit: 5 })).has_more).toBe(true);
  });

  it('skips items that are switched off, flags sold-out ones, and can be narrowed by a word', async () => {
    const all = (await list({ limit: 30 })).items;
    expect(all.find((i) => i.name.startsWith('Item 05'))).toBeUndefined();
    expect(all.find((i) => i.name.startsWith('Item 04'))).toMatchObject({ available: false, sold_out: true });
    const rice = await list({ match: 'rice' });
    expect(rice.total).toBe(4);
    expect(rice.items.every((i) => /Rice/.test(i.name))).toBe(true);
    expect((await list({ match: 'nothing-like-this' })).note).toMatch(/Do not invent/);
  });

  it('only ever shows this business’s own items', async () => {
    const names = (await list({ limit: 30 })).items.map((i) => i.name);
    expect(names.length).toBe(30);
    expect((await list({ offset: 30, limit: 30 })).total).toBe(34);
  });
});

describe('"the full list" is only said when it is', () => {
  const call = (name: string, result: unknown) => ({ name, result });
  const shown = (n: number, total: number) => call('list_catalog', { total, items: Array.from({ length: n }, (_, i) => ({ product_id: `p${i}` })) });

  it('flags a full-list claim with no listing, or with only part of it', () => {
    expect(incompleteFullList("Here's the full list of what we sell: ...", [])).toMatch(/did not call list_catalog/);
    expect(incompleteFullList('Here is the complete menu', [shown(20, 34)])).toMatch(/34 items and only 20 were shown/);
    expect(incompleteFullList('That is everything we sell.', [shown(5, 30)])).toMatch(/only 5/);
  });

  it('accepts it when everything was shown (even across two calls), and ignores other replies', () => {
    expect(incompleteFullList("Here's the full list: ...", [shown(12, 12)])).toBeNull();
    expect(incompleteFullList('the whole menu', [call('list_catalog', { total: 4, items: [{ product_id: 'a' }, { product_id: 'b' }] }), call('list_catalog', { total: 4, items: [{ product_id: 'c' }, { product_id: 'd' }] })])).toBeNull();
    expect(incompleteFullList('We have 20 items. Want the rest?', [shown(20, 34)])).toBeNull();
  });

  it('sends the model back once when it overclaims', async () => {
    const usage = { inputTokens: 1, outputTokens: 1, costUsd: 0 };
    const seen: ChatMessage[][] = [];
    const steps: ChatMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_catalog', arguments: '{}' } }] },
      { role: 'assistant', content: "Here's the full list: Item 01 ₦1,000 ..." },
      { role: 'assistant', content: 'We have 34 items. Here are the first 20 ... Want the other 14?' }
    ];
    const llm: LlmClient = { async chat(req) { seen.push([...req.messages]); return { message: steps[seen.length - 1]!, usage, model: req.model }; } };
    const fake: Tool = { name: 'list_catalog', description: 'x', schema: z.object({}), async run() { return { total: 34, items: Array.from({ length: 20 }, (_, i) => ({ product_id: `p${i}`, price: '₦1,000' })) }; } };
    const r = await runAgent({ llm, model: 'm', system: 's', history: [{ role: 'user', content: 'list them all' }], ctx: { db: prisma, businessId: 'b', currency: 'NGN', kind: 'goods', conversationId: 'c', customerId: 'u' }, tools: [fake] });
    expect(r.reply).toMatch(/first 20.*other 14/);
    expect(seen.at(-1)!.at(-1)).toMatchObject({ role: 'system', content: expect.stringMatching(/only 20 were shown/) });
  });
});

describe('asking to see the list always looks it up', () => {
  const u = (content: string) => ({ role: 'user', content });
  it('is needed when the customer asks for the list and no lookup happened', () => {
    for (const t of ['list them all', 'show me everything', 'Can I see the full list?', 'what is on the menu', 'send your price list', 'all your products please']) expect(needsCatalogCall([u(t)], []), t).toBe(true);
  });
  it('is not needed when the lookup happened, or for other messages', () => {
    expect(needsCatalogCall([u('list them all')], [{ name: 'list_catalog' }])).toBe(false);
    for (const t of ['how much is rice?', 'do you have beans', 'hi']) expect(needsCatalogCall([u(t)], []), t).toBe(false);
  });
});

describe('showing the list, not just counting it', () => {
  const items = ['Rice (50kg)', 'Beans (25kg)', 'Garri (10kg)', 'Sugar (5kg)', 'Salt (1kg)'].map((name, i) => ({ product_id: `p${i}`, name }));
  const calls = [{ name: 'list_catalog', result: { total: 5, items } }];
  it('flags a reply that only gives a count', () => {
    expect(listNotShown('We have a total of 5 items. Want me to show them?', calls)).toMatch(/did not show it/);
    expect(listNotShown('1. Rice for ₦85,000', calls)).toMatch(/5 items/);
  });
  it('accepts a reply that names the items (even without their sizes), and ignores tiny lists and other turns', () => {
    expect(listNotShown('1. Rice - ₦85,000\n2. Beans - ₦48,000\n3. Garri - ₦18,000\n4. Sugar - ₦9,000\n5. Salt - ₦1,500', calls)).toBeNull();
    expect(listNotShown('We have 2 items.', [{ name: 'list_catalog', result: { total: 2, items: items.slice(0, 2) } }])).toBeNull();
    expect(listNotShown('Hi!', [])).toBeNull();
  });
});

describe('what the assistant is told about serving customers', () => {
  const p = buildSystemPrompt({ businessName: 'X', category: 'c', city: '', country: 'Kenya', currency: 'KES', kind: 'goods', maxDiscountPct: 0, hours: '', paymentMethods: 'p', returnPolicy: '', customInstructions: '', tone: 'friendly', forbiddenTopics: [], faqs: [] });
  it('has written service standards and catalogue-browsing rules', () => {
    expect(p).toMatch(/SERVICE STANDARDS/);
    expect(p).toMatch(/Answer first/);
    expect(p).toMatch(/your first words are a sincere apology/);
    expect(p).toMatch(/do not answer, even if you know the answer/);
    expect(p).toMatch(/never reply "I already listed them"/);
    expect(p).toMatch(/call list_delivery_areas/);
    expect(p).toMatch(/my budget is 100k.*call suggest_within_budget.*Never add prices up yourself/s);
    expect(p).toMatch(/your first action is a search_products call/);
    expect(p).toMatch(/never say "we can" or "we can't" to a custom, bulk, catering/);
    expect(p).toMatch(/No dead ends/);
    expect(p).toMatch(/call list_catalog, not search_products/);
    expect(p).toMatch(/Never call a partial list "the full list"/);
  });
});

describe('list_delivery_areas', () => {
  it('lists every area with its fee and time, and never invents any', async () => {
    const empty = (await listDeliveryAreas.run(ctx(), {})) as { total: number; note: string };
    expect(empty).toMatchObject({ total: 0 });
    expect(empty.note).toMatch(/Do not invent/);
    await prisma.deliveryZone.createMany({ data: [{ businessId: a.id, areaName: 'Yaba', feeMinor: 150000, etaText: '1 hour' }, { businessId: a.id, areaName: 'Ikeja', feeMinor: 250000, etaText: '2 hours' }] });
    const r = (await listDeliveryAreas.run(ctx(), {})) as { total: number; areas: { area: string; fee: string; time: string }[]; note: string };
    expect(r.areas).toEqual([{ area: 'Ikeja', fee: '₦2,500', time: '2 hours' }, { area: 'Yaba', fee: '₦1,500', time: '1 hour' }]);
    expect(r.note).toMatch(/Anywhere else is not covered/);
  });
});
