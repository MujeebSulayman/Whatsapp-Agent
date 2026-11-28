import type { ChatMessage, LlmClient } from '@wa/ai';
import { TOOLS, toolDefs } from './tools/index.js';
import type { Tool, ToolContext } from './tools/types.js';

export const MAX_STEPS = 8;

/**
 * The model sometimes says it did something without calling the tool. For actions that are safe to repeat we catch that and make it do
 * the real thing (or correct itself) once. Not done for orders: a wrong nudge there could create a duplicate order.
 */
export const CLAIM_CHECKS: { tool: string; /** Any of these tools running successfully this turn backs the claim (default: just `tool`). */ satisfiedBy?: string[]; claim: RegExp; nudge: string }[] = [
  {
    tool: 'join_waitlist',
    claim: /((add(ed|ing)?|put|putting|placed?|got)\s+you\s+(on|to|in)\s+(the\s+)?(wait\s?-?list|list))|(you('re|\s+are|\s+will\s+be)\s+(now\s+)?on\s+the\s+(wait\s?-?list|list))|((i'?ll|i\s+will|we'?ll|we\s+will)\s+(add|put)\s+you)/i,
    nudge: 'You told the customer they are on the waitlist, but join_waitlist has not succeeded in this turn. Call join_waitlist now (use search_products first if you need the product_id, and ask which size or colour only if you truly do not know), then confirm. Do not claim it without the tool.'
  },
  {
    // Saying "we don't sell that" is a claim about the catalogue. The business name and category say nothing about what is in it.
    tool: 'search_products',
    satisfiedBy: ['search_products', 'check_stock', 'suggest_alternatives'],
    claim: /\b(don'?t|do\s+not|doesn'?t|does\s+not|no\s+longer)\s+(sell|have|offer|stock|carry|do)\s+(any\s+|that\s+|those\s+|this\s+|it\b|\w)|\b(not|isn'?t|aren'?t)\s+(available|in\s+stock|on\s+(our|the)\s+(menu|list))|\bwe\s+only\s+(sell|offer|do)\b|\bno\s+\w+\s+(here|available)\b/i,
    nudge: "You told the customer you do not have or sell something, but you did not search the catalogue in this turn. The business name and category do NOT tell you what is for sale; the catalogue can include anything. Call search_products with the customer's own words now, then answer from the results."
  }
];

/** True when a sentence in the reply states the action as done or promised. Questions and offers ("would you like me to...") are not claims. */
const OFFER = /(would you like|do you want|want me to|should i|shall i|can i|may i|if you(?:'d| would)? (?:like|want)|let me know if)/i;
export function claims(re: RegExp, text: string): boolean {
  return text.split(/(?<=[.!?])\s+/).some((sentence) => re.test(sentence) && !/\?\s*$/.test(sentence) && !OFFER.test(sentence));
}

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const norm = (n: string) => String(Number(n.replace(/,/g, '')));
/** Amounts that look like money in a reply: next to a currency symbol or code, or written with thousands separators. */
const MONEY = /(?:[₦$€£¥₹]|\b(?:NGN|USD|GHS|KES|ZAR|EUR|GBP|CFA|XOF)\b)\s?(\d[\d,]*(?:\.\d+)?)|(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/g;

/**
 * Amounts in the reply that no tool returned and nobody in the chat mentioned. The assistant may never state a price from memory
 * or guess one, so any such amount means it made it up (or did its own sums).
 */
export function ungroundedAmounts(reply: string, history: { content: string | null }[], toolOutputs: unknown[]): string[] {
  const known = new Set<string>();
  const sources = [...history.map((m) => m.content ?? ''), ...toolOutputs.map((o) => JSON.stringify(o))];
  for (const text of sources) for (const m of text.matchAll(NUM)) known.add(norm(m[0]));
  const bad: string[] = [];
  for (const m of reply.matchAll(MONEY)) {
    const raw = (m[1] ?? m[2])!;
    if (!known.has(norm(raw)) && Number(norm(raw)) > 0) bad.push(raw);
  }
  return [...new Set(bad)];
}

/** A customer turning something down ("not interested", "too expensive", "no thanks"). */
const DECLINE = /(not\s+interested|no,?\s+thanks?|no\s+thank\s+you|i'?m\s+good|i\s+don'?t\s+(want|need)|too\s+(expensive|costly|much|pricey)|maybe\s+later|never\s?mind|forget\s+it|leave\s+it)|^\s*no[.!\s]*$/i;
/** They want it to stop. Never pushed back on. */
const STOP = /\b(stop|leave\s+me\s+alone|unsubscribe|spam|don'?t\s+(message|text|contact|disturb|call)|do\s+not\s+(message|text|contact|disturb))\b/i;

/**
 * True on a customer's FIRST decline when the reply just says goodbye. A good shop assistant makes one friendly attempt first.
 * Never on a second no, and never when the customer asked to be left alone.
 */
export function needsSaveAttempt(history: { role: string; content: string | null }[], reply: string): boolean {
  const said = history.filter((m) => m.role === 'user').map((m) => m.content ?? '');
  const last = said.at(-1) ?? '';
  if (!DECLINE.test(last) || STOP.test(last)) return false;
  if (said.filter((t) => DECLINE.test(t)).length !== 1) return false; // second or later no: respect it
  return !reply.includes('?'); // no question = no attempt, it just said goodbye
}

export interface AgentResult {
  reply: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCalls: { name: string; args: unknown; result: unknown }[];
  handedOff: boolean;
  hitStepCap: boolean;
}

export async function runAgent(o: {
  llm: LlmClient;
  model: string;
  system: string;
  history: ChatMessage[];
  ctx: Omit<ToolContext, 'state'>;
  tools?: Tool[];
}): Promise<AgentResult> {
  // The payment-link tool is only offered when this business actually has online payments set up.
  const tools = (o.tools ?? TOOLS).filter((t) => t.name !== 'create_payment_link' || !!o.ctx.payments);
  const defs = toolDefs(tools);
  const state = { handedOff: false } as ToolContext['state'];
  const ctx: ToolContext = { ...o.ctx, state };
  const messages: ChatMessage[] = [{ role: 'system', content: o.system }, ...o.history];
  const result: AgentResult = { reply: '', model: o.model, inputTokens: 0, outputTokens: 0, costUsd: 0, toolCalls: [], handedOff: false, hitStepCap: false };

  const nudged = new Set<string>();
  for (let step = 0; step < MAX_STEPS; step++) {
    const { message, usage } = await o.llm.chat({ model: o.model, messages, tools: defs });
    result.inputTokens += usage.inputTokens;
    result.outputTokens += usage.outputTokens;
    result.costUsd += usage.costUsd;

    if (!message.tool_calls?.length) {
      const text = (message.content ?? '').trim();
      const unbacked = CLAIM_CHECKS.find((c) => claims(c.claim, text) && !result.toolCalls.some((t) => (c.satisfiedBy ?? [c.tool]).includes(t.name) && !(t.result as { error?: unknown } | null)?.error) && !nudged.has(c.tool));
      const madeUp = ungroundedAmounts(text, o.history, result.toolCalls.map((t) => t.result));
      if (madeUp.length) {
        if (!nudged.has('grounding') && step < MAX_STEPS - 1) {
          nudged.add('grounding');
          messages.push(message, { role: 'system', content: `Your reply states an amount (${madeUp.join(', ')}) that no tool returned. Never state a price or amount from memory or guess one, and never name a product a tool did not return. Call search_products (or the right tool) now and use ONLY the exact products and amounts it returns. If you cannot find it, say you will check with the team.` });
          continue;
        }
        // Still not backed after one correction: never send a made-up price. Hold the customer and call the owner in.
        const handoff = tools.find((t) => t.name === 'handoff_to_human');
        if (handoff) await handoff.run(ctx, { reason: 'The assistant could not confirm a price', summary: `The assistant could not back an amount it was about to quote (${madeUp.join(', ')}). Please check the last message and reply.` });
        result.reply = "I'd like to double-check that price for you. Let me confirm with the team and get back to you shortly.";
        result.handedOff = state.handedOff;
        return result;
      }
      if (!unbacked && !nudged.has('save') && step < MAX_STEPS - 1 && needsSaveAttempt(o.history, text)) {
        nudged.add('save');
        messages.push(message, { role: 'system', content: 'The customer just said no for the first time. Do not say goodbye yet. Send ONE short, warm message that asks what held them back (price, size, timing, something else) OR offers one relevant alternative. Any alternative MUST come from search_products or suggest_alternatives in this turn: call it first and name only what it returns, never a product or price from memory. No pressure, no invented offers or deadlines. If they say no again later, let them go gracefully.' });
        continue;
      }
      if (unbacked && step < MAX_STEPS - 1) {
        nudged.add(unbacked.tool);
        messages.push(message, { role: 'system', content: unbacked.nudge });
        continue;
      }
      result.reply = text;
      result.handedOff = state.handedOff;
      return result;
    }

    messages.push(message);
    for (const call of message.tool_calls) {
      const tool = tools.find((t) => t.name === call.function.name);
      let args: unknown = undefined;
      let out: unknown;
      if (!tool) {
        out = { error: `Unknown tool ${call.function.name}` };
      } else {
        try {
          args = JSON.parse(call.function.arguments || '{}');
          const parsed = tool.schema.safeParse(args);
          out = parsed.success ? await tool.run(ctx, parsed.data) : { error: `Invalid arguments: ${parsed.error.message}` };
        } catch (e) {
          out = { error: `Tool failed: ${(e as Error).message}` };
        }
      }
      result.toolCalls.push({ name: call.function.name, args, result: out });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }

  // Step cap hit: stop looping, hand to a human rather than guess.
  result.hitStepCap = true;
  result.handedOff = state.handedOff;
  return result;
}
