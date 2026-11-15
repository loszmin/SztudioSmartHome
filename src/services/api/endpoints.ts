import type { RealtimeChannelName } from '@/types/api';

/** Ścieżki REST Sztudio Core API v1. */
export const API_PATHS = {
  authLogin: '/api/v1/auth/login',
  systemStatus: '/api/v1/system/status',
  devices: '/api/v1/devices',
  cameras: '/api/v1/cameras',
  camera: (id: string) => `/api/v1/cameras/${encodeURIComponent(id)}`,
  cameraConfig: (id: string) => `/api/v1/cameras/${encodeURIComponent(id)}/config`,
  cameraCheck: (id: string) => `/api/v1/cameras/${encodeURIComponent(id)}/check`,
  cameraWebrtc: (id: string) => `/api/v1/cameras/${encodeURIComponent(id)}/webrtc`,
  cameraTest: '/api/v1/cameras/test',
  onvifDiscover: '/api/v1/onvif/discover',
  onvifInspect: '/api/v1/onvif/inspect',
  recorders: '/api/v1/recorders',
  recorder: (id: string) => `/api/v1/recorders/${encodeURIComponent(id)}`,
  recorderCheck: (id: string) => `/api/v1/recorders/${encodeURIComponent(id)}/check`,
  recorderChannels: (id: string) => `/api/v1/recorders/${encodeURIComponent(id)}/channels`,
  recorderImport: (id: string) => `/api/v1/recorders/${encodeURIComponent(id)}/channels/import`,
  recorderTest: '/api/v1/recorders/test',
  integrationInfo: '/api/v1/recorders/integration-info',
  diagnostics: '/api/v1/diagnostics',
  diagnosticsRun: '/api/v1/diagnostics/run',
  alarms: '/api/v1/alarms',
  alarmAcknowledge: (id: string) => `/api/v1/alarms/${encodeURIComponent(id)}/acknowledge`,
  alarmArming: '/api/v1/alarms/arming',
  sensors: '/api/v1/sensors',
  events: '/api/v1/events',
  networkDevices: '/api/v1/network/devices',
} as const;

/** Ścieżki kanałów WebSocket. */
export const WS_PATHS: Record<RealtimeChannelName, string> = {
  events: '/ws/v1/events',
  system: '/ws/v1/system',
  cameras: '/ws/v1/cameras',
  alarms: '/ws/v1/alarms',
};
