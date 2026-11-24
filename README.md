# ComercIA — Predicción del flujo de clientes (centro de Montería)

Sistema del proyecto de investigación de Ingeniería de Sistemas (Universidad de Córdoba).

## Arquitectura

```
Navegador (React + Vite, :8443)
   │  /api  (proxy de Vite)
   ▼
API Express + Prisma + SQLite (server/, :3001)
   ├─ Open-Meteo ── clima diario de Montería (histórico desde 2021 + pronóstico 16 días)
   └─ Servicio ML Python (server/ml, FastAPI + scikit-learn/XGBoost, :8001)
```

`npm run dev` levanta los tres procesos: Vite arranca la API y la API arranca el servicio de ML.

## Instalación (una sola vez)

Requisitos: Node.js 22 y Python 3.11 o superior.

```bash
git clone <url-del-repositorio> comercia
cd comercia
npm run setup      # dependencias web, del servidor y entorno Python (server/ml/.venv)
npm run dev        # http://localhost:8443
```

El repositorio **no incluye** la base de datos, las claves (`server/.env`), los modelos entrenados ni las copias de
seguridad: contienen cuentas y datos reales de los comercios. Al clonarlo, el primer arranque crea todo desde cero con
el registro piloto, como se describe abajo.

En el primer arranque el servidor:
1. crea la base SQLite y carga el **registro piloto de 70 días** (`server/prisma/data/piloto_70dias.csv`);
2. genera las claves `JWT_SECRET` y `ENCRYPTION_KEY` en `server/.env` si no existen;
3. descarga el clima real de Montería desde Open-Meteo;
4. entrena un Random Forest inicial.

### Primer uso

1. Abra http://localhost:8443/login. Como no hay usuarios, el sistema lleva a **Configuración inicial** para crear la
   cuenta del administrador.
2. Como administrador, en **Usuarios**: cree la cuenta del analista y la del comerciante del comercio piloto
   (asígnele el comercio «Comercio piloto — Centro»). El panel muestra una lista de «Primeros pasos».
3. Los demás comerciantes pueden registrarse solos en `/registro`; el administrador aprueba su comercio en **Comercios**.

**Inicio de sesión con código por correo:** en el login, pestaña «Código por correo». Se envía un código de 6 dígitos
(vence en 10 min, máximo 5 intentos, uno nuevo cada 60 s). Quien entra con código puede crear una contraseña nueva en
Configuración sin escribir la anterior durante 15 minutos (así funciona «¿Olvidaste tu contraseña?»).

**Sin acceso al correo:** el administrador usa «Restablecer contraseña» en **Usuarios**: el sistema genera una
contraseña temporal y obliga a cambiarla al ingresar.

### Correo (SMTP)

Sin configurar, los códigos se escriben en la terminal donde corre `npm run dev`. Para enviarlos de verdad con Gmail:

1. En la cuenta de Google active la verificación en dos pasos y cree una **contraseña de aplicación**
   (Cuenta de Google → Seguridad → Contraseñas de aplicaciones).
2. Agregue a `server/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=sucuenta@gmail.com
SMTP_PASS=la-contraseña-de-aplicación-de-16-letras
SMTP_FROM="ComercIA <sucuenta@gmail.com>"
```

3. Reinicie `npm run dev`. En **Administrador → Plataforma** el servicio «Correo» debe aparecer como operativo.

## Comercios de prueba

La carpeta `datos-de-prueba/` contiene 6 comercios **inventados** con un año de datos (01/10/2025 – 19/10/2026), sus
cuentas y cómo se generó cada número (`LEEME.md`, `datos_de_prueba.xlsx` y un CSV por comercio).

```bash
npm run test-data          # genera y carga (o recarga) los comercios de prueba
npm run test-data:remove   # los elimina de la base de datos
```

En la aplicación aparecen con la etiqueta **PRUEBA**. El modelo solo los usa si el analista marca «Incluir comercios de
prueba» al entrenar, y ese modelo queda señalado: sus métricas no son resultados de la investigación.

`npm run db:reset` borra **toda** la base de datos (usuarios incluidos) y vuelve a cargar el registro piloto.

## Datos

