import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { mapStoreToApi } from '../storeMapper.js';
import { defaultThresholds } from '../forecast.js';
import { encrypt } from '../crypto.js';
import { CATEGORIES, slugify } from '../validation.js';
import { generateAlerts } from '../jobs.js';

export const storesRouter = Router();

storesRouter.use(authRequired);

type StoreBody = {
  name?: string;
  category?: string;
  address?: string;
  employees?: number;
  yearsInBusiness?: number;
  avgDailyClients?: number;
  description?: string;
};

/** Valida los campos presentes; devuelve un mensaje de error o null. */
function invalid(b: StoreBody): string | null {
  if (b.name !== undefined && !b.name.trim()) return 'El nombre no puede estar vacío';
  if (b.category !== undefined && !CATEGORIES.includes(b.category)) return 'Categoría inválida';
  for (const k of ['employees', 'yearsInBusiness', 'avgDailyClients'] as const) {
    if (b[k] != null && (!Number.isFinite(Number(b[k])) || Number(b[k]) < 0)) return `${k} debe ser un número ≥ 0`;
  }
  return null;
}

storesRouter.get('/', async (req, res) => {
  const { role, storeId } = req.auth!;
  if (role === 'comerciante') {
    const store = storeId ? await prisma.store.findUnique({ where: { id: storeId } }) : null;
    return res.json(store ? [mapStoreToApi(store)] : []);
  }
  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } });
  res.json(stores.map(mapStoreToApi));
});

storesRouter.patch('/:id', async (req, res) => {
  const id = req.params.id;
  const { role, storeId } = req.auth!;
  const allowed = role === 'admin' || (role === 'comerciante' && storeId === id);
  if (!allowed) return res.status(403).json({ error: 'Acceso denegado' });
  const b = req.body as StoreBody;
  const err = invalid(b);
  if (err) return res.status(400).json({ error: err });
  const store = await prisma.store.update({
    where: { id },
    data: {
      ...(b.name ? { name: b.name.trim() } : {}),
      ...(b.category ? { category: b.category } : {}),
      ...(b.address ? { address: encrypt(b.address.trim()) } : {}),
      ...(b.employees != null ? { employees: Math.round(Number(b.employees)) } : {}),
      ...(b.yearsInBusiness != null ? { yearsInBusiness: Math.round(Number(b.yearsInBusiness)) } : {}),
      ...(b.avgDailyClients != null ? { avgDailyClients: Math.max(1, Math.round(Number(b.avgDailyClients))) } : {}),
      ...(b.description != null ? { description: encrypt(b.description.trim()) } : {}),
    },
  });
  res.json(mapStoreToApi(store));
});

storesRouter.get('/:id', async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.id } });
  if (!store) return res.status(404).json({ error: 'Comercio no encontrado' });
  if (req.auth!.role === 'comerciante' && req.auth!.storeId !== store.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  res.json(mapStoreToApi(store));
});

storesRouter.post('/', requireRole('admin'), async (req, res) => {
  const b = req.body as StoreBody;
  if (!b.name?.trim() || !b.category) {
    return res.status(400).json({ error: 'Nombre y categoría requeridos' });
  }
  const err = invalid(b);
  if (err) return res.status(400).json({ error: err });
  let id = slugify(b.name);
  if (await prisma.store.findUnique({ where: { id } })) id = `${id}-${Date.now().toString(36)}`;
  const store = await prisma.store.create({
    data: {
      id,
      name: b.name.trim(),
      category: b.category,
      address: encrypt(b.address?.trim() || 'Centro, Montería'),
      lat: 8.757,
      lng: -75.887,
      mapX: 50,
      mapY: 50,
      employees: Math.round(Number(b.employees) || 0),
      yearsInBusiness: Math.round(Number(b.yearsInBusiness) || 0),
      avgDailyClients: Math.max(1, Math.round(Number(b.avgDailyClients) || 15)),
      sensitivityFactors: JSON.stringify(['quincena', 'fin de semana']),
      description: encrypt(b.description?.trim() || ''),
      // Lo crea el administrador: queda activo de inmediato.
      status: 'Activo',
    },
  });
  await prisma.alertSettings.create({ data: { storeId: store.id, ...defaultThresholds(store.avgDailyClients) } });
  res.status(201).json(mapStoreToApi(store));
});

storesRouter.patch('/:id/status', requireRole('admin'), async (req, res) => {
  const { status } = req.body as { status?: 'Activo' | 'Pendiente' | 'Inactivo' };
  if (!status || !['Activo', 'Pendiente', 'Inactivo'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const store = await prisma.store.update({ where: { id: req.params.id }, data: { status } });
  if (status === 'Activo') {
    const owners = await prisma.user.findMany({ where: { storeId: store.id } });
    await prisma.notification.createMany({
      data: owners.map(u => ({
        userId: u.id,
        type: 'success',
        title: 'Comercio aprobado',
        message: `${store.name} fue aprobado por el administrador. Ya puedes cargar datos y consultar predicciones.`,
      })),
    });
    void generateAlerts(store.id).catch(() => {});
  }
  res.json(mapStoreToApi(store));
});
