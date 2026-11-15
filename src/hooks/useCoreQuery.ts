import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import type { SztudioCoreApi } from '@/services/api/coreApi';
import { getCoreApi, type DataSource } from '@/services/coreApiProvider';
import { useSettingsStore } from '@/stores/settingsStore';

export function useDataSource(): DataSource {
  return useSettingsStore(
    useShallow((state) => ({ mode: state.mode, serverUrl: state.serverUrl, apiToken: state.apiToken })),
  );
}

/** Klucz zapytań zależny od źródła danych – zmiana serwera unieważnia cache. */
export function coreQueryKey(source: DataSource, resource: string, ...rest: unknown[]) {
  return ['core', source.mode, source.serverUrl, resource, ...rest] as const;
}

/** Wspólna konfiguracja zapytań do Sztudio Core (cykliczne odświeżanie, bez ponowień). */
export function useCoreQuery<T>(
  resource: string,
  fetcher: (api: SztudioCoreApi, signal: AbortSignal) => Promise<T>,
  params: unknown[] = [],
): UseQueryResult<T> {
  const source = useDataSource();
  const refreshIntervalSec = useSettingsStore((state) => state.refreshIntervalSec);

  return useQuery({
    queryKey: coreQueryKey(source, resource, ...params),
    queryFn: ({ signal }) => fetcher(getCoreApi(source), signal),
    refetchInterval: refreshIntervalSec * 1000,
    retry: false,
  });
}
