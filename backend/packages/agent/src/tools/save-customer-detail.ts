import { z } from 'zod';
import { defineTool } from './types.js';

export const saveCustomerDetail = defineTool({
  name: 'save_customer_detail',
  description: "Remember a detail about this customer for next time: their name, or a note such as a saved delivery address or a preference.",
  schema: z.object({ field: z.enum(['name', 'note']), value: z.string().min(1).max(200) }),
  async run(ctx, { field, value }) {
    if (field === 'name') {
      await ctx.db.customer.updateMany({ where: { id: ctx.customerId, businessId: ctx.businessId }, data: { name: value } });
    } else {
      const c = await ctx.db.customer.findFirst({ where: { id: ctx.customerId, businessId: ctx.businessId } });
      const notes = [c?.notes, value].filter(Boolean).join('\n').slice(-1000);
      await ctx.db.customer.updateMany({ where: { id: ctx.customerId, businessId: ctx.businessId }, data: { notes } });
    }
    return { saved: true };
  }
});
