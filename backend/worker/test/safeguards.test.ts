import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, LlmClient } from '@wa/ai';
import { createPrisma } from '@wa/db';
import { encryptSecret, type InboundJob } from '@wa/shared';
import { applyDiscount } from '@wa/agent';
import { checkOrderStatus } from '@wa/agent';
import { checkStock } from '@wa/agent';
import { saveCustomerDetail } from '@wa/agent';
import { sendProductImage } from '@wa/agent';
import type { ToolContext } from '@wa/agent';
import { FALLBACK_TEXT, handleInbound } from '../src/jobs/handle-inbound.js';

const KEY = 'f'.repeat(64);
const prisma = createPrisma();
const ids = { biz: '', other: '', ada: '', bola: '', adaOrder: '', bolaOrder: '', product: '', otherProduct: '', photoProduct: '' };
const ctxFor = (customerId: string, extra: Partial<ToolContext> = {}): ToolContext => ({
  db: prisma, businessId: ids.biz, currency: 'NGN', kind: 'goods', conversationId: 'c', customerId, state: { handedOff: false }, ...extra
});

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['guard-test', 'guard-other'] } } });
  const other = await prisma.business.create({ data: { name: 'Other', slug: 'guard-other', category: 'x', products: { create: { name: 'Secret', priceMinor: 100, stockQty: 1 } } }, include: { products: true } });
  ids.other = other.id; ids.otherProduct = other.products[0]!.id;
  const b = await prisma.business.create({
    data: {
      name: 'Guard Test', slug: 'guard-test', category: 'chops', ownerPhone: '2348077770000',
      whatsappAccounts: { create: { wabaId: 'WABA', phoneNumberId: 'GUARD-PNID', displayNumber: '1', accessTokenEncrypted: encryptSecret('TOK', KEY) } },
      aiRules: { create: { maxDiscountPct: 10 } },
      products: { create: [{ name: 'Party Pack', priceMinor: 1_000_000, stockQty: 4 }, { name: 'Photo Item', priceMinor: 100, stockQty: 1, imageUrls: ['https://img.example/a.jpg'] }] },
      customers: { create: [{ waId: '2348011110001', name: 'Ada' }, { waId: '2348011110002', name: 'Bola' }] }
    },
    include: { products: true, customers: true }
  });
  ids.biz = b.id;
  ids.product = b.products.find((p) => p.name === 'Party Pack')!.id;
  ids.photoProduct = b.products.find((p) => p.name === 'Photo Item')!.id;
  ids.ada = b.customers.find((c) => c.name === 'Ada')!.id;
  ids.bola = b.customers.find((c) => c.name === 'Bola')!.id;
  const mk = (customerId: string) => prisma.order.create({ data: { businessId: b.id, customerId, items: [], subtotalMinor: 1_000_000, deliveryFeeMinor: 200_000, totalMinor: 1_200_000 } });
  ids.adaOrder = (await mk(ids.ada)).id;
  ids.bolaOrder = (await mk(ids.bola)).id;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: ['guard-test', 'guard-other'] } } });
  await prisma.$disconnect();
});

describe('tools only act for the current customer in the current business', () => {
  it("check_order_status never returns another customer's order, even by id", async () => {
    const own = (await checkOrderStatus.run(ctxFor(ids.ada), {})) as { orders: { order_id: string }[] };
    expect(own.orders.map((o) => o.order_id)).toEqual([ids.adaOrder]);
    expect(await checkOrderStatus.run(ctxFor(ids.ada), { order_id: ids.bolaOrder })).toMatchObject({ found: false });
  });
  it('apply_discount enforces the owner cap, never stacks, and refuses other customers and paid orders', async () => {
    expect(await applyDiscount.run(ctxFor(ids.ada), { order_id: ids.adaOrder, pct: 15 })).toMatchObject({ error: expect.stringContaining('maximum discount is 10%') });
    expect(await applyDiscount.run(ctxFor(ids.ada), { order_id: ids.adaOrder, pct: 10 })).toMatchObject({ new_total: '₦11,000' });
    expect(await applyDiscount.run(ctxFor(ids.ada), { order_id: ids.adaOrder, pct: 10 })).toMatchObject({ new_total: '₦11,000' }); // same, not 20%
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.adaOrder } })).totalMinor).toBe(1_100_000);
    expect(await applyDiscount.run(ctxFor(ids.ada), { order_id: ids.bolaOrder, pct: 5 })).toMatchObject({ error: 'Order not found.' });
    await prisma.order.update({ where: { id: ids.bolaOrder }, data: { paymentStatus: 'paid' } });
    expect(await applyDiscount.run(ctxFor(ids.bola), { order_id: ids.bolaOrder, pct: 5 })).toMatchObject({ error: expect.stringContaining('no longer') });
  });
  it('check_stock and save_customer_detail are scoped to the business', async () => {
    expect(await checkStock.run(ctxFor(ids.ada), { product_id: ids.product })).toMatchObject({ in_stock: true, stock_qty: 4 });
    expect(await checkStock.run(ctxFor(ids.ada), { product_id: ids.otherProduct })).toMatchObject({ error: expect.any(String) });
    await saveCustomerDetail.run(ctxFor(ids.ada), { field: 'note', value: 'Prefers no pepper' });
    await saveCustomerDetail.run(ctxFor(ids.ada), { field: 'name', value: 'Ada O.' });
    const ada = await prisma.customer.findUniqueOrThrow({ where: { id: ids.ada } });
    expect([ada.name, ada.notes]).toEqual(['Ada O.', 'Prefers no pepper']);
  });
  it('send_product_image sends only real photos from this business', async () => {
    const sent: string[] = [];
    const ctx = ctxFor(ids.ada, { sendImage: async (o) => void sent.push(o.url) });
    expect(await sendProductImage.run(ctx, { product_id: ids.photoProduct })).toMatchObject({ sent: true, photos: 1 });
    expect(sent).toEqual(['https://img.example/a.jpg']);
    expect(await sendProductImage.run(ctx, { product_id: ids.product })).toMatchObject({ sent: false });
    expect(await sendProductImage.run(ctx, { product_id: ids.otherProduct })).toMatchObject({ error: expect.any(String) });
  });
});

