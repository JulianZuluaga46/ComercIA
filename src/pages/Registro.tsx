import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CATEGORIES, passwordError } from '../data/stores';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';

type Step = 'info' | 'ubicacion' | 'confirmacion';

export function Registro() {
  const navigate = useNavigate();
  const { startSession } = useApp();
  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [mapPos, setMapPos] = useState({ x: 48, y: 45 });
  const [form, setForm] = useState({
    nombreComercio: '',
    categoria: CATEGORIES[0],
    direccion: '',
    empleados: '',
    antiguedad: '',
    promedioDiario: '',
    nombreUsuario: '',
    email: '',
    password: '',
  });
  const [registerError, setRegisterError] = useState('');

  function handleChange(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function validateInfo(): string | null {
    if (!form.nombreComercio.trim()) return 'Escribe el nombre del comercio.';
    if (!form.nombreUsuario.trim()) return 'Escribe tu nombre.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Escribe un correo electrónico válido.';
    const pw = passwordError(form.password);
    if (pw) return pw;
    if (!form.promedioDiario || Number(form.promedioDiario) < 1) return 'Indica cuántos clientes atiendes en un día normal.';
    return null;
  }

  async function handleNext() {
    if (step === 'info') {
      const err = validateInfo();
      setRegisterError(err ?? '');
      if (!err) setStep('ubicacion');
    } else if (step === 'ubicacion') {
      setStep('confirmacion');
    } else {
      setLoading(true);
      setRegisterError('');
      try {
        const { token, user } = await api.register({
          email: form.email,
          password: form.password,
          name: form.nombreUsuario,
          store: {
            name: form.nombreComercio,
            category: form.categoria,
            address: form.direccion || 'Centro, Montería',
            employees: parseInt(form.empleados, 10) || 0,
            yearsInBusiness: parseInt(form.antiguedad, 10) || 0,
            avgDailyClients: parseInt(form.promedioDiario, 10),
            mapX: mapPos.x,
            mapY: mapPos.y,
            lat: 8.75 + (50 - mapPos.y) * 0.0004,
            lng: -75.89 + (mapPos.x - 50) * 0.0004,
          },
        });
        await startSession(token, user);
        navigate('/comerciante');
      } catch (e) {
        setRegisterError(e instanceof Error ? e.message : 'Error al registrar');
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold">C</span>
            </div>
            <span className="font-bold text-slate-900 text-xl">ComercIA</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Registra tu comercio</h1>
          <p className="text-slate-500 text-sm mt-1">Comienza a predecir el flujo de clientes</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-6">
          {(['info', 'ubicacion', 'confirmacion'] as Step[]).map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`flex-1 h-1.5 rounded-full transition-all ${
                step === 'info' && i === 0 ? 'bg-blue-600' :
                step === 'ubicacion' && i <= 1 ? 'bg-blue-600' :
                step === 'confirmacion' ? 'bg-blue-600' : 'bg-slate-200'
              }`} />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {step === 'info' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-900">Información del comercio</h2>
              <Input
                label="Nombre del comercio"
                placeholder="Nombre de tu negocio"
                value={form.nombreComercio}
                onChange={e => handleChange('nombreComercio', e.target.value)}
              />
              <Input
                label="Tu nombre"
                placeholder="Nombre del responsable"
                value={form.nombreUsuario}
                onChange={e => handleChange('nombreUsuario', e.target.value)}
              />
              <Input
                label="Correo electrónico"
                type="email"
                placeholder="tu@correo.com"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
              />
              <Input
                label="Contraseña"
                type="password"
                placeholder="Mínimo 8 caracteres, con letras y números"
                value={form.password}
                onChange={e => handleChange('password', e.target.value)}
              />
              {registerError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{registerError}</div>
              )}
              <Select
                label="Categoría"
                value={form.categoria}
                onChange={e => handleChange('categoria', e.target.value)}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Select>
              <Input
                label="Dirección"
                placeholder="Calle 30 #5-22, Centro, Montería"
                value={form.direccion}
                onChange={e => handleChange('direccion', e.target.value)}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="N° de empleados"
                  type="number"
                  placeholder="3"
                  value={form.empleados}
                  onChange={e => handleChange('empleados', e.target.value)}
                />
                <Input
                  label="Antigüedad (años)"
                  type="number"
                  placeholder="5"
                  value={form.antiguedad}
                  onChange={e => handleChange('antiguedad', e.target.value)}
                />
              </div>
              <Input
                label="Promedio aproximado de clientes diarios"
                type="number"
                placeholder="25"
                value={form.promedioDiario}
                onChange={e => handleChange('promedioDiario', e.target.value)}
              />
              <Button className="w-full" onClick={handleNext}>
                Continuar → Seleccionar ubicación
              </Button>
            </div>
          )}

          {step === 'ubicacion' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-900">¿Dónde está ubicado tu comercio?</h2>
              <p className="text-sm text-slate-500">Haz clic en el mapa o arrastra el marcador para seleccionar la ubicación exacta.</p>
              <MonteriaMap markerPos={mapPos} setMarkerPos={setMapPos} />
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-xs text-green-600 font-medium">Ubicación seleccionada</div>
                <div className="text-sm font-semibold text-green-800">{form.direccion || 'Centro de Montería'}</div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep('info')}>Atrás</Button>
                <Button className="flex-1" onClick={handleNext}>Confirmar ubicación</Button>
              </div>
            </div>
          )}

          {step === 'confirmacion' && (
            <div className="space-y-4">
              <h2 className="font-bold text-slate-900 text-xl">Revisa y confirma</h2>
              <div className="text-left p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span className="text-slate-500">Comercio</span><span className="font-medium text-right">{form.nombreComercio}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Responsable</span><span className="font-medium text-right">{form.nombreUsuario}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Correo</span><span className="font-medium text-right">{form.email}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Categoría</span><span className="font-medium">{form.categoria}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Dirección</span><span className="font-medium text-right">{form.direccion || 'Centro, Montería'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Clientes por día</span><span className="font-medium">{form.promedioDiario}</span></div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-1">
                <p>• El administrador revisará y aprobará tu comercio.</p>
                <p>• Para predicciones confiables registra el flujo diario: se necesitan al menos 28 días (4 semanas).</p>
              </div>
              {registerError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{registerError}</div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep('ubicacion')}>Atrás</Button>
                <Button className="flex-1" onClick={handleNext} loading={loading}>Crear mi cuenta</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MonteriaMap({
  markerPos,
  setMarkerPos,
}: {
  markerPos: { x: number; y: number };
  setMarkerPos: (p: { x: number; y: number }) => void;
}) {
  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMarkerPos({ x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) });
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-slate-200" style={{ height: 240 }}>
        <svg
          width="100%" height="100%" viewBox="0 0 100 80"
          className="cursor-crosshair select-none"
          onClick={handleMapClick}
        >
          {/* Background */}
          <rect width="100" height="80" fill="#e8f0e8" />
          {/* River Sinú */}
          <path d="M 0 55 Q 15 52 25 56 Q 40 62 55 58 Q 65 55 100 58" fill="none" stroke="#a8c4d4" strokeWidth="6" opacity="0.8" />
          <text x="10" y="63" fontSize="2.5" fill="#6b9ab0" fontWeight="600">Río Sinú</text>

          {/* Main streets */}
          {[20, 30, 42, 55, 65].map(y => (
            <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#d0cfc8" strokeWidth="0.8" />
          ))}
          {[20, 30, 40, 50, 62, 75].map(x => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="80" stroke="#d0cfc8" strokeWidth="0.8" />
          ))}

          {/* Blocks */}
          {[[22,22,7,7],[22,32,7,8],[32,22,7,7],[32,32,7,8],[42,22,7,7],[42,32,7,8],
            [52,22,7,7],[52,32,7,8],[22,43,7,9],[32,43,7,9],[42,43,7,9]].map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="#f5f0eb" stroke="#ccc" strokeWidth="0.3" rx="0.5" />
          ))}

          {/* Street labels */}
          <text x="22" y="19.5" fontSize="2" fill="#888" fontWeight="500">Cl 30</text>
          <text x="22" y="29.5" fontSize="2" fill="#888" fontWeight="500">Cl 29</text>
          <text x="22" y="41.5" fontSize="2" fill="#888" fontWeight="500">Cl 28</text>
          <text x="30" y="17" fontSize="2" fill="#888" fontWeight="500" textAnchor="middle">Kr 5</text>
          <text x="40" y="17" fontSize="2" fill="#888" fontWeight="500" textAnchor="middle">Kr 6</text>
          <text x="50" y="17" fontSize="2" fill="#888" fontWeight="500" textAnchor="middle">Kr 7</text>

          {/* Parque Simón Bolívar */}
          <rect x="36" y="26" width="8" height="7" fill="#b8d8b8" stroke="#90b090" strokeWidth="0.5" rx="1" />
          <text x="40" y="30" fontSize="2" fill="#4a7a4a" textAnchor="middle" fontWeight="600">Parque</text>
          <text x="40" y="32.5" fontSize="1.8" fill="#4a7a4a" textAnchor="middle">Bolívar</text>

          {/* Draggable marker */}
          <g transform={`translate(${markerPos.x}, ${markerPos.y})`} style={{ cursor: 'grab' }}>
            <circle r="4" fill="#ef4444" opacity="0.2" />
            <circle r="2.5" fill="#ef4444" stroke="white" strokeWidth="1" />
            <line x1="0" y1="-2.5" x2="0" y2="-7" stroke="#ef4444" strokeWidth="1.5" />
            <circle cx="0" cy="-7" r="1.5" fill="#ef4444" />
          </g>
        </svg>
        <div className="absolute bottom-2 right-2 bg-white/90 rounded-lg px-2 py-1 text-xs text-slate-500 border border-slate-200">
          Mapa esquemático del centro de Montería
        </div>
      </div>
    </div>
  );
}