- **Clientes**: solo datos reales registrados por los comercios. Los conteos del 23/09 al 13/10/2026 del piloto
  están marcados como `estimado` (nota de transparencia del anexo); el analista puede excluirlos al entrenar.
- **Clima**: Open-Meteo para todo el período, tanto en el entrenamiento como en las predicciones, para que el modelo
  reciba las mismas variables. Más allá de 16 días se usa el promedio histórico (±7 días del mismo día del año,
  2021–hoy) y la interfaz lo indica.
- **Calendario**: festivos de Colombia con la librería `holidays`; recesos escolares y eventos locales en
  `server/ml/calendar_events.json` (agregue allí los que verifiquen).

## Modelo

- Algoritmos: Random Forest (recomendado) y XGBoost. LSTM se rechaza con un mensaje explicativo hasta tener ≥ 1 año de datos reales.
- Variables: día de la semana, quincena (y víspera/día siguiente), fin e inicio de mes, festivos, receso escolar,
  eventos comerciales (Madre, Padre, Amor y Amistad), mes del año y diciembre, tipo de comercio, temperatura, lluvia y humedad.
- Objetivo: clientes / promedio del comercio (un mismo modelo sirve para comercios de distinto tamaño).
- Validación **walk-forward**: entrena con las primeras 6 semanas y predice cada semana siguiente solo con lo visto hasta entonces.
- Se compara siempre contra el **método empírico** (promedio del mismo día de la semana), que es lo que la hipótesis
  busca superar.
- Explicación de cada predicción: cuántos clientes cambia la predicción si se quita cada factor (contrafactual).

## Ayuda dentro de la aplicación

Cada rol tiene una página **Ayuda** (menú lateral) con los primeros pasos y preguntas frecuentes en lenguaje sencillo.
Desde allí el comerciante puede evaluar la aplicación (facilidad de uso y utilidad); el administrador ve las
evaluaciones en **Plataforma**. Sirve para aplicar `docs/validacion-usabilidad.md`.

## Procesos automáticos (cada 6 h)

- Copia de seguridad diaria de la base (ver abajo).
- Sincroniza el clima (RF-04).
- Reentrena si hay ≥ 7 registros nuevos (RF-12).
- Genera alertas de flujo alto/bajo para los próximos 7 días según los umbrales de cada comercio (RF-09); también al
  crear un comerciante o aprobar un comercio.
- Lunes: reporte semanal en PDF (predicción de la semana). Día 1: reporte mensual (histórico del mes anterior).
  Cada comerciante puede desactivarlos en Configuración.

## Copias de seguridad

Una vez al día el servidor copia la base en `server/backups/comercia-AAAA-MM-DD.db` (o en la carpeta de `BACKUP_DIR`)
y conserva las últimas 14. La copia se hace con `VACUUM INTO`, así que es consistente aunque el sistema esté en uso.
El administrador las ve en **Plataforma**.

La clave `ENCRYPTION_KEY` **no** va dentro de la copia, a propósito: guárdela aparte. Para restaurar, detenga el
sistema, reemplace `server/prisma/dev.db` por la copia y vuelva a iniciar con el mismo `server/.env`.

## Seguridad (RNF-04)

- Contraseñas con bcrypt; política de mínimo 8 caracteres con letras y números; bloqueo de 15 min tras 5 intentos.
- Datos sensibles cifrados en la base con AES-256-GCM: teléfono, dirección y descripción del comercio, observaciones de
  los registros y contenido de los reportes. La clave está en `server/.env` (`ENCRYPTION_KEY`): **haga copia de
  seguridad**; sin ella esos datos no se pueden leer.
- El rol y el estado del usuario se verifican en cada petición: desactivar a un usuario corta su acceso de inmediato.
- En producción sirva la aplicación detrás de HTTPS.

## Pruebas

```bash
cd server && npm test           # pruebas unitarias (servidor y ML)
npx tsc --noEmit                # tipos (en la raíz y en server/)
```

Prueba el cifrado, la lectura de CSV/Excel, la política de contraseñas, umbrales, métricas, exportación PDF/Excel y,
en Python, el calendario colombiano, el entrenamiento walk-forward y la predicción.

