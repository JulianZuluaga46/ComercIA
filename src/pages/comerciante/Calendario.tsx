import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, FLOW_LEVEL_COLORS, FLOW_LEVEL_LABELS } from '../../data/predictions';
import { api, formatDateLocal, predictionWithDate, WEATHER_SOURCE_LABEL } from '../../lib/api';
import { useHistorical, type DayPrediction } from '../../hooks/usePrediction';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function Calendario() {
  const { currentStore } = useApp();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
  const [monthPreds, setMonthPreds] = useState<DayPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    if (!currentStore.id) return;
    const from = formatDateLocal(new Date(year, month, 1));
    const to = formatDateLocal(new Date(year, month, daysInMonth));
    setLoading(true);
    setError(null);
    api
      .predictRange(currentStore.id, from, to)
      .then(list => setMonthPreds(list.map(predictionWithDate)))
      .catch(e => {
        setMonthPreds([]);
        setError(e instanceof Error ? e.message : 'Error');
      })
      .finally(() => setLoading(false));
  }, [currentStore.id, year, month, daysInMonth]);

  // Días ya ocurridos: se muestra también el número real registrado
  const { data: history } = useHistorical(currentStore.id, 730);
  const realByDay = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const map = new Map<number, number>();
    for (const h of history) if (h.date.startsWith(prefix)) map.set(Number(h.date.slice(8)), h.real);
    return map;
  }, [history, year, month]);

  const byDay = useMemo(() => {
    const map = new Map<number, DayPrediction>();
    for (const p of monthPreds) if (p.date.getMonth() === month) map.set(p.date.getDate(), p);
    return map;
  }, [monthPreds, month]);

  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => ({
        day: i + 1,
        pred: byDay.get(i + 1) ?? null,
        real: realByDay.get(i + 1) ?? null,
      })),
    [daysInMonth, byDay, realByDay],
  );

  const selectedPred = selectedDay !== null ? byDay.get(selectedDay) ?? null : null;
  const selectedReal = selectedDay !== null ? realByDay.get(selectedDay) ?? null : null;
  const isToday = (d: number) => year === now.getFullYear() && month === now.getMonth() && d === now.getDate();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Calendario</h1>
        <p className="text-sm text-slate-500">
          Días pasados: clientes reales registrados. Días futuros: flujo esperado (hasta 16 días con pronóstico del clima;
          después, con el promedio histórico de Montería).
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Calculando predicciones del mes…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                if (month === 0) {
                  setMonth(11);
                  setYear(y => y - 1);
                } else setMonth(m => m - 1);
              }}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
            >
              ←
            </button>
            <h2 className="font-semibold text-slate-900">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button
              onClick={() => {
                if (month === 11) {
                  setMonth(0);
                  setYear(y => y + 1);
                } else setMonth(m => m + 1);
              }}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map(({ day, pred, real }) => {
              const isSelected = selectedDay === day;
              const level = pred?.flowLevel ?? 'normal';
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`aspect-square rounded-lg border text-sm flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : isToday(day)
                        ? 'border-blue-300'
                        : 'border-slate-100 hover:border-slate-300'
                  } ${real != null ? 'bg-slate-50' : ''}`}
                >
                  <span className={`font-medium ${isToday(day) ? 'text-blue-700' : 'text-slate-700'}`}>{day}</span>
                  {real != null ? (
                    <span className="text-[10px] font-bold mt-0.5 text-slate-900" title="Clientes reales registrados">
                      ✓{real}
                    </span>
                  ) : (
                    pred && (
                      <span className="text-[10px] font-bold mt-0.5" style={{ color: FLOW_LEVEL_COLORS[level] }}>
                        {pred.clients}
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-500">
            <span><strong className="text-slate-900">✓14</strong> clientes reales registrados</span>
            <span><strong style={{ color: FLOW_LEVEL_COLORS.normal }}>14</strong> predicción (color = nivel de flujo)</span>
          </div>
        </div>

        <Card>
          {selectedPred ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {selectedDay} de {MONTH_NAMES[month]}
                </h3>
                <Badge
                  variant={
                    selectedPred.flowLevel === 'normal'
                      ? 'success'
                      : selectedPred.flowLevel === 'bajo'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {FLOW_LEVEL_LABELS[selectedPred.flowLevel]}
                </Badge>
              </div>
              {selectedReal != null ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-500">Clientes reales</div>
                    <div className="text-3xl font-bold text-slate-900">{selectedReal}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Predicción del modelo</div>
                    <div className="text-3xl font-bold text-blue-700">{selectedPred.clients}</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-4xl font-bold text-slate-900">{selectedPred.clients}</div>
                  <p className="text-sm text-slate-500">
                    Rango: {selectedPred.clientsMin}–{selectedPred.clientsMax} clientes
                  </p>
                </>
              )}
              <p className="text-sm text-slate-600">
                {selectedPred.condition} · {selectedPred.temperature}°C · {selectedPred.precipitation} mm
              </p>
              <p className="text-xs text-slate-400">{WEATHER_SOURCE_LABEL[selectedPred.weatherSource]}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedPred.isQuincena && <Badge variant="info">Quincena</Badge>}
                {selectedPred.isHoliday && <Badge variant="warning">{selectedPred.holidayName}</Badge>}
                {selectedPred.event && <Badge variant="info">{selectedPred.event}</Badge>}
              </div>
              <p className="text-xs text-slate-400">{selectedPred.confidenceLabel} ({selectedPred.confidence}%)</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Selecciona un día del calendario.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
