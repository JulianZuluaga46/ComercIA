"""Pruebas del servicio de ML. Ejecutar: npm test (en server/) o
.venv/Scripts/python -m unittest test_ml.py  (desde server/ml)."""

import unittest
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app import app
from features import FEATURE_COLUMNS, build_frame, calendar_info


class CalendarTests(unittest.TestCase):
    def test_festivos_colombia(self):
        self.assertTrue(calendar_info(date(2026, 8, 7))["isHoliday"])  # Batalla de Boyacá
        self.assertTrue(calendar_info(date(2026, 8, 17))["isHoliday"])  # Asunción (Ley Emiliani)
        self.assertFalse(calendar_info(date(2026, 8, 18))["isHoliday"])

    def test_quincena_se_adelanta_al_viernes(self):
        # 15/08/2026 es sábado: el pago se adelanta al viernes 14
        self.assertTrue(calendar_info(date(2026, 8, 14))["isQuincena"])
        self.assertTrue(calendar_info(date(2026, 9, 30))["isQuincena"])

    def test_eventos_comerciales(self):
        self.assertEqual(calendar_info(date(2026, 9, 19))["event"], "Día del Amor y la Amistad")
        self.assertEqual(calendar_info(date(2026, 5, 10))["event"], "Día de la Madre")  # 2.º domingo de mayo
        self.assertEqual(calendar_info(date(2026, 5, 8))["event"], "Previa: Día de la Madre")
        self.assertEqual(calendar_info(date(2026, 6, 21))["event"], "Día del Padre")  # 3.er domingo de junio

    def test_variables_de_temporada_y_categoria(self):
        dic = build_frame([{"date": "2026-12-10", "category": "Papelería", "tmax": 32, "tmin": 24, "precip": 0, "humidity": 75}])
        self.assertEqual(dic.iloc[0]["is_december"], 1.0)
        self.assertEqual(dic.iloc[0]["cat_6"], 1.0)  # Papelería
        self.assertEqual(dic.iloc[0]["cat_0"], 0.0)

    def test_columnas(self):
        df = build_frame([{"date": "2026-10-19", "tmax": 32, "tmin": 24, "precip": 12, "humidity": 80}])
        self.assertEqual(list(df.columns), FEATURE_COLUMNS)
        self.assertEqual(df.iloc[0]["dow_0"], 1.0)  # lunes
        self.assertEqual(df.iloc[0]["rain_heavy"], 1.0)


class TrainPredictTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        start = date(2026, 1, 5)
        self.records = []
        for i in range(70):
            d = start + timedelta(days=i)
            clients = 20 if d.weekday() == 5 else 10 if d.weekday() == 6 else 13
            self.records.append(
                {"storeId": "s1", "date": d.isoformat(), "clients": clients,
                 "tmax": 32, "tmin": 24, "precip": 0, "humidity": 75}
            )

    def test_entrena_valida_y_predice(self):
        r = self.client.post("/train", json={"algorithm": "rf", "version": "test-v1", "records": self.records})
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertGreater(body["metrics"]["n"], 0)
        self.assertIn("baseline", body)
        # Cada día de validación trae también el método empírico, para comparar por comercio
        self.assertEqual(len(body["backtest"]), body["metrics"]["n"])
        self.assertTrue(all("baseline" in b for b in body["backtest"]))
        p =self.client.post("/predict", json={
            "version": "test-v1",
            "rows": [{"storeId": "s1", "date": "2026-03-21", "storeMean": 13.6,
                      "tmax": 32, "tmin": 24, "precip": 0, "humidity": 75}],
        })
        self.assertEqual(p.status_code, 200, p.text)
        pred = p.json()[0]
        self.assertGreater(pred["clients"], 15)  # sábado: patrón aprendido
        self.assertLessEqual(pred["clientsMin"], pred["clients"])
        self.assertGreaterEqual(pred["clientsMax"], pred["clients"])

    def test_datos_insuficientes(self):
        r = self.client.post("/train", json={"algorithm": "rf", "version": "test-v2", "records": self.records[:10]})
        self.assertEqual(r.status_code, 400)

    def test_lstm_rechazado_con_mensaje(self):
        r = self.client.post("/train", json={"algorithm": "lstm", "version": "test-v3", "records": self.records})
        self.assertEqual(r.status_code, 400)
        self.assertIn("LSTM", r.json()["detail"])

    def tearDown(self):
        from pathlib import Path
        for f in Path(__file__).with_name("models").glob("test-*.joblib"):
            f.unlink()


if __name__ == "__main__":
    unittest.main()
