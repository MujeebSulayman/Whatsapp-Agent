import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseInbound, verifyMetaSignature } from './index.js';

const fixture = {
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: 'PNID1' },
    contacts: [{ wa_id: '2348012345678', profile: { name: 'Ada' } }],
    messages: [{ id: 'wamid.1', from: '2348012345678', timestamp: '1700000000', type: 'text', text: { body: 'how much be party pack?' } }]
  } }] }]
};

describe('verifyMetaSignature', () => {
  const body = JSON.stringify(fixture);
  const sig = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  it('accepts a valid signature', () => expect(verifyMetaSignature(body, sig, 'secret')).toBe(true));
  it('rejects a wrong secret', () => expect(verifyMetaSignature(body, sig, 'nope')).toBe(false));
  it('rejects missing/garbage headers', () => {
    expect(verifyMetaSignature(body, undefined, 'secret')).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=zz', 'secret')).toBe(false);
  });
});

describe('parseInbound', () => {
  it('extracts text messages', () => {
    expect(parseInbound(fixture)).toEqual([
      { phoneNumberId: 'PNID1', waMessageId: 'wamid.1', from: '2348012345678', profileName: 'Ada', type: 'text', body: 'how much be party pack?', timestamp: 1700000000 }
    ]);
  });
  it('ignores status-only and invalid payloads', () => {
    expect(parseInbound({ object: 'x', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'P' } } }] }] })).toEqual([]);
    expect(parseInbound({ nope: true })).toEqual([]);
  });
});
