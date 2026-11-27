import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, LlmClient } from '@wa/ai';
import { createPrisma } from '@wa/db';
import { encryptSecret, type InboundJob } from '@wa/shared';
import { MAX_STEPS } from '@wa/agent';
import { FALLBACK_TEXT, MEDIA_TEXT, handleInbound } from '../src/jobs/handle-inbound.js';

const KEY = 'd'.repeat(64);
const prisma = createPrisma();
const models = { fast: 'fast-m', smart: 'smart-m' };
const usage = { inputTokens: 100, outputTokens: 20, costUsd: 0.001 };

let bizId = '';
let otherBizProductId = '';
let partyPackId = '';

const toolCall = (name: string, args: unknown, id = 'c1'): ChatMessage => ({
  role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]
});
const say = (content: string): ChatMessage => ({ role: 'assistant', content });

/** Scripted model: each step gets the running transcript and returns the next assistant message. */
const scripted = (steps: ((m: ChatMessage[]) => ChatMessage)[]): LlmClient & { calls: ChatMessage[][] } => {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    async chat({ messages }) {
      calls.push([...messages]);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
      return { message: step(messages), usage };
    }
  };
};
const lastToolResult = (m: ChatMessage[]) => JSON.parse([...m].reverse().find((x) => x.role === 'tool')!.content!);

let convId = '';
let job: InboundJob;
const sent: string[] = [];
const deps = (llm: LlmClient) => ({
  db: prisma, llm, models, encryptionKey: KEY, batchWaitMs: 0, log: () => {},
  sendText: async (o: { body: string }) => (sent.push(o.body), `wamid.out.${Math.random()}`)
});

async function newTurn(text: string, type: InboundJob['type'] = 'text') {
  const customer = await prisma.customer.upsert({
    where: { businessId_waId: { businessId: bizId, waId: '2348099999999' } }, create: { businessId: bizId, waId: '2348099999999', name: 'Ada' }, update: {}
  });
  const conv = await prisma.conversation.create({ data: { businessId: bizId, customerId: customer.id } });
  const msg = await prisma.message.create({
    data: { businessId: bizId, conversationId: conv.id, direction: 'inbound', type, body: text, waMessageId: `wamid.${Math.random()}`, sentBy: 'customer' }
  });
  convId = conv.id;
  job = { businessId: bizId, conversationId: conv.id, customerId: customer.id, messageId: msg.id, phoneNumberId: 'AGENT-PNID', waMessageId: msg.waMessageId!, from: '2348099999999', type, body: text, timestamp: 1 };
}

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['agent-test', 'agent-other'] } } });
  const other = await prisma.business.create({ data: { name: 'Other', slug: 'agent-other', category: 'x', products: { create: { name: 'Secret Cake', priceMinor: 100, stockQty: 5 } } }, include: { products: true } });
  otherBizProductId = other.products[0]!.id;
  const b = await prisma.business.create({
    data: {
      name: 'Agent Test Chops', slug: 'agent-test', category: 'small chops',
      whatsappAccounts: { create: { wabaId: 'W', phoneNumberId: 'AGENT-PNID', displayNumber: '1', accessTokenEncrypted: encryptSecret('T', KEY) } },
      aiRules: { create: { maxDiscountPct: 5 } },
      deliveryZones: { create: { areaName: 'Lekki Phase 1', feeMinor: 200_000, etaText: '45 minutes' } },
      products: { create: [{ name: 'Party Pack', description: 'serves 10', priceMinor: 1_200_000, stockQty: 3 }] }
    },
    include: { products: true }
  });
  bizId = b.id;
  partyPackId = b.products[0]!.id;
});
beforeEach(() => { sent.length = 0; });
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['agent-test', 'agent-other'] } } });
  await prisma.$disconnect();
});

