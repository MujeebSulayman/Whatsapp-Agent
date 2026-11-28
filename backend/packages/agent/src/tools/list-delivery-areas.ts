import { z } from 'zod';
import { formatMoney } from '@wa/shared';
import { defineTool } from './types.js';

export const listDeliveryAreas = defineTool({
  name: 'list_delivery_areas',
  description: 'List every area this business delivers to (or serves), with the fee and usual time for each. Use it when the customer asks where you deliver or cover, or what delivery costs in general.',
  schema: z.object({}),
  async run(ctx) {
    const zones = await ctx.db.deliveryZone.findMany({ where: { businessId: ctx.businessId }, orderBy: { areaName: 'asc' }, take: 100 });
    return {
      total: zones.length,
      areas: zones.map((z) => ({ area: z.areaName, fee: formatMoney(z.feeMinor, ctx.currency), time: z.etaText })),
      note: zones.length ? 'These are all the areas. Anywhere else is not covered: say so and offer to check with the team.' : 'No areas are set up. Do not invent any; offer to check with the team.'
    };
  }
});
