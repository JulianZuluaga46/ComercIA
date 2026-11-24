import { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useApp } from '../../context/AppContext';
import { useHistorical } from '../../hooks/usePrediction';

export function Dataset() {
  const { currentStore, stores, setCurrentStore } = useApp();
  const [search, setSearch] = useState('');
  const { data, loading } = useHistorical(currentStore.id, 730);

  const filtered = useMemo(
    () =>
      data.filter(
        r =>
          !search ||
          Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())),
      ),
    [data, search],
  );

  const shown = filtered.slice(-40).reverse();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dataset</h1>
        <p className="text-sm text-slate-500">
          Registros de {currentStore.name || 'el comercio seleccionado'} con el clima diario de Montería (Open-Meteo).
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-slate-500 mb-1">Registros en BD</div>
          <div className="text-2xl font-bold text-slate-900 font-mono">{loading ? '…' : data.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">Conteos estimados</div>
          <div className="text-2xl font-bold text-slate-900 font-mono">{loading ? '…' : data.filter(r => r.estimated).length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">Comercio</div>
          <select
            className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
            value={currentStore.id}
            onChange={e => {
              const next = stores.find(s => s.id === e.target.value);
              if (next) setCurrentStore(next);
            }}
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Card>
      </div>

      <Card padding="none">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <Input
            placeholder="Filtrar registros..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={<span className="text-sm">🔍</span>}
            className="max-w-xs"
          />
          <Badge variant="info">Mostrando {shown.length} de {filtered.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Cargando dataset desde la API…</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Fecha', 'Clientes', 'Predicho', 'T. máx', 'Lluvia', 'Humedad', 'Clima', 'Origen'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, i) => (
                  <tr key={`${row.date}-${i}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-600">{row.date}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-900">{row.real}</td>
                    <td className="px-4 py-2.5 text-blue-600">{row.predicted ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.temperature != null ? `${row.temperature} °C` : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.precipitation != null ? `${row.precipitation} mm` : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.humidity != null ? `${row.humidity}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.condition ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {row.estimated ? <Badge variant="warning" size="sm">Estimado</Badge> : <Badge variant="success" size="sm">Observado</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
