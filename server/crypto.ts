import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import type { EncryptedPayload } from '../src/types.ts';

const ITERATIONS = 150_000;
const MAGIC = 'NONETECO_V1';

export function encryptText(text: string, password: string): EncryptedPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITERATIONS, 32, 'sha256');
  const wrapped = JSON.stringify({ magic: MAGIC, text });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(wrapped, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, tag]);

  return {
    v: 1,
    alg: 'PBKDF2-AES-256-GCM',
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: combined.toString('base64'),
  };
}

export function decryptText(payload: EncryptedPayload, password: string): string {
  if (!payload || payload.v !== 1 || payload.alg !== 'PBKDF2-AES-256-GCM') {
    throw new Error('Unsupported encrypted payload format');
  }

  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const combined = Buffer.from(payload.data, 'base64');

  if (combined.length < 17) {
    throw new Error('Corrupted encrypted payload');
  }

  const ciphertext = combined.subarray(0, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, payload.iterations || ITERATIONS, 32, 'sha256');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(decrypted) as { magic?: string; text?: string };

  if (parsed.magic !== MAGIC || typeof parsed.text !== 'string') {
    throw new Error('Invalid password or corrupted data');
  }

  return parsed.text;
}
