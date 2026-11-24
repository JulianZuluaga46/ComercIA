import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useApp } from '../context/AppContext';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const ROLE_REDIRECT = {
  comerciante: '/comerciante',
  admin: '/admin',
  analista: '/analista',
};

export function Login() {
  const { login, loginWithCode, currentRole } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function switchMode(m: 'password' | 'code') {
    setMode(m);
    setError('');
    setInfo('');
    setForgotOpen(false);
  }

  async function handleRequestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await api.requestLoginCode(email);
      setInfo(r.message);
      setCodeSent(true);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await loginWithCode(email, code);
      navigate(ROLE_REDIRECT[user.role]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentRole) {
      navigate(ROLE_REDIRECT[currentRole], { replace: true });
      return;
    }
    // Primera vez: no hay administrador todavía
    api
      .setupStatus()
      .then(s => s.needsSetup && navigate('/configuracion-inicial', { replace: true }))
      .catch(() => {});
  }, [currentRole, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await login(email, password);
      navigate(ROLE_REDIRECT[user.role]);
    } catch (e) {
      // El servidor informa los intentos restantes y bloquea tras 5 fallos (RF-02).
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex">
      <div className="hidden lg:flex w-1/2 bg-blue-600 text-white p-12 flex-col justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
            <span className="text-blue-600 font-bold text-base">C</span>
          </div>
          <span className="font-bold text-xl">ComercIA</span>
        </Link>
        <div>
          <h2 className="text-3xl font-bold mb-4 leading-tight">
            Anticipa cuántos clientes llegarán a tu comercio.
          </h2>
          <p className="text-blue-100 text-base leading-relaxed">
            Predicciones diarias basadas en tu historial, el clima de Montería y el calendario de pagos y festivos, con
            recomendaciones para planear inventario y personal.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-blue-50">
            {[
              '📅 Predicción para hoy, la semana y el mes',
              '🌧 Clima real y pronóstico de Montería',
              '💡 Recomendaciones y alertas automáticas',
              '📄 Reportes en PDF y Excel',
            ].map(t => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-blue-200">Universidad de Córdoba · Programa de Ingeniería de Sistemas</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">ComercIA</span>
          </Link>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Iniciar sesión</h1>
            <p className="text-sm text-slate-500 mb-5">Elige cómo quieres ingresar.</p>

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-5">
              {([
                ['password', '🔑 Contraseña'],
                ['code', '✉️ Código por correo'],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
            {info && mode === 'code' && !error && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{info}</div>
            )}

            {mode === 'code' ? (
              !codeSent ? (
                <form onSubmit={handleRequestCode} className="space-y-4">
                  <Input
                    label="Correo electrónico"
                    type="email"
                    autoComplete="username"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                  <p className="text-xs text-slate-500">Te enviaremos un código de 6 dígitos para entrar sin contraseña.</p>
                  <Button type="submit" className="w-full" size="lg" loading={loading}>
                    Enviarme el código
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div className="text-sm text-slate-600">
                    Código enviado a <strong>{email}</strong>.{' '}
                    <button type="button" className="text-blue-600 hover:text-blue-700" onClick={() => { setCodeSent(false); setCode(''); setInfo(''); }}>
                      Cambiar correo
                    </button>
                  </div>
                  <Input
                    label="Código de 6 dígitos"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                  />
                  <Button type="submit" className="w-full" size="lg" loading={loading} disabled={code.length !== 6}>
                    Ingresar
                  </Button>
                  <button
                    type="button"
                    disabled={cooldown > 0 || loading}
                    onClick={() => handleRequestCode()}
                    className="w-full text-sm text-blue-600 hover:text-blue-700 disabled:text-slate-400"
                  >
                    {cooldown > 0 ? `Reenviar código en ${cooldown} s` : 'Reenviar código'}
                  </button>
                </form>
              )
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Correo electrónico"
                type="email"
                autoComplete="username"
                placeholder="tu@correo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <Input
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <div className="flex justify-end">
                <button type="button" onClick={() => setForgotOpen(o => !o)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              {forgotOpen && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 space-y-2">
                  <p>
                    Entra con un <strong>código por correo</strong> y luego crea una contraseña nueva en «Configuración».
                  </p>
                  <button type="button" onClick={() => switchMode('code')} className="font-medium text-blue-700 underline">
                    Entrar con código →
                  </button>
                  <p className="text-xs text-blue-700">Si ya no tienes acceso a tu correo, pide al administrador una contraseña temporal.</p>
                </div>
              )}
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                Iniciar sesión
              </Button>
            </form>
            )}

            <p className="text-center text-sm text-slate-500 mt-6">
              ¿Tienes un comercio y aún no tienes cuenta?{' '}
              <Link to="/registro" className="text-blue-600 hover:text-blue-700 font-medium">
                Registra tu comercio
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
