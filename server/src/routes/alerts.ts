import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { getThresholds, storeBaseline } from '../forecast.js';
import { generateAlerts } from '../jobs.js';

export const alertsRouter = Router();

alertsRouter.use(authRequired);

alertsRouter.get('/settings', async (req, res) => {
  const storeId = (req.query.storeId as string) || req.auth!.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId requerido' });
  if (req.auth!.role === 'comerciante' && req.auth!.storeId !== storeId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const { mean } = await storeBaseline(storeId);
  res.json(await getThresholds(storeId, mean));
});

alertsRouter.put('/settings', async (req, res) => {
  const storeId = (req.body.storeId as string) || req.auth!.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId requerido' });
  if (req.auth!.role === 'comerciante' && req.auth!.storeId !== storeId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const bajo = Number(req.body.bajo);
  const alto = Number(req.body.alto);
  const critico = Number(req.body.critico);
  if (![bajo, alto, critico].every(n => Number.isInteger(n) && n >= 0)) {
    return res.status(400).json({ error: 'Los umbrales deben ser números enteros' });
  }
  if (!(bajo < alto && alto <= critico)) {
    return res.status(400).json({ error: 'Debe cumplirse: flujo bajo < flujo alto ≤ flujo crítico' });
  }
  // El rango normal se deduce: así los umbrales nunca se contradicen.
  const values = { bajo, normalMin: bajo, normalMax: alto - 1, alto, critico };
  const settings = await prisma.alertSettings.upsert({
    where: { storeId },
    create: { storeId, ...values },
    update: values,
  });
  void generateAlerts(storeId).catch(() => {});
  res.json(settings);
});
