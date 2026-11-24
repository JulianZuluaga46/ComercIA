"""Servicio de machine learning de ComercIA (FastAPI).

- POST /train   entrena Random Forest o XGBoost con validación walk-forward y lo guarda.
- POST /predict genera predicciones con un modelo guardado, con intervalo y factores explicativos.

El objetivo que aprende el modelo es la razón clientes / promedio del comercio, de modo que
un mismo modelo sirva para comercios de distinto tamaño.
"""

from __future__ import annotations

import os
import time
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor

from features import (
    DOW_NAMES,
    FEATURE_COLUMNS,
    build_frame,
    calendar_info,
    group_importances,
)

# COMERCIA_MODELS_DIR separa los modelos de otra base (por ejemplo, la copia para una exposición)
MODELS_DIR = Path(os.environ.get("COMERCIA_MODELS_DIR") or Path(__file__).with_name("models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MIN_RECORDS = 28  # 4 semanas: mínimo para entrenar
INITIAL_WINDOW_DAYS = 42  # walk-forward: 6 semanas iniciales de entrenamiento
STEP_DAYS = 7
MAX_EVAL_WEEKS = 26  # validación walk-forward sobre, como máximo, el último semestre

ALGORITHMS = {
    "rf": "Random Forest",
    "xgb": "XGBoost",
}

app = FastAPI(title="ComercIA ML")


class Record(BaseModel):
    storeId: str
    date: str
    category: str = "Variedades"
    clients: float | None = None
    tmax: float
    tmin: float
    precip: float
    humidity: float


class TrainRequest(BaseModel):
    algorithm: str
    version: str
    records: list[Record]


class PredictRow(BaseModel):
    storeId: str
    date: str
    category: str = "Variedades"
    storeMean: float
    tmax: float
    tmin: float
    precip: float
    humidity: float


class PredictRequest(BaseModel):
    version: str
    rows: list[PredictRow]
    # contexto para la confianza: registros reales del comercio y si el clima es climatología
    storeRecords: dict[str, int] = {}
    climatologyDates: list[str] = []


def make_model(algorithm: str):
    if algorithm == "rf":
        return RandomForestRegressor(
            n_estimators=300, min_samples_leaf=2, max_features=0.6, random_state=42, n_jobs=-1
        )
    if algorithm == "xgb":
        return XGBRegressor(
            n_estimators=250, max_depth=3, learning_rate=0.05, subsample=0.9,
            colsample_bytree=0.8, random_state=42, n_jobs=2,
        )
    raise HTTPException(400, f"Algoritmo no soportado: {algorithm}")


def metrics(real: np.ndarray, pred: np.ndarray) -> dict:
    n = len(real)
    if n == 0:
        return {"mae": 0, "rmse": 0, "r2": 0, "mape": 0, "n": 0}
    err = real - pred
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err**2)))
    ss_tot = float(np.sum((real - real.mean()) ** 2))
    r2 = 1 - float(np.sum(err**2)) / ss_tot if ss_tot else 0.0
    mape = float(np.mean(np.abs(err) / np.where(real == 0, 1, real))) * 100
    return {
        "mae": round(mae, 2), "rmse": round(rmse, 2), "r2": round(r2, 3),
        "mape": round(mape, 1), "n": n,
    }


