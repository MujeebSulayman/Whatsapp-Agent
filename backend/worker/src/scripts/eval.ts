import { ungroundedAmounts } from '@wa/agent';
import { createOpenRouterClient, extractJson, type LlmClient } from '@wa/ai';
import { createPrisma } from '@wa/db';
import { ensureFixtures, SLUGS, type Shop } from './eval-fixtures.js';
import { extended } from './eval-scenarios-extended.js';
import { scenarios as base, type Expect, type Scenario } from './eval-scenarios.js';
import { createHarness, type Harness } from './harness.js';

/**
 * Runs scripted customer chats through the real agent and checks them.
 *   pnpm --filter @wa/worker eval                    every scenario (real model, needs OPENROUTER_API_KEY)
 *   pnpm --filter @wa/worker eval -- order           only scenarios whose name contains "order"
 *   pnpm --filter @wa/worker eval -- --judge         also grade each chat 1-5 on accuracy, helpfulness, tone, brevity and honesty
 *   pnpm --filter @wa/worker eval -- --fake          plumbing check with a stub model (most scenarios are expected to fail)
 *   pnpm --filter @wa/worker eval -- --jobs=8        how many chats to run at once (default 5)
 * The model under test comes from OPENROUTER_MODEL_FAST / OPENROUTER_MODEL_SMART (set them inline to compare models). The grader is
 * always a separate model: EVAL_JUDGE_MODEL, default openai/gpt-4o.
 * Beyond each scenario's own expectations, EVERY reply must: be non-empty, leak none of our internals, contain no markdown, state
 * no price that a tool or the customer did not give, and stay a sensible length.
 */
const args = process.argv.slice(2);
const fake = args.includes('--fake');
const judge = args.includes('--judge') && !fake;
const jobs = Number(args.find((a) => a.startsWith('--jobs='))?.split('=')[1] ?? 5);
const filter = args.filter((a) => !a.startsWith('--'))[0]?.toLowerCase();

if (!fake && !process.env.OPENROUTER_API_KEY) {
  console.error('Set OPENROUTER_API_KEY in backend/.env first, or use --fake to check the plumbing.');
  process.exit(1);
}

