import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, LineChart, Line, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, DAY_NAMES_FULL, MONTH_NAMES, FLOW_LEVEL_COLORS, FLOW_LEVEL_LABELS } from '../../data/predictions';
import { useDayPrediction, useWeekPrediction, type DayPrediction } from '../../hooks/usePrediction';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { api, formatDateLocal, predictionWithDate, WEATHER_SOURCE_LABEL } from '../../lib/api';

const MAX_RANGE_DAYS = 62;

export function Prediccion() {
  const { currentStore, selectedDate, setSelectedDate } = useApp();
  const [view, setView] = useState<'day' | 'range'>('day');

  const weekStart = useMemo(() => new Date(), []);
  const { data: today, loading: loadingDay, error } = useDayPrediction(currentStore.id, selectedDate);
  const { data: week, loading: loadingWeek } = useWeekPrediction(currentStore.id, weekStart);

  // RF-08: filtro por rango de fechas
  const [range, setRange] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 13);
    return { from: formatDateLocal(new Date()), to: formatDateLocal(end) };
  });
  const [rangeData, setRangeData] = useState<DayPrediction[]>([]);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  useEffect(() => {
    if (view !== 'range' || !currentStore.id) return;
    const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000 + 1;
    if (!(days >= 1)) return setRangeError('La fecha final debe ser igual o posterior a la inicial.');
    if (days > MAX_RANGE_DAYS) return setRangeError(`El rango máximo es de ${MAX_RANGE_DAYS} días.`);
    setRangeError(null);
    setRangeLoading(true);
    api
      .predictRange(currentStore.id, range.from, range.to)
      .then(list => setRangeData(list.map(predictionWithDate)))
      .catch(e => setRangeError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setRangeLoading(false));
  }, [view, range.from, range.to, currentStore.id]);

  if (error) {
    return <div className="max-w-xl mx-auto text-center py-20 text-slate-600">{error}</div>;
  }
  if (loadingDay || loadingWeek || !today) {
    return <div className="text-center py-20 text-slate-500">Cargando predicciones…</div>;
  }
  const weatherIcon = (p: { condition: string; precipitation: number }) =>
    p.condition.includes('tormenta') ? '⛈' : p.precipitation >= 1 ? '🌧' : p.condition.includes('ublado') ? '⛅' : '☀️';
  const minDate = formatDate(new Date(new Date().getFullYear() - 1, 0, 1));
  const maxDate = formatDate(new Date(new Date().getFullYear() + 1, 11, 31));

  const rangeChart = rangeData.map(d => ({
    day: `${DAY_NAMES[d.date.getDay()]} ${d.date.getDate()}/${d.date.getMonth() + 1}`,
    prediccion: d.clients,
    min: d.clientsMin,
    max: d.clientsMax,
    promedio: currentStore.avgDailyClients,
  }));

  const chartData = week.map(d => ({
    day: DAY_NAMES[d.date.getDay()],
    prediccion: d.clients,
    min: d.clientsMin,
    max: d.clientsMax,
    promedio: currentStore.avgDailyClients,
    nivel: d.flowLevel,
  }));

  const dayLabel = `${DAY_NAMES_FULL[selectedDate.getDay()]} ${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]} de ${selectedDate.getFullYear()}`;

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const [year, month, day] = e.target.value.split('-').map(Number);
    setSelectedDate(new Date(year, month - 1, day));
  }

  function formatDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const positiveFactors = today.factors.filter(f => f.type === 'positive');
  const negativeFactors = today.factors.filter(f => f.type === 'negative');
  const baseClients = currentStore.avgDailyClients;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Predicción de clientes</h1>
        <p className="text-sm text-slate-500">
          Estimación del modelo {today.modelVersion} con el histórico del comercio, el calendario colombiano y el clima de Montería.
        </p>
      </div>

      {today.dataWarning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">⚠️ {today.dataWarning}</div>
      )}

      {/* Date selector & View toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex border border-slate-200 rounded-lg overflow-hidden w-fit">
          <button
            onClick={() => setView('day')}
            className={`px-4 py-2 text-sm font-medium transition-all ${view === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Un día
          </button>
          <button
            onClick={() => setView('range')}
            className={`px-4 py-2 text-sm font-medium transition-all ${view === 'range' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Rango de fechas
          </button>
        </div>
        {view === 'day' ? (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-slate-700">Fecha</label>
            <input
              type="date"
              value={formatDate(selectedDate)}
              onChange={handleDateChange}
              min={minDate}
              max={maxDate}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-500">{dayLabel}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <label className="font-medium text-slate-700">Desde</label>
            <input type="date" value={range.from} min={minDate} max={maxDate} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <label className="font-medium text-slate-700">hasta</label>
            <input type="date" value={range.to} min={minDate} max={maxDate} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-slate-400">máx. {MAX_RANGE_DAYS} días</span>
          </div>
        )}
      </div>

      {view === 'day' ? (
        <>
          {/* Main prediction card */}
          <Card>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <p className="text-slate-500 text-sm mb-1">Se esperan aproximadamente</p>
                <div className="flex items-end gap-3">
                  <span className="text-6xl font-extrabold text-slate-900">{today.clients}</span>
                  <div className="pb-2">
                    <div className="text-lg font-semibold text-slate-700">clientes</div>
                    <div className="text-sm text-slate-500">Rango: {today.clientsMin} – {today.clientsMax}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <span
                    className="px-3 py-1 rounded-full text-sm font-semibold"
                    style={{ backgroundColor: `${FLOW_LEVEL_COLORS[today.flowLevel]}15`, color: FLOW_LEVEL_COLORS[today.flowLevel] }}
                  >
                    {FLOW_LEVEL_LABELS[today.flowLevel]}
                  </span>
                  <Badge variant={today.confidence >= 80 ? 'success' : 'warning'}>
                    {today.confidenceLabel} · {today.confidence}%
                  </Badge>
                  <span className="text-xs text-slate-400">{WEATHER_SOURCE_LABEL[today.weatherSource]}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 min-w-48">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-500 mb-1">Clima esperado</div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{weatherIcon(today)}</span>
                    <div>
                      <div className="font-semibold text-slate-900">{today.temperature}°C · mín. {today.temperatureMin}°C</div>
                      <div className="text-xs text-slate-500">{today.condition}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-600">
                    <span>💧 Lluvia: {today.precipitation} mm</span>
                    <span>🌫 Humedad: {today.humidity}%</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={today.isQuincena ? 'info' : 'default'}>
                    {today.isQuincena ? 'QUINCENA' : 'NO QUINCENA'}
                  </Badge>
                  <Badge variant={today.isHoliday ? 'warning' : 'default'}>
                    {today.isHoliday ? `🎉 ${today.holidayName}` : 'NO FESTIVO'}
                  </Badge>
                  <Badge variant="default">{today.isSeason.toUpperCase()}</Badge>
                  {today.event && <Badge variant="info">{today.event}</Badge>}
                  {today.schoolBreak && <Badge variant="info">RECESO ESCOLAR</Badge>}
                </div>
              </div>
            </div>

            {/* Confidence bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Confianza del modelo</span>
                <span>{today.confidence}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${today.confidence >= 80 ? 'bg-green-500' : today.confidence >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${today.confidence}%` }}
                />
              </div>
            </div>
          </Card>

          {/* Explanation */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <h2 className="font-semibold text-slate-900 mb-4">¿Por qué el sistema espera {today.clients} clientes?</h2>
              <p className="text-xs text-slate-500 mb-4">
                Cada número indica cuántos clientes cambiaría la predicción si ese factor no estuviera presente (para el día de la
                semana, frente a un día promedio).
              </p>

              <div className="space-y-3">
                {positiveFactors.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Impacto positivo</div>
                    {positiveFactors.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 mb-2">
                        <span className="text-green-600 font-bold text-sm w-8 text-right">+{f.impact}</span>
                        <div className="flex-1">
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min(100, f.impact * 12)}%` }} />
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">{f.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {negativeFactors.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Impacto negativo</div>
                    {negativeFactors.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 mb-2">
                        <span className="text-red-500 font-bold text-sm w-8 text-right">−{Math.abs(f.impact)}</span>
                        <div className="flex-1">
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min(100, Math.abs(f.impact) * 12)}%` }} />
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">{f.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 font-mono text-xs space-y-1 text-slate-700">
                <div className="flex justify-between"><span>Promedio histórico del comercio:</span><span>{baseClients} clientes</span></div>
                <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1"><span>Predicción del modelo:</span><span>{today.clients} clientes</span></div>
              </div>
            </Card>

            {/* Week chart */}
            <Card>
              <h2 className="font-semibold text-slate-900 mb-1">Esta semana</h2>
              <p className="text-xs text-slate-500 mb-3">Predicción vs promedio histórico</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ left: -20, right: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, n: any) => [v, n === 'prediccion' ? 'Predicción' : 'Promedio']}
                  />
                  <ReferenceLine y={currentStore.avgDailyClients} stroke="#94a3b8" strokeDasharray="4 2" />
                  <Bar dataKey="prediccion" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      ) : (
        /* Vista por rango (RF-08) */
        <div className="space-y-4">
          {rangeError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{rangeError}</div>}
          {rangeLoading && <p className="text-sm text-slate-500">Calculando predicciones…</p>}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Predicción del {range.from} al {range.to}</h2>
            <p className="text-xs text-slate-500 mb-4">
              Línea azul: clientes previstos · punteada: promedio histórico. Más allá de 16 días el clima es el promedio histórico.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rangeChart} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                <Legend formatter={(v) => v === 'promedio' ? 'Promedio histórico' : 'Predicción'} />
                <Line type="monotone" dataKey="promedio" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                <Line type="monotone" dataKey="prediccion" stroke="#2563eb" strokeWidth={2.5} dot={{ fill: '#2563eb', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            {rangeData.map((d, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
                <div className="w-24 flex-shrink-0">
                  <div className="font-semibold text-slate-900">{DAY_NAMES_FULL[d.date.getDay()]}</div>
                  <div className="text-xs text-slate-500">{d.date.getDate()} {MONTH_NAMES[d.date.getMonth()].slice(0, 3)}.</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-slate-900">{d.clients}</span>
                    <span className="text-slate-500 text-sm">clientes</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm text-slate-500">Rango: {d.clientsMin}–{d.clientsMax}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className="text-sm" title={`${d.condition} · ${d.precipitation} mm`}>{weatherIcon(d)}</span>
                  <span className="text-sm text-slate-600">{d.temperature}°C</span>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${FLOW_LEVEL_COLORS[d.flowLevel]}15`, color: FLOW_LEVEL_COLORS[d.flowLevel] }}
                  >
                    {FLOW_LEVEL_LABELS[d.flowLevel]}
                  </span>
                  {d.isQuincena && <Badge variant="info" size="sm">Quincena</Badge>}
                  {d.isHoliday && <Badge variant="warning" size="sm">Festivo</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
