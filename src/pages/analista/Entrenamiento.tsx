import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { api, type ModelRun } from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useStoreTraining } from '../../hooks/useStoreTraining';
import { TrainingLive } from '../../components/TrainingLive';

type TrainState = 'idle' | 'running' | 'done';

const MODELS = [
  { id: 'rf', name: 'Random Forest', desc: 'Ensemble de 300 árboles (scikit-learn). Robusto con pocos datos e interpretable.', recommended: true },
  { id: 'xgb', name: 'XGBoost', desc: 'Gradient boosting. Suele rendir mejor cuando hay más historia y más comercios.', recommended: false },
  { id: 'lstm', name: 'LSTM', desc: 'Red recurrente. Requiere al menos un año de datos diarios por comercio; aún no disponible con el volumen actual.', recommended: false },
];

export function Entrenamiento() {
  const { showToast, ToastComponent } = useToast();
  const [model, setModel] = useState('rf');
  const [excludeEstimated, setExcludeEstimated] = useState(false);
  const [includeTestData, setIncludeTestData] = useState(false);
  const [testRecords, setTestRecords] = useState(0);
  const [state, setState] = useState<TrainState>('idle');
  const [run, setRun] = useState<ModelRun | null>(null);
  const [records, setRecords] = useState<number | null>(null);
  const [estimated, setEstimated] = useState<number | null>(null);
  const { currentStore } = useApp();
  // Estado en vivo (también detecta entrenamientos automáticos en curso)
  const { data: live, reload } = useStoreTraining(currentStore.id);
  const busy = state === 'running' || !!live?.live.running;

  useEffect(() => {
    api
      .stats()
      .then(s => {
        setRecords(s.records);
        setEstimated(s.estimatedRecords);
        setTestRecords(s.testRecords);
      })
      .catch(() => {});
  }, []);

  async function handleTrain() {
    setState('running');
    setTimeout(() => void reload(), 500);
    try {
      const result = await api.trainModel(model, { excludeEstimated, includeTestData });
      setRun(result);
      setState('done');
      void reload();
      showToast(`${result.algorithm} ${result.version} guardado y activado.`);
    } catch (e) {
      void reload();
      setState('idle');
      showToast(e instanceof Error ? e.message : 'No se pudo entrenar.');
    }
  }

  const selectedModel = MODELS.find(m => m.id === model)!;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <ToastComponent />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Entrenar modelo</h1>
        <p className="text-sm text-slate-500">
          Entrena con todos los registros y el clima de Open-Meteo. Se valida con walk-forward: el modelo aprende del pasado y
          predice la semana siguiente, y se compara con el método empírico (promedio del mismo día de la semana).
        </p>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Dataset de entrenamiento</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-blue-50 rounded-xl">
            <div className="text-xl font-bold text-blue-700 font-mono">{records ?? '…'}</div>
            <div className="text-xs text-blue-600">Registros reales</div>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl">
            <div className="text-xl font-bold text-amber-700 font-mono">{estimated ?? '…'}</div>
            <div className="text-xs text-amber-600">Conteos estimados</div>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl">
            <div className="text-xl font-bold text-blue-700 font-mono">{testRecords}</div>
            <div className="text-xs text-blue-600">Registros de prueba (inventados)</div>
          </div>
        </div>
        <label className="flex items-start gap-2 mt-4 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={excludeEstimated} onChange={e => setExcludeEstimated(e.target.checked)} />
          <span>
            Excluir los conteos marcados como estimados (no observados). Recomendado cuando haya suficientes datos reales; con
            pocos datos reduce mucho la validación.
          </span>
        </label>
        {testRecords > 0 && (
          <label className="flex items-start gap-2 mt-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={includeTestData} onChange={e => setIncludeTestData(e.target.checked)} />
            <span>
              Incluir los <strong>comercios de prueba</strong> ({testRecords} registros inventados). Sirve para comprobar el sistema
              con un año de datos; las métricas resultantes <strong>no</strong> son resultados de la investigación.
            </span>
          </label>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">Selección de modelo</h2>
        <div className="space-y-3">
          {MODELS.map(m => (
            <label key={m.id} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${model === m.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="model" value={m.id} checked={model === m.id} onChange={() => setModel(m.id)} className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{m.name}</span>
                  {m.recommended && <Badge variant="success" size="sm">Recomendado</Badge>}
                </div>
                <div className="text-sm text-slate-500 mt-0.5">{m.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        {state === 'idle' && live?.live.running && <TrainingLive data={live} technical />}
        {state === 'idle' && !live?.live.running && (
          <div className="text-center py-4">
            <h2 className="font-semibold text-slate-900 mb-2">Listo para entrenar</h2>
            <p className="text-sm text-slate-500 mb-4">
              Se entrenará <strong>{selectedModel.name}</strong> y quedará como modelo activo.
            </p>
            <Button size="lg" onClick={handleTrain} disabled={busy}>⚡ Entrenar modelo</Button>
          </div>
        )}
        {state === 'running' && (live?.live.running ? (
          <TrainingLive data={live} technical />
        ) : (
          <div className="flex items-center gap-3 p-4">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-700">Iniciando entrenamiento…</span>
          </div>
        ))}
        {state === 'done' && run && (
          <div className="space-y-4">
            <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              Entrenamiento guardado · {run.version} · {run.algorithm}
              {run.includesTestData && <Badge variant="warning">Con datos de prueba</Badge>}
            </div>
            <div className="text-xs text-slate-500">
              {run.records} registros · validado sobre {run.evaluated} días fuera de muestra · datos hasta {run.trainedThrough}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'MAE', value: String(run.mae), base: String(run.baselineMae) },
                { label: 'RMSE', value: String(run.rmse), base: String(run.baselineRmse) },
                { label: 'MAPE', value: `${run.mape}%`, base: `${run.baselineMape}%` },
                { label: 'R²', value: String(run.r2), base: '—' },
              ].map(m => (
                <div key={m.label} className="p-3 bg-slate-50 rounded-xl">
                  <div className="text-xs text-slate-500">{m.label}</div>
                  <div className="font-bold text-slate-900">{m.value}</div>
                  <div className="text-xs text-slate-400">Método empírico: {m.base}</div>
                </div>
              ))}
            </div>
            <div className={`p-3 rounded-xl text-sm ${run.mae < run.baselineMae ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
              {run.mae < run.baselineMae
                ? `El modelo reduce el error absoluto en ${(run.baselineMae - run.mae).toFixed(2)} clientes por día frente al método empírico.`
                : 'El modelo no supera todavía al método empírico. Con más días y más comercios registrados se espera que mejore.'}
            </div>
            <Button variant="outline" onClick={() => setState('idle')}>Nuevo entrenamiento</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
