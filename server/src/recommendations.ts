/** Recomendaciones operativas a partir de una predicción (el sistema solo recomienda, no ejecuta). */
import type { DayPredictionDto } from './forecast.js';

export function recommendationsFor(p: DayPredictionDto): string[] {
  const out: string[] = [];
  const top = p.factors.filter(f => f.type === 'positive').slice(0, 2).map(f => f.name.toLowerCase());
  const why = top.length ? ` (${top.join(', ')})` : '';
  switch (p.flowLevel) {
    case 'crítico':
      out.push(`Flujo muy alto previsto: ${p.clients} clientes${why}. Refuerce personal y verifique inventario de los productos de mayor rotación.`);
      break;
    case 'alto':
      out.push(`Flujo alto previsto: ${p.clients} clientes${why}. Asegure inventario suficiente y considere apoyo adicional en horas pico.`);
      break;
    case 'bajo':
      out.push(`Flujo bajo previsto: ${p.clients} clientes. Buen día para reorganizar inventario, hacer pedidos o lanzar una promoción.`);
      break;
    default:
      out.push(`Flujo normal previsto: ${p.clients} clientes. Opere con el personal y el inventario habituales.`);
  }
  if (p.isQuincena) out.push('Día de pago de quincena: históricamente aumenta el poder de compra.');
  if (p.isHoliday) out.push(`Festivo (${p.holidayName}): revise su horario de atención.`);
  if (p.event) out.push(`${p.event}: fecha de consumo especial.`);
  if (p.precipitation >= 10) out.push(`Se prevén lluvias fuertes (${p.precipitation} mm): puede reducir la afluencia peatonal.`);
  if (p.confidence < 65) out.push('Confianza baja: tome esta predicción como referencia y registre el flujo real para mejorar el modelo.');
  return out;
}
