import { useCallback, useEffect, useState } from 'react';
import { api, hostApi } from './api';
import { useLive } from './socket';
import type { ProfilePublic } from '../../shared/views';
import { toast } from '../components/ui';

/** Fetch helper that reloads when `deps` change; exposes reload(). */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    return fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Public profile list, refreshed whenever the server announces profile changes. */
export function useProfiles() {
  const v = useLive((s) => s.profilesVersion);
  return useFetch(() => api<ProfilePublic[]>('GET', '/api/profiles'), [v]);
}

export interface TeamRecord {
  id: string;
  name: string;
  color: string;
  avatar: string;
  buzzerMode: 'individual' | 'shared';
  archived: boolean;
  memberIds: string[];
}

export function useTeams() {
  return useFetch(() => hostApi<TeamRecord[]>('GET', '/api/teams'), []);
}

/** Run an async action and surface errors as toasts. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (success) toast(success, 'success');
    return r;
  } catch (e) {
    toast((e as Error).message, 'error');
    return undefined;
  }
}
