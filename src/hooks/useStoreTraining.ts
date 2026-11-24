import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type StoreTraining } from '../lib/api';

/** Consulta el entrenamiento de un comercio: cada 4 s mientras entrena y cada 30 s cuando no. */
export function useStoreTraining(storeId: string) {
  const [data, setData] = useState<StoreTraining | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const running = data?.live.running ?? false;
  const current = useRef(storeId);

  const load = useCallback(async () => {
    if (!storeId) return;
    try {
      const d = await api.storeTraining(storeId);
      if (current.current !== storeId) return;
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el entrenamiento.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    current.current = storeId;
    setData(null);
    setLoading(true);
    void load();
  }, [storeId, load]);

  useEffect(() => {
    const id = setInterval(() => void load(), running ? 4000 : 30000);
    return () => clearInterval(id);
  }, [running, load]);

  return { data, error, loading, reload: load };
}

/** Segundos transcurridos desde un instante, actualizados cada segundo mientras `active`. */
export function useElapsed(since: string | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return since ? Math.max(0, Math.round((now - new Date(since).getTime()) / 1000)) : 0;
}
