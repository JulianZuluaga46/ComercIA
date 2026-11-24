import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { useHistorical } from '../../hooks/usePrediction';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

export function PrediccionVsReal() {
  const { currentStore } = useApp();
  const [days, setDays] = useState(30);
  const { data: allData, loading } = useHistorical(currentStore.id, 365);
  const data = allData.slice(-days);

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Cargando datos históricos…</div>;
  }

  const chartData = data.map(d => ({ fecha: d.date.slice(5), real: d.real, prediccion: d.predicted }));
  const evaluated = data.filter(d => d.error != null);
  const errors = evaluated.map(d => d.error as number);
  const mae = errors.length ? (errors.reduce((a, e) => a + e, 0) / errors.length).toFixed(2) : '—';
  const maxError = errors.length ? Math.max(...errors) : '—';
  const within2 = errors.length ? `${Math.round((errors.filter(e => e <= 2).length / errors.length) * 100)}%` : '—';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Predicción vs real</h1>
        <p className="text-sm text-slate-500">
          {currentStore.name} · cada predicción se hizo sin conocer el dato real: en la validación walk-forward o antes de que
          ocurriera el día.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[14, 30, 60, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              days === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            Últimos {d} días
          </button>
        ))}
      </div>

      {evaluated.length === 0 && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-900">
          Este comercio aún no tiene predicciones para comparar en estos días. Su curva aparecerá cuando participe en un
          entrenamiento o cuando registre días que el sistema ya había previsto.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="text-2xl font-bold">{mae}</div>
          <div className="text-xs text-slate-500">MAE ({evaluated.length} días evaluados)</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold">{maxError}</div>
          <div className="text-xs text-slate-500">Error máximo</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold">{within2}</div>
          <div className="text-xs text-slate-500">Dentro de ±2 clientes</div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Serie temporal</h2>
          <Badge variant="info">Días sin predicción: los primeros 42 (ventana inicial de entrenamiento)</Badge>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="real" stroke="#2563eb" strokeWidth={2} dot={false} name="Real" />
            <Line type="monotone" dataKey="prediccion" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} name="Predicción" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
