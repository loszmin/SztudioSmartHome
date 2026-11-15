import { useSystemStatus } from './useCoreData';
import { useDataSource } from './useCoreQuery';

export type ConnectionState = 'demo' | 'connecting' | 'online' | 'offline';

export interface ConnectionInfo {
  state: ConnectionState;
  /** Dane mogą być nieaktualne (ostatnie odświeżenie nie powiodło się). */
  stale: boolean;
  error: unknown;
  retry: () => void;
  isRetrying: boolean;
}

/** Stan połączenia z Sztudio Core wyznaczany na podstawie zapytania o status systemu. */
export function useConnection(): ConnectionInfo {
  const { mode } = useDataSource();
  const status = useSystemStatus();

  let state: ConnectionState;
  if (mode === 'demo') state = 'demo';
  else if (status.isError) state = 'offline';
  else if (status.isPending) state = 'connecting';
  else state = 'online';

  return {
    state,
    stale: status.isError && status.data !== undefined,
    error: status.error,
    retry: () => void status.refetch(),
    isRetrying: status.isFetching,
  };
}
