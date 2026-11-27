import { z } from 'zod';
import { defineTool } from './types.js';

export const checkStock = defineTool({
  name: 'check_stock',
  description: 'Live stock for one product. Use before promising availability or large quantities.',
  schema: z.object({ product_id: z.string(), variant: z.string().optional() }),
  async run(ctx, { product_id }) {
    const p = await ctx.db.product.findFirst({ where: { id: product_id, businessId: ctx.businessId, active: true } });
    if (!p) return { error: 'Unknown product_id. Use search_products first.' };
    return { name: p.name, in_stock: p.stockQty > 0, stock_qty: p.stockQty };
  }
});
