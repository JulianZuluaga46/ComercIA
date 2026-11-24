import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { dateRange, formatDate, isValidDateStr, parseDate } from '../dates.js';
import { predictForStore } from '../forecast.js';
import { conditionText, getWeather } from '../weather.js';
import { recommendationsFor } from '../recommendations.js';
import { MIME, render, type ExportFormat, type Table } from '../exporters.js';
import { decrypt, encrypt } from '../crypto.js';

export const reportsRouter = Router();

reportsRouter.use(authRequired);

const TIPOS = ['Predicciones', 'Histórico', 'Métricas', 'Recomendaciones'] as const;
const FORMATOS: ExportFormat[] = ['CSV', 'Excel', 'PDF'];
const MAX_PRED_DAYS = 62;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function meta(r: { id: string; name: string; tipo: string; formato: string; fechaInicio: string; fechaFin: string; createdAt: Date }) {
  return {
    id: r.id,
    name: r.name,
    tipo: r.tipo,
    formato: r.formato,
    fechaInicio: r.fechaInicio,
    fechaFin: r.fechaFin,
    createdAt: r.createdAt.toISOString(),
  };
}

async function buildTable(tipo: string, storeId: string, storeName: string, from: string, to: string): Promise<Table> {
  const subtitle = `${storeName} · ${from} a ${to} · generado ${new Date().toLocaleString('es-CO')}`;
  const dayName = (d: string) => DIAS[parseDate(d).getDay()];

  if (tipo === 'Predicciones' || tipo === 'Recomendaciones') {
    const dates = dateRange(from, to);
    if (dates.length > MAX_PRED_DAYS) throw Object.assign(new Error(`Máximo ${MAX_PRED_DAYS} días por reporte de predicciones`), { status: 400 });
    const preds = await predictForStore(storeId, dates);
    const model = preds[0]?.modelVersion;
    if (tipo === 'Recomendaciones') {
      return {
        title: 'Recomendaciones operativas',
        subtitle,
        headers: ['Fecha', 'Día', 'Clientes previstos', 'Nivel', 'Recomendaciones'],
        rows: preds.map(p => [p.date, dayName(p.date), p.clients, p.flowLevel, recommendationsFor(p).join(' ')]),
        notes: [`Modelo ${model}. El sistema solo recomienda; las decisiones las toma el comerciante.`],
      };
    }
    return {
      title: 'Predicción del flujo de clientes',
      subtitle,
      headers: ['Fecha', 'Día', 'Previstos', 'Mínimo', 'Máximo', 'Nivel', 'Confianza %', 'T. máx °C', 'Lluvia mm', 'Clima', 'Fuente clima', 'Calendario'],
      rows: preds.map(p => [
        p.date,
        dayName(p.date),
        p.clients,
        p.clientsMin,
        p.clientsMax,
        p.flowLevel,
        p.confidence,
        p.temperature,
        p.precipitation,
        p.condition,
        p.weatherSource === 'forecast' ? 'Pronóstico' : p.weatherSource === 'archive' ? 'Observado' : 'Promedio histórico',
        [p.isHoliday ? `Festivo: ${p.holidayName}` : '', p.isQuincena ? 'Quincena' : '', p.event ?? '', p.schoolBreak ? 'Receso escolar' : '']
          .filter(Boolean)
          .join(', '),
      ]),
      notes: [`Modelo ${model}. Clima: Open-Meteo (Montería).`],
    };
  }

  if (tipo === 'Histórico') {
    const records = await prisma.dailyRecord.findMany({
      where: { storeId, date: { gte: parseDate(from), lte: parseDate(to) } },
      orderBy: { date: 'asc' },
    });
    const weather = await getWeather(records.map(r => formatDate(r.date)));
    return {
      title: 'Histórico de flujo de clientes',
      subtitle,
      headers: ['Fecha', 'Día', 'Clientes reales', 'Predicho', 'Error abs.', 'Estimado', 'T. máx °C', 'Lluvia mm', 'Humedad %', 'Clima', 'Observaciones'],
      rows: records.map(r => {
        const d = formatDate(r.date);
        const w = weather.get(d);
        return [
          d,
          dayName(d),
          r.clients,
          r.predicted != null ? Math.round(r.predicted * 10) / 10 : '',
          r.predicted != null ? Math.round(Math.abs(r.clients - r.predicted) * 10) / 10 : '',
          r.estimated ? 'Sí' : 'No',
          w?.tmax ?? '',
          w?.precip ?? '',
          w?.humidity ?? '',
          w ? conditionText(w) : '',
          decrypt(r.observations) ?? '',
        ];
      }),
      notes: ['"Predicho" corresponde a validación fuera de muestra o a la predicción hecha antes de conocer el dato real.'],
    };
  }

  // Métricas
  const runs = await prisma.modelRun.findMany({ orderBy: { createdAt: 'asc' } });
  return {
    title: 'Métricas de los modelos entrenados',
    subtitle: `Generado ${new Date().toLocaleString('es-CO')}`,
    headers: ['Versión', 'Algoritmo', 'Fecha', 'MAE', 'RMSE', 'R²', 'MAPE %', 'MAE método empírico', 'Días evaluados', 'Registros', 'Activo'],
    rows: runs.map(r => [
      r.version,
      r.algorithm,
      formatDate(r.createdAt),
      r.mae,
      r.rmse,
      r.r2,
      r.mape,
      r.baselineMae,
      r.evaluated,
      r.records,
      r.active ? 'Sí' : 'No',
    ]),
    notes: ['Validación walk-forward: se entrena con el pasado y se predice la semana siguiente. Método empírico = promedio del mismo día de la semana.'],
  };
}

