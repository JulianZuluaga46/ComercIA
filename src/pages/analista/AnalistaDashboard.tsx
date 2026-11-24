import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { MetricCard } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { api, type ModelRun } from '../../lib/api';

export function AnalistaDashboard() {
  const [active, setActive] = useState<ModelRun | null>(null);
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [stats, setStats] = useState<{
    records: number;
    estimatedRecords: number;
    stores: number;
    testStores: number;
    testRecords: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.activeModel(), api.modelRuns(), api.stats()])
      .then(([a, list, s]) => {
        setActive(a);
        setRuns([...list].reverse());
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 text-slate-500">Cargando…</div>;

  const importance = (active?.importances ?? []).slice(0, 8).map(f => ({
    feature: f.feature,
    importance: Math.round(f.importance * 1000) / 10,
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel del analista</h1>
          <p className="text-sm text-slate-500">Estado del modelo predictivo y del conjunto de datos.</p>
        </div>
        {active ? (
          <div className="flex gap-2 flex-wrap">
            <Badge variant="info">Modelo activo: {active.algorithm} {active.version}</Badge>
            {active.includesTestData && <Badge variant="warning">Incluye datos de prueba</Badge>}
          </div>
        ) : (
          <Badge variant="warning">Sin modelo entrenado</Badge>
        )}
      </div>

      {active && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="MAE" value={String(active.mae)} subtext={`clientes · empírico ${active.baselineMae}`} color={active.mae < active.baselineMae ? 'green' : 'amber'} />
          <MetricCard label="RMSE" value={String(active.rmse)} subtext={`clientes · empírico ${active.baselineRmse}`} color="blue" />
          <MetricCard label="R²" value={String(active.r2)} subtext="coeficiente de determinación" color="green" />
          <MetricCard label="MAPE" value={`${active.mape}%`} subtext={`empírico ${active.baselineMape}%`} color="amber" />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Modelo activo</div>
          {active ? (
            <>
              <div className="font-bold text-slate-900 text-lg">{active.algorithm}</div>
              <div className="text-blue-600 font-semibold">Versión {active.version}</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Registros de entrenamiento</span><span className="font-mono">{active.records}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Días validados</span><span className="font-mono">{active.evaluated}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Datos hasta</span><span>{active.trainedThrough}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Entrenado</span><span>{new Date(active.createdAt).toLocaleString('es-CO')}</span></div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Entrena un modelo desde «Entrenar modelo».</p>
          )}
          {stats && (
            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
              Reales: {stats.records} registros en {stats.stores} comercio(s) · {stats.estimatedRecords} conteos estimados
              {stats.testStores > 0 && (
                <div className="mt-1 text-amber-700">
                  De prueba: {stats.testRecords} registros inventados en {stats.testStores} comercios
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">MAE por versión: modelo vs. método empírico</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={runs.map(r => ({ version: r.version, mae: r.mae, base: r.baselineMae }))} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="version" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Legend />
              <Line type="monotone" dataKey="mae" stroke="#2563eb" strokeWidth={2.5} dot={{ fill: '#2563eb', r: 4 }} name="Modelo" />
              <Line type="monotone" dataKey="base" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} name="Empírico" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {importance.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900">Variables que más influyen en el modelo activo</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Importancia relativa calculada por el algoritmo (suma 100%).</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={importance} layout="vertical" margin={{ left: 20, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis dataKey="feature" type="category" width={150} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`, 'Importancia']} />
              <Bar dataKey="importance" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
