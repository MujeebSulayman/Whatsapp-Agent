import type { Prisma, PrismaClient } from '@wa/db';
import { decrementStock } from '@wa/shared';
import { z } from 'zod';

const OrderItems = z.array(z.object({ product_id: z.string(), quantity: z.number().int(), variant: z.string().nullish(), preorder: z.boolean().optional() })).catch([]);

/**
 * Mark an order paid: take the stock, count the sale, write the audit trail. Safe to call twice: only the first call does anything.
 * Used by the owner's "mark paid" button and by the payment provider's confirmation, so both behave identically.
 */
export async function settleOrderPaid(db: PrismaClient, o: { businessId: string; orderId: string; actor: string; via: 'manual' | 'paystack' }): Promise<{ settled: boolean }> {
  const order = await db.order.findFirst({ where: { id: o.orderId, businessId: o.businessId } });
  if (!order || order.status === 'cancelled' || order.paymentStatus === 'paid') return { settled: false };
  const items = OrderItems.parse(order.items);
  let settled = false;
  await db.$transaction(async (tx) => {
    // Re-check inside the transaction so two clicks, or a click and a webhook, can't double-count.
    const claimed = await tx.order.updateMany({
      where: { id: order.id, businessId: o.businessId, paymentStatus: { not: 'paid' } },
      data: { paymentStatus: 'paid', ...(order.status === 'pending' ? { status: 'paid' } : {}) }
    });
    if (claimed.count === 0) return;
    settled = true;
    for (const it of items) {
      if (it.preorder) continue; // a pre-order has nothing in stock to take yet
      const p = await tx.product.findFirst({ where: { id: it.product_id, businessId: o.businessId } });
      const next = p ? decrementStock(p, it.variant, it.quantity) : null;
      if (!p || !next) continue;
      // Guarded on the value we read, so two simultaneous payments can't both take the last item.
      await tx.product.updateMany({ where: { id: p.id, businessId: o.businessId, stockQty: p.stockQty }, data: { stockQty: next.stockQty, ...(next.variants ? { variants: next.variants as unknown as Prisma.InputJsonValue } : {}) } });
    }
    await tx.customer.updateMany({ where: { id: order.customerId, businessId: o.businessId }, data: { totalSpentMinor: { increment: order.totalMinor }, lastOrderAt: new Date() } });
    await tx.auditLog.create({ data: { businessId: o.businessId, actor: o.actor, action: o.via === 'paystack' ? 'order.paid_online' : 'order.mark_paid', payload: { orderId: order.id, totalMinor: order.totalMinor } } });
  });
  return { settled };
}
