"""Ingeniería de características: variables temporales, de calendario y climáticas.

Todas las variables se derivan de la fecha (calendario oficial colombiano) o de los
datos climáticos reales que envía la API (Open-Meteo). No hay valores simulados.
"""

from __future__ import annotations

import calendar
import json
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import holidays
import numpy as np
import pandas as pd

EVENTS_FILE = Path(__file__).with_name("calendar_events.json")

DOW_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

# Categorías de comercio (iguales a las de la encuesta y server/src/validation.ts)
CATEGORIES = [
    "Variedades", "Ropa y calzado", "Farmacia", "Alimentos", "Restaurante",
    "Ferretería", "Papelería", "Tecnología", "Textilería",
]

FEATURE_COLUMNS = [
    "dow_0", "dow_1", "dow_2", "dow_3", "dow_4", "dow_5", "dow_6",
    "is_quincena", "is_pre_quincena", "is_post_quincena",
    "is_end_of_month", "is_start_of_month",
    "is_holiday", "is_school_break", "is_commercial_event",
    "month_sin", "month_cos", "is_december",
    "tmax", "tmin", "precip", "humidity", "rain_heavy",
    *[f"cat_{i}" for i in range(len(CATEGORIES))],
]

FEATURE_LABELS = {
    "dow": "Día de la semana",
    "month": "Mes del año (temporada)",
    "is_december": "Temporada navideña (diciembre)",
    "cat": "Tipo de comercio",
    "is_quincena": "Quincena (día de pago)",
    "is_pre_quincena": "Víspera de quincena",
    "is_post_quincena": "Día después de quincena",
    "is_end_of_month": "Fin de mes",
    "is_start_of_month": "Inicio de mes",
    "is_holiday": "Festivo",
    "is_school_break": "Receso escolar",
    "is_commercial_event": "Evento comercial",
    "tmax": "Temperatura máxima",
    "tmin": "Temperatura mínima",
    "precip": "Precipitación",
    "humidity": "Humedad relativa",
    "rain_heavy": "Lluvia fuerte (≥10 mm)",
}


@lru_cache(maxsize=16)
def _co_holidays(year: int) -> holidays.HolidayBase:
    return holidays.country_holidays("CO", years=year, language="es")


@lru_cache(maxsize=1)
def _events() -> dict:
    if not EVENTS_FILE.exists():
        return {"school_breaks": [], "commercial_events": []}
    return json.loads(EVENTS_FILE.read_text(encoding="utf-8"))


def _in_ranges(d: date, ranges: list[dict]) -> str | None:
    iso = d.isoformat()
    for r in ranges:
        if r["from"] <= iso <= r["to"]:
            return r.get("name") or "Evento"
    return None


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    d = date(year, month, 1)
    first = d + timedelta(days=(weekday - d.weekday()) % 7)
    return first + timedelta(weeks=n - 1)


def commercial_events(year: int) -> dict[date, str]:
    """Fechas comerciales de Colombia que se calculan solas (el día y los 2 días previos de compras)."""
    base = {
        _nth_weekday(year, 5, 6, 2): "Día de la Madre",  # segundo domingo de mayo
        _nth_weekday(year, 6, 6, 3): "Día del Padre",  # tercer domingo de junio
        _nth_weekday(year, 9, 5, 3): "Día del Amor y la Amistad",  # tercer sábado de septiembre
    }
    out: dict[date, str] = {}
    for day, name in base.items():
        for back in (2, 1):
            out[day - timedelta(days=back)] = f"Previa: {name}"
        out[day] = name
    return out


def _payday(d: date) -> date:
    """Si el 15 o el último día cae en fin de semana, el pago suele adelantarse al viernes."""
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _paydays(year: int, month: int) -> tuple[date, date]:
    last = calendar.monthrange(year, month)[1]
    return _payday(date(year, month, 15)), _payday(date(year, month, last))


