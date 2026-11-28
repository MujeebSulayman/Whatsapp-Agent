import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ChatMessage, LlmClient } from '@wa/ai';
import { claimsPaymentReceived, dropSentences, escalationHit, hasModelArtifacts, needsSaveAttempt, runAgent, stripArtifacts, toWhatsAppText, ungroundedAmounts, wantsHuman, withoutAmounts, type Tool } from '@wa/agent';
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

  it('an owner who prefers to let customers go is never nudged to keep them', async () => {
    const { llm, seen } = scripted([say('No wahala! Come back any time.')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [u('how much?'), a('₦12,000.'), u('No, i am not interested')], ctx: { ...base }, tools: [search, handoff], keepCustomers: false });
    expect(r.reply).toBe('No wahala! Come back any time.');
    expect(seen).toHaveLength(1);
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

  it('never sends a price it could not back, and never abandons the customer: that sentence is removed, no handoff', async () => {
    ran.length = 0;
    const { llm, seen } = scripted([say('Swift Step Sneakers are ₦30,000. The Air Runner is ₦45,000 and ready to order.')]);
    const r = await go(llm, {}, [{ role: 'assistant', content: 'The Air Runner is ₦45,000.' }, { role: 'user', content: 'cheaper one?' }]);
    expect(seen).toHaveLength(3); // the first answer plus two corrections
    expect(r.reply).toBe('The Air Runner is ₦45,000 and ready to order.');
    expect(r.reply).not.toMatch(/30,000|Swift/);
    expect(ran).not.toContain('handoff');
    expect(r.handedOff).toBe(false);
  });

  it('if nothing usable is left it asks what they want, rather than stalling or handing over', async () => {
    ran.length = 0;
    const { llm } = scripted([say('Swift Step Sneakers are ₦30,000.')]);
    const r = await go(llm, {}, [{ role: 'user', content: 'cheaper one?' }]);
    expect(r.reply).toBe('Tell me which item you would like and I will get you the exact price right away.');
    expect(ran).not.toContain('handoff');
    expect(r.handedOff).toBe(false);
  });
});

describe('removing sentences with unbacked amounts', () => {
  it('keeps everything else, line by line', () => {
    expect(withoutAmounts('Rice is ₦85,000. Garri is ₦99,999. Want both?', ['99,999'])).toBe('Rice is ₦85,000. Want both?');
    expect(withoutAmounts('1. Rice - ₦85,000\n2. Fake - ₦1,234\n3. Salt - ₦1,500', ['1,234'])).toBe('1. Rice - ₦85,000\n3. Salt - ₦1,500');
    expect(withoutAmounts('That is 30k.', ['30k'])).toMatch(/exact price right away/);
  });
});

describe('WhatsApp formatting is fixed in code', () => {
  it('turns markdown into what WhatsApp shows', () => {
    expect(toWhatsAppText('1. **Closest to your budget:** Rice')).toBe('1. *Closest to your budget:* Rice');
    expect(toWhatsAppText('## Menu\nRice')).toBe('Menu\nRice');
    expect(toWhatsAppText('Pay here [Pay Now](https://checkout.paystack.com/abc)')).toBe('Pay here Pay Now: https://checkout.paystack.com/abc');
    expect(toWhatsAppText('Plain text ₦5,000 stays as it is.')).toBe('Plain text ₦5,000 stays as it is.');
  });
  it('is applied to what the customer receives', async () => {
    const { llm } = scripted([say('Here is **the list**:\n## Rice')]);
    expect((await go(llm)).reply).toBe('Here is *the list*:\nRice');
  });
});

