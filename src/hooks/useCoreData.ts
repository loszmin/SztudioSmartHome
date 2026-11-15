import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SztudioCoreApi } from '@/services/api/coreApi';
import { describeError } from '@/services/api/httpClient';
import { getCoreApi } from '@/services/coreApiProvider';
import { toast } from '@/stores/toastStore';
import type { ArmingMode, EventsQuery } from '@/types/api';
import { coreQueryKey, useCoreQuery, useDataSource } from './useCoreQuery';

export const useSystemStatus = () => useCoreQuery('system', (api, signal) => api.getSystemStatus(signal));
export const useDevices = () => useCoreQuery('devices', (api, signal) => api.getDevices(signal));
export const useCameras = () => useCoreQuery('cameras', (api, signal) => api.getCameras(signal));
export const useAlarms = () => useCoreQuery('alarms', (api, signal) => api.getAlarms(signal));
export const useSensors = () => useCoreQuery('sensors', (api, signal) => api.getSensors(signal));
export const useNetworkDevices = () =>
  useCoreQuery('network', (api, signal) => api.getNetworkDevices(signal));

export const useRecorders = () => useCoreQuery('recorders', (api, signal) => api.getRecorders(signal));
export const useDiagnostics = () => useCoreQuery('diagnostics', (api, signal) => api.getDiagnostics(signal));
export const useIntegrationInfo = () =>
  useCoreQuery('integration-info', (api, signal) => api.getIntegrationInfo(signal));

interface CoreActionOptions<TResult> {
  /** Zasoby do odświeżenia po powodzeniu (np. 'cameras'). */
  invalidate?: string[];
  /** Komunikat po powodzeniu; null = bez komunikatu. */
  success?: string | ((result: TResult) => string | null);
  /** Początek komunikatu błędu; pominięty = błąd obsługuje wywołujący (np. formularz). */
  failure?: string;
}

/** Operacja zmieniająca stan w Sztudio Core: odświeża powiązane dane i pokazuje wynik. */
export function useCoreAction<TArgs, TResult>(
  action: (api: SztudioCoreApi, args: TArgs) => Promise<TResult>,
  options: CoreActionOptions<TResult> = {},
) {
  const source = useDataSource();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: TArgs) => action(getCoreApi(source), args),
    onSuccess: (result) => {
      const message = typeof options.success === 'function' ? options.success(result) : options.success;
      if (message) toast.success(message);
      return Promise.all(
        (options.invalidate ?? []).map((resource) =>
          queryClient.invalidateQueries({ queryKey: coreQueryKey(source, resource) }),
        ),
      );
    },
    onError: (error) => {
      if (options.failure) toast.error(`${options.failure} ${describeError(error)}`);
    },
  });
}

export function useEvents(query: EventsQuery = {}) {
  return useCoreQuery('events', (api, signal) => api.getEvents(query, signal), [
    query.category ?? null,
    query.from ?? null,
    query.to ?? null,
    query.limit ?? null,
  ]);
}

export function useAcknowledgeAlarm() {
  const source = useDataSource();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => getCoreApi(source).acknowledgeAlarm(id),
    onSuccess: () => {
      toast.success('Alarm został potwierdzony.');
      return queryClient.invalidateQueries({ queryKey: coreQueryKey(source, 'alarms') });
    },
    onError: (error) => toast.error(`Nie udało się potwierdzić alarmu. ${describeError(error)}`),
  });
}

export function useSetArmingMode() {
  const source = useDataSource();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mode: ArmingMode) => getCoreApi(source).setArmingMode(mode),
    onSuccess: (state) => {
      toast.success(state.mode === 'disarmed' ? 'System został rozbrojony.' : 'System został uzbrojony.');
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: coreQueryKey(source, 'system') }),
        queryClient.invalidateQueries({ queryKey: coreQueryKey(source, 'events') }),
      ]);
    },
    onError: (error) => toast.error(`Nie udało się zmienić trybu systemu. ${describeError(error)}`),
  });
}
