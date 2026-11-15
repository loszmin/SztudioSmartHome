import type { RealtimeChannelName } from '@/types/api';

/** Ścieżki REST Sztudio Core API v1. */
export const API_PATHS = {
  systemStatus: '/api/v1/system/status',
  devices: '/api/v1/devices',
  cameras: '/api/v1/cameras',
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
