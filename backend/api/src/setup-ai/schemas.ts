import { z } from 'zod';

/** Strings from the model are trimmed, de-controlled and bounded before anything else sees them. */
export const clean = (s: string, max: number): string => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const str = (max: number) => z.string().transform((s) => clean(s, max));
const maybe = (max: number) => z.string().nullish().transform((s) => (s ? clean(s, max) || null : null));
const amount = z.union([z.string(), z.number()]).nullish();

/** What the model may return when reading a price list. Deliberately forgiving: bad rows are flagged, not fatal. */
export const ImportOut = z.object({
  products: z.array(z.object({ name: str(120), description: maybe(500), price: amount, variants: z.array(str(60)).max(30).nullish(), stock: amount })).max(300).default([]),
  zones: z.array(z.object({ area: str(80), fee: amount, eta: maybe(60) })).max(100).default([]),
  faqs: z.array(z.object({ question: str(200), answer: str(1000) })).max(60).default([]),
  detected: z.object({ businessName: maybe(120), phone: maybe(40) }).nullish()
});

export const InterviewOut = z.object({
  faqs: z.array(z.object({ question: str(200), answer: str(1000) })).max(30).default([]),
  paymentInfo: maybe(300),
  returnPolicy: maybe(500),
  businessHours: z.record(z.string(), z.string()).nullish().transform((r) => {
    if (!r) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r).slice(0, 10)) if (clean(k, 40) && clean(String(v), 60)) out[clean(k, 40)] = clean(String(v), 60);
    return Object.keys(out).length ? out : null;
  }),
  customInstructions: maybe(1500),
  escalateKeywords: z.array(str(40)).max(30).default([]),
  forbiddenTopics: z.array(str(40)).max(30).default([])
});

export const SuggestionOut = z.object({ suggestion: str(1500) });
export const RuleOut = z.object({ rule: str(200) });

/* ---------------- request bodies ---------------- */
// Photos arrive as data URLs already shrunk by the dashboard. 4 x 600k characters stays inside the 3 MB body limit.
const IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const ImportBody = z
  .object({
    text: z.string().max(20_000).optional(),
    images: z.array(z.string().max(600_000).regex(IMAGE, 'Upload PNG, JPEG or WebP photos')).max(4).default([])
  })
  .refine((b) => (b.text?.trim().length ?? 0) > 0 || b.images.length > 0, { message: 'Paste your list or add a photo' });

export const InterviewBody = z.object({
  answers: z.array(z.object({ question: z.string().min(1).max(300), answer: z.string().max(800) })).min(1).max(14)
});
export const ImproveBody = z.object({ field: z.enum(['instructions', 'faq_answer', 'product_description']), text: z.string().max(2000), context: z.string().max(300).optional() });
export const CorrectionBody = z.object({ customerMessage: z.string().min(1).max(600), assistantReply: z.string().min(1).max(1500), correction: z.string().min(3).max(600) });
export const PreviewBody = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).min(1).max(30)
});
export const AppendRuleBody = z.object({ rule: z.string().trim().min(5).max(200) });

export const ApplyBody = z.object({
  products: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500).nullish(),
    priceMinor: z.number().int().min(0).max(2_000_000_000),
    /** Leave out when the owner does not count this item: it is then always available. */
    stockQty: z.number().int().min(0).max(1_000_000).nullish(),
    variants: z.array(z.string().trim().min(1).max(60)).max(30).optional()
  })).max(300).default([]),
  zones: z.array(z.object({ areaName: z.string().trim().min(2).max(80), feeMinor: z.number().int().min(0).max(100_000_000), etaText: z.string().trim().min(1).max(60).default('ask us') })).max(100).default([]),
  faqs: z.array(z.object({ question: z.string().trim().min(3).max(200), answer: z.string().trim().min(1).max(1000) })).max(100).default([]),
  profile: z.object({
    paymentInfo: z.string().max(300).nullable(),
    returnPolicy: z.string().max(500).nullable(),
    businessHours: z.record(z.string().max(40), z.string().max(60)).nullable()
  }).partial().optional(),
  rules: z.object({
    customInstructions: z.string().max(1500).nullable(),
    escalateKeywords: z.array(z.string().trim().min(1).max(40)).max(30),
    forbiddenTopics: z.array(z.string().trim().min(1).max(40)).max(30)
  }).partial().optional()
});

/** What the model returns for a playbook draft. Bounded and cleaned like everything else the model writes. */
export const PlaybookOut = z.object({
  name: str(80),
  whenToUse: str(300),
  steps: z.array(z.object({ ask: str(200), required: z.boolean().default(true) })).min(1).max(12).transform((a) => a.filter((s) => s.ask.length >= 2)),
  finish: z.enum(['handoff', 'message']).catch('handoff'),
  finishMessage: maybe(500)
});
export const PlaybookDraftBody = z.object({ description: z.string().trim().min(10).max(1200) });
