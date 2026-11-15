import { useState, type FormEvent } from 'react';
import { Radar, Search } from 'lucide-react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Field, TextInput } from '@/components/FormControls';
import { ResultBox } from '@/components/ResultBox';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState } from '@/components/StateViews';
import { Badge } from '@/components/Status';
import { useCoreAction } from '@/hooks/useCoreData';
import { describeError } from '@/services/api/httpClient';
import type { DiscoveryMode, OnvifDiscoveredDevice, OnvifDiscoverResponse } from '@/types/api';

interface OnvifDiscoveryDialogProps {
  onClose: () => void;
  /** Wybrano urządzenie do skonfigurowania jako kamera. */
  onSelect: (device: OnvifDiscoveredDevice) => void;
}

/** Wyszukiwanie urządzeń ONVIF: rozgłoszenie w sieci Core albo skan wskazanej podsieci. */
export function OnvifDiscoveryDialog({ onClose, onSelect }: OnvifDiscoveryDialogProps) {
  const [mode, setMode] = useState<DiscoveryMode>('subnet');
  const [network, setNetwork] = useState('');
  const [result, setResult] = useState<OnvifDiscoverResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const discover = useCoreAction((api, args: { mode: DiscoveryMode; network?: string }) => api.discoverOnvif(args.mode, args.network));

  const search = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'subnet' && !network.trim()) return setError('Podaj podsieć do przeszukania, np. 192.168.1.0/24.');
    setError(null);
    setResult(null);
    discover.mutate(
      { mode, network: mode === 'subnet' ? network.trim() : undefined },
      { onSuccess: setResult, onError: (cause) => setError(describeError(cause)) },
    );
  };

  return (
    <Dialog
      title="Wyszukiwanie kamer ONVIF"
      description="Sztudio Core wysyła zapytanie WS-Discovery i pokazuje urządzenia, które na nie odpowiedziały."
      size="lg"
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Zamknij</Button>}
    >
      <form onSubmit={search} className="space-y-3">
        <SegmentedControl<DiscoveryMode>
          label="Tryb wyszukiwania"
          value={mode}
          onChange={(value) => {
            setMode(value);
            setResult(null);
            setError(null);
          }}
          options={[
            { value: 'subnet', label: 'Skan podsieci' },
            { value: 'multicast', label: 'Rozgłoszenie (multicast)' },
          ]}
        />
        <p className="text-xs leading-relaxed text-muted">
          {mode === 'subnet'
            ? 'Zapytanie trafia kolejno pod każdy adres podsieci. Działa także, gdy Core pracuje w kontenerze Docker lub kamery są w innym VLAN-ie osiągalnym przez router.'
            : 'Jedno zapytanie rozgłoszeniowe. Działa tylko wtedy, gdy Core jest w tej samej sieci co kamery – nie przechodzi przez routery, VLAN-y ani mostkową sieć Dockera.'}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {mode === 'subnet' && (
            <Field label="Podsieć" className="min-w-0 flex-1">
              {(field) => (
                <TextInput {...field} value={network} onChange={(event) => setNetwork(event.target.value)} placeholder="192.168.1.0/24" autoComplete="off" spellCheck={false} autoFocus />
              )}
            </Field>
          )}
          <Button type="submit" variant="primary" icon={Search} disabled={discover.isPending}>
            {discover.isPending ? 'Szukanie…' : 'Szukaj'}
          </Button>
        </div>
      </form>

      <div className="mt-4">
        {error && <ResultBox ok={false} title="Wyszukiwanie nie powiodło się">{error}</ResultBox>}
        {result && result.devices.length === 0 && (
          <EmptyState
            icon={Radar}
            title="Nie znaleziono urządzeń ONVIF"
            description={
              result.mode === 'subnet'
                ? `Sprawdzono adresów: ${result.scannedHosts}. Upewnij się, że ONVIF jest włączony w kamerze, albo dodaj kamerę ręcznie przez adres IP.`
                : 'Brak odpowiedzi na rozgłoszenie. Spróbuj skanu podsieci albo dodaj kamerę ręcznie przez adres IP.'
            }
            className="py-6"
          />
        )}
        {result && result.devices.length > 0 && (
          <ul aria-label="Znalezione urządzenia" className="divide-y divide-line rounded-lg border border-line">
            {result.devices.map((device) => (
              <li key={device.ip} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{device.name ?? device.hardware ?? 'Urządzenie ONVIF'}</p>
                  <p className="truncate font-mono text-xs text-muted">
                    {device.ip}:{device.onvifPort}
                    {device.hardware ? ` · ${device.hardware}` : ''}
                  </p>
                </div>
                {device.likelyBcs && <Badge tone="primary">prawdopodobnie BCS</Badge>}
                {device.alreadyAdded && <Badge tone="neutral">już w systemie</Badge>}
                <Button size="sm" onClick={() => onSelect(device)}>Skonfiguruj</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
