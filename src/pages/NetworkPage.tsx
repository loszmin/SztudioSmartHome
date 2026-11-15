import { useState } from 'react';
import { Network, Search } from 'lucide-react';
import { Card, CardHeader } from '@/components/Card';
import { TextInput } from '@/components/FormControls';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, QueryState } from '@/components/StateViews';
import { StatusDot } from '@/components/Status';
import { useNetworkDevices } from '@/hooks/useCoreData';
import { NetworkDeviceList } from '@/modules/network/NetworkDeviceList';
import { NETWORK_TYPE_ORDER, NETWORK_TYPES } from '@/modules/network/networkMeta';
import type { NetworkDevice, NetworkDeviceType } from '@/types/api';

type TypeFilter = NetworkDeviceType | 'all';

function Summary({ devices }: { devices: NetworkDevice[] }) {
  const onlineTotal = devices.filter((device) => device.status === 'online').length;
  return (
    <>
    {/* Telefon: jedno zwięzłe podsumowanie zamiast sześciu kafli. */}
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-navy px-4 py-3 text-sm sm:hidden">
      <StatusDot tone={onlineTotal === devices.length ? 'success' : 'warning'} />
      <span className="tabular font-semibold text-ink">{onlineTotal} z {devices.length}</span>
      <span className="text-muted">urządzeń online</span>
    </div>
    <div className="hidden gap-3 sm:grid sm:grid-cols-3 xl:grid-cols-6">
      {NETWORK_TYPE_ORDER.map((type) => {
        const info = NETWORK_TYPES[type];
        const items = devices.filter((device) => device.type === type);
        const online = items.filter((device) => device.status === 'online').length;
        const tone = items.length === 0 ? 'neutral' : online === items.length ? 'success' : online === 0 ? 'danger' : 'warning';
        return (
          <div key={type} className="rounded-xl border border-line bg-navy p-3.5">
            <div className="flex items-center gap-2">
              <info.icon className="h-4 w-4 shrink-0 text-primary-soft" />
              <span className="label-caps truncate">{info.plural}</span>
              <StatusDot tone={tone} className="ml-auto" />
            </div>
            <div className="tabular mt-2 text-xl font-semibold text-ink">
              {items.length === 0 ? '—' : `${online} / ${items.length}`}
            </div>
            <div className="text-xs text-muted">{items.length === 0 ? 'nie wykryto' : 'online'}</div>
          </div>
        );
      })}
    </div>
    </>
  );
}

export function NetworkPage() {
  const network = useNetworkDevices();
  const [type, setType] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const filtered = (network.data ?? [])
    .filter((device) => type === 'all' || device.type === type)
    .filter(
      (device) =>
        term === '' ||
        [device.name, device.ipAddress, device.vendor, device.macAddress ?? ''].some((value) => value.toLowerCase().includes(term)),
    )
    .sort((a, b) => NETWORK_TYPE_ORDER.indexOf(a.type) - NETWORK_TYPE_ORDER.indexOf(b.type));

  return (
    <div className="space-y-3 p-3 sm:p-4 lg:space-y-4 lg:p-6">
      {network.data && <Summary devices={network.data} />}

      <Card>
        <CardHeader title="Urządzenia w sieci LAN" icon={Network} meta={network.data ? filtered.length : undefined} />
        <div className="flex flex-col gap-2 border-b border-line p-3 lg:flex-row lg:items-center">
          <SegmentedControl<TypeFilter>
            label="Typ urządzenia"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'Wszystkie' },
              ...NETWORK_TYPE_ORDER.map((value) => ({ value: value as TypeFilter, label: NETWORK_TYPES[value].plural })),
            ]}
          />
          <div className="relative lg:ml-auto lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <TextInput
              type="search"
              aria-label="Szukaj urządzenia"
              placeholder="Szukaj: nazwa, IP, producent"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-9"
            />
          </div>
        </div>
        <QueryState
          query={network}
          isEmpty={() => filtered.length === 0}
          empty={
            <EmptyState
              icon={Network}
              title={network.data?.length ? 'Brak urządzeń spełniających kryteria' : 'Nie wykryto urządzeń'}
              description={network.data?.length ? 'Zmień filtr lub wyszukiwaną frazę.' : 'Sztudio Core nie zwrócił żadnego urządzenia sieciowego.'}
            />
          }
        >
          {() => <NetworkDeviceList devices={filtered} />}
        </QueryState>
      </Card>
    </div>
  );
}
