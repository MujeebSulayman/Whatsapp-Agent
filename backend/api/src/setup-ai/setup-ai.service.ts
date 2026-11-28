import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { buildContext, runAgent } from '@wa/agent';
import { extractJson, modelConfigFromEnv, pickModel, type ChatInputMessage, type ContentPart, type LlmClient } from '@wa/ai';
import type { Prisma, PrismaClient } from '@wa/db';
import { formatMoney, parseMoney } from '@wa/shared';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { EmbeddingService } from '../common/embedding.js';
import { PRISMA, REDIS } from '../infra.module.js';
import { correctionSystem, importSystem, improveSystem, interviewSystem, playbookSystem, type BizFacts } from './prompts.js';
import { ApplyBody, ImportOut, InterviewOut, PlaybookOut, RuleOut, SuggestionOut, clean } from './schemas.js';

export const LLM_CLIENT = 'LLM_CLIENT';
/** Embeds a search query for the practice chat; undefined when no AI key is configured. */
export const QUERY_EMBEDDER = 'QUERY_EMBEDDER';

type RunKind = 'setup' | 'preview';
class RollbackPreview extends Error {}

/** "12k" -> 12000, "₦12,500.50" -> 1250050, nonsense -> null. No floating point. */
export function priceToMinor(raw: unknown, currency: string): number | null {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim().toLowerCase();
  const k = t.match(/^[^\d-]*([\d.,]+)\s*k$/);
  if (k) {
    const base = parseMoney(k[1]!, currency);
    return base === null ? null : base * 1000;
  }
  return parseMoney(t, currency);
}

