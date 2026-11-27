import { z } from 'zod';
import type { Prisma } from '@wa/db';
import { formatMoney } from '@wa/shared';
import { defineTool } from './types.js';

export const createOrder = defineTool({
  name: 'create_order',
  description:
    'Create a draft order once you have items, quantities, delivery area and full address. Totals are calculated by the server; never compute or quote totals yourself.',
  schema: z.object({
    items: z.array(z.object({ product_id: z.string(), quantity: z.number().int().min(1).max(100), variant: z.string().optional() })).min(1).max(20),
    delivery_area: z.string().min(1),
    address: z.string().min(5).max(300),
    notes: z.string().max(300).optional()
  }),
  async run(ctx, args) {
    const ids = [...new Set(args.items.map((i) => i.product_id))];
    // business_id scoping: a product id from another business simply isn't found.
    const products = await ctx.db.product.findMany({ where: { id: { in: ids }, businessId: ctx.businessId, active: true } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines = [];
    for (const item of args.items) {
      const p = byId.get(item.product_id);
      if (!p) return { error: `Unknown product_id ${item.product_id}. Use search_products to get valid ids.` };
      const already = args.items.filter((i) => i.product_id === p.id).reduce((s, i) => s + i.quantity, 0);
      if (p.stockQty < already) return { error: `Only ${p.stockQty} of "${p.name}" in stock.` };
      lines.push({ product_id: p.id, name: p.name, variant: item.variant ?? null, quantity: item.quantity, unit_price_minor: p.priceMinor, line_total_minor: p.priceMinor * item.quantity });
    }

    const zones = await ctx.db.deliveryZone.findMany({ where: { businessId: ctx.businessId } });
    const q = args.delivery_area.toLowerCase();
    const zone = zones.find((z) => z.areaName.toLowerCase() === q) ?? zones.find((z) => q.includes(z.areaName.toLowerCase()));
    if (!zone) return { error: 'Delivery area not served. Ask the customer for a served area or hand off to the owner.' };

    const subtotalMinor = lines.reduce((s, l) => s + l.line_total_minor, 0);
    const totalMinor = subtotalMinor + zone.feeMinor;
    const order = await ctx.db.order.create({
      data: {
        businessId: ctx.businessId,
        customerId: ctx.customerId,
        items: lines as unknown as Prisma.InputJsonValue,
        subtotalMinor,
        deliveryFeeMinor: zone.feeMinor,
        totalMinor,
        address: args.address,
        notes: args.notes
      }
    });
    return {
      order_id: order.id,
      status: 'draft, awaiting payment',
      items: lines.map((l) => `${l.quantity} x ${l.name}${l.variant ? ` (${l.variant})` : ''} = ${formatMoney(l.line_total_minor, ctx.currency)}`),
      subtotal: formatMoney(subtotalMinor, ctx.currency),
      delivery_fee: formatMoney(zone.feeMinor, ctx.currency),
      total: formatMoney(totalMinor, ctx.currency),
      eta: zone.etaText,
      next: 'Tell the customer the total. Payment link comes in a later step.'
    };
  }
});
