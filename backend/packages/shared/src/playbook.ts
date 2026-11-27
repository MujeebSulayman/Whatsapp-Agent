import { z } from 'zod';

/**
 * A playbook is the owner's own step-by-step way of handling one kind of customer: an enquiry, an intake, a quote,
 * a viewing, an enrolment... Nothing here is specific to one kind of business.
 */
export const PlaybookStep = z.object({
  id: z.string().min(1).max(20),
  /** What to find out, in the owner's words. The assistant asks it naturally, in the customer's language. */
  ask: z.string().trim().min(2).max(200),
  required: z.boolean().default(true)
});
export type PlaybookStep = z.infer<typeof PlaybookStep>;

export const PlaybookInput = z.object({
  name: z.string().trim().min(2).max(80),
  /** When the assistant should use it, in the owner's words. */
  whenToUse: z.string().trim().min(5).max(300),
  steps: z.array(PlaybookStep.omit({ id: true }).extend({ id: z.string().max(20).optional() })).min(1).max(12),
  /** handoff = call the owner in with a summary of the answers; message = just send finishMessage. */
  finish: z.enum(['handoff', 'message']).default('handoff'),
  finishMessage: z.string().trim().max(500).nullish(),
  active: z.boolean().optional()
});
export type PlaybookInput = z.infer<typeof PlaybookInput>;

/** Steps as stored. Anything malformed is dropped, so a bad row can never break a customer's chat. */
export function parseSteps(json: unknown): PlaybookStep[] {
  const r = z.array(PlaybookStep).safeParse(json);
  return r.success ? r.data : [];
}

/**
 * Give every step a stable id. A brand-new playbook gets s1, s2...; steps added later get a fresh random id,
 * so an id is never reused and old answers can never attach to a different question.
 */
export function withStepIds(steps: { id?: string | undefined; ask: string; required?: boolean | undefined }[]): PlaybookStep[] {
  const fresh = steps.every((s) => !s.id);
  const used = new Set(steps.map((s) => s.id).filter((x): x is string => !!x));
  let n = 0;
  return steps.map((s) => {
    let id = s.id;
    if (!id) {
      do { id = fresh ? `s${++n}` : `s${Math.random().toString(36).slice(2, 7)}`; } while (used.has(id));
      used.add(id);
    }
    return { id, ask: s.ask.trim(), required: s.required ?? true };
  });
}
