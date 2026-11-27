import type { LlmClient } from '@wa/ai';
import { scenarios, type Expect } from './eval-scenarios.js';
import { createHarness } from './harness.js';

/**
 * Runs every scripted chat through the real agent and checks the expectations.
 *   pnpm --filter @wa/worker eval            real model (needs OPENROUTER_API_KEY)
 *   pnpm --filter @wa/worker eval -- --fake  plumbing check with a stub model (most scenarios are expected to fail)
 *   pnpm --filter @wa/worker eval -- order   only scenarios whose name contains "order"
 */
const fake = process.argv.includes('--fake');
const filter = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0]?.toLowerCase();

if (!fake && !process.env.OPENROUTER_API_KEY) {
  console.error('Set OPENROUTER_API_KEY in backend/.env first, or use --fake to check the plumbing.');
  process.exit(1);
}

const stub: LlmClient = { chat: async () => ({ message: { role: 'assistant', content: 'Hello! How can I help you today?' }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) };
const h = await createHarness({ llm: fake ? stub : undefined });
const chosen = scenarios.filter((s) => !filter || s.name.toLowerCase().includes(filter));

async function check(e: Expect, ctx: { tools: Set<string>; reply: string; status: string; orders: { totalMinor: number; subtotalMinor: number; discountMinor: number }[] }): Promise<string[]> {
  const fails: string[] = [];
  for (const t of e.tools ?? []) if (!ctx.tools.has(t)) fails.push(`did not call ${t}`);
  for (const t of e.noTools ?? []) if (ctx.tools.has(t)) fails.push(`should not call ${t}`);
  for (const r of e.reply ?? []) if (!r.test(ctx.reply)) fails.push(`reply missing ${r}`);
  for (const r of e.replyNot ?? []) if (r.test(ctx.reply)) fails.push(`reply must not match ${r}`);
  if (e.handedOff !== undefined && (ctx.status === 'human') !== e.handedOff) fails.push(e.handedOff ? 'not handed to a human' : 'wrongly handed to a human');
  if (e.noOrder && ctx.orders.length > 0) fails.push('an order was created');
  if (e.orderTotalMinor !== undefined && !ctx.orders.some((o) => o.totalMinor === e.orderTotalMinor)) fails.push(`no order with total ${e.orderTotalMinor} (got ${ctx.orders.map((o) => o.totalMinor).join(', ') || 'none'})`);
  if (e.maxDiscountPct !== undefined) for (const o of ctx.orders) if (o.discountMinor > (o.subtotalMinor * e.maxDiscountPct) / 100) fails.push(`discount ${o.discountMinor} is over ${e.maxDiscountPct}%`);
  return fails;
}

let failed = 0;
for (const [i, s] of chosen.entries()) {
  const { conversationId, customerId } = await h.newCustomer(`2349${String(Date.now()).slice(-8)}${i}`, 'Eval Customer');
  const tools = new Set<string>();
  let reply = '';
  try {
    for (const turn of s.turns) {
      const r = await h.say(conversationId, customerId, turn);
      r.toolCalls.forEach((t) => tools.add(t.name));
      reply = r.reply ?? reply;
    }
    const conv = await h.db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const orders = await h.db.order.findMany({ where: { businessId: h.businessId, customerId }, select: { totalMinor: true, subtotalMinor: true, discountMinor: true } });
    const fails = await check(s.expect, { tools, reply, status: conv.status, orders });
    if (fails.length) failed++;
    console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${s.name}${fails.length ? `\n        ${fails.join('\n        ')}\n        reply: ${reply.slice(0, 160)}` : ''}`);
  } catch (err) {
    failed++;
    console.log(`ERROR ${s.name}: ${(err as Error).message}`);
  }
}
console.log(`\n${chosen.length - failed}/${chosen.length} passed${fake ? ' (stub model: failures are expected)' : ''}`);
await h.db.customer.deleteMany({ where: { businessId: h.businessId, name: 'Eval Customer' } });
await h.close();
process.exit(failed && !fake ? 1 : 0);
