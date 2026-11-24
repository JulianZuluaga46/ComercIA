/** Constantes de UI para predicciones (lógica en el servidor API). */

export const FLOW_LEVEL_COLORS = {
  // Azul: un día flojo no es una emergencia; rojo solo para el flujo crítico.
  bajo: '#0284c7',
  normal: '#16a34a',
  alto: '#d97706',
  crítico: '#dc2626',
};

export const FLOW_LEVEL_LABELS = {
  bajo: 'Flujo bajo',
  normal: 'Flujo normal',
  alto: 'Flujo alto',
  crítico: 'Flujo crítico',
};

export const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
