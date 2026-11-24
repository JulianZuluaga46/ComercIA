// Crea server/ml/.venv e instala las dependencias de Python (Windows, macOS y Linux).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mlDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ml');
const venv = resolve(mlDir, '.venv');
const win = process.platform === 'win32';
const venvPython = win ? resolve(venv, 'Scripts', 'python.exe') : resolve(venv, 'bin', 'python');

/**
 * Busca un Python 3.11 o superior. En Windows, «python» puede ser el acceso directo de la Microsoft Store (no
 * instala nada y falla), así que se prueba primero el lanzador «py», que viene con el instalador de python.org.
 */
function findPython() {
  const candidates = win
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]];
  for (const [cmd, pre] of candidates) {
    try {
      const out = execFileSync(cmd, [...pre, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const [major, minor] = out.split('.').map(Number);
      if (major === 3 && minor >= 11) return { cmd, pre, version: out };
      console.warn(`Se encontró Python ${out} («${cmd}»), pero se necesita 3.11 o superior.`);
    } catch {
      // no existe o es el acceso directo de la tienda: probar el siguiente
    }
  }
  console.error('\nNo se encontró Python 3.11 o superior.');
  console.error('Instálelo desde https://www.python.org/downloads/ y vuelva a ejecutar  npm run setup');
  if (win) console.error('En el instalador marque «Add python.exe to PATH».');
  process.exit(1);
}

if (!existsSync(venvPython)) {
  const py = findPython();
  console.log(`Creando entorno virtual con Python ${py.version} en ${venv}…`);
  execFileSync(py.cmd, [...py.pre, '-m', 'venv', venv], { stdio: 'inherit' });
}
execFileSync(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], { stdio: 'inherit' });
execFileSync(venvPython, ['-m', 'pip', 'install', '-r', resolve(mlDir, 'requirements.txt')], { stdio: 'inherit' });
console.log('Servicio de ML listo. Se inicia automáticamente con "npm run dev".');
