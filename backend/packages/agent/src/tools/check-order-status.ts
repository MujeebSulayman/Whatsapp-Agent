import { z } from 'zod';
import { formatMoney } from '@wa/shared';
import { defineTool } from './types.js';

/** Only ever returns the CURRENT customer's orders: the customer id comes from the conversation, never from the model. */
export const checkOrderStatus = defineTool({
  name: 'check_order_status',
  description: "Status of this customer's orders (for 'where is my order?'). Pass order_id for a specific order, or omit it for their latest orders.",
  schema: z.object({ order_id: z.string().optional() }),
  async run(ctx, { order_id }) {
    const orders = await ctx.db.order.findMany({
      where: { businessId: ctx.businessId, customerId: ctx.customerId, ...(order_id ? { id: order_id } : {}) },
      orderBy: { createdAt: 'desc' },
      take: order_id ? 1 : 3
    });
    if (!orders.length) return { found: false, note: 'No orders found for this customer.' };
    return {
      found: true,
      orders: orders.map((o) => ({
        order_id: o.id,
        status: o.status,
        payment: o.paymentStatus,
        total: formatMoney(o.totalMinor, ctx.currency),
        placed: o.createdAt.toISOString().slice(0, 10)
      }))
    };
  }
});
