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
  /** Wyłączona kamera nie jest monitorowana ani udostępniana. */
  enabled?: boolean;
  /** Stan strumienia w go2rtc. */
  streamState?: StreamRegistration;
  streamProfile?: string;
  recorderId?: string;
  /** Diagnostyka ostatnich prób połączenia. */
  lastAttemptAt?: IsoDateString;
  lastSuccessAt?: IsoDateString;
  errorCode?: string;
  errorMessage?: string;
  responseTimeMs?: number;
}

export type StreamRegistration = 'not_configured' | 'disabled' | 'registered' | 'error';

/** Pełna konfiguracja kamery – tylko dla administratora. Hasło nigdy nie jest zwracane. */
export interface CameraConfig extends Camera {
  host?: string;
  rtspPort?: number;
  rtspPath?: string;
  onvifPort?: number;
  username?: string;
  hasPassword: boolean;
  vendor: string;
  model: string;
}

/** Dane zapisywane przy tworzeniu / edycji kamery. `null` czyści wartość, pominięcie = bez zmian. */
export interface CameraInput {
  name?: string;
  location?: string;
  source?: CameraSource;
  host?: string | null;
  rtspPort?: number | null;
  rtspPath?: string | null;
  /** Alternatywa dla pól: pełny adres rtsp://… */
  rtspUrl?: string;
  username?: string | null;
  /** Pominięte = bez zmian; pusty tekst = usunięcie hasła. */
  password?: string;
  onvifPort?: number | null;
  streamProfile?: string | null;
  resolution?: string | null;
  fps?: number | null;
  vendor?: string;
  model?: string;
  enabled?: boolean;
}

export interface CameraTestInput extends CameraInput {
  /** Edycja: pozwala użyć zapisanego hasła, gdy pole hasła jest puste. */
  cameraId?: string;
}

export interface ProbeResult {
  ok: boolean;
  code: string;
  message: string;
  responseTimeMs?: number;
  tracks: Array<{ media: string; codec: string }>;
  server?: string;
}

/* ---------- ONVIF ---------- */

export type DiscoveryMode = 'multicast' | 'subnet';

export interface OnvifDiscoveredDevice {
  ip: string;
  onvifPort: number;
  name?: string;
  hardware?: string;
  location?: string;
  likelyBcs: boolean;
  alreadyAdded: boolean;
}

export interface OnvifDiscoverResponse {
  mode: DiscoveryMode;
  scannedHosts: number;
  devices: OnvifDiscoveredDevice[];
}

export interface OnvifProfile {
  token: string;
  name: string;
  videoSource?: string;
  encoding?: string;
  resolution?: string;
  fps?: number;
  rtspPort?: number;
  rtspPath?: string;
  error?: string;
}

export interface OnvifDevice {
  manufacturer?: string;
  model?: string;
  firmware?: string;
  serialNumber?: string;
  profiles: OnvifProfile[];
}

export interface OnvifInspectInput {
  host: string;
  port: number;
  username?: string;
  password?: string;
  cameraId?: string;
  recorderId?: string;
}

/* ---------- Rejestratory ---------- */

export type RecorderSeries = 'bcs_point' | 'bcs_line' | 'other';
export type ProtocolState = 'ok' | 'auth_failed' | 'closed' | 'timeout' | 'error' | 'skipped';

export interface ProtocolCheck {
  protocol: 'http' | 'rtsp' | 'onvif';
  port: number;
  state: ProtocolState;
  detail: string;
  responseTimeMs?: number;
  server?: string;
}

export interface Recorder {
  id: string;
  name: string;
  vendor: string;
  series: RecorderSeries;
  model: string;
  firmware?: string;
  ipAddress?: string;
  port?: number;
  rtspPort?: number;
  onvifPort?: number;
  rtspPathTemplate?: string;
  channels?: number;
  username?: string;
  hasPassword: boolean;
  status: ConnectionStatus;
  lastSeenAt: IsoDateString | null;
  protocols?: ProtocolCheck[];
  lastAttemptAt?: IsoDateString;
  lastSuccessAt?: IsoDateString;
  errorCode?: string;
  errorMessage?: string;
  responseTimeMs?: number;
}

export interface RecorderInput {
  name?: string;
  series?: RecorderSeries;
  model?: string;
  ipAddress?: string | null;
  port?: number | null;
  rtspPort?: number | null;
  onvifPort?: number | null;
  rtspPathTemplate?: string | null;
  channels?: number | null;
  username?: string | null;
  password?: string;
}

export interface RecorderTestInput {
  recorderId?: string;
  series?: RecorderSeries;
  ipAddress: string;
  port?: number | null;
  rtspPort?: number | null;
  onvifPort?: number | null;
  username?: string | null;
  password?: string;
}

export interface RecorderProbe {
  reachable: boolean;
  code: string;
  message: string;
  checks: ProtocolCheck[];
  device?: { manufacturer?: string; model?: string; firmware?: string; serialNumber?: string };
  adapter: RecorderSeries;
  /** Czy adapter tej serii był sprawdzony z rzeczywistym urządzeniem. */
  hardwareVerified: boolean;
}

export interface ChannelProfile {
  name: string;
  token?: string;
  encoding?: string;
  resolution?: string;
  fps?: number;
  rtspPort?: number;
  rtspPath?: string;
  error?: string;
}

export interface RecorderChannel {
  number: number;
  name: string;
  /** `onvif` – odczytane z rejestratora; `template` – wyliczone z szablonu (niezweryfikowane). */
  origin: 'onvif' | 'template';
  profiles: ChannelProfile[];
  cameraId?: string;
}

export interface ChannelImportItem {
  number: number;
  name?: string;
  profile?: string;
}

export interface IntegrationInfo {
  adapters: Array<{ series: RecorderSeries; label: string; hardwareVerified: boolean }>;
  requiredInformation: string[];
  unsupportedFeatures: string[];
}

/* ---------- Diagnostyka ---------- */

export interface Go2rtcStatus {
  state: 'running' | 'error' | 'not_configured';
  version?: string;
  errorCode?: string;
  errorMessage?: string;
  checkedAt?: IsoDateString;
  streams?: number;
}

export interface DeviceDiagnostics {
  id: string;
  kind: 'camera' | 'recorder';
  name: string;
  address?: string;
  status: ConnectionStatus;
  enabled: boolean;
  streamState?: StreamRegistration;
  streamConsumers?: number;
  streamConnected?: boolean;
  lastAttemptAt?: IsoDateString;
  lastSuccessAt?: IsoDateString;
  errorCode?: string;
  errorMessage?: string;
  responseTimeMs?: number;
}

export interface Diagnostics {
  generatedAt: IsoDateString;
  go2rtc: Go2rtcStatus;
  monitor: { enabled: boolean; intervalSeconds: number; lastRunAt?: IsoDateString; lastDurationMs?: number };
  devices: DeviceDiagnostics[];
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
