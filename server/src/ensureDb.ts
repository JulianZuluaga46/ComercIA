import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function ensureDatabase() {
  // Crea la base si no existe y agrega tablas/columnas nuevas al actualizar la aplicación.
  // Sin --accept-data-loss: si un cambio pudiera borrar datos, Prisma se detiene y no toca nada.
  try {
    execSync('npx prisma db push --skip-generate', { cwd: serverRoot, stdio: 'pipe', env: process.env });
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    console.error(`[db] No se pudo actualizar el esquema:\n${stdout ?? ''}${stderr ?? ''}`);
    throw new Error('Esquema de base de datos desactualizado');
  }
  const [stores, users] = await Promise.all([prisma.store.count(), prisma.user.count()]);
  if (stores === 0 && users === 0) {
    console.log('[db] Base vacía. Cargando el registro piloto…');
    execSync('npx tsx prisma/seed.ts', { cwd: serverRoot, stdio: 'inherit', env: process.env });
  }
}
