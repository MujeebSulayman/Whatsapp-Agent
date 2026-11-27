import { z } from 'zod';
import { availableQty, findVariant, isVariantTracked, stockSummary, variantList } from '@wa/shared';
import { loadReserved, stockInfo } from './availability.js';
import { defineTool } from './types.js';

export const checkStock = defineTool({
  name: 'check_stock',
  description: 'Live stock for one product, and for one size/colour when the customer names one. Use before promising availability or large quantities.',
  schema: z.object({ product_id: z.string(), variant: z.string().optional() }),
  async run(ctx, { product_id, variant }) {
    const p = await ctx.db.product.findFirst({ where: { id: product_id, businessId: ctx.businessId, active: true } });
    if (!p) return { error: 'Unknown product_id. Use search_products first.' };
    if (!p.trackStock) return { name: p.name, in_stock: true, note: 'Not stock-limited (service or made to order).' };
    const reserved = await loadReserved(ctx.db, ctx.businessId);
    const info = stockInfo(p, reserved);
    if (!variant) return { name: p.name, ...info };
    const names = variantList(p.variants).map((v) => v.name);
    if (names.length && !findVariant(p, variant)) return { name: p.name, error: `No option called "${variant}". Options: ${names.join(', ')}.` };
    if (!isVariantTracked(p)) return { name: p.name, variant, ...info };
    const left = availableQty(p, variant, reserved) ?? 0;
    const others = (stockSummary(p, reserved).variants ?? []).filter((v) => v.inStock && v.name.toLowerCase() !== variant.toLowerCase());
    return {
      name: p.name, variant, in_stock: left > 0, stock_qty: left,
      ...(left === 0 ? { sold_out: true, restock_note: p.restockNote ?? null, preorder_available: p.allowPreorder, other_options_in_stock: others.map((v) => v.name), next: 'This option is sold out. Mention the other options that are in stock, call suggest_alternatives if needed, and offer join_waitlist' + (p.allowPreorder ? ' or a pre-order.' : '.') } : {})
    };
  }
});
