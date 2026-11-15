import type {
  Alarm,
  AlarmSystemState,
  ArmingMode,
  Camera,
  Device,
  EventsQuery,
  NetworkDevice,
  Sensor,
  SystemEvent,
  SystemStatus,
} from '@/types/api';
import { API_PATHS } from './endpoints';
import { createHttpClient, type HttpClientConfig } from './httpClient';

/**
 * Interfejs dostępu do danych Sztudio Core. Implementowany przez klienta HTTP
 * (tryb „live”) oraz przez źródło danych demonstracyjnych (tryb „demo”).
 */
export interface SztudioCoreApi {
  getSystemStatus(signal?: AbortSignal): Promise<SystemStatus>;
  getDevices(signal?: AbortSignal): Promise<Device[]>;
  getCameras(signal?: AbortSignal): Promise<Camera[]>;
  getAlarms(signal?: AbortSignal): Promise<Alarm[]>;
  acknowledgeAlarm(id: string): Promise<Alarm>;
  setArmingMode(mode: ArmingMode): Promise<AlarmSystemState>;
  getSensors(signal?: AbortSignal): Promise<Sensor[]>;
  getEvents(query?: EventsQuery, signal?: AbortSignal): Promise<SystemEvent[]>;
  getNetworkDevices(signal?: AbortSignal): Promise<NetworkDevice[]>;
}

export function createHttpCoreApi(config: HttpClientConfig): SztudioCoreApi {
  const request = createHttpClient(config);

  return {
    getSystemStatus: (signal) => request<SystemStatus>(API_PATHS.systemStatus, { signal }),
    getDevices: (signal) => request<Device[]>(API_PATHS.devices, { signal }),
    getCameras: (signal) => request<Camera[]>(API_PATHS.cameras, { signal }),
    getAlarms: (signal) => request<Alarm[]>(API_PATHS.alarms, { signal }),
    acknowledgeAlarm: (id) => request<Alarm>(API_PATHS.alarmAcknowledge(id), { method: 'POST' }),
    setArmingMode: (mode) =>
      request<AlarmSystemState>(API_PATHS.alarmArming, { method: 'PUT', body: { mode } }),
    getSensors: (signal) => request<Sensor[]>(API_PATHS.sensors, { signal }),
    getEvents: (query, signal) =>
      request<SystemEvent[]>(API_PATHS.events, {
        signal,
        query: { category: query?.category, from: query?.from, to: query?.to, limit: query?.limit },
      }),
    getNetworkDevices: (signal) => request<NetworkDevice[]>(API_PATHS.networkDevices, { signal }),
  };
}
