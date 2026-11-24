import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../context/AppContext';
import { useStoreTraining } from '../../hooks/useStoreTraining';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { RetrainProgress, TrainingLive } from '../../components/TrainingLive';
import { fmtFull, fmtLong, fmtNum, fmtShort, lowerFirst } from '../../lib/format';
import type { StoreRunSummary, StoreTraining } from '../../lib/api';

/** Compara el error del sistema con el promedio del mismo día de la semana, en palabras sencillas. */
function comparison(run: StoreRunSummary) {
  if (run.mae == null || run.baselineMae == null) return null;
  const diff = run.baselineMae - run.mae;
  if (Math.abs(diff) < 0.1) {
    return { tone: 'neutral', text: 'Por ahora el sistema acierta casi igual que ese promedio. Con más días registrados se espera que lo supere.' };
  }
  if (diff > 0) {
    return { tone: 'good', text: `El sistema acierta mejor: se equivoca ${fmtNum(diff)} clientes menos por día que ese promedio.` };
  }
  return {
    tone: 'warn',
    text: `Por ahora el sistema se equivoca ${fmtNum(-diff)} clientes más por día que ese promedio. Con más días registrados se espera que mejore.`,
  };
}

/** Nombres de los factores del modelo (server/ml/features.py) en palabras del comerciante. */
const FACTOR_NAMES: Record<string, string> = {
  'Día de la semana': 'Qué día de la semana es',
  'Mes del año (temporada)': 'La época del año',
  'Temporada navideña (diciembre)': 'Diciembre (temporada navideña)',
  'Tipo de comercio': 'El tipo de negocio',
  'Quincena (día de pago)': 'La quincena (día de pago)',
  'Víspera de quincena': 'El día antes de la quincena',
  'Día después de quincena': 'El día después de la quincena',
  'Fin de mes': 'El fin de mes',
  'Inicio de mes': 'El inicio de mes',
  Festivo: 'Los festivos',
  'Receso escolar': 'Las vacaciones escolares',
  'Evento comercial': 'Fechas especiales (Día de la Madre, Amor y Amistad…)',
  'Temperatura máxima': 'El calor del día',
  'Temperatura mínima': 'La temperatura más baja del día',
  Precipitación: 'La lluvia',
  'Humedad relativa': 'La humedad del aire',
  'Lluvia fuerte (≥10 mm)': 'Los aguaceros fuertes',
};

