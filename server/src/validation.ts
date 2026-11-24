import { randomBytes } from 'node:crypto';

export const CATEGORIES = [
  'Variedades',
  'Ropa y calzado',
  'Farmacia',
  'Alimentos',
  'Restaurante',
  'Ferretería',
  'Papelería',
  'Tecnología',
  'Textilería',
];

/** Devuelve un mensaje de error o null si la contraseña es aceptable. */
export function passwordError(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe incluir letras y números';
  return null;
}

export function emailValid(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Contraseña temporal legible (sin caracteres ambiguos) que cumple la política. */
export function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 8; i++) out += letters[bytes[i] % letters.length];
  out += digits[bytes[8] % digits.length] + digits[bytes[9] % digits.length];
  return out;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
