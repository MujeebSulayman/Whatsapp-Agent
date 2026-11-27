import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';
export { scoped } from './scoped.js';
export { productsMissingEmbedding, searchProductsByVector, setProductEmbedding, type MissingEmbedding } from './vector.js';

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
