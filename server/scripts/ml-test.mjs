// Ejecuta las pruebas del servicio de ML con el Python del entorno virtual.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mlDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ml');
const python =
  process.platform === 'win32' ? resolve(mlDir, '.venv', 'Scripts', 'python.exe') : resolve(mlDir, '.venv', 'bin', 'python');
execFileSync(python, ['-m', 'unittest', '-v', 'test_ml.py'], { cwd: mlDir, stdio: 'inherit' });
