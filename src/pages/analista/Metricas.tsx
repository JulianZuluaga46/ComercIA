import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { api, type ModelRun } from '../../lib/api';

export function Metricas() {
  const [active, setActive] = useState<ModelRun | null>(null);
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.activeModel(), api.modelRuns()])
      .then(([a, list]) => {
        setActive(a);
        setRuns([...list].reverse());
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 text-slate-500">Cargando métricas…</div>;
  if (!active) {
    return <div className="text-center py-20 text-slate-500">Todavía no hay un modelo entrenado. Ve a «Entrenar modelo».</div>;
  }

  const cards = [
    { label: 'MAE', value: String(active.mae), base: String(active.baselineMae), unit: 'clientes', desc: 'Error absoluto medio' },
    { label: 'RMSE', value: String(active.rmse), base: String(active.baselineRmse), unit: 'clientes', desc: 'Raíz del error cuadrático medio' },
    { label: 'MAPE', value: `${active.mape}%`, base: `${active.baselineMape}%`, unit: '', desc: 'Error porcentual medio' },
    { label: 'R²', value: String(active.r2), base: null, unit: '', desc: 'Varianza explicada' },
  ];
  const better = active.mae < active.baselineMae;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Métricas del modelo</h1>
          <p className="text-sm text-slate-500">
            {active.algorithm} {active.version} · validación walk-forward sobre {active.evaluated} días que el modelo no vio al entrenar.
          </p>
        </div>
        <Badge variant={better ? 'success' : 'warning'}>
          {better ? 'Supera al método empírico' : 'No supera aún al método empírico'}
        </Badge>
      </div>
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-900">
        En palabras simples: en promedio, el modelo se equivoca por <strong>{active.mae.toFixed(2)} clientes</strong> al día.
        Predecir con el promedio de cada día de la semana (método empírico) se equivoca por{' '}
        <strong>{active.baselineMae.toFixed(2)}</strong>.
      </div>
      {active.includesTestData && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          ⚠️ Este modelo se entrenó también con <strong>comercios de prueba (datos inventados)</strong>. Sus métricas sirven
          para comprobar el sistema, no como resultado de la investigación. Para resultados reales, entrene sin datos de
          prueba.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(m => (
          <Card key={m.label}>
            <div className="text-xs text-slate-500 font-mono mb-1">{m.label}</div>
            <div className="text-3xl font-bold font-mono text-blue-700">{m.value}</div>
            {m.unit && <div className="text-xs text-slate-400">{m.unit}</div>}
            <div className="text-xs text-slate-500 mt-2">{m.desc}</div>
            {m.base && <div className="text-xs text-slate-400 mt-1">Método empírico: {m.base}</div>}
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-1">Modelo vs. método empírico por versión</h2>
        <p className="text-xs text-slate-500 mb-4">
          El método empírico predice el promedio del mismo día de la semana: representa la decisión basada en la experiencia que
          la hipótesis del proyecto busca superar.
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={runs.map(r => ({ version: `${r.version} ${r.algorithm}`, mae: r.mae, base: r.baselineMae }))} margin={{ left: -20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="version" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
            <Legend />
            <Line type="monotone" dataKey="mae" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="MAE modelo" />
            <Line type="monotone" dataKey="base" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} name="MAE método empírico" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
