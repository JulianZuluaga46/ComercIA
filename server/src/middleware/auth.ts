import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { prisma } from '../db.js';

const JWT_SECRET: string = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) throw new Error('JWT_SECRET no está definido en server/.env');

export interface AuthPayload {
  userId: string;
  role: Role;
  storeId?: string | null;
  /** Cómo se inició la sesión: contraseña o código enviado por correo */
  method?: 'password' | 'otp';
  /** Segundos epoch de emisión del token (lo agrega jwt) */
  iat?: number;
}

/** Tras entrar con código por correo, se puede fijar una contraseña nueva sin la actual durante este tiempo. */
export const OTP_PASSWORD_RESET_WINDOW_S = 15 * 60;

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign({ method: 'password', ...payload }, JWT_SECRET, { expiresIn: '7d' });
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  let payload: AuthPayload;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload;
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  // El rol, el comercio y el estado se leen de la BD para que los cambios del
  // administrador (desactivar, cambiar rol) apliquen de inmediato (RF-11).
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, storeId: true, status: true },
  });
  if (!user || user.status !== 'Activo') {
    return res.status(401).json({ error: 'La cuenta no está activa' });
  }
  req.auth = { userId: payload.userId, role: user.role, storeId: user.storeId, method: payload.method, iat: payload.iat };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
}
