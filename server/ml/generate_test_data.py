"""Genera los DATOS DE PRUEBA (inventados) de los comercios de prueba de ComercIA.

Cada comercio tiene un "perfil" documentado (base diaria y efectos multiplicativos). El número de
clientes de cada día se calcula como:

    esperado = base × día_semana × pago × festivo × temporada × evento × clima × tendencia
    clientes = Poisson(esperado)        (azar con semilla fija → siempre los mismos datos)

El clima usado es el REAL de Montería (Open-Meteo), para que la lluvia afecte en los días que de verdad llovió.
El calendario (quincenas, festivos, eventos) es el mismo que usa el modelo (features.calendar_info).

Uso:  .venv/Scripts/python generate_test_data.py --out ../../datos-de-prueba [--start 2025-10-01] [--end 2026-10-19]
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from features import DOW_NAMES, calendar_info

SEED = 2026
LAT, LNG = 8.7575, -75.8877
PASSWORD = "Prueba2026"  # contraseña de las cuentas de prueba (documentada en LEEME.md)

# Efectos por mes (1 = enero … 12 = diciembre); los que no aparecen valen 0 %.
STORES: list[dict] = [
    {
        "id": "prueba-moda-sinu",
        "nombre": "Moda Sinú (PRUEBA)",
        "categoria": "Ropa y calzado",
        "direccion": "Calle 31 #3-40, Centro, Montería",
        "empleados": 4,
        "antiguedad": 6,
        "base": 22,
        "dia_semana": [0.85, 0.85, 0.90, 0.95, 1.15, 1.60, 0.70],
        "quincena": 0.30, "previa_quincena": 0.10, "post_quincena": 0.15, "fin_mes": 0.10,
        "festivo": -0.15,
        "meses": {12: 0.45, 1: -0.15, 6: 0.10, 7: 0.10},
        "eventos": {"Día de la Madre": 0.40, "Día del Padre": 0.25, "Día del Amor y la Amistad": 0.35},
        "lluvia_por_mm": -0.015, "lluvia_tope": -0.35, "calor_mayor_34": -0.05,
        "tendencia_anual": 0.05,
        "cerrado": ["01-01", "12-25"],
        "descripcion": "Tienda de ropa: muy sensible a sábados, quincenas, diciembre y fechas de regalo; la lluvia la afecta.",
    },
    {
        "id": "prueba-drogueria-esperanza",
        "nombre": "Droguería La Esperanza (PRUEBA)",
        "categoria": "Farmacia",
        "direccion": "Carrera 4 #29-12, Centro, Montería",
        "empleados": 5,
        "antiguedad": 12,
        "base": 30,
        "dia_semana": [1.05, 1.00, 1.00, 1.00, 1.00, 1.05, 0.80],
        "quincena": 0.08, "previa_quincena": 0.0, "post_quincena": 0.03, "fin_mes": 0.03,
        "festivo": -0.05,
        "meses": {4: 0.12, 5: 0.12, 10: 0.10, 11: 0.10, 12: 0.08},
        "eventos": {},
        "lluvia_por_mm": -0.005, "lluvia_tope": -0.10, "calor_mayor_34": 0.0,
        "tendencia_anual": 0.02,
        "cerrado": [],
        "descripcion": "Droguería: flujo estable; sube en temporadas de lluvias (enfermedades respiratorias), poco efecto de quincena.",
    },
    {
        "id": "prueba-asadero-fogon",
        "nombre": "Asadero El Fogón (PRUEBA)",
        "categoria": "Restaurante",
        "direccion": "Calle 28 #5-15, Centro, Montería",
        "empleados": 7,
        "antiguedad": 9,
        "base": 45,
        "dia_semana": [0.80, 0.85, 0.90, 0.95, 1.20, 1.35, 1.25],
        "quincena": 0.15, "previa_quincena": 0.05, "post_quincena": 0.10, "fin_mes": 0.05,
        "festivo": 0.20,
        "meses": {12: 0.20, 1: 0.05, 6: 0.05, 7: 0.05},
        "eventos": {"Día de la Madre": 0.50, "Día del Padre": 0.30, "Día del Amor y la Amistad": 0.25},
        "lluvia_por_mm": -0.020, "lluvia_tope": -0.40, "calor_mayor_34": -0.08,
        "tendencia_anual": 0.0,
        "cerrado": ["01-01"],
        "descripcion": "Restaurante: fines de semana y festivos altos; la lluvia fuerte lo afecta mucho.",
    },
    {
        "id": "prueba-ferreteria-tornillo",
        "nombre": "Ferretería El Tornillo (PRUEBA)",
        "categoria": "Ferretería",
        "direccion": "Carrera 7 #27-30, Centro, Montería",
        "empleados": 3,
        "antiguedad": 15,
        "base": 18,
        "dia_semana": [1.05, 1.00, 1.00, 1.00, 1.05, 1.30, 0.30],
        "quincena": 0.10, "previa_quincena": 0.0, "post_quincena": 0.05, "fin_mes": 0.05,
        "festivo": -0.60,
        "meses": {4: 0.10, 5: 0.10, 9: 0.08, 10: 0.10, 11: 0.08, 12: -0.10, 1: 0.05},
        "eventos": {},
        "lluvia_por_mm": -0.008, "lluvia_tope": -0.20, "calor_mayor_34": 0.0,
        "tendencia_anual": 0.03,
        "cerrado": ["01-01", "12-25"],
        "descripcion": "Ferretería: casi cerrada domingos y festivos; sube en temporada de lluvias (reparaciones).",
    },
    {
        "id": "prueba-papeleria-escolar",
        "nombre": "Papelería Escolar (PRUEBA)",
        "categoria": "Papelería",
        "direccion": "Calle 30 #6-10, Centro, Montería",
        "empleados": 2,
        "antiguedad": 8,
        "base": 15,
        "dia_semana": [1.05, 1.05, 1.05, 1.05, 1.00, 0.90, 0.40],
        "quincena": 0.10, "previa_quincena": 0.0, "post_quincena": 0.05, "fin_mes": 0.05,
        "festivo": -0.40,
        "meses": {12: -0.40, 1: 0.60, 2: 0.30, 6: -0.15, 7: 0.20},
        "eventos": {},
        "lluvia_por_mm": -0.008, "lluvia_tope": -0.20, "calor_mayor_34": 0.0,
        "tendencia_anual": 0.0,
        "cerrado": ["01-01", "12-25"],
        "descripcion": "Papelería: dominada por el calendario escolar (pico enero–febrero y julio, baja en diciembre).",
    },
    {
        "id": "prueba-variedades-centro",
        "nombre": "Variedades El Centro (PRUEBA)",
        "categoria": "Variedades",
        "direccion": "Carrera 3 #30-55, Centro, Montería",
        "empleados": 3,
        "antiguedad": 10,
        "base": 25,
        "dia_semana": [0.90, 0.90, 0.95, 0.95, 1.10, 1.55, 0.80],
        "quincena": 0.25, "previa_quincena": 0.08, "post_quincena": 0.12, "fin_mes": 0.08,
        "festivo": -0.10,
        "meses": {12: 0.60, 1: -0.10, 11: 0.10},
        "eventos": {"Día de la Madre": 0.20, "Día del Amor y la Amistad": 0.20},
        "lluvia_por_mm": -0.010, "lluvia_tope": -0.25, "calor_mayor_34": -0.03,
        "tendencia_anual": 0.04,
        "cerrado": ["01-01", "12-25"],
        "descripcion": "Variedades: patrón parecido al comercio piloto real, con fuerte temporada navideña.",
    },
]

MISSING_RATE = 0.015  # ~1,5 % de días sin registro (simula olvidos del comerciante)


def fetch_weather(start: date, end: date) -> dict[str, dict]:
    """Clima diario real de Montería: archivo (ERA5) + últimos días del pronóstico."""
    daily = "temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean"
    out: dict[str, dict] = {}

    def get(url: str, params: dict):
        qs = urllib.parse.urlencode({"latitude": LAT, "longitude": LNG, "daily": daily, "timezone": "America/Bogota", **params})
        with urllib.request.urlopen(f"{url}?{qs}", timeout=60) as r:
            d = json.load(r)["daily"]
        for i, t in enumerate(d["time"]):
            if d["temperature_2m_max"][i] is None:
                continue
            out.setdefault(t, {
                "tmax": d["temperature_2m_max"][i],
                "precip": d["precipitation_sum"][i] or 0.0,
            })

    archive_end = min(end, date.today() - timedelta(days=6))
    if start <= archive_end:
        get("https://archive-api.open-meteo.com/v1/archive", {"start_date": start.isoformat(), "end_date": archive_end.isoformat()})
    if archive_end < end:
        get("https://api.open-meteo.com/v1/forecast", {"past_days": 14, "forecast_days": 1})
    return out


def generate(store: dict, start: date, end: date, weather: dict, rng: np.random.Generator) -> list[dict]:
    rows = []
    total_days = (end - start).days or 1
    d = start
    while d <= end:
        cal = calendar_info(d)
        mmdd = d.strftime("%m-%d")
        w = weather.get(d.isoformat(), {"tmax": 32.0, "precip": 0.0})
        f_dia = store["dia_semana"][d.weekday()]
        f_pago = 1 + (
            store["quincena"] if cal["isQuincena"]
            else store["previa_quincena"] if cal["isPreQuincena"]
            else store["post_quincena"] if cal["isPostQuincena"]
            else 0
        ) + (store["fin_mes"] if cal["isEndOfMonth"] and not cal["isQuincena"] else 0)
        f_festivo = 1 + (store["festivo"] if cal["isHoliday"] else 0)
        f_temporada = 1 + store["meses"].get(d.month, 0)
        evento = (cal["event"] or "").replace("Previa: ", "")
        f_evento = 1 + store["eventos"].get(evento, 0) * (1 if cal["event"] and not cal["event"].startswith("Previa") else 0.6)
        f_clima = 1 + max(store["lluvia_tope"], store["lluvia_por_mm"] * w["precip"])
        if w["tmax"] > 34:
            f_clima *= 1 + store["calor_mayor_34"]
        f_tend = 1 + store["tendencia_anual"] * ((d - start).days / total_days)
        esperado = store["base"] * f_dia * f_pago * f_festivo * f_temporada * f_evento * f_clima * f_tend
        cerrado = mmdd in store["cerrado"]
        sin_registro = not cerrado and rng.random() < MISSING_RATE
        clientes = 0 if cerrado else int(rng.poisson(esperado))
        if not sin_registro and not cerrado:
            rows.append({
                "fecha": d.isoformat(),
                "dia": DOW_NAMES[d.weekday()],
                "clientes": clientes,
                "esperado": round(esperado, 2),
                "factor_dia": f_dia,
                "factor_pago": round(f_pago, 3),
                "factor_festivo": f_festivo,
                "factor_temporada": f_temporada,
                "factor_evento": round(f_evento, 3),
                "factor_clima": round(f_clima, 3),
                "factor_tendencia": round(f_tend, 3),
                "tmax": w["tmax"],
                "lluvia_mm": w["precip"],
                "festivo": cal["holidayName"] or "",
                "evento": cal["event"] or "",
            })
        d += timedelta(days=1)
    return rows


def extend(out: Path, new_end: date) -> None:
    """Agrega días nuevos al final de los CSV sin cambiar ningún día ya generado.

    Regenerar todo con otra fecha final cambiaría el historial: el azar se comparte entre comercios y la
    tendencia depende de la duración del período. Por eso los días nuevos usan su propia semilla.
    """
    params = json.loads((out / "parametros.json").read_text(encoding="utf-8"))
    start, prev_end = date.fromisoformat(params["desde"]), date.fromisoformat(params["hasta"])
    if new_end <= prev_end:
        raise SystemExit(f"Los datos ya llegan hasta {prev_end}; no hay días que agregar hasta {new_end}.")
    first_new = prev_end + timedelta(days=1)

    print(f"Descargando clima real de Montería: {first_new} a {new_end}")
    weather = fetch_weather(first_new, new_end)
    missing = [
        (first_new + timedelta(days=i)).isoformat()
        for i in range((new_end - first_new).days + 1)
        if (first_new + timedelta(days=i)).isoformat() not in weather
    ]
    if missing:
        raise SystemExit(f"Falta el clima real de: {', '.join(missing)}. No se agregó ningún día.")

    seed = [SEED, prev_end.toordinal()]
    rng = np.random.default_rng(seed)
    new_rows = {
        s["id"]: [r for r in generate(s, start, new_end, weather, rng) if r["fecha"] > prev_end.isoformat()]
        for s in STORES
    }

    summary = []
    for s in STORES:
        path = out / f"{s['id']}.csv"
        with open(path, "a", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=list(new_rows[s["id"]][0].keys())).writerows(new_rows[s["id"]])
        with open(path, newline="", encoding="utf-8-sig") as f:
            vals = [int(r["clientes"]) for r in csv.DictReader(f)]
        summary.append({
            "id": s["id"], "dias": len(vals), "promedio": round(float(np.mean(vals)), 1),
            "minimo": min(vals), "maximo": max(vals),
        })
        print(f"  {s['nombre']}: +{len(new_rows[s['id']])} días, {len(vals)} en total")

    params["hasta"] = new_end.isoformat()
    params["resumen"] = summary
    params.setdefault("extensiones", []).append(
        {"desde": first_new.isoformat(), "hasta": new_end.isoformat(), "semilla": seed}
    )
    (out / "parametros.json").write_text(json.dumps(params, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", default="2025-10-01")
    ap.add_argument("--end", default="2026-10-19")
    ap.add_argument("--extend-to", help="agrega días hasta esta fecha sin cambiar los ya generados")
    args = ap.parse_args()
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.extend_to:
        extend(out, date.fromisoformat(args.extend_to))
        return

    print(f"Descargando clima real de Montería {start} → {end}…")
    weather = fetch_weather(start, end)
    rng = np.random.default_rng(SEED)
    summary = []
    for s in STORES:
        rows = generate(s, start, end, weather, rng)
        with open(out / f"{s['id']}.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        vals = [r["clientes"] for r in rows]
        summary.append({
            "id": s["id"], "dias": len(rows), "promedio": round(float(np.mean(vals)), 1),
            "minimo": int(min(vals)), "maximo": int(max(vals)),
        })
        print(f"  {s['nombre']}: {len(rows)} días, promedio {np.mean(vals):.1f} clientes")

    params = {
        "advertencia": "DATOS INVENTADOS para pruebas del sistema. No usar como resultados de la investigación.",
        "semilla": SEED,
        "desde": start.isoformat(),
        "hasta": end.isoformat(),
        "contrasena_cuentas": PASSWORD,
        "dias_sin_registro_aprox": MISSING_RATE,
        "comercios": STORES,
        "resumen": summary,
    }
    (out / "parametros.json").write_text(json.dumps(params, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Listo: {out.resolve()}")


if __name__ == "__main__":
    main()
