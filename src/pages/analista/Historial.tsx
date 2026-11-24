import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { api, type ModelRun } from '../../lib/api';

export function HistorialModelos() {
  const [runs, setRuns] = useState<ModelRun[]>([]);

  useEffect(() => {
    api.modelRuns().then(list => setRuns([...list].reverse()));
  }, []);

  const chartData = runs.map(h => ({ version: h.version, mae: h.mae, rmse: h.rmse }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historial de modelos</h1>
          <p className="text-sm text-slate-500">Todas las versiones entrenadas; puedes restaurar cualquiera como modelo activo.</p>
        </div>
        <Badge variant="info">{runs.length} versiones</Badge>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">Evolución de métricas</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ left: -20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="version" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="mae" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} name="MAE" />
            <Line type="monotone" dataKey="rmse" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name="RMSE" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="space-y-4">
        {[...runs].reverse().map(v => (
          <Card key={v.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-700">{v.version}</span>
                  <span className="font-semibold text-slate-900">{v.algorithm}</span>
                  {v.active ? <Badge variant="success">ACTIVO</Badge> : <Badge variant="default">Archivado</Badge>}
                  {v.includesTestData && <Badge variant="warning">Con datos de prueba</Badge>}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {new Date(v.createdAt).toLocaleString('es-CO')} · {v.records} registros · {v.durationMs} ms
                </div>
                <div className="flex gap-4 mt-2 text-sm flex-wrap">
                  <span className="text-green-700 font-mono">MAE: {v.mae}</span>
                  <span className="text-slate-500 font-mono">MAE empírico: {v.baselineMae}</span>
                  <span className="text-blue-700 font-mono">RMSE: {v.rmse}</span>
                  <span className="text-slate-700 font-mono">R²: {v.r2}</span>
                  <span className="text-slate-500 text-xs self-center">datos hasta {v.trainedThrough}</span>
                </div>
              </div>
              {!v.active && (
                <Button variant="outline" size="sm" onClick={() => api.activateModel(v.id).then(() => api.modelRuns().then(list => setRuns([...list].reverse())))}>
                  Restaurar
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