describe('agent loop', () => {
  it('runs search -> create_order -> reply, with server-calculated totals and a logged run', async () => {
    await newTurn('I want 1 party pack to Lekki Phase 1, 12 Admiralty Way');
    const llm = scripted([
      () => toolCall('search_products', { query: 'party pack' }),
      (m) => toolCall('create_order', {
        items: [{ product_id: lastToolResult(m).results[0].product_id, quantity: 1 }], delivery_area: 'Lekki Phase 1', address: '12 Admiralty Way, Lekki'
      }),
      (m) => say(`Done! Total na ${lastToolResult(m).total}.`)
    ]);
    await handleInbound(deps(llm), job);

    expect(sent).toEqual(['Done! Total na ₦14,000.']);
    const order = await prisma.order.findFirstOrThrow({ where: { businessId: bizId, customerId: job.customerId }, orderBy: { createdAt: 'desc' } });
    expect([order.subtotalMinor, order.deliveryFeeMinor, order.totalMinor]).toEqual([1_200_000, 200_000, 1_400_000]);
    const run = await prisma.agentRun.findFirstOrThrow({ where: { conversationId: convId } });
    expect([run.inputTokens, run.outputTokens]).toEqual([300, 60]);
    expect(run.model).toBe('smart-m');
    expect((run.toolCalls as { name: string }[]).map((t) => t.name)).toEqual(['search_products', 'create_order']);
  });

  it('system prompt carries the rules and the model never sees other tenants data', async () => {
    await prisma.order.deleteMany({ where: { businessId: bizId } }); // no open order -> eligible for the cheap model
    await newTurn('hello');
    const llm = scripted([() => say('Welcome!')]);
    await handleInbound(deps(llm), job);
    const system = llm.calls[0]![0]!.content!;
    expect(system).toContain('Max discount: 5%');
    expect(system).toContain('Agent Test Chops');
    expect(system).not.toContain('Secret Cake');
    expect((await prisma.agentRun.findFirstOrThrow({ where: { conversationId: convId } })).model).toBe('fast-m'); // greeting -> cheap model
  });

  it("rejects a product id from another business (injection) and creates no order", async () => {
    await newTurn('order the secret cake');
    const before = await prisma.order.count({ where: { businessId: bizId } });
    const llm = scripted([
      () => toolCall('create_order', { items: [{ product_id: otherBizProductId, quantity: 1 }], delivery_area: 'Lekki Phase 1', address: '12 Admiralty Way' }),
      (m) => say(lastToolResult(m).error ? 'Sorry, I could not find that item.' : 'Ordered!')
    ]);
    await handleInbound(deps(llm), job);
    expect(sent).toEqual(['Sorry, I could not find that item.']);
    expect(await prisma.order.count({ where: { businessId: bizId } })).toBe(before);
  });

  it('refuses to oversell and validates arguments', async () => {
    await newTurn('I want 10 party packs');
    const llm = scripted([
      () => toolCall('create_order', { items: [{ product_id: partyPackId, quantity: 10 }], delivery_area: 'Lekki Phase 1', address: '12 Admiralty Way' }),
      () => toolCall('create_order', { items: [{ product_id: partyPackId, quantity: -1 }] }, 'c2'),
      (m) => say(String(lastToolResult(m).error).startsWith('Invalid arguments') ? 'bad args' : 'unexpected')
    ]);
    await handleInbound(deps(llm), job);
    expect(llm.calls[1]!.at(-1)!.content).toContain('Only 3 of');
    expect(sent).toEqual(['bad args']);
  });

  it('handoff_to_human flips the conversation to human and writes an audit log', async () => {
    await newTurn('my food was bad, I want a refund');
    const llm = scripted([
      () => toolCall('handoff_to_human', { reason: 'refund request', summary: 'Customer wants a refund' }),
      () => say('Sorry about that. A team member will reply shortly.')
    ]);
    await handleInbound(deps(llm), job);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: convId } })).status).toBe('human');
    expect(await prisma.auditLog.count({ where: { businessId: bizId, action: 'handoff' } })).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
  });

  it('stops at the step cap and hands off instead of looping forever', async () => {
    await newTurn('loop forever');
    const llm = scripted([() => toolCall('search_products', { query: 'x' })]);
    await handleInbound(deps(llm), job);
    expect(llm.calls).toHaveLength(MAX_STEPS);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: convId } })).status).toBe('human');
    expect(sent).toEqual([FALLBACK_TEXT]);
  });

  it('sends a fallback and audits when the LLM is down', async () => {
    await newTurn('hello there, how much?');
    const llm: LlmClient = { chat: async () => { throw new Error('OpenRouter 503'); } };
    await handleInbound(deps(llm), job);
    expect(sent).toEqual([FALLBACK_TEXT]);
    expect(await prisma.auditLog.count({ where: { businessId: bizId, action: 'agent_failure' } })).toBeGreaterThan(0);
  });

  it('does nothing when a human has taken over, and handles voice notes gracefully', async () => {
    await newTurn('hi');
    await prisma.conversation.update({ where: { id: convId }, data: { status: 'human' } });
    const llm = scripted([() => say('should not be sent')]);
    await handleInbound(deps(llm), job);
    expect(sent).toHaveLength(0);
    expect(llm.calls).toHaveLength(0);

    await newTurn('', 'audio');
    await handleInbound(deps(llm), job);
    expect(sent).toEqual([MEDIA_TEXT]);
  });

  it('skips a message when a newer one in the same conversation will answer (batching)', async () => {
    await newTurn('first');
    await prisma.message.create({ data: { businessId: bizId, conversationId: convId, direction: 'inbound', type: 'text', body: 'second', waMessageId: `wamid.${Math.random()}`, sentBy: 'customer' } });
    const llm = scripted([() => say('reply')]);
    await handleInbound(deps(llm), job);
    expect(sent).toHaveLength(0);
  });
});
