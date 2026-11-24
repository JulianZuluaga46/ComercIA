import './loadEnv.js';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';
import { authRequired, requireRole } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { storesRouter } from './routes/stores.js';
import { predictionsRouter } from './routes/predictions.js';
import { historicalRouter } from './routes/historical.js';
import { notificationsRouter } from './routes/notifications.js';
import { usersRouter } from './routes/users.js';
import { alertsRouter } from './routes/alerts.js';
import { settingsRouter } from './routes/settings.js';
import { reportsRouter } from './routes/reports.js';
import { modelsRouter } from './routes/models.js';
import { trainingRouter } from './routes/training.js';
import { ensureDatabase } from './ensureDb.js';
import { activeModel, computeMetrics } from './forecast.js';
import { ensureMlService, mlHealthy, MlError } from './ml.js';
import { weatherStatus } from './weather.js';
import { jobStatus, startJobs } from './jobs.js';
import { mapModelRun } from './training.js';
import { mailStatus } from './mailer.js';
import { feedbackRouter } from './routes/feedback.js';
import { listBackups } from './backup.js';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const startedAt = new Date();

const isProd = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
// En producción la web y la API comparten dominio: no se permite CORS salvo que se configure CORS_ORIGIN.
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? !isProd, credentials: true }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '15mb' }));

// Límite por IP en el acceso: complementa el bloqueo por cuenta (RF-02).
const hits = new Map<string, { n: number; until: number }>();
function authRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now();
  const key = req.ip ?? 'ip';
  const h = hits.get(key);
  if (!h || h.until < now) {
    hits.set(key, { n: 1, until: now + 10 * 60000 });
    return next();
  }
  if (++h.n > 60) {
    return res.status(429).json({ error: 'Demasiados intentos desde esta conexión. Espera unos minutos.' });
  }
  next();
}
for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/otp/request', '/api/auth/otp/verify']) {
  app.post(path, authRateLimit);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ComercIA API' });
});

app.use('/api/auth', authRouter);
app.use('/api/stores', storesRouter);

app.get('/api/stats', authRequired, requireRole('admin', 'analista'), async (_req, res) => {
  const real = { store: { isTest: false } };
  const [stores, testStores, users, records, testRecords, activeStores, estimated, recent, model] = await Promise.all([
    prisma.store.count({ where: { isTest: false } }),
    prisma.store.count({ where: { isTest: true } }),
    prisma.user.count(),
    prisma.dailyRecord.count({ where: real }),
    prisma.dailyRecord.count({ where: { store: { isTest: true } } }),
    prisma.store.count({ where: { status: 'Activo', isTest: false } }),
    prisma.dailyRecord.count({ where: { estimated: true } }),
    prisma.dailyRecord.findMany({ where: real, take: 2000, orderBy: { date: 'desc' } }),
    activeModel(),
  ]);
  // Clientes por día de la semana (solo comercios reales)
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const activity = days.map((day, i) => {
    const rows = recent.filter(r => r.date.getDay() === i);
    return {
      day,
      registros: rows.length,
      promedioClientes: rows.length ? Math.round((rows.reduce((a, r) => a + r.clients, 0) / rows.length) * 10) / 10 : 0,
    };
  });
  res.json({
    stores,
    testStores,
    users,
    records,
    testRecords,
    estimatedRecords: estimated,
    activeStores,
    activity,
    model: model ? mapModelRun(model) : null,
  });
});

app.get('/api/metrics', authRequired, requireRole('admin', 'analista'), async (req, res) => {
  const storeId = req.query.storeId as string | undefined;
  const records = await prisma.dailyRecord.findMany({
    where: storeId ? { storeId } : {},
    orderBy: { date: 'desc' },
  });
  const pairs = records
    .filter(r => r.predicted != null)
    .map(r => ({ real: r.clients, predicted: r.predicted as number }));
  res.json({ ...computeMetrics(pairs), records: records.length });
});

app.get('/api/platform', authRequired, requireRole('admin', 'analista'), async (_req, res) => {
  const [ml, model, weatherRows, lastWeather, notifications, reports] = await Promise.all([
    mlHealthy(),
    activeModel(),
    prisma.weatherDaily.count(),
    prisma.weatherDaily.findFirst({ where: { source: 'forecast' }, orderBy: { date: 'desc' } }),
    prisma.notification.count(),
    prisma.report.count(),
  ]);
  const ws = weatherStatus();
  const mail = mailStatus();
  res.json({
    startedAt: startedAt.toISOString(),
    services: {
      api: { ok: true },
      database: { ok: true },
      ml: { ok: ml },
      mail: { ok: mail.configured && !mail.lastError, configured: mail.configured, lastError: mail.lastError },
      weather: {
        ok: ws?.ok ?? false,
        lastSync: ws?.at.toISOString() ?? null,
        message: ws?.message ?? 'Sin sincronizar',
        days: weatherRows,
        forecastUntil: lastWeather?.date ?? null,
      },
    },
    jobs: {
      lastRun: jobStatus.lastRun?.toISOString() ?? null,
      lastRetrain: jobStatus.lastRetrain?.toISOString() ?? null,
      alertsCreated: jobStatus.alertsCreated,
      lastError: jobStatus.lastError,
    },
    model: model ? mapModelRun(model) : null,
    notifications,
    reports,
    backups: listBackups().slice(0, 5),
  });
});

app.use('/api/predictions', predictionsRouter);
app.use('/api/historical', historicalRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/users', usersRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/models', modelsRouter);
app.use('/api/training', trainingRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Producción: el mismo servidor entrega la web compilada (npm run build en la raíz).
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
if (isProd && existsSync(webDir)) {
  app.use(express.static(webDir));
  app.get('*', (_req, res) => res.sendFile(resolve(webDir, 'index.html')));
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof MlError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Prisma: registro inexistente (update/delete sobre un id que no existe)
  if ((err as { code?: string }).code === 'P2025') {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  // Errores de body-parser (JSON mal formado, archivo demasiado grande)
  const status = (err as { status?: number }).status;
  if (status === 502 || status === 503) {
    return res.status(status).json({ error: err.message });
  }
  if (status && status >= 400 && status < 500) {
    const msg = status === 413 ? 'El archivo es demasiado grande (máx. 15 MB)' : 'Solicitud inválida';
    return res.status(status).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

ensureDatabase()
  .then(async () => {
    app.listen(PORT, () => {
      console.log(`ComercIA API listening on http://localhost:${PORT}`);
    });
    await ensureMlService();
    startJobs();
  })
  .catch(err => {
    console.error('No se pudo iniciar la base de datos', err);
    process.exit(1);
  });
