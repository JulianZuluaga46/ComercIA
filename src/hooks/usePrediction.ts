import { useEffect, useState } from 'react';
import { api, formatDateLocal, predictionWithDate, type ApiDayPrediction, type HistoricalRow } from '../lib/api';

export type DayPrediction = ReturnType<typeof predictionWithDate>;

export function useDayPrediction(storeId: string | undefined, date: Date) {
  const [data, setData] = useState<DayPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateKey = formatDateLocal(date);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .predictDay(storeId, dateKey)
      .then(p => {
        if (!cancelled) setData(predictionWithDate(p));
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, dateKey]);

  return { data, loading, error };
}

export function useWeekPrediction(storeId: string | undefined, startDate: Date) {
  const [data, setData] = useState<DayPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startKey = formatDateLocal(startDate);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .predictWeek(storeId, startKey)
      .then(list => {
        if (!cancelled) setData(list.map(predictionWithDate));
      })
      .catch(e => {
        if (!cancelled) {
          setData([]);
          setError(e instanceof Error ? e.message : 'Error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, startKey]);

  return { data, loading, error };
}

export function useHistorical(storeId: string | undefined, days = 90) {
  const [data, setData] = useState<HistoricalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .historical(storeId, days)
      .then(d => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, days]);

  return { data, loading, refresh: () => api.historical(storeId!, days).then(setData) };
}

export type { ApiDayPrediction, HistoricalRow };
