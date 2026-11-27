import { config } from 'dotenv';
config({ path: '../../.env' }); // backend/.env (cwd is backend/packages/db)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, scoped } from '../src/index.js';

const prisma = createPrisma();
let a = '';
let b = '';
let productOfB = '';

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['test-a', 'test-b'] } } });
  const A = await prisma.business.create({ data: { name: 'A', slug: 'test-a', category: 'x' } });
  const B = await prisma.business.create({
    data: { name: 'B', slug: 'test-b', category: 'x', products: { create: { name: 'secret', priceMinor: 100 } } },
    include: { products: true }
  });
  a = A.id; b = B.id; productOfB = B.products[0]!.id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['test-a', 'test-b'] } } });
  await prisma.$disconnect();
});

describe('tenant isolation', () => {
  it("business A cannot read business B's product by id", async () => {
    expect(await scoped(prisma, a).products.get(productOfB)).toBeNull();
  });
  it('business B can read its own product', async () => {
    expect(await scoped(prisma, b).products.get(productOfB)).not.toBeNull();
  });
  it("business A's product list never includes B's data", async () => {
    expect(await scoped(prisma, a).products.list()).toHaveLength(0);
  });
});