describe('handler safeguards', () => {
  const say = (c: string): ChatMessage => ({ role: 'assistant', content: c });
  const calls: number[] = [];
  const llm = (steps: ChatMessage[]): LlmClient => ({
    async chat() {
      calls.push(1);
      return { message: steps[Math.min(calls.length - 1, steps.length - 1)]!, usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.5 } };
    }
  });
  const sent: { to: string; body: string }[] = [];
  const deps = (l: LlmClient) => ({
    db: prisma, llm: l, models: { fast: 'f', smart: 's' }, encryptionKey: KEY, batchWaitMs: 0, log: () => {},
    sendText: async (o: { to: string; body: string }) => (sent.push({ to: o.to, body: o.body }), `wamid.out.${Math.random()}`)
  });
  let job: InboundJob;
  let convId = '';

  async function newJob(text = 'I want a party pack') {
    const conv = await prisma.conversation.create({ data: { businessId: ids.biz, customerId: ids.ada } });
    const msg = await prisma.message.create({ data: { businessId: ids.biz, conversationId: conv.id, direction: 'inbound', body: text, waMessageId: `wamid.g.${Math.random()}`, sentBy: 'customer' } });
    convId = conv.id;
    job = { businessId: ids.biz, conversationId: conv.id, customerId: ids.ada, messageId: msg.id, phoneNumberId: 'GUARD-PNID', waMessageId: msg.waMessageId!, from: '2348011110001', type: 'text', body: text, timestamp: 1 };
  }
  beforeEach(async () => {
    calls.length = 0; sent.length = 0;
    await prisma.business.update({ where: { id: ids.biz }, data: { aiEnabled: true, aiDailyCapUsd: 5 } });
    await prisma.agentRun.deleteMany({ where: { businessId: ids.biz } });
  });

  it('does not reply at all when the owner switched the AI off', async () => {
    await prisma.business.update({ where: { id: ids.biz }, data: { aiEnabled: false } });
    await newJob();
    await handleInbound(deps(llm([say('hi')])), job);
    expect(sent).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('counts usage per month for the business', async () => {
    await prisma.usageLedger.deleteMany({ where: { businessId: ids.biz } });
    await newJob();
    await handleInbound(deps(llm([say('Sure!')])), job);
    const u = await prisma.usageLedger.findFirstOrThrow({ where: { businessId: ids.biz } });
    expect([u.aiReplies, u.waMessagesBilled]).toEqual([1, 1]);
  });

  it('stops calling the model once the daily spend cap is hit, hands to a human and alerts the owner', async () => {
    await prisma.business.update({ where: { id: ids.biz }, data: { aiDailyCapUsd: 1 } });
    await prisma.agentRun.create({ data: { businessId: ids.biz, conversationId: (await prisma.conversation.create({ data: { businessId: ids.biz, customerId: ids.ada } })).id, model: 'm', costUsd: 1.5 } });
    await newJob();
    await handleInbound(deps(llm([say('should not run')])), job);
    expect(calls).toHaveLength(0);
    expect(sent[0]).toMatchObject({ to: '2348011110001', body: FALLBACK_TEXT });
    expect(sent[1]?.to).toBe('2348077770000');
    expect(sent[1]?.body).toContain('daily usage limit');
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: convId } })).status).toBe('human');
  });

  it("tells the owner on WhatsApp when the AI hands a chat over, with the reason", async () => {
    await newJob('this food made me sick, refund me');
    const handoff: ChatMessage = { role: 'assistant', content: null, tool_calls: [{ id: 'h', type: 'function', function: { name: 'handoff_to_human', arguments: JSON.stringify({ reason: 'refund request', summary: 'Customer says food was bad' }) } }] };
    await handleInbound(deps(llm([handoff, say('Sorry about that, a team member will reply shortly.')])), job);
    expect(sent[0]?.to).toBe('2348011110001');
    const alert = sent.find((m) => m.to === '2348077770000');
    expect(alert?.body).toContain('refund request');
    expect(alert?.body).not.toContain('2348011110001'); // customer number is masked
  });
});
