import type { PrismaClient } from '@wa/db';
import { PaystackError, formatMoney, type PaystackClient } from '@wa/shared';
import type { ToolContext } from './tools/types.js';

/** Paystack takes the payment on the platform's account and settles the business's share to its own bank account. */
export const PAYMENT_CURRENCIES = ['NGN'];

export function createPaymentsPort(o: { db: PrismaClient; paystack: PaystackClient; businessId: string; customerId: string; /** Paystack needs an email; customers on WhatsApp have none. */ emailDomain?: string }): NonNullable<ToolContext['payments']> {
  const domain = o.emailDomain ?? process.env.PAYSTACK_CUSTOMER_EMAIL_DOMAIN ?? 'pay.converso.app';
  return {
    async createLink(orderId) {
      const business = await o.db.business.findUnique({ where: { id: o.businessId }, select: { currency: true, paystackSubaccountCode: true } });
      if (!business?.paystackSubaccountCode) return { error: 'This business has not set up online payments.' };
      if (!PAYMENT_CURRENCIES.includes(business.currency)) return { error: 'Online payment is not available for this currency.' };
      // Scoped to this business AND this customer: a customer can only pay their own order.
      const order = await o.db.order.findFirst({ where: { id: orderId, businessId: o.businessId, customerId: o.customerId } });
      if (!order) return { error: 'Unknown order_id. Use the order_id that create_order returned.' };
      if (order.paymentStatus === 'paid') return { error: 'This order is already paid.' };
      if (order.status === 'cancelled') return { error: 'This order was cancelled.' };
      if (order.totalMinor <= 0) return { error: 'This order has no amount to pay.' };
      const amount = formatMoney(order.totalMinor, business.currency);

      // The same open link is reused, so repeated requests never create duplicate charges.
      const open = await o.db.payment.findFirst({ where: { orderId: order.id, businessId: o.businessId, status: 'pending', amountMinor: order.totalMinor, checkoutUrl: { not: null } }, orderBy: { createdAt: 'desc' } });
      if (open?.checkoutUrl) return { url: open.checkoutUrl, amount };

      const reference = `cv-${order.id}-${Date.now().toString(36)}`;
      try {
        const tx = await o.paystack.initialize({
          email: `c-${o.customerId}@${domain}`, amountMinor: order.totalMinor, currency: business.currency, reference,
          subaccount: business.paystackSubaccountCode, bearer: 'subaccount', metadata: { orderId: order.id, businessId: o.businessId }
        });
        await o.db.payment.create({ data: { businessId: o.businessId, orderId: order.id, reference: tx.reference, amountMinor: order.totalMinor, checkoutUrl: tx.url } });
        return { url: tx.url, amount };
      } catch (e) {
        console.error(`[payments] could not start payment for order ${order.id}: ${e instanceof PaystackError ? e.message : (e as Error).message}`);
        return { error: 'Could not create a payment link right now.' };
      }
    }
  };
}