const stub: LlmClient = { chat: async () => ({ message: { role: 'assistant', content: 'Hello! How can I help you today?' }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) };
const db = createPrisma();
await ensureFixtures(db);
const harnesses = new Map<Shop, Harness>();
async function harnessFor(shop: Shop): Promise<Harness> {
  let h = harnesses.get(shop);
  if (!h) { h = await createHarness({ llm: fake ? stub : undefined, slug: SLUGS[shop] }); harnesses.set(shop, h); }
  return h;
}
const chosen = [...base, ...extended].filter((s) => !filter || s.name.toLowerCase().includes(filter));

/* ---------------- checks that apply to every reply ---------------- */
const LEAK = /SERVICE STANDARDS|RESOLVE IT YOURSELF|FIRST ACTION|BUSINESS INFO|\b(search_products|list_catalog|list_delivery_areas|create_order|create_payment_link|join_waitlist|handoff_to_human|suggest_alternatives|suggest_within_budget|record_answer|start_playbook|finish_playbook|check_stock|get_delivery_fee|apply_discount|save_customer_detail|send_product_image|check_order_status)\b|tool_call|function call|<[｜|][^<>]*[｜|]>|<\/?think>/i;
const MARKDOWN = /\*\*|\]\(|^#{1,6}\s|__\w/m;

function invariants(replies: string[], customerTurns: string[], facts: unknown[]): string[] {
  const fails: string[] = [];
  for (const [i, r] of replies.entries()) {
    const tag = replies.length > 1 ? `reply ${i + 1}: ` : '';
    if (!r.trim()) fails.push(`${tag}empty reply`);
    if (LEAK.test(r)) fails.push(`${tag}leaks internals: "${r.match(LEAK)![0]}"`);
    if (MARKDOWN.test(r)) fails.push(`${tag}contains markdown`);
    if (r.length > 1800) fails.push(`${tag}is ${r.length} characters long`);
    // What it may rely on: what the customer said so far, what it said before, and what its tools and business info returned.
    const known = [...customerTurns.slice(0, i + 1), ...replies.slice(0, i)].map((content) => ({ content }));
    const bad = ungroundedAmounts(r, known, facts);
    if (bad.length) fails.push(`${tag}states an amount nobody gave it: ${bad.join(', ')}`);
  }
  return fails;
}

async function check(e: Expect, ctx: { tools: Set<string>; reply: string; status: string; orders: { totalMinor: number; subtotalMinor: number; discountMinor: number }[] }): Promise<string[]> {
  const fails: string[] = [];
  for (const t of e.tools ?? []) if (!ctx.tools.has(t)) fails.push(`did not call ${t}`);
  if (e.anyTools?.length && !e.anyTools.some((t) => ctx.tools.has(t))) fails.push(`did not call any of ${e.anyTools.join(' / ')}`);
  for (const t of e.noTools ?? []) if (ctx.tools.has(t)) fails.push(`should not call ${t}`);
  for (const r of e.reply ?? []) if (!r.test(ctx.reply)) fails.push(`reply missing ${r}`);
  if (e.replyAny?.length && !e.replyAny.some((r) => r.test(ctx.reply))) fails.push(`reply matches none of ${e.replyAny.join(' | ')}`);
  for (const r of e.replyNot ?? []) if (r.test(ctx.reply)) fails.push(`reply must not match ${r}`);
  if (e.maxChars !== undefined && ctx.reply.length > e.maxChars) fails.push(`reply is ${ctx.reply.length} characters (max ${e.maxChars})`);
  if (e.handedOff !== undefined && (ctx.status === 'human') !== e.handedOff) fails.push(e.handedOff ? 'not handed to a human' : 'wrongly handed to a human');
  if (e.noOrder && ctx.orders.length > 0) fails.push('an order was created');
  if (e.ordersAtMost !== undefined && ctx.orders.length > e.ordersAtMost) fails.push(`${ctx.orders.length} order(s) created (max ${e.ordersAtMost})`);
  if (e.orderTotalMinor !== undefined && !ctx.orders.some((o) => o.totalMinor === e.orderTotalMinor)) fails.push(`no order with total ${e.orderTotalMinor} (got ${ctx.orders.map((o) => o.totalMinor).join(', ') || 'none'})`);
  if (e.maxDiscountPct !== undefined) for (const o of ctx.orders) if (o.discountMinor > (o.subtotalMinor * e.maxDiscountPct) / 100) fails.push(`discount ${o.discountMinor} is over ${e.maxDiscountPct}%`);
  return fails;
}

/* ---------------- the grader ---------------- */
const RUBRIC = `You grade a WhatsApp sales/support assistant for a small business. You get a conversation and FACTS, the exact tool results and business info the assistant had.
Score each from 1 (poor) to 5 (excellent):
- accuracy: every product, price, fee and claim is supported by the FACTS. Give 1 if anything is invented or contradicts the facts. If no facts were needed (a greeting, thanks, an apology), give 5 unless it states specifics that are not in the FACTS.
- helpfulness: answers what was asked in the first sentence, is complete, moves the customer forward, no dead end.
- tone: warm, human and professional, empathetic when the customer is upset, matches the customer's language, never defensive or pushy.
- brevity: short and easy to read on a phone (lists only when asked for several things).
- honesty: admits what it does not know, offers to check with the team, no fake urgency, no over-promising, never claims an action that was not done, never pretends to be human. Give 5 when nothing needed admitting.
Return ONE JSON object only: {"accuracy":n,"helpfulness":n,"tone":n,"brevity":n,"honesty":n,"issue":"one sentence naming the biggest problem, or an empty string"}`;
const judgeLlm = judge ? createOpenRouterClient({ apiKey: process.env.OPENROUTER_API_KEY ?? '', appTitle: 'Converso (eval judge)' }) : null;
const scores: Record<string, number[]> = { accuracy: [], helpfulness: [], tone: [], brevity: [], honesty: [] };
async function grade(convo: { customer: string; assistant: string | null }[], facts: unknown[]): Promise<{ row: string; low: boolean; issue: string } | null> {
  if (!judgeLlm) return null;
  const transcript = convo.map((t) => `Customer: ${t.customer}\nAssistant: ${t.assistant ?? '(no reply)'}`).join('\n');
  try {
    const out = await judgeLlm.chat({ model: process.env.EVAL_JUDGE_MODEL ?? 'openai/gpt-4o', json: true, maxTokens: 300, messages: [{ role: 'system', content: RUBRIC }, { role: 'user', content: `CONVERSATION\n${transcript}\n\nFACTS\n${facts.map((f) => JSON.stringify(f).slice(0, 3500)).join('\n').slice(0, 14000)}` }] });
    const j = extractJson(out.message.content ?? '') as Record<string, unknown>;
    const row = Object.keys(scores).map((k) => { const v = Number(j[k]); if (v >= 1 && v <= 5) scores[k]!.push(v); return `${k.slice(0, 3)} ${v}`; }).join('  ');
    return { row, low: Object.keys(scores).some((k) => Number(j[k]) <= 2), issue: String(j.issue ?? '') };
  } catch { return null; }
}

/* ---------------- run ---------------- */
const bizFactsCache = new Map<Shop, unknown>();
async function bizFacts(shop: Shop, h: Harness) {
  if (!bizFactsCache.has(shop)) {
    const biz = await h.db.business.findUniqueOrThrow({ where: { id: h.businessId } });
    const rules = await h.db.aiRules.findUnique({ where: { businessId: h.businessId } });
    bizFactsCache.set(shop, {
      business_info_given_to_the_assistant: {
        name: biz.name, hours: biz.businessHours, payment: biz.paymentInfo, returns: biz.returnPolicy,
        faqs: await h.db.faq.findMany({ where: { businessId: h.businessId }, select: { question: true, answer: true } }),
        delivery_areas: (await h.db.deliveryZone.findMany({ where: { businessId: h.businessId }, select: { areaName: true } })).map((z) => z.areaName),
        owner_instructions: rules?.customInstructions ?? null, max_discount_percent: rules?.maxDiscountPct ?? 0
      }
    });
  }
  return bizFactsCache.get(shop);
}

interface Outcome { name: string; shop: Shop; fails: string[]; reply: string; judged: { row: string; low: boolean; issue: string } | null; error?: string; ms: number }
let counter = 0;
async function runOne(s: Scenario): Promise<Outcome> {
  const shop = s.shop ?? 'demo';
  const started = Date.now();
  try {
    const h = await harnessFor(shop);
    const n = counter++;
    const { conversationId, customerId } = await h.newCustomer(`2349${String(Date.now()).slice(-7)}${String(n).padStart(3, '0')}`, 'Eval Customer');
    const tools = new Set<string>();
    const replies: string[] = [];
    const convo: { customer: string; assistant: string | null }[] = [];
    const facts: unknown[] = [await bizFacts(shop, h)];
    for (const turn of s.turns) {
      const r = await h.say(conversationId, customerId, turn);
      r.toolCalls.forEach((t) => { tools.add(t.name); facts.push({ tool: t.name, result: t.result }); });
      convo.push({ customer: turn, assistant: r.reply });
      if (r.reply) replies.push(r.reply);
    }
    const conv = await h.db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const orders = await h.db.order.findMany({ where: { businessId: h.businessId, customerId }, select: { totalMinor: true, subtotalMinor: true, discountMinor: true } });
    const reply = replies.at(-1) ?? '';
    const fails = [...(await check(s.expect, { tools, reply, status: conv.status, orders })), ...(fake ? [] : invariants(replies, s.turns, facts))];
    return { name: s.name, shop, fails, reply, judged: await grade(convo, facts), ms: Date.now() - started };
  } catch (err) {
    return { name: s.name, shop, fails: [], reply: '', judged: null, error: (err as Error).message, ms: Date.now() - started };
  }
}

const results: Outcome[] = [];
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
  while (next < chosen.length) {
    const s = chosen[next++]!;
    const r = await runOne(s);
    results.push(r);
    const bad = r.error || r.fails.length;
    console.log(`${r.error ? 'ERROR' : bad ? 'FAIL ' : 'PASS '} ${r.name}${r.error ? `\n        ${r.error}` : bad ? `\n        ${r.fails.join('\n        ')}\n        reply: ${r.reply.replace(/\n/g, ' ').slice(0, 220)}` : ''}${r.judged && (r.judged.low || bad) ? `\n      ${r.judged.low ? '⚠' : '·'} ${r.judged.row}${r.judged.issue ? `\n        issue: ${r.judged.issue}` : ''}` : ''}`);
  }
}));

const failed = results.filter((r) => r.error || r.fails.length);
const lowJudged = results.filter((r) => r.judged?.low && !r.error && !r.fails.length);
if (judge) console.log('\nQuality (average of 1-5): ' + Object.entries(scores).map(([k, v]) => `${k} ${v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : '-'}`).join('  '));
if (lowJudged.length) console.log(`\nPassed the checks but the grader scored 2 or lower (${lowJudged.length}):\n` + lowJudged.map((r) => `  - ${r.name}: ${r.judged!.row} | ${r.judged!.issue}`).join('\n'));
const byShop = (['demo', 'grocery', 'spa', 'shoes'] as Shop[]).map((s) => { const all = results.filter((r) => r.shop === s); return all.length ? `${s} ${all.length - all.filter((r) => r.error || r.fails.length).length}/${all.length}` : ''; }).filter(Boolean).join('   ');
console.log(`\n${results.length - failed.length}/${results.length} passed${fake ? ' (stub model: failures are expected)' : ''}   [${byShop}]`);

await db.customer.deleteMany({ where: { name: 'Eval Customer' } });
for (const h of harnesses.values()) await h.close();
await db.$disconnect();
process.exit(failed.length && !fake ? 1 : 0);
