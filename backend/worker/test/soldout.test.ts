import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { checkStock, createOrder, joinWaitlist, searchProducts, suggestAlternatives } from '@wa/agent';
import type { ToolContext } from '@wa/agent';

const prisma = createPrisma();
const slugs = ['so-shoes', 'so-other'];
let shop: { id: string; customerId: string; sneaker: string; loafer: string; sandal: string; tee: string; preorder: string };
let other: { id: string; customerId: string; sneaker: string };
const ctx = (businessId: string, customerId: string): ToolContext => ({ db: prisma, businessId, currency: 'NGN', kind: 'goods', conversationId: 'c', customerId, state: { handedOff: false } });
const mine = () => ctx(shop.id, shop.customerId);
const order = (product_id: string, variant: string | undefined, quantity = 1) =>
  createOrder.run(mine(), { items: [{ product_id, variant, quantity }], delivery_area: 'Lekki', address: '5 Admiralty Way, Lekki' }) as Promise<Record<string, unknown>>;

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  const b = await prisma.business.create({
    data: {
      name: 'Shoe Hub', slug: 'so-shoes', category: 'Fashion', kind: 'goods', city: 'Lagos', country: 'NG', currency: 'NGN',
      deliveryZones: { create: { areaName: 'Lekki', feeMinor: 150000, etaText: 'same day' } },
      customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] },
      products: {
        create: [
          { name: 'Air Runner Sneaker', priceMinor: 4500000, stockQty: 3, variants: [{ name: '42', stockQty: 3 }, { name: '43', stockQty: 0 }, { name: '44', stockQty: 0 }] },
          { name: 'Classic Leather Loafer', priceMinor: 3800000, stockQty: 4, variants: [{ name: '42', stockQty: 4 }, { name: '43', stockQty: 0 }] },
          { name: 'Beach Sandal', priceMinor: 1200000, stockQty: 0 },
          { name: 'Plain Tee', priceMinor: 500000, stockQty: 0, restockNote: 'Back around 20 Dec' },
          { name: 'Limited Jacket', priceMinor: 9000000, stockQty: 0, allowPreorder: true }
        ]
      }
    },
    include: { products: true, customers: true }
  });
  const by = (n: string) => b.products.find((p) => p.name === n)!.id;
  shop = { id: b.id, customerId: b.customers[0]!.id, sneaker: by('Air Runner Sneaker'), loafer: by('Classic Leather Loafer'), sandal: by('Beach Sandal'), tee: by('Plain Tee'), preorder: by('Limited Jacket') };
  const o = await prisma.business.create({
    data: {
      name: 'Other Shop', slug: 'so-other', category: 'Fashion', kind: 'goods', city: 'Lagos', country: 'NG', currency: 'NGN',
      customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] },
      products: { create: [{ name: 'Secret Sneaker', priceMinor: 100, stockQty: 50 }] }
    },
    include: { products: true, customers: true }
  });
  other = { id: o.id, customerId: o.customers[0]!.id, sneaker: o.products[0]!.id };
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  await prisma.$disconnect();
});

describe('sold-out sizes', () => {
  it('search reports stock per size, so one sold-out size is not "sold out"', async () => {
    const r = (await searchProducts.run(mine(), { query: 'Air Runner' })) as { results: { in_stock: boolean; variants: { name: string; in_stock: boolean; left: number }[] }[] };
    expect(r.results[0]!.in_stock).toBe(true);
    expect(r.results[0]!.variants.map((v) => `${v.name}:${v.left}`)).toEqual(['42:3', '43:0', '44:0']);
  });

  it('check_stock for a sold-out size names the sizes that are in stock and says what to do next', async () => {
    const r = (await checkStock.run(mine(), { product_id: shop.sneaker, variant: '43' })) as Record<string, unknown>;
    expect(r).toMatchObject({ in_stock: false, sold_out: true, other_options_in_stock: ['42'] });
    expect(String(r.next)).toMatch(/suggest_alternatives/);
    expect(await checkStock.run(mine(), { product_id: shop.sneaker, variant: '99' })).toMatchObject({ error: expect.stringMatching(/No option called/) });
  });

  it('an owner note is passed on, and no date is made up when there is none', async () => {
    expect(await checkStock.run(mine(), { product_id: shop.tee })).toMatchObject({ sold_out: true, restock_note: 'Back around 20 Dec', preorder_available: false });
    expect(await checkStock.run(mine(), { product_id: shop.sandal })).toMatchObject({ sold_out: true, restock_note: null });
  });
});

