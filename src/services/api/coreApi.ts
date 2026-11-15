import type {
  Alarm,
  AlarmSystemState,
  ArmingMode,
  Camera,
  CameraConfig,
  CameraInput,
  CameraTestInput,
  ChannelImportItem,
  Device,
  Diagnostics,
  DiscoveryMode,
  EventsQuery,
  IntegrationInfo,
  NetworkDevice,
  OnvifDevice,
  OnvifDiscoverResponse,
  OnvifInspectInput,
  ProbeResult,
  Recorder,
  RecorderChannel,
  RecorderInput,
  RecorderProbe,
  RecorderTestInput,
  Sensor,
  SystemEvent,
  SystemStatus,
} from '@/types/api';
import { API_PATHS } from './endpoints';
import { createHttpClient, type HttpClientConfig } from './httpClient';

/** Operacje na urządzeniach (test połączenia, ONVIF) trwają dłużej niż zwykłe zapytania. */
const DEVICE_TIMEOUT_MS = 60_000;

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

  /* Kamery – konfiguracja i obraz */
  getCameraConfig(id: string): Promise<CameraConfig>;
  createCamera(input: CameraInput): Promise<CameraConfig>;
  updateCamera(id: string, input: CameraInput): Promise<CameraConfig>;
  deleteCamera(id: string): Promise<void>;
  testCamera(input: CameraTestInput): Promise<ProbeResult>;
  checkCamera(id: string): Promise<ProbeResult>;
  /** Sygnalizacja WebRTC: oferta SDP przeglądarki → odpowiedź SDP. */
  webrtcOffer(cameraId: string, offerSdp: string, signal?: AbortSignal): Promise<string>;

  /* ONVIF */
  discoverOnvif(mode: DiscoveryMode, network?: string): Promise<OnvifDiscoverResponse>;
  inspectOnvif(input: OnvifInspectInput): Promise<OnvifDevice>;

  /* Rejestratory */
  getRecorders(signal?: AbortSignal): Promise<Recorder[]>;
  createRecorder(input: RecorderInput): Promise<Recorder>;
  updateRecorder(id: string, input: RecorderInput): Promise<Recorder>;
  deleteRecorder(id: string): Promise<void>;
  testRecorder(input: RecorderTestInput): Promise<RecorderProbe>;
  checkRecorder(id: string): Promise<RecorderProbe>;
  getRecorderChannels(id: string): Promise<RecorderChannel[]>;
  importRecorderChannels(id: string, channels: ChannelImportItem[]): Promise<Camera[]>;
  getIntegrationInfo(signal?: AbortSignal): Promise<IntegrationInfo>;

  /* Diagnostyka */
  getDiagnostics(signal?: AbortSignal): Promise<Diagnostics>;
  runDiagnostics(): Promise<Diagnostics>;
}

export function createHttpCoreApi(config: HttpClientConfig): SztudioCoreApi {
  const request = createHttpClient(config);
  const device = { timeoutMs: DEVICE_TIMEOUT_MS };

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

    getCameraConfig: (id) => request<CameraConfig>(API_PATHS.cameraConfig(id)),
    createCamera: (input) => request<CameraConfig>(API_PATHS.cameras, { method: 'POST', body: input, ...device }),
    updateCamera: (id, input) => request<CameraConfig>(API_PATHS.camera(id), { method: 'PATCH', body: input, ...device }),
    deleteCamera: (id) => request<void>(API_PATHS.camera(id), { method: 'DELETE' }),
    testCamera: (input) => request<ProbeResult>(API_PATHS.cameraTest, { method: 'POST', body: input, ...device }),
    checkCamera: (id) => request<ProbeResult>(API_PATHS.cameraCheck(id), { method: 'POST', ...device }),
    webrtcOffer: (cameraId, offerSdp, signal) =>
      request<string>(API_PATHS.cameraWebrtc(cameraId), {
        method: 'POST',
        rawBody: { content: offerSdp, contentType: 'application/sdp' },
        expect: 'text',
        timeoutMs: 20_000,
        signal,
      }),

    discoverOnvif: (mode, network) =>
      request<OnvifDiscoverResponse>(API_PATHS.onvifDiscover, { method: 'POST', body: { mode, network }, ...device }),
    inspectOnvif: (input) => request<OnvifDevice>(API_PATHS.onvifInspect, { method: 'POST', body: input, ...device }),

    getRecorders: (signal) => request<Recorder[]>(API_PATHS.recorders, { signal }),
    createRecorder: (input) => request<Recorder>(API_PATHS.recorders, { method: 'POST', body: input }),
    updateRecorder: (id, input) => request<Recorder>(API_PATHS.recorder(id), { method: 'PATCH', body: input, ...device }),
    deleteRecorder: (id) => request<void>(API_PATHS.recorder(id), { method: 'DELETE' }),
    testRecorder: (input) => request<RecorderProbe>(API_PATHS.recorderTest, { method: 'POST', body: input, ...device }),
    checkRecorder: (id) => request<RecorderProbe>(API_PATHS.recorderCheck(id), { method: 'POST', ...device }),
    getRecorderChannels: (id) => request<RecorderChannel[]>(API_PATHS.recorderChannels(id), device),
    importRecorderChannels: (id, channels) =>
      request<Camera[]>(API_PATHS.recorderImport(id), { method: 'POST', body: { channels }, ...device }),
    getIntegrationInfo: (signal) => request<IntegrationInfo>(API_PATHS.integrationInfo, { signal }),

    getDiagnostics: (signal) => request<Diagnostics>(API_PATHS.diagnostics, { signal }),
    runDiagnostics: () => request<Diagnostics>(API_PATHS.diagnosticsRun, { method: 'POST', ...device }),
  };
}
