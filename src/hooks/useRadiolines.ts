import { useEffect, useState } from 'react';
import type { Bounds, Radioline } from '../types';
import { api } from '../lib/api';

export function useRadiolines(
  enabled: boolean,
  bounds: Bounds | null,
  operators: string[],
  refresh: number,
  onlyNew = false
) {
  const [data, setData] = useState<Radioline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const operatorKey = operators.join(',');

  useEffect(() => {
    if (!enabled || !bounds) {
      setData([]);
      setLoading(false);
      setError('');
      return;
    }

    // Only load radiolines when user is zoomed in enough (zoom >= 10)
    if (!onlyNew && bounds.zoom < 8) {
      setData([]);
      setLoading(false);
      setError('');
      return;
    }

    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setError('');

    const load = async () => {
      try {
        const params = new URLSearchParams({
          minLat: String(bounds.minLat),
          maxLat: String(bounds.maxLat),
          minLng: String(bounds.minLng),
          maxLng: String(bounds.maxLng),
          ...(operatorKey ? { operators: operatorKey } : {}),
          ...(onlyNew ? { onlyNew: '1' } : {})
        });

        const result = await api<Radioline[]>(`/radiolines?${params}`, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setData(Array.isArray(result) ? result.slice(0, 1000) : []);
        setLoading(false);
        setError('');
      } catch (e) {
        if (!abort.signal.aborted) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    };

    timer = setTimeout(load, 180);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [enabled, bounds, operatorKey, refresh, onlyNew]);

  return { data, loading, error };
}
