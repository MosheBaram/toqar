import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for the most sensitive payloads (spec:
 * data-governance): a per-tenant DEK encrypts data; the KEK wraps the DEK
 * and the wrapped DEK is stored beside the data. Destroying a tenant's
 * wrapped DEK is crypto-shredding — that tenant's ciphertext becomes
 * permanently unreadable, no other tenant affected.
 *
 * The KEK is supplied by the deployment (TOQAR_KEK, 32 bytes base64) and
 * SHOULD itself live in a cloud KMS in production — the wrap/unwrap seam
 * here is exactly what a KMS call replaces. Encryption is selective:
 * applied to payloads (seam maps = customer source context), never to
 * fields the query path filters on.
 */

const ALG = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

export function kekFromEnv(value = process.env.TOQAR_KEK): Buffer | null {
  if (!value) return null;
  const kek = Buffer.from(value, 'base64');
  if (kek.length !== 32) throw new Error('TOQAR_KEK must be 32 bytes, base64-encoded');
  return kek;
}

export function generateDek(): Buffer {
  return randomBytes(32);
}

function seal(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString('base64')).join(':');
}

function open(key: Buffer, sealed: string): Buffer {
  const [iv, tag, ciphertext] = sealed.split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv(ALG, key, iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(ciphertext!), decipher.final()]);
}

export function wrapDek(kek: Buffer, dek: Buffer): string {
  return seal(kek, dek);
}

export function unwrapDek(kek: Buffer, wrapped: string): Buffer {
  return open(kek, wrapped);
}

export function encryptPayload(dek: Buffer, plaintext: string): string {
  return PREFIX + seal(dek, Buffer.from(plaintext, 'utf8'));
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function decryptPayload(dek: Buffer, sealed: string): string {
  if (!isEncrypted(sealed)) throw new Error('not an encrypted payload');
  return open(dek, sealed.slice(PREFIX.length)).toString('utf8');
}
