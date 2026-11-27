import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Verify Meta's X-Hub-Signature-256 header ("sha256=<hex>") against the raw request body. */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const MessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: z.object({ id: z.string() }).optional(),
  image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ title: z.string() }).optional(),
      list_reply: z.object({ title: z.string() }).optional()
    })
    .optional()
});

export const WebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
            messages: z.array(MessageSchema).optional()
          })
        })
      )
    })
  )
});

export type ParsedInbound = {
  phoneNumberId: string;
  waMessageId: string;
  from: string;
  profileName?: string;
  type: 'text' | 'audio' | 'image' | 'interactive';
  body?: string;
  mediaId?: string;
  timestamp: number;
};

/** Flatten a Meta webhook payload into supported inbound messages (status updates etc. are skipped). */
export function parseInbound(payload: unknown): ParsedInbound[] {
  const parsed = WebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  const out: ParsedInbound[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const phoneNumberId = change.value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const m of change.value.messages ?? []) {
        const profileName = change.value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
        const base = { phoneNumberId, waMessageId: m.id, from: m.from, profileName, timestamp: Number(m.timestamp) };
        if (m.type === 'text' && m.text) out.push({ ...base, type: 'text', body: m.text.body });
        else if (m.type === 'audio' && m.audio) out.push({ ...base, type: 'audio', mediaId: m.audio.id });
        else if (m.type === 'image' && m.image) out.push({ ...base, type: 'image', mediaId: m.image.id, body: m.image.caption });
        else if (m.type === 'interactive' && m.interactive) {
          const title = m.interactive.button_reply?.title ?? m.interactive.list_reply?.title;
          if (title) out.push({ ...base, type: 'interactive', body: title });
        }
      }
    }
  }
  return out;
}

const GRAPH = process.env.WHATSAPP_GRAPH_URL ?? 'https://graph.facebook.com/v21.0';

/** Send a text message through the Cloud API. Returns the wa message id. */
export async function sendText(opts: { phoneNumberId: string; accessToken: string; to: string; body: string }): Promise<string> {
  const res = await fetch(`${GRAPH}/${opts.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: opts.to, type: 'text', text: { body: opts.body } })
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status}`);
  const json = (await res.json()) as { messages?: { id: string }[] };
  return json.messages?.[0]?.id ?? '';
}
