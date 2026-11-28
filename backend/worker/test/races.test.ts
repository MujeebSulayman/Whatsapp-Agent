import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { createOrder, joinWaitlist, startPlaybook, type ToolContext } from '@wa/agent';

/** Things that go wrong only when two people act at the same instant. */
const prisma = createPrisma();
let biz: { id: string; custs: string[]; last: string; plenty: string; sized: string; pb: string };
const ctx = (customerId: string): ToolContext => ({ db: prisma, businessId: biz.id, currency: 'NGN', kind: 'goods', conversationId: 'c', customerId, state: { handedOff: false } });
const order = (customerId: string, product_id: string, variant?: string) => createOrder.run(ctx(customerId), { items: [{ product_id, quantity: 1, variant }], delivery_area: 'Lekki', address: '5 Allen Avenue, Lekki' }) as Promise<{ order_id?: string; error?: string }>;

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: 'race-a' } });
  const b = await prisma.business.create({
    data: {
      name: 'race-a', slug: 'race-a', category: 'Fashion', kind: 'goods', city: 'x', country: 'NG', currency: 'NGN',
      deliveryZones: { create: { areaName: 'Lekki', feeMinor: 100000, etaText: '1h' } },
      customers: { create: Array.from({ length: 8 }, (_, i) => ({ waId: `2340${Date.now().toString().slice(-8)}${i}` })) },
      products: { create: [
        { name: 'Last One', priceMinor: 100000, stockQty: 1, trackStock: true },
        { name: 'Plenty', priceMinor: 100000, stockQty: 3, trackStock: true },
        { name: 'Sized', priceMinor: 100000, stockQty: 1, trackStock: true, variants: [{ name: '42', stockQty: 1 }, { name: '43', stockQty: 0 }] as never }
      ] }
    },
    include: { customers: true, products: true }
  });
  const pb = await prisma.playbook.create({ data: { businessId: b.id, name: 'Enquiry', whenToUse: 'any enquiry', steps: [{ id: 's1', ask: 'What do you need?', required: true }], finish: 'message' } });
  biz = { id: b.id, custs: b.customers.map((c) => c.id), last: b.products.find((p) => p.name === 'Last One')!.id, plenty: b.products.find((p) => p.name === 'Plenty')!.id, sized: b.products.find((p) => p.name === 'Sized')!.id, pb: pb.id };
});
afterAll(async () => { await prisma.business.deleteMany({ where: { slug: 'race-a' } }); await prisma.$disconnect(); });

describe('many buyers at once', () => {
  it('only one of eight customers can order the last item', async () => {
    const results = await Promise.all(biz.custs.map((c) => order(c, biz.last)));
    const won = results.filter((r) => r.order_id).length;
    expect(won).toBe(1);
    expect(await prisma.order.count({ where: { businessId: biz.id, items: { path: ['0', 'product_id'], equals: biz.last } } })).toBe(1);
  });

  it('three left means at most three orders when eight try', async () => {
    const results = await Promise.all(biz.custs.map((c) => order(c, biz.plenty)));
    expect(results.filter((r) => r.order_id).length).toBeLessThanOrEqual(3);
  });

  it('the one pair in size 42 goes to one buyer only', async () => {
    const results = await Promise.all(biz.custs.map((c) => order(c, biz.sized, '42')));
    expect(results.filter((r) => r.order_id).length).toBe(1);
  });
});

describe('the same customer clicking twice', () => {
  it('joining the same waitlist many times at once leaves one entry', async () => {
    const c = biz.custs[0]!;
    await Promise.all(Array.from({ length: 6 }, () => joinWaitlist.run(ctx(c), { product_id: biz.last }).catch(() => null)));
    expect(await prisma.waitlistEntry.count({ where: { businessId: biz.id, customerId: c, productId: biz.last, status: 'waiting' } })).toBe(1);
  });

  it('starting the same playbook many times at once leaves one run', async () => {
    const c = biz.custs[1]!;
    await Promise.all(Array.from({ length: 6 }, () => startPlaybook.run(ctx(c), { playbook_id: biz.pb }).catch(() => null)));
    expect(await prisma.playbookRun.count({ where: { businessId: biz.id, customerId: c, playbookId: biz.pb, status: 'active' } })).toBe(1);
  });
});