describe('the owner\'s "call me in when they say" words', () => {
  const u = (content: string): ChatMessage => ({ role: 'user', content });
  it('are found as whole words, in any case, including several words and symbols', () => {
    expect(escalationHit('I want a REFUND now', ['refund', 'lawyer'])).toBe('refund');
    expect(escalationHit('my lawyer will call you', ['refund', 'lawyer'])).toBe('lawyer');
    expect(escalationHit('I will report to NAFDAC.', ['nafdac'])).toBe('nafdac');
    expect(escalationHit('this is food poisoning!', ['food poisoning'])).toBe('food poisoning');
    expect(escalationHit('call the C++ police (now)', ['c++', 'police'])).toBe('c++');
  });
  it('are not found inside other words, or when there are none', () => {
    expect(escalationHit('the refunded amount', ['refund'])).toBeNull();
    expect(escalationHit('I love your suede shoes', ['sue'])).toBeNull();
    expect(escalationHit('hello', [])).toBeNull();
    expect(escalationHit('hello', ['', '  '])).toBeNull();
  });

  it('a message containing one is sent back until the owner is called in, with the model doing it properly', async () => {
    ran.length = 0;
    const { llm, seen } = scripted([say('Sure, here is our menu.'), call('handoff_to_human', { reason: 'refund', summary: 'wants a refund' }), say('I am so sorry. The team will reply shortly.')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [u('I want a refund')], ctx: { ...base }, tools: [search, handoff], escalateKeywords: ['refund'] });
    expect(ran).toEqual(['handoff']);
    expect(r.handedOff).toBe(true);
    expect(r.reply).toMatch(/sorry/);
    expect(seen[1]!.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringMatching(/contains "refund".*call handoff_to_human now/s) });
  });

  it('and if the model still will not, the handoff is done for the owner', async () => {
    ran.length = 0;
    const { llm } = scripted([say('Here is our menu.')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [u('I will sue you')], ctx: { ...base }, tools: [search, handoff], escalateKeywords: ['sue'] });
    expect(ran).toEqual(['handoff']);
    expect(r.handedOff).toBe(true);
  });

  it('the handoff still happens when the reply also had to be cleaned of a price it could not back', async () => {
    ran.length = 0;
    const { llm } = scripted([say('Refunds take 3 days. Meanwhile Swift Step is ₦30,000.')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [u('I want a refund')], ctx: { ...base }, tools: [search, handoff], escalateKeywords: ['refund'] });
    expect(ran).toEqual(['handoff']);
    expect(r.handedOff).toBe(true);
    expect(r.reply).not.toMatch(/30,000/);
  });

  it('nothing happens without a keyword, or when the model already handed over', async () => {
    ran.length = 0;
    const a = scripted([say('Rice is ₦85,000.')]);
    expect((await runAgent({ llm: a.llm, model: 'm', system: 's', history: [u('price of rice? ₦85,000?')], ctx: { ...base }, tools: [search, handoff], escalateKeywords: ['refund'] })).handedOff).toBe(false);
    const b = scripted([call('handoff_to_human', { reason: 'r', summary: 's' }), say('Sorry, the team will reply.')]);
    await runAgent({ llm: b.llm, model: 'm', system: 's', history: [u('refund please')], ctx: { ...base }, tools: [search, handoff], escalateKeywords: ['refund'] });
    expect(ran).toEqual(['handoff']); // once
  });
});

describe('asking for a person', () => {
  it('is recognised in the ways people say it', () => {
    for (const t of ['I want to speak to a human', 'agent please', 'customer care please', 'can I talk to someone', 'put me through to the owner', 'let me chat with a real person', 'connect me to a manager', 'I need the owner', 'human', 'Customer service!']) expect(wantsHuman(t), t).toBe(true);
  });
  it('is not triggered by ordinary shopping talk', () => {
    for (const t of ['how much is rice?', 'is the agent fee included', 'my husband is the owner of this card', 'call me tomorrow with the price list', 'hi', 'I want 2 garri']) expect(wantsHuman(t), t).toBe(false);
  });
  it('makes the model hand over, or does it itself', async () => {
    ran.length = 0;
    const { llm } = scripted([say('How can I help?')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [{ role: 'user', content: 'agent please' }], ctx: { ...base }, tools: [search, handoff] });
    expect(ran).toEqual(['handoff']);
    expect(r.handedOff).toBe(true);
  });
});

describe('a model\'s internal notes never reach a customer', () => {
  it('spots special tokens, think blocks and "The customer asked..." narration', () => {
    expect(hasModelArtifacts('<｜place▁holder▁no▁0｜>The customer asked what we sell')).toBe(true);
    expect(hasModelArtifacts('<think>they want rice</think>Rice is ₦85,000')).toBe(true);
    expect(hasModelArtifacts('The customer asked "what do you sell?" and then "what else?"')).toBe(true);
    expect(hasModelArtifacts('Customer wants a refund, I should hand over.')).toBe(true);
    expect(hasModelArtifacts('Rice is ₦85,000. Would you like one?')).toBe(false);
    expect(hasModelArtifacts('Our customer service team will reply.')).toBe(false);
  });
  it('removes tokens and think blocks and keeps the real message', () => {
    expect(stripArtifacts('<think>hmm</think><｜tok｜>Rice is ₦85,000.')).toBe('Rice is ₦85,000.');
  });
  it('a reply with notes in it is sent back, then cleaned, and never shown as it was', async () => {
    const a = scripted([say('<｜place▁holder▁no▁0｜>The customer asked for rice.'), say('Rice is ₦85,000.')]);
    expect((await go(a.llm, {}, [{ role: 'user', content: 'rice?' }, { role: 'assistant', content: 'Rice is ₦85,000.' }, { role: 'user', content: 'ok' }])).reply).toBe('Rice is ₦85,000.');
    const b = scripted([say('The customer asked for rice and I should reply.')]);
    const r = await go(b.llm, {}, [{ role: 'user', content: 'rice?' }]);
    expect(r.reply).toBe('Sorry, could you tell me a little more about what you need?');
  });
});

