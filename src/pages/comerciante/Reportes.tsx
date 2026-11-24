import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { api, formatDateLocal, saveBlob, type SavedReport } from '../../lib/api';
import { useApp } from '../../context/AppContext';

const FORMAT_ICON: Record<string, string> = { PDF: '📕', Excel: '📗', CSV: '📄' };

export function Reportes() {
  const { currentStore } = useApp();
  const [tipo, setTipo] = useState('Predicciones');
  const [formato, setFormato] = useState('PDF');
  const today = new Date();
  const inAWeek = new Date(today);
  inAWeek.setDate(inAWeek.getDate() + 6);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const [fechaInicio, setFechaInicio] = useState(formatDateLocal(today));
  const [fechaFin, setFechaFin] = useState(formatDateLocal(inAWeek));
  const [state, setState] = useState<'idle' | 'generating' | 'done'>('idle');
  const [latest, setLatest] = useState<SavedReport | null>(null);
  const [recent, setRecent] = useState<SavedReport[]>([]);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    api.reports().then(setRecent).catch(() => setRecent([]));
  }, []);

  function onTipo(t: string) {
    setTipo(t);
    // Predicciones/recomendaciones miran hacia adelante; histórico hacia atrás.
    if (t === 'Histórico') {
      setFechaInicio(formatDateLocal(monthAgo));
      setFechaFin(formatDateLocal(today));
    } else if (t === 'Predicciones' || t === 'Recomendaciones') {
      setFechaInicio(formatDateLocal(today));
      setFechaFin(formatDateLocal(inAWeek));
    }
  }

  async function handleGenerate() {
    setState('generating');
    try {
      const report = await api.createReport({ tipo, formato, fechaInicio, fechaFin, storeId: currentStore.id });
      setLatest(report);
      setRecent(prev => [report, ...prev]);
      setState('done');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo generar el reporte.');
      setState('idle');
    }
  }

  async function handleDownload(report: SavedReport) {
    try {
      const { blob, filename } = await api.downloadReport(report.id);
      saveBlob(blob, filename);
      showToast('Reporte descargado.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo descargar.');
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <ToastComponent />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Generar reporte</h1>
        <p className="text-sm text-slate-500">Exporta predicciones, histórico o recomendaciones de {currentStore.name || 'tu comercio'} en PDF, Excel o CSV.</p>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">Nuevo reporte</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <Select label="Tipo de reporte" value={tipo} onChange={e => onTipo(e.target.value)}>
            <option>Predicciones</option>
            <option>Recomendaciones</option>
            <option>Histórico</option>
            <option>Métricas</option>
          </Select>
          <Select label="Formato" value={formato} onChange={e => setFormato(e.target.value)}>
            <option>PDF</option>
            <option>Excel</option>
            <option>CSV</option>
          </Select>
          {tipo !== 'Métricas' && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Fecha inicial</label>
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Fecha final</label>
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </>
          )}
        </div>
        {(tipo === 'Predicciones' || tipo === 'Recomendaciones') && (
          <p className="text-xs text-slate-500 mb-4">Máximo 62 días. Más allá de 16 días el clima se estima con el promedio histórico de Montería.</p>
        )}

        {state === 'idle' && <Button onClick={handleGenerate}>Generar reporte</Button>}

        {state === 'generating' && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-700 font-medium">Preparando reporte…</span>
          </div>
        )}

        {state === 'done' && latest && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
              <span className="text-green-600 text-xl">✓</span>
              <div>
                <div className="font-semibold text-green-800">Reporte guardado</div>
                <div className="text-xs text-green-600">{latest.name}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => handleDownload(latest)}>⬇ Descargar {latest.formato}</Button>
              <Button variant="outline" onClick={() => setState('idle')}>Generar otro</Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">Reportes recientes</h2>
        <div className="space-y-3">
          {recent.length === 0 && <p className="text-sm text-slate-500">Aún no hay reportes guardados.</p>}
          {recent.map(r => (
            <div key={r.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-2xl">{FORMAT_ICON[r.formato] ?? '📊'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{r.name}</div>
                <div className="text-xs text-slate-500">{r.tipo} · {r.formato} · {new Date(r.createdAt).toLocaleDateString('es-CO')}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleDownload(r)}>Descargar</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
