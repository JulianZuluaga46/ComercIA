import type { StoreTraining } from '../lib/api';
import { useElapsed } from '../hooks/useStoreTraining';
import { fmtAgo, fmtDateTime, fmtLong, lowerFirst } from '../lib/format';
import { Card } from './ui/Card';

const STEPS = ['preparando', 'entrenando', 'guardando'] as const;

const STEP_LABEL = {
  simple: {
    preparando: 'Reuniendo los días registrados y su clima (pasos 1 y 2)',
    entrenando: 'Buscando patrones y poniéndose a prueba semana por semana (pasos 3 y 4)',
    guardando: 'Guardando lo aprendido (paso 5)',
  },
  technical: {
    preparando: 'Armando el dataset (registros + clima Open-Meteo)',
    entrenando: 'Entrenando y validando walk-forward',
    guardando: 'Guardando el modelo y las predicciones de validación',
  },
};

function fmtSeconds(s: number) {
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Estado del entrenamiento en este momento. `technical` muestra el detalle para el analista. */
export function TrainingLive({ data, technical = false }: { data: StoreTraining; technical?: boolean }) {
  const { live, active, lastFailure } = data;
  const elapsed = useElapsed(live.startedAt, live.running);
  const labels = technical ? STEP_LABEL.technical : STEP_LABEL.simple;
  const failedAfterActive = lastFailure && (!active || new Date(lastFailure.at) > new Date(active.createdAt));

  if (live.running) {
    const stepIdx = STEPS.indexOf(live.stage ?? 'preparando');
    return (
      <Card className="border-blue-200 bg-blue-50/40">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 shrink-0 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div>
            <h2 className="font-semibold text-slate-900">
              {technical ? `Entrenamiento en curso · ${live.algorithm}` : 'El sistema está aprendiendo ahora mismo'}
            </h2>
            <p className="text-sm text-slate-600">
              {technical
                ? `${live.trigger === 'automatico' ? 'Automático (RF-12)' : 'Iniciado por un analista'} · lleva ${fmtSeconds(elapsed)}`
                : `Empezó hace ${fmtSeconds(elapsed)}. Puedes seguir usando el sistema mientras tanto.`}
            </p>
          </div>
        </div>
        <ol className="mt-4 space-y-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span
                className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < stepIdx ? 'bg-green-500 text-white' : i === stepIdx ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {i < stepIdx ? '✓' : i + 1}
              </span>
              <span className={i === stepIdx ? 'font-medium text-slate-900' : 'text-slate-500'}>{labels[s]}</span>
            </li>
          ))}
        </ol>
        {live.storeRecords != null && (
          <p className="mt-4 text-sm text-slate-700">
            {live.storeRecords > 0
              ? technical
                ? `Este comercio aporta ${live.storeRecords} registros` +
                  (live.storesInTraining != null ? ` de ${live.storesInTraining} comercios incluidos.` : '.')
                : `Está usando ${live.storeRecords} días registrados de tu negocio.`
              : technical
                ? 'Este comercio no entra en este entrenamiento (sin registros con clima o es de prueba).'
                : 'Tu negocio no entra en este aprendizaje todavía.'}
          </p>
        )}
      </Card>
    );
  }

  // El comerciante no debe leer "está al día" si el modelo en uso no aprendió con ninguno de sus días
  if (!technical && active && !active.included) {
    return (
      <Card className="border-amber-200">
        <h2 className="font-semibold text-slate-900">El sistema todavía no ha aprendido con los días de tu negocio</h2>
        <p className="text-sm text-slate-600">
          {data.store.isTest
            ? 'Este comercio es de prueba: sus días se guardan y se ven aquí, pero el sistema solo aprende con los comercios reales.'
            : `Aprenderá con ellos en cuanto se junten ${data.nextRetrain.threshold} días nuevos entre todos los comercios.`}
        </p>
      </Card>
    );
  }

  return (
    <Card className={active ? 'border-green-200' : 'border-amber-200'}>
      {active ? (
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 shrink-0 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">✓</span>
          <div>
            <h2 className="font-semibold text-slate-900">
              {technical ? `Modelo activo ${active.version} · ${active.algorithm}` : 'El sistema está al día'}
            </h2>
            <p className="text-sm text-slate-600">
              {technical ? 'Entrenado' : 'Aprendió por última vez'} el {fmtDateTime(active.createdAt)} ({fmtAgo(active.createdAt)}),
              {technical ? ' con datos hasta el ' : ' con lo registrado hasta el '}
              {lowerFirst(fmtLong(active.trainedThrough))}.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="font-semibold text-slate-900">
            {technical ? 'No hay modelo activo' : 'El sistema todavía no ha aprendido'}
          </h2>
          <p className="text-sm text-slate-600">
            Necesita al menos {data.data.minRecords} días registrados para empezar
            {technical ? ' y más de ' + data.data.initialWindowDays + ' días de historia para validar.' : '.'}
          </p>
        </div>
      )}
      {failedAfterActive && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 text-sm text-amber-800">
          {technical
            ? `El último intento (${lastFailure.trigger === 'automatico' ? 'automático' : 'manual'}, ${fmtDateTime(lastFailure.at)}) falló: ${lastFailure.message}`
            : `El ${fmtDateTime(lastFailure.at)} el sistema intentó aprender de nuevo y no lo logró. Sigue usando lo que aprendió antes; el equipo técnico ya puede verlo.`}
        </div>
      )}
    </Card>
  );
}

/** Barra de avance hacia el próximo reentrenamiento automático. */
export function RetrainProgress({ data, technical = false }: { data: StoreTraining; technical?: boolean }) {
  const { threshold, newRecords, newRecordsStore, lastCheck } = data.nextRetrain;
  if (!data.active) return null;
  const pct = Math.min(100, Math.round((newRecords / threshold) * 100));
  return (
    <Card>
      <h2 className="font-semibold text-slate-900 mb-1">{technical ? 'Próximo reentrenamiento automático' : 'Próxima vez que aprende'}</h2>
      <p className="text-sm text-slate-500 mb-3">
        {technical
          ? `Se reentrena al acumular ${threshold} registros nuevos que el modelo activo usaría (todos los comercios). Se revisa al guardar registros (manual o archivo) y cada 6 horas.`
          : `El sistema vuelve a aprender solo cuando se registran ${threshold} días nuevos entre todos los comercios. Empieza en cuanto se guarda el día que completa ese número.`}
      </p>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 mt-2 text-sm text-slate-600">
        <span>
          {Math.min(newRecords, threshold)} de {threshold} {technical ? 'registros nuevos' : 'días nuevos'}
          {newRecordsStore > 0 && ` (${newRecordsStore} ${technical ? 'de este comercio' : 'tuyos'})`}
        </span>
        {lastCheck && <span className="text-slate-400">Última revisión {fmtAgo(lastCheck)}</span>}
      </div>
      {newRecords >= threshold && (
        <p className="mt-2 text-sm text-blue-700">
          {technical ? 'Umbral alcanzado: se reentrenará en la próxima corrida de los procesos automáticos.' : 'Ya hay suficientes días: aprenderá en la próxima revisión.'}
        </p>
      )}
    </Card>
  );
}
