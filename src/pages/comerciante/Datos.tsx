import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../components/ui/Toast';
import { useApp } from '../../context/AppContext';
import { api, formatDateLocal, saveBlob, type ImportResult, type LearningStatus } from '../../lib/api';
import { fmtLong, lowerFirst } from '../../lib/format';

type Tab = 'cargar' | 'manual';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Qué pasó con el aprendizaje del sistema después de guardar datos, en palabras sencillas. */
function LearningNotice({ learning }: { learning: LearningStatus }) {
  const { status, newRecords, threshold, firstModel } = learning;
  const link = (
    <Link to="/comerciante/aprendizaje" className="font-medium text-blue-700 underline underline-offset-2 whitespace-nowrap">
      Ver cómo aprende →
    </Link>
  );
  if (status === 'started') {
    return (
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-900 flex items-start gap-2">
        <span className="w-4 h-4 mt-0.5 shrink-0 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span>
          {firstModel ? 'Ya hay suficientes días: el sistema empezó a aprender por primera vez.' : 'Con estos días nuevos el sistema empezó a aprender de nuevo.'}{' '}
          Tarda unos segundos y puedes seguir usando el sistema. {link}
        </span>
      </div>
    );
  }
  const text =
    status === 'excluded'
      ? 'Este es un comercio de prueba: sus datos se guardan, pero el sistema solo aprende con comercios reales.'
      : status === 'busy'
        ? 'El sistema está aprendiendo en este momento. Tus días nuevos entrarán la próxima vez que aprenda.'
        : firstModel
          ? `El sistema empieza a aprender cuando haya ${threshold} días registrados. Van ${newRecords}.`
          : `Van ${plural(newRecords, 'día nuevo', 'días nuevos')} de ${threshold} (entre todos los comercios). Al completarlos, el sistema vuelve a aprender solo.`;
  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
      {text} {link}
    </div>
  );
}

const TEMPLATE_COLUMNS = ['Fecha', 'Clientes', 'Promocion', 'Observaciones'];

/** Ejemplo con los dos últimos días (DD/MM/AAAA), para que no se vea con fechas viejas. */
function templateRows(): string[][] {
  const day = (back: number) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  return [
    [day(2), '14', 'No', ''],
    [day(1), '16', 'Si', 'Descuento 10%'],
  ];
}

/** Separado por punto y coma: así Excel en español lo abre ordenado en columnas. */
const templateCsv = () => [TEMPLATE_COLUMNS, ...templateRows()].map(r => r.join(';')).join('\r\n') + '\r\n';

