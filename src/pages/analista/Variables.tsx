import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { api, type ModelRun } from '../../lib/api';

const CLIMATE = ['Temperatura máxima', 'Temperatura mínima', 'Precipitación', 'Humedad relativa', 'Lluvia fuerte (≥10 mm)'];

const INFLUENCE_SURVEY = [
  { factor: 'Días festivos', score: 4.61 },
  { factor: 'Quincena / pago', score: 4.55 },
  { factor: 'Fin de mes', score: 4.42 },
  { factor: 'Día de la semana', score: 4.32 },
  { factor: 'Temperatura / calor', score: 4.19 },
  { factor: 'Temporada del año', score: 4.13 },
];

const CATEGORY_COLORS: Record<string, string> = {
  Temporal: '#7c3aed',
  Climático: '#0891b2',
};

export function Variables() {
  const [model, setModel] = useState<ModelRun | null>(null);

  useEffect(() => {
    api.activeModel().then(setModel).catch(() => {});
  }, []);

  const data = (model?.importances ?? []).map(f => ({
    feature: f.feature,
    importance: Math.round(f.importance * 1000) / 10,
    category: CLIMATE.includes(f.feature) ? 'Climático' : 'Temporal',
  }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Importancia de variables</h1>
          <p className="text-sm text-slate-500">Peso de cada variable en el modelo activo frente a la percepción de los comerciantes</p>
        </div>
        {model && <Badge variant="info">{model.algorithm} {model.version}</Badge>}
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-1">Variables que más influyen en el modelo</h2>
        <p className="text-xs text-slate-500 mb-4">
          Importancia calculada por el algoritmo al entrenar con {model?.records ?? '…'} registros reales.
        </p>
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No hay un modelo entrenado todavía.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, data.length * 24)}>
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis dataKey="feature" type="category" width={170} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`, 'Importancia']} />
              <Bar dataKey="importance" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#334155', formatter: (v: any) => `${v}%` }}>
                {data.map(d => <Cell key={d.feature} fill={CATEGORY_COLORS[d.category]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex gap-4 mt-3 flex-wrap">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              {cat}
            </div>
          ))}
        </div>
      </Card>

      {/* Survey influence */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Factores que influyen en el flujo</h2>
            <p className="text-xs text-slate-500 mt-0.5">Promedio de influencia percibida por los comerciantes (escala 1–5)</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-900">α = 0.8695</div>
            <div className="text-xs text-slate-400">Alfa de Cronbach</div>
          </div>
        </div>

        <div className="space-y-3">
          {INFLUENCE_SURVEY.map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-40 flex-shrink-0 text-sm text-slate-700">{item.factor}</div>
              <div className="flex-1">
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${(item.score / 5) * 100}%` }}
                  />
                </div>
              </div>
              <div className="w-12 text-right font-bold font-mono text-slate-900 text-sm">{item.score}</div>
              <div className="w-6 text-xs text-slate-400">/5</div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm">
          <div className="font-semibold text-blue-900 mb-1">Consistencia interna del instrumento</div>
          <div className="text-2xl font-bold text-blue-700 font-mono">α = 0.8695</div>
          <div className="text-xs text-blue-600 mt-1">
            Escala: 1 = Nada · 2 = Poco · 3 = Algo · 4 = Bastante · 5 = Mucho
          </div>
          <div className="text-xs text-blue-500 mt-1">Resultado obtenido con la muestra ampliada de 31 comercios.</div>
          <div className="text-xs text-blue-400 mt-1 italic">Dato documentado del proyecto de investigación.</div>
        </div>
      </Card>

      {/* Variable detail */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">Descripción de variables</h2>
        <div className="space-y-2">
          {[
            { name: 'Nivel del comercio', type: 'Temporal', desc: 'El modelo predice la razón clientes / promedio histórico del comercio, así un mismo modelo sirve para negocios de distinto tamaño.' },
            { name: 'Día de la semana', type: 'Temporal', desc: 'Codificación one-hot de lunes a domingo. Captura la asimetría sábado alto / domingo bajo.' },
            { name: 'Quincena, víspera y día siguiente', type: 'Temporal', desc: 'Días 15 y último del mes (o el viernes anterior si caen en fin de semana), más el día antes y después.' },
            { name: 'Fin e inicio de mes', type: 'Temporal', desc: 'Últimos 3 días y primeros 2 días del mes.' },
            { name: 'Festivo', type: 'Temporal', desc: 'Festivos oficiales de Colombia (Ley Emiliani), calculados con la librería holidays.' },
            { name: 'Receso escolar y eventos', type: 'Temporal', desc: 'Recesos y eventos comerciales (Amor y Amistad, etc.) definidos en server/ml/calendar_events.json.' },
            { name: 'Temperatura máx. y mín.', type: 'Climático', desc: 'Grados Celsius diarios en Montería (Open-Meteo).' },
            { name: 'Precipitación y lluvia fuerte', type: 'Climático', desc: 'Milímetros de lluvia del día e indicador de ≥ 10 mm.' },
            { name: 'Humedad relativa', type: 'Climático', desc: 'Humedad media diaria (%).' },
          ].map((v, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div
                className="mt-0.5 px-2 py-0.5 rounded text-xs font-semibold text-white flex-shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[v.type] || '#64748b' }}
              >
                {v.type}
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-sm">{v.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{v.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
