import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, formatDateLocal } from '../../lib/api';
import { fmtFull, fmtLong, fmtNum, fmtSigned } from '../../lib/format';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, FLOW_LEVEL_COLORS, FLOW_LEVEL_LABELS } from '../../data/predictions';
import { useDayPrediction, useHistorical, useWeekPrediction } from '../../hooks/usePrediction';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

const LEVEL_BADGE = { bajo: 'info', normal: 'success', alto: 'warning', crítico: 'danger' } as const;

function weatherIcon(p: { condition: string; precipitation: number }) {
  if (p.condition.includes('tormenta')) return '⛈️';
  if (p.precipitation >= 1) return '🌧️';
  return p.condition.includes('ublado') ? '⛅' : '☀️';
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Pide el dato de ayer en el propio inicio: es lo que más ayuda al modelo a aprender. */
function QuickEntry({ onSaved }: { onSaved: () => void }) {
  const { currentStore, refreshStores } = useApp();
  const navigate = useNavigate();
  const { data: history, loading, refresh } = useHistorical(currentStore.id, 60);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  const yesterday = formatDateLocal(daysAgo(1));
  const hasYesterday = history.some(h => h.date === yesterday);

  if (message) {
    return <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">✓ {message}</div>;
  }
  if (hasYesterday) return null;

  const last = history.length ? history[history.length - 1].date : null;
  const missing = last
    ? Math.round((daysAgo(1).setHours(12) - new Date(`${last}T12:00:00`).getTime()) / 86400000)
    : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clients = Number(value);
    if (value === '' || !Number.isInteger(clients) || clients < 0) {
      setError('Escribe un número entero de clientes.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.addHistorical({ storeId: currentStore.id, date: yesterday, clients });
      await refresh();
      await refreshStores();
      setMessage(
        r.predicted != null
          ? `Guardado. El sistema había previsto ${fmtNum(r.predicted, 0)} clientes para ayer; atendiste ${clients}.`
          : `Guardado: ${clients} clientes ayer.`,
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <form onSubmit={save} className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label htmlFor="ayer" className="font-semibold text-slate-900 block">
            ✏️ ¿Cuántos clientes atendiste ayer, {fmtLong(yesterday).toLowerCase()}?
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            Con cada día que registras, las predicciones de tu negocio mejoran.
            {missing != null && missing > 1 && (
              <>
                {' '}
                Tienes {missing} días sin registrar.{' '}
                <button type="button" className="text-blue-600 underline" onClick={() => navigate('/comerciante/datos')}>
                  Registrar otros días
                </button>
              </>
            )}
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <div className="flex gap-2">
          <input
            id="ayer"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Clientes"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="submit" loading={saving}>Guardar</Button>
        </div>
      </form>
    </Card>
  );
}

export function CommercianteDashboard() {
  const { currentStore, notifications, currentUser, setSelectedDate, loadNotifications } = useApp();
  const navigate = useNavigate();
  const [today] = useState(() => new Date());

  const { data: todayPred, loading: loadingToday, error } = useDayPrediction(currentStore.id, today);
  const { data: next7, loading: loadingWeek } = useWeekPrediction(currentStore.id, today);
  const [todayRecs, setTodayRecs] = useState<string[]>([]);

  useEffect(() => {
    if (!currentStore.id) return;
    api
      .recommendations(currentStore.id, formatDateLocal(new Date()))
      .then(list => setTodayRecs(list[0]?.recommendations ?? []))
      .catch(() => setTodayRecs([]));
  }, [currentStore.id]);

  const firstName = currentUser?.name?.split(' ')[0] ?? '';
  const greeting = today.getHours() < 12 ? 'Buenos días' : today.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  const header = (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{greeting}, {firstName}</h1>
      <p className="text-sm text-slate-500 mt-0.5">{currentStore.name} · {fmtFull(today)}</p>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        {header}
        <QuickEntry onSaved={() => {}} />
        <Card className="text-center py-10">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-slate-700 font-medium">Todavía no se puede mostrar la predicción</p>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
        </Card>
      </div>
    );
  }
  if (loadingToday || loadingWeek || !todayPred) {
    return <div className="flex items-center justify-center min-h-[40vh] text-slate-500">Calculando tu predicción…</div>;
  }

  const avg = currentStore.avgDailyClients;
  const diff = todayPred.clients - avg;
  const compare =
    !avg || diff === 0
      ? 'Igual a tu promedio diario'
      : `${Math.abs(diff)} ${diff > 0 ? 'más' : 'menos'} que tu promedio diario (${avg})`;
  const unread = notifications.filter(n => !n.read);

  function openDay(d: Date) {
    setSelectedDate(d);
    navigate('/comerciante/prediccion');
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {header}

      {currentStore.isTest && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          🧪 Comercio de prueba: su historial fue inventado para probar el sistema.
        </div>
      )}
      {currentStore.status === 'Pendiente' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          ℹ️ Tu comercio está pendiente de aprobación por el administrador. Mientras tanto ya puedes registrar tu flujo diario.
        </div>
      )}
      {todayPred.dataWarning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">⚠️ {todayPred.dataWarning}</div>
      )}

      {/* Lo principal: cuántos clientes vienen hoy y qué hacer */}
      <Card padding="lg">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium text-slate-500">Hoy esperamos</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-6xl font-extrabold text-slate-900 leading-none">{todayPred.clients}</span>
              <span className="text-lg font-semibold text-slate-600">clientes</span>
            </div>
            <div className="text-sm text-slate-600 mt-2">
              Lo más probable es que sean entre <strong>{todayPred.clientsMin} y {todayPred.clientsMax}</strong>.
            </div>
            <div className="text-sm text-slate-500">{compare}.</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <Badge variant={LEVEL_BADGE[todayPred.flowLevel]} size="md">{FLOW_LEVEL_LABELS[todayPred.flowLevel]}</Badge>
              {todayPred.isQuincena && <Badge variant="info" size="md">💰 Quincena</Badge>}
              {todayPred.isHoliday && <Badge variant="warning" size="md">🎉 {todayPred.holidayName}</Badge>}
              {todayPred.event && <Badge variant="info" size="md">🎁 {todayPred.event}</Badge>}
            </div>
            <div className="text-sm text-slate-600 mt-3">
              {weatherIcon(todayPred)} {todayPred.condition} · {fmtNum(todayPred.temperature, 0)} °C
              {todayPred.precipitation >= 1 && ` · lluvia ${fmtNum(todayPred.precipitation, 0)} mm`}
            </div>
            <div className="text-xs text-slate-400 mt-1">Confianza de la predicción: {todayPred.confidenceLabel.toLowerCase()} ({todayPred.confidence} %)</div>
          </div>
          <div className="md:border-l md:border-slate-100 md:pl-6">
            <div className="text-sm font-semibold text-slate-900 mb-2">💡 Qué te recomendamos hoy</div>
            <ul className="space-y-2 text-sm text-slate-700">
              {todayRecs.map(r => <li key={r} className="leading-relaxed">{r}</li>)}
              {todayRecs.length === 0 && <li className="text-slate-500">Sin recomendaciones especiales para hoy.</li>}
            </ul>
            <button onClick={() => navigate('/comerciante/recomendaciones')} className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-3">
              Ver las de toda la semana →
            </button>
          </div>
        </div>
      </Card>

      <QuickEntry onSaved={() => void loadNotifications()} />

      {/* La semana de un vistazo */}
      <Card>
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Tu semana</h2>
            <p className="text-xs text-slate-500">Toca un día para ver el detalle.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/comerciante/calendario')}>Ver calendario</Button>
        </div>
        <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
          {next7.map((d, i) => (
            <button
              key={i}
              onClick={() => openDay(d.date)}
              title={`${d.condition} · ${d.precipitation} mm`}
              className={`rounded-xl p-2 text-center border transition-all hover:shadow-md ${i === 0 ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50 hover:bg-white'}`}
            >
              <div className="text-xs text-slate-500">{i === 0 ? 'Hoy' : DAY_NAMES[d.date.getDay()]} {d.date.getDate()}</div>
              <div className="text-xl font-bold text-slate-900">{d.clients}</div>
              <div className="text-sm leading-none my-0.5">{weatherIcon(d)}</div>
              <div
                className="text-[10px] font-semibold rounded-full px-1 py-0.5 mt-1"
                style={{ backgroundColor: `${FLOW_LEVEL_COLORS[d.flowLevel]}20`, color: FLOW_LEVEL_COLORS[d.flowLevel] }}
              >
                {d.flowLevel}
              </div>
              {(d.isQuincena || d.isHoliday) && (
                <div className="text-[10px] text-slate-500 mt-1">{d.isHoliday ? '🎉 Festivo' : '💰 Quincena'}</div>
              )}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <h2 className="font-semibold text-slate-900">¿Por qué {todayPred.clients} clientes hoy?</h2>
          <p className="text-xs text-slate-500 mb-3">Cuántos clientes suma o resta cada factor.</p>
          {todayPred.factors.length === 0 && <p className="text-sm text-slate-500">Hoy es un día típico: ningún factor pesa especialmente.</p>}
          <ul className="space-y-1.5">
            {todayPred.factors.slice(0, 5).map(f => (
              <li key={f.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{f.name}</span>
                <span className={`font-semibold whitespace-nowrap ${f.type === 'positive' ? 'text-green-700' : 'text-red-600'}`}>{fmtSigned(f.impact)}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => openDay(today)} className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-3">
            Ver detalle →
          </button>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="font-semibold text-slate-900">Alertas</h2>
            <Button variant="outline" size="sm" onClick={() => navigate('/comerciante/alertas')}>Ver todas</Button>
          </div>
          {unread.length === 0 && <p className="text-sm text-slate-500">No tienes alertas pendientes. Te avisaremos si viene un día fuera de lo normal.</p>}
          <div className="space-y-2">
            {unread.slice(0, 3).map(n => (
              <div key={n.id} className="text-sm border-l-4 pl-3 py-0.5" style={{ borderColor: n.type === 'danger' ? '#dc2626' : n.type === 'warning' ? '#d97706' : '#0284c7' }}>
                <div className="font-medium text-slate-900">{n.title}</div>
                <div className="text-xs text-slate-500 line-clamp-2">{n.message}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
