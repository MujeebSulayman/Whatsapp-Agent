import { createOpenRouterEmbedder, embeddingModelFromEnv } from '@wa/ai';
import { createPrisma, productsMissingEmbedding, setProductEmbedding } from '@wa/db';

/** Index products that have no embedding yet (e.g. the seeded demo catalog). Safe to re-run. */
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('Set OPENROUTER_API_KEY in backend/.env first.');
  process.exit(1);
}
const db = createPrisma();
const embedder = createOpenRouterEmbedder({ apiKey, model: embeddingModelFromEnv() });
let done = 0;
for (;;) {
  const batch = (await productsMissingEmbedding(db)).slice(0, 50);
  if (batch.length === 0) break;
  const vectors = await embedder.embed(batch.map((p) => [p.name, p.description].filter(Boolean).join('. ')));
  for (const [i, p] of batch.entries()) await setProductEmbedding(db, p.businessId, p.id, vectors[i]!);
  done += batch.length;
}
console.log(`Indexed ${done} product(s).`);
await db.$disconnect();