export function Datos() {
  const { currentStore, refreshStores } = useApp();
  // Lo habitual es anotar el día; cargar un archivo es algo ocasional.
  const [tab, setTab] = useState<Tab>('manual');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'validating' | 'done' | 'importing' | 'imported'>('idle');
  const [validation, setValidation] = useState<ImportResult | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [manualLearning, setManualLearning] = useState<LearningStatus | null>(null);
  const today = formatDateLocal(new Date());
  const [manualForm, setManualForm] = useState({ fecha: today, clientes: '', promocion: false, observaciones: '' });
  const [manualSaved, setManualSaved] = useState<string | null>(null);
  const { showToast, ToastComponent } = useToast();

  async function handleFileSelect(f: File) {
    if (!/\.(csv|xlsx)$/i.test(f.name)) {
      showToast('Formato no soportado. Use un archivo .csv o .xlsx');
      return;
    }
    setFile(f);
    setUploadState('validating');
    try {
      setValidation(await api.importHistorical(currentStore.id, f, true));
      setUploadState('done');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo validar el archivo');
      setFile(null);
      setUploadState('idle');
    }
  }

  async function handleImport() {
    if (!file) return;
    setUploadState('importing');
    try {
      const result = await api.importHistorical(currentStore.id, file);
      await refreshStores();
      setImported(result);
      setValidation(null);
      setUploadState('imported');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al importar el archivo.');
      setUploadState('done');
    }
  }

  function resetUpload() {
    setFile(null);
    setValidation(null);
    setImported(null);
    setUploadState('idle');
  }

  async function handleManualSave() {
    const clients = Number(manualForm.clientes);
    if (manualForm.clientes === '' || !Number.isInteger(clients) || clients < 0) {
      showToast('Indica un número entero válido de clientes.');
      return;
    }
    try {
      const r = await api.addHistorical({
        storeId: currentStore.id,
        date: manualForm.fecha,
        clients,
        promotion: manualForm.promocion,
        observations: manualForm.observaciones,
      });
      setManualSaved(
        r.predicted != null
          ? `Registro guardado. El modelo había previsto ${r.predicted} clientes para ese día.`
          : 'Registro guardado.',
      );
      setManualLearning(r.learning);
      setManualForm(f => ({ ...f, clientes: '', observaciones: '', promocion: false }));
      await refreshStores();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al guardar el registro.');
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <ToastComponent />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Registrar datos</h1>
        <p className="text-sm text-slate-500">
          Anota cuántos clientes atendiste. Solo necesitas ese número: el clima y el calendario los agrega el sistema.
        </p>
      </div>

      <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white w-fit">
        <button
          onClick={() => setTab('manual')}
          className={`px-4 py-2.5 text-sm font-medium transition-all ${tab === 'manual' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          ✏️ Registrar un día
        </button>
        <button
          onClick={() => setTab('cargar')}
          className={`px-4 py-2.5 text-sm font-medium transition-all ${tab === 'cargar' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          📂 Subir archivo (Excel/CSV)
        </button>
      </div>

      {tab === 'cargar' ? (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-slate-900">Plantilla de datos</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Columnas obligatorias: <strong>Fecha</strong> (DD/MM/AAAA o AAAA-MM-DD) y <strong>Clientes</strong>. Las demás son opcionales.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveBlob(new Blob(['﻿' + templateCsv()],{ type: 'text/csv;charset=utf-8' }), 'plantilla-comercia.csv')}
              >
                ⬇ Descargar plantilla
              </Button>
            </div>
            <p className="text-xs text-slate-500 mb-1">Ejemplo de cómo debe verse tu archivo (no son datos tuyos):</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {TEMPLATE_COLUMNS.map(col => (
                      <th key={col} className="border border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {templateRows().map(row => (
                    <tr key={row[0]}>
                      {row.map((v, i) => (
                        <td key={i} className="border border-slate-200 px-2 py-1 text-slate-500 font-mono">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {uploadState === 'idle' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFileSelect(f);
              }}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50'}`}
            >
              <div className="text-4xl mb-3">📁</div>
              <h3 className="font-semibold text-slate-900 mb-1">Arrastra tu archivo aquí</h3>
              <p className="text-sm text-slate-500 mb-4">Formatos aceptados: CSV, Excel (.xlsx)</p>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 text-sm gap-2 cursor-pointer">
                Seleccionar archivo
              </label>
            </div>
          )}

          {uploadState === 'validating' && (
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <div>
                  <div className="font-medium text-slate-900">Validando datos en el servidor…</div>
                  <div className="text-sm text-slate-500">{file?.name}</div>
                </div>
              </div>
            </Card>
          )}

          {uploadState === 'done' && validation && (
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={validation.valid ? 'text-green-500 text-xl' : 'text-red-500 text-xl'}>{validation.valid ? '✓' : '✕'}</span>
                  <span className="font-semibold text-slate-900">Archivo revisado: {file?.name}</span>
                </div>
                <button onClick={resetUpload} aria-label="Quitar archivo" className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-green-50 rounded-xl">
                  <div className="text-2xl font-bold text-green-700">{validation.valid}</div>
                  <div className="text-xs text-green-600">Filas válidas</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-xl">
                  <div className="text-2xl font-bold text-red-700">{validation.errors.length}</div>
                  <div className="text-xs text-red-600">{validation.errors.length === 1 ? 'Problema encontrado' : 'Problemas encontrados'} (esas filas no se importan)</div>
                </div>
              </div>
              {validation.errors.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-red-700 mb-2">Errores encontrados:</div>
                  <ul className="text-xs text-slate-600 list-disc pl-5 space-y-1 max-h-40 overflow-y-auto">
                    {validation.errors.map(e => (
                      <li key={`${e.line}-${e.message}`}>{e.line ? `Fila ${e.line}: ` : ''}{e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.valid > 0 && (
                <div className="mb-4 text-sm text-slate-700 space-y-1">
                  {validation.firstDate && validation.lastDate && (
                    <p>
                      Días del {lowerFirst(fmtLong(validation.firstDate))} al {lowerFirst(fmtLong(validation.lastDate))}.
                    </p>
                  )}
                  <p>
                    <strong>{plural(validation.newDays, 'día nuevo', 'días nuevos')}</strong>
                    {validation.updatedDays > 0 && (
                      <>
                        {' '}y <strong className="text-amber-700">{plural(validation.updatedDays, 'día que ya tenías registrado', 'días que ya tenías registrados')}</strong>:
                        {validation.updatedDays === 1 ? ' su valor se reemplazará' : ' sus valores se reemplazarán'} por los del archivo.
                      </>
                    )}
                  </p>
                </div>
              )}
              <Button onClick={handleImport} disabled={validation.valid === 0}>Importar {plural(validation.valid, 'día', 'días')}</Button>
            </Card>
          )}

          {uploadState === 'importing' && (
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <div className="font-medium text-slate-900">Guardando tus días…</div>
              </div>
            </Card>
          )}

          {uploadState === 'imported' && imported && (
            <Card className="border-green-200">
              <div className="flex items-start gap-3 mb-4">
                <span className="w-8 h-8 shrink-0 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">✓</span>
                <div>
                  <h3 className="font-semibold text-slate-900">Se guardaron {plural(imported.imported, 'día', 'días')}</h3>
                  <p className="text-sm text-slate-600">
                    {plural(imported.newDays, 'nuevo', 'nuevos')}
                    {imported.updatedDays > 0 && ` y ${plural(imported.updatedDays, 'actualizado', 'actualizados')}`}
                    {imported.firstDate && imported.lastDate && `, del ${lowerFirst(fmtLong(imported.firstDate))} al ${lowerFirst(fmtLong(imported.lastDate))}`}.
                    {' '}Ahora tienes {plural(imported.totalRecords, 'día registrado', 'días registrados')}.
                  </p>
                  {imported.errors.length > 0 && (
                    <p className="text-sm text-amber-700 mt-1">{plural(imported.errors.length, 'fila tenía', 'filas tenían')} errores y no se guardaron.</p>
                  )}
                </div>
              </div>
              {imported.learning && <LearningNotice learning={imported.learning} />}
              <div className="flex flex-wrap gap-3 mt-4">
                <Link
                  to="/comerciante/historico"
                  className="inline-flex items-center justify-center font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 text-sm"
                >
                  Ver mis días en el Historial
                </Link>
                <Button variant="outline" onClick={resetUpload}>Subir otro archivo</Button>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <h2 className="font-semibold text-slate-900 mb-1">Registrar el flujo de un día</h2>
          <p className="text-sm text-slate-500 mb-4">Anota cuántos clientes ingresaron. Solo se registran días que ya ocurrieron.</p>
          {manualSaved && (
            <div className="mb-4 space-y-2">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
                <span className="text-lg">✓</span> {manualSaved}
              </div>
              {manualLearning && <LearningNotice learning={manualLearning} />}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Fecha" type="date" max={today} value={manualForm.fecha} onChange={e => setManualForm(f => ({ ...f, fecha: e.target.value }))} />
            <Input label="Número de clientes" type="number" min={0} placeholder="14" value={manualForm.clientes} onChange={e => setManualForm(f => ({ ...f, clientes: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 mt-4 text-sm text-slate-700">
            <input type="checkbox" checked={manualForm.promocion} onChange={e => setManualForm(f => ({ ...f, promocion: e.target.checked }))} />
            Había una promoción activa ese día
          </label>
          <div className="mt-4">
            <Textarea label="Observaciones (opcional)" placeholder="Cortes de energía, obras en la vía, eventos…" rows={3} value={manualForm.observaciones} onChange={e => setManualForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
          <Button className="mt-4" onClick={handleManualSave}>Guardar registro</Button>
        </Card>
      )}
    </div>
  );
}