def weekday_baseline(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """Método empírico de referencia: promedio del mismo día de la semana en el comercio."""
    means = train.groupby(["storeId", "dow"])["clients"].mean()
    store_means = train.groupby("storeId")["clients"].mean()
    out = []
    for _, r in test.iterrows():
        v = means.get((r.storeId, r.dow))
        if v is None or np.isnan(v):
            v = store_means.get(r.storeId, train["clients"].mean())
        out.append(v)
    return np.array(out, dtype=float)


def fit(algorithm: str, df: pd.DataFrame):
    store_means = df.groupby("storeId")["clients"].mean().to_dict()
    X = build_frame(df.to_dict("records"))
    y = df["clients"].to_numpy() / df["storeId"].map(store_means).to_numpy()
    model = make_model(algorithm)
    model.fit(X, y)
    return model, store_means


@app.get("/health")
def health():
    return {"ok": True, "service": "comercia-ml"}


@app.post("/train")
def train(req: TrainRequest):
    if req.algorithm not in ALGORITHMS:
        if req.algorithm == "lstm":
            raise HTTPException(
                400,
                "LSTM no está disponible en esta versión: necesita al menos un año de datos reales diarios por "
                "comercio para generalizar. Use Random Forest o XGBoost.",
            )
        raise HTTPException(400, f"Algoritmo no soportado: {req.algorithm}")

    df = pd.DataFrame([r.model_dump() for r in req.records if r.clients is not None])
    if len(df) < MIN_RECORDS:
        raise HTTPException(
            400, f"Datos insuficientes: hay {len(df)} registros y se requieren al menos {MIN_RECORDS}."
        )
    df["date_obj"] = pd.to_datetime(df["date"])
    df["dow"] = df["date_obj"].dt.day_of_week
    df = df.sort_values("date_obj").reset_index(drop=True)

    started = time.time()

    # Validación walk-forward: entrena con el pasado y predice la semana siguiente.
    # Con historias largas se evalúan solo las últimas MAX_EVAL_WEEKS semanas para acotar el tiempo.
    end = df["date_obj"].max()
    start = max(
        df["date_obj"].min() + pd.Timedelta(days=INITIAL_WINDOW_DAYS),
        end - pd.Timedelta(weeks=MAX_EVAL_WEEKS) + pd.Timedelta(days=1),
    )
    bt_rows, bt_pred, bt_base = [], [], []
    cursor = start
    while cursor <= end:
        nxt = cursor + pd.Timedelta(days=STEP_DAYS)
        tr = df[df["date_obj"] < cursor]
        te = df[(df["date_obj"] >= cursor) & (df["date_obj"] < nxt)]
        if len(te) and len(tr) >= MIN_RECORDS:
            model, smeans = fit(req.algorithm, tr)
            fallback = tr["clients"].mean()
            means = te["storeId"].map(smeans).fillna(fallback).to_numpy()
            pred = model.predict(build_frame(te.to_dict("records"))) * means
            bt_rows.append(te)
            bt_pred.append(pred)
            bt_base.append(weekday_baseline(tr, te))
        cursor = nxt

    if not bt_rows:
        raise HTTPException(
            400,
            f"Datos insuficientes para validar: se necesitan más de {INITIAL_WINDOW_DAYS} días de historia.",
        )
    bt = pd.concat(bt_rows)
    pred_all = np.concatenate(bt_pred)
    base_all = np.concatenate(bt_base)
    real_all = bt["clients"].to_numpy()
    m = metrics(real_all, pred_all)
    mb = metrics(real_all, base_all)

    # Modelo final con todos los datos
    model, store_means = fit(req.algorithm, df)
    rel_rmse = float(np.sqrt(np.mean(((real_all - pred_all) / np.maximum(real_all, 1)) ** 2)))

    raw_imp = getattr(model, "feature_importances_", np.zeros(len(FEATURE_COLUMNS)))
    importances = group_importances(FEATURE_COLUMNS, np.asarray(raw_imp))

    joblib.dump(
        {
            "model": model,
            "algorithm": req.algorithm,
            "store_means": store_means,
            "rel_rmse": rel_rmse,
            "mape": m["mape"],
            "features": FEATURE_COLUMNS,
            "trained_through": df["date"].max(),
        },
        MODELS_DIR / f"{req.version}.joblib",
    )

    return {
        "version": req.version,
        "algorithm": ALGORITHMS[req.algorithm],
        "metrics": m,
        "baseline": mb,
        "importances": importances,
        "records": int(len(df)),
        "durationMs": int((time.time() - started) * 1000),
        "trainedThrough": df["date"].max(),
        "backtest": [
            # baseline: método empírico para ese mismo día, para comparar por comercio
            {"storeId": r.storeId, "date": r.date, "predicted": round(float(p), 1), "baseline": round(float(b), 1)}
            for r, p, b in zip(bt.itertuples(), pred_all, base_all)
        ],
    }


_cache: dict[str, dict] = {}


def load(version: str) -> dict:
    if version not in _cache:
        path = MODELS_DIR / f"{version}.joblib"
        if not path.exists():
            raise HTTPException(404, f"Modelo {version} no encontrado. Entrene un modelo primero.")
        _cache[version] = joblib.load(path)
    return _cache[version]


MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]