describe('someone who may hurt themselves', () => {
  const u = (content: string): ChatMessage => ({ role: 'user', content });
  it('gets care, not a sales pitch, and the owner is told', async () => {
    ran.length = 0;
    const { llm, seen } = scripted([say('Would you like to order some groceries? Rice is ₦85,000.'), say('I am so sorry you feel this way. You are not alone: please talk to someone you trust or a local emergency line. I am here for you.')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [u('I do not want to live anymore')], ctx: { ...base }, tools: [search, handoff] });
    expect(r.reply).toMatch(/sorry.*not alone/);
    expect(r.reply).not.toMatch(/rice|order|₦/i);
    expect(ran).toEqual(['handoff']); // done for the owner when the model did not
    expect(r.handedOff).toBe(true);
    expect(seen[1]!.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringMatching(/may be in distress.*Do not sell/s) });
  });
  it('is recognised in several wordings, and not from ordinary talk', async () => {
    for (const t of ['I want to kill myself', 'sometimes I think I should end my life', 'I don\'t want to be alive', 'better off dead', 'thinking about suicide']) {
      ran.length = 0;
      const { llm } = scripted([say('I am sorry you are going through this. You are not alone, please talk to someone you trust.')]);
      await runAgent({ llm, model: 'm', system: 's', history: [u(t)], ctx: { ...base }, tools: [search, handoff] });
      expect(ran, t).toEqual(['handoff']);
    }
    ran.length = 0;
    const { llm } = scripted([say('Sure, rice is ₦85,000.')]);
    await runAgent({ llm, model: 'm', system: 's', history: [u('this price is killing me, is there a discount on rice?')], ctx: { ...base }, tools: [search, handoff] });
    expect(ran).toEqual([]);
  });
});

describe('saying a payment arrived', () => {
  it('is spotted, but "the shop will confirm once it arrives" is not', () => {
    for (const t of ['Your payment has been confirmed.', 'Payment received, thank you!', 'We have received your payment.', 'Transfer was successful.']) expect(claimsPaymentReceived(t), t).toBe(true);
    for (const t of ['The shop will confirm once your payment is received.', 'I cannot confirm that your payment has been received.', 'Only our system can verify when payment has been received.', 'Please pay to GTBank 0123456789.', 'Once the transfer is confirmed we will dispatch.']) expect(claimsPaymentReceived(t), t).toBe(false);
  });
  it('is sent back, and removed if it persists', async () => {
    const a = scripted([say('Payment confirmed! Your order is on the way.'), say('The shop will confirm as soon as your payment arrives.')]);
    expect((await go(a.llm, {}, [{ role: 'user', content: 'I have paid' }])).reply).toBe('The shop will confirm as soon as your payment arrives.');
    const b = scripted([say('Payment confirmed.')]);
    expect((await go(b.llm, {}, [{ role: 'user', content: 'I have paid' }])).reply).toBe('The shop will confirm your payment as soon as it arrives.');
  });
  it('is allowed when the order status was actually checked this turn', async () => {
    const check: Tool = { name: 'check_order_status', description: 'x', schema: z.object({}), async run() { return { status: 'paid' }; } };
    const { llm } = scripted([call('check_order_status', {}), say('Your payment has been confirmed. Your order is being prepared.')]);
    const r = await runAgent({ llm, model: 'm', system: 's', history: [{ role: 'user', content: 'did my payment go through?' }], ctx: { ...base }, tools: [check] });
    expect(r.reply).toBe('Your payment has been confirmed. Your order is being prepared.');
  });
  it('dropSentences keeps the rest', () => {
    expect(dropSentences('Hi! Payment confirmed. Anything else?', /payment confirmed/i)).toBe('Hi! Anything else?');
  });
});

describe('an empty answer from the model', () => {
  it('is sent back once, then replaced by something honest, never by "give me one moment"', async () => {
    const a = scripted([say(''), say('Rice is ₦85,000.')]);
    expect((await go(a.llm, {}, [{ role: 'assistant', content: 'Rice is ₦85,000.' }, { role: 'user', content: 'price of rice?' }])).reply).toBe('Rice is ₦85,000.');
    expect(a.seen).toHaveLength(2);
    const b = scripted([say('   ')]);
    expect((await go(b.llm, {}, [{ role: 'user', content: 'price of rice?' }])).reply).toBe("Sorry, I didn't catch that. Could you say it again?");
  });
});