reportsRouter.get('/', async (req, res) => {
  const list = await prisma.report.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json(list.map(meta));
});

reportsRouter.get('/:id', async (req, res) => {
  const r = await prisma.report.findFirst({ where: { id: req.params.id, userId: req.auth!.userId } });
  if (!r) return res.status(404).json({ error: 'Reporte no encontrado' });
  res.json(meta(r));
});

reportsRouter.get('/:id/download', async (req, res) => {
  const r = await prisma.report.findFirst({ where: { id: req.params.id, userId: req.auth!.userId } });
  if (!r) return res.status(404).json({ error: 'Reporte no encontrado' });
  const fmt = (FORMATOS.includes(r.formato as ExportFormat) ? r.formato : 'CSV') as ExportFormat;
  const { type, ext } = MIME[fmt];
  const safe = r.name.replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, '_');
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}.${ext}`)}`);
  res.send(Buffer.from(decrypt(r.content), 'base64'));
});

reportsRouter.post('/', async (req, res) => {
  const { tipo, formato, fechaInicio, fechaFin, storeId: bodyStoreId } = req.body as {
    tipo?: string;
    formato?: string;
    fechaInicio?: string;
    fechaFin?: string;
    storeId?: string;
  };
  if (!tipo || !TIPOS.includes(tipo as (typeof TIPOS)[number])) {
    return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS.join(', ')}` });
  }
  if (!isValidDateStr(fechaInicio) || !isValidDateStr(fechaFin) || fechaInicio > fechaFin) {
    return res.status(400).json({ error: 'Rango de fechas inválido' });
  }
  const fmt = (formato && FORMATOS.includes(formato as ExportFormat) ? formato : 'CSV') as ExportFormat;
  const storeId = req.auth!.role === 'comerciante' ? req.auth!.storeId : bodyStoreId || req.auth!.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId requerido' });
  if (!(await prisma.store.findUnique({ where: { id: storeId } }))) {
    return res.status(404).json({ error: 'Comercio no encontrado' });
  }
  try {
    const report = await createReport({ userId: req.auth!.userId, storeId, tipo, formato: fmt, from: fechaInicio, to: fechaFin });
    res.status(201).json(meta(report));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status && status < 500) return res.status(status).json({ error: (err as Error).message });
    throw err;
  }
});

/** Genera y guarda un reporte (usado por la API y por los reportes automáticos). */
export async function createReport(o: {
  userId: string;
  storeId: string;
  tipo: string;
  formato: ExportFormat;
  from: string;
  to: string;
  name?: string;
}) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: o.storeId } });
  const table = await buildTable(o.tipo, o.storeId, store.name, o.from, o.to);
  const buf = await render(table, o.formato);
  return prisma.report.create({
    data: {
      userId: o.userId,
      storeId: o.storeId,
      name: o.name ?? `Reporte ${o.tipo} ${o.from} a ${o.to}`,
      tipo: o.tipo,
      formato: o.formato,
      fechaInicio: o.from,
      fechaFin: o.to,
      content: encrypt(buf.toString('base64')),
    },
  });
}
