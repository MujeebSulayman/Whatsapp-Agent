import { z } from 'zod';
import { searchProductsByVector } from '@wa/db';
import { formatMoney, isVariantTracked, stockSummary } from '@wa/shared';
import { loadReserved } from './availability.js';
import { defineTool } from './types.js';

export const suggestAlternatives = defineTool({
  name: 'suggest_alternatives',
  description: 'When an item or one of its sizes/colours is sold out: returns other options that ARE in stock (other sizes/colours of the same item, then similar items). Only offer what this returns.',
  schema: z.object({ product_id: z.string(), variant: z.string().optional() }),
  async run(ctx, { product_id, variant }) {
    const p = await ctx.db.product.findFirst({ where: { id: product_id, businessId: ctx.businessId, active: true } });
    if (!p) return { error: 'Unknown product_id. Use search_products first.' };
    const reserved = await loadReserved(ctx.db, ctx.businessId);

    const sameItem = isVariantTracked(p)
      ? (stockSummary(p, reserved).variants ?? []).filter((v) => v.inStock && v.name.toLowerCase() !== (variant ?? '').toLowerCase()).map((v) => ({ option: v.name, left: v.left }))
      : [];

    // Similar items: by meaning when embeddings work, else by shared words in the name. Always this business only, in stock only.
    let ids: string[] = [];
    if (ctx.embed) {
      try {
        ids = (await searchProductsByVector(ctx.db, ctx.businessId, await ctx.embed([p.name, p.description].filter(Boolean).join('. ')), 8)).map((h) => h.id);
      } catch { ids = []; }
    }
    const terms = p.name.toLowerCase().split(/\s+/).filter((t) => t.length > 2).slice(0, 4);
    const byWords = terms.length
      ? await ctx.db.product.findMany({ where: { businessId: ctx.businessId, active: true, id: { not: p.id }, OR: terms.map((t) => ({ name: { contains: t, mode: 'insensitive' as const } })) }, take: 8 })
      : [];
    const pool = await ctx.db.product.findMany({ where: { businessId: ctx.businessId, active: true, id: { not: p.id } }, take: 60, orderBy: { name: 'asc' } });
    const byId = new Map(pool.map((x) => [x.id, x]));
    const ordered = [...new Set([...ids, ...byWords.map((x) => x.id), ...pool.map((x) => x.id)])]
      .filter((id) => id !== p.id)
      .map((id) => byId.get(id) ?? byWords.find((x) => x.id === id))
      .filter((x): x is NonNullable<typeof x> => !!x);

    const similar = [];
    for (const x of ordered) {
      const s = stockSummary(x, reserved);
      if (!s.inStock) continue;
      similar.push({
        product_id: x.id,
        name: x.name,
        price: formatMoney(x.priceMinor, ctx.currency),
        ...(s.variants ? { options_in_stock: s.variants.filter((v) => v.inStock).map((v) => v.name) } : {})
      });
      if (similar.length === 4) break;
    }
    return {
      sold_out_item: p.name,
      same_item_other_options: sameItem,
      similar_items: similar,
      note: sameItem.length || similar.length ? 'Offer at most two of these, naturally. Do not claim they are identical.' : 'Nothing similar is in stock. Offer join_waitlist' + (p.allowPreorder ? ' or a pre-order.' : '.')
    };
  }
});
