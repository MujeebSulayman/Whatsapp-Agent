import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { buildSystemPrompt, suggestWithinBudget, type ToolContext } from '@wa/agent';

const prisma = createPrisma();
let a: { id: string; cust: string };
const ctx = (): ToolContext => ({ db: prisma, businessId: a.id, currency: 'NGN', kind: 'goods', conversationId: 'c', customerId: a.cust, state: { handedOff: false } });
type Out = { budget: string; combos: { label: string; items: { name: string; price: string }[]; total: string; left: string }[]; note: string; error?: string };
const run = (budget: number, extra: object = {}) => suggestWithinBudget.run(ctx(), { budget, max_items: 5, ...extra }) as Promise<Out>;
const num = (money: string) => Number(money.replace(/[^\d.]/g, ''));

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['bg-a', 'bg-b'] } } });
  const mk = (slug: string, products: object[]) => prisma.business.create({ data: { name: slug, slug, category: 'Groceries', kind: 'goods', city: 'x', country: 'NG', currency: 'NGN', customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] }, products: { create: products as never } }, include: { customers: true } });
  const p = (name: string, naira: number, extra: object = {}) => ({ name, priceMinor: naira * 100, stockQty: 0, trackStock: false, ...extra });
  const x = await mk('bg-a', [p('Rice', 85000), p('Frozen Chicken', 8000), p('Frozen Turkey', 10000), p('Groundnut Oil', 18000), p('Salt', 1500), p('Sugar', 9000), p('Beans', 48000), p('Sold Out Item', 100, { trackStock: true, stockQty: 0 }), p('Hidden', 100, { active: false })]);
  a = { id: x.id, cust: x.customers[0]!.id };
  await mk('bg-b', [p('Other Shop Gold', 5)]);
});
afterAll(async () => { await prisma.business.deleteMany({ where: { slug: { in: ['bg-a', 'bg-b'] } } }); await prisma.$disconnect(); });

describe('suggest_within_budget', () => {
  it('never goes over the budget, and the totals are exact', async () => {
    const r = await run(110000);
    expect(r.combos.length).toBeGreaterThan(0);
    for (const c of r.combos) {
      const sum = c.items.reduce((s, i) => s + num(i.price), 0);
      expect(num(c.total)).toBe(sum);
      expect(sum).toBeLessThanOrEqual(110000);
      expect(num(c.left)).toBe(110000 - sum);
    }
  });

  it('would never recommend the over-budget mix from the real chat (85k + 8k + 10k + 18k = 121k for 110k)', async () => {
    for (const c of (await run(110000)).combos) expect(num(c.total)).toBeLessThanOrEqual(110000);
    const closest = (await run(110000)).combos[0]!;
    expect(closest.label).toBe('closest to your budget');
    expect(num(closest.total)).toBe(105500); // the best that really fits: 85k + 10k + 9k + 1.5k (85k + 18k + 8k would be 111k)
  });

  it('offers a different style of combination, with no duplicates', async () => {
    const r = await run(30000);
    expect(new Set(r.combos.map((c) => c.items.map((i) => i.name).sort().join())).size).toBe(r.combos.length);
    expect(r.combos.map((c) => c.label)).toContain('the most items');
    const most = r.combos.find((c) => c.label === 'the most items')!;
    expect(most.items.length).toBeGreaterThanOrEqual(4); // Salt, Sugar, Frozen Chicken, Frozen Turkey...
  });

  it('can be told something must be included, and says so when that is impossible', async () => {
    for (const c of (await run(110000, { must_include: 'rice' })).combos) expect(c.items.map((i) => i.name)).toContain('Rice');
    expect((await run(50000, { must_include: 'rice' })).error).toMatch(/Nothing matching "rice"/);
  });

  it('skips sold-out and switched-off items, and other businesses', async () => {
    const names = (await run(1_000_000)).combos.flatMap((c) => c.items.map((i) => i.name));
    expect(names).not.toContain('Sold Out Item');
    expect(names).not.toContain('Hidden');
    expect(names).not.toContain('Other Shop Gold');
  });

  it('is honest when nothing fits', async () => {
    const r = await run(500);
    expect(r.combos).toEqual([]);
    expect((r as unknown as { note: string }).note).toMatch(/cheapest item is Salt at ₦1,500/);
  });
});

describe('when the assistant hands a chat to a person', () => {
  const p = buildSystemPrompt({ businessName: 'X', category: 'c', city: '', country: 'Kenya', currency: 'KES', kind: 'goods', maxDiscountPct: 0, hours: '', paymentMethods: 'p', returnPolicy: '', customInstructions: '', tone: 'friendly', forbiddenTopics: [], faqs: [] });
  it('is told to solve things itself and only hand over for real reasons', () => {
    expect(p).toMatch(/RESOLVE IT YOURSELF. You are the agent, not a switchboard/);
    expect(p).toMatch(/Use handoff_to_human only when: the customer asks for a person/);
    expect(p).not.toMatch(/unknown delivery areas/);
    expect(p).toMatch(/Always answer the customer's LATEST message first/);
    expect(p).toMatch(/call suggest_within_budget/);
    expect(buildSystemPrompt({ businessName: 'X', category: 'c', city: '', country: 'Kenya', currency: 'KES', kind: 'goods', maxDiscountPct: 0, hours: '', paymentMethods: 'p', returnPolicy: '', customInstructions: '', tone: 'friendly', forbiddenTopics: [], faqs: [] })).toMatch(/call get_delivery_fee for that area/);
  });
});