@Injectable()
export class SetupAiService {
  private readonly log = new Logger('SetupAI');
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    @Inject(QUERY_EMBEDDER) private readonly embedQuery: ((t: string) => Promise<number[]>) | undefined,
    @Inject(EmbeddingService) private readonly embeddings: EmbeddingService
  ) {}

  available(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }

  private async facts(businessId: string): Promise<BizFacts> {
    const b = await this.db.business.findUniqueOrThrow({ where: { id: businessId } });
    return { name: b.name, category: b.category, kind: b.kind, city: b.city, country: b.country, currency: b.currency };
  }

  /** Every AI call: key present, under the hourly request limit, and under the business's daily spend cap. */
  private async guard(businessId: string): Promise<void> {
    if (!this.available()) throw new ServiceUnavailableException('The AI assistant is not available right now.');
    const key = `rl:setupai:${businessId}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 3600);
    if (n > 60) throw new HttpException('Too many AI requests this hour. Please try again a little later.', HttpStatus.TOO_MANY_REQUESTS);
    const b = await this.db.business.findUniqueOrThrow({ where: { id: businessId }, select: { aiDailyCapUsd: true } });
    const start = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const spent = await this.db.agentRun.aggregate({ where: { businessId, createdAt: { gte: start } }, _sum: { costUsd: true } });
    if (Number(spent._sum.costUsd ?? 0) >= Number(b.aiDailyCapUsd)) {
      throw new HttpException("Today's AI limit has been reached. It resets tomorrow, or ask us to raise it.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private record(businessId: string, kind: RunKind, model: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }, started: number, toolCalls?: unknown) {
    return this.db.agentRun.create({
      data: { businessId, conversationId: null, kind, model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, latencyMs: Date.now() - started, toolCalls: toolCalls as Prisma.InputJsonValue | undefined }
    });
  }

  /** Ask for a JSON object and validate it. One automatic retry if the model's reply doesn't fit the shape. */
  private async askJson<T extends z.ZodType>(businessId: string, o: { model: string; system: string; user: string | ContentPart[]; schema: T }): Promise<z.infer<T>> {
    await this.guard(businessId);
    let messages: ChatInputMessage[] = [{ role: 'system', content: o.system }, { role: 'user', content: o.user }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      let reply;
      try {
        reply = await this.llm.chat({ model: o.model, messages, json: true, temperature: 0.2, maxTokens: 4000 });
      } catch (e) {
        this.log.warn(`LLM call failed: ${(e as Error).message}`);
        throw new HttpException('The AI service is not responding. Please try again in a minute.', HttpStatus.BAD_GATEWAY);
      }
      await this.record(businessId, 'setup', o.model, reply.usage, started);
      const parsed = o.schema.safeParse(extractJson(reply.message.content));
      if (parsed.success) return parsed.data;
      messages = [...messages, { role: 'assistant', content: reply.message.content ?? '' }, { role: 'user', content: 'That was not valid JSON for the required shape. Reply with only the JSON object.' }];
    }
    throw new HttpException("The assistant couldn't read that. Try a clearer photo or paste the text, or add items by hand.", HttpStatus.UNPROCESSABLE_ENTITY);
  }

  /* ---------------- 1. read a price list ---------------- */
  async importFrom(businessId: string, input: { text?: string; images: string[] }) {
    const facts = await this.facts(businessId);
    const parts: ContentPart[] = [];
    if (input.text?.trim()) parts.push({ type: 'text', text: `The owner's text:\n"""\n${input.text.trim()}\n"""` });
    for (const url of input.images) parts.push({ type: 'image_url', image_url: { url } });
    if (input.images.length) parts.unshift({ type: 'text', text: 'Read everything relevant in the attached photo(s) of a price list, menu or notes.' });
    const out = await this.askJson(businessId, {
      model: input.images.length ? (process.env.OPENROUTER_MODEL_VISION ?? modelConfigFromEnv().smart) : modelConfigFromEnv().smart,
      system: importSystem(facts), user: parts.length === 1 && parts[0]!.type === 'text' ? parts[0]!.text : parts, schema: ImportOut
    });

    const warnings = [...out.warnings];
    const seen = new Set<string>();
    const products = out.products.filter((p) => p.name).flatMap((p) => {
      const key = p.name.toLowerCase();
      if (seen.has(key)) { warnings.push(`"${p.name}" appears more than once; kept the first.`); return []; }
      seen.add(key);
      const priceMinor = priceToMinor(p.price, facts.currency);
      const stock = p.stock === null || p.stock === undefined ? null : Number(p.stock);
      return [{
        name: p.name, description: p.description, priceMinor,
        variants: (p.variants ?? []).filter(Boolean), stockQty: stock !== null && Number.isInteger(stock) && stock >= 0 ? stock : null,
        issue: priceMinor === null ? 'Check the price' : null
      }];
    });
    const zones = out.zones.filter((z) => z.area).map((z) => {
      const feeMinor = priceToMinor(z.fee, facts.currency);
      return { areaName: z.area, feeMinor, etaText: z.eta, issue: feeMinor === null ? 'Check the fee' : null };
    });
    return { products, zones, faqs: out.faqs, warnings };
  }

  /* ---------------- 2. draft FAQs and rules from a short interview ---------------- */
  async draftFromInterview(businessId: string, answers: { question: string; answer: string }[]) {
    const given = answers.filter((a) => a.answer.trim());
    const body = given.map((a, i) => `${i + 1}. ${a.question}\nAnswer: ${a.answer.trim()}`).join('\n\n');
    return this.askJson(businessId, { model: modelConfigFromEnv().smart, system: interviewSystem(await this.facts(businessId)), user: `The owner's answers:\n"""\n${body}\n"""`, schema: InterviewOut });
  }

  /* ---------------- 2b. draft a playbook from a plain description ---------------- */
  async draftPlaybook(businessId: string, description: string) {
    const out = await this.askJson(businessId, { model: modelConfigFromEnv().smart, system: playbookSystem(await this.facts(businessId)), user: `How the owner handles this kind of customer:\n\"\"\"\n${clean(description, 1200)}\n\"\"\"`, schema: PlaybookOut });
    if (out.steps.length === 0) throw new HttpException('Could not turn that into steps. Describe what you ask a customer, one thing at a time.', HttpStatus.UNPROCESSABLE_ENTITY);
    return out;
  }

  /* ---------------- 3. help with one field ---------------- */
  async improve(businessId: string, field: 'instructions' | 'faq_answer' | 'product_description', text: string, context?: string): Promise<string> {
    const facts = await this.facts(businessId);
    const user = `${context ? `About: ${clean(context, 300)}\n` : ''}The owner's draft:\n"""\n${text.trim() || '(empty: write a sensible starting point from what you know about the business)'}\n"""`;
    const out = await this.askJson(businessId, { model: modelConfigFromEnv().fast, system: improveSystem(facts, field), user, schema: SuggestionOut });
    return out.suggestion;
  }

  /* ---------------- 4a. turn a correction into a standing rule ---------------- */
  async ruleFromCorrection(businessId: string, c: { customerMessage: string; assistantReply: string; correction: string }): Promise<string> {
    const user = `Customer said: ${clean(c.customerMessage, 600)}\nThe assistant replied: ${clean(c.assistantReply, 1500)}\nThe owner's correction: ${clean(c.correction, 600)}`;
    const out = await this.askJson(businessId, { model: modelConfigFromEnv().fast, system: correctionSystem(await this.facts(businessId)), user, schema: RuleOut });
    return out.rule;
  }

  /** Add one confirmed rule to the standing instructions, without exceeding the limit or repeating a rule. */
  async appendRule(businessId: string, actor: string, rule: string): Promise<{ customInstructions: string }> {
    const existing = await this.db.aiRules.findUnique({ where: { businessId } });
    const current = existing?.customInstructions ?? '';
    const line = clean(rule, 200);
    if (current.toLowerCase().includes(line.toLowerCase())) return { customInstructions: current };
    const next = [current, line].filter(Boolean).join('\n');
    if (next.length > 1500) throw new HttpException('Your standing instructions are full. Remove an old rule first.', HttpStatus.CONFLICT);
    await this.db.aiRules.upsert({ where: { businessId }, create: { businessId, customInstructions: next }, update: { customInstructions: next } });
    await this.db.auditLog.create({ data: { businessId, actor, action: 'setup_ai.rule_added', payload: { rule: line } } });
    return { customInstructions: next };
  }

  /* ---------------- 4b. practice chat: the real agent, nothing saved ---------------- */
  async preview(businessId: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
    if (messages.at(-1)?.role !== 'user') throw new HttpException('Send a customer message to get a reply.', HttpStatus.BAD_REQUEST);
    await this.guard(businessId);
    const business = await this.db.business.findUniqueOrThrow({ where: { id: businessId }, select: { currency: true, kind: true, paystackSubaccountCode: true } });
    const started = Date.now();
    let captured: Awaited<ReturnType<typeof runAgent>> | null = null;
    try {
      // The whole turn runs inside a transaction that is always rolled back: orders, customer notes and hand-offs the
      // assistant makes while practising are real queries against real data, but none of it is ever kept.
      await this.db.$transaction(async (tx) => {
        const db = tx as unknown as PrismaClient;
        const customer = await db.customer.create({ data: { businessId, waId: `practice-${Date.now()}`, name: 'Practice customer' } });
        const conversation = await db.conversation.create({ data: { businessId, customerId: customer.id } });
        const ctx = await buildContext(db, { businessId, conversationId: conversation.id, customerId: customer.id, history: messages });
        const model = pickModel(modelConfigFromEnv(), { lastMessage: ctx.lastCustomerText, hasOpenOrder: false });
        captured = await runAgent({
          llm: this.llm, model, system: ctx.system, history: ctx.history, keepCustomers: ctx.keepCustomers,
          ctx: { db, businessId, currency: business.currency, kind: business.kind, conversationId: conversation.id, customerId: customer.id, embed: this.embedQuery,
            // Practice mode never touches Paystack: it shows the same behaviour with a link that goes nowhere.
            payments: !ctx.onlinePayments ? undefined : { createLink: async (orderId) => (business.paystackSubaccountCode ? { url: 'https://checkout.paystack.com/practice-mode-link', amount: (await db.order.findFirst({ where: { id: orderId, businessId } }).then((o) => (o ? formatMoney(o.totalMinor, business.currency) : ''))) } : { error: 'This business has not set up online payments.' }) } }
        });
        throw new RollbackPreview();
      }, { maxWait: 10_000, timeout: 120_000 });
    } catch (e) {
      if (!(e instanceof RollbackPreview)) {
        this.log.warn(`preview failed: ${(e as Error).message}`);
        throw new HttpException('The practice chat hit a problem. Please try again.', HttpStatus.BAD_GATEWAY);
      }
    }
    const run = captured as Awaited<ReturnType<typeof runAgent>> | null;
    if (!run) throw new HttpException('The practice chat hit a problem. Please try again.', HttpStatus.BAD_GATEWAY);
    await this.record(businessId, 'preview', run.model, { inputTokens: run.inputTokens, outputTokens: run.outputTokens, costUsd: run.costUsd }, started, run.toolCalls.map((t) => ({ name: t.name })));
    return {
      reply: run.reply || "Give me one moment, I'll get back to you.",
      handedOff: run.handedOff || run.hitStepCap,
      actions: run.toolCalls.map((t) => ({ name: t.name, failed: typeof t.result === 'object' && t.result !== null && 'error' in t.result }))
    };
  }

  /* ---------------- 5. save what the owner approved ---------------- */
  /** Re-validates everything: model output and the browser are both untrusted. Existing items with the same name are updated. */
  async apply(businessId: string, actor: string, raw: unknown) {
    const body = ApplyBody.parse(raw);
    const business = await this.db.business.findUniqueOrThrow({ where: { id: businessId }, select: { kind: true } });
    const touchedProducts: string[] = [];
    const counts = { productsAdded: 0, productsUpdated: 0, zones: 0, faqs: 0 };

    await this.db.$transaction(async (tx) => {
      for (const p of body.products) {
        // Stock is only counted when the owner gave a number (and the business sells stocked goods). No number = always available, never "sold out".
        const counted = typeof p.stockQty === 'number' && business.kind !== 'services';
        const data = { description: p.description ?? null, priceMinor: p.priceMinor, ...(counted ? { stockQty: p.stockQty!, trackStock: true } : {}), variants: p.variants?.length ? (p.variants.map((name) => ({ name })) as Prisma.InputJsonValue) : undefined };
        const existing = await tx.product.findFirst({ where: { businessId, name: { equals: p.name, mode: 'insensitive' } } });
        if (existing) { await tx.product.update({ where: { id: existing.id }, data }); touchedProducts.push(existing.id); counts.productsUpdated++; }
        else { touchedProducts.push((await tx.product.create({ data: { businessId, name: p.name, trackStock: false, ...data } })).id); counts.productsAdded++; }
      }
      for (const z of body.zones) {
        const existing = await tx.deliveryZone.findFirst({ where: { businessId, areaName: { equals: z.areaName, mode: 'insensitive' } } });
        if (existing) await tx.deliveryZone.update({ where: { id: existing.id }, data: { feeMinor: z.feeMinor, etaText: z.etaText } });
        else await tx.deliveryZone.create({ data: { businessId, areaName: z.areaName, feeMinor: z.feeMinor, etaText: z.etaText } });
        counts.zones++;
      }
      for (const f of body.faqs) {
        const existing = await tx.faq.findFirst({ where: { businessId, question: { equals: f.question, mode: 'insensitive' } } });
        if (existing) await tx.faq.update({ where: { id: existing.id }, data: { answer: f.answer } });
        else await tx.faq.create({ data: { businessId, question: f.question, answer: f.answer } });
        counts.faqs++;
      }
      if (body.profile) {
        const { businessHours, ...rest } = body.profile;
        await tx.business.update({ where: { id: businessId }, data: { ...rest, ...(businessHours !== undefined ? { businessHours: businessHours ?? undefined } : {}) } });
      }
      if (body.rules) {
        const cur = await tx.aiRules.findUnique({ where: { businessId } });
        const union = (a: string[], b: string[] | undefined) => [...new Set([...a, ...(b ?? [])].map((x) => x.trim()).filter(Boolean))].slice(0, 30);
        const data = {
          escalateKeywords: union(cur?.escalateKeywords ?? [], body.rules.escalateKeywords),
          forbiddenTopics: union(cur?.forbiddenTopics ?? [], body.rules.forbiddenTopics),
          ...(body.rules.customInstructions !== undefined ? { customInstructions: body.rules.customInstructions } : {})
        };
        await tx.aiRules.upsert({ where: { businessId }, create: { businessId, ...data }, update: data });
      }
      await tx.auditLog.create({ data: { businessId, actor, action: 'setup_ai.apply', payload: { ...counts, profile: !!body.profile, rules: !!body.rules } } });
    });
    this.embeddings.indexProducts(businessId, touchedProducts);
    return counts;
  }
}
