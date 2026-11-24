/**
 * Cifrado de campos sensibles en reposo (RNF-04) con AES-256-GCM.
 * Cifrados: teléfono del usuario, dirección y descripción del comercio, observaciones de los
 * registros y contenido de los reportes. Las contraseñas se guardan con hash bcrypt (no reversible).
 * La clave vive en ENCRYPTION_KEY (server/.env); loadEnv.ts la genera si no existe.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY no está definida en server/.env');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY debe ser de 32 bytes en base64');
  return buf;
}

export function encrypt(plain: string): string;
export function encrypt(plain: string | null | undefined): string | null;
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return plain ?? null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, data].map(b => b.toString('base64')).join(':');
}

export function decrypt(value: string): string;
export function decrypt(value: string | null | undefined): string | null;
export function decrypt(value: string | null | undefined): string | null {
  if (value == null || !value.startsWith(PREFIX)) return value ?? null;
  const [iv, tag, data] = value.slice(PREFIX.length).split(':').map(s => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
