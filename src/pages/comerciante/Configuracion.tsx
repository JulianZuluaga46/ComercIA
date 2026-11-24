import { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { api, type UserSettings } from '../../lib/api';
import { passwordError } from '../../data/stores';

export function Configuracion() {
  const { logout, currentRole, canResetPassword, passwordChanged } = useApp();
  const navigate = useNavigate();
  const { showToast, ToastComponent } = useToast();
  const [prefs, setPrefs] = useState<UserSettings>({
    emailNotif: true,
    smsNotif: false,
    pushNotif: true,
    weeklyReport: true,
    monthlyReport: true,
  });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    api.settings().then(setPrefs).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await api.saveSettings(prefs);
      setPrefs(saved);
      showToast('Preferencias guardadas.');
    } catch {
      showToast('No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePassword() {
    const err = passwordError(pw.next);
    if (err) {
      showToast(err);
      return;
    }
    if (pw.next !== pw.confirm) {
      showToast('Las contraseñas nuevas no coinciden.');
      return;
    }
    try {
      await api.changePassword(canResetPassword && !pw.current ? undefined : pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwOpen(false);
      passwordChanged();
      showToast('Contraseña actualizada.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.');
    }
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  const SECTIONS =
    currentRole === 'comerciante'
      ? [
          {
            title: 'Alertas',
            items: [
              {
                key: 'pushNotif' as const,
                label: 'Alertas de flujo alto o bajo',
                desc: 'Aviso en «Alertas» cuando el modelo prevé un día fuera de tus umbrales (próximos 7 días).',
              },
            ],
          },
          {
            title: 'Reportes automáticos (PDF en «Reportes»)',
            items: [
              { key: 'weeklyReport' as const, label: 'Reporte semanal', desc: 'Cada lunes: predicción de la semana.' },
              { key: 'monthlyReport' as const, label: 'Reporte mensual', desc: 'El día 1: histórico del mes anterior.' },
            ],
          },
        ]
      : [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <ToastComponent />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500">Preferencias y seguridad de tu cuenta.</p>
      </div>

      {SECTIONS.map(section => (
        <Card key={section.title}>
          <h2 className="font-semibold text-slate-900 mb-4">{section.title}</h2>
          <div className="space-y-4">
            {section.items.map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900 text-sm">{item.label}</div>
                  <div className="text-xs text-slate-500">{item.desc}</div>
                </div>
                <button
                  onClick={() => setPrefs(p => ({ ...p, [item.key]: !p[item.key] }))}
                  className={`relative w-11 h-6 rounded-full transition-all ${prefs[item.key] ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefs[item.key] ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">Seguridad</h2>
        {canResetPassword && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            Ingresaste con un código por correo: durante los próximos minutos puedes crear una contraseña nueva sin escribir la
            anterior.
          </div>
        )}
        {!pwOpen && !canResetPassword ? (
          <Button variant="outline" className="w-full justify-start" onClick={() => setPwOpen(true)}>
            🔑 Cambiar contraseña
          </Button>
        ) : (
          <div className="space-y-3">
            {!canResetPassword && (
              <Input label="Contraseña actual" type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
            )}
            <Input label="Nueva contraseña" type="password" hint="Mínimo 8 caracteres, con letras y números." value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
            <Input label="Confirmar nueva" type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
            <div className="flex gap-2">
              <Button onClick={handlePassword}>Guardar contraseña</Button>
              <Button variant="outline" onClick={() => setPwOpen(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        {SECTIONS.length > 0 && <Button onClick={handleSave} loading={saving}>Guardar preferencias</Button>}
        <Button variant="danger" onClick={handleLogout}>Cerrar sesión</Button>
      </div>
    </div>
  );
}
