import type { PrismaClient } from '@wa/db';
import { pickModel, type LlmClient, type ModelConfig } from '@wa/ai';
import { decryptSecret, maskPhone, type InboundJob } from '@wa/shared';
import { buildContext } from '../agent/context-builder.js';
import { runAgent } from '../agent/run-agent.js';
import type { Locker } from '../lock.js';

export type SendText = (o: { phoneNumberId: string; accessToken: string; to: string; body: string }) => Promise<string>;

export interface Deps {
  db: PrismaClient;
  llm: LlmClient;
  models: ModelConfig;
  sendText: SendText;
  encryptionKey: string;
  dryRun?: boolean;
  locker?: Locker;
  /** Returns false when the customer is over their rate limit. */
  allow?: (customerId: string) => Promise<boolean>;
  /** Wait to batch rapid-fire messages into one turn. */
  batchWaitMs?: number;
  log?: (msg: string) => void;
}

export const FALLBACK_TEXT = "Give me one moment, I'll get back to you.";
export const MEDIA_TEXT = 'Please type your message for now, abeg. Voice notes and pictures are coming soon.';

export async function handleInbound(deps: Deps, job: InboundJob): Promise<void> {
  const log = deps.log ?? console.log;
  const { db } = deps;

  const account = await db.whatsappAccount.findFirst({ where: { phoneNumberId: job.phoneNumberId, businessId: job.businessId } });
  if (!account) throw new Error(`No WhatsApp account for business ${job.businessId}`);

  // 1. Batch rapid-fire messages, then lock the conversation.
  if (deps.batchWaitMs) await new Promise((r) => setTimeout(r, deps.batchWaitMs));
  const release = deps.locker ? await deps.locker.acquire(`conv:${job.conversationId}`) : async () => {};
  if (!release) throw new Error('Could not lock conversation'); // BullMQ retries with backoff
  try {
    await turn(deps, job, account.accessTokenEncrypted, log);
  } finally {
    await release();
  }
}

async function turn(deps: Deps, job: InboundJob, tokenEnc: string, log: (m: string) => void): Promise<void> {
  const { db } = deps;
  const scope = { businessId: job.businessId, conversationId: job.conversationId };

  // Owner may have taken over meanwhile.
  const conversation = await db.conversation.findFirst({ where: { id: job.conversationId, businessId: job.businessId } });
  if (!conversation || conversation.status !== 'ai') return log(`[worker] skip ${job.waMessageId}: not in AI mode`);

  // Only the newest unanswered customer message triggers a reply (it sees the whole batch in history).
  const latest = await db.message.findFirst({ where: { ...scope, direction: 'inbound' }, orderBy: { seq: 'desc' } });
  if (latest && latest.id !== job.messageId) return log(`[worker] skip ${job.waMessageId}: newer message will answer`);
  const answered = await db.message.findFirst({ where: { ...scope, direction: 'outbound', seq: { gt: latest?.seq ?? 0 } } });
  if (answered) return log(`[worker] skip ${job.waMessageId}: already answered`);

  const send = async (body: string, status = 'sent') => {
    let waId = '';
    if (deps.dryRun) log(`[worker] DRY RUN reply to ${maskPhone(job.from)}: ${body}`);
    else {
      const accessToken = decryptSecret(tokenEnc, deps.encryptionKey);
      waId = await deps.sendText({ phoneNumberId: job.phoneNumberId, accessToken, to: job.from, body });
    }
    await db.message.create({
      data: { ...scope, direction: 'outbound', type: 'text', body, waMessageId: waId || null, status: deps.dryRun ? 'dry_run' : status, sentBy: 'ai' }
    });
  };

  if (deps.allow && !(await deps.allow(job.customerId))) return log(`[worker] rate limited ${maskPhone(job.from)}`);
  if (job.type === 'audio' || job.type === 'image') return send(MEDIA_TEXT);

  const started = Date.now();
  try {
    const ctx = await buildContext(db, { businessId: job.businessId, conversationId: job.conversationId, customerId: job.customerId });
    const model = pickModel(deps.models, { lastMessage: ctx.lastCustomerText, hasOpenOrder: ctx.hasOpenOrder });
    const result = await runAgent({
      llm: deps.llm, model, system: ctx.system, history: ctx.history,
      ctx: { db, businessId: job.businessId, conversationId: job.conversationId, customerId: job.customerId }
    });

    await db.agentRun.create({
      data: {
        businessId: job.businessId, conversationId: job.conversationId, model: result.model,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd,
        toolCalls: result.toolCalls as never, latencyMs: Date.now() - started
      }
    });

    if (result.hitStepCap && !result.handedOff) {
      await db.conversation.updateMany({ where: { id: job.conversationId, businessId: job.businessId }, data: { status: 'human' } });
      log(`[handoff] step cap hit business=${job.businessId}`);
    }
    await send(result.reply || FALLBACK_TEXT);
  } catch (err) {
    // AI failed: fallback to the customer and alert the owner (owner alerts are wired in the dashboard phase).
    log(`[worker] agent failed for ${job.waMessageId}: ${(err as Error).message}`);
    await db.auditLog.create({ data: { businessId: job.businessId, actor: 'system', action: 'agent_failure', payload: { error: (err as Error).message } } });
    await send(FALLBACK_TEXT);
  }
}
