import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { parseInbound, type ParsedInbound } from '@wa/whatsapp';
import type { InboundJob } from '@wa/shared';
import { INBOUND_QUEUE, PRISMA } from '../infra.module.js';

export interface JobQueue {
  add(name: string, data: InboundJob, opts?: { jobId?: string }): Promise<unknown>;
}

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';

@Injectable()
export class WhatsappService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(INBOUND_QUEUE) private readonly queue: JobQueue
  ) {}

  /** Persist + enqueue every supported inbound message. Returns how many were newly accepted. */
  async handlePayload(payload: unknown): Promise<number> {
    let accepted = 0;
    for (const msg of parseInbound(payload)) {
      if (await this.acceptOne(msg)) accepted++;
    }
    return accepted;
  }

  private async acceptOne(msg: ParsedInbound): Promise<boolean> {
    // 1. Map phone_number_id -> exactly one business before anything else runs.
    const account = await this.db.whatsappAccount.findUnique({ where: { phoneNumberId: msg.phoneNumberId } });
    if (!account) return false;
    const businessId = account.businessId;

    const customer = await this.db.customer.upsert({
      where: { businessId_waId: { businessId, waId: msg.from } },
      create: { businessId, waId: msg.from, phone: msg.from, name: msg.profileName },
      update: msg.profileName ? { name: msg.profileName } : {}
    });

    let conversation = await this.db.conversation.findFirst({
      where: { businessId, customerId: customer.id, status: { not: 'closed' } },
      orderBy: { lastMessageAt: 'desc' }
    });
    const now = new Date();
    const windowExpiresAt = new Date(now.getTime() + 24 * 3600 * 1000);
    if (conversation) {
      conversation = await this.db.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now, windowExpiresAt }
      });
    } else {
      conversation = await this.db.conversation.create({
        data: { businessId, customerId: customer.id, lastMessageAt: now, windowExpiresAt }
      });
    }

    // 2. Idempotency: wa_message_id is unique; Meta retries deliveries.
    let message;
    try {
      message = await this.db.message.create({
        data: {
          businessId,
          conversationId: conversation.id,
          direction: 'inbound',
          type: msg.type,
          body: msg.body,
          waMessageId: msg.waMessageId,
          sentBy: 'customer'
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }

    // 3. Queue for the worker. Only enqueue when the AI is allowed to answer.
    if (conversation.status === 'ai') {
      await this.queue.add(
        'inbound',
        {
          businessId,
          conversationId: conversation.id,
          customerId: customer.id,
          messageId: message.id,
          phoneNumberId: msg.phoneNumberId,
          waMessageId: msg.waMessageId,
          from: msg.from,
          type: msg.type,
          body: msg.body,
          mediaId: msg.mediaId,
          timestamp: msg.timestamp
        },
        { jobId: msg.waMessageId }
      );
    }
    return true;
  }
}
