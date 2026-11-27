import { z } from 'zod';
import { findVariant, formatMoney } from '@wa/shared';
import { defineTool } from './types.js';

const MAX_PHOTOS = 3;

/** Uploaded photos are stored as /media/<id>; WhatsApp needs a full public link to fetch them. */
export function publicPhotoUrl(url: string, base = process.env.API_PUBLIC_URL): string | null {
  if (/^https?:\/\//.test(url)) return url;
  return base && url.startsWith('/') ? `${base.replace(/\/$/, '')}${url}` : null;
}

export const sendProductImage = defineTool({
  name: 'send_product_image',
  description: "Send photos of a product into the chat (up to 3). Pass the size/colour/option when the customer named one, so you send that option's photo first. Only works for products that have photos.",
  schema: z.object({ product_id: z.string(), variant: z.string().optional() }),
  async run(ctx, { product_id, variant }) {
    const p = await ctx.db.product.findFirst({ where: { id: product_id, businessId: ctx.businessId, active: true } });
    if (!p) return { error: 'Unknown product_id.' };
    const option = findVariant(p, variant);
    const photos = [...new Set([...(option?.image ? [option.image] : []), ...p.imageUrls])].map((u) => publicPhotoUrl(u)).filter((u): u is string => !!u).slice(0, MAX_PHOTOS);
    if (!photos.length) return { sent: false, note: 'This product has no photo that can be sent. Describe it in words instead and do not promise a photo.' };
    if (!ctx.sendImage) return { sent: false, note: 'Photos cannot be sent right now.' };
    for (const [i, url] of photos.entries()) {
      await ctx.sendImage({ url, ...(i === 0 ? { caption: `${p.name}${option ? ` (${option.name})` : ''} - ${formatMoney(p.priceMinor, ctx.currency)}` } : {}) });
    }
    return { sent: true, photos: photos.length, note: option?.image ? undefined : variant && option ? `There is no photo of ${option.name} specifically; these show the item in general. Say so.` : undefined };
  }
});
