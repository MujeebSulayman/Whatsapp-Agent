import { z } from 'zod';
import { formatMoney, variantList } from '@wa/shared';
import { loadReserved, stockInfo } from './availability.js';
import { defineTool } from './types.js';

export const listCatalog = defineTool({
  name: 'list_catalog',
  description:
    'Browse the whole catalogue A to Z (this is not a search). Use it when the customer asks what you sell, for the menu or price list, "list them all" or "what else". Returns real prices and whether each item is available. If has_more is true, say how many there are in total and offer to show the rest.',
  schema: z.object({
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(30).default(20),
    /** Optional word to narrow the list, e.g. "drinks" or "oil". */
    match: z.string().trim().max(60).optional()
  }),
  async run(ctx, { offset, limit, match }) {
    const where = {
      businessId: ctx.businessId,
      active: true,
      ...(match ? { OR: [{ name: { contains: match, mode: 'insensitive' as const } }, { description: { contains: match, mode: 'insensitive' as const } }] } : {})
    };
    const [total, rows, reserved] = await Promise.all([
      ctx.db.product.count({ where }),
      ctx.db.product.findMany({ where, orderBy: { name: 'asc' }, skip: offset, take: limit }),
      loadReserved(ctx.db, ctx.businessId)
    ]);
    const items = rows.map((p) => {
      const info = stockInfo(p, reserved);
      const options = variantList(p.variants).map((v) => v.name);
      return { product_id: p.id, name: p.name, price: formatMoney(p.priceMinor, ctx.currency), available: info.in_stock, ...(info.in_stock ? {} : { sold_out: true }), ...(options.length ? { options } : {}) };
    });
    const next = offset + items.length;
    return {
      total,
      showing: `${items.length ? offset + 1 : 0}-${next}`,
      items,
      has_more: next < total,
      ...(next < total ? { next_offset: next, remaining: total - next } : {}),
      note: total === 0 ? 'The catalogue is empty or nothing matched. Do not invent items.' : next < total ? `Say there are ${total} items in total and ${total - next} more to show. Do not call this the full list.` : 'This is everything.'
    };
  }
});
