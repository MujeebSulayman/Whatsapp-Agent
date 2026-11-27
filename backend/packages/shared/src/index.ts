import { z } from 'zod';

export * from './crypto.js';

export * from './money.js';
export * from './geo.js';

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
