import { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { api, type ModelRun } from '../../lib/api';

export function Modelos() {
  const { showToast, ToastComponent } = useToast();
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.modelRuns().then(setRuns).finally(() => setLoading(false));
  }, []);

  async function activate(id: string) {
    try {
      await api.activateModel(id);
      setRuns(await api.modelRuns());
      showToast('Modelo activado.');
    } catch {
      showToast('No se pudo activar el modelo.');
    }
  }

  if (loading) return <div className="text-center py-20 text-slate-500">Cargando modelos…</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <ToastComponent />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Comparación de modelos</h1>
        <p className="text-sm text-slate-500">
          Versiones entrenadas. En verde, las que tienen menor error que el método empírico (promedio del mismo día de la semana).
        </p>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Versión', 'Estado', 'Algoritmo', 'MAE', 'MAE empírico', 'RMSE', 'R²', 'MAPE', 'Días validados', 'Registros'].map(h => (
                  <th key={h} className="text-left px-5 py-3 font-medium text-slate-500 text-xs uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map(m => (
                <tr key={m.id} className={`border-b border-slate-50 ${m.active ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-5 py-4 font-mono font-semibold">{m.version}</td>
                  <td className="px-5 py-4">
                    {m.active ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => activate(m.id)}>Activar</Button>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {m.algorithm}
                    {m.includesTestData && <Badge variant="warning" size="sm" className="ml-1">Datos de prueba</Badge>}
                  </td>
                  <td className={`px-5 py-4 font-mono font-semibold ${m.mae < m.baselineMae ? 'text-green-700' : 'text-amber-700'}`}>{m.mae}</td>
                  <td className="px-5 py-4 font-mono text-slate-500">{m.baselineMae}</td>
                  <td className="px-5 py-4 font-mono">{m.rmse}</td>
                  <td className="px-5 py-4 font-mono">{m.r2}</td>
                  <td className="px-5 py-4 font-mono">{m.mape}%</td>
                  <td className="px-5 py-4 font-mono">{m.evaluated}</td>
                  <td className="px-5 py-4 font-mono">
                    {m.records}
                    {m.excludeEstimated && <span className="block text-[10px] text-slate-400">sin estimados</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
