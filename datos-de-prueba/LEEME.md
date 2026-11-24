# Datos de prueba de ComercIA

> ⚠️ **DATOS INVENTADOS para pruebas del sistema. No usar como resultados de la investigación.**

Período: **2025-10-01 a 2026-11-03** · semilla aleatoria **2026**.

Días agregados después: **2026-10-20 a 2026-11-03** · semilla **2026, 739908**. Los días anteriores no cambiaron.
`npm run test-data` regenera solo el período original (hasta 2026-10-19) y borra los días agregados.

## Cómo se calculó cada día

```
esperado = base × día_semana × pago × festivo × temporada × evento × clima × tendencia
clientes = número aleatorio Poisson(esperado)
```

- El **clima es real** (Open-Meteo, Montería): la lluvia reduce el flujo los días que de verdad llovió.
- Quincenas, festivos y eventos usan **el mismo calendario que el modelo**.
- Alrededor del 1,5 % de los días se omiten a propósito ("el comerciante no registró") y los días de cierre no tienen registro.
- Cada archivo CSV trae, además de los clientes, todos los factores aplicados ese día para poder auditarlo.

## Archivo para probar la carga

Días inventados de Moda Sinú (PRUEBA) de noviembre de 2026 (el 6 no se registró), generados con
`generate_test_data.py --extend-to 2026-11-15` y el clima real. Sirven para probar **Registrar datos → Subir archivo**:

- `moda-sinu-hasta-13-noviembre.xlsx`: del 4 al 13 de noviembre (9 días).
- `moda-sinu-actualizado-15-noviembre.xlsx`: del 4 al 15 de noviembre (11 días). Subido después del anterior, trae
  2 días nuevos (14 y 15) y 9 ya registrados.

Como es un comercio de prueba, los días se guardan pero el modelo real no aprende con ellos (solo si un analista
entrena incluyendo los comercios de prueba).

## Comercios y cuentas

Todas las cuentas usan la contraseña **Prueba2026** (también pueden entrar con código por correo; sin SMTP el código aparece en la terminal del servidor).

| Comercio | Categoría | Cuenta | Días | Promedio | Mín | Máx | Archivo |
|---|---|---|---|---|---|---|---|
| Moda Sinú (PRUEBA) | Ropa y calzado | moda-sinu@prueba.comercia.co | 387 | 22.5 | 5 | 50 | `prueba-moda-sinu.csv` |
| Droguería La Esperanza (PRUEBA) | Farmacia | drogueria-esperanza@prueba.comercia.co | 395 | 30.3 | 12 | 51 | `prueba-drogueria-esperanza.csv` |
| Asadero El Fogón (PRUEBA) | Restaurante | asadero-fogon@prueba.comercia.co | 395 | 43.4 | 17 | 84 | `prueba-asadero-fogon.csv` |
| Ferretería El Tornillo (PRUEBA) | Ferretería | ferreteria-tornillo@prueba.comercia.co | 392 | 17.4 | 1 | 37 | `prueba-ferreteria-tornillo.csv` |
| Papelería Escolar (PRUEBA) | Papelería | papeleria-escolar@prueba.comercia.co | 396 | 13.5 | 1 | 32 | `prueba-papeleria-escolar.csv` |
| Variedades El Centro (PRUEBA) | Variedades | variedades-centro@prueba.comercia.co | 388 | 27 | 10 | 78 | `prueba-variedades-centro.csv` |

## Perfil de cada comercio

### Moda Sinú (PRUEBA)

Tienda de ropa: muy sensible a sábados, quincenas, diciembre y fechas de regalo; la lluvia la afecta.

| Efecto | Valor |
|---|---|
| Categoría | Ropa y calzado |
| Base diaria | 22 clientes |
| Día de la semana (×) | Lun 0.85 · Mar 0.85 · Mié 0.9 · Jue 0.95 · Vie 1.15 · Sáb 1.6 · Dom 0.7 |
| Quincena / víspera / día siguiente | +30 % / +10 % / +15 % |
| Fin de mes | +10 % |
| Festivo | -15 % |
| Temporada (mes) | ene -15 %, jun +10 %, jul +10 %, dic +45 % |
| Eventos (día; 60 % del efecto los 2 días previos) | Día de la Madre +40 %, Día del Padre +25 %, Día del Amor y la Amistad +35 % |
| Lluvia | -1.5 % por mm (máx. -35 %) |
| Calor > 34 °C | -5 % |
| Tendencia en el período | +5 % |
| Cerrado | 01-01, 12-25 |

### Droguería La Esperanza (PRUEBA)

Droguería: flujo estable; sube en temporadas de lluvias (enfermedades respiratorias), poco efecto de quincena.

| Efecto | Valor |
|---|---|
| Categoría | Farmacia |
| Base diaria | 30 clientes |
| Día de la semana (×) | Lun 1.05 · Mar 1 · Mié 1 · Jue 1 · Vie 1 · Sáb 1.05 · Dom 0.8 |
| Quincena / víspera / día siguiente | +8 % / 0 % / +3 % |
| Fin de mes | +3 % |
| Festivo | -5 % |
| Temporada (mes) | abr +12 %, may +12 %, oct +10 %, nov +10 %, dic +8 % |
| Eventos (día; 60 % del efecto los 2 días previos) | — |
| Lluvia | -0.5 % por mm (máx. -10 %) |
| Calor > 34 °C | 0 % |
| Tendencia en el período | +2 % |
| Cerrado | — |

