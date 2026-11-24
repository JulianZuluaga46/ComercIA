import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { randomInt } from 'node:crypto';
import { authRequired, OTP_PASSWORD_RESET_WINDOW_S, signToken } from '../middleware/auth.js';
import { loginCodeEmail, sendMail } from '../mailer.js';
import { mapUser } from '../userMapper.js';
import { defaultThresholds } from '../forecast.js';
import { encrypt } from '../crypto.js';
import { CATEGORIES, emailValid, passwordError, slugify } from '../validation.js';

export const authRouter = Router();

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/** Configuraci\u00f3n inicial: solo disponible mientras no exista ning\u00fan administrador. */
const hasAdmin = async () => (await prisma.user.count({ where: { role: 'admin' } })) > 0;

authRouter.get('/setup', async (_req, res) => {
  res.json({ needsSetup: !(await hasAdmin()) });
});

authRouter.post('/setup', async (req, res) => {
  if (await hasAdmin()) {
    return res.status(409).json({ error: 'El sistema ya fue configurado' });
  }
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  if (!emailValid(email)) return res.status(400).json({ error: 'Correo electr\u00f3nico inv\u00e1lido' });
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })) {
    return res.status(409).json({ error: 'Ese correo ya pertenece a otra cuenta' });
  }
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(password!, 10),
      role: 'admin',
      status: 'Activo',
      lastLoginAt: new Date(),
      settings: { create: {} },
    },
    include: { store: true },
  });
  const token = signToken({ userId: user.id, role: user.role, storeId: null });
  res.status(201).json({ token, user: mapUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { store: true } });
  if (!user || user.status === 'Inactivo') {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(423).json({
      error: `Cuenta bloqueada temporalmente por ${MAX_FAILED_LOGINS} intentos fallidos. Intente de nuevo en ${mins} min.`,
    });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
        : { failedLogins: failed },
    });
    if (lock) {
      return res.status(423).json({
        error: `Cuenta bloqueada por ${LOCK_MINUTES} minutos tras ${MAX_FAILED_LOGINS} intentos fallidos.`,
      });
    }
    return res.status(401).json({
      error: `Credenciales incorrectas. Le quedan ${MAX_FAILED_LOGINS - failed} intento(s) antes del bloqueo.`,
    });
  }
  if (user.status === 'Pendiente') {
    return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación del administrador.' });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null },
  });
  const token = signToken({ userId: user.id, role: user.role, storeId: user.storeId });
  res.json({ token, user: mapUser(user) });
});

// ── Inicio de sesión con código enviado por correo ────────────────────────────
const CODE_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_SECONDS = 60;
const GENERIC_SENT = 'Si el correo está registrado, te enviamos un código de 6 dígitos. Revisa tu bandeja de entrada y spam.';

authRouter.post('/otp/request', async (req, res) => {
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  if (!emailValid(email)) return res.status(400).json({ error: 'Correo electrónico inválido' });
  const user = await prisma.user.findUnique({ where: { email } });
  // Respuesta idéntica exista o no la cuenta, para no revelar qué correos están registrados.
  if (!user || user.status === 'Inactivo') return res.json({ message: GENERIC_SENT });
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(423).json({ error: `Cuenta bloqueada temporalmente. Intente de nuevo en ${mins} min.` });
  }
  const recent = await prisma.loginCode.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - CODE_RESEND_SECONDS * 1000) } },
  });
  if (recent) {
    return res.status(429).json({ error: `Espera ${CODE_RESEND_SECONDS} segundos antes de pedir otro código.` });
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  // Un solo código vigente por usuario
  await prisma.loginCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.loginCode.create({
    data: { userId: user.id, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + CODE_MINUTES * 60000) },
  });
  const mail = loginCodeEmail(user.name, code, CODE_MINUTES);
  await sendMail(user.email, mail.subject, mail.text, mail.html);
  res.json({ message: GENERIC_SENT });
});

authRouter.post('/otp/verify', async (req, res) => {
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  const code = String(req.body?.code ?? '').trim();
  const invalid = () => res.status(401).json({ error: 'Código incorrecto o vencido. Solicita uno nuevo.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'El código tiene 6 dígitos' });
  const user = await prisma.user.findUnique({ where: { email }, include: { store: true } });
  if (!user || user.status === 'Inactivo') return invalid();
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(423).json({ error: 'Cuenta bloqueada temporalmente por intentos fallidos.' });
  }
  const login = await prisma.loginCode.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!login || login.attempts >= CODE_MAX_ATTEMPTS) return invalid();
  if (!(await bcrypt.compare(code, login.codeHash))) {
    const attempts = login.attempts + 1;
    await prisma.loginCode.update({
      where: { id: login.id },
      data: { attempts, ...(attempts >= CODE_MAX_ATTEMPTS ? { usedAt: new Date() } : {}) },
    });
    const left = CODE_MAX_ATTEMPTS - attempts;
    return res.status(401).json({
      error: left > 0 ? `Código incorrecto. Te quedan ${left} intento(s).` : 'Demasiados intentos. Solicita un código nuevo.',
    });
  }
  if (user.status === 'Pendiente') {
    return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación del administrador.' });
  }
  await prisma.loginCode.update({ where: { id: login.id }, data: { usedAt: new Date() } });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null },
  });
  const token = signToken({ userId: user.id, role: user.role, storeId: user.storeId, method: 'otp' });
  res.json({ token, user: mapUser(user), method: 'otp' });
});

