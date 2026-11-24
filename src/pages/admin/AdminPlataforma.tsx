import { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { api, type FeedbackSummary, type PlatformStatus } from '../../lib/api';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO') : '—');

export function AdminPlataforma() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);

  function load() {
    api.platform().then(setStatus).catch(e => setError(e instanceof Error ? e.message : 'Error'));
    api.feedbackSummary().then(setFeedback).catch(() => {});
  }
  useEffect(load, []);

  if (error) return <div className="text-center py-20 text-red-600">{error}</div>;
  if (!status) return <div className="text-center py-20 text-slate-500">Consultando servicios…</div>;

  const s = status.services;
  const services = [
    { name: 'API y base de datos', ok: s.api.ok && s.database.ok, icon: '🗄', detail: `En línea desde ${fmt(status.startedAt)}` },
    { name: 'Servicio de ML (Python)', ok: s.ml.ok, icon: '🤖', detail: s.ml.ok ? 'Respondiendo' : 'No responde: revise server/ml' },
    {
      name: 'Clima (Open-Meteo)',
      ok: s.weather.ok,
      icon: '🌤',
      detail: `Última sincronización: ${fmt(s.weather.lastSync)} · ${s.weather.message}`,
    },
    {
      name: 'Correo (códigos de acceso)',
      ok: s.mail.ok,
      icon: '✉️',
      detail: !s.mail.configured
        ? 'SMTP sin configurar: los códigos se muestran en la terminal del servidor. Ver README → Correo.'
        : s.mail.lastError ?? 'Enviando correos',
    },
    {
      name: 'Procesos automáticos',
      ok: !status.jobs.lastError,
      icon: '⏱',
      detail: status.jobs.lastError ?? `Última ejecución: ${fmt(status.jobs.lastRun)}`,
    },
  ];
  // El correo sin configurar es un paso pendiente, no una falla: los códigos siguen disponibles en la terminal.
  const isPending = (name: string) => name.startsWith('Correo') && !s.mail.configured;
  const allOk = services.every(x => x.ok || isPending(x.name));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estado de la plataforma</h1>
          <p className="text-sm text-slate-500">Estado actual de los servicios de ComercIA.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>Actualizar</Button>
      </div>

      <div className={`${allOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'} border rounded-xl p-5 flex items-center gap-4`}>
        <div className="text-2xl">{allOk ? '✅' : '⚠️'}</div>
        <div className={`font-bold text-lg ${allOk ? 'text-green-900' : 'text-amber-900'}`}>
          {allOk ? 'Todos los servicios operativos' : 'Hay servicios con problemas'}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {services.map(service => (
          <Card key={service.name}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{service.icon}</span>
                <div className="font-semibold text-slate-900 text-sm">{service.name}</div>
              </div>
              {isPending(service.name)
                ? <Badge variant="warning">Por configurar</Badge>
                : <Badge variant={service.ok ? 'success' : 'danger'}>{service.ok ? 'Operativo' : 'Con fallas'}</Badge>}
            </div>
            <div className="text-xs text-slate-500">{service.detail}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">Información del sistema</h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {[
            { label: 'Modelo activo', value: status.model ? `${status.model.algorithm} ${status.model.version}` : 'Ninguno' },
            { label: 'Último entrenamiento', value: fmt(status.model?.createdAt ?? null) },
            { label: 'Último reentrenamiento automático', value: fmt(status.jobs.lastRetrain) },
            { label: 'Días de clima almacenados', value: String(s.weather.days) },
            { label: 'Pronóstico disponible hasta', value: s.weather.forecastUntil ?? '—' },
            { label: 'Alertas generadas (esta sesión)', value: String(status.jobs.alertsCreated) },
            { label: 'Notificaciones totales', value: String(status.notifications) },
            { label: 'Reportes generados', value: String(status.reports) },
          ].map(r => (
            <div key={r.label} className="flex justify-between border-b border-slate-50 pb-2 gap-4">
              <span className="text-slate-500">{r.label}</span>
              <span className="font-medium text-slate-900 text-right">{r.value}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold text-slate-900 mb-1">Evaluación de los comerciantes</h2>
          <p className="text-xs text-slate-500 mb-3">Lo responden en «Ayuda». No cuenta los comercios de prueba.</p>
          {!feedback || feedback.n === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay respuestas.</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Respuestas</span><strong>{feedback.n}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Facilidad de uso</span><strong>{feedback.easeOfUse} / 5</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Utilidad para decidir</span><strong>{feedback.usefulness} / 5</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Acierto percibido</span><strong>{feedback.accuracy} / 5</strong></div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lo usó sin ayuda (meta RNF-01: 90 %)</span>
                <strong className={(feedback.noHelpPct ?? 0) >= 90 ? 'text-green-700' : 'text-amber-700'}>{feedback.noHelpPct} %</strong>
              </div>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold text-slate-900 mb-1">Copias de seguridad</h2>
          <p className="text-xs text-slate-500 mb-3">
            Se crea una al día en <code>server/backups</code> (se guardan 14). Guarde aparte <code>server/.env</code>: sin esa clave
            los datos cifrados no se pueden leer.
          </p>
          {status.backups.length === 0 && <p className="text-sm text-slate-500">Aún no hay copias.</p>}
          <ul className="text-sm text-slate-700 space-y-1">
            {status.backups.map(b => <li key={b.name} className="flex justify-between gap-3"><span className="break-all">{b.name}</span><span className="text-slate-400 whitespace-nowrap">{b.sizeKb} KB</span></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
