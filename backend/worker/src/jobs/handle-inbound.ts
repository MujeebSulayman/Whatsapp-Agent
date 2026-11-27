import type { PrismaClient } from '@wa/db';
import { decryptSecret, maskPhone, type InboundJob } from '@wa/shared';

export type SendText = (o: { phoneNumberId: string; accessToken: string; to: string; body: string }) => Promise<string>;

export interface Deps {
  db: PrismaClient;
  sendText: SendText;
  encryptionKey: string;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

/**
 * Phase 3: echo the customer's text back. Phase 4 replaces `buildReply` with the agent loop.
 */
export async function buildReply(job: InboundJob): Promise<string | null> {
  if (job.type === 'text' || job.type === 'interactive') return `Echo: ${job.body ?? ''}`;
  return null; // voice/image handled in later phases
}

export async function handleInbound(deps: Deps, job: InboundJob): Promise<void> {
  const log = deps.log ?? console.log;
  const { db } = deps;

  const account = await db.whatsappAccount.findFirst({
    where: { phoneNumberId: job.phoneNumberId, businessId: job.businessId }
  });
  if (!account) throw new Error(`No WhatsApp account for business ${job.businessId}`);

  // Re-check the conversation is still AI-owned (owner may have taken over meanwhile).
  const conversation = await db.conversation.findFirst({ where: { id: job.conversationId, businessId: job.businessId } });
  if (!conversation || conversation.status !== 'ai') {
    log(`[worker] skip ${job.waMessageId}: conversation not in AI mode`);
    return;
  }

  const reply = await buildReply(job);
  if (!reply) return;

  let waId = '';
  if (deps.dryRun) {
    log(`[worker] DRY RUN reply to ${maskPhone(job.from)}: ${reply}`);
  } else {
    const token = decryptSecret(account.accessTokenEncrypted, deps.encryptionKey);
    waId = await deps.sendText({ phoneNumberId: job.phoneNumberId, accessToken: token, to: job.from, body: reply });
  }

  await db.message.create({
    data: {
      businessId: job.businessId,
      conversationId: job.conversationId,
      direction: 'outbound',
      type: 'text',
      body: reply,
      waMessageId: waId || null,
      status: deps.dryRun ? 'dry_run' : 'sent',
      sentBy: 'ai'
    }
  });
}
