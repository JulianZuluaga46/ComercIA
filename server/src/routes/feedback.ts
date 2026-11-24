import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { decrypt, encrypt } from '../crypto.js';

/** Evaluación del sistema por sus usuarios (Objetivo 4 y RNF-01). */
export const feedbackRouter = Router();

feedbackRouter.use(authRequired);

const inScale = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;

feedbackRouter.get('/mine', async (req, res) => {
  const f = await prisma.feedback.findUnique({ where: { userId: req.auth!.userId } });
  res.json(f ? { easeOfUse: f.easeOfUse, usefulness: f.usefulness, accuracy: f.accuracy, noHelp: f.noHelp, comment: decrypt(f.comment) ?? '' } : null);
});

feedbackRouter.put('/mine', async (req, res) => {
  const { easeOfUse, usefulness, accuracy, noHelp, comment } = req.body as Record<string, unknown>;
  if (!inScale(easeOfUse) || !inScale(usefulness) || !inScale(accuracy) || typeof noHelp !== 'boolean') {
    return res.status(400).json({ error: 'Responde todas las preguntas' });
  }
  const data = {
    easeOfUse: easeOfUse as number,
    usefulness: usefulness as number,
    accuracy: accuracy as number,
    noHelp,
    comment: encrypt(typeof comment === 'string' ? comment.trim().slice(0, 1000) || null : null),
  };
  await prisma.feedback.upsert({ where: { userId: req.auth!.userId }, create: { userId: req.auth!.userId, ...data }, update: data });
  res.json({ ok: true });
});

/** Resultados agregados. Las cuentas de comercios de prueba no cuentan. */
feedbackRouter.get('/summary', requireRole('admin', 'analista'), async (_req, res) => {
  const rows = await prisma.feedback.findMany({
    where: { user: { role: 'comerciante', OR: [{ store: null }, { store: { isTest: false } }] } },
  });
  const n = rows.length;
  const avg = (k: 'easeOfUse' | 'usefulness' | 'accuracy') =>
    n ? Math.round((rows.reduce((a, r) => a + r[k], 0) / n) * 100) / 100 : null;
  res.json({
    n,
    easeOfUse: avg('easeOfUse'),
    usefulness: avg('usefulness'),
    accuracy: avg('accuracy'),
    noHelpPct: n ? Math.round((rows.filter(r => r.noHelp).length / n) * 100) : null,
    comments: rows.map(r => decrypt(r.comment)).filter(Boolean),
  });
});
