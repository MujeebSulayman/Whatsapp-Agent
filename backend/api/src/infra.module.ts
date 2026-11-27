import { Global, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createPrisma } from '@wa/db';
import { QUEUES } from '@wa/shared';

export const PRISMA = 'PRISMA';
export const INBOUND_QUEUE = 'INBOUND_QUEUE';
export const REDIS = 'REDIS';

@Global()
@Module({
  providers: [
    { provide: PRISMA, useFactory: () => createPrisma() },
    { provide: REDIS, useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }) },
    {
      provide: INBOUND_QUEUE,
      useFactory: () =>
        new Queue(QUEUES.inbound, {
          connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
          defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: false }
        })
    }
  ],
  exports: [PRISMA, INBOUND_QUEUE, REDIS]
})
export class InfraModule {}
