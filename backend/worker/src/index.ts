import { Worker } from 'bullmq';
import { QUEUES, InboundJob } from '@wa/shared';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

const worker = new Worker(
  QUEUES.inbound,
  async (job) => {
    const msg = InboundJob.parse(job.data);
    // Phase 3 replaces this with the echo; Phase 4 with the agent loop.
    console.log(`[worker] inbound ${msg.waMessageId} type=${msg.type}`);
  },
  { connection }
);

worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed: ${err.message}`));
console.log('[worker] listening on', QUEUES.inbound);
