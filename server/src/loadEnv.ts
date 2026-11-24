import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// Genera y guarda las claves secretas la primera vez (nunca se versionan).
function ensureSecret(name: string) {
  if (process.env[name]) return;
  const value = randomBytes(32).toString('base64');
  appendFileSync(envPath, `\n${name}=${value}\n`);
  process.env[name] = value;
  console.log(`[env] ${name} generada y guardada en server/.env`);
}
ensureSecret('JWT_SECRET');
ensureSecret('ENCRYPTION_KEY');

// Recién clonado no hay server/.env: la base va en server/prisma/dev.db (ruta relativa a schema.prisma).
if (!process.env.DATABASE_URL) {
  appendFileSync(envPath, '\nDATABASE_URL=file:./dev.db\n');
  process.env.DATABASE_URL = 'file:./dev.db';
  console.log('[env] DATABASE_URL guardada en server/.env (server/prisma/dev.db)');
}