/** Un paso de la explicación, con su número y una línea que lo une al siguiente. */
function Step({ n, title, last = false, children }: { n: number; title: string; last?: boolean; children: ReactNode }) {
  return (
    <section className="flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <span className="w-8 h-8 shrink-0 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">{n}</span>
        {!last && <span className="w-0.5 flex-1 bg-blue-100 mt-1" />}
      </div>
      <div className={`flex-1 min-w-0 space-y-3 ${last ? '' : 'pb-8'}`}>
        <h2 className="text-lg font-semibold text-slate-900 pt-0.5">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Chip({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'sky' }) {
  const tones = { slate: 'bg-slate-100 text-slate-700', blue: 'bg-blue-100 text-blue-800', sky: 'bg-sky-100 text-sky-800' };
  return <span className={`text-xs sm:text-sm px-2.5 py-1 rounded-full ${tones[tone]}`}>{children}</span>;
}

/** Dibujo del examen: aprende con las semanas anteriores y adivina la siguiente sin mirarla. */
function ExamDiagram() {
  const rows = [6, 7];
  return (
    <div className="space-y-2" aria-hidden>
      {rows.map((known, r) => (
        <div key={r} className="flex items-center gap-1">
          <span className="w-16 shrink-0 text-xs text-slate-500">{r === 0 ? 'Primero' : 'Después'}</span>
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className={`h-7 flex-1 max-w-10 rounded flex items-center justify-center text-xs font-bold ${
                i < known ? 'bg-green-200 text-green-800' : i === known ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'
              }`}
            >
              {i === known ? '?' : ''}
            </span>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-16 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200" /> semanas que ya conoce</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600" /> semana tapada que debe adivinar</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-200" /> semanas que aún no mira</span>
      </div>
    </div>
  );
}

function ExampleDay({ example }: { example: NonNullable<StoreTraining['explain']['example']> }) {
  const weekday = fmtLong(example.date).split(' ')[0];
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white">
      <p className="text-sm text-slate-500 mb-2">Por ejemplo, así ve el sistema tu {lowerFirst(fmtLong(example.date))}:</p>
      <div className="flex flex-wrap gap-2">
        <Chip tone="blue">{weekday}</Chip>
        {example.tags.map(t => (
          <Chip key={t} tone="blue">{t}</Chip>
        ))}
        <Chip tone="sky">{example.condition}, {example.tmax} °C</Chip>
        {example.precip > 0 && <Chip tone="sky">Llovió {fmtNum(example.precip)} mm</Chip>}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-baseline gap-2">
        <span className="text-slate-500 text-sm">Llegaron</span>
        <span className="text-2xl font-bold text-slate-900">{example.clients}</span>
        <span className="text-slate-500 text-sm">clientes (lo que tú anotaste)</span>
      </div>
    </div>
  );
}

/** Diferencia entre lo que aprendió la última vez y la vez anterior: así se ve el efecto de los días que subiste. */
function LastChange({ history }: { history: StoreRunSummary[] }) {
  const [now, before] = history.filter(h => h.included);
  if (!now?.active || !before) return null;
  const moreDays = now.recordsUsed - before.recordsUsed;
  const maeDiff = now.mae != null && before.mae != null ? now.mae - before.mae : null;
  return (
    <Card>
      <h2 className="font-semibold text-slate-900 mb-2">Qué cambió la última vez que aprendió</h2>
      <ul className="space-y-1.5 text-sm text-slate-700">
        <li>
          {moreDays > 0
            ? <>Aprendió con <strong>{moreDays} días más</strong> de tu negocio: antes usó {before.recordsUsed}, ahora {now.recordsUsed}.</>
            : moreDays < 0
              ? <>Usó {-moreDays} días menos de tu negocio que la vez anterior ({now.recordsUsed} en total).</>
              : <>Usó los mismos {now.recordsUsed} días de tu negocio que la vez anterior.</>}
        </li>
        {maeDiff != null && (
          <li>
            Su diferencia promedio con lo que anotaste pasó de ±{fmtNum(before.mae!)} a <strong>±{fmtNum(now.mae!)} clientes</strong>
            {Math.abs(maeDiff) < 0.05 ? ' (casi igual).' : maeDiff < 0 ? ' (ahora acierta mejor).' : ' (por ahora acierta un poco menos).'}
          </li>
        )}
      </ul>
      <p className="text-xs text-slate-500 mt-2">
        Antes aprendió el {lowerFirst(fmtFull(new Date(before.createdAt)))}; esta vez, el {lowerFirst(fmtFull(new Date(now.createdAt)))}.
      </p>
    </Card>
  );
}

export function Aprendizaje() {
  const { currentStore } = useApp();
  const { data, loading, error } = useStoreTraining(currentStore.id);

  if (loading && !data) return <div className="text-center py-20 text-slate-500">Cargando…</div>;
  if (!data) return <div className="max-w-xl mx-auto text-center py-20 text-slate-500">{error}</div>;

  const run = data.active;
  const cmp = run ? comparison(run) : null;
  const missingDays = Math.max(0, data.data.initialWindowDays - data.data.records);
  const learned = data.history.filter(h => h.included).slice(0, 5);
  const { storeAverage, example, factors, checks } = data.explain;
  const maxFactor = Math.max(...factors.map(f => f.importance), 0.0001);
  const chartData = checks.map(c => ({ dia: fmtShort(c.date), real: c.real, calculado: Math.round(c.predicted * 10) / 10 }));

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cómo aprende el sistema</h1>
        <p className="text-sm text-slate-600 mt-1">
          Piensa en el sistema como un ayudante nuevo que lee tu cuaderno de clientes. Con el tiempo nota qué días se llena
          más el negocio y por qué, y con eso calcula cuántos clientes vendrán. Aquí te mostramos, paso a paso y con tus
          propios datos, cómo lo hace.
        </p>
      </div>

      {data.store.isTest && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Este es un comercio de prueba con datos inventados. Lo que ves aquí no es un resultado real.
        </div>
      )}

      <TrainingLive data={data} />

      {!data.live.running && <LastChange history={data.history} />}

      <div>
        <Step n={1} title="Tú anotas cuántos clientes llegan cada día">
          <p className="text-sm text-slate-600">
            Todo empieza con lo que registras. Cada día anotado es una lección para el sistema: sin tus datos no puede aprender
            nada de tu negocio.
          </p>
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-blue-50 rounded-xl">
                <div className="text-2xl font-bold text-blue-700">{data.data.records}</div>
                <div className="text-xs text-blue-600">días registrados en total</div>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-700">{run?.recordsUsed ?? 0}</div>
                <div className="text-xs text-green-600">días usados la última vez que aprendió</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="text-2xl font-bold text-slate-700">{data.nextRetrain.newRecordsStore}</div>
                <div className="text-xs text-slate-500">días nuevos que aún no ha aprendido</div>
              </div>
            </div>
            {storeAverage != null && (
              <p className="text-sm text-slate-700 mt-3">
                En un día normal llegan a tu negocio unos <strong>{fmtNum(storeAverage)} clientes</strong>. Ese es el punto de
                partida: el sistema aprende qué hace que un día tenga más o menos clientes que eso.
              </p>
            )}
            {data.data.firstDate && data.data.lastDate && (
              <p className="text-xs text-slate-500 mt-2">
                Tus registros van desde el {lowerFirst(fmtFull(data.data.firstDate))} hasta el {lowerFirst(fmtFull(data.data.lastDate))}.
              </p>
            )}
            {missingDays > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-slate-600 mb-1">
                  <span>Llevas {data.data.records} de {data.data.initialWindowDays} días</span>
                  <span>Faltan {missingDays}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${Math.round((data.data.records / data.data.initialWindowDays) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Con 6 semanas de registros el sistema puede ponerse a prueba con tu negocio (paso 4).{' '}
                  <Link to="/comerciante/datos" className="text-blue-600 font-medium">Registrar días</Link>
                </p>
              </div>
            )}
          </Card>
        </Step>

        <Step n={2} title="El sistema le pone etiquetas a cada día">
          <p className="text-sm text-slate-600">
            A cada día que anotas, el sistema le agrega lo que pasaba ese día: qué día de la semana era, si había quincena,
            festivo, vacaciones o una fecha especial, y cómo estuvo el clima en Montería. El clima lo consulta solo; tú no tienes
            que anotarlo.
          </p>
          {example ? (
            <ExampleDay example={example} />
          ) : (
            <Card className="text-sm text-slate-500">Cuando registres tu primer día, aquí verás cómo lo etiqueta el sistema.</Card>
          )}
          <p className="text-xs text-slate-500">
            Para aprender solo usa la fecha, el número de clientes y el tipo de negocio. No usa tus notas ni tus datos personales.
          </p>
        </Step>

        <Step n={3} title="Busca patrones comparando muchos días">
          <p className="text-sm text-slate-600">
            Luego compara los días que se parecen. Si los días de quincena casi siempre llegan más clientes que en un día normal,
            aprende que la quincena sube la clientela. Si cuando llueve fuerte llegan menos, también lo aprende. Así, para cada
            etiqueta, aprende cuánto suele subir o bajar el número de clientes.
          </p>
          <div className="p-3 rounded-xl bg-blue-50 text-sm text-blue-900">
            Un solo negocio tiene pocos días anotados, así que el sistema aprende con los días de todos los comercios del centro
            que participan. Pero mide cada día frente al día normal de cada negocio: por eso sus cálculos se ajustan al tamaño
            de tu negocio y no al de los demás.
          </div>
          {factors.length > 0 && (
            <Card>
              <h3 className="font-medium text-slate-900">Lo que más le ha servido para calcular</h3>
              <p className="text-xs text-slate-500 mb-3">Entre todos los comercios, la última vez que aprendió. Más larga la barra, más pesa.</p>
              <ul className="space-y-2">
                {factors.map(f => (
                  <li key={f.feature}>
                    <div className="text-sm text-slate-700 mb-0.5">{FACTOR_NAMES[f.feature] ?? f.feature}</div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max(4, Math.round((f.importance / maxFactor) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Step>

        <Step n={4} title="Se pone a prueba antes de usarse">
          <p className="text-sm text-slate-600">
            Para saber si de verdad aprendió, el sistema hace un examen con días que ya pasaron. Aprende con las primeras
            semanas, tapa la semana siguiente, calcula cuántos clientes habría <strong>sin mirar</strong> lo que anotaste y luego
            destapa para comparar. Después suma esa semana a lo que sabe y repite con la que sigue.
          </p>
          <Card>
            <ExamDiagram />
          </Card>
          <Card>
            <h3 className="font-medium text-slate-900 mb-1">¿Cómo le fue en el examen con tu negocio?</h3>
            {run && run.evaluatedDays > 0 && run.mae != null ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  Calculó {run.evaluatedDays} días de tu negocio sin mirarlos y luego los comparó con lo que registraste.
                </p>
                {chartData.length > 1 && (
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Los últimos {chartData.length} días del examen:</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ left: -20, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                        <Legend formatter={v => (v === 'real' ? 'Lo que anotaste' : 'Lo que calculó sin mirar')} />
                        <Line type="monotone" dataKey="real" name="real" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="calculado" name="calculado" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-500">Mientras más juntas estén las dos líneas, mejor acertó.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-3xl font-bold text-slate-900">±{fmtNum(run.mae)}</div>
                    <div className="text-sm text-slate-600">clientes por día de diferencia, en promedio</div>
                  </div>
                  {run.within2Pct != null && (
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-3xl font-bold text-slate-900">{run.within2Pct}%</div>
                      <div className="text-sm text-slate-600">de los días acertó con 2 clientes de diferencia o menos</div>
                    </div>
                  )}
                </div>
                {run.baselineMae != null && (
                  <p className="text-sm text-slate-600">
                    Si solo se usara el promedio de ese mismo día de la semana, la diferencia sería de ±{fmtNum(run.baselineMae)} clientes.
                  </p>
                )}
                {cmp && (
                  <div
                    className={`p-3 rounded-xl text-sm ${
                      cmp.tone === 'good' ? 'bg-green-50 text-green-800' : cmp.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
                    }`}
                  >
                    {cmp.text}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Todavía no hay suficientes días para el examen. Sigue registrando tus clientes cada día y aquí aparecerá qué tan
                acertado es el sistema con tu negocio.
              </p>
            )}
          </Card>
        </Step>

        <Step n={5} title="Queda listo y sigue aprendiendo" last>
          <p className="text-sm text-slate-600">
            Lo aprendido se usa para calcular tus próximos días en{' '}
            <Link to="/comerciante/prediccion" className="text-blue-600 font-medium">Predicción</Link>, con el pronóstico del
            clima y el calendario de esos días. Cuando se juntan suficientes días nuevos (anotados a mano o subidos en un archivo),
            vuelve a aprender enseguida, así que mientras más anotes, mejor conoce tu negocio.
          </p>
          <RetrainProgress data={data} />
          {learned.length > 0 && (
            <Card>
              <h3 className="font-medium text-slate-900 mb-3">Últimas veces que aprendió con tus datos</h3>
              <ul className="divide-y divide-slate-100">
                {learned.map(h => (
                  <li key={h.version} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        {fmtFull(new Date(h.createdAt))}
                        {h.active && <Badge variant="success">En uso</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">Usó {h.recordsUsed} días de tu negocio</div>
                    </div>
                    <div className="text-sm text-slate-600">
                      {h.mae != null ? `Diferencia promedio: ±${fmtNum(h.mae)} clientes` : 'Sin días para comprobar'}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Step>
      </div>
    </div>
  );
}
