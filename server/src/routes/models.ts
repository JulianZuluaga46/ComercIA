import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { applyBacktest, mapModelRun, trainModel } from '../training.js';

export const modelsRouter = Router();

modelsRouter.use(authRequired, requireRole('analista', 'admin'));

modelsRouter.get('/', async (_req, res) => {
  const runs = await prisma.modelRun.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(runs.map(mapModelRun));
});

modelsRouter.get('/active', async (_req, res) => {
  const active = await prisma.modelRun.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } });
  res.json(active ? mapModelRun(active) : null);
});

modelsRouter.post('/:id/activate', async (req, res) => {
  const run = await prisma.modelRun.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Modelo no encontrado' });
  await prisma.modelRun.updateMany({ data: { active: false } });
  const updated = await prisma.modelRun.update({ where: { id: run.id }, data: { active: true } });
  await applyBacktest(updated.version, JSON.parse(updated.backtest || '[]'));
  res.json(mapModelRun(updated));
});

modelsRouter.post('/train', async (req, res) => {
  const algorithm = (req.body?.algorithm as string) || 'rf';
  const { run } = await trainModel(algorithm, {
    excludeEstimated: Boolean(req.body?.excludeEstimated),
    includeTestData: Boolean(req.body?.includeTestData),
  });
  res.status(201).json(mapModelRun(run));
});