**Aceptación y carga.** `test:acceptance` comprueba los criterios de la ERS contra la API en ejecución y `test:load`
mide tiempos con muchos comercios y usuarios simultáneos (RNF-02, RNF-05). Ambas crean cuentas y comercios, así que
se niegan a correr sin `DATABASE_URL` hacia una **copia** de la base. La API debe correr sobre esa misma copia:

```bash
cp server/prisma/dev.db /tmp/copia.db
# terminal 1
cd server && DATABASE_URL=file:/tmp/copia.db BACKUP_DIR=/tmp/respaldos COMERCIA_MODELS_DIR=/tmp/modelos npx tsx src/index.ts
# terminal 2
cd server && DATABASE_URL=file:/tmp/copia.db npm run test:acceptance
cd server && DATABASE_URL=file:/tmp/copia.db npm run test:load
```

Resultados de la última corrida: `docs/cumplimiento-ers.md`.

## Trazabilidad con la ERS

| Requisito | Dónde (server/src salvo indicación) |
|---|---|
| RF-01 Registro de comercios | `routes/auth.ts` (registro), `routes/stores.ts` |
| RF-02 Autenticación, roles, bloqueo tras 5 intentos, restablecimiento | `routes/auth.ts`, `middleware/auth.ts`, `routes/users.ts` |
| RF-03 Carga CSV/Excel con validación por fila | `routes/historical.ts`, `tabular.ts` |
| RF-04 Clima automático | `weather.ts`, `jobs.ts` |
| RF-05 Variables temporales | `server/ml/features.py` |
| RF-06 / RF-12 Entrenamiento y reentrenamiento | `training.ts`, `server/ml/app.py` |
| RF-07 / RF-08 Predicciones y dashboard con filtro por rango de fechas | `forecast.ts`, `routes/predictions.ts`, `src/pages/comerciante/Prediccion.tsx` |
| UC-04 Aviso de datos insuficientes | `forecast.ts` (`dataWarning`) |
| RNF-04 Cifrado de datos | `crypto.ts` |
| RNF-07 Pruebas automatizadas | `src/core.test.ts`, `ml/test_ml.py` |
| RF-09 Alertas y recomendaciones | `jobs.ts`, `recommendations.ts` |
| RF-10 Reportes PDF / Excel / CSV | `routes/reports.ts`, `exporters.ts` |
| RF-11 Gestión de usuarios (crear, editar, desactivar) | `routes/users.ts` |
| RF-13 Histórico de métricas | tabla `ModelRun` |
| RF-14 Predicción vs. real | campo `predicted` de `DailyRecord` (fuera de muestra) |

## Variables de entorno (server/.env)

- `DATABASE_URL` — ruta del archivo SQLite
- `JWT_SECRET` — firma de tokens (se genera sola)
- `ENCRYPTION_KEY` — clave AES-256 de los datos cifrados (se genera sola; no la pierda)
- `PORT` — puerto de la API (3001)
- `ML_URL` — opcional, URL del servicio de ML (por defecto `http://127.0.0.1:8001`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — opcionales, envío de códigos por correo
- `BACKUP_DIR` — opcional, carpeta de las copias de seguridad (por defecto `server/backups`)
- `CORS_ORIGIN` — opcional, orígenes permitidos separados por comas. En desarrollo se permite cualquiera; en
  producción ninguno, porque la web y la API comparten dominio. Configúrelo solo si la web se sirve desde otro dominio.
- `COMERCIA_MODELS_DIR` — opcional, carpeta de los modelos entrenados (por defecto `server/ml/models`)
- `RETRAIN_MIN_NEW_RECORDS` — opcional, registros nuevos que disparan el reentrenamiento (por defecto 7, RF-12)

## Producción

```bash
npm run build
npm run build:api
cd server && NODE_ENV=production npm start     # http://localhost:3001
```

Con `NODE_ENV=production` la API también entrega la web compilada (`dist/`), así que basta un solo proceso y un solo
puerto. Sírvala detrás de HTTPS. La guía paso a paso para un servidor Ubuntu está en `docs/despliegue.md` (probada
hasta ahora solo en Windows).