def explain(model, X: pd.DataFrame, base_pred: np.ndarray, means: np.ndarray, ref: dict,
            month_names: list[str]) -> list[list[dict]]:
    """Factores por contrafactual: cuánto cambia la predicción si se 'apaga' cada variable.

    Todas las variantes se predicen en UNA sola llamada al modelo: con un Random Forest, cada llamada tiene un costo
    fijo alto, y hacer ~26 llamadas separadas volvía lenta la predicción con varios usuarios a la vez (RNF-02).
    """
    variants: list[pd.DataFrame] = []

    def add(v: pd.DataFrame) -> int:
        variants.append(v)
        return len(variants) - 1

    # Día de la semana: comparación contra el promedio de los 7 días
    dow_idx = []
    for i in range(7):
        v = X.copy()
        for j in range(7):
            v[f"dow_{j}"] = 1.0 if j == i else 0.0
        dow_idx.append(add(v))

    # Temporada: comparación contra el promedio de los 12 meses
    month_idx = []
    for m in range(12):
        v = X.copy()
        angle = 2 * np.pi * (m + 0.5) / 12
        v["month_sin"] = np.sin(angle)
        v["month_cos"] = np.cos(angle)
        v["is_december"] = 1.0 if m == 11 else 0.0
        month_idx.append(add(v))

    toggles = [
        (["is_quincena", "is_pre_quincena", "is_post_quincena"], 0.0, "Ciclo de pago (quincena)"),
        (["is_end_of_month", "is_start_of_month"], 0.0, "Fin / inicio de mes"),
        (["is_holiday"], 0.0, "Festivo"),
        (["is_school_break"], 0.0, "Receso escolar"),
        (["is_commercial_event"], 0.0, "Evento comercial"),
    ]
    toggle_idx = []
    for cols, val, label in toggles:
        mod = X.copy()
        for c in cols:
            mod[c] = val
        toggle_idx.append((cols, label, add(mod)))

    rain = X.copy()
    rain["precip"] = ref["precip"]
    rain["humidity"] = ref["humidity"]
    rain["rain_heavy"] = 0.0
    rain_i = add(rain)

    temp = X.copy()
    temp["tmax"] = ref["tmax"]
    temp["tmin"] = ref["tmin"]
    temp_i = add(temp)

    n = len(X)
    out = model.predict(pd.concat(variants, ignore_index=True)).reshape(len(variants), n) * means

    def delta(k: int) -> np.ndarray:
        return base_pred - out[k]

    dow_effect = base_pred - out[dow_idx].mean(axis=0)
    month_effect = base_pred - out[month_idx].mean(axis=0)
    toggle_effects = [(cols, label, delta(k)) for cols, label, k in toggle_idx]
    rain_effect = delta(rain_i)
    temp_effect = delta(temp_i)

    factors: list[list[dict]] = [[] for _ in range(n)]

    for i in range(len(X)):
        dow = int(np.argmax([X.iloc[i][f"dow_{j}"] for j in range(7)]))
        items = [(f"{DOW_NAMES[dow]}", dow_effect[i]), (f"Temporada ({month_names[i]})", month_effect[i])]
        for cols, label, eff in toggle_effects:
            if any(X.iloc[i][c] for c in cols):
                items.append((label, eff[i]))
        p = X.iloc[i]["precip"]
        items.append((f"Lluvia prevista ({p:.1f} mm)" if p >= 1 else "Día seco", rain_effect[i]))
        items.append((f"Temperatura máx. {X.iloc[i]['tmax']:.1f} °C", temp_effect[i]))
        for name, eff in items:
            impact = round(float(eff), 1)
            if abs(impact) >= 0.3:
                factors[i].append(
                    {"name": name, "impact": impact, "type": "positive" if impact > 0 else "negative"}
                )
        factors[i].sort(key=lambda f: -abs(f["impact"]))
    return factors


@app.post("/predict")
def predict(req: PredictRequest):
    bundle = load(req.version)
    if bundle.get("features") != FEATURE_COLUMNS:
        raise HTTPException(
            409, f"El modelo {req.version} se entrenó con otras variables. Un analista debe reentrenar el modelo."
        )
    model = bundle["model"]
    if not req.rows:
        return []
    rows = [r.model_dump() for r in req.rows]
    X = build_frame(rows)
    means = np.array([r["storeMean"] for r in rows], dtype=float)
    pred = model.predict(X) * means

    ref = {
        "precip": 0.0,
        "humidity": float(X["humidity"].median()),
        "tmax": float(X["tmax"].median()),
        "tmin": float(X["tmin"].median()),
    }
    month_names = [MONTHS_ES[date.fromisoformat(r["date"]).month - 1] for r in rows]
    factors = explain(model, X, pred, means, ref, month_names)

    rel = bundle["rel_rmse"]
    clim = set(req.climatologyDates)
    out = []
    for i, r in enumerate(rows):
        p = max(0.0, float(pred[i]))
        margin = 1.28 * rel * p  # ~80 % bajo supuesto de error normal
        conf = max(0.0, 100.0 - bundle["mape"])
        n_store = req.storeRecords.get(r["storeId"], 0)
        if n_store < MIN_RECORDS:
            conf *= 0.75
        if r["date"] in clim:
            conf *= 0.9
        cal = calendar_info(date.fromisoformat(r["date"]))
        out.append(
            {
                "storeId": r["storeId"],
                "date": r["date"],
                "clients": round(p),
                "clientsMin": max(0, int(np.floor(p - margin))),
                "clientsMax": int(np.ceil(p + margin)),
                "confidence": round(conf),
                "calendar": cal,
                "factors": factors[i],
            }
        )
    return out


@app.get("/calendar")
def calendar_range(dates: str):
    return {d: calendar_info(date.fromisoformat(d)) for d in dates.split(",") if d}
