/** Fechas legibles en español a partir de 'YYYY-MM-DD' o Date. */
function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "sáb 24 oct" */
export function fmtShort(d: string | Date): string {
  return toDate(d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
}

/** "Sábado 24 de octubre" */
export function fmtLong(d: string | Date): string {
  return capitalize(toDate(d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));
}

/** "Sábado 24 de octubre de 2026" */
export function fmtFull(d: string | Date): string {
  return `${fmtLong(d)} de ${toDate(d).getFullYear()}`;
}

/** Primera letra en minúscula, para fechas a mitad de frase ("el martes 13 de octubre") */
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "sábado 24 de octubre, 3:45 p. m." a partir de un instante ISO (para usar a mitad de frase) */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${lowerFirst(fmtLong(d))}, ${d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`;
}

/** "hace 5 minutos", "hace 3 horas", "hace 2 días" */
export function fmtAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'hace unos segundos';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

/** "1,3" con coma decimal */
export function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: decimals });
}

/** "+1,3" / "−1,3" */
export function fmtSigned(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`;
}
