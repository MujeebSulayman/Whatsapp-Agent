import { z } from 'zod';
import { formatNaira } from '@wa/shared';
import { defineTool } from './types.js';

export const applyDiscount = defineTool({
  name: 'apply_discount',
  description: "Apply a percentage discount to this customer's unpaid order. Never exceeds the owner's maximum; the server enforces it.",
  schema: z.object({ order_id: z.string(), pct: z.number().int().min(1).max(100) }),
  async run(ctx, { order_id, pct }) {
    const rules = await ctx.db.aiRules.findUnique({ where: { businessId: ctx.businessId } });
    const max = rules?.maxDiscountPct ?? 0;
    if (pct > max) return { error: `Not allowed. The maximum discount is ${max}%.`, max_discount_pct: max };
    const order = await ctx.db.order.findFirst({ where: { id: order_id, businessId: ctx.businessId, customerId: ctx.customerId } });
    if (!order) return { error: 'Order not found.' };
    if (order.paymentStatus === 'paid' || order.status === 'cancelled') return { error: 'This order can no longer be discounted.' };
    // Always computed from the subtotal, so repeated calls never stack.
    const discountKobo = Math.floor((order.subtotalKobo * pct) / 100);
    const totalKobo = order.subtotalKobo + order.deliveryFeeKobo - discountKobo;
    await ctx.db.order.updateMany({ where: { id: order.id, businessId: ctx.businessId }, data: { discountKobo, totalKobo } });
    return { order_id, discount: formatNaira(discountKobo), new_total: formatNaira(totalKobo) };
  }
});
