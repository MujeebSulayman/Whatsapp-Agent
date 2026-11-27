import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { buildContext } from '@wa/agent';
import { createOrder } from '@wa/agent';
import { getDeliveryFee } from '@wa/agent';
import { searchProducts } from '@wa/agent';
import type { ToolContext } from '@wa/agent';

const prisma = createPrisma();
type Shop = { id: string; customerId: string; productId: string; currency: string };
const shops: Record<'us' | 'jp' | 'gh', Shop> = { us: {} as Shop, jp: {} as Shop, gh: {} as Shop };
const slugs = ['cur-us', 'cur-jp', 'cur-gh'];
const ctx = (s: Shop): ToolContext => ({ db: prisma, businessId: s.id, currency: s.currency, kind: 'goods', conversationId: 'c', customerId: s.customerId, state: { handedOff: false } });

async function mk(slug: string, country: string, currency: string, city: string, price: number, fee: number): Promise<Shop> {
  const b = await prisma.business.create({
    data: {
      name: `Shop ${slug}`, slug, category: 'retail', city, country, currency,
      products: { create: { name: 'Widget', priceMinor: price, stockQty: 10 } },
      deliveryZones: { create: { areaName: 'Downtown', feeMinor: fee, etaText: '1 hour' } },
      customers: { create: { waId: `1555${Math.floor(Math.random() * 1e7)}` } }
    },
    include: { products: true, customers: true }
  });
  return { id: b.id, customerId: b.customers[0]!.id, productId: b.products[0]!.id, currency };
}

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  shops.us = await mk('cur-us', 'US', 'USD', 'Austin', 1999, 450);
  shops.jp = await mk('cur-jp', 'JP', 'JPY', 'Osaka', 1200, 300); // yen have no minor unit: 1200 means ¥1,200
  shops.gh = await mk('cur-gh', 'GH', 'GHS', 'Accra', 2500, 500);
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  await prisma.$disconnect();
});

describe('agent tools quote the business currency', () => {
  it('USD shop: cents become dollars', async () => {
    const found = (await searchProducts.run(ctx(shops.us), { query: 'widget' })) as { results: { price: string }[] };
    expect(found.results[0]!.price).toBe('$19.99');
    expect(await getDeliveryFee.run(ctx(shops.us), { area: 'Downtown' })).toMatchObject({ fee: '$4.50' });
    const order = (await createOrder.run(ctx(shops.us), { items: [{ product_id: shops.us.productId, quantity: 2 }], delivery_area: 'Downtown', address: '1 Main Street, Austin' })) as { total: string; subtotal: string };
    expect([order.subtotal, order.total]).toEqual(['$39.98', '$44.48']);
  });
  it('JPY shop: zero-decimal currency is not multiplied by 100', async () => {
    const found = (await searchProducts.run(ctx(shops.jp), { query: 'widget' })) as { results: { price: string }[] };
    expect(found.results[0]!.price).toBe('¥1,200');
    const order = (await createOrder.run(ctx(shops.jp), { items: [{ product_id: shops.jp.productId, quantity: 1 }], delivery_area: 'Downtown', address: '2 Chome, Osaka City' })) as { total: string };
    expect(order.total).toBe('¥1,500');
  });
  it('GHS shop quotes cedi', async () => {
    const found = (await searchProducts.run(ctx(shops.gh), { query: 'widget' })) as { results: { price: string }[] };
    expect(found.results[0]!.price).toMatch(/25$/);
    expect(found.results[0]!.price).not.toContain('₦');
  });
});

describe('the prompt is not tied to one country', () => {
  it('names the real country and currency, and does not assume Nigeria or Pidgin', async () => {
    const c = await prisma.conversation.create({ data: { businessId: shops.us.id, customerId: shops.us.customerId } });
    const { system } = await buildContext(prisma, { businessId: shops.us.id, conversationId: c.id, customerId: shops.us.customerId });
    expect(system).toContain('Austin, United States');
    expect(system).toContain('USD');
    expect(system).not.toMatch(/Nigerian|Nigeria|Pidgin|Naija|₦/);
    expect(system).toMatch(/language and dialect the customer writes in/);
  });
});
