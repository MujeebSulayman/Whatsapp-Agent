import { Inject, Injectable, Logger } from '@nestjs/common';
import { createOpenRouterEmbedder, embeddingModelFromEnv } from '@wa/ai';
import { setProductEmbedding, type PrismaClient } from '@wa/db';
import { PRISMA } from '../infra.module.js';

/** Keeps product embeddings fresh for vector search. Silent no-op when no OpenRouter key is configured. */
@Injectable()
export class EmbeddingService {
  private readonly log = new Logger('Embeddings');
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  indexProducts(businessId: string, ids: string[]): void {
    if (!process.env.OPENROUTER_API_KEY || ids.length === 0) return;
    void this.run(businessId, ids).catch((e: Error) => this.log.warn(`indexing failed: ${e.message}`));
  }

  private async run(businessId: string, ids: string[]): Promise<void> {
    const apiKey = process.env.OPENROUTER_API_KEY!;
    const products = await this.db.product.findMany({ where: { id: { in: ids }, businessId } });
    if (!products.length) return;
    const texts = products.map((p) => [p.name, p.description, (p.variants as { name: string }[] | null)?.map((v) => v.name).join(', ')].filter(Boolean).join('. '));
    const vectors = await createOpenRouterEmbedder({ apiKey, model: embeddingModelFromEnv() }).embed(texts);
    for (const [i, p] of products.entries()) await setProductEmbedding(this.db, businessId, p.id, vectors[i]!);
  }
}