### Asadero El Fogón (PRUEBA)

Restaurante: fines de semana y festivos altos; la lluvia fuerte lo afecta mucho.

| Efecto | Valor |
|---|---|
| Categoría | Restaurante |
| Base diaria | 45 clientes |
| Día de la semana (×) | Lun 0.8 · Mar 0.85 · Mié 0.9 · Jue 0.95 · Vie 1.2 · Sáb 1.35 · Dom 1.25 |
| Quincena / víspera / día siguiente | +15 % / +5 % / +10 % |
| Fin de mes | +5 % |
| Festivo | +20 % |
| Temporada (mes) | ene +5 %, jun +5 %, jul +5 %, dic +20 % |
| Eventos (día; 60 % del efecto los 2 días previos) | Día de la Madre +50 %, Día del Padre +30 %, Día del Amor y la Amistad +25 % |
| Lluvia | -2 % por mm (máx. -40 %) |
| Calor > 34 °C | -8 % |
| Tendencia en el período | 0 % |
| Cerrado | 01-01 |

### Ferretería El Tornillo (PRUEBA)

Ferretería: casi cerrada domingos y festivos; sube en temporada de lluvias (reparaciones).

| Efecto | Valor |
|---|---|
| Categoría | Ferretería |
| Base diaria | 18 clientes |
| Día de la semana (×) | Lun 1.05 · Mar 1 · Mié 1 · Jue 1 · Vie 1.05 · Sáb 1.3 · Dom 0.3 |
| Quincena / víspera / día siguiente | +10 % / 0 % / +5 % |
| Fin de mes | +5 % |
| Festivo | -60 % |
| Temporada (mes) | ene +5 %, abr +10 %, may +10 %, sep +8 %, oct +10 %, nov +8 %, dic -10 % |
| Eventos (día; 60 % del efecto los 2 días previos) | — |
| Lluvia | -0.8 % por mm (máx. -20 %) |
| Calor > 34 °C | 0 % |
| Tendencia en el período | +3 % |
| Cerrado | 01-01, 12-25 |

### Papelería Escolar (PRUEBA)

Papelería: dominada por el calendario escolar (pico enero–febrero y julio, baja en diciembre).

| Efecto | Valor |
|---|---|
| Categoría | Papelería |
| Base diaria | 15 clientes |
| Día de la semana (×) | Lun 1.05 · Mar 1.05 · Mié 1.05 · Jue 1.05 · Vie 1 · Sáb 0.9 · Dom 0.4 |
| Quincena / víspera / día siguiente | +10 % / 0 % / +5 % |
| Fin de mes | +5 % |
| Festivo | -40 % |
| Temporada (mes) | ene +60 %, feb +30 %, jun -15 %, jul +20 %, dic -40 % |
| Eventos (día; 60 % del efecto los 2 días previos) | — |
| Lluvia | -0.8 % por mm (máx. -20 %) |
| Calor > 34 °C | 0 % |
| Tendencia en el período | 0 % |
| Cerrado | 01-01, 12-25 |

### Variedades El Centro (PRUEBA)

Variedades: patrón parecido al comercio piloto real, con fuerte temporada navideña.

| Efecto | Valor |
|---|---|
| Categoría | Variedades |
| Base diaria | 25 clientes |
| Día de la semana (×) | Lun 0.9 · Mar 0.9 · Mié 0.95 · Jue 0.95 · Vie 1.1 · Sáb 1.55 · Dom 0.8 |
| Quincena / víspera / día siguiente | +25 % / +8 % / +12 % |
| Fin de mes | +8 % |
| Festivo | -10 % |
| Temporada (mes) | ene -10 %, nov +10 %, dic +60 % |
| Eventos (día; 60 % del efecto los 2 días previos) | Día de la Madre +20 %, Día del Amor y la Amistad +20 % |
| Lluvia | -1 % por mm (máx. -25 %) |
| Calor > 34 °C | -3 % |
| Tendencia en el período | +4 % |
| Cerrado | 01-01, 12-25 |

## Comandos

```bash
cd server
npm run test-data          # regenera y vuelve a cargar todo (reemplaza los comercios de prueba)
npm run test-data:extend   # agrega días hasta hoy sin cambiar los existentes (o: -- AAAA-MM-DD)
npm run test-data:remove   # elimina los comercios y cuentas de prueba de la base de datos
```

Para cambiar un comercio, edite su perfil en `server/ml/generate_test_data.py` y ejecute `npm run test-data`.

## Importante para la investigación

- En la aplicación estos comercios aparecen con la etiqueta **PRUEBA**.
- Por defecto el modelo **no** se entrena con ellos. Para usarlos, en *Analista → Entrenamiento* marque
  «Incluir comercios de prueba»; el modelo resultante queda marcado como «con datos de prueba».
- Las métricas de un modelo con datos de prueba **no** sirven como resultado de la hipótesis: el modelo está
  aprendiendo reglas que nosotros inventamos. Sirven para comprobar que el sistema funciona con un año de datos.