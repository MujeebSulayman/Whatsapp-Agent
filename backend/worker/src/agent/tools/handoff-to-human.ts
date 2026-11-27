import { z } from 'zod';
import type { Prisma } from '@wa/db';
import { defineTool } from './types.js';

export const handoffToHuman = defineTool({
  name: 'handoff_to_human',
  description: 'Pause the AI and alert the owner. Use for complaints, refunds, threats, legal issues, unknown delivery areas, or when unsure after one clarifying question.',
  schema: z.object({ reason: z.string().min(1).max(200), summary: z.string().min(1).max(600) }),
  async run(ctx, args) {
    // Scoped update: only this business's conversation.
    await ctx.db.conversation.updateMany({ where: { id: ctx.conversationId, businessId: ctx.businessId }, data: { status: 'human' } });
    await ctx.db.auditLog.create({
      data: { businessId: ctx.businessId, actor: 'ai', action: 'handoff', payload: { conversationId: ctx.conversationId, ...args } as Prisma.InputJsonValue }
    });
    ctx.state.handedOff = true;
    ctx.state.handoff = args;
    // Owner notification (email/WhatsApp) is wired up with the dashboard phase; for now it is logged + audited.
    console.log(`[handoff] business=${ctx.businessId} reason=${args.reason}`);
    return { handed_off: true, note: 'Tell the customer a team member will reply shortly. Do not promise a time.' };
  }
});
