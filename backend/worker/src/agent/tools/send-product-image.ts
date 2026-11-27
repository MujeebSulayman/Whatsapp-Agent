import { z } from 'zod';
import { defineTool } from './types.js';

export const sendProductImage = defineTool({
  name: 'send_product_image',
  description: "Send a product's photo into the chat. Only works for products that have a photo.",
  schema: z.object({ product_id: z.string() }),
  async run(ctx, { product_id }) {
    const p = await ctx.db.product.findFirst({ where: { id: product_id, businessId: ctx.businessId, active: true } });
    if (!p) return { error: 'Unknown product_id.' };
    const url = p.imageUrls[0];
    if (!url) return { sent: false, note: 'This product has no photo. Describe it in words instead.' };
    if (!ctx.sendImage) return { sent: false, note: 'Photos cannot be sent right now.' };
    await ctx.sendImage({ url, caption: p.name });
    return { sent: true };
  }
});