def calendar_info(d: date) -> dict:
    hol = _co_holidays(d.year).get(d)
    p15, plast = _paydays(d.year, d.month)
    paydays = {p15, plast, date(d.year, d.month, 15), date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])}
    prev_month_last = d.replace(day=1) - timedelta(days=1)
    _, prev_plast = _paydays(prev_month_last.year, prev_month_last.month)
    all_paydays = paydays | {prev_plast, prev_month_last}

    last_day = calendar.monthrange(d.year, d.month)[1]
    ev = _events()
    commercial = commercial_events(d.year).get(d) or _in_ranges(d, ev.get("commercial_events", []))
    school = _in_ranges(d, ev.get("school_breaks", []))

    return {
        "isHoliday": hol is not None,
        "holidayName": hol,
        "isQuincena": d in paydays,
        "isPreQuincena": (d + timedelta(days=1)) in paydays and d not in paydays,
        "isPostQuincena": (d - timedelta(days=1)) in all_paydays and d not in paydays,
        "isEndOfMonth": d.day >= last_day - 2,
        "isStartOfMonth": d.day <= 2,
        "schoolBreak": school,
        "event": commercial,
        "season": season_label(d),
    }


def season_label(d: date) -> str:
    if d.month == 12:
        return "Temporada navideña"
    if d.month == 1:
        return "Inicio de año / regreso a clases"
    if d.month in (6, 7):
        return "Vacaciones de mitad de año"
    if d.month in (4, 5, 9, 10, 11):
        return "Temporada de lluvias"
    return "Temporada seca"


def build_frame(rows: list[dict]) -> pd.DataFrame:
    """rows: [{date, tmax, tmin, precip, humidity, ...}] -> DataFrame con FEATURE_COLUMNS."""
    out = []
    for r in rows:
        d = date.fromisoformat(r["date"])
        cal = calendar_info(d)
        feat = {f"dow_{i}": 1.0 if d.weekday() == i else 0.0 for i in range(7)}
        precip = float(r.get("precip") or 0.0)
        cat = r.get("category") or "Variedades"
        cat_idx = CATEGORIES.index(cat) if cat in CATEGORIES else 0
        feat.update({f"cat_{i}": 1.0 if i == cat_idx else 0.0 for i in range(len(CATEGORIES))})
        # Estacionalidad anual codificada de forma cíclica (diciembre queda junto a enero)
        angle = 2 * np.pi * (d.month - 1 + (d.day - 1) / 31) / 12
        feat.update(month_sin=float(np.sin(angle)), month_cos=float(np.cos(angle)), is_december=float(d.month == 12))
        feat.update(
            is_quincena=float(cal["isQuincena"]),
            is_pre_quincena=float(cal["isPreQuincena"]),
            is_post_quincena=float(cal["isPostQuincena"]),
            is_end_of_month=float(cal["isEndOfMonth"]),
            is_start_of_month=float(cal["isStartOfMonth"]),
            is_holiday=float(cal["isHoliday"]),
            is_school_break=float(cal["schoolBreak"] is not None),
            is_commercial_event=float(cal["event"] is not None),
            tmax=float(r["tmax"]),
            tmin=float(r["tmin"]),
            precip=precip,
            humidity=float(r["humidity"]),
            rain_heavy=1.0 if precip >= 10 else 0.0,
        )
        out.append(feat)
    return pd.DataFrame(out, columns=FEATURE_COLUMNS, dtype=float)


def group_importances(names: list[str], values: np.ndarray) -> list[dict]:
    grouped: dict[str, float] = {}
    for n, v in zip(names, values):
        key = (
            "dow" if n.startswith("dow_")
            else "cat" if n.startswith("cat_")
            else "month" if n.startswith("month_")
            else n
        )
        grouped[key] = grouped.get(key, 0.0) + float(v)
    total = sum(grouped.values()) or 1.0
    items = [
        {"feature": FEATURE_LABELS.get(k, k), "importance": round(v / total, 4)}
        for k, v in grouped.items()
    ]
    return sorted(items, key=lambda x: -x["importance"])
