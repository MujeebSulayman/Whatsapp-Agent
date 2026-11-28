import { z } from 'zod';
import type { Prisma, PrismaClient } from '@wa/db';
import { availableQty, findVariant, formatMoney, isVariantTracked, variantList } from '@wa/shared';
import { loadReserved } from './availability.js';
import { defineTool, type ToolContext } from './types.js';

const createOrderSchema = z.object({
  items: z.array(z.object({ product_id: z.string(), quantity: z.number().int().min(1).max(100), variant: z.string().optional() })).min(1).max(20),
  /** Delivery area or service area. Optional only for service businesses that have not set up areas. */
  delivery_area: z.string().min(1).optional(),
  address: z.string().min(5).max(300),
  /** Services: when the customer wants the work done, in their own words (e.g. "Thursday morning"). */
  preferred_time: z.string().max(120).optional(),
  notes: z.string().max(300).optional()
});

export const createOrder = defineTool({
  name: 'create_order',
  description:
    'Create a draft order (for products) or a booking request (for services) once you have what the customer wants, the full address (delivery address, or where the job is), and the area. For services also pass preferred_time. Totals are calculated by the server; never compute or quote totals yourself.',
  schema: createOrderSchema,
  async run(ctx, args) {
    const ids = [...new Set(args.items.map((i) => i.product_id))];
    const db = ctx.db as PrismaClient;
    // Practice mode already runs inside one rolled-back transaction, which cannot be nested.
    if (typeof db.$transaction !== 'function') return place(ctx, db, args);
    // Checking the stock and creating the order must be ONE step. Locking the products first makes simultaneous buyers queue up, so
    // the last item can only be sold once.
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE business_id = ${ctx.businessId} AND id = ANY(${ids}) ORDER BY id FOR UPDATE`;
      return place(ctx, tx as unknown as PrismaClient, args);
    }, { timeout: 15_000, maxWait: 10_000 });
  }
});

type Args = z.infer<typeof createOrderSchema>;

async function place(ctx: ToolContext, db: PrismaClient, args: Args): Promise<unknown> {

    const ids = [...new Set(args.items.map((i) => i.product_id))];
    // business_id scoping: a product id from another business simply isn't found.
    const products = await db.product.findMany({ where: { id: { in: ids }, businessId: ctx.businessId, active: true } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const reserved = await loadReserved(db, ctx.businessId);
    const lines = [];
    const wanted = new Map<string, number>(); // quantity per product+option across lines
    for (const item of args.items) {
      const p = byId.get(item.product_id);
      if (!p) return { error: `Unknown product_id ${item.product_id}. Use search_products to get valid ids.` };
      const names = variantList(p.variants).map((v) => v.name);
      let option: string | null = item.variant ?? null;
      if (names.length) {
        const v = findVariant(p, item.variant);
        if (item.variant && !v) return { error: `No option called "${item.variant}" for "${p.name}". Options: ${names.join(', ')}.` };
        if (!v && isVariantTracked(p)) return { error: `Ask which option they want for "${p.name}". Options: ${names.join(', ')}.` };
        option = v?.name ?? null;
      }
      const key = `${p.id}::${option ?? ''}`;
      const already = (wanted.get(key) ?? 0) + item.quantity;
      wanted.set(key, already);
      // Services and made-to-order items (trackStock = false) are never limited by stock.
      const left = availableQty(p, option, reserved);
      let preorder = false;
      if (left !== null && left < already) {
        if (p.allowPreorder) preorder = true;
        else if (left === 0) return { error: `"${p.name}"${option ? ` (${option})` : ''} is sold out. Do not just refuse: call suggest_alternatives and offer join_waitlist.${p.restockNote ? ` Owner note: "${p.restockNote}".` : ''}` };
        else return { error: `Only ${left} of "${p.name}"${option ? ` (${option})` : ''} left. Offer that many, or suggest_alternatives for the rest.` };
      }
      lines.push({ product_id: p.id, name: p.name, variant: option, quantity: item.quantity, unit_price_minor: p.priceMinor, line_total_minor: p.priceMinor * item.quantity, ...(preorder ? { preorder: true } : {}) });
    }
    const preorderLines = lines.filter((l) => 'preorder' in l);

    const zones = await db.deliveryZone.findMany({ where: { businessId: ctx.businessId } });
    const isService = ctx.kind === 'services';
    let zone: (typeof zones)[number] | undefined;
    // No areas set up yet (a new shop that has only added products): still take the order. The shop confirms the delivery cost.
    const deliveryTbc = zones.length === 0 && !isService;
    if (zones.length === 0) {
      zone = undefined;
    } else {
      if (!args.delivery_area) return { error: isService ? 'Ask the customer which area the job is in.' : 'Ask the customer for their delivery area.' };
      const q = args.delivery_area.toLowerCase();
      zone = zones.find((z) => z.areaName.toLowerCase() === q) ?? zones.find((z) => q.includes(z.areaName.toLowerCase()));
      if (!zone) return { error: `${isService ? 'Service' : 'Delivery'} area not covered. Say so kindly, list the covered areas with list_delivery_areas, and ask whether another address works. Do not hand off unless they insist on an exception.` };
    }

    const feeMinor = zone?.feeMinor ?? 0;
    const subtotalMinor = lines.reduce((s, l) => s + l.line_total_minor, 0);
    const totalMinor = subtotalMinor + feeMinor;
    const notes = [deliveryTbc && 'DELIVERY FEE NOT SET UP: confirm the delivery cost with the customer before dispatch', preorderLines.length && `PRE-ORDER (not in stock yet): ${preorderLines.map((l) => l.name + (l.variant ? ` (${l.variant})` : '')).join(', ')}`, args.preferred_time && `Preferred time: ${args.preferred_time}`, args.notes].filter(Boolean).join('\n') || undefined;
    const order = await db.order.create({
      data: {
        businessId: ctx.businessId,
        customerId: ctx.customerId,
        items: lines as unknown as Prisma.InputJsonValue,
        subtotalMinor,
        deliveryFeeMinor: feeMinor,
        totalMinor,
        address: args.address,
        notes
      }
    });
    return {
      order_id: order.id,
      ...(preorderLines.length ? { preorder_items: preorderLines.map((l) => l.name + (l.variant ? ` (${l.variant})` : '')) } : {}),
      status: isService ? 'booking request recorded, awaiting confirmation' : 'draft, awaiting payment',
      items: lines.map((l) => `${l.quantity} x ${l.name}${l.variant ? ` (${l.variant})` : ''} = ${formatMoney(l.line_total_minor, ctx.currency)}`),
      subtotal: formatMoney(subtotalMinor, ctx.currency),
      [isService ? 'call_out_fee' : 'delivery_fee']: deliveryTbc ? 'to be confirmed by the shop' : formatMoney(feeMinor, ctx.currency),
      total: formatMoney(totalMinor, ctx.currency),
      ...(deliveryTbc ? { total_note: 'This total is for the items only. Delivery will be added once the shop confirms the fee: tell the customer that.' } : {}),
      ...(args.preferred_time ? { preferred_time: args.preferred_time } : {}),
      ...(zone ? { eta: zone.etaText } : {}),
      next: preorderLines.length
        ? 'This is a PRE-ORDER: tell the customer the item is not in stock yet and the shop will confirm when it is ready. Do not promise a date.'
        : isService
        ? 'Tell the customer their request is recorded and that the team will confirm the time and the final price. Do not promise a fixed final price for custom work.'
        : ctx.payments
          ? 'Tell the customer the items, delivery fee and total exactly as returned. Then call create_payment_link with this order_id and send the link.'
          : 'Tell the customer the items, delivery fee and total exactly as returned. Then give the payment details from BUSINESS INFO and say the shop will confirm once payment is received.'
    };
}
