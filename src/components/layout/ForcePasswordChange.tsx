import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api, ApiError } from '../../lib/api';
import { passwordError } from '../../data/stores';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

/** Se muestra cuando el administrador restableció la contraseña: hay que cambiarla antes de continuar. */
export function ForcePasswordChange() {
  const { passwordChanged, logout, currentUser, canResetPassword } = useApp();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = passwordError(pw.next);
    if (err) return setError(err);
    if (pw.next !== pw.confirm) return setError('Las contraseñas nuevas no coinciden');
    setLoading(true);
    setError('');
    try {
      await api.changePassword(pw.current || undefined, pw.next);
      passwordChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <div className="text-3xl mb-2">🔑</div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Crea tu nueva contraseña</h1>
        <p className="text-sm text-slate-500 mb-6">
          Hola {currentUser?.name?.split(' ')[0]}. Ingresaste con una contraseña temporal; por seguridad debes cambiarla
          antes de continuar.
        </p>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!canResetPassword && (
            <Input label="Contraseña temporal" type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} required />
          )}
          <Input label="Nueva contraseña" type="password" hint="Mínimo 8 caracteres, con letras y números." value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} required />
          <Input label="Confirmar nueva contraseña" type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} required />
          <Button type="submit" className="w-full" loading={loading}>Guardar y continuar</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={logout}>Cerrar sesión</Button>
        </form>
      </div>
    </div>
  );
}
