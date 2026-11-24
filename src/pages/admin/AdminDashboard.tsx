import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MetricCard } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { api, type PlatformStatus } from '../../lib/api';
import { fmtFull } from '../../lib/format';

type Stats = Awaited<ReturnType<typeof api.stats>>;

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [pending, setPending] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    api.stats().then(setStats).catch(() => setStats(null));
    api.platform().then(setPlatform).catch(() => setPlatform(null));
    api.users().then(list => setRoles(list.map(u => u.roleKey))).catch(() => setRoles(null));
    api.stores().then(list => setPending(list.filter(s => s.status === 'Pendiente').length)).catch(() => {});
  }, []);

  const steps = roles
    ? [
        { done: roles.includes('analista'), text: 'Crear la cuenta del analista de datos', to: '/admin/usuarios' },
        { done: roles.includes('comerciante'), text: 'Crear la cuenta del comerciante del comercio piloto', to: '/admin/usuarios' },
        { done: pending === 0, text: `Revisar comercios pendientes de aprobación (${pending})`, to: '/admin/comercios' },
        { done: !!platform?.model, text: 'Modelo predictivo entrenado (se entrena solo al iniciar)', to: '/admin/plataforma' },
      ]
    : [];

  const dateLabel = fmtFull(new Date());
  const services = platform
    ? [
        { name: 'API y base de datos', ok: platform.services.api.ok, detail: 'Datos sensibles cifrados (AES-256)' },
        { name: 'Servicio de ML', ok: platform.services.ml.ok, detail: platform.model ? `${platform.model.algorithm} ${platform.model.version}` : 'Sin modelo' },
        { name: 'Clima Open-Meteo', ok: platform.services.weather.ok, detail: `Pronóstico hasta ${platform.services.weather.forecastUntil ?? '—'}` },
        { name: 'Procesos automáticos', ok: !platform.jobs.lastError, detail: platform.jobs.lastError ?? 'Cada 6 horas' },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Panel Administrativo</h1>
        <p className="text-sm text-slate-500">{dateLabel}</p>
      </div>

      {steps.some(s => !s.done) && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Primeros pasos</h2>
          <ul className="space-y-2">
            {steps.map(s => (
              <li key={s.text} className="flex items-center justify-between gap-3 text-sm">
                <span className={s.done ? 'text-slate-400 line-through' : 'text-slate-700'}>
                  {s.done ? '✅' : '⬜'} {s.text}
                </span>
                {!s.done && (
                  <button onClick={() => navigate(s.to)} className="text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap">
                    Ir →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Comercios registrados" value={stats ? String(stats.stores) : '…'} icon={<span className="text-xl">🏪</span>} color="blue" />
        <MetricCard label="Comercios activos" value={stats ? String(stats.activeStores) : '…'} icon={<span className="text-xl">✅</span>} color="green" />
        <MetricCard label="Usuarios" value={stats ? String(stats.users) : '…'} icon={<span className="text-xl">👥</span>} color="green" />
        <MetricCard
          label="Registros históricos"
          value={stats ? stats.records.toLocaleString('es-CO') : '…'}
          subtext={stats ? `${stats.estimatedRecords} con conteo estimado` : undefined}
          icon={<span className="text-xl">🗂</span>}
          color="blue"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Promedio de clientes por día de la semana</h2>
          <p className="text-xs text-slate-500 mb-4">Todos los comercios, registros reales</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.activity ?? []} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="promedioClientes" fill="#2563eb" radius={[3, 3, 0, 0]} name="Clientes promedio" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Estado del sistema</h2>
          <div className="space-y-3">
            {services.map(s => (
              <div key={s.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <div className="font-medium text-slate-900 text-sm">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.detail}</div>
                </div>
                <Badge variant={s.ok ? 'success' : 'danger'}>{s.ok ? 'Operativo' : 'Con fallas'}</Badge>
              </div>
            ))}
            {!platform && <p className="text-sm text-slate-500">Consultando servicios…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
