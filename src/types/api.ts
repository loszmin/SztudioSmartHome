/**
 * Typy danych Sztudio Core API (v1).
 *
 * Kontrakt przyjęty przez frontend – backend (FastAPI) powinien zwracać JSON
 * w camelCase, a daty jako ISO 8601 (UTC).
 */

export type IsoDateString = string;

export type ConnectionStatus = 'online' | 'offline';
export type Severity = 'info' | 'warning' | 'critical';

/* ---------- System ---------- */

export type CoreState = 'online' | 'degraded' | 'offline';
export type ArmingMode = 'disarmed' | 'armed_home' | 'armed_away';
export type ServiceState = 'running' | 'stopped' | 'error';

export interface CoreService {
  key: string;
  name: string;
  state: ServiceState;
}

export interface AlarmSystemState {
  mode: ArmingMode;
  changedAt: IsoDateString;
  changedBy?: string;
}

export interface SystemStatus {
  core: {
    state: CoreState;
    version: string;
    hostname: string;
    uptimeSeconds: number;
  };
  resources: {
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
  };
  services: CoreService[];
  alarmSystem: AlarmSystemState;
  serverTime: IsoDateString;
}

/* ---------- Urządzenia ---------- */

export type DeviceKind = 'core' | 'recorder' | 'camera' | 'hub' | 'other';

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  vendor: string;
  model: string;
  firmware?: string;
  ipAddress?: string;
  /** Liczba kanałów wideo (rejestrator). */
  channels?: number;
  status: ConnectionStatus;
  /** null = urządzenie nie było jeszcze widziane. */
  lastSeenAt: IsoDateString | null;
}

/* ---------- Kamery ---------- */

export type CameraSource = 'bcs' | 'onvif' | 'rtsp';

export interface Camera {
  id: string;
  name: string;
  location: string;
  status: ConnectionStatus;
  /** Jakość połączenia 0–100; null gdy kamera jest offline. */
  signalQuality: number | null;
  source: CameraSource;
  /** Numer kanału na rejestratorze BCS (jeśli dotyczy). */
  channel?: number;
  /** Nazwa strumienia w go2rtc (parametr `src`). */
  streamName: string;
  resolution?: string;
  fps?: number;
  recording: boolean;
  /** null = urządzenie nie było jeszcze widziane. */
  lastSeenAt: IsoDateString | null;
}

/* ---------- Alarmy ---------- */

export type AlarmStatus = 'active' | 'acknowledged' | 'resolved';
export type AlarmSourceType = 'sensor' | 'camera' | 'network' | 'system';

export interface Alarm {
  id: string;
  title: string;
  description?: string;
  severity: Severity;
  status: AlarmStatus;
  source: {
    type: AlarmSourceType;
    name: string;
    id?: string;
  };
  location?: string;
  triggeredAt: IsoDateString;
  acknowledgedAt?: IsoDateString;
  acknowledgedBy?: string;
  resolvedAt?: IsoDateString;
}

/* ---------- Czujniki ---------- */

export type SensorType = 'motion' | 'contact' | 'flood' | 'smoke' | 'temperature' | 'vibration';
export type SensorState = 'idle' | 'triggered';

export interface Sensor {
  id: string;
  name: string;
  location: string;
  type: SensorType;
  /** `triggered` = ruch / otwarte / zalanie / dym / wibracje / temperatura poza zakresem. */
  state: SensorState;
  /** Wartość pomiaru (np. temperatura). */
  value?: number;
  unit?: string;
  connection: ConnectionStatus;
  batteryPercent?: number | null;
  /** null = czujnik nie przesłał jeszcze odczytu. */
  lastUpdatedAt: IsoDateString | null;
}

/* ---------- Sieć ---------- */

export type NetworkDeviceType = 'core' | 'recorder' | 'camera' | 'router' | 'switch' | 'other';

export interface NetworkDevice {
  id: string;
  name: string;
  type: NetworkDeviceType;
  ipAddress: string;
  macAddress?: string;
  vendor: string;
  status: ConnectionStatus;
  latencyMs?: number | null;
  /** null = urządzenie nie było jeszcze widziane. */
  lastSeenAt: IsoDateString | null;
}

/* ---------- Zdarzenia ---------- */

export type EventCategory =
  | 'motion'
  | 'camera_offline'
  | 'device_online'
  | 'door'
  | 'alarm'
  | 'restart';

export interface SystemEvent {
  id: string;
  category: EventCategory;
  severity: Severity;
  title: string;
  description?: string;
  source: string;
  occurredAt: IsoDateString;
}

export interface EventsQuery {
  category?: EventCategory;
  /** Początek zakresu (ISO 8601). */
  from?: IsoDateString;
  /** Koniec zakresu (ISO 8601). */
  to?: IsoDateString;
  limit?: number;
}

/* ---------- WebSocket ---------- */

export type RealtimeChannelName = 'events' | 'system' | 'cameras' | 'alarms';

/** Koperta komunikatu WebSocket; `data` zależy od kanału i typu. */
export interface RealtimeMessage<T = unknown> {
  type: string;
  data?: T;
  timestamp?: IsoDateString;
}

/* ---------- Uwierzytelnianie ---------- */

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'bearer';
  expiresAt: IsoDateString;
  user: AuthUser;
}
