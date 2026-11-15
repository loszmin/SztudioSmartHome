/**
 * Dane demonstracyjne – używane wyłącznie w trybie „demo”.
 * Nie pochodzą z żadnych rzeczywistych urządzeń.
 */
import type {
  Alarm,
  Camera,
  Device,
  NetworkDevice,
  Sensor,
  SystemEvent,
  SystemStatus,
} from '@/types/api';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface DemoDatabase {
  startedAt: number;
  status: SystemStatus;
  devices: Device[];
  cameras: Camera[];
  alarms: Alarm[];
  sensors: Sensor[];
  events: SystemEvent[];
  network: NetworkDevice[];
}

export function createDemoDatabase(now: number = Date.now()): DemoDatabase {
  const ago = (ms: number) => new Date(now - ms).toISOString();

  const cameras: Camera[] = [
    cam('cam-01', 'Wejście główne', 'Front domu', 1, 96, '2560×1440', true),
    cam('cam-02', 'Podjazd', 'Front domu', 2, 91, '2560×1440', true),
    cam('cam-03', 'Ogród', 'Tył domu', 3, 84, '1920×1080', true),
    cam('cam-04', 'Garaż', 'Garaż', 4, 78, '1920×1080', true),
    cam('cam-05', 'Taras', 'Tył domu', 5, 88, '2560×1440', true),
    cam('cam-06', 'Furtka', 'Ogrodzenie', 6, 47, '1920×1080', false),
    {
      ...cam('cam-07', 'Brama wjazdowa', 'Ogrodzenie', 7, 0, '1920×1080', false),
      status: 'offline',
      signalQuality: null,
      lastSeenAt: ago(47 * MINUTE),
    },
    cam('cam-08', 'Kotłownia', 'Piwnica', 8, 93, '1920×1080', true),
  ];

  function cam(
    id: string,
    name: string,
    location: string,
    channel: number,
    quality: number,
    resolution: string,
    recording: boolean,
  ): Camera {
    return {
      id,
      name,
      location,
      status: 'online',
      signalQuality: quality,
      source: 'bcs',
      channel,
      streamName: `bcs_ch${channel}`,
      resolution,
      fps: 20,
      recording,
      lastSeenAt: ago(5_000),
    };
  }

  const sensors: Sensor[] = [
    sensor('sen-01', 'Ruch – salon', 'Salon', 'motion', 'idle', 4 * MINUTE, 87),
    sensor('sen-02', 'Ruch – korytarz', 'Korytarz', 'motion', 'idle', 22 * MINUTE, 64),
    sensor('sen-03', 'Ruch – garaż', 'Garaż', 'motion', 'triggered', 40_000, 71),
    sensor('sen-04', 'Drzwi wejściowe', 'Wiatrołap', 'contact', 'idle', 38 * MINUTE, 92),
    sensor('sen-05', 'Drzwi tarasowe', 'Salon', 'contact', 'idle', 3 * HOUR, 80),
    sensor('sen-06', 'Okno – kuchnia', 'Kuchnia', 'contact', 'triggered', 12 * MINUTE, 58),
    sensor('sen-07', 'Brama garażowa', 'Garaż', 'contact', 'idle', 9 * HOUR, 76),
    sensor('sen-08', 'Zalanie – łazienka', 'Łazienka', 'flood', 'idle', 2 * MINUTE, 95),
    sensor('sen-09', 'Zalanie – kotłownia', 'Piwnica', 'flood', 'idle', 6 * MINUTE, 18),
    sensor('sen-10', 'Dym – kuchnia', 'Kuchnia', 'smoke', 'idle', MINUTE, 83),
    sensor('sen-11', 'Dym – poddasze', 'Poddasze', 'smoke', 'idle', 3 * MINUTE, 79),
    { ...sensor('sen-12', 'Temperatura – salon', 'Salon', 'temperature', 'idle', MINUTE, 90), value: 21.6, unit: '°C' },
    { ...sensor('sen-13', 'Temperatura – kotłownia', 'Piwnica', 'temperature', 'idle', 2 * MINUTE, 66), value: 17.2, unit: '°C' },
    { ...sensor('sen-14', 'Temperatura – serwerownia', 'Szafa RACK', 'temperature', 'triggered', MINUTE, null), value: 34.8, unit: '°C' },
    sensor('sen-15', 'Wibracje – okno salon', 'Salon', 'vibration', 'idle', 5 * HOUR, 74),
    { ...sensor('sen-16', 'Wibracje – drzwi garaż', 'Garaż', 'vibration', 'idle', 2 * DAY, 0), connection: 'offline', batteryPercent: null },
  ];

  function sensor(
    id: string,
    name: string,
    location: string,
    type: Sensor['type'],
    state: Sensor['state'],
    updatedAgo: number,
    battery: number | null,
  ): Sensor {
    return {
      id,
      name,
      location,
      type,
      state,
      connection: 'online',
      batteryPercent: battery,
      lastUpdatedAt: ago(updatedAgo),
    };
  }

  const alarms: Alarm[] = [
    {
      id: 'alm-1042',
      title: 'Utrata połączenia z kamerą',
      description: 'Kamera „Brama wjazdowa” nie odpowiada od 47 minut.',
      severity: 'critical',
      status: 'active',
      source: { type: 'camera', name: 'Brama wjazdowa', id: 'cam-07' },
      location: 'Ogrodzenie',
      triggeredAt: ago(47 * MINUTE),
    },
    {
      id: 'alm-1041',
      title: 'Wysoka temperatura',
      description: 'Temperatura w szafie RACK przekroczyła próg 32 °C.',
      severity: 'warning',
      status: 'active',
      source: { type: 'sensor', name: 'Temperatura – serwerownia', id: 'sen-14' },
      location: 'Szafa RACK',
      triggeredAt: ago(18 * MINUTE),
    },
    {
      id: 'alm-1040',
      title: 'Niski poziom baterii czujnika',
      description: 'Czujnik „Zalanie – kotłownia” zgłasza 18% baterii.',
      severity: 'info',
      status: 'active',
      source: { type: 'sensor', name: 'Zalanie – kotłownia', id: 'sen-09' },
      location: 'Piwnica',
      triggeredAt: ago(3 * HOUR),
    },
    history('alm-1039', 'Ruch w strefie chronionej', 'critical', 'sensor', 'Ruch – garaż', 'Garaż', 9 * HOUR, 'resolved'),
    history('alm-1038', 'Otwarcie okna przy uzbrojonym systemie', 'warning', 'sensor', 'Okno – kuchnia', 'Kuchnia', DAY + 2 * HOUR, 'resolved'),
    history('alm-1037', 'Utrata połączenia z rejestratorem', 'critical', 'network', 'Rejestrator BCS', 'Szafa RACK', 2 * DAY, 'resolved'),
    history('alm-1036', 'Wibracje – próba sabotażu', 'warning', 'sensor', 'Wibracje – okno salon', 'Salon', 3 * DAY, 'acknowledged'),
    history('alm-1035', 'Restart Sztudio Core', 'info', 'system', 'Sztudio Core', undefined, 4 * DAY, 'resolved'),
    history('alm-1034', 'Wykrycie dymu', 'critical', 'sensor', 'Dym – kuchnia', 'Kuchnia', 6 * DAY, 'resolved'),
  ];

  function history(
    id: string,
    title: string,
    severity: Alarm['severity'],
    type: Alarm['source']['type'],
    sourceName: string,
    location: string | undefined,
    triggeredAgo: number,
    status: Alarm['status'],
  ): Alarm {
    return {
      id,
      title,
      severity,
      status,
      source: { type, name: sourceName },
      location,
      triggeredAt: ago(triggeredAgo),
      acknowledgedAt: ago(triggeredAgo - 4 * MINUTE),
      acknowledgedBy: 'admin',
      resolvedAt: status === 'resolved' ? ago(triggeredAgo - 20 * MINUTE) : undefined,
    };
  }

  let eventSeq = 5000;
  const event = (
    agoMs: number,
    category: SystemEvent['category'],
    severity: SystemEvent['severity'],
    title: string,
    source: string,
    description?: string,
  ): SystemEvent => ({
    id: `evt-${eventSeq--}`,
    category,
    severity,
    title,
    source,
    description,
    occurredAt: ago(agoMs),
  });

  const events: SystemEvent[] = [
    event(40_000, 'motion', 'info', 'Wykryto ruch', 'Ruch – garaż'),
    event(4 * MINUTE, 'motion', 'info', 'Wykryto ruch', 'Kamera Podjazd', 'Detekcja ruchu w strefie 1.'),
    event(12 * MINUTE, 'door', 'warning', 'Otwarto okno', 'Okno – kuchnia'),
    event(18 * MINUTE, 'alarm', 'warning', 'Alarm: wysoka temperatura', 'Temperatura – serwerownia', 'Odczyt 34,8 °C przy progu 32 °C.'),
    event(38 * MINUTE, 'door', 'info', 'Otwarto drzwi', 'Drzwi wejściowe'),
    event(47 * MINUTE, 'camera_offline', 'critical', 'Utrata połączenia z kamerą', 'Brama wjazdowa', 'Brak odpowiedzi na kanale 7 rejestratora.'),
    event(47 * MINUTE + 5_000, 'alarm', 'critical', 'Alarm: kamera offline', 'Brama wjazdowa'),
    event(2 * HOUR, 'motion', 'info', 'Wykryto ruch', 'Kamera Ogród'),
    event(3 * HOUR, 'device_online', 'info', 'Urządzenie ponownie online', 'Switch PoE', 'Czas niedostępności: 2 min.'),
    event(3 * HOUR + 2 * MINUTE, 'restart', 'info', 'Restart urządzenia', 'Switch PoE'),
    event(5 * HOUR, 'motion', 'info', 'Wykryto ruch', 'Kamera Wejście główne'),
    event(9 * HOUR, 'alarm', 'critical', 'Alarm: ruch w strefie chronionej', 'Ruch – garaż'),
    event(9 * HOUR + MINUTE, 'door', 'info', 'Zamknięto bramę garażową', 'Brama garażowa'),
    event(14 * HOUR, 'motion', 'info', 'Wykryto ruch', 'Kamera Taras'),
    event(DAY + HOUR, 'device_online', 'info', 'Kamera ponownie online', 'Furtka'),
    event(DAY + HOUR + 6 * MINUTE, 'camera_offline', 'warning', 'Utrata połączenia z kamerą', 'Furtka'),
    event(DAY + 2 * HOUR, 'alarm', 'warning', 'Alarm: otwarcie okna', 'Okno – kuchnia'),
    event(DAY + 7 * HOUR, 'door', 'info', 'Otwarto drzwi tarasowe', 'Drzwi tarasowe'),
    event(DAY + 11 * HOUR, 'motion', 'info', 'Wykryto ruch', 'Ruch – korytarz'),
    event(2 * DAY, 'alarm', 'critical', 'Alarm: rejestrator niedostępny', 'Rejestrator BCS'),
    event(2 * DAY - 9 * MINUTE, 'device_online', 'info', 'Rejestrator ponownie online', 'Rejestrator BCS'),
    event(2 * DAY + 5 * HOUR, 'restart', 'info', 'Restart urządzenia', 'Router', 'Zaplanowana aktualizacja oprogramowania.'),
    event(3 * DAY, 'alarm', 'warning', 'Alarm: wibracje', 'Wibracje – okno salon'),
    event(3 * DAY + 8 * HOUR, 'motion', 'info', 'Wykryto ruch', 'Kamera Podjazd'),
    event(4 * DAY, 'restart', 'info', 'Restart Sztudio Core', 'Sztudio Core', 'Aktualizacja do wersji 1.0.0.'),
    event(4 * DAY - 2 * MINUTE, 'device_online', 'info', 'Sztudio Core ponownie online', 'Sztudio Core'),
    event(5 * DAY + 3 * HOUR, 'door', 'info', 'Otwarto drzwi', 'Drzwi wejściowe'),
    event(6 * DAY, 'alarm', 'critical', 'Alarm: wykrycie dymu', 'Dym – kuchnia'),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const net = (
    id: string,
    name: string,
    type: NetworkDevice['type'],
    host: number,
    vendor: string,
    latency: number | null,
    seenAgo = 8_000,
  ): NetworkDevice => ({
    id,
    name,
    type,
    ipAddress: `192.168.1.${host}`,
    macAddress: `3C:EF:8C:${(host * 7 % 256).toString(16).padStart(2, '0').toUpperCase()}:A0:${host.toString(16).padStart(2, '0').toUpperCase()}`,
    vendor,
    status: latency === null ? 'offline' : 'online',
    latencyMs: latency,
    lastSeenAt: ago(seenAgo),
  });

  const network: NetworkDevice[] = [
    net('net-core', 'Sztudio Core', 'core', 10, 'Sztudio', 1),
    net('net-nvr', 'Rejestrator BCS', 'recorder', 20, 'BCS', 2),
    net('net-router', 'Router główny', 'router', 1, 'MikroTik', 1),
    net('net-sw1', 'Switch PoE', 'switch', 2, 'TP-Link', 1),
    net('net-sw2', 'Switch – poddasze', 'switch', 3, 'TP-Link', 2),
    ...cameras.map((camera, index) =>
      net(
        `net-${camera.id}`,
        `Kamera – ${camera.name}`,
        'camera',
        101 + index,
        'BCS',
        camera.status === 'online' ? 2 + (index % 4) : null,
        camera.status === 'online' ? 8_000 : 47 * MINUTE,
      ),
    ),
    net('net-ap', 'Punkt dostępowy Wi-Fi', 'other', 5, 'Ubiquiti', 3),
    net('net-nas', 'Dysk sieciowy NAS', 'other', 30, 'Synology', 2),
    net('net-ups', 'Zasilacz UPS', 'other', 40, 'APC', null, 6 * HOUR),
  ];

  const devices: Device[] = [
    {
      id: 'dev-core',
      name: 'Sztudio Core',
      kind: 'core',
      vendor: 'Sztudio',
      model: 'Core (demo)',
      firmware: '1.0.0',
      ipAddress: '192.168.1.10',
      status: 'online',
      lastSeenAt: ago(2_000),
    },
    {
      id: 'dev-nvr',
      name: 'Rejestrator BCS',
      kind: 'recorder',
      vendor: 'BCS',
      model: 'Rejestrator NVR 8-kanałowy (demo)',
      firmware: 'demo',
      ipAddress: '192.168.1.20',
      channels: 8,
      status: 'online',
      lastSeenAt: ago(4_000),
    },
  ];

  const status: SystemStatus = {
    core: { state: 'online', version: '1.0.0-demo', hostname: 'sztudio-core', uptimeSeconds: 4 * 24 * 3600 },
    resources: { cpuPercent: 14, memoryPercent: 41, diskPercent: 63 },
    services: [
      { key: 'go2rtc', name: 'go2rtc (strumienie wideo)', state: 'running' },
      { key: 'mqtt', name: 'Broker MQTT', state: 'running' },
      { key: 'postgres', name: 'PostgreSQL', state: 'running' },
      { key: 'onvif', name: 'ONVIF', state: 'running' },
    ],
    alarmSystem: { mode: 'armed_home', changedAt: ago(9 * HOUR), changedBy: 'admin' },
    serverTime: new Date(now).toISOString(),
  };

  return { startedAt: now, status, devices, cameras, alarms, sensors, events, network };
}
