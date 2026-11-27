import { config } from 'dotenv';
config({ path: '../../.env' });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, productsMissingEmbedding, searchProductsByVector, setProductEmbedding } from '../src/index.js';

const prisma = createPrisma();
const unit = (i: number) => Array.from({ length: 1536 }, (_, k) => (k === i ? 1 : 0));
const near = (i: number, j: number) => Array.from({ length: 1536 }, (_, k) => (k === i ? 1 : k === j ? 0.3 : 0));
const ids = { a: '', b: '', p1: '', p2: '', p3: '', other: '' };

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['vec-a', 'vec-b'] } } });
  const a = await prisma.business.create({ data: { name: 'A', slug: 'vec-a', category: 'x', products: { create: [{ name: 'Jollof', priceKobo: 1, stockQty: 1 }, { name: 'Samosa', priceKobo: 1, stockQty: 1 }, { name: 'Hidden', priceKobo: 1, stockQty: 1, active: false }] } }, include: { products: true } });
  const b = await prisma.business.create({ data: { name: 'B', slug: 'vec-b', category: 'x', products: { create: { name: 'Other tenant jollof', priceKobo: 1, stockQty: 1 } } }, include: { products: true } });
  ids.a = a.id; ids.b = b.id;
  ids.p1 = a.products.find((p) => p.name === 'Jollof')!.id; ids.p2 = a.products.find((p) => p.name === 'Samosa')!.id; ids.p3 = a.products.find((p) => p.name === 'Hidden')!.id;
  ids.other = b.products[0]!.id;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['vec-a', 'vec-b'] } } });
  await prisma.$disconnect();
});

describe('pgvector product search', () => {
  it('lists active products that still need an embedding, then ranks by similarity', async () => {
    expect((await productsMissingEmbedding(prisma, ids.a)).map((p) => p.name).sort()).toEqual(['Jollof', 'Samosa']);
    await setProductEmbedding(prisma, ids.a, ids.p1, unit(0));
    await setProductEmbedding(prisma, ids.a, ids.p2, unit(5));
    await setProductEmbedding(prisma, ids.a, ids.p3, unit(0)); // inactive: must never be returned
    await setProductEmbedding(prisma, ids.b, ids.other, unit(0)); // other tenant, identical vector
    const hits = await searchProductsByVector(prisma, ids.a, near(0, 5), 5);
    expect(hits.map((h) => h.id)).toEqual([ids.p1, ids.p2]);
    expect(hits[0]!.distance).toBeLessThan(hits[1]!.distance);
    expect(await productsMissingEmbedding(prisma, ids.a)).toEqual([]);
  });
  it("never returns another business's products and can't write another business's row", async () => {
    expect((await searchProductsByVector(prisma, ids.a, unit(0))).map((h) => h.id)).not.toContain(ids.other);
    await setProductEmbedding(prisma, ids.a, ids.other, unit(9)); // wrong business id: no-op
    expect((await searchProductsByVector(prisma, ids.b, unit(9))).map((h) => h.id)).toEqual([ids.other]);
    expect((await searchProductsByVector(prisma, ids.b, unit(9)))[0]!.distance).toBeGreaterThan(0.5); // still the unit(0) vector
  });
  it('rejects wrong-sized vectors', async () => {
    await expect(setProductEmbedding(prisma, ids.a, ids.p1, [1, 2, 3])).rejects.toThrow(/1536/);
  });
});
