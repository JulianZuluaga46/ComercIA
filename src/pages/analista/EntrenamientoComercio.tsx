import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { useStoreTraining } from '../../hooks/useStoreTraining';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { RetrainProgress, TrainingLive } from '../../components/TrainingLive';
import { fmtDateTime, fmtFull, fmtNum, lowerFirst } from '../../lib/format';

const num = (n: number | null) => (n == null ? '—' : fmtNum(n, 2));

export function EntrenamientoComercio() {
  const { currentStore } = useApp();
  const navigate = useNavigate();
  const { data, loading, error } = useStoreTraining(currentStore.id);

  if (loading && !data) return <div className="text-center py-20 text-slate-500">Cargando…</div>;
  if (!data) return <div className="max-w-xl mx-auto text-center py-20 text-slate-500">{error}</div>;

  const run = data.active;
  const belowMin = data.data.records < data.data.minRecords;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Entrenamiento por comercio</h1>
          <p className="text-sm text-slate-500">
            {data.store.name} · el modelo es uno para todos los comercios; aquí se ve cuánto aporta este comercio a cada
            entrenamiento y el error del modelo en sus días de validación walk-forward. Cambia de comercio en el selector de
            arriba.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/analista/entrenamiento')}>
          ⚡ Entrenar modelo
        </Button>
      </div>

      {data.store.isTest && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Comercio de prueba (datos inventados): sus métricas no son resultados de la investigación.
        </div>
      )}

      <TrainingLive data={data} technical />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-2xl font-bold">{data.data.records}</div>
          <div className="text-xs text-slate-500">Registros del comercio ({data.data.estimated} estimados)</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold">{run ? `${run.recordsUsed} / ${run.totalRecords}` : '—'}</div>
          <div className="text-xs text-slate-500">Usados en el modelo activo (comercio / total)</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold">{run?.evaluatedDays ?? '—'}</div>
          <div className="text-xs text-slate-500">Días evaluados fuera de muestra</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold">{run?.within2Pct != null ? `${run.within2Pct}%` : '—'}</div>
          <div className="text-xs text-slate-500">Días dentro de ±2 clientes</div>
        </Card>
      </div>

      {belowMin && (
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-900">
          El comercio tiene menos de {data.data.minRecords} registros: el servicio de ML no genera predicciones confiables
          para él y su validación es poco representativa.
        </div>
      )}

      {run && (
        <Card>
          <h2 className="font-semibold text-slate-900 mb-3">Modelo activo en este comercio vs. global</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-4 font-medium">Alcance</th>
                  <th className="py-2 pr-4 font-medium">MAE modelo</th>
                  <th className="py-2 pr-4 font-medium">MAE método empírico</th>
                  <th className="py-2 font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-50">
                  <td className="py-2 pr-4">Este comercio ({run.evaluatedDays} días)</td>
                  <td className="py-2 pr-4 font-mono">{num(run.mae)}</td>
                  <td className="py-2 pr-4 font-mono">{num(run.baselineMae)}</td>
                  <td className="py-2 font-mono">
                    {run.mae != null && run.baselineMae != null ? fmtNum(run.baselineMae - run.mae, 2) : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Todos los comercios</td>
                  <td className="py-2 pr-4 font-mono">{num(run.globalMae)}</td>
                  <td className="py-2 pr-4 font-mono">{num(run.globalBaselineMae)}</td>
                  <td className="py-2 font-mono">{fmtNum(run.globalBaselineMae - run.globalMae, 2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Diferencia positiva: el modelo se equivoca menos que el promedio del mismo día de la semana.
            {run.baselineMae == null &&
              ' El MAE empírico por comercio solo existe para modelos entrenados después de este cambio; reentrena para verlo.'}
          </p>
        </Card>
      )}

      <RetrainProgress data={data} technical />

      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Historial de entrenamientos en este comercio</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay entrenamientos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-medium">Versión</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Registros comercio / total</th>
                  <th className="py-2 pr-3 font-medium">Días eval.</th>
                  <th className="py-2 pr-3 font-medium">MAE comercio</th>
                  <th className="py-2 pr-3 font-medium">MAE empírico</th>
                  <th className="py-2 font-medium">MAE global</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map(h => (
                  <tr key={h.version} className="border-b border-slate-50 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium flex items-center gap-1 flex-wrap">
                        {h.version}
                        {h.active && <Badge variant="success">Activo</Badge>}
                        {h.includesTestData && <Badge variant="warning">Prueba</Badge>}
                      </div>
                      <div className="text-xs text-slate-400">{h.algorithm}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="first-letter:uppercase">{fmtDateTime(h.createdAt)}</div>
                      <div className="text-xs text-slate-400">datos hasta el {lowerFirst(fmtFull(h.trainedThrough))}</div>
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {h.included ? `${h.recordsUsed} / ${h.totalRecords}` : <span className="font-sans text-xs text-slate-400">No participó: {h.excludedReason}</span>}
                    </td>
                    <td className="py-2 pr-3 font-mono">{h.evaluatedDays}</td>
                    <td className="py-2 pr-3 font-mono">{num(h.mae)}</td>
                    <td className="py-2 pr-3 font-mono">{num(h.baselineMae)}</td>
                    <td className="py-2 font-mono">{num(h.globalMae)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Registros usados: los del comercio que existían al entrenar, hasta la fecha de corte. Los días sin clima se omiten
          en el entrenamiento, así que la cifra puede ser algo mayor que la real.
        </p>
      </Card>
    </div>
  );
}
