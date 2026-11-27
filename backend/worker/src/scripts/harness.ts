import { createOpenRouterClient, createOpenRouterEmbedder, embeddingModelFromEnv, modelConfigFromEnv, type LlmClient } from '@wa/ai';
import { createPrisma, type PrismaClient } from '@wa/db';
import { encryptSecret } from '@wa/shared';
import { handleInbound, type Deps } from '../jobs/handle-inbound.js';

/**
 * Shared by the `chat` and `eval` scripts: runs the REAL agent (real model, real catalog) against a business,
 * in dry-run mode, so nothing is sent to WhatsApp.
 */
export const DEMO_SLUG = 'lekki-small-chops';
const KEY = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? 'a'.repeat(64);

export interface Harness {
  db: PrismaClient;
  businessId: string;
  /** Send one customer message as a brand-new customer (or the same one if `waId` is reused). */
  say(conversationId: string, customerId: string, text: string): Promise<{ reply: string | null; toolCalls: { name: string; args: unknown; result: unknown }[] }>;
  newCustomer(waId: string, name?: string): Promise<{ conversationId: string; customerId: string }>;
  close(): Promise<void>;
}

export async function createHarness(opts: { llm?: LlmClient; slug?: string } = {}): Promise<Harness> {
  const db = createPrisma();
  const business = await db.business.findUnique({ where: { slug: opts.slug ?? DEMO_SLUG } });
  if (!business) throw new Error(`Business "${opts.slug ?? DEMO_SLUG}" not found. Run: pnpm --filter @wa/db db:seed`);

  // The seeded business already has a WhatsApp account when SEED_PHONE_NUMBER_ID is set; otherwise add a dry-run one.
  let account = await db.whatsappAccount.findFirst({ where: { businessId: business.id } });
  if (!account) {
    account = await db.whatsappAccount.create({ data: { businessId: business.id, wabaId: 'harness', phoneNumberId: `HARNESS-${business.id.slice(-6)}`, displayNumber: '0', accessTokenEncrypted: encryptSecret('x', KEY) } });
  }

  const apiKey = process.env.OPENROUTER_API_KEY ?? '';
  const llm = opts.llm ?? createOpenRouterClient({ apiKey, appTitle: 'Tradeline (harness)' });
  const embedder = apiKey ? createOpenRouterEmbedder({ apiKey, model: embeddingModelFromEnv() }) : null;
  const deps: Deps = {
    db, llm, models: modelConfigFromEnv(), encryptionKey: KEY, dryRun: true, batchWaitMs: 0, log: () => {},
    sendText: async () => 'dry', embedQuery: embedder ? async (t) => (await embedder.embed([t]))[0]! : undefined
  };

  return {
    db,
    businessId: business.id,
    async newCustomer(waId, name = 'Test Customer') {
      const customer = await db.customer.upsert({ where: { businessId_waId: { businessId: business.id, waId } }, create: { businessId: business.id, waId, name }, update: {} });
      const conv = await db.conversation.create({ data: { businessId: business.id, customerId: customer.id, windowExpiresAt: new Date(Date.now() + 86_400_000) } });
      return { conversationId: conv.id, customerId: customer.id };
    },
    async say(conversationId, customerId, text) {
      const msg = await db.message.create({
        data: { businessId: business.id, conversationId, direction: 'inbound', type: 'text', body: text, waMessageId: `harness.${Date.now()}.${Math.random()}`, sentBy: 'customer' }
      });
      const before = await db.agentRun.count({ where: { conversationId } });
      await handleInbound(deps, {
        businessId: business.id, conversationId, customerId, messageId: msg.id, phoneNumberId: account.phoneNumberId,
        waMessageId: msg.waMessageId!, from: (await db.customer.findUniqueOrThrow({ where: { id: customerId } })).waId, type: 'text', body: text, timestamp: Math.floor(Date.now() / 1000)
      });
      const runs = await db.agentRun.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, skip: before });
      const out = await db.message.findFirst({ where: { conversationId, direction: 'outbound' }, orderBy: { seq: 'desc' } });
      return { reply: out?.body ?? null, toolCalls: runs.flatMap((r) => (r.toolCalls as { name: string; args: unknown; result: unknown }[] | null) ?? []) };
    },
    close: () => db.$disconnect()
  };
}
