import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM. Key is a 32-byte value given as 64 hex chars (WHATSAPP_TOKEN_ENCRYPTION_KEY). */
function keyFrom(hex: string): Buffer {
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)');
  return key;
}

export function encryptSecret(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyHex), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string, keyHex: string): string {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !enc) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(keyHex), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Mask a phone number for logs: 2348012345678 -> 234801***5678 */
export function maskPhone(p: string): string {
  return p.length <= 7 ? '***' : `${p.slice(0, 6)}***${p.slice(-4)}`;
}
