import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, setProductEmbedding } from '@wa/db';
import { searchProducts } from '../src/agent/tools/search-products.js';
import type { ToolContext } from '../src/agent/tools/types.js';

const prisma = createPrisma();
const unit = (i: number) => Array.from({ length: 1536 }, (_, k) => (k === i ? 1 : 0));
const ids = { biz: '', other: '', spicy: '', mild: '', foreign: '' };
const ctx = (embed?: ToolContext['embed']): ToolContext => ({ db: prisma, businessId: ids.biz, currency: 'NGN', conversationId: 'c', customerId: 'x', state: { handedOff: false }, embed });
const names = async (c: ToolContext, q: string) => ((await searchProducts.run(c, { query: q })) as { results: { name: string }[] }).results.map((r) => r.name);

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['search-a', 'search-b'] } } });
  const a = await prisma.business.create({ data: { name: 'A', slug: 'search-a', category: 'x', products: { create: [{ name: 'Peppered Wings', description: 'hot and fiery', priceMinor: 450000, stockQty: 5 }, { name: 'Puff Puff', description: 'sweet dough', priceMinor: 250000, stockQty: 5 }] } }, include: { products: true } });
  const b = await prisma.business.create({ data: { name: 'B', slug: 'search-b', category: 'x', products: { create: { name: 'Their Spicy Thing', priceMinor: 100, stockQty: 1 } } }, include: { products: true } });
  ids.biz = a.id; ids.other = b.id;
  ids.spicy = a.products.find((p) => p.name === 'Peppered Wings')!.id; ids.mild = a.products.find((p) => p.name === 'Puff Puff')!.id; ids.foreign = b.products[0]!.id;
  await setProductEmbedding(prisma, a.id, ids.spicy, unit(1));
  await setProductEmbedding(prisma, a.id, ids.mild, unit(2));
  await setProductEmbedding(prisma, b.id, ids.foreign, unit(1));
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['search-a', 'search-b'] } } });
  await prisma.$disconnect();
});

describe('search_products', () => {
  it('finds by meaning when keywords miss, and never leaks another business', async () => {
    expect(await names(ctx(), 'something spicy')).toEqual([]); // keywords alone find nothing
    const found = await names(ctx(async () => unit(1)), 'something spicy'); // "spicy" embeds near Peppered Wings
    expect(found[0]).toBe('Peppered Wings');
    expect(found).not.toContain('Their Spicy Thing');
  });
  it('falls back to keywords when the embedding service fails', async () => {
    expect(await names(ctx(async () => { throw new Error('down'); }), 'puff')).toEqual(['Puff Puff']);
  });
  it('puts meaning matches first and de-duplicates keyword hits', async () => {
    const found = await names(ctx(async () => unit(2)), 'wings');
    expect(found).toEqual(['Puff Puff', 'Peppered Wings']);
  });
});
