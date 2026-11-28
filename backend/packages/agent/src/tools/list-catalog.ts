import { z } from 'zod';
import { formatMoney, variantList } from '@wa/shared';
import { loadReserved, stockInfo } from './availability.js';
import { defineTool } from './types.js';

export const listCatalog = defineTool({
  name: 'list_catalog',
  description:
    'Browse the whole catalogue (this is not a search). Sorted A to Z by default; use sort price_low for the cheapest and price_high for the most expensive. Use it when the customer asks what you sell, for the menu or price list, "list them all" or "what else". Returns real prices and whether each item is available. If has_more is true, say how many there are in total and offer to show the rest. Use offset 0 to start from the top (also when they ask to see the list again); use a higher offset only to continue a list you have just shown.',
  schema: z.object({
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(30).default(20),
    /** name = A to Z (default). price_low = cheapest first, price_high = most expensive first. */
    sort: z.enum(['name', 'price_low', 'price_high']).default('name'),
    /** Optional word to narrow the list, e.g. "drinks", "oil" or a category such as "massage". */
    match: z.string().trim().max(60).optional()
  }),
  async run(ctx, { offset: askedOffset, limit, match, sort }) {
    const orderBy = sort === 'price_low' ? [{ priceMinor: 'asc' as const }, { name: 'asc' as const }] : sort === 'price_high' ? [{ priceMinor: 'desc' as const }, { name: 'asc' as const }] : [{ name: 'asc' as const }];
    const where = {
      businessId: ctx.businessId,
      active: true,
      ...(match ? { OR: [{ name: { contains: match, mode: 'insensitive' as const } }, { description: { contains: match, mode: 'insensitive' as const } }, { category: { contains: match, mode: 'insensitive' as const } }] } : {})
    };
    const [total, rows, reserved] = await Promise.all([
      ctx.db.product.count({ where }),
      ctx.db.product.findMany({ where, orderBy, skip: askedOffset, take: limit }),
      loadReserved(ctx.db, ctx.businessId)
    ]);
    // A page past the end (for example asking again after the whole list was shown) is not an error: start again from the top.
    const wrapped = askedOffset >= total && total > 0;
    const offset = wrapped ? 0 : askedOffset;
    const page = wrapped ? await ctx.db.product.findMany({ where, orderBy, take: limit }) : rows;
    const items = page.map((p) => {
      const info = stockInfo(p, reserved);
      const options = variantList(p.variants).map((v) => v.name);
      return { product_id: p.id, name: p.name, ...(p.category ? { category: p.category } : {}), price: formatMoney(p.priceMinor, ctx.currency), available: info.in_stock, ...(info.in_stock ? {} : { sold_out: true }), ...(options.length ? { options } : {}) };
    });
    const next = offset + items.length;
    return {
      total,
      showing: `${items.length ? offset + 1 : 0}-${next}`,
      items,
      has_more: next < total,
      ...(next < total ? { next_offset: next, remaining: total - next } : {}),
      note: wrapped ? `That was past the end, so this is the list from the start. Show EVERY item in items as a numbered list with its price${next < total ? `, say there are ${total} in total and ${total - next} more` : ''}.` : total === 0 ? 'The catalogue is empty or nothing matched. Do not invent items.' : next < total ? `Show EVERY item in items as a numbered list with its price. Say there are ${total} items in total and ${total - next} more to show. Do not call this the full list.` : 'Show EVERY item in items as a numbered list with its price, then say that is everything.'
    };
  }
});
