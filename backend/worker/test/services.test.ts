import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { buildContext } from '../src/agent/context-builder.js';
import { checkStock } from '../src/agent/tools/check-stock.js';
import { createOrder } from '../src/agent/tools/create-order.js';
import { searchProducts } from '../src/agent/tools/search-products.js';
import type { ToolContext } from '../src/agent/tools/types.js';

const prisma = createPrisma();
type Shop = { id: string; customerId: string; serviceId: string; kind: ToolContext['kind'] };
const slugs = ['svc-hvac', 'svc-paint', 'svc-goods'];
const shops = {} as Record<'hvac' | 'paint' | 'goods', Shop>;
const ctx = (s: Shop): ToolContext => ({ db: prisma, businessId: s.id, currency: 'USD', kind: s.kind, conversationId: 'c', customerId: s.customerId, state: { handedOff: false } });

async function mk(slug: string, kind: 'goods' | 'services', category: string, withZone: boolean, trackStock: boolean): Promise<Shop> {
  const b = await prisma.business.create({
    data: {
      name: slug, slug, category, kind, city: 'Austin', country: 'US', currency: 'USD',
      products: { create: { name: kind === 'services' ? 'AC tune-up' : 'Fan', description: 'from price', priceMinor: 8900, stockQty: 0, trackStock } },
      ...(withZone ? { deliveryZones: { create: { areaName: 'North Austin', feeMinor: 2500, etaText: 'same day' } } } : {}),
      customers: { create: { waId: `1555${Math.floor(Math.random() * 1e7)}` } }
    },
    include: { products: true, customers: true }
  });
  return { id: b.id, customerId: b.customers[0]!.id, serviceId: b.products[0]!.id, kind };
}

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  shops.hvac = await mk('svc-hvac', 'services', 'HVAC & air conditioning', true, false);
  shops.paint = await mk('svc-paint', 'services', 'Painting & decorating', false, false); // no service areas set up
  shops.goods = await mk('svc-goods', 'goods', 'Electronics', false, true); // out of stock, no zones
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  await prisma.$disconnect();
});

describe('service businesses (HVAC, painting, ...)', () => {
  it('services are never "out of stock" and do not expose a stock count', async () => {
    const found = (await searchProducts.run(ctx(shops.hvac), { query: 'tune' })) as { results: { in_stock: boolean; stock_qty?: number; price: string }[] };
    expect(found.results[0]).toMatchObject({ in_stock: true, price: '$89' });
    expect(found.results[0]!.stock_qty).toBeUndefined();
    expect(await checkStock.run(ctx(shops.hvac), { product_id: shops.hvac.serviceId })).toMatchObject({ in_stock: true });
  });

  it('records a booking request with a preferred time and a call-out fee, with no stock check', async () => {
    const r = (await createOrder.run(ctx(shops.hvac), { items: [{ product_id: shops.hvac.serviceId, quantity: 1 }], delivery_area: 'North Austin', address: '42 Oak Lane, Austin', preferred_time: 'Thursday morning' })) as Record<string, string>;
    expect(r.status).toMatch(/booking request/);
    expect(r.call_out_fee).toBe('$25');
    expect(r.delivery_fee).toBeUndefined();
    expect(r.total).toBe('$114');
    expect(r.next).toMatch(/confirm the time and the final price/);
    const order = await prisma.order.findFirstOrThrow({ where: { businessId: shops.hvac.id } });
    expect(order.notes).toBe('Preferred time: Thursday morning');
  });

  it('a service business that has not set up areas can still take bookings (no travel fee)', async () => {
    const r = (await createOrder.run(ctx(shops.paint), { items: [{ product_id: shops.paint.serviceId, quantity: 1 }], address: '7 Elm Street, Austin', preferred_time: 'next week' })) as Record<string, string>;
    expect(r).toMatchObject({ total: '$89', call_out_fee: '$0' });
  });

  it('an uncovered area is still refused when areas are configured', async () => {
    expect(await createOrder.run(ctx(shops.hvac), { items: [{ product_id: shops.hvac.serviceId, quantity: 1 }], delivery_area: 'Dallas', address: '1 Far Away Road' })).toMatchObject({ error: expect.stringContaining('not covered') });
  });

  it('goods still need stock and a delivery area', async () => {
    expect(await createOrder.run(ctx(shops.goods), { items: [{ product_id: shops.goods.serviceId, quantity: 1 }], delivery_area: 'Anywhere', address: '1 Some Street' })).toMatchObject({ error: expect.stringContaining('Only 0') });
    await prisma.product.update({ where: { id: shops.goods.serviceId }, data: { stockQty: 5 } });
    expect(await createOrder.run(ctx(shops.goods), { items: [{ product_id: shops.goods.serviceId, quantity: 1 }], address: '1 Some Street' })).toMatchObject({ error: expect.stringContaining('delivery area') });
  });
});

describe('the prompt follows the business type', () => {
  const prompt = async (s: Shop) => {
    const c = await prisma.conversation.create({ data: { businessId: s.id, customerId: s.customerId } });
    return (await buildContext(prisma, { businessId: s.id, conversationId: c.id, customerId: s.customerId })).system;
  };
  it('service prompt is about bookings, quotes and visits, not delivery', async () => {
    const p = await prompt(shops.hvac);
    expect(p).toContain('HOW YOU SELL (services)');
    expect(p).toContain('HVAC & air conditioning');
    expect(p).toMatch(/Never promise a final price for custom work/);
    expect(p).not.toContain('HOW YOU SELL (products)');
  });
  it('goods prompt keeps the delivery flow', async () => {
    const p = await prompt(shops.goods);
    expect(p).toContain('HOW YOU SELL (products)');
    expect(p).not.toContain('HOW YOU SELL (services)');
  });
});
