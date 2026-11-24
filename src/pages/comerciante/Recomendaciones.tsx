import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { api, formatDateLocal, type ApiDayPrediction } from '../../lib/api';
import { fmtLong, fmtSigned } from '../../lib/format';
import { FLOW_LEVEL_LABELS } from '../../data/predictions';

type Item = { prediction: ApiDayPrediction; recommendations: string[] };

const LEVEL_BADGE = { bajo: 'info', normal: 'success', alto: 'warning', crítico: 'danger' } as const;

export function Recomendaciones() {
  const { currentStore } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentStore.id) return;
    setLoading(true);
    setError(null);
    api
      .recommendations(currentStore.id, formatDateLocal(new Date()))
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [currentStore.id]);

  // Un día normal sin nada especial no pide ninguna acción: se resume en una línea.
  const attention = items.filter(i => i.prediction.flowLevel !== 'normal' || i.recommendations.length > 1);
  const calm = items.filter(i => !attention.includes(i));

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recomendaciones de la semana</h1>
        <p className="text-sm text-slate-500">Son sugerencias según la predicción de los próximos 7 días: la decisión siempre es tuya.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Calculando recomendaciones…</p>}
      {error && <Card><p className="text-sm text-red-600">{error}</p></Card>}

      {!loading && !error && (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-800">Días para preparar ({attention.length})</h2>
            {attention.length === 0 && <Card><p className="text-sm text-slate-500">Esta semana no hay días fuera de lo normal. 👍</p></Card>}
            {attention.map(({ prediction: p, recommendations }) => (
              <Card key={p.date}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <div className="font-semibold text-slate-900">{fmtLong(p.date)}</div>
                    <div className="text-xs text-slate-500">
                      {p.clients} clientes esperados (entre {p.clientsMin} y {p.clientsMax}) · {p.condition}
                    </div>
                  </div>
                  <Badge variant={LEVEL_BADGE[p.flowLevel]}>{FLOW_LEVEL_LABELS[p.flowLevel]}</Badge>
                </div>
                <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                  {recommendations.map(r => <li key={r}>{r}</li>)}
                </ul>
                {p.factors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {p.factors.slice(0, 3).map(f => (
                      <span key={f.name} className={`text-xs px-2 py-0.5 rounded-full ${f.type === 'positive' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {f.name}: {fmtSigned(f.impact)}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </section>

          {calm.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-slate-800">Días normales ({calm.length})</h2>
              <Card padding="none">
                <ul className="divide-y divide-slate-100">
                  {calm.map(({ prediction: p }) => (
                    <li key={p.date} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <span className="text-slate-700">{fmtLong(p.date)}</span>
                      <span className="text-slate-500 whitespace-nowrap"><strong className="text-slate-900">{p.clients}</strong> clientes</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <p className="text-xs text-slate-500">Estos días puedes operar con el personal y el inventario de siempre.</p>
            </section>
          )}
        </>
      )}

      <p className="text-center text-xs text-slate-400">
        ComercIA nunca ejecuta compras, contrataciones ni cambios en tu negocio de manera automática.
      </p>
    </div>
  );
}
