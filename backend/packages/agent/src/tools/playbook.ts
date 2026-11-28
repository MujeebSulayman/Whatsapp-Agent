import { z } from 'zod';
import type { Prisma } from '@wa/db';
import { parseSteps, type PlaybookStep } from '@wa/shared';
import { defineTool } from './types.js';
import type { ToolContext } from './types.js';

const answersOf = (json: unknown): Record<string, string> =>
  json && typeof json === 'object' && !Array.isArray(json) ? Object.fromEntries(Object.entries(json as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};

const view = (steps: PlaybookStep[], answers: Record<string, string>) => {
  const next = steps.find((s) => !answers[s.id]);
  return {
    steps: steps.map((s) => ({ id: s.id, ask: s.ask, required: s.required, answer: answers[s.id] ?? null })),
    next_step: next ? { id: next.id, ask: next.ask, required: next.required } : null
  };
};

const find = (ctx: ToolContext, playbookId: string) => ctx.db.playbook.findFirst({ where: { id: playbookId, businessId: ctx.businessId, active: true } });
const activeRun = (ctx: ToolContext, playbookId: string) => ctx.db.playbookRun.findFirst({ where: { businessId: ctx.businessId, customerId: ctx.customerId, playbookId, status: 'active' }, orderBy: { createdAt: 'desc' } });

export const startPlaybook = defineTool({
  name: 'start_playbook',
  description: "Begin (or resume) one of the owner's playbooks for this customer when their need matches its 'when to use'. Returns the steps and which to ask next.",
  schema: z.object({ playbook_id: z.string() }),
  async run(ctx, { playbook_id }) {
    const pb = await find(ctx, playbook_id);
    if (!pb) return { error: 'Unknown playbook_id. Use only the ids listed in the PLAYBOOKS section.' };
    // Two messages at the same instant can both try to start it: the database allows one, and the loser simply picks that one up.
    let run = await activeRun(ctx, pb.id);
    if (!run) {
      try { run = await ctx.db.playbookRun.create({ data: { businessId: ctx.businessId, playbookId: pb.id, customerId: ctx.customerId, conversationId: ctx.conversationId } }); }
      catch (e) { if ((e as { code?: string }).code !== 'P2002') throw e; run = await activeRun(ctx, pb.id); if (!run) throw e; }
    }
    return { playbook: pb.name, ...view(parseSteps(pb.steps), answersOf(run.answers)), note: 'Ask ONE step at a time in your own words. Save each answer with record_answer.' };
  }
});

export const recordAnswer = defineTool({
  name: 'record_answer',
  description: "Save what the customer said for one playbook step. Only record what they actually said; never fill in an answer for them.",
  schema: z.object({ playbook_id: z.string(), step_id: z.string(), answer: z.string().trim().min(1).max(500) }),
  async run(ctx, { playbook_id, step_id, answer }) {
    const pb = await find(ctx, playbook_id);
    if (!pb) return { error: 'Unknown playbook_id.' };
    const steps = parseSteps(pb.steps);
    if (!steps.some((s) => s.id === step_id)) return { error: `Unknown step_id. Steps: ${steps.map((s) => s.id).join(', ')}.` };
    const run = await activeRun(ctx, pb.id);
    if (!run) return { error: 'Call start_playbook first.' };
    const answers = { ...answersOf(run.answers), [step_id]: answer };
    // Scoped update: only this business's run.
    await ctx.db.playbookRun.updateMany({ where: { id: run.id, businessId: ctx.businessId }, data: { answers: answers as Prisma.InputJsonValue } });
    const v = view(steps, answers);
    const missing = steps.filter((s) => s.required && !answers[s.id]);
    return { saved: true, next_step: v.next_step, all_required_answered: missing.length === 0, note: missing.length === 0 ? 'All required steps are answered. Call finish_playbook.' : 'Ask the next step.' };
  }
});

export const finishPlaybook = defineTool({
  name: 'finish_playbook',
  description: 'Complete the playbook once every required step is answered. Depending on how the owner set it up, this calls the owner in with a summary or just returns what to tell the customer.',
  schema: z.object({ playbook_id: z.string() }),
  async run(ctx, { playbook_id }) {
    const pb = await find(ctx, playbook_id);
    if (!pb) return { error: 'Unknown playbook_id.' };
    const run = await activeRun(ctx, pb.id);
    if (!run) return { error: 'Call start_playbook first.' };
    const steps = parseSteps(pb.steps);
    const answers = answersOf(run.answers);
    const missing = steps.filter((s) => s.required && !answers[s.id]);
    if (missing.length) return { error: 'Not finished: still need an answer for', missing: missing.map((s) => ({ id: s.id, ask: s.ask })) };

    await ctx.db.playbookRun.updateMany({ where: { id: run.id, businessId: ctx.businessId }, data: { status: 'completed', completedAt: new Date() } });
    const summary = steps.filter((s) => answers[s.id]).map((s) => `${s.ask} ${answers[s.id]}`).join(' | ').slice(0, 600);
    await ctx.db.auditLog.create({ data: { businessId: ctx.businessId, actor: 'ai', action: 'playbook.completed', payload: { playbookId: pb.id, runId: run.id } as Prisma.InputJsonValue } });
    if (pb.finish === 'handoff') {
      await ctx.db.conversation.updateMany({ where: { id: ctx.conversationId, businessId: ctx.businessId }, data: { status: 'human' } });
      ctx.state.handedOff = true;
      ctx.state.handoff = { reason: `${pb.name}: completed`, summary };
    }
    return {
      completed: true,
      handed_off: pb.finish === 'handoff',
      tell_customer: pb.finishMessage?.trim() || (pb.finish === 'handoff' ? 'Thank you, the team has everything and will reply shortly. Do not promise a time.' : 'Thank you, that is everything we need.'),
      note: 'Say only what is in tell_customer. Do not add promises, prices or dates that no tool returned.'
    };
  }
});