describe('orders for sold-out items', () => {
  it('refuses a sold-out size and points to alternatives and the waitlist', async () => {
    const r = await order(shop.sneaker, '43');
    expect(String(r.error)).toMatch(/sold out.*suggest_alternatives.*join_waitlist/);
  });

  it('asks which size when stock is held per size', async () => {
    expect(String((await order(shop.sneaker, undefined)).error)).toMatch(/Ask which option/);
  });

  it('says how many are left when the customer wants more than that', async () => {
    expect(String((await order(shop.sneaker, '42', 9)).error)).toMatch(/Only 3 of/);
  });

  it('holds items for an unpaid order so the last one is not sold twice', async () => {
    const first = await order(shop.loafer, '42', 3);
    expect(first.order_id).toBeTruthy();
    expect((await order(shop.loafer, '42', 2)).error).toMatch(/Only 1 of/);
    const search = (await searchProducts.run(mine(), { query: 'Loafer' })) as { results: { variants: { name: string; left: number }[] }[] };
    expect(search.results[0]!.variants.find((v) => v.name === '42')!.left).toBe(1);
  });

  it('records a pre-order when the owner allows it, and flags it for the owner', async () => {
    const r = await order(shop.preorder, undefined);
    expect(r.preorder_items).toEqual(['Limited Jacket']);
    expect(String(r.next)).toMatch(/PRE-ORDER/);
    const saved = await prisma.order.findFirstOrThrow({ where: { id: r.order_id as string } });
    expect(saved.notes).toMatch(/PRE-ORDER/);
    expect((saved.items as { preorder?: boolean }[])[0]!.preorder).toBe(true);
  });
});

describe('alternatives and the waitlist', () => {
  it('offers other sizes of the same item and similar items that are in stock, only from this business', async () => {
    const r = (await suggestAlternatives.run(mine(), { product_id: shop.sneaker, variant: '43' })) as { same_item_other_options: { option: string }[]; similar_items: { name: string }[] };
    expect(r.same_item_other_options.map((o) => o.option)).toEqual(['42']);
    const names = r.similar_items.map((s) => s.name);
    expect(names).toContain('Classic Leather Loafer');
    expect(names).not.toContain('Secret Sneaker');
    expect(names).not.toContain('Beach Sandal'); // sold out items are never offered
  });

  it('refuses unknown or other-business products', async () => {
    expect(await suggestAlternatives.run(mine(), { product_id: other.sneaker })).toMatchObject({ error: expect.any(String) });
    expect(await joinWaitlist.run(mine(), { product_id: other.sneaker })).toMatchObject({ error: expect.any(String) });
  });

  it('puts a customer on the waitlist once, for the size they want', async () => {
    const a = await joinWaitlist.run(mine(), { product_id: shop.sneaker, variant: '43' });
    expect(a).toMatchObject({ on_waitlist: true, already_listed: false });
    expect(await joinWaitlist.run(mine(), { product_id: shop.sneaker, variant: '43' })).toMatchObject({ already_listed: true });
    expect(await prisma.waitlistEntry.count({ where: { businessId: shop.id, productId: shop.sneaker, variant: '43', status: 'waiting' } })).toBe(1);
  });

  it('does not wait-list items that are in stock, and asks for the size when needed', async () => {
    expect(await joinWaitlist.run(mine(), { product_id: shop.sneaker, variant: '42' })).toMatchObject({ error: expect.stringMatching(/in stock/) });
    expect(await joinWaitlist.run(mine(), { product_id: shop.sneaker })).toMatchObject({ error: expect.stringMatching(/Ask which option/) });
    expect(await joinWaitlist.run(mine(), { product_id: shop.sandal })).toMatchObject({ on_waitlist: true });
  });
});
