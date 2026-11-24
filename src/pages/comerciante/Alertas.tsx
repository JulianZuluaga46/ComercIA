import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';

const ALERT_TYPE_CONFIG = {
  danger: { dot: '🔴', bg: 'bg-red-50', border: 'border-red-100' },
  warning: { dot: '🟡', bg: 'bg-amber-50', border: 'border-amber-100' },
  info: { dot: '🔵', bg: 'bg-blue-50', border: 'border-blue-100' },
  success: { dot: '🟢', bg: 'bg-green-50', border: 'border-green-100' },
};

export function Alertas() {
  const { dismissNotification, notifications, currentStore, loadNotifications } = useApp();
  const { showToast, ToastComponent } = useToast();
  const [t, setT] = useState({ bajo: 0, alto: 0, critico: 0 });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!currentStore.id) return;
    api
      .alertSettings(currentStore.id)
      .then(s => setT({ bajo: s.bajo, alto: s.alto, critico: s.critico }))
      .catch(() => {});
  }, [currentStore.id]);

  const set = (k: keyof typeof t) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setT(prev => ({ ...prev, [k]: Number(e.target.value) }));
    setDirty(true);
  };
  const valid = t.bajo < t.alto && t.alto <= t.critico;

  async function handleSave() {
    try {
      await api.saveAlertSettings({ storeId: currentStore.id, bajo: t.bajo, normalMin: t.bajo, normalMax: t.alto - 1, alto: t.alto, critico: t.critico });
      setDirty(false);
      showToast('Listo. Se aplican a las próximas predicciones y alertas.');
      setTimeout(() => void loadNotifications(), 3000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudieron guardar.');
    }
  }

  const pending = notifications.filter(n => !n.read);
  const read = notifications.filter(n => n.read);
  const input = 'w-16 border border-slate-300 rounded-lg px-2 py-1 text-center font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <ToastComponent />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Alertas</h1>
        <p className="text-sm text-slate-500">Te avisamos cuando se espera un día fuera de lo normal en los próximos 7 días.</p>
      </div>

      <section className="space-y-3">
        {pending.length === 0 && (
          <Card><p className="text-sm text-slate-500">No tienes alertas pendientes. El sistema revisa tu semana cada 6 horas.</p></Card>
        )}
        {pending.map(alert => {
          const c = ALERT_TYPE_CONFIG[alert.type] || ALERT_TYPE_CONFIG.info;
          return (
            <div key={alert.id} className={`flex items-start gap-3 p-4 rounded-xl border ${c.bg} ${c.border}`}>
              <span className="text-lg flex-shrink-0">{c.dot}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900">{alert.title}</div>
                <p className="text-sm text-slate-600 mt-0.5">{alert.message}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => dismissNotification(alert.id)}>Entendido</Button>
            </div>
          );
        })}
        {read.length > 0 && (
          <details className="text-sm text-slate-500">
            <summary className="cursor-pointer">Ya revisadas ({read.length})</summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              {read.map(n => <li key={n.id}>{n.title}</li>)}
            </ul>
          </details>
        )}
      </section>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-1">¿Cuándo quieres que te avisemos?</h2>
        <p className="text-sm text-slate-500 mb-4">Ajusta los números según lo que es normal en tu negocio (promedio actual: {currentStore.avgDailyClients} clientes al día).</p>

        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg bg-sky-50">
            <span><strong className="text-sky-700">Día flojo:</strong> menos de</span>
            <span className="flex items-center gap-2"><input type="number" min={0} className={input} value={t.bajo} onChange={set('bajo')} /> clientes</span>
          </label>
          <label className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg bg-amber-50">
            <span><strong className="text-amber-700">Día alto:</strong> desde</span>
            <span className="flex items-center gap-2"><input type="number" min={0} className={input} value={t.alto} onChange={set('alto')} /> clientes</span>
          </label>
          <label className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg bg-red-50">
            <span><strong className="text-red-700">Día crítico:</strong> más de</span>
            <span className="flex items-center gap-2"><input type="number" min={0} className={input} value={t.critico} onChange={set('critico')} /> clientes</span>
          </label>
        </div>

        {valid ? (
          <p className="text-sm text-green-700 mt-3">
            Un día <strong>normal</strong> para ti será de {t.bajo} a {t.alto - 1} clientes.
          </p>
        ) : (
          <p className="text-sm text-red-600 mt-3">Revisa los números: el día flojo debe ser menor que el alto, y el alto no puede superar al crítico.</p>
        )}
        <Button className="mt-4" onClick={handleSave} disabled={!valid || !dirty}>Guardar</Button>
      </Card>
    </div>
  );
}
