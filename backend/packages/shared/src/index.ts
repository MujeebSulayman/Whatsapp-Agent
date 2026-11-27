import { z } from 'zod';

export * from './crypto.js';

/** Money is always integer kobo. Never floats. */
export const Kobo = z.number().int().nonnegative();
export type Kobo = z.infer<typeof Kobo>;

export const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export const QUEUES = { inbound: 'inbound-messages' } as const;

export const InboundJob = z.object({
  businessId: z.string(),
  conversationId: z.string(),
  customerId: z.string(),
  messageId: z.string(),
  phoneNumberId: z.string(),
  waMessageId: z.string(),
  from: z.string(),
  type: z.enum(['text', 'audio', 'image', 'interactive']),
  body: z.string().optional(),
  mediaId: z.string().optional(),
  timestamp: z.number()
});
export type InboundJob = z.infer<typeof InboundJob>;
