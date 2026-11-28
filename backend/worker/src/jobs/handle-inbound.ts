import type { PrismaClient } from '@wa/db';
import { pickModel, type LlmClient, type ModelConfig } from '@wa/ai';
import { decryptSecret, maskPhone, type InboundJob, type PaystackClient } from '@wa/shared';
import { buildContext } from '@wa/agent';
import { createPaymentsPort, runAgent } from '@wa/agent';
import type { Locker } from '../lock.js';

export type SendText = (o: { phoneNumberId: string; accessToken: string; to: string; body: string }) => Promise<string>;
export type SendImage = (o: { phoneNumberId: string; accessToken: string; to: string; url: string; caption?: string }) => Promise<string>;

export interface Deps {
  /** When set, the assistant can send online payment links. */
  paystack?: PaystackClient;
  db: PrismaClient;
  llm: LlmClient;
  models: ModelConfig;
  sendText: SendText;
  sendImage?: SendImage;
  /** Embeds a search query; enables vector product search. */
  embedQuery?: (text: string) => Promise<number[]>;
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

const period = () => new Date().toISOString().slice(0, 7);

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

  const business = await db.business.findUnique({ where: { id: job.businessId } });
  if (!business) return;
  // The owner's AI on/off switch is respected before anything else.
  if (!business.aiEnabled) return log(`[worker] skip ${job.waMessageId}: AI is switched off for this business`);

  // Owner may have taken over meanwhile.
  const conversation = await db.conversation.findFirst({ where: { id: job.conversationId, businessId: job.businessId } });
  if (!conversation || conversation.status !== 'ai') return log(`[worker] skip ${job.waMessageId}: not in AI mode`);

  // Only the newest unanswered customer message triggers a reply (it sees the whole batch in history).
  const latest = await db.message.findFirst({ where: { ...scope, direction: 'inbound' }, orderBy: { seq: 'desc' } });
  if (latest && latest.id !== job.messageId) return log(`[worker] skip ${job.waMessageId}: newer message will answer`);
  const answered = await db.message.findFirst({ where: { ...scope, direction: 'outbound', seq: { gt: latest?.seq ?? 0 } } });
  if (answered) return log(`[worker] skip ${job.waMessageId}: already answered`);

  const accessToken = () => decryptSecret(tokenEnc, deps.encryptionKey);

  const bump = (aiReplies: number) =>
    db.usageLedger.upsert({
      where: { businessId_period: { businessId: job.businessId, period: period() } },
      create: { businessId: job.businessId, period: period(), aiReplies, waMessagesBilled: 1 },
      update: { aiReplies: { increment: aiReplies }, waMessagesBilled: { increment: 1 } }
    });

  const send = async (body: string, aiReply = true) => {
    let waId = '';
    if (deps.dryRun) log(`[worker] DRY RUN reply to ${maskPhone(job.from)}: ${body}`);
    else waId = await deps.sendText({ phoneNumberId: job.phoneNumberId, accessToken: accessToken(), to: job.from, body });
    await db.message.create({
      data: { ...scope, direction: 'outbound', type: 'text', body, waMessageId: waId || null, status: deps.dryRun ? 'dry_run' : 'sent', sentBy: 'ai' }
    });
    await bump(aiReply ? 1 : 0);
  };

  /** Best-effort WhatsApp message to the owner's own number. Never blocks or fails the customer's reply. */
  const alertOwner = async (text: string) => {
    if (!business.ownerPhone) return;
    try {
      if (deps.dryRun) return log(`[worker] DRY RUN owner alert to ${maskPhone(business.ownerPhone)}: ${text}`);
      await deps.sendText({ phoneNumberId: job.phoneNumberId, accessToken: accessToken(), to: business.ownerPhone, body: text });
    } catch (e) {
      log(`[worker] owner alert failed: ${(e as Error).message}`);
    }
  };

