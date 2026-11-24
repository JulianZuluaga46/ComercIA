import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';

const FEATURES = [
  { icon: '🌤', title: 'Variables climáticas', desc: 'Temperatura, precipitación y humedad integradas en la predicción.' },
  { icon: '📅', title: 'Calendario inteligente', desc: 'Quincenas, festivos, fin de mes y temporadas consideradas automáticamente.' },
  { icon: '📊', title: 'Histórico de datos', desc: 'Aprende del comportamiento histórico de tu comercio.' },
  { icon: '🤖', title: 'Machine Learning', desc: 'Random Forest y XGBoost entrenados con datos reales del centro de Montería.' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Registra tu comercio', desc: 'Ingresa los datos básicos de tu negocio y selecciona su ubicación en el mapa.' },
  { step: '02', title: 'Registra tu flujo', desc: 'Importa tu histórico en Excel o anota cada día cuántos clientes atendiste.' },
  { step: '03', title: 'Generamos la predicción', desc: 'El sistema analiza variables climáticas, temporales e históricas.' },
  { step: '04', title: 'Recibe recomendaciones', desc: 'Obtén sugerencias prácticas para prepararte para lo que viene.' },
];

const CATEGORIES = ['35.5% Variedades', '16.1% Ropa y calzado', '9.7% Farmacias', 'Y más categorías…'];

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-white border-b border-slate-100 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">ComercIA</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              Iniciar sesión
            </Button>
            <Button size="sm" onClick={() => navigate('/registro')}>
              Registrar mi comercio
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-sm mb-6 border border-white/20">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Proyecto de investigación — Universidad de Córdoba
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
              Anticípate al flujo<br />de clientes.
            </h1>
            <p className="text-lg text-blue-100 mb-8 leading-relaxed">
              ComercIA combina datos históricos, clima y calendario para ayudarte a entender
              cuántos clientes podrían llegar a tu negocio en el centro de Montería.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg"
                onClick={() => navigate('/registro')}
              >
                Registrar mi comercio
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-white/40 text-white hover:bg-white/10"
                onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Conocer cómo funciona
              </Button>
            </div>
          </div>
        </div>
        {/* Stats strip */}
        <div className="border-t border-white/10 bg-white/5">
          <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: '31', label: 'comercios encuestados' },
              { value: '0.87', label: 'Alfa de Cronbach' },
              { value: '9', label: 'variables del modelo' },
              { value: '70', label: 'días de registro piloto' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-blue-200">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="py-16 md:py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">¿Cómo funciona?</h2>
            <p className="text-slate-500">Un proceso sencillo en cuatro pasos.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px bg-blue-200 z-0" />
                )}
                <div className="relative bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm mb-4">
                    {step.step}
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pensado para Montería */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-blue-600 font-semibold text-sm uppercase tracking-wide">Contexto local</span>
              <h2 className="text-3xl font-bold text-slate-900 mt-2 mb-4">
                Pensado para el comercio del centro de Montería.
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                ComercIA fue diseñado específicamente para los comerciantes del centro de Montería, Córdoba,
                basado en una encuesta a 31 comercios. Entiende tu contexto, tus quincenas y tus temporadas.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map(c => (
                  <div key={c} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                    {c}
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="text-sm font-medium text-blue-800">Consistencia del instrumento</div>
                <div className="text-2xl font-bold text-blue-700">α = 0.8695</div>
                <div className="text-xs text-blue-600">Alfa de Cronbach — muestra de 31 comercios</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {FEATURES.map(f => (
                <div key={f.title} className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <div className="text-2xl mb-3">{f.icon}</div>
                  <h3 className="font-semibold text-slate-900 text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-blue-600 text-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Empieza a anticipar tu flujo de clientes</h2>
          <p className="text-blue-100 mb-8">
            Registra tu comercio, anota cuántos clientes atiendes cada día y recibe predicciones y recomendaciones.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg" onClick={() => navigate('/registro')}>
              Registrar mi comercio →
            </Button>
            <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10" onClick={() => navigate('/login')}>
              Ya tengo cuenta
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-900 text-slate-400 text-center text-sm">
        <div className="max-w-6xl mx-auto px-6">
          <div className="font-semibold text-white mb-1">ComercIA</div>
          <p>
            Desarrollado en el proyecto de investigación «Problemática de las ventas de los establecimientos comerciales del
            centro de Montería» — Programa de Ingeniería de Sistemas, Universidad de Córdoba.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Predicciones generadas por modelos de machine learning (scikit-learn) entrenados con el registro piloto y el clima de
            Montería (Open-Meteo).
          </p>
        </div>
      </footer>
    </div>
  );
}
