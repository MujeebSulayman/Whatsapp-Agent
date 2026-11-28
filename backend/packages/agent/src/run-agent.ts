import type { ChatMessage, LlmClient } from '@wa/ai';
import { TOOLS, toolDefs } from './tools/index.js';
import { ungroundedAmounts, unknownNames } from './grounding.js';
import type { Tool, ToolContext } from './tools/types.js';

export { ungroundedAmounts, unknownNames };

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

/** WhatsApp's own formatting: *bold* (single asterisks), no headings, and links written out. The model sometimes writes markdown. */
export function toWhatsAppText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/__(.+?)__/g, '_$1_');
}

/** The reply with any sentence that mentions one of these amounts taken out. If nothing useful is left, ask what they want to know instead of stalling. */
export function withoutAmounts(reply: string, amounts: string[]): string {
  const bare = (a: string) => a.replace(/[^\d.,kKmM]/g, '');
  const mentions = (line: string) => amounts.some((a) => line.includes(a) || line.includes(bare(a)));
  const kept = reply.split(/\n/).map((line) => {
    if (/^\s*(\d+[.)]|[-*•])\s/.test(line)) return mentions(line) ? '' : line; // a list item goes whole
    return line.split(/(?<=[.!?])\s+/).filter((sentence) => !mentions(sentence)).join(' ').trim();
  }).filter(Boolean);
  const text = kept.join('\n').trim();
  return text.length >= 20 ? text : 'Tell me which item you would like and I will get you the exact price right away.';
}

/** Calling a list "the full list" when only part of it was shown. */
const FULL_LIST = /\b(full|complete|entire|whole)\s+(list|menu|catalog(ue)?|price\s?list)|\beverything\s+we\s+(sell|have|offer)|\ball\s+(of\s+)?(our|the)\s+(items|products)\b/i;
export function incompleteFullList(reply: string, calls: { name: string; result: unknown }[]): string | null {
  if (!FULL_LIST.test(reply)) return null;
  const lists = calls.filter((c) => c.name === 'list_catalog').map((c) => c.result as { total?: number; items?: { product_id: string }[] });
  if (lists.length === 0) return 'You called this the full list but you did not call list_catalog in this turn. Call list_catalog now (limit 30) and use only what it returns.';
  const shown = new Set(lists.flatMap((l) => (l.items ?? []).map((i) => i.product_id)));
  const total = lists.at(-1)?.total ?? 0;
  return shown.size < total ? `You called this the full list, but there are ${total} items and only ${shown.size} were shown. Say how many there are in total and offer to show the rest, or call list_catalog again with the next offset.` : null;
}

/** The customer is asking to see the whole list or menu. */
const WANTS_LIST = /\b(list\s+(them\s+)?(all|everything)|show\s+(me\s+)?(all|everything|the\s+(full\s+)?(list|menu))|(full|complete|whole)\s+(list|menu|catalog(ue)?)|everything\s+you\s+(sell|have|offer)|all\s+(your\s+)?(items|products)|price\s?list|menu)\b/i;
export function needsCatalogCall(history: { role: string; content: string | null }[], calls: { name: string }[]): boolean {
  const last = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  return WANTS_LIST.test(last) && !calls.some((c) => c.name === 'list_catalog');
}

