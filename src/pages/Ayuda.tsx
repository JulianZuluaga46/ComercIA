import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { api, type Feedback } from '../lib/api';

function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-b border-slate-100 last:border-0">
      <summary className="cursor-pointer list-none py-3 font-medium text-slate-800 flex items-center gap-2">
        <span className="group-open:rotate-90 transition-transform text-slate-400">▸</span> {title}
      </summary>
      <div className="pb-4 pl-5 text-sm text-slate-600 space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}

const MERCHANT_STEPS = [
  { n: 1, title: 'Cada día, anota tus clientes', text: 'En el inicio el sistema te pregunta cuántos clientes atendiste ayer. Solo escribe el número.', to: '/comerciante', cta: 'Ir al inicio' },
  { n: 2, title: 'Mira cuántos vienen', text: 'El inicio te dice cuántos clientes esperar hoy y en la semana. Toca un día para ver el detalle.', to: '/comerciante/calendario', cta: 'Ver calendario' },
  { n: 3, title: 'Prepárate', text: 'Las recomendaciones y alertas te dicen qué días necesitan más inventario o personal.', to: '/comerciante/recomendaciones', cta: 'Ver recomendaciones' },
];

function MerchantHelp() {
  const navigate = useNavigate();
  return (
    <>
      <div className="grid md:grid-cols-3 gap-4">
        {MERCHANT_STEPS.map(s => (
          <Card key={s.n}>
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold mb-2">{s.n}</div>
            <h2 className="font-semibold text-slate-900">{s.title}</h2>
            <p className="text-sm text-slate-600 mt-1 mb-3">{s.text}</p>
            <Button variant="outline" size="sm" onClick={() => navigate(s.to)}>{s.cta}</Button>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="font-semibold text-slate-900 mb-1">Preguntas frecuentes</h2>
        <Topic title="¿Cómo sabe el sistema cuántos clientes vendrán?">
          <p>Aprende de los días que has registrado y los combina con el día de la semana, las quincenas, los festivos, las temporadas y el clima de Montería.</p>
          <p>Es una estimación, no una certeza: por eso te mostramos un rango («entre 16 y 25»).</p>
        </Topic>
        <Topic title="¿Cuándo aprende el sistema y qué tan acertado es conmigo?">
          <p>En <strong>Aprendizaje</strong> ves, paso a paso y con tus propios datos, cómo aprende el sistema: qué etiquetas le pone a cada día, qué es lo que más le sirve para calcular y cómo le fue en el examen con días que ya pasaron. También ves si está aprendiendo en este momento y cuándo lo hizo por última vez.</p>
          <p>Vuelve a aprender solo cada vez que se registran 7 días nuevos entre todos los comercios.</p>
        </Topic>
        <Topic title="¿Qué significa flojo, normal, alto y crítico?">
          <p>Son niveles según lo normal en tu negocio. Puedes ajustar los números en <strong>Alertas</strong>.</p>
        </Topic>
        <Topic title="¿Qué significa la confianza?">
          <p>Indica qué tanto acierta el sistema. Baja cuando tu comercio tiene pocos días registrados (mínimo 28) o cuando la fecha está tan lejos que aún no hay pronóstico del clima (más de 16 días).</p>
        </Topic>
        <Topic title="Me olvidé de registrar varios días">
          <p>Ve a <strong>Registrar datos</strong> y elige la fecha, o sube un archivo de Excel con las columnas Fecha y Clientes (hay una plantilla).</p>
        </Topic>
        <Topic title="¿Cómo saco un informe?">
          <p>En <strong>Reportes</strong> eliges qué quieres (predicciones, recomendaciones o histórico), las fechas y el formato: PDF, Excel o CSV.</p>
        </Topic>
        <Topic title="Olvidé mi contraseña">
          <p>En la pantalla de inicio de sesión elige <strong>Código por correo</strong>. Al entrar, ve a <strong>Configuración</strong> y crea una contraseña nueva. Si no tienes acceso a tu correo, pídele al administrador una contraseña temporal.</p>
        </Topic>
        <Topic title="¿El sistema compra o contrata por mí?">
          <p>No. ComercIA solo recomienda; todas las decisiones son tuyas.</p>
        </Topic>
      </Card>
    </>
  );
}

function AdminHelp() {
  return (
    <Card>
      <h2 className="font-semibold text-slate-900 mb-1">Guía del administrador</h2>
      <Topic title="Agregar un comercio y su comerciante">
        <p>1. En <strong>Comercios</strong>, «Registrar comercio». 2. En <strong>Usuarios</strong>, «Crear usuario» con rol Comerciante y selecciona ese comercio. 3. Entrégale su correo y contraseña.</p>
        <p>Los comerciantes también pueden registrarse solos: aparecen primero en Comercios para que los apruebes.</p>
      </Topic>
      <Topic title="Una persona olvidó su contraseña o quedó bloqueada">
        <p>En <strong>Usuarios → Administrar</strong> puedes desbloquear la cuenta o generar una contraseña temporal. Al entrar, el sistema le pedirá crear una nueva.</p>
      </Topic>
      <Topic title="Revisar que todo funcione">
        <p><strong>Plataforma</strong> muestra el estado del servicio de predicción, el clima, el correo, las copias de seguridad y la evaluación de los comerciantes.</p>
      </Topic>
      <Topic title="Comercios de prueba">
        <p>Tienen la etiqueta PRUEBA y datos inventados. Se quitan con <code>npm run test-data:remove</code> en la carpeta del proyecto.</p>
      </Topic>
    </Card>
  );
}

function AnalystHelp() {
  return (
    <Card>
      <h2 className="font-semibold text-slate-900 mb-1">Guía del analista</h2>
      <Topic title="Cómo leer las métricas">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>MAE:</strong> cuántos clientes se equivoca en promedio el modelo por día. Menor es mejor.</li>
          <li><strong>RMSE:</strong> como el MAE, pero castiga más los errores grandes.</li>
          <li><strong>MAPE:</strong> el error en porcentaje.</li>
          <li><strong>R²:</strong> qué parte de la variación explica el modelo (1 sería perfecto).</li>
          <li><strong>Método empírico:</strong> predecir el promedio del mismo día de la semana. Es la referencia que la hipótesis busca superar.</li>
        </ul>
      </Topic>
      <Topic title="Cómo se valida el modelo">
        <p>Walk-forward: entrena con el pasado y predice la semana siguiente, sin ver el futuro. Con historias largas se evalúan las últimas 26 semanas.</p>
      </Topic>
      <Topic title="Entrenar y elegir un modelo">
        <p>En <strong>Entrenamiento</strong> eliges el algoritmo. El nuevo queda activo; desde <strong>Modelos</strong> o <strong>Historial</strong> puedes volver a uno anterior. El sistema reentrena solo al acumular 7 registros reales nuevos.</p>
      </Topic>
      <Topic title="Entrenamiento por comercio">
        <p>Muestra, para el comercio elegido arriba, el entrenamiento en curso (etapa y registros que aporta), su participación en cada modelo y el MAE del modelo y del método empírico solo en sus días de validación. El MAE empírico por comercio aparece en modelos entrenados después de noviembre de 2026.</p>
      </Topic>
      <Topic title="Datos reales y datos de prueba">
        <p>Por defecto el modelo usa solo datos reales. Si marcas «Incluir comercios de prueba», el modelo queda señalado: sus métricas no son resultados de la investigación.</p>
        <p>El selector de la barra superior cambia el comercio en Dataset y Predicción vs real.</p>
      </Topic>
      <Topic title="Calendario local">
        <p>Los recesos escolares y eventos de Montería se agregan en <code>server/ml/calendar_events.json</code>. Reentrena después de cambiarlos.</p>
      </Topic>
    </Card>
  );
}

const QUESTIONS: { key: 'easeOfUse' | 'usefulness' | 'accuracy'; label: string }[] = [
  { key: 'easeOfUse', label: '¿Qué tan fácil de usar te pareció?' },
  { key: 'usefulness', label: '¿Qué tan útil es para decidir inventario, personal o promociones?' },
  { key: 'accuracy', label: '¿Qué tanto se parecen las predicciones a lo que pasa en tu negocio?' },
];

/** Evaluación de usuarios finales: Objetivo 4 del proyecto y criterio de la RNF-01. */
function FeedbackForm() {
  const { showToast, ToastComponent } = useToast();
  const [f, setF] = useState<Partial<Feedback>>({});
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.myFeedback().then(prev => {
      if (prev) {
        setF(prev);
        setSent(true);
      }
    }).catch(() => {});
  }, []);

  const complete = f.easeOfUse && f.usefulness && f.accuracy && f.noHelp !== undefined;

  async function submit() {
    try {
      await api.saveFeedback(f as Feedback);
      setSent(true);
      showToast('¡Gracias por tu opinión!');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo enviar.');
    }
  }

  return (
    <Card>
      <ToastComponent />
      <h2 className="font-semibold text-slate-900">Cuéntanos tu experiencia</h2>
      <p className="text-sm text-slate-500 mb-4">1 minuto. Nos ayuda a evaluar ComercIA para el proyecto de investigación. {sent && 'Ya respondiste; puedes cambiar tus respuestas cuando quieras.'}</p>
      <div className="space-y-4">
        {QUESTIONS.map(q => (
          <div key={q.key}>
            <div className="text-sm font-medium text-slate-700 mb-1.5">{q.label}</div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">Nada</span>
              {[1, 2, 3, 4, 5].map(v => (
                <button
                  key={v}
                  aria-label={`${v} de 5`}
                  onClick={() => setF(p => ({ ...p, [q.key]: v }))}
                  className={`w-9 h-9 rounded-lg border text-sm font-semibold transition-all ${f[q.key] === v ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
                >
                  {v}
                </button>
              ))}
              <span className="text-xs text-slate-400 ml-1">Mucho</span>
            </div>
          </div>
        ))}
        <div>
          <div className="text-sm font-medium text-slate-700 mb-1.5">¿Pudiste consultar la predicción y registrar tus datos sin que nadie te ayudara?</div>
          <div className="flex gap-2">
            {[{ v: true, t: 'Sí' }, { v: false, t: 'No, necesité ayuda' }].map(o => (
              <button
                key={o.t}
                onClick={() => setF(p => ({ ...p, noHelp: o.v }))}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${f.noHelp === o.v ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
              >
                {o.t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="comentario" className="text-sm font-medium text-slate-700 block mb-1.5">¿Qué mejorarías? (opcional)</label>
          <textarea
            id="comentario"
            rows={2}
            maxLength={1000}
            value={f.comment ?? ''}
            onChange={e => setF(p => ({ ...p, comment: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button onClick={submit} disabled={!complete}>{sent ? 'Actualizar respuestas' : 'Enviar'}</Button>
      </div>
    </Card>
  );
}

export function Ayuda() {
  const { currentRole } = useApp();
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ayuda</h1>
        <p className="text-sm text-slate-500">
          {currentRole === 'comerciante' ? 'ComercIA en tres pasos, y respuestas a las dudas más comunes.' : 'Lo esencial para usar tu panel.'}
        </p>
      </div>
      {currentRole === 'comerciante' && <MerchantHelp />}
      {currentRole === 'admin' && <AdminHelp />}
      {currentRole === 'analista' && <AnalystHelp />}
      {currentRole === 'comerciante' && <FeedbackForm />}
    </div>
  );
}
