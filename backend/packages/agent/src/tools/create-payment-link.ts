import { z } from 'zod';
import { defineTool } from './types.js';

export const createPaymentLink = defineTool({
  name: 'create_payment_link',
  description: "Get a secure online payment link for an order the customer is ready to pay for. Use the order_id from create_order. Send the link to the customer. Never say an order is paid: payment is confirmed automatically by the payment system.",
  schema: z.object({ order_id: z.string() }),
  async run(ctx, { order_id }) {
    if (!ctx.payments) return { error: 'Online payment is not available. Give the payment details from BUSINESS INFO and say the shop will confirm once payment is received.' };
    const r = await ctx.payments.createLink(order_id);
    if ('error' in r) return { error: `${r.error} Give the payment details from BUSINESS INFO instead and say the shop will confirm once payment is received.` };
    return { payment_link: r.url, amount: r.amount, next: 'Send this exact link and the amount. Say you will confirm as soon as the payment goes through. Do NOT say it is paid.' };
  }
});
