# ComercIA

Sistema que predice el flujo de clientes de comercios del centro de Montería con aprendizaje automático, clima y
variables temporales. Proyecto de investigación de Ingeniería de Sistemas, Universidad de Córdoba. Responde en español.

Documentos fuente, en `docs/documentos-proyecto/`: la propuesta con la ERS (RF-01 a RF-14, RNF-01 a RNF-08, casos de uso
y objetivos) y el registro piloto de 70 días. Instalación y uso: `README.md`.

## Estructura

- `src/`: web en React 19, Vite 8, Tailwind v4, react-router y recharts. Las pantallas están en `src/pages/{comerciante,admin,analista}`.
- `server/src/`: API en Express, Prisma y SQLite (puerto 3001).
- `server/ml/`: servicio de predicción en Python con FastAPI, scikit-learn y XGBoost (puerto 8001).
- `datos-de-prueba/`: 6 comercios inventados y cómo se generaron (`LEEME.md`).
- `docs/`: despliegue y protocolo de validación con comerciantes.

`npm run dev` levanta todo en http://localhost:8443: Vite arranca la API y la API arranca el servicio de ML. Antes de
iniciarlo, comprueba que no esté corriendo. Al terminar, detén los servidores que hayas iniciado.

**Modo demostración:** si existe `exposicion/MODO-DEMO-ACTIVO`, `npm run dev` (`scripts/dev.mjs`) usa la copia
`exposicion/expo.db`, con días de ejemplo de Hogaria, en lugar de la base real. `npm run dev:real` fuerza la base
real. Ver `exposicion/LEEME.md`.

## Reglas

- **Datos reales:** `server/prisma/dev.db` contiene cuentas y datos reales, y `server/.env` las claves. No los modifiques
  en pruebas. Haz una copia de la base y arranca con `DATABASE_URL` apuntando a ella y `BACKUP_DIR` a otra carpeta. Sin
  `ENCRYPTION_KEY`, los campos cifrados no se pueden leer.
- **Nada de simulación:** el sistema real usa datos y clima reales. Los comercios de prueba llevan `isTest=true` y el
  entrenamiento los excluye por defecto.
- **Honestidad de resultados:** no presentes métricas con datos de prueba como resultados de la investigación. El modelo
  con datos reales empata hoy con el método empírico (MAE 1,32 frente a 1,31).
- **Interfaz:** debe entenderla un comerciante sin conocimientos técnicos (RNF-01). Usa frases simples y fechas legibles
  (`src/lib/format.ts`), y verifica también en celular (RNF-06).

## Pruebas

- `cd server && npm test`: pruebas unitarias del servidor y de ML.
- `npx tsc --noEmit` en la raíz y en `server/`: tipos.
- `npm run test:acceptance --prefix server`: criterios de la ERS. Crea datos y exige `DATABASE_URL` hacia una copia.
- `npm run test:load --prefix server`: carga para RNF-02 y RNF-05. Crea datos y exige `DATABASE_URL` hacia una copia.

## Pendiente (fase final, a 24/11/2026)

Hecho el 24/11/2026: `test:acceptance` (17/17) y `test:load` (RNF-02 y RNF-05 cumplen) corridos sobre una copia;
resultados en `docs/cumplimiento-ers.md`. Comprobado que un clon limpio del repositorio se instala y arranca solo
(`npm run setup` y `npm run dev`). El repositorio git excluye bases, claves, modelos, copias y `exposicion/`.

- Revisar en Firefox y volver a revisar en celular Plataforma, Comercios, Modelos e Historial.
- Probar `docs/despliegue.md` en un Ubuntu real; hasta ahora solo se comprobó el modo producción en Windows.
- Depende del equipo: definir el umbral de la RNF-08, aplicar `docs/validacion-usabilidad.md` con comerciantes, reunir
  más datos reales y comercios, configurar el correo SMTP y publicar con HTTPS.
