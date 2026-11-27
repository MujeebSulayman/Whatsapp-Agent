import { z } from 'zod';
import { availableQty, findVariant, isVariantTracked, variantList } from '@wa/shared';
import { loadReserved } from './availability.js';
import { defineTool } from './types.js';

export const joinWaitlist = defineTool({
  name: 'join_waitlist',
  description: 'Put this customer on the list to be told when a sold-out item (or size/colour) is back. Only after the customer says yes. Not for items that are in stock.',
  schema: z.object({ product_id: z.string(), variant: z.string().optional() }),
  async run(ctx, { product_id, variant }) {
    const p = await ctx.db.product.findFirst({ where: { id: product_id, businessId: ctx.businessId, active: true } });
    if (!p) return { error: 'Unknown product_id. Use search_products first.' };
    if (!p.trackStock) return { error: 'This item is not stock-limited, so there is no waitlist. Offer to take the order.' };
    const names = variantList(p.variants).map((v) => v.name);
    let chosen: string | null = null;
    if (isVariantTracked(p)) {
      const v = findVariant(p, variant);
      if (!v) return { error: `Ask which option they want. Options: ${names.join(', ')}.` };
      chosen = v.name;
    } else if (variant && names.length) {
      chosen = findVariant(p, variant)?.name ?? null;
      if (!chosen) return { error: `No option called "${variant}". Options: ${names.join(', ')}.` };
    }
    if ((availableQty(p, chosen, await loadReserved(ctx.db, ctx.businessId)) ?? 1) > 0) return { error: 'It is in stock right now. Offer to take the order instead.' };

    const existing = await ctx.db.waitlistEntry.findFirst({ where: { businessId: ctx.businessId, customerId: ctx.customerId, productId: p.id, variant: chosen, status: 'waiting' } });
    if (!existing) await ctx.db.waitlistEntry.create({ data: { businessId: ctx.businessId, customerId: ctx.customerId, productId: p.id, variant: chosen } });
    return {
      on_waitlist: true,
      already_listed: !!existing,
      item: `${p.name}${chosen ? ` (${chosen})` : ''}`,
      next: 'Tell the customer the shop will message them when it is back. Do not promise a date or that it will return.' + (p.restockNote ? ` You may repeat the owner note: "${p.restockNote}".` : '')
    };
  }
});
