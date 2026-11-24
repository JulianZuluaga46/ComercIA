/**
 * Copias de seguridad de la base de datos en server/backups (una por día, se conservan las últimas 14).
 * VACUUM INTO produce una copia consistente aunque el servidor esté en uso.
 * La clave ENCRYPTION_KEY (server/.env) NO se copia aquí a propósito: guárdela aparte.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';
import { todayStr } from './dates.js';

const dir = process.env.BACKUP_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..', 'backups');
const KEEP = 14;

export function listBackups() {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse()
    .map(f => ({ name: f, sizeKb: Math.round(statSync(resolve(dir, f)).size / 1024) }));
}

export async function backupDatabase(): Promise<string | null> {
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `comercia-${todayStr()}.db`);
  if (existsSync(file)) return null; // ya hay copia de hoy
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  for (const old of listBackups().slice(KEEP)) unlinkSync(resolve(dir, old.name));
  console.log(`[respaldo] Copia creada: ${file}`);
  return file;
}
