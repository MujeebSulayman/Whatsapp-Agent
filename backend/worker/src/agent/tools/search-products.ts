import { z } from 'zod';
import { formatNaira } from '@wa/shared';
import { defineTool } from './types.js';

export const searchProducts = defineTool({
  name: 'search_products',
  description: 'Search the business catalog by name or keyword. Returns price, variants and stock. Use this before stating any price or availability.',
  schema: z.object({ query: z.string().min(1).max(100) }),
  async run(ctx, { query }) {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1).slice(0, 6);
    const products = await ctx.db.product.findMany({
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
