import { Activity, Cctv, Network, Server, ShieldCheck } from 'lucide-react';
import { useAlarms, useCameras, useNetworkDevices, useSensors, useSystemStatus } from '@/hooks/useCoreData';
import { useConnection } from '@/hooks/useConnection';
import { summarizeCoreStatus } from '@/layouts/CoreStatus';
import { ARMING_MODES } from '@/modules/alarms/arming';
import { StatTile } from './StatTile';

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Wiersz najważniejszych statusów systemu. */
export function StatusTiles() {
  const connection = useConnection();
  const system = useSystemStatus();
  const cameras = useCameras();
  const alarms = useAlarms();
  const sensors = useSensors();
  const network = useNetworkDevices();

  const core = summarizeCoreStatus(connection.state, system.data);
  const camerasOnline = cameras.data?.filter((camera) => camera.status === 'online').length;
  const camerasOffline = cameras.data ? cameras.data.length - (camerasOnline ?? 0) : 0;
  const activeAlarms = alarms.data?.filter((alarm) => alarm.status === 'active') ?? [];
  const hasCritical = activeAlarms.some((alarm) => alarm.severity === 'critical');
  const sensorsOffline = sensors.data?.filter((sensor) => sensor.connection === 'offline').length ?? 0;
  const sensorsTriggered = sensors.data?.filter((sensor) => sensor.state === 'triggered' && sensor.connection === 'online').length ?? 0;
  const networkOnline = network.data?.filter((device) => device.status === 'online').length;
  const networkOffline = network.data ? network.data.length - (networkOnline ?? 0) : 0;
  const arming = system.data ? ARMING_MODES[system.data.alarmSystem.mode] : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <StatTile
        to="/ustawienia"
        icon={Server}
        label="Sztudio Core"
        value={connection.state === 'connecting' ? undefined : core.label}
        detail={core.detail}
        tone={core.tone}
        className="col-span-2 xl:col-span-1"
      />
      <StatTile
        to="/kamery"
        icon={Cctv}
        label="Kamery online"
        value={cameras.data ? `${camerasOnline} / ${cameras.data.length}` : undefined}
        detail={camerasOffline > 0 ? `${camerasOffline} offline` : 'Wszystkie kamery działają'}
        tone={camerasOffline > 0 ? 'danger' : 'success'}
        unavailable={cameras.isError && !cameras.data}
      />
      <StatTile
        to="/alarmy"
        icon={ShieldCheck}
        label="Alarm"
        value={arming && alarms.data ? arming.short : undefined}
        detail={
          activeAlarms.length > 0
            ? `${activeAlarms.length} ${plural(activeAlarms.length, 'aktywny alarm', 'aktywne alarmy', 'aktywnych alarmów')}`
            : 'Brak aktywnych alarmów'
        }
        tone={activeAlarms.length === 0 ? (arming?.tone ?? 'neutral') : hasCritical ? 'danger' : 'warning'}
        unavailable={(system.isError && !system.data) || (alarms.isError && !alarms.data)}
      />
      <StatTile
        to="/czujniki"
        icon={Activity}
        label="Czujniki"
        value={sensors.data ? String(sensors.data.length) : undefined}
        detail={
          sensorsOffline > 0
            ? `${sensorsOffline} offline · ${sensorsTriggered} aktywne`
            : sensorsTriggered > 0
              ? `${sensorsTriggered} w stanie aktywnym`
              : 'Wszystkie w normie'
        }
        tone={sensorsOffline > 0 ? 'warning' : 'success'}
        unavailable={sensors.isError && !sensors.data}
      />
      <StatTile
        to="/siec"
        icon={Network}
        label="Sieć"
        value={network.data ? `${networkOnline} / ${network.data.length}` : undefined}
        detail={networkOffline > 0 ? `${networkOffline} ${plural(networkOffline, 'urządzenie', 'urządzenia', 'urządzeń')} offline` : 'Wszystkie urządzenia online'}
        tone={networkOffline > 0 ? 'warning' : 'success'}
        unavailable={network.isError && !network.data}
      />
    </div>
  );
}
