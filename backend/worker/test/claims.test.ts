import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ChatMessage, LlmClient } from '@wa/ai';
import { runAgent, type Tool } from '@wa/agent';
import type { PrismaClient } from '@wa/db';

const usage = { inputTokens: 1, outputTokens: 1, costUsd: 0 };
const say = (content: string): ChatMessage => ({ role: 'assistant', content });
const call = (name: string, args: unknown): ChatMessage => ({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const scripted = (steps: ChatMessage[]) => {
  const seen: { messages: ChatMessage[]; tools: string[] }[] = [];
  const llm: LlmClient = { async chat(req) { seen.push({ messages: [...req.messages], tools: (req.tools ?? []).map((t) => t.function.name) }); return { message: steps[Math.min(seen.length - 1, steps.length - 1)]!, usage, model: req.model }; } };
  return { llm, seen };
};
const ran: string[] = [];
const waitlist: Tool = { name: 'join_waitlist', description: 'x', schema: z.object({ product_id: z.string() }), async run() { ran.push('join_waitlist'); return { on_waitlist: true }; } };
const payLink: Tool = { name: 'create_payment_link', description: 'x', schema: z.object({ order_id: z.string() }), async run() { return {}; } };
const base = { db: {} as PrismaClient, businessId: 'b', currency: 'NGN', kind: 'goods' as const, conversationId: 'c', customerId: 'u' };
const go = (llm: LlmClient, extra: object = {}) => runAgent({ llm, model: 'm', system: 's', history: [{ role: 'user', content: 'put me on the list for 43' }], ctx: { ...base, ...extra }, tools: [waitlist, payLink] });

describe('claims without action', () => {
  it('when the model says it added the customer to the waitlist without calling the tool, it is made to call it', async () => {
    ran.length = 0;
    const { llm, seen } = scripted([say("I'll add you to the waitlist for size 43."), call('join_waitlist', { product_id: 'p1' }), say('Done, you are on the waitlist for size 43.')]);
    const r = await go(llm);
    expect(ran).toEqual(['join_waitlist']);
    expect(r.reply).toBe('Done, you are on the waitlist for size 43.');
    expect(seen[1]!.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringMatching(/join_waitlist has not succeeded/) });
  });

  it('does not interfere when the tool really ran', async () => {
    ran.length = 0;
    const { llm, seen } = scripted([call('join_waitlist', { product_id: 'p1' }), say("You're on the waitlist for size 43.")]);
    const r = await go(llm);
    expect(r.reply).toBe("You're on the waitlist for size 43.");
    expect(seen).toHaveLength(2);
  });

  it('asks only once, so a stubborn model cannot loop forever', async () => {
    const { llm, seen } = scripted([say("I'll add you to the waitlist.")]);
    const r = await go(llm);
    expect(seen).toHaveLength(2);
    expect(r.reply).toBe("I'll add you to the waitlist.");
  });

  it('ordinary replies and mentions of the waitlist as an offer are left alone', async () => {
    const { llm, seen } = scripted([say('Size 43 is sold out. Would you like me to put you on the waitlist?')]);
    expect((await go(llm)).reply).toMatch(/Would you like/);
    expect(seen).toHaveLength(1);
  });
});

describe('payment link tool', () => {
  it('is offered to the model only when the business has online payments', async () => {
    const a = scripted([say('ok')]);
    await go(a.llm);
    expect(a.seen[0]!.tools).toEqual(['join_waitlist']);
    const b = scripted([say('ok')]);
    await go(b.llm, { payments: { createLink: async () => ({ error: 'x' }) } });
    expect(b.seen[0]!.tools).toEqual(['join_waitlist', 'create_payment_link']);
  });
});
