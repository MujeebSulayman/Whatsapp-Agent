import type { PrismaClient } from './generated/client.js';

const DIMS = 1536;
const literal = (v: number[]): string => {
  if (v.length !== DIMS) throw new Error(`Embedding must have ${DIMS} dimensions`);
  return `[${v.join(',')}]`;
};

/** Store a product embedding. Scoped by business so one tenant can never write another's row. */
export async function setProductEmbedding(db: PrismaClient, businessId: string, productId: string, vector: number[]): Promise<void> {
  await db.$executeRaw`UPDATE products SET embedding = ${literal(vector)}::vector WHERE id = ${productId} AND business_id = ${businessId}`;
}

/** Nearest active products by cosine distance, within ONE business. */
export async function searchProductsByVector(db: PrismaClient, businessId: string, vector: number[], limit = 5): Promise<{ id: string; distance: number }[]> {
  const lit = literal(vector);
  return db.$queryRaw<{ id: string; distance: number }[]>`
    SELECT id, (embedding <=> ${lit}::vector)::float8 AS distance
    FROM products
    WHERE business_id = ${businessId} AND active = true AND embedding IS NOT NULL
    ORDER BY embedding <=> ${lit}::vector
    LIMIT ${limit}`;
}

export interface MissingEmbedding { id: string; businessId: string; name: string; description: string | null }

/** Active products that still need an embedding (optionally for one business). */
export async function productsMissingEmbedding(db: PrismaClient, businessId?: string): Promise<MissingEmbedding[]> {
  return businessId
    ? db.$queryRaw<MissingEmbedding[]>`SELECT id, business_id AS "businessId", name, description FROM products WHERE embedding IS NULL AND active = true AND business_id = ${businessId} LIMIT 500`
    : db.$queryRaw<MissingEmbedding[]>`SELECT id, business_id AS "businessId", name, description FROM products WHERE embedding IS NULL AND active = true LIMIT 500`;
}
