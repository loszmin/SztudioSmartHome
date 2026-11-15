import type { SztudioCoreApi } from '@/services/api/coreApi';
import { ApiError } from '@/services/api/httpClient';
import type { SystemEvent } from '@/types/api';
import { createDemoDatabase, type DemoDatabase } from './demoData';

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Źródło danych demonstracyjnych. Implementuje ten sam interfejs co klient HTTP,
 * a stan trzyma w pamięci (potwierdzenia alarmów działają do odświeżenia strony).
 */
export function createDemoApi(options: { delayMs?: number; db?: DemoDatabase } = {}): SztudioCoreApi {
  const db = options.db ?? createDemoDatabase();
  const delayMs = options.delayMs ?? 150;
  let eventSeq = 9000;

  const respond = <T>(value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(clone(value)), delayMs));

  const unavailable = (): Promise<never> =>
    Promise.reject(new ApiError('http', 'Funkcja wymaga połączenia z Sztudio Core – niedostępna w trybie demonstracyjnym.', 501, 'demo_mode'));

  const addEvent = (event: Omit<SystemEvent, 'id' | 'occurredAt'>) => {
    db.events.unshift({ ...event, id: `evt-${eventSeq++}`, occurredAt: new Date().toISOString() });
  };

  return {
    getSystemStatus: () => {
      const elapsed = Math.floor((Date.now() - db.startedAt) / 1000);
      return respond({
        ...db.status,
        core: { ...db.status.core, uptimeSeconds: db.status.core.uptimeSeconds + elapsed },
        serverTime: new Date().toISOString(),
      });
    },
    getDevices: () => respond(db.devices),
    getCameras: () => respond(db.cameras),
    getAlarms: () => respond(db.alarms),
    acknowledgeAlarm: (id) => {
      const alarm = db.alarms.find((item) => item.id === id);
      if (!alarm) return Promise.reject(new ApiError('http', 'Nie znaleziono alarmu.', 404));
      if (alarm.status === 'active') {
        alarm.status = 'acknowledged';
        alarm.acknowledgedAt = new Date().toISOString();
        alarm.acknowledgedBy = 'demo';
      }
      return respond(alarm);
    },
    setArmingMode: (mode) => {
      db.status.alarmSystem = { mode, changedAt: new Date().toISOString(), changedBy: 'demo' };
      addEvent({
        category: 'alarm',
        severity: 'info',
        title: mode === 'disarmed' ? 'System rozbrojony' : 'System uzbrojony',
        source: 'Sztudio Core',
      });
      return respond(db.status.alarmSystem);
    },
    getSensors: () => respond(db.sensors),
    getEvents: (query) => {
      let items = db.events;
      if (query?.category) items = items.filter((item) => item.category === query.category);
      if (query?.from) items = items.filter((item) => item.occurredAt >= query.from!);
      if (query?.to) items = items.filter((item) => item.occurredAt <= query.to!);
      if (query?.limit) items = items.slice(0, query.limit);
      return respond(items);
    },
    getNetworkDevices: () => respond(db.network),

    // Konfiguracja urządzeń i obraz wymagają prawdziwego Sztudio Core – tryb demo niczego nie udaje.
    getCameraConfig: unavailable,
    createCamera: unavailable,
    updateCamera: unavailable,
    deleteCamera: unavailable,
    testCamera: unavailable,
    checkCamera: unavailable,
    webrtcOffer: unavailable,
    discoverOnvif: unavailable,
    inspectOnvif: unavailable,
    getRecorders: () =>
      respond(
        db.devices
          .filter((device) => device.kind === 'recorder')
          .map((device) => ({
            id: device.id,
            name: device.name,
            vendor: device.vendor,
            series: 'other' as const,
            model: device.model,
            ipAddress: device.ipAddress,
            channels: device.channels,
            hasPassword: false,
            status: device.status,
            lastSeenAt: device.lastSeenAt,
          })),
      ),
    createRecorder: unavailable,
    updateRecorder: unavailable,
    deleteRecorder: unavailable,
    testRecorder: unavailable,
    checkRecorder: unavailable,
    getRecorderChannels: unavailable,
    importRecorderChannels: unavailable,
    getIntegrationInfo: unavailable,
    getDiagnostics: unavailable,
    runDiagnostics: unavailable,
  };
}
