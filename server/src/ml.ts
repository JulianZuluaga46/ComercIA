/** Cliente del servicio Python de ML (server/ml). Lo arranca si no está corriendo. */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ML_URL = process.env.ML_URL || 'http://127.0.0.1:8001';
const mlDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ml');
let child: ChildProcess | undefined;
let stopping = false;

export class MlError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function mlHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${ML_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function venvPython(): string | null {
  const win = resolve(mlDir, '.venv', 'Scripts', 'python.exe');
  const posix = resolve(mlDir, '.venv', 'bin', 'python');
  if (existsSync(win)) return win;
  if (existsSync(posix)) return posix;
  return null;
}

export async function ensureMlService(): Promise<void> {
  if (await mlHealthy()) return;
  const python = venvPython();
  if (!python) {
    console.error('[ml] No existe server/ml/.venv. Ejecute: npm run ml:setup (en server/)');
    return;
  }
  const port = new URL(ML_URL).port || '8001';
  console.log(`[ml] Iniciando servicio de ML en ${ML_URL}…`);
  child = spawn(python, ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', port], {
    cwd: mlDir,
    stdio: 'inherit',
  });
  child.on('exit', code => {
    child = undefined;
    if (stopping) return;
    // Disponibilidad (RNF-03): si el servicio se cae, se vuelve a levantar.
    console.error(`[ml] El servicio de ML terminó (código ${code}). Reiniciando en 5 s…`);
    setTimeout(() => void ensureMlService(), 5000);
  });
  // En frío, cargar scikit-learn y XGBoost puede tardar más de un minuto en Windows.
  for (let i = 0; i < 360; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await mlHealthy()) {
      console.log('[ml] Servicio de ML listo');
      return;
    }
  }
  console.error('[ml] El servicio de ML no respondió a tiempo');
}

process.on('exit', () => {
  stopping = true;
  child?.kill();
});

async function call<T>(path: string, body: unknown, timeoutMs = 120000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ML_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new MlError('El servicio de ML no está disponible. Revise que esté en ejecución.', 503);
  }
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Error en el servicio de ML';
    throw new MlError(detail, res.status >= 500 ? 502 : 400);
  }
  return data as T;
}

export interface MlRecord {
  storeId: string;
  date: string;
  category: string;
  clients: number | null;
  tmax: number;
  tmin: number;
  precip: number;
  humidity: number;
}

export interface MlMetrics {
  mae: number;
  rmse: number;
  r2: number;
  mape: number;
  n: number;
}

export interface MlTrainResult {
  version: string;
  algorithm: string;
  metrics: MlMetrics;
  baseline: MlMetrics;
  importances: { feature: string; importance: number }[];
  records: number;
  durationMs: number;
  trainedThrough: string;
  /** baseline: predicción del método empírico ese día (ausente en modelos entrenados antes de 11/2026) */
  backtest: { storeId: string; date: string; predicted: number; baseline?: number }[];
}

export interface MlCalendar {
  isHoliday: boolean;
  holidayName: string | null;
  isQuincena: boolean;
  isPreQuincena: boolean;
  isPostQuincena: boolean;
  isEndOfMonth: boolean;
  isStartOfMonth: boolean;
  schoolBreak: string | null;
  event: string | null;
  season: string;
}

export interface MlPrediction {
  storeId: string;
  date: string;
  clients: number;
  clientsMin: number;
  clientsMax: number;
  confidence: number;
  calendar: MlCalendar;
  factors: { name: string; impact: number; type: 'positive' | 'negative' }[];
}

export function mlTrain(payload: { algorithm: string; version: string; records: MlRecord[] }) {
  return call<MlTrainResult>('/train', payload, 300000);
}

/** Calendario colombiano (festivos, quincenas, eventos) de cada fecha, tal como lo ve el modelo. */
export async function mlCalendar(dates: string[]): Promise<Record<string, MlCalendar>> {
  let res: Response;
  try {
    res = await fetch(`${ML_URL}/calendar?dates=${encodeURIComponent(dates.join(','))}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new MlError('El servicio de ML no está disponible. Revise que esté en ejecución.', 503);
  }
  if (!res.ok) throw new MlError('Error en el servicio de ML', 502);
  return (await res.json()) as Record<string, MlCalendar>;
}

export function mlPredict(payload: {
  version: string;
  rows: (Omit<MlRecord, 'clients'> & { storeMean: number })[];
  storeRecords: Record<string, number>;
  climatologyDates: string[];
}) {
  return call<MlPrediction[]>('/predict', payload);
}
