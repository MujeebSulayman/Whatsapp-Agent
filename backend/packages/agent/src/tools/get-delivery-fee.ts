import { z } from 'zod';
import { formatMoney } from '@wa/shared';
import { defineTool } from './types.js';

export const getDeliveryFee = defineTool({
  name: 'get_delivery_fee',
  description: 'Get the delivery fee and ETA for an area (e.g. "Lekki Phase 1"). If the area is unknown, hand off to the owner.',
  schema: z.object({ area: z.string().min(1).max(100) }),
  async run(ctx, { area }) {
    const zones = await ctx.db.deliveryZone.findMany({ where: { businessId: ctx.businessId } });
    const q = area.toLowerCase();
    const zone = zones.find((z) => z.areaName.toLowerCase() === q) ?? zones.find((z) => q.includes(z.areaName.toLowerCase()) || z.areaName.toLowerCase().includes(q));
    if (!zone) {
      return { found: false, served_areas: zones.map((z) => z.areaName), note: 'Area not served or unknown. Tell the customer the served areas, or hand off to the owner.' };
    }
    return { found: true, area: zone.areaName, fee: formatMoney(zone.feeMinor, ctx.currency), eta: zone.etaText };
  }
});
