import type { ChatMessage, LlmClient } from '@wa/ai';
import { TOOLS, toolDefs } from './tools/index.js';
import { ungroundedAmounts, unknownNames } from './grounding.js';
import type { Tool, ToolContext } from './tools/types.js';

export { ungroundedAmounts, unknownNames };

export const MAX_STEPS = 10;
/** Room for a 30-item list with prices, and no more. */
export const MAX_REPLY_TOKENS = 1200;

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
    .replace(/__(.+?)__/g, '_$1_')
    // Never send em or en dashes: a plain hyphen before a number or price, a comma everywhere else.
    .replace(/(?<=[\p{L}\d])[—–](?=[\p{L}\d])/gu, '-')
    .replace(/[ \t]*[—–][ \t]*(?=[\d₦$£€])/g, ' - ')
    .replace(/[ \t]*[—–][ \t]*/g, ', ');
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

/** The first owner "call me in" word found in the customer's message (whole words, any case), or null. */
export function escalationHit(text: string, keywords: string[]): string | null {
  for (const raw of keywords) {
    const k = raw.trim();
    if (!k) continue;
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'iu').test(text)) return k;
  }
  return null;
}

/** The customer wants to return or exchange something they bought (a request, not a question about the policy). The owner handles these. */
const RETURN_REQUEST = /\b(?:i|we)\s*(?:'d|\s+would)?\s*(?:want|need|wish|like)(?:\s+to)?\s+(?:to\s+)?(?:return|exchange|swap|send\s+back|bring\s+back)\b|\b(?:return|exchange|swap|send\s+back|bring\s+back)\s+(?:it|this|that|these|those|them|my|the|our)\b|\b(?:want|need)\s+(?:a\s+)?(?:replacement|exchange|return)\b/i;
export const wantsReturn = (text: string) => RETURN_REQUEST.test(text);

/** The customer is asking for a person ("I want to speak to a human", "customer care please", "put me through to the owner"). */
const WANTS_HUMAN = /^\s*(?:an?\s+)?(?:agent|human|person|representative|manager|owner|attendant|someone)\s*(?:please|pls|now|abeg)?[\s.!?]*$|\b(speak|talk|chat|connect|transfer|put\s+me\s+(through|on)|get\s+me|call)\b.{0,30}\b(human|person|someone|somebody|agent|representative|manager|owner|staff|attendant|customer\s+(care|service|support)|real\s+(person|human))\b|\b(human|real\s+person|live\s+agent|customer\s+(care|service|support)|an?\s+agent)\b[\s,.!?]*(please|pls|now|abeg)?[\s,.!?]*$|\b(?:need|want|get|see|call|fetch|bring)\s+(?:me\s+)?(?:to\s+)?(?:the|an?|your)\s+(?:owner|manager|boss)\b[\s,.!?]*(?:please|pls|now|abeg)?[\s,.!?]*$/i;
export const wantsHuman = (text: string) => WANTS_HUMAN.test(text);

/** Things a customer must never be shown: a model's internal notes, special tokens, or its reasoning. */
const SPECIAL_TOKEN = /<[｜|][^<>]{0,80}[｜|]>/g;
export const hasModelArtifacts = (text: string) => /<[｜|][^<>]{0,80}[｜|]>|<\/?think>/i.test(text) || /^\s*(the\s+customer|customer)\s+(asked|said|wants|is\s+asking|has\s+asked|wrote)\b/i.test(text);
export const stripArtifacts = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(SPECIAL_TOKEN, '').trim();

/** Someone saying they may hurt themselves. They get care, never a sales pitch. */
const SELF_HARM = /\b(kill\s+myself|end\s+my\s+life|take\s+my\s+(own\s+)?life|suicid\w*|(don'?t|do\s+not|no\s+longer)\s+want\s+to\s+(live|be\s+alive)|want\s+to\s+die|better\s+off\s+dead|hurt\s+myself|harm\s+myself|self[-\s]?harm)\b/i;
const CARING = /\b(sorry|care|support|talk|someone|not\s+alone|emergency|crisis|trusted|here\s+for\s+you)\b/i;
const SALESY = /(₦|\$|€|£)\s?\d|\b(order|buy|price|delivery|discount|catalog(ue)?|menu|party|groceries)\b/i;

/** Claiming a payment arrived. "The shop will confirm once it is received" is fine: that is a promise about later, not a claim. */
export const PAYMENT_CLAIM = /(?<!\b(?:once|when|until|after|if|verify|verifies|whether|can(?:no|')t|unable|will)\b[^.!?\n]{0,70})(?:(?:payment|transfer)\s+(?:has\s+been|was|is\s+now)\s+(?:confirmed|received|successful)|\bpayment\s+(?:confirmed|received|successful)\b|(?:i|we)(?:'ve|\s+have)\s+(?:confirmed|received)\s+your\s+(?:payment|transfer))/i;
export const claimsPaymentReceived = (text: string) => PAYMENT_CLAIM.test(text);
/** The reply without any sentence matching `re`. */
export const dropSentences = (text: string, re: RegExp) => text.split('\n').map((line) => line.split(/(?<=[.!?])\s+/).filter((sent) => !re.test(sent)).join(' ').trim()).filter(Boolean).join('\n').trim();

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
  /** The owner's "call me in when they say" words. A customer message containing one always ends with a handoff. */
  escalateKeywords?: string[];
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
    // A reply is short, so cap it. Without a cap the provider reserves credit for the model's largest possible answer on every call,
    // which makes bursts of customers fail with "not enough credits" long before the money is really spent.
    const { message, usage } = await o.llm.chat({ model: o.model, messages, tools: defs, maxTokens: MAX_REPLY_TOKENS });
    result.inputTokens += usage.inputTokens;
    result.outputTokens += usage.outputTokens;
    result.costUsd += usage.costUsd;

    if (!message.tool_calls?.length) {
      const text = (message.content ?? '').trim();
      const unbacked = CLAIM_CHECKS.find((c) => claims(c.claim, text) && !result.toolCalls.some((t) => (c.satisfiedBy ?? [c.tool]).includes(t.name) && !(t.result as { error?: unknown } | null)?.error) && !nudged.has(c.tool));
      const lastUser = [...o.history].reverse().find((m) => m.role === 'user')?.content ?? '';
      const hit = escalationHit(lastUser, o.escalateKeywords ?? []) ?? (wantsReturn(lastUser) ? 'return or exchange' : null);
      const distress = SELF_HARM.test(lastUser);
      const mustHandOff = (hit || wantsHuman(lastUser) || distress) && !state.handedOff;
      /** Send the model back once with a correction. True means "go round again". */
      const nudge = (key: string, why: string | null): boolean => {
        if (!why || nudged.has(key) || step >= MAX_STEPS - 1) return false;
        nudged.add(key);
        messages.push(message, { role: 'system', content: why });
        return true;
      };
      /** The owner asked to be told, so if the model did not call them in, we do it for them. */
      const autoHandoff = async () => {
        if (!mustHandOff || state.handedOff) return;
        const handoff = tools.find((t) => t.name === 'handoff_to_human');
        if (handoff) await handoff.run(ctx, { reason: distress ? 'Customer may be in distress' : hit ? `Customer mentioned "${hit}"` : 'Customer asked for a person', summary: lastUser.slice(0, 500) });
      };
      const knownText = [o.system, ...o.history.map((m) => m.content ?? ''), ...result.toolCalls.map((t) => JSON.stringify(t.result))];
      const invented = unknownNames(text, knownText);
      const checkedPayment = result.toolCalls.some((t) => t.name === 'check_order_status');

      if (nudge('empty', !text.trim() ? 'Your reply was empty. Reply to the customer now with a short, helpful message in their language.' : null)) continue;
      if (nudge('artifacts', hasModelArtifacts(text) ? 'Your reply contained internal notes or analysis. Reply ONLY with the message to send to the customer, in their language, with no mention of what you did or what the customer asked.' : null)) continue;
      if (nudge('distress', distress && !(CARING.test(text) && !SALESY.test(text)) ? "The customer may be in distress. Reply with warmth and care only: say you are sorry they feel this way, that they are not alone, and encourage them to talk to someone they trust or a local emergency or crisis line. Do not sell, quote prices or mention orders or products. Then call handoff_to_human with the summary 'Customer may be in distress' so the owner sees it." : null)) continue;
      if (nudge('handoff', mustHandOff && !distress ? (hit
        ? `The customer's message contains "${hit}", a word the owner wants to be called in for. Acknowledge them kindly (apologise if they are unhappy), then call handoff_to_human now with a short summary of what they said. Say you are sorting it out and will update them here shortly (never say you are transferring them or that someone else will take over). Do not ask them to repeat details.`
        : 'The customer asked for a person. Call handoff_to_human now with a short summary, and tell them, in your own voice, that you are sorting it out and will update them here shortly. Never say you are transferring them or that a person or agent will take over.') : null)) continue;
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
        await autoHandoff();
        result.handedOff = state.handedOff;
        return result;
      }
      if (nudge('names', invented.length ? `Your reply names "${invented.join('", "')}", which is not in the catalogue results, the chat or the business info. Never name a product, service or brand you did not get from a tool. Call search_products or list_catalog now and name only real items from the results, or say you will check with the team.` : null)) continue;
      if (nudge('paid', !checkedPayment && claimsPaymentReceived(text) ? 'Your reply says a payment was received or confirmed. You cannot know that: only the payment system confirms it. Say instead that the shop will confirm as soon as the payment arrives. If they ask about an order, call check_order_status first.' : null)) continue;
      if (nudge('catalog', needsCatalogCall(o.history, result.toolCalls) ? 'The customer asked to see the list. Do not answer from memory or just give a count: call list_catalog now (limit 30), then write out every item with its price as a numbered list, and say how many there are in total.' : null)) continue;
      if (nudge('show', listNotShown(text, result.toolCalls))) continue;
      if (nudge('full', incompleteFullList(text, result.toolCalls))) continue;
      if (!unbacked && nudge('save', needsSaveAttempt(o.history, text) ? 'The customer just said no for the first time. Do not say goodbye yet. Send ONE short, warm message that asks what held them back (price, size, timing, something else) OR offers one relevant alternative. Any alternative MUST come from search_products or suggest_alternatives in this turn: call it first and name only what it returns, never a product or price from memory. No pressure, no invented offers or deadlines. If they say no again later, let them go gracefully.' : null)) continue;
      if (unbacked && nudge(unbacked.tool, unbacked.nudge)) continue;
      let clean = stripArtifacts(text);
      if (!checkedPayment && claimsPaymentReceived(clean)) clean = dropSentences(clean, PAYMENT_CLAIM) || 'The shop will confirm your payment as soon as it arrives.';
      if (hasModelArtifacts(clean)) clean = 'Sorry, could you tell me a little more about what you need?';
      if (!clean.trim()) clean = "Sorry, I didn't catch that. Could you say it again?";
      result.reply = toWhatsAppText(clean);
      await autoHandoff();
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

  // Out of steps. Rather than stall or hand the chat over, ask once for a plain answer from what the tools already returned.
  try {
    const last = await o.llm.chat({ model: o.model, messages: [...messages, { role: 'system', content: 'Reply to the customer now in one short, helpful message, using only what the tools already returned. Do not call any more tools and do not mention these notes.' }], maxTokens: MAX_REPLY_TOKENS });
    result.inputTokens += last.usage.inputTokens; result.outputTokens += last.usage.outputTokens; result.costUsd += last.usage.costUsd;
    let text = stripArtifacts((last.message.content ?? '').trim());
    const unbacked = text ? ungroundedAmounts(text, [...o.history, { content: o.system }], result.toolCalls.map((t) => t.result)) : [];
    if (unbacked.length) text = withoutAmounts(text, unbacked);
    if (text && !hasModelArtifacts(text) && !(last.message.tool_calls?.length)) {
      result.reply = toWhatsAppText(text);
      result.handedOff = state.handedOff;
      return result;
    }
  } catch { /* fall through to the hand-over below */ }
  // Still nothing usable: hand to a human rather than guess.
  result.hitStepCap = true;
  result.handedOff = state.handedOff;
  return result;
}
