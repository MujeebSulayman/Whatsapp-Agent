import { config } from 'dotenv';
config({ path: new URL('../../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { encryptSecret, type InboundJob } from '@wa/shared';
import { handleInbound } from '../src/jobs/handle-inbound.js';

const KEY = 'c'.repeat(64);
const prisma = createPrisma();
let job: InboundJob;
let conversationId = '';

beforeAll(async () => {
  await prisma.business.deleteMany({ where: { slug: 'worker-test' } });
  const b = await prisma.business.create({
    data: {
      name: 'Worker Test', slug: 'worker-test', category: 'x',
      whatsappAccounts: { create: { wabaId: 'W', phoneNumberId: 'WPNID', displayNumber: '1', accessTokenEncrypted: encryptSecret('TOKEN123', KEY) } },
      customers: { create: { waId: '2348011111111' } }
    },
    include: { customers: true }
  });
  const c = await prisma.conversation.create({ data: { businessId: b.id, customerId: b.customers[0]!.id } });
  conversationId = c.id;
  job = {
    businessId: b.id, conversationId: c.id, customerId: b.customers[0]!.id, messageId: 'm1', phoneNumberId: 'WPNID',
    waMessageId: 'wamid.W1', from: '2348011111111', type: 'text', body: 'hello', timestamp: 1
  };
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { slug: 'worker-test' } });
  await prisma.$disconnect();
});

describe('handleInbound (echo)', () => {
  it('decrypts the token, sends the echo and stores the outbound message', async () => {
    const sent: { accessToken: string; to: string; body: string }[] = [];
    await handleInbound({ db: prisma, encryptionKey: KEY, sendText: async (o) => (sent.push(o), 'wamid.OUT1') }, job);
    expect(sent).toEqual([{ phoneNumberId: 'WPNID', accessToken: 'TOKEN123', to: '2348011111111', body: 'Echo: hello' }]);
    const out = await prisma.message.findFirst({ where: { conversationId, direction: 'outbound' } });
    expect(out?.body).toBe('Echo: hello');
    expect(out?.sentBy).toBe('ai');
  });

  it('does not reply when a human has taken over', async () => {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'human' } });
    const sent: unknown[] = [];
    await handleInbound({ db: prisma, encryptionKey: KEY, sendText: async (o) => (sent.push(o), 'x'), log: () => {} }, job);
    expect(sent).toHaveLength(0);
  });
});
