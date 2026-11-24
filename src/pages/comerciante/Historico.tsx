import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { useHistorical } from '../../hooks/usePrediction';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { DAY_NAMES_FULL } from '../../data/predictions';
import { fmtNum, fmtShort } from '../../lib/format';

const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

export function Historico() {
  const { currentStore } = useApp();
  const [days, setDays] = useState(30);
  const [dow, setDow] = useState<number | 'todos'>('todos');

  const { data, loading } = useHistorical(currentStore.id, 365);
  const inPeriod = data.slice(-days);
  const displayed = dow === 'todos' ? inPeriod : inPeriod.filter(d => weekday(d.date) === dow);

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Cargando historial…</div>;
  }
  if (!data.length) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 text-slate-500">
        Aún no hay registros. Carga tu histórico o registra el flujo diario en <strong>Gestión de datos</strong>.
      </div>
    );
  }

  const withPred = displayed.filter(d => d.error != null);
  const avgError = withPred.length
    ? Math.round((withPred.reduce((acc, d) => acc + (d.error ?? 0), 0) / withPred.length) * 10) / 10
    : null;
  const avgReal = displayed.length ? Math.round((displayed.reduce((a, d) => a + d.real, 0) / displayed.length) * 10) / 10 : 0;
  const maxReal = displayed.length ? Math.max(...displayed.map(d => d.real)) : 0;
  const minReal = displayed.length ? Math.min(...displayed.map(d => d.real)) : 0;

  const chartData = displayed.map(d => ({
    date: fmtShort(d.date).replace(/^\S+ /, ''),
    real: d.real,
    predicho: d.predicted,
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Historial de flujo</h1>
        <p className="text-sm text-slate-500">Los clientes que has registrado y qué tanto acertó el sistema.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Últimos</label>
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm transition-all ${days === d ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {d} días
              </button>
            ))}
          </div>
        </div>
        <select
          value={dow}
          onChange={e => setDow(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="todos">Todos los días</option>
          {[1, 2, 3, 4, 5, 6, 0].map(i => (
            <option key={i} value={i}>{DAY_NAMES_FULL[i]}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Promedio por día', value: `${fmtNum(avgReal)} clientes` },
          {
            label: 'El sistema se equivocó en promedio por',
            value: avgError != null ? `${fmtNum(avgError)} clientes` : '—',
            note: avgError != null ? `en ${withPred.length} días` : 'aún sin predicciones que comparar',
          },
          { label: 'Mejor día', value: `${maxReal} clientes` },
          { label: 'Día más flojo', value: `${minReal} clientes` },
        ].map(s => (
          <Card key={s.label}>
            <div className="text-xs text-slate-500 mb-1">{s.label}</div>
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            {s.note && <div className="text-xs text-slate-400 mt-0.5">{s.note}</div>}
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-slate-900">
            {withPred.length ? 'Lo que pasó y lo que el sistema predijo' : 'Clientes por día'}
          </h2>
          {withPred.length > 0 && <span className="text-xs text-slate-400">El sistema no conocía el dato real al predecir.</span>}
        </div>
        {withPred.length === 0 && (
          <p className="text-xs text-slate-500 mb-3">
            Todavía no hay predicciones guardadas para estos días. A partir de ahora, cada día que registres se comparará con lo
            que el sistema había previsto.
          </p>
        )}
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ left: -20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
            {withPred.length > 0 && <Legend formatter={v => (v === 'real' ? 'Clientes reales' : 'Predicción')} />}
            <Line type="monotone" dataKey="real" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
            {withPred.length > 0 && (
              <Line type="monotone" dataKey="predicho" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2 }} connectNulls={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card padding="none">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Detalle de registros</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Fecha', 'Día', 'Real', 'Predicho', 'Error', 'Clima', 'Lluvia mm'].map(h => (
                  <th key={h} className="text-center first:text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...displayed].reverse().map(row => (
                <tr key={row.date} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                    {fmtShort(row.date).replace(/^\S+ /, '')}
                    {row.estimated && <Badge variant="warning" size="sm" className="ml-2">estimado</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{DAY_NAMES_FULL[weekday(row.date)]}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-slate-900">{row.real}</td>
                  <td className="px-4 py-2.5 text-center text-blue-600 font-medium">{row.predicted ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {row.error == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={`font-medium ${row.error <= 2 ? 'text-green-600' : row.error <= 4 ? 'text-amber-600' : 'text-red-600'}`}>
                        {row.error}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{row.condition ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{row.precipitation ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
