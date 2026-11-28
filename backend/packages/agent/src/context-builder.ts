import type { PrismaClient } from '@wa/db';
import type { ChatMessage } from '@wa/ai';
import { countryName, formatMoney, parseSteps } from '@wa/shared';
import { recentLookups } from './memory.js';
import { buildSystemPrompt } from './system-prompt.js';

export interface AgentContext {
  system: string;
  history: ChatMessage[];
  hasOpenOrder: boolean;
  lastCustomerText: string;
  /** True when this business has online payments set up, so the assistant may be given a payment-link port. */
  onlinePayments: boolean;
  /** Owner choice: try once to keep a customer who says no (true, the default) or let them go. */
  keepCustomers: boolean;
}

/** business + rules + customer + last 20 messages + open order. All reads are scoped by businessId. */
export async function buildContext(db: PrismaClient, o: { businessId: string; conversationId: string; customerId: string; /** Use this history instead of the stored messages (assistant preview). */ history?: ChatMessage[] }): Promise<AgentContext> {
  const { businessId } = o;
  const [business, rules, faqs, customer, recent, openOrder, playbooks, run, lookupRuns, zones] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    db.aiRules.findUnique({ where: { businessId } }),
    db.faq.findMany({ where: { businessId }, take: 20 }),
    db.customer.findFirst({ where: { id: o.customerId, businessId } }),
    db.message.findMany({ where: { businessId, conversationId: o.conversationId }, orderBy: { seq: 'desc' }, take: 20 }),
    db.order.findFirst({ where: { businessId, customerId: o.customerId, status: 'pending', paymentStatus: { in: ['unpaid', 'pending'] } }, orderBy: { createdAt: 'desc' } }),
    db.playbook.findMany({ where: { businessId, active: true }, orderBy: { createdAt: 'asc' }, take: 10 }),
    db.playbookRun.findFirst({ where: { businessId, customerId: o.customerId, status: 'active' }, orderBy: { createdAt: 'desc' }, include: { playbook: true } }),
    db.agentRun.findMany({ where: { businessId, conversationId: o.conversationId, kind: 'chat' }, orderBy: { createdAt: 'desc' }, take: 6, select: { toolCalls: true } }),
    db.deliveryZone.findMany({ where: { businessId }, orderBy: { areaName: 'asc' }, take: 30, select: { areaName: true } })
  ]);

  const history: ChatMessage[] = o.history ?? recent
    .reverse()
    .filter((m) => (m.body ?? m.transcript))
    .map((m) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: (m.body ?? m.transcript) as string }));

  const lastCustomerText = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hours = business.businessHours ? JSON.stringify(business.businessHours) : 'not set';

  const runSteps = run ? parseSteps(run.playbook.steps) : [];
  const runAnswers = (run?.answers ?? {}) as Record<string, string>;
  const next = runSteps.find((s) => !runAnswers[s.id]);
  const playbookInProgress = run && run.playbook.active
    ? `"${run.playbook.name}" (id=${run.playbookId}). Answered so far: ${runSteps.filter((s) => runAnswers[s.id]).map((s) => `${s.id}=${JSON.stringify(runAnswers[s.id])}`).join(', ') || 'nothing'}. ${next ? `Next: [${next.id}] ${next.ask}` : 'All steps answered: call finish_playbook.'}`
    : null;

  const system = buildSystemPrompt({
    onlinePayments: !!business.paystackSubaccountCode,
    keepCustomers: rules?.keepCustomers ?? true,
    areas: zones.map((z) => z.areaName),
    recentLookups: recentLookups(lookupRuns),
    playbooks: playbooks.map((b) => ({ id: b.id, name: b.name, whenToUse: b.whenToUse, steps: parseSteps(b.steps) })).filter((b) => b.steps.length),
    playbookInProgress,
    businessName: business.name,
    category: business.category,
    city: business.city,
    country: countryName(business.country),
    currency: business.currency,
    kind: business.kind,
    maxDiscountPct: rules?.maxDiscountPct ?? 0,
    hours,
    paymentMethods: business.paystackSubaccountCode
      ? `Online payment link (card or bank transfer), made with create_payment_link${business.paymentInfo ? `. Also: ${business.paymentInfo}` : ''}`
      : business.paymentInfo ?? 'Not set up yet: say the shop will share payment details, and never claim a payment link exists',
    returnPolicy: business.returnPolicy ?? 'ask the owner',
    customInstructions: rules?.customInstructions ?? '',
    tone: business.tone,
    forbiddenTopics: rules?.forbiddenTopics ?? [],
    faqs,
    customerName: customer?.name,
    openOrder: openOrder ? `${openOrder.id} total ${formatMoney(openOrder.totalMinor, business.currency)} (${openOrder.paymentStatus})` : null
  });

  return { system, history, hasOpenOrder: !!openOrder, lastCustomerText, onlinePayments: !!business.paystackSubaccountCode, keepCustomers: rules?.keepCustomers ?? true };
}
