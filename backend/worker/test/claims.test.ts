import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ChatMessage, LlmClient } from '@wa/ai';
import { needsSaveAttempt, runAgent, ungroundedAmounts, type Tool } from '@wa/agent';
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
const search: Tool = { name: 'search_products', description: 'x', schema: z.object({ query: z.string() }), async run() { ran.push('search_products'); return { results: [{ name: 'Rice (50kg)', price: '₦85,000' }] }; } };
const handoff: Tool = { name: 'handoff_to_human', description: 'x', schema: z.object({ reason: z.string(), summary: z.string() }), async run(ctx) { ran.push('handoff'); ctx.state.handedOff = true; return { handed_off: true }; } };
const payLink: Tool = { name: 'create_payment_link', description: 'x', schema: z.object({ order_id: z.string() }), async run() { return {}; } };
const base = { db: {} as PrismaClient, businessId: 'b', currency: 'NGN', kind: 'goods' as const, conversationId: 'c', customerId: 'u' };
const go = (llm: LlmClient, extra: object = {}, history: ChatMessage[] = [{ role: 'user', content: 'put me on the list for 43' }]) => runAgent({ llm, model: 'm', system: 's', history, ctx: { ...base, ...extra }, tools: [waitlist, payLink, search, handoff] });

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
    expect(a.seen[0]!.tools).toEqual(['join_waitlist', 'search_products', 'handoff_to_human']);
    const b = scripted([say('ok')]);
    await go(b.llm, { payments: { createLink: async () => ({ error: 'x' }) } });
    expect(b.seen[0]!.tools).toEqual(['join_waitlist', 'create_payment_link', 'search_products', 'handoff_to_human']);
  });
});

describe('saying "we do not sell that" without looking', () => {
  it('is sent back to search the catalogue first', async () => {
    ran.length = 0;
    const { llm, seen } = scripted([say("We don't sell rice here. We offer spa services."), call('search_products', { query: 'rice' }), say('Yes, we have Rice (50kg) at ₦85,000.')]);
    const r = await go(llm);
    expect(ran).toEqual(['search_products']);
    expect(r.reply).toBe('Yes, we have Rice (50kg) at ₦85,000.');
    expect(seen[1]!.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringMatching(/did not search the catalogue/) });
  });

  it('is left alone when it did search, even if the answer is no', async () => {
    const { llm, seen } = scripted([call('search_products', { query: 'rice' }), say("Sorry, we don't have rice.")]);
    expect((await go(llm)).reply).toBe("Sorry, we don't have rice.");
    expect(seen).toHaveLength(2);
  });

  it('does not fire on ordinary declines like off-topic questions', async () => {
    for (const text of ["Sorry, I can't help with that. Can I help you with an order?", 'Sorry, I can’t do that.', 'Party packs need 24 hours notice.']) {
      const { llm, seen } = scripted([say(text)]);
      await go(llm);
      expect(seen, text).toHaveLength(1);
    }
  });
});

describe('a customer who says no', () => {
  const u = (content: string): ChatMessage => ({ role: 'user', content });
  const a = (content: string): ChatMessage => ({ role: 'assistant', content });

  it('on the first decline, a reply that just says goodbye is sent back for one friendly attempt', async () => {
    const { llm, seen } = scripted([say('No wahala! Come back any time.'), say('Totally fine! Was it the price, or something else? I can suggest a smaller option.')]);
    const r = await go(llm, {}, [u('how much is the party pack?'), a('₦12,000. Want to order?'), u('No, i am not interested')]);
    expect(r.reply).toMatch(/price, or something else/);
    expect(seen[1]!.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringMatching(/said no for the first time/) });
  });

  it('is not needed when the first reply already makes an attempt', async () => {
    const { llm, seen } = scripted([say('Understood. Was the price the worry?')]);
    await go(llm, {}, [u('how much?'), a('₦12,000.'), u('too expensive')]);
    expect(seen).toHaveLength(1);
  });

  it('never pushes after a second no, or when the customer asks to be left alone', () => {
    const bye = 'Alright, thank you!';
    expect(needsSaveAttempt([u('price?'), a('x'), u('not interested'), a('Was it the price?'), u('no thanks')], bye)).toBe(false);
    expect(needsSaveAttempt([u('price?'), a('x'), u('stop messaging me')], bye)).toBe(false);
    expect(needsSaveAttempt([u('price?'), a('x'), u('no, not interested. stop texting me')], bye)).toBe(false);
  });

  it('does not treat other messages as a decline', () => {
    for (const t of ['no not that one, what about chapman?', 'how much is it?', 'do you have it in black', 'hi']) expect(needsSaveAttempt([u(t)], 'Sure.'), t).toBe(false);
    expect(needsSaveAttempt([u('No')], 'Ok.')).toBe(true);
  });
});

describe('prices the assistant makes up', () => {
  const tool = { results: [{ name: 'Air Runner Sneaker', price: '₦45,000' }], note: 'delivery ₦3,500' };

  it('finds amounts no tool returned, and ignores amounts that are backed, mentioned by the customer, or not money', () => {
    expect(ungroundedAmounts('The Air Runner is ₦45,000.', [], [tool])).toEqual([]);
    expect(ungroundedAmounts('We have Swift Step Sneakers for ₦30,000.', [], [tool])).toEqual(['30,000']);
    expect(ungroundedAmounts('Your total is ₦48,500.', [], [tool])).toEqual(['48,500']); // its own sum, not from create_order
    expect(ungroundedAmounts('Anything under ₦20,000 is fine.', [{ content: 'my budget is 20,000' }], [])).toEqual([]);
    expect(ungroundedAmounts('Delivery takes 45-60 minutes to 12 Admiralty Way, call 0801 234 5678, since 2026, 50kg bag, 24 hours notice.', [], [])).toEqual([]);
    expect(ungroundedAmounts('That is 12,000 NGN', [], [])).toEqual(['12,000']);
  });

  it('sends the model back to look it up, and only the looked-up price reaches the customer', async () => {
    ran.length = 0;
    const found = { name: 'search_products', description: 'x', schema: z.object({ query: z.string() }), async run() { return tool; } } as Tool;
    const { llm, seen } = scripted([say('We have Swift Step Sneakers for ₦30,000.'), call('search_products', { query: 'sneakers' }), say('The Air Runner Sneaker is ₦45,000.')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [{ role: 'user', content: 'too expensive, show me cheaper' }], ctx: { ...base }, tools: [found, handoff] });
    expect(r.reply).toBe('The Air Runner Sneaker is ₦45,000.');
    expect(seen[1]!.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringMatching(/states an amount \(30,000\) that no tool returned/) });
  });

  it('never sends a price it could not back: a holding message goes out and the owner is called in', async () => {
    ran.length = 0;
    const { llm } = scripted([say('Swift Step Sneakers are ₦30,000.')]);
    const r = await go(llm, {}, [{ role: 'user', content: 'cheaper one?' }]);
    expect(r.reply).toMatch(/double-check that price/);
    expect(r.reply).not.toMatch(/30,000/);
    expect(ran).toEqual(['handoff']);
    expect(r.handedOff).toBe(true);
  });
});
