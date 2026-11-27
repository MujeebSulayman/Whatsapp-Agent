import { Worker } from 'bullmq';
import { createPrisma } from '@wa/db';
import { InboundJob, QUEUES, maskPhone } from '@wa/shared';
import { sendText } from '@wa/whatsapp';
import { handleInbound } from './jobs/handle-inbound.js';

const encryptionKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '';
const dryRun = process.env.WHATSAPP_DRY_RUN === 'true';
const db = createPrisma();
const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

const worker = new Worker(
  QUEUES.inbound,
  async (job) => {
    const data = InboundJob.parse(job.data);
    console.log(`[worker] inbound ${data.waMessageId} from ${maskPhone(data.from)} type=${data.type}`);
    await handleInbound({ db, sendText, encryptionKey, dryRun }, data);
  },
  { connection, concurrency: 5 }
);

worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed: ${err.message}`));
console.log(`[worker] listening on ${QUEUES.inbound}${dryRun ? ' (DRY RUN: replies are logged, not sent)' : ''}`);
