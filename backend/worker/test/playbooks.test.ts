import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { buildContext, finishPlaybook, recordAnswer, startPlaybook } from '@wa/agent';
import type { ToolContext } from '@wa/agent';

const prisma = createPrisma();
const slugs = ['pb-a', 'pb-b'];
let a: { id: string; cust: string; conv: string; enquiry: string; quick: string; off: string };
let b: { id: string; cust: string; pb: string };
const ctx = (): ToolContext => ({ db: prisma, businessId: a.id, currency: 'NGN', kind: 'services', conversationId: a.conv, customerId: a.cust, state: { handedOff: false } });
const steps = [{ id: 's1', ask: 'What do you want to learn?', required: true }, { id: 's2', ask: 'Your current level?', required: true }, { id: 's3', ask: 'Anything else we should know?', required: false }];

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: { in: slugs } } });
  const mk = (slug: string) => prisma.business.create({ data: { name: slug, slug, category: 'Education', kind: 'services', city: 'Lagos', country: 'NG', currency: 'NGN', customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] } }, include: { customers: true } });
  const [ba, bb] = [await mk('pb-a'), await mk('pb-b')];
  const conv = await prisma.conversation.create({ data: { businessId: ba.id, customerId: ba.customers[0]!.id } });
  const enquiry = await prisma.playbook.create({ data: { businessId: ba.id, name: 'New student enquiry', whenToUse: 'Someone asks about joining a class', steps, finish: 'handoff', finishMessage: 'Thanks! Our team will send you the class details.' } });
  const quick = await prisma.playbook.create({ data: { businessId: ba.id, name: 'Quick question', whenToUse: 'A simple intake', steps: [{ id: 's1', ask: 'Your name?', required: true }], finish: 'message', finishMessage: 'Noted, thank you.' } });
  const off = await prisma.playbook.create({ data: { businessId: ba.id, name: 'Old flow', whenToUse: 'No longer used', steps, active: false } });
  const other = await prisma.playbook.create({ data: { businessId: bb.id, name: 'Secret', whenToUse: 'Other business only', steps } });
  a = { id: ba.id, cust: ba.customers[0]!.id, conv: conv.id, enquiry: enquiry.id, quick: quick.id, off: off.id };
  b = { id: bb.id, cust: bb.customers[0]!.id, pb: other.id };
});
afterAll(async () => { await prisma.business.deleteMany({ where: { slug: { in: slugs } } }); await prisma.$disconnect(); });

describe('playbooks', () => {
  it('start returns the steps in order and the first to ask; starting again resumes the same run', async () => {
    const r = (await startPlaybook.run(ctx(), { playbook_id: a.enquiry })) as { next_step: { id: string }; steps: unknown[] };
    expect(r.next_step.id).toBe('s1');
    expect(r.steps).toHaveLength(3);
    await startPlaybook.run(ctx(), { playbook_id: a.enquiry });
    expect(await prisma.playbookRun.count({ where: { businessId: a.id, playbookId: a.enquiry } })).toBe(1);
  });

  it('cannot use another business’s or an inactive playbook', async () => {
    expect(await startPlaybook.run(ctx(), { playbook_id: b.pb })).toMatchObject({ error: expect.any(String) });
    expect(await startPlaybook.run(ctx(), { playbook_id: a.off })).toMatchObject({ error: expect.any(String) });
  });

  it('records answers, rejects unknown steps, and points to the next step', async () => {
    expect(await recordAnswer.run(ctx(), { playbook_id: a.enquiry, step_id: 'nope', answer: 'x' })).toMatchObject({ error: expect.stringMatching(/Unknown step_id/) });
    expect(await recordAnswer.run(ctx(), { playbook_id: a.enquiry, step_id: 's1', answer: 'Data analysis' })).toMatchObject({ saved: true, next_step: { id: 's2' }, all_required_answered: false });
  });

  it('refuses to finish while a required step is unanswered', async () => {
    const r = (await finishPlaybook.run(ctx(), { playbook_id: a.enquiry })) as { error: string; missing: { id: string }[] };
    expect(r.missing.map((m) => m.id)).toEqual(['s2']);
    expect(await prisma.playbookRun.count({ where: { businessId: a.id, status: 'completed' } })).toBe(0);
  });

  it('the assistant is told where this customer got to, so a later message picks up there', async () => {
    const c = await buildContext(prisma, { businessId: a.id, conversationId: a.conv, customerId: a.cust });
    expect(c.system).toMatch(/PLAYBOOKS/);
    expect(c.system).toMatch(/New student enquiry/);
    expect(c.system).not.toMatch(/Old flow|Secret/);
    expect(c.system).toMatch(/IN PROGRESS.*s1="Data analysis".*Next: \[s2\] Your current level\?/);
  });

  it('finishing calls the owner in with a summary of what the customer said', async () => {
    await recordAnswer.run(ctx(), { playbook_id: a.enquiry, step_id: 's2', answer: 'Beginner' });
    const c = ctx();
    const r = (await finishPlaybook.run(c, { playbook_id: a.enquiry })) as { completed: boolean; handed_off: boolean; tell_customer: string };
    expect(r).toMatchObject({ completed: true, handed_off: true, tell_customer: 'Thanks! Our team will send you the class details.' });
    expect(c.state.handedOff).toBe(true);
    expect(c.state.handoff!.summary).toMatch(/Data analysis.*Beginner/);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: a.conv } })).status).toBe('human');
    const run = await prisma.playbookRun.findFirstOrThrow({ where: { businessId: a.id, playbookId: a.enquiry } });
    expect(run).toMatchObject({ status: 'completed', answers: { s1: 'Data analysis', s2: 'Beginner' } });
  });

  it('a message-only playbook records the answers without calling the owner in', async () => {
    await prisma.conversation.update({ where: { id: a.conv }, data: { status: 'ai' } });
    await startPlaybook.run(ctx(), { playbook_id: a.quick });
    await recordAnswer.run(ctx(), { playbook_id: a.quick, step_id: 's1', answer: 'Ada' });
    const c = ctx();
    expect(await finishPlaybook.run(c, { playbook_id: a.quick })).toMatchObject({ completed: true, handed_off: false, tell_customer: 'Noted, thank you.' });
    expect(c.state.handedOff).toBe(false);
  });

  it('after finishing, the same customer can start it again as a fresh run', async () => {
    const r = (await startPlaybook.run(ctx(), { playbook_id: a.enquiry })) as { steps: { answer: string | null }[] };
    expect(r.steps.every((s) => s.answer === null)).toBe(true);
  });
});
