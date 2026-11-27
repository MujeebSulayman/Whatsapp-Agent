import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskPhone } from './index.js';

const key = 'a'.repeat(64);
describe('crypto', () => {
  it('round-trips', () => expect(decryptSecret(encryptSecret('tok_123', key), key)).toBe('tok_123'));
  it('uses fresh IVs', () => expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key)));
  it('fails with the wrong key', () => expect(() => decryptSecret(encryptSecret('x', key), 'b'.repeat(64))).toThrow());
  it('masks phones', () => expect(maskPhone('2348012345678')).toBe('234801***5678'));
});
