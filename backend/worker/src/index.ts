import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createOpenRouterClient, createOpenRouterEmbedder, embeddingModelFromEnv, modelConfigFromEnv } from '@wa/ai';
import { createPrisma } from '@wa/db';
import { InboundJob, QUEUES, createPaystackClient, maskPhone } from '@wa/shared';
import { sendImage, sendText } from '@wa/whatsapp';
import { handleInbound } from './jobs/handle-inbound.js';
import { redisLocker, redisRateLimiter } from './lock.js';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) console.warn('[worker] OPENROUTER_API_KEY is not set: every AI turn will fall back to the holding message');

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const db = createPrisma();
const dryRun = process.env.WHATSAPP_DRY_RUN === 'true';
const models = modelConfigFromEnv();
const llm = createOpenRouterClient({ apiKey: apiKey ?? '', appTitle: 'Converso' });
const embedder = apiKey ? createOpenRouterEmbedder({ apiKey, model: embeddingModelFromEnv() }) : null;
const embedQuery = embedder ? async (t: string) => (await embedder.embed([t]))[0]! : undefined;
const paystack = process.env.PAYSTACK_SECRET_KEY ? createPaystackClient(process.env.PAYSTACK_SECRET_KEY) : undefined;
if (!paystack) console.warn('[worker] PAYSTACK_SECRET_KEY is not set: the assistant will give bank transfer details instead of payment links');
const locker = redisLocker(redis);
const limiter = redisRateLimiter(redis);

const worker = new Worker(
  QUEUES.inbound,
  async (job) => {
    const data = InboundJob.parse(job.data);
    console.log(`[worker] inbound ${data.waMessageId} from ${maskPhone(data.from)} type=${data.type}`);
    await handleInbound(
      { db, llm, models, paystack, sendText, sendImage, embedQuery, encryptionKey: process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '', dryRun, locker, allow: (c) => limiter(c), batchWaitMs: 3000 },
      data
    );
  },
  { connection: { url: redisUrl }, concurrency: 5 }
);

worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed: ${err.message}`));
console.log(`[worker] listening on ${QUEUES.inbound} models=${models.fast}/${models.smart}${dryRun ? ' (DRY RUN)' : ''}`);
