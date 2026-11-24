import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { addDays, dateRange, isValidDateStr, todayStr } from '../dates.js';
import { predictForStore } from '../forecast.js';
import { recommendationsFor } from '../recommendations.js';

export const predictionsRouter = Router();

predictionsRouter.use(authRequired);

const MAX_RANGE_DAYS = 62;

predictionsRouter.use((req, res, next) => {
  const storeId = req.query.storeId as string;
  if (!storeId) return res.status(400).json({ error: 'storeId requerido' });
  if (req.auth!.role === 'comerciante' && req.auth!.storeId !== storeId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
});

predictionsRouter.get('/day', async (req, res) => {
  const date = req.query.date;
  if (!isValidDateStr(date)) return res.status(400).json({ error: 'date inválida (YYYY-MM-DD)' });
  const [p] = await predictForStore(req.query.storeId as string, [date]);
  if (!p) return res.status(503).json({ error: 'No hay datos climáticos para esa fecha' });
  res.json(p);
});

predictionsRouter.get('/week', async (req, res) => {
  const start = req.query.startDate;
  if (!isValidDateStr(start)) return res.status(400).json({ error: 'startDate inválida (YYYY-MM-DD)' });
  res.json(await predictForStore(req.query.storeId as string, dateRange(start, addDays(start, 6))));
});

predictionsRouter.get('/recommendations', async (req, res) => {
  const start = (req.query.startDate as string) || todayStr();
  if (!isValidDateStr(start)) return res.status(400).json({ error: 'startDate inválida (YYYY-MM-DD)' });
  const preds = await predictForStore(req.query.storeId as string, dateRange(start, addDays(start, 6)));
  res.json(preds.map(p => ({ prediction: p, recommendations: recommendationsFor(p) })));
});

predictionsRouter.get('/range', async (req, res) => {
  const { from, to } = req.query;
  if (!isValidDateStr(from) || !isValidDateStr(to) || from > to) {
    return res.status(400).json({ error: 'from y to inválidos (YYYY-MM-DD)' });
  }
  const dates = dateRange(from, to);
  if (dates.length > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `El rango máximo es de ${MAX_RANGE_DAYS} días` });
  }
  res.json(await predictForStore(req.query.storeId as string, dates));
});
