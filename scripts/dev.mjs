/**
 * `npm run dev`: arranca la web (Vite), que a su vez arranca la API y el servicio de ML.
 *
 * Si existe exposicion/MODO-DEMO-ACTIVO, usa la COPIA de demostración (exposicion/expo.db y exposicion/models)
 * en lugar de la base real, con el aviso "Modo demostración" al pie de la página.
 * - Volver al sistema real: borre exposicion/MODO-DEMO-ACTIVO, o use `npm run dev:real` una vez.
 * - La base real (server/prisma/dev.db) nunca se toca en modo demostración.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(root, 'exposicion');
const flag = join(demoDir, 'MODO-DEMO-ACTIVO');
const forceReal = process.argv.includes('--real');
const demo = !forceReal && existsSync(flag) && existsSync(join(demoDir, 'expo.db'));

const env = { ...process.env };
if (demo) {
  Object.assign(env, {
    // Relativa a server/prisma, que es como la resuelve Prisma
    DATABASE_URL: 'file:../../exposicion/expo.db',
    BACKUP_DIR: join(demoDir, 'backups'),
    COMERCIA_MODELS_DIR: join(demoDir, 'models'),
    VITE_DEMO: '1',
    // En la demostración vuelve a aprender en cuanto se suben días nuevos (en el sistema real son 7, RF-12)
    RETRAIN_MIN_NEW_RECORDS: '1',
  });
  console.log('\n  ComercIA · MODO DEMOSTRACIÓN (base: exposicion/expo.db; la base real no se usa)');
  console.log('  Para el sistema real: borre exposicion/MODO-DEMO-ACTIVO o use  npm run dev:real\n');
} else {
  console.log('\n  ComercIA · sistema real (base: server/prisma/dev.db)\n');
}

/** ¿Hay algo escuchando en ese puerto? (por ejemplo, otro `npm run dev` abierto) */
const busy = port =>
  new Promise(done => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), done(true)));
    s.once('error', () => done(false));
  });
const inUse = [];
for (const port of [8443, 3001, 8001]) if (await busy(port)) inUse.push(port);
if (inUse.length) {
  console.error(`  ComercIA ya está abierto en otra ventana (puertos ocupados: ${inUse.join(', ')}).`);
  console.error('  Ciérrelo primero (Ctrl + C en esa terminal) y vuelva a escribir  npm run dev\n');
  process.exit(1);
}

const child = spawn('npx', ['vite'], { cwd: root, env, stdio: 'inherit', shell: true });
child.on('exit', code => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
