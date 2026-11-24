import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useApp } from '../context/AppContext';
import { passwordError } from '../data/stores';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

/** Configuración inicial: crea la cuenta de administrador la primera vez que se usa el sistema. */
export function Setup() {
  const { startSession } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .setupStatus()
      .then(s => !s.needsSetup && navigate('/login', { replace: true }))
      .catch(() => {});
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = passwordError(form.password);
    if (pwErr) return setError(pwErr);
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden');
    setLoading(true);
    setError('');
    try {
      const { token, user } = await api.setup({ name: form.name, email: form.email, password: form.password });
      await startSession(token, user);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">C</span>
          </div>
          <span className="font-bold text-slate-900 text-xl">ComercIA</span>
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Configuración inicial</h1>
          <p className="text-sm text-slate-500 mb-6">
            Es la primera vez que se usa ComercIA. Crea la cuenta del <strong>administrador</strong>: desde ella podrás
            registrar a los analistas y a los comerciantes.
          </p>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Nombre completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            <Input label="Correo electrónico" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            <Input
              label="Contraseña"
              type="password"
              hint="Mínimo 8 caracteres, con letras y números."
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
            <Input label="Confirmar contraseña" type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Crear administrador y entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
