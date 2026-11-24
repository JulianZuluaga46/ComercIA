import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired } from '../middleware/auth.js';

export const settingsRouter = Router();

settingsRouter.use(authRequired);

async function getOrCreate(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

settingsRouter.get('/', async (req, res) => {
  const s = await getOrCreate(req.auth!.userId);
  res.json({
    emailNotif: s.emailNotif,
    smsNotif: s.smsNotif,
    pushNotif: s.pushNotif,
    weeklyReport: s.weeklyReport,
    monthlyReport: s.monthlyReport,
  });
});

settingsRouter.put('/', async (req, res) => {
  const { emailNotif, smsNotif, pushNotif, weeklyReport, monthlyReport } = req.body as Record<
    string,
    boolean
  >;
  const s = await prisma.userSettings.upsert({
    where: { userId: req.auth!.userId },
    create: {
      userId: req.auth!.userId,
      emailNotif: emailNotif ?? true,
      smsNotif: smsNotif ?? false,
      pushNotif: pushNotif ?? true,
      weeklyReport: weeklyReport ?? true,
      monthlyReport: monthlyReport ?? true,
    },
    update: {
      ...(typeof emailNotif === 'boolean' ? { emailNotif } : {}),
      ...(typeof smsNotif === 'boolean' ? { smsNotif } : {}),
      ...(typeof pushNotif === 'boolean' ? { pushNotif } : {}),
      ...(typeof weeklyReport === 'boolean' ? { weeklyReport } : {}),
      ...(typeof monthlyReport === 'boolean' ? { monthlyReport } : {}),
    },
  });
  res.json({
    emailNotif: s.emailNotif,
    smsNotif: s.smsNotif,
    pushNotif: s.pushNotif,
    weeklyReport: s.weeklyReport,
    monthlyReport: s.monthlyReport,
  });
});
