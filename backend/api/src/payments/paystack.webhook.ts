import { Controller, HttpCode, Inject, Logger, Post, Req, Headers, UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { formatMoney, verifyPaystackSignature, type PaystackClient } from '@wa/shared';
import { Messenger } from '../common/messenger.js';
import { PRISMA } from '../infra.module.js';
import { settleOrderPaid } from '../orders/settle.js';
import { PAYSTACK_CLIENT } from './payments.controller.js';

interface RawBodyRequest { rawBody?: Buffer; body: unknown }

/** Paystack tells us when a customer has paid. Nothing is believed until the signature checks out AND Paystack confirms the amount. */
@Controller('webhooks/paystack')
export class PaystackWebhookController {
  private readonly log = new Logger('PaystackWebhook');
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(PAYSTACK_CLIENT) private readonly paystack: PaystackClient | null,
    @Inject(Messenger) private readonly messenger: Messenger
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest, @Headers('x-paystack-signature') signature?: string): Promise<{ ok: true }> {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || !req.rawBody || !verifyPaystackSignature(req.rawBody, signature, secret)) throw new UnauthorizedException();
    try {
      const body = req.body as { event?: string; data?: { reference?: string } };
      if (body.event === 'charge.success' && body.data?.reference) await this.paid(body.data.reference, body);
    } catch (e) {
      // Never make Paystack retry-storm us over our own bug: log and still answer 200.
      this.log.error(`could not process event: ${(e as Error).message}`);
    }
    return { ok: true };
  }

  private async paid(reference: string, raw: unknown) {
    const payment = await this.db.payment.findUnique({ where: { reference }, include: { order: true } });
    if (!payment || payment.status === 'paid') return; // unknown reference, or already handled (Paystack sends events more than once)
    if (!this.paystack) return;
    const tx = await this.paystack.verify(reference); // ask Paystack directly rather than trusting the message
    const business = await this.db.business.findUnique({ where: { id: payment.businessId }, select: { currency: true } });
    if (tx.status !== 'success' || tx.amountMinor !== payment.amountMinor || tx.currency !== business?.currency || payment.order.totalMinor !== payment.amountMinor) {
      this.log.warn(`payment ${reference} did not match its order; not marking paid`);
      return;
    }
    const claimed = await this.db.payment.updateMany({ where: { id: payment.id, status: { not: 'paid' } }, data: { status: 'paid', paidAt: new Date(), rawWebhook: raw as never } });
    if (claimed.count === 0) return;
    await settleOrderPaid(this.db, { businessId: payment.businessId, orderId: payment.orderId, actor: 'paystack', via: 'paystack' });
    await this.tellCustomer(payment.businessId, payment.order.customerId, formatMoney(payment.amountMinor, business.currency));
  }

  /** A short confirmation in the chat, when WhatsApp still allows a free-form message. */
  private async tellCustomer(businessId: string, customerId: string, amount: string) {
    try {
      const conv = await this.db.conversation.findFirst({ where: { businessId, customerId }, orderBy: { lastMessageAt: 'desc' }, include: { customer: true } });
      if (!conv || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() < Date.now()) return;
      const text = `Payment of ${amount} received. Thank you! Your order is confirmed and we will keep you updated.`;
      const sent = await this.messenger.send(businessId, conv.customer.waId, text);
      await this.db.message.create({ data: { businessId, conversationId: conv.id, direction: 'outbound', type: 'text', body: text, waMessageId: sent.waId, status: sent.dryRun ? 'dry_run' : 'sent', sentBy: 'ai' } });
    } catch (e) {
      this.log.warn(`could not message customer: ${(e as Error).message}`);
    }
  }
}
