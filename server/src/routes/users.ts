import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { decrypt, encrypt } from '../crypto.js';
import { emailValid, passwordError, temporaryPassword } from '../validation.js';
import { generateAlerts } from '../jobs.js';

export const usersRouter = Router();

usersRouter.use(authRequired, requireRole('admin'));

function formatLastAccess(d: Date | null): string {
  if (!d) return '—';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) {
    return `Hoy, ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diff < 172800000) {
    return `Ayer, ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
  }
  const days = Math.floor(diff / 86400000);
  return `hace ${days} días`;
}

const ROLE_LABEL: Record<string, string> = {
  comerciante: 'Comerciante',
  admin: 'Administrador',
  analista: 'Analista',
};

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { store: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(
    users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: ROLE_LABEL[u.role] || u.role,
      status: u.status,
      lastAccess: formatLastAccess(u.lastLoginAt),
      store: u.store?.name ?? '—',
      storeId: u.storeId,
      phone: decrypt(u.phone) || '',
      roleKey: u.role,
      locked: !!u.lockedUntil && u.lockedUntil > new Date(),
    })),
  );
});

usersRouter.patch('/:id/status', async (req, res) => {
  const { status } = req.body as { status?: 'Activo' | 'Pendiente' | 'Inactivo' };
  if (!status || !['Activo', 'Pendiente', 'Inactivo'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  if (req.params.id === req.auth!.userId && status !== 'Activo') {
    return res.status(400).json({ error: 'No puede desactivar su propia cuenta' });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    // Activar también desbloquea una cuenta bloqueada por intentos fallidos.
    data: { status, ...(status === 'Activo' ? { failedLogins: 0, lockedUntil: null } : {}) },
  });
  res.json({ id: user.id, status: user.status });
});

usersRouter.patch('/:id', async (req, res) => {
  const { name, role, storeId, phone } = req.body as {
    name?: string;
    role?: 'comerciante' | 'admin' | 'analista';
    storeId?: string | null;
    phone?: string;
  };
  if (role && !['comerciante', 'admin', 'analista'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  if (req.params.id === req.auth!.userId && role && role !== 'admin') {
    return res.status(400).json({ error: 'No puede quitarse a sí mismo el rol de administrador' });
  }
  if (storeId && !(await prisma.store.findUnique({ where: { id: storeId } }))) {
    return res.status(400).json({ error: 'Comercio no encontrado' });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(role ? { role } : {}),
      ...(storeId !== undefined ? { storeId: storeId || null } : {}),
      ...(phone !== undefined ? { phone: encrypt(phone.trim()) } : {}),
    },
  });
  res.json({ id: user.id, name: user.name, role: user.role, storeId: user.storeId });
});

/** "¿Olvidaste tu contraseña?": el administrador genera una temporal que se debe cambiar al entrar. */
usersRouter.post('/:id/reset-password', async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  const temporary = temporaryPassword();
  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await bcrypt.hash(temporary, 10),
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: null,
    },
  });
  res.json({ temporaryPassword: temporary });
});

usersRouter.post('/', async (req, res) => {
  const { email, password, name, role, storeId } = req.body as {
    email?: string;
    password?: string;
    name?: string;
    role?: 'comerciante' | 'admin' | 'analista';
    storeId?: string;
  };
  if (!email || !password || !name?.trim() || !role) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  if (!emailValid(email)) return res.status(400).json({ error: 'Correo electrónico inválido' });
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (role === 'comerciante' && !storeId) {
    return res.status(400).json({ error: 'Un comerciante debe estar asociado a un comercio' });
  }
  if (!['comerciante', 'admin', 'analista'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'El correo ya está registrado' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      role,
      status: 'Activo',
      storeId: storeId || null,
      settings: { create: {} },
    },
  });
  // El comerciante recibe de inmediato las alertas de su semana (sin esperar al ciclo de 6 h).
  if (user.storeId) void generateAlerts(user.storeId).catch(() => {});
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});
