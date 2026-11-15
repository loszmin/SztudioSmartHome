import { ConnectionBadge } from '@/components/Status';
import { useSettingsStore } from '@/stores/settingsStore';
import type { NetworkDevice } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatDateTime, formatRelative } from '@/utils/format';
import { NETWORK_TYPES } from './networkMeta';

function latencyText(device: NetworkDevice): string {
  return typeof device.latencyMs === 'number' ? `${device.latencyMs} ms` : '—';
}

function DeviceName({ device }: { device: NetworkDevice }) {
  const info = NETWORK_TYPES[device.type];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
          device.status === 'online' ? 'border-line-strong bg-deep text-primary-soft' : 'border-danger/30 bg-danger/10 text-danger',
        )}
      >
        <info.icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">{device.name}</div>
        <div className="truncate text-xs text-muted">{info.label}</div>
      </div>
    </div>
  );
}

/** Lista urządzeń sieciowych: tabela na desktopie, karty na telefonie. */
export function NetworkDeviceList({ devices }: { devices: NetworkDevice[] }) {
  const hour12 = useSettingsStore((state) => state.hour12);

  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {['Nazwa', 'Adres IP', 'Producent', 'Status', 'Opóźnienie', 'Ostatnia aktywność'].map((heading) => (
                <th key={heading} scope="col" className="label-caps px-4 py-2.5 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {devices.map((device) => (
              <tr key={device.id} className="hover:bg-raised/40">
                <td className="max-w-0 px-4 py-2.5 lg:w-[30%]"><DeviceName device={device} /></td>
                <td className="px-4 py-2.5">
                  <div className="font-mono text-[13px] text-ink">{device.ipAddress}</div>
                  {device.macAddress && <div className="font-mono text-[11px] text-muted">{device.macAddress}</div>}
                </td>
                <td className="px-4 py-2.5 text-silver">{device.vendor}</td>
                <td className="px-4 py-2.5"><ConnectionBadge status={device.status} /></td>
                <td className="tabular px-4 py-2.5 text-silver">{latencyText(device)}</td>
                <td className="px-4 py-2.5 text-silver" title={device.lastSeenAt ? formatDateTime(device.lastSeenAt, hour12) : undefined}>
                  <time dateTime={device.lastSeenAt ?? undefined}>{formatRelative(device.lastSeenAt)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {devices.map((device) => (
          <li key={device.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <DeviceName device={device} />
              <ConnectionBadge status={device.status} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 pl-12 text-xs">
              <div>
                <dt className="text-muted">Adres IP</dt>
                <dd className="font-mono text-ink">{device.ipAddress}</dd>
              </div>
              <div>
                <dt className="text-muted">Producent</dt>
                <dd className="text-silver">{device.vendor}</dd>
              </div>
              <div className="col-span-2">
                <dt className="sr-only">Ostatnia aktywność</dt>
                <dd className="text-muted">Aktywność: {formatRelative(device.lastSeenAt)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