/** After list_catalog, the customer must actually be shown the items, not just told how many there are. */
export function listNotShown(reply: string, calls: { name: string; result: unknown }[]): string | null {
  const last = calls.filter((c) => c.name === 'list_catalog').at(-1)?.result as { items?: { name: string }[] } | undefined;
  const items = (last?.items ?? []).filter((i) => typeof i.name === 'string' && i.name.length > 0);
  if (items.length < 3) return null;
  const base = (n: string) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase();
  const text = reply.toLowerCase();
  const named = items.filter((i) => text.includes(base(i.name))).length;
  return named >= Math.ceil(items.length * 0.6) ? null : `You looked up the catalogue but did not show it. Write out the items from list_catalog as a numbered list with each price (${items.length} items), then the total count. Do not just say how many there are.`;
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
  /** Owner choice. false = never nudge the model to win back a customer who says no. Default true. */
  keepCustomers?: boolean;
}): Promise<AgentResult> {
  // The payment-link tool is only offered when this business actually has online payments set up.
  const tools = (o.tools ?? TOOLS).filter((t) => t.name !== 'create_payment_link' || !!o.ctx.payments);
  const defs = toolDefs(tools);
  const state = { handedOff: false } as ToolContext['state'];
  const ctx: ToolContext = { ...o.ctx, state };
  const messages: ChatMessage[] = [{ role: 'system', content: o.system }, ...o.history];
  const result: AgentResult = { reply: '', model: o.model, inputTokens: 0, outputTokens: 0, costUsd: 0, toolCalls: [], handedOff: false, hitStepCap: false };

  const nudged = new Set<string>();
  let groundingNudges = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const { message, usage } = await o.llm.chat({ model: o.model, messages, tools: defs });
    result.inputTokens += usage.inputTokens;
    result.outputTokens += usage.outputTokens;
    result.costUsd += usage.costUsd;

    if (!message.tool_calls?.length) {
      const text = (message.content ?? '').trim();
      const unbacked = CLAIM_CHECKS.find((c) => claims(c.claim, text) && !result.toolCalls.some((t) => (c.satisfiedBy ?? [c.tool]).includes(t.name) && !(t.result as { error?: unknown } | null)?.error) && !nudged.has(c.tool));
      // The assistant's own instructions (owner notes, FAQs, what it looked up earlier) are legitimate sources too.
      const madeUp = ungroundedAmounts(text, [...o.history, { content: o.system }], result.toolCalls.map((t) => t.result));
      if (madeUp.length) {
        // Two chances to look it up properly. The nudge gets firmer the second time.
        if (groundingNudges < 2 && step < MAX_STEPS - 1) {
          groundingNudges++;
          messages.push(message, { role: 'system', content: `Your reply states an amount (${madeUp.join(', ')}) that no tool returned. Never state a price or amount from memory or guess one, and never name a product a tool did not return. Never work out totals or prices yourself. ${groundingNudges === 1 ? '' : 'This is your last chance: '}If the customer has given the item, area and address, call create_order now and quote only its total; if they gave a budget, call suggest_within_budget; if details are missing, ask for the next missing detail instead of quoting a total. For a price or alternative, call search_products or list_catalog and use ONLY the exact products and amounts they return.` });
          continue;
        }
        // Still not backed. Never send a made-up price, but never abandon the customer either: take out the sentences with the unbacked
        // amounts and keep the rest. No hand-off.
        result.reply = toWhatsAppText(withoutAmounts(text, madeUp));
        result.handedOff = state.handedOff;
        return result;
      }
      const invented = unknownNames(text, [o.system, ...o.history.map((m) => m.content ?? ''), ...result.toolCalls.map((t) => JSON.stringify(t.result))]);
      if (invented.length && !nudged.has('names') && step < MAX_STEPS - 1) {
        nudged.add('names');
        messages.push(message, { role: 'system', content: `Your reply names "${invented.join('", "')}", which is not in the catalogue results, the chat or the business info. Never name a product, service or brand you did not get from a tool. Call search_products or list_catalog now and name only real items from the results, or say you will check with the team.` });
        continue;
      }
      if (needsCatalogCall(o.history, result.toolCalls) && !nudged.has('catalog') && step < MAX_STEPS - 1) {
        nudged.add('catalog');
        messages.push(message, { role: 'system', content: 'The customer asked to see the list. Do not answer from memory or just give a count: call list_catalog now (limit 30), then write out every item with its price as a numbered list, and say how many there are in total.' });
        continue;
      }
      const notShown = listNotShown(text, result.toolCalls);
      if (notShown && !nudged.has('show') && step < MAX_STEPS - 1) {
        nudged.add('show');
        messages.push(message, { role: 'system', content: notShown });
        continue;
      }
      const partial = incompleteFullList(text, result.toolCalls);
      if (partial && !nudged.has('full') && step < MAX_STEPS - 1) {
        nudged.add('full');
        messages.push(message, { role: 'system', content: partial });
        continue;
      }
      if (o.keepCustomers !== false && !unbacked && !nudged.has('save') && step < MAX_STEPS - 1 && needsSaveAttempt(o.history, text)) {
        nudged.add('save');
        messages.push(message, { role: 'system', content: 'The customer just said no for the first time. Do not say goodbye yet. Send ONE short, warm message that asks what held them back (price, size, timing, something else) OR offers one relevant alternative. Any alternative MUST come from search_products or suggest_alternatives in this turn: call it first and name only what it returns, never a product or price from memory. No pressure, no invented offers or deadlines. If they say no again later, let them go gracefully.' });
        continue;
      }
      if (unbacked && step < MAX_STEPS - 1) {
        nudged.add(unbacked.tool);
        messages.push(message, { role: 'system', content: unbacked.nudge });
        continue;
      }
      result.reply = toWhatsAppText(text);
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
