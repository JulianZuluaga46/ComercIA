import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { addDays, formatDate, isValidDateStr, parseDate, todayStr } from '../dates.js';
import { activeModel, predictForStore } from '../forecast.js';
import { conditionText, getWeather } from '../weather.js';
import { parseUpload } from '../tabular.js';
import { decrypt, encrypt } from '../crypto.js';
import { learnAfterNewData } from '../jobs.js';

export const historicalRouter = Router();

historicalRouter.use(authRequired);

function canAccess(req: Request, storeId: string) {
  return !(req.auth!.role === 'comerciante' && req.auth!.storeId !== storeId);
}

async function refreshCount(storeId: string) {
  const agg = await prisma.dailyRecord.aggregate({ where: { storeId }, _count: true, _avg: { clients: true } });
  await prisma.store.update({
    where: { id: storeId },
    data: { dataRecords: agg._count, ...(agg._avg.clients ? { avgDailyClients: Math.round(agg._avg.clients) } : {}) },
  });
  return agg._count;
}

/** Predicción registrada antes de conocer el valor real (solo si el modelo no vio esa fecha). */
async function priorPrediction(storeId: string, date: string) {
  const model = await activeModel();
  if (!model || date <= model.trainedThrough) return null;
  try {
    const [p] = await predictForStore(storeId, [date]);
    return p ? { predicted: p.clients, predictedBy: model.version } : null;
  } catch {
    return null;
  }
}

historicalRouter.get('/', async (req, res) => {
  const storeId = req.query.storeId as string;
  const days = Math.min(730, Math.max(1, Number(req.query.days) || 90));
  if (!storeId) return res.status(400).json({ error: 'storeId requerido' });
  if (!canAccess(req, storeId)) return res.status(403).json({ error: 'Acceso denegado' });

  const since = parseDate(addDays(todayStr(), -days));
  const records = await prisma.dailyRecord.findMany({
    where: { storeId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });
  const weather = await getWeather(records.map(r => formatDate(r.date)));

  res.json(
    records.map(r => {
      const date = formatDate(r.date);
      const w = weather.get(date);
      const predicted = r.predicted != null ? Math.round(r.predicted * 10) / 10 : null;
      return {
        date,
        real: r.clients,
        predicted,
        error: predicted != null ? Math.round(Math.abs(r.clients - predicted) * 10) / 10 : null,
        predictedBy: r.predictedBy,
        estimated: r.estimated,
        promotion: r.promotion,
        observations: decrypt(r.observations),
        temperature: w?.tmax ?? null,
        precipitation: w?.precip ?? null,
        humidity: w?.humidity ?? null,
        condition: w ? conditionText(w) : null,
      };
    }),
  );
});

historicalRouter.post('/', async (req, res) => {
  const { storeId, date, clients, promotion, observations } = req.body as {
    storeId?: string;
    date?: string;
    clients?: number;
    promotion?: boolean;
    observations?: string;
  };
  if (!storeId || !isValidDateStr(date) || clients == null || !Number.isInteger(Number(clients)) || Number(clients) < 0) {
    return res.status(400).json({ error: 'storeId, fecha (AAAA-MM-DD) y número de clientes (entero ≥ 0) son requeridos' });
  }
  if (date > todayStr()) return res.status(400).json({ error: 'No se pueden registrar fechas futuras' });
  if (!canAccess(req, storeId)) return res.status(403).json({ error: 'Acceso denegado' });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return res.status(404).json({ error: 'Comercio no encontrado' });

  const d = parseDate(date);
  const existing = await prisma.dailyRecord.findUnique({ where: { storeId_date: { storeId, date: d } } });
  const prior = existing?.predicted != null ? null : await priorPrediction(storeId, date);
  const data = {
    clients: Number(clients),
    estimated: false,
    promotion: promotion ?? null,
    observations: encrypt(observations?.trim() || null),
    ...(prior ?? {}),
  };
  const record = await prisma.dailyRecord.upsert({
    where: { storeId_date: { storeId, date: d } },
    create: { storeId, date: d, ...data },
    update: data,
  });
  const total = await refreshCount(storeId);
  const learning = await learnAfterNewData(storeId);
  res.status(201).json({
    id: record.id,
    date,
    clients: record.clients,
    predicted: record.predicted,
    totalRecords: total,
    learning,
  });
});

/**
 * Importación de CSV o Excel. Body: { storeId, csv } o { storeId, fileBase64, filename }.
 * Con dryRun=true solo valida y devuelve el resumen sin guardar.
 */
historicalRouter.post('/import', async (req, res) => {
  const { storeId, csv, fileBase64, filename, dryRun } = req.body as {
    storeId?: string;
    csv?: string;
    fileBase64?: string;
    filename?: string;
    dryRun?: boolean;
  };
  if (!storeId || (!csv && !fileBase64)) {
    return res.status(400).json({ error: 'storeId y archivo requeridos' });
  }
  if (!canAccess(req, storeId)) return res.status(403).json({ error: 'Acceso denegado' });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return res.status(404).json({ error: 'Comercio no encontrado' });

  const parsed = await parseUpload({ csv, fileBase64, filename });
  // Días del archivo que ya estaban registrados: se reemplazan con los valores del archivo
  const already = await prisma.dailyRecord.findMany({
    where: { storeId, date: { in: parsed.rows.map(r => parseDate(r.date)) } },
    select: { date: true },
  });
  const updatedDays = already.length;
  const newDays = parsed.rows.length - updatedDays;
  const dates = parsed.rows.map(r => r.date).sort();
  const summary = {
    valid: parsed.rows.length,
    errors: parsed.errors,
    newDays,
    updatedDays,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
  if (dryRun) return res.json({ ...summary, imported: 0, totalRecords: store.dataRecords });
  if (!parsed.rows.length) {
    return res.status(400).json({ error: parsed.errors[0]?.message || 'No hay filas válidas', errors: parsed.errors });
  }

  for (const r of parsed.rows) {
    const d = parseDate(r.date);
    const data = {
      clients: r.clients,
      estimated: r.estimated,
      promotion: r.promotion,
      observations: encrypt(r.observations),
    };
    await prisma.dailyRecord.upsert({
      where: { storeId_date: { storeId, date: d } },
      create: { storeId, date: d, ...data },
      update: data,
    });
  }
  const totalRecords = await refreshCount(storeId);
  const learning = await learnAfterNewData(storeId);
  res.json({ ...summary, imported: parsed.rows.length, totalRecords, learning });
});