authRouter.post('/register', async (req, res) => {
  const body = req.body as {
    email?: string;
    password?: string;
    name?: string;
    phone?: string;
    store?: {
      name: string;
      category: string;
      address: string;
      employees: number;
      yearsInBusiness: number;
      avgDailyClients: number;
      description?: string;
      lat?: number;
      lng?: number;
      mapX?: number;
      mapY?: number;
    };
  };
  if (!body.email || !body.password || !body.name?.trim() || !body.store?.name?.trim()) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  if (!emailValid(body.email)) return res.status(400).json({ error: 'Correo electrónico inválido' });
  const pwErr = passwordError(body.password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (!CATEGORIES.includes(body.store.category)) return res.status(400).json({ error: 'Categoría inválida' });
  const nums = [body.store.employees, body.store.yearsInBusiness, body.store.avgDailyClients].map(Number);
  if (nums.some(n => !Number.isFinite(n) || n < 0)) {
    return res.status(400).json({ error: 'Empleados, antigüedad y clientes diarios deben ser números ≥ 0' });
  }
  const email = body.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'El correo ya está registrado' });
  }

  let storeId = slugify(body.store.name);
  const taken = await prisma.store.findUnique({ where: { id: storeId } });
  if (taken) storeId = `${storeId}-${Date.now().toString(36)}`;

  const passwordHash = await bcrypt.hash(body.password, 10);
  const store = await prisma.store.create({
    data: {
      id: storeId,
      name: body.store.name.trim(),
      category: body.store.category,
      address: encrypt(body.store.address?.trim() || 'Centro, Montería'),
      lat: body.store.lat ?? 8.757,
      lng: body.store.lng ?? -75.887,
      mapX: body.store.mapX ?? 45,
      mapY: body.store.mapY ?? 45,
      employees: Math.round(nums[0]),
      yearsInBusiness: Math.round(nums[1]),
      avgDailyClients: Math.max(1, Math.round(nums[2])),
      sensitivityFactors: JSON.stringify(['quincena', 'fin de semana']),
      description: encrypt(body.store.description?.trim() || ''),
      dataRecords: 0,
      status: 'Pendiente',
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: body.name.trim(),
      phone: encrypt(body.phone?.trim() || ''),
      role: 'comerciante',
      status: 'Activo',
      storeId: store.id,
      settings: { create: {} },
    },
    include: { store: true },
  });

  await prisma.alertSettings.create({ data: { storeId: store.id, ...defaultThresholds(store.avgDailyClients) } });

  const admins = await prisma.user.findMany({ where: { role: 'admin' } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map(a => ({
        userId: a.id,
        type: 'info',
        title: 'Nuevo comercio registrado',
        message: `${store.name} (${email}) quedó pendiente de revisión.`,
      })),
    });
  }

  const token = signToken({ userId: user.id, role: user.role, storeId: store.id });
  res.status(201).json({ token, user: mapUser(user) });
});

authRouter.patch('/me', authRequired, async (req, res) => {
  const { name, phone } = req.body as { name?: string; phone?: string };
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(phone !== undefined ? { phone: encrypt(phone.trim()) } : {}),
    },
    include: { store: true },
  });
  res.json(mapUser(user));
});

authRouter.post('/password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  // Recién entró con código por correo: puede fijar contraseña sin la actual (olvidó la contraseña).
  const viaOtp =
    req.auth!.method === 'otp' &&
    !!req.auth!.iat &&
    Date.now() / 1000 - req.auth!.iat < OTP_PASSWORD_RESET_WINDOW_S;
  if (!newPassword || (!currentPassword && !viaOtp)) {
    return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
  }
  const pwErr = passwordError(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (currentPassword && newPassword === currentPassword) {
    return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!viaOtp || currentPassword) {
    const ok = await bcrypt.compare(currentPassword ?? '', user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
  });
  res.json({ ok: true });
});

authRouter.get('/me', authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { store: true },
  });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const otpWindow =
    req.auth!.method === 'otp' && !!req.auth!.iat && Date.now() / 1000 - req.auth!.iat < OTP_PASSWORD_RESET_WINDOW_S;
  res.json({ ...mapUser(user), canResetPasswordWithoutCurrent: otpWindow });
});
