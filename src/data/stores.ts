export type StoreCategory =
  | 'Variedades'
  | 'Ropa y calzado'
  | 'Farmacia'
  | 'Alimentos'
  | 'Restaurante'
  | 'Ferretería'
  | 'Papelería'
  | 'Tecnología'
  | 'Textilería';

export interface Store {
  id: string;
  name: string;
  category: StoreCategory;
  address: string;
  location: { lat: number; lng: number; x: number; y: number };
  employees: number;
  yearsInBusiness: number;
  avgDailyClients: number;
  sensitivityFactors: string[];
  description: string;
  dataRecords: number;
  status: 'Activo' | 'Pendiente' | 'Inactivo';
  isTest: boolean;
}

/** Nombre para mostrar; los comercios de prueba ya traen "(PRUEBA)" en el nombre. */
export function storeLabel(s: Pick<Store, 'name' | 'isTest'>): string {
  return s.isTest && !s.name.includes('PRUEBA') ? `${s.name} (PRUEBA)` : s.name;
}

/** Mismas reglas que el servidor (server/src/validation.ts). */
export function passwordError(pw: string): string | null {
  if (pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe incluir letras y números';
  return null;
}

/** Categorías tomadas del diagnóstico (encuesta a 31 comercios del centro). */
export const CATEGORIES: StoreCategory[] = [
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
