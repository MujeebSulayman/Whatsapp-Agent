import { z } from 'zod';
import { searchProductsByVector } from '@wa/db';
import { formatNaira } from '@wa/shared';
import { defineTool } from './types.js';

export const searchProducts = defineTool({
  name: 'search_products',
  description: 'Search the business catalog by name, keyword or meaning. Returns price, variants and stock. Use this before stating any price or availability.',
  schema: z.object({ query: z.string().min(1).max(100) }),
  async run(ctx, { query }) {
    // 1. Meaning-based match (pgvector) when embeddings are available. Any failure just falls back to keywords.
    let vectorIds: string[] = [];
    if (ctx.embed) {
      try {
        const vector = await ctx.embed(query);
        vectorIds = (await searchProductsByVector(ctx.db, ctx.businessId, vector, 5)).map((h) => h.id);
      } catch {
        vectorIds = [];
      }
    }
    // 2. Keyword match, always scoped to this business.
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1).slice(0, 6);
    const keyword = await ctx.db.product.findMany({
      where: {
        businessId: ctx.businessId,
        active: true,
        ...(terms.length
          ? { OR: terms.flatMap((t) => [{ name: { contains: t, mode: 'insensitive' as const } }, { description: { contains: t, mode: 'insensitive' as const } }]) }
          : {})
      },
      take: 5,
      orderBy: { name: 'asc' }
    });
    const vectorRows = vectorIds.length ? await ctx.db.product.findMany({ where: { id: { in: vectorIds }, businessId: ctx.businessId, active: true } }) : [];
    const byId = new Map([...vectorRows, ...keyword].map((p) => [p.id, p]));
    const order = [...new Set([...vectorIds, ...keyword.map((p) => p.id)])].slice(0, 5);
    const products = order.map((id) => byId.get(id)!).filter(Boolean);
    return {
      results: products.map((p) => ({
        product_id: p.id,
        name: p.name,
        description: p.description,
        price: formatNaira(p.priceKobo),
        variants: p.variants,
        in_stock: p.stockQty > 0,
        stock_qty: p.stockQty
      })),
      note: products.length ? undefined : 'No matching products. Do not invent one.'
    };
  }
});
