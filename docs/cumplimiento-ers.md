# Cumplimiento de la ERS

Estado de cada requisito de la propuesta (`docs/documentos-proyecto/`), con la evidencia que lo respalda. Corrida del
**24/11/2026** en Windows 11, sobre una **copia** de la base del sistema (nunca sobre la base real).

Leyenda: **Verificado** = comprobado por una prueba automática con el resultado indicado. **Parcial** = implementado,
pero falta parte del criterio de aceptación. **Pendiente** = depende de algo que aún no se ha hecho.

## Requisitos funcionales

Todos verificados con `npm run test:acceptance` (17 de 17 comprobaciones cumplen) salvo RF-05, verificado con las
pruebas unitarias.

| Requisito | Estado | Evidencia medida |
|---|---|---|
| RF-01 Registro de comercios | Verificado | Comercio creado y visible en la lista en 58 ms (límite 5 s). Autorregistro: HTTP 201 y el comercio queda «Pendiente» para el administrador. |
| RF-02 Autenticación y roles | Verificado | Comerciante: usuarios 403, otro comercio 403, entrenar 403; sin sesión 401. Bloqueo: 4 intentos fallidos 401, el 5.º 423, y con la contraseña correcta sigue bloqueado (423). |
| RF-03 Carga de datos históricos | Verificado | De un CSV con 3 filas guardó 1 válida y reportó 2 errores por fila; archivo inválido rechazado (400) con mensaje claro. Registro manual 201; fecha futura rechazada (400). |
| RF-04 Datos climáticos | Verificado | Open-Meteo sincronizado sin intervención en las últimas 24 h; pronóstico disponible 16 días adelante. |
| RF-05 Variables temporales | Verificado | Pruebas unitarias de Python: festivos de Colombia, quincena (se adelanta al viernes), eventos comerciales, temporada y tipo de comercio. |
| RF-06 Entrenamiento | Verificado | Entrenó un Random Forest nuevo en 2 s, con MAE y RMSE registrados. |
| RF-07 Predicciones | Verificado | 7 días predichos en 135 ms. |
| RF-08 Dashboard con filtro por fechas | Verificado | Pidió 4 días por rango y devolvió exactamente esas 4 fechas. |
| RF-09 Alertas y recomendaciones | Verificado | Al cambiar los umbrales, el comerciante pasó de 1 a 8 alertas; umbrales contradictorios rechazados (400). |
| RF-10 Reportes PDF, Excel y CSV | Verificado | Los tres formatos se generan y se descargan con contenido válido. |
| RF-11 Gestión de usuarios | Verificado | Edición 200. Al desactivar un usuario, su sesión abierta deja de funcionar de inmediato (401); al reactivarlo vuelve (200). |
| RF-12 Reentrenamiento | Verificado | El histórico pasó de 3 a 4 versiones. Durante un reentrenamiento se atendieron todas las predicciones sin fallos (prueba de carga). Automático al sumar 7 registros nuevos. |
| RF-13 Histórico de métricas | Verificado | Cada versión del modelo queda registrada con sus métricas (tabla `ModelRun`). |
| RF-14 Predicción vs. real | Verificado | 29 días del comercio piloto con valor real y predicho para el gráfico comparativo. |

## Requisitos no funcionales

| Requisito | Criterio de la ERS | Estado | Evidencia |
|---|---|---|---|
| RNF-01 Usabilidad | ≥ 90 % completa las tareas sin ayuda | **Pendiente** | La interfaz usa lenguaje sencillo, fechas legibles y una página de Ayuda por rol. Falta aplicar `docs/validacion-usabilidad.md` con comerciantes reales. |
| RNF-02 Rendimiento | Predicción en ≤ 10 s | Verificado | Ver tabla de carga: con 25 usuarios simultáneos, la predicción más lenta tardó 8,1 s; con un usuario, 0,2 s. |
| RNF-03 Disponibilidad | ≥ 99 % del tiempo mensual | **Parcial** | El servicio de ML se reinicia solo si se cae y en **Plataforma** se ve el estado de cada servicio. No se ha medido un mes en producción porque el sistema aún no está publicado. |
| RNF-04 Seguridad | Datos cifrados y sin accesos indebidos | Verificado | Dirección del comercio guardada cifrada (`enc:v1:…`, AES-256-GCM) y contraseñas como hash bcrypt, comprobado en la base. Controles de acceso por rol verificados en RF-02 y RF-11. No se ha hecho una auditoría externa. |
| RNF-05 Escalabilidad | Tiempos aceptables con 10 × los comercios | Verificado | De 9 a 259 comercios (más de 10 veces) y 45.000 registros más: la predicción con 1 usuario siguió en 0,2 s y con 25 usuarios en 7,7 s como máximo, sin errores. |
| RNF-06 Compatibilidad | Chrome, Firefox y celular | **Parcial** | Revisado en Chrome y en celular. Falta revisar en Firefox y volver a revisar en celular Plataforma, Comercios, Modelos e Historial. |
| RNF-07 Mantenibilidad | El modelo se actualiza sin afectar lo demás | Verificado | El modelo es un servicio aparte (`server/ml`, Python) con su propia API; la web y el servidor solo lo llaman por HTTP. Pruebas automáticas: 10 del servidor y 8 de ML. |
| RNF-08 Precisión | MAE bajo el umbral del equipo | **Pendiente** | El equipo aún no define el umbral. Hoy, con datos reales, el modelo **empata** con el método empírico (MAE 1,32 frente a 1,31): no lo supera. Se necesitan más datos reales y más comercios. |

## Prueba de carga (RNF-02, RNF-05)

`npm run test:load`. Cada fila son 60 peticiones; tiempos en milisegundos.

| Operación | Usuarios simultáneos | 9 comercios: p95 / máx | 259 comercios: p95 / máx | Errores |
|---|---|---|---|---|
| Predicción de 7 días | 1 | 209 / 212 | 198 / 224 | 0 |
| Predicción de 7 días | 10 | 1.770 / 2.584 | 2.778 / 4.309 | 0 |
| Predicción de 7 días | 25 | 7.526 / 8.094 | 7.225 / 7.653 | 0 |
| Histórico de 90 días | 25 | 74 / 95 | 44 / 50 | 0 |
| Lista de comercios | 25 | 40 / 43 | 89 / 95 | 0 |
| Estadísticas (admin) | 25 | 70 / 78 | 516 / 578 | 0 |

Predicciones durante un reentrenamiento: 7 atendidas, 0 fallidas, la más lenta en 803 ms.

**Corrección hecha en esta revisión.** La primera corrida mostró que con 10 usuarios simultáneos la predicción tardaba
~21 s y con 25 hasta ~60 s, por encima del límite de 10 s. La causa: para explicar cada predicción, el servicio de ML
llamaba al modelo unas 26 veces por separado. Ahora hace una sola llamada con todas las variantes (los factores
resultan idénticos) y una predicción pasó de ~2,1 s a ~0,17 s.

## Lo que falta y de qué depende

- Del equipo: definir el umbral de la RNF-08; aplicar la prueba de usabilidad con comerciantes (RNF-01); reunir más
  datos reales y comercios; configurar el correo SMTP; publicar con HTTPS y medir la disponibilidad (RNF-03).
- Técnico: revisar en Firefox y en celular (RNF-06); probar `docs/despliegue.md` en un Ubuntu real.
