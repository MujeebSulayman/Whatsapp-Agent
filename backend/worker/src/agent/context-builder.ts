import type { PrismaClient } from '@wa/db';
import type { ChatMessage } from '@wa/ai';
import { countryName, formatMoney } from '@wa/shared';
import { buildSystemPrompt } from './system-prompt.js';

export interface AgentContext {
  system: string;
  history: ChatMessage[];
  hasOpenOrder: boolean;
  lastCustomerText: string;
}

/** business + rules + customer + last 20 messages + open order. All reads are scoped by businessId. */
export async function buildContext(db: PrismaClient, o: { businessId: string; conversationId: string; customerId: string }): Promise<AgentContext> {
  const { businessId } = o;
  const [business, rules, faqs, customer, recent, openOrder] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    db.aiRules.findUnique({ where: { businessId } }),
    db.faq.findMany({ where: { businessId }, take: 20 }),
    db.customer.findFirst({ where: { id: o.customerId, businessId } }),
    db.message.findMany({ where: { businessId, conversationId: o.conversationId }, orderBy: { seq: 'desc' }, take: 20 }),
    db.order.findFirst({ where: { businessId, customerId: o.customerId, status: 'pending', paymentStatus: { in: ['unpaid', 'pending'] } }, orderBy: { createdAt: 'desc' } })
  ]);

  const history: ChatMessage[] = recent
    .reverse()
    .filter((m) => (m.body ?? m.transcript))
    .map((m) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: (m.body ?? m.transcript) as string }));

  const lastCustomerText = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hours = business.businessHours ? JSON.stringify(business.businessHours) : 'not set';

  const system = buildSystemPrompt({
    businessName: business.name,
    category: business.category,
    city: business.city,
    country: countryName(business.country),
    currency: business.currency,
    kind: business.kind,
    maxDiscountPct: rules?.maxDiscountPct ?? 0,
    hours,
    paymentMethods: business.paymentInfo ?? 'Paystack payment link',
    returnPolicy: business.returnPolicy ?? 'ask the owner',
    customInstructions: rules?.customInstructions ?? '',
    tone: business.tone,
    forbiddenTopics: rules?.forbiddenTopics ?? [],
    faqs,
    customerName: customer?.name,
    openOrder: openOrder ? `${openOrder.id} total ${formatMoney(openOrder.totalMinor, business.currency)} (${openOrder.paymentStatus})` : null
  });

  return { system, history, hasOpenOrder: !!openOrder, lastCustomerText };
}
