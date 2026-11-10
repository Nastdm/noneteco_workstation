import type { EncryptedPayload } from '../types';

const ITERATIONS = 150_000;
const MAGIC = 'NONETECO_V1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number, usage: KeyUsage[]) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

export async function encryptText(text: string, password: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, ITERATIONS, ['encrypt']);
  const wrapped = JSON.stringify({ magic: MAGIC, text });

  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoder.encode(wrapped),
  );

  return {
    v: 1,
    alg: 'PBKDF2-AES-256-GCM',
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encryptedBuf)),
  };
}

export async function decryptText(payload: EncryptedPayload, password: string): Promise<string> {
  if (!payload || payload.v !== 1 || payload.alg !== 'PBKDF2-AES-256-GCM') {
    throw new Error('Unsupported encrypted payload format');
  }

  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const data = base64ToBytes(payload.data);
  const key = await deriveAesKey(password, salt, payload.iterations || ITERATIONS, ['decrypt']);

  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    data as unknown as BufferSource,
  );

  const parsed = JSON.parse(decoder.decode(decryptedBuf)) as { magic?: string; text?: string };
  if (parsed.magic !== MAGIC || typeof parsed.text !== 'string') {
    throw new Error('Invalid password');
  }
  return parsed.text;
}
