import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired } from '../middleware/auth.js';

export const notificationsRouter = Router();

notificationsRouter.use(authRequired);

notificationsRouter.get('/', async (req, res) => {
  const list = await prisma.notification.findMany({
    where: { userId: req.auth!.userId, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(
    list.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  );
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  const n = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId },
  });
  if (!n) return res.status(404).json({ error: 'Notificación no encontrada' });
  const updated = await prisma.notification.update({
    where: { id: n.id },
    data: { read: true },
  });
  res.json({ id: updated.id, read: updated.read });
});

notificationsRouter.patch('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.auth!.userId, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});
