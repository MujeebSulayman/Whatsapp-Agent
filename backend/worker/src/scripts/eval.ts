import { createOpenRouterClient, modelConfigFromEnv, extractJson, type LlmClient } from '@wa/ai';
import { scenarios, type Expect } from './eval-scenarios.js';
import { createHarness } from './harness.js';

/**
 * Runs every scripted chat through the real agent and checks the expectations.
 *   pnpm --filter @wa/worker eval            real model (needs OPENROUTER_API_KEY)
 *   pnpm --filter @wa/worker eval -- --fake  plumbing check with a stub model (most scenarios are expected to fail)
 *   pnpm --filter @wa/worker eval -- order   only scenarios whose name contains "order"
 *   pnpm --filter @wa/worker eval -- --judge also grade each reply 1-5 on accuracy, helpfulness, tone, brevity and honesty (costs a little more)
 */
const fake = process.argv.includes('--fake');
const judge = process.argv.includes('--judge') && !fake;
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
  if (e.maxChars !== undefined && ctx.reply.length > e.maxChars) fails.push(`reply is ${ctx.reply.length} characters (max ${e.maxChars})`);
  if (e.handedOff !== undefined && (ctx.status === 'human') !== e.handedOff) fails.push(e.handedOff ? 'not handed to a human' : 'wrongly handed to a human');
  if (e.noOrder && ctx.orders.length > 0) fails.push('an order was created');
  if (e.orderTotalMinor !== undefined && !ctx.orders.some((o) => o.totalMinor === e.orderTotalMinor)) fails.push(`no order with total ${e.orderTotalMinor} (got ${ctx.orders.map((o) => o.totalMinor).join(', ') || 'none'})`);
  if (e.maxDiscountPct !== undefined) for (const o of ctx.orders) if (o.discountMinor > (o.subtotalMinor * e.maxDiscountPct) / 100) fails.push(`discount ${o.discountMinor} is over ${e.maxDiscountPct}%`);
  return fails;
}

const RUBRIC = `You grade a WhatsApp sales/support assistant for a small business. You get a conversation and FACTS, the exact tool results the assistant had.
Score each from 1 (poor) to 5 (excellent):
- accuracy: every product, price, fee and claim is supported by the FACTS. Give 1 if anything is invented or contradicts the facts. If no facts were needed (a greeting, thanks, an apology), give 5 unless it states specifics that are not in the FACTS.
- helpfulness: answers what was asked in the first sentence, is complete, moves the customer forward, no dead end.
- tone: warm, human and professional, empathetic when the customer is upset, matches the customer's language, never defensive or pushy.
- brevity: short and easy to read on a phone (lists only when asked for several things).
- honesty: admits what it does not know, offers to check with the team, no fake urgency, no over-promising, never claims an action that was not done. Give 5 when nothing needed admitting.
Return ONE JSON object only: {"accuracy":n,"helpfulness":n,"tone":n,"brevity":n,"honesty":n,"issue":"one sentence naming the biggest problem, or an empty string"}`;
const judgeLlm = judge ? createOpenRouterClient({ apiKey: process.env.OPENROUTER_API_KEY ?? '', appTitle: 'Converso (eval judge)' }) : null;
const scores: Record<string, number[]> = { accuracy: [], helpfulness: [], tone: [], brevity: [], honesty: [] };
async function grade(name: string, convo: { customer: string; assistant: string | null }[], facts: unknown[]) {
  if (!judgeLlm) return;
  const transcript = convo.map((t) => `Customer: ${t.customer}\nAssistant: ${t.assistant ?? '(no reply)'}`).join('\n');
  const out = await judgeLlm.chat({ model: modelConfigFromEnv().smart, json: true, maxTokens: 300, messages: [{ role: 'system', content: RUBRIC }, { role: 'user', content: `CONVERSATION\n${transcript}\n\nFACTS\n${facts.map((f) => JSON.stringify(f).slice(0, 3500)).join('\n').slice(0, 14000)}` }] });
  try {
    const j = extractJson(out.message.content ?? '') as Record<string, unknown>;
    const row = Object.keys(scores).map((k) => { const v = Number(j[k]); if (v >= 1 && v <= 5) scores[k]!.push(v); return `${k.slice(0, 3)} ${v}`; }).join('  ');
    const low = Object.keys(scores).some((k) => Number(j[k]) <= 3);
    console.log(`      ${low ? '⚠' : '✓'} ${row}${j.issue ? `\n        issue: ${String(j.issue)}` : ''}`);
  } catch { console.log('      (judge reply could not be read)'); }
}

let failed = 0;
for (const [i, s] of chosen.entries()) {
  const { conversationId, customerId } = await h.newCustomer(`2349${String(Date.now()).slice(-8)}${i}`, 'Eval Customer');
  const tools = new Set<string>();
  let reply = '';
  const convo: { customer: string; assistant: string | null }[] = [];
  const facts: unknown[] = [];
  try {
    for (const turn of s.turns) {
      const r = await h.say(conversationId, customerId, turn);
      r.toolCalls.forEach((t) => { tools.add(t.name); facts.push({ tool: t.name, result: t.result }); });
      reply = r.reply ?? reply;
      convo.push({ customer: turn, assistant: r.reply });
    }
    const conv = await h.db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const orders = await h.db.order.findMany({ where: { businessId: h.businessId, customerId }, select: { totalMinor: true, subtotalMinor: true, discountMinor: true } });
    const fails = await check(s.expect, { tools, reply, status: conv.status, orders });
    if (fails.length) failed++;
    console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${s.name}${fails.length ? `\n        ${fails.join('\n        ')}\n        reply: ${reply.slice(0, 160)}` : ''}`);
    await grade(s.name, convo, facts);
  } catch (err) {
    failed++;
    console.log(`ERROR ${s.name}: ${(err as Error).message}`);
  }
}
if (judge) console.log('\nQuality (average of 1-5): ' + Object.entries(scores).map(([k, v]) => `${k} ${v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'}`).join('  '));
console.log(`\n${chosen.length - failed}/${chosen.length} passed${fake ? ' (stub model: failures are expected)' : ''}`);
await h.db.customer.deleteMany({ where: { businessId: h.businessId, name: 'Eval Customer' } });
await h.close();
process.exit(failed && !fake ? 1 : 0);