  if (deps.allow && !(await deps.allow(job.customerId))) return log(`[worker] rate limited ${maskPhone(job.from)}`);
  if (job.type === 'audio' || job.type === 'image') return send(MEDIA_TEXT, false);

  // Per-business daily AI spend cap, so one noisy or abusive chat can't run up the bill.
  const startOfDay = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const spent = await db.agentRun.aggregate({ where: { businessId: job.businessId, createdAt: { gte: startOfDay } }, _sum: { costUsd: true } });
  if (Number(spent._sum.costUsd ?? 0) >= Number(business.aiDailyCapUsd)) {
    await db.conversation.updateMany({ where: { id: job.conversationId, businessId: job.businessId }, data: { status: 'human' } });
    await db.auditLog.create({ data: { businessId: job.businessId, actor: 'system', action: 'ai_cap_reached', payload: { capUsd: String(business.aiDailyCapUsd) } } });
    await send(FALLBACK_TEXT, false);
    return alertOwner(`AI paused: the assistant reached its daily usage limit. A customer (${maskPhone(job.from)}) is waiting in your inbox.`);
  }

  const started = Date.now();
  try {
    const ctx = await buildContext(db, { businessId: job.businessId, conversationId: job.conversationId, customerId: job.customerId });
    const model = pickModel(deps.models, { lastMessage: ctx.lastCustomerText, hasOpenOrder: ctx.hasOpenOrder });
    const sendImage = deps.sendImage
      ? async (o: { url: string; caption?: string }) => {
          if (deps.dryRun) return log(`[worker] DRY RUN image to ${maskPhone(job.from)}: ${o.url}`);
          await deps.sendImage!({ phoneNumberId: job.phoneNumberId, accessToken: accessToken(), to: job.from, url: o.url, caption: o.caption });
          await db.message.create({ data: { ...scope, direction: 'outbound', type: 'image', body: o.caption ?? null, mediaUrl: o.url, status: 'sent', sentBy: 'ai' } });
        }
      : undefined;
    const result = await runAgent({
      llm: deps.llm, model, system: ctx.system, history: ctx.history, escalateKeywords: ctx.escalateKeywords,
      ctx: { db, businessId: job.businessId, currency: business.currency, kind: business.kind, conversationId: job.conversationId, customerId: job.customerId, sendImage, embed: deps.embedQuery, payments: deps.paystack && ctx.onlinePayments ? createPaymentsPort({ db, paystack: deps.paystack, businessId: job.businessId, customerId: job.customerId }) : undefined }
    });

    await db.agentRun.create({
      data: {
        businessId: job.businessId, conversationId: job.conversationId, model: result.model,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd,
        toolCalls: result.toolCalls as never, latencyMs: Date.now() - started
      }
    });

    let handoffNote: string | null = null;
    if (result.hitStepCap && !result.handedOff) {
      await db.conversation.updateMany({ where: { id: job.conversationId, businessId: job.businessId }, data: { status: 'human' } });
      handoffNote = 'The assistant got stuck on a conversation';
    } else if (result.handedOff) {
      const h = result.toolCalls.find((t) => t.name === 'handoff_to_human')?.args as { reason?: string; summary?: string } | undefined;
      handoffNote = `Customer needs you: ${h?.reason ?? 'handoff'}. ${h?.summary ?? ''}`.trim();
    }
    await send(result.reply || FALLBACK_TEXT);
    if (handoffNote) await alertOwner(`${handoffNote} (${maskPhone(job.from)}). Open your dashboard inbox to reply.`);
  } catch (err) {
    log(`[worker] agent failed for ${job.waMessageId}: ${(err as Error).message}`);
    await db.auditLog.create({ data: { businessId: job.businessId, actor: 'system', action: 'agent_failure', payload: { error: (err as Error).message } } });
    await send(FALLBACK_TEXT, false);
    await alertOwner(`The assistant had a problem replying to a customer (${maskPhone(job.from)}). Please check your inbox.`);
  }
}
