import { Plus, Radar } from 'lucide-react';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Status';
import type { Tone } from '@/components/tone';
import { useSystemStatus } from '@/hooks/useCoreData';
import type { ServiceState } from '@/types/api';

const GO2RTC: Record<ServiceState, { tone: Tone; label: string }> = {
  running: { tone: 'success', label: 'go2rtc: działa' },
  error: { tone: 'danger', label: 'go2rtc: błąd' },
  stopped: { tone: 'neutral', label: 'go2rtc: nieskonfigurowany' },
};

/** Stan usługi strumieni – widoczny przy siatce kamer. */
export function Go2rtcBadge() {
  const { data } = useSystemStatus();
  const service = data?.services.find((item) => item.key === 'go2rtc');
  if (!service) return null;
  const info = GO2RTC[service.state];
  return (
    <Badge tone={info.tone} dot className="h-7 px-2.5" >
      {info.label}
    </Badge>
  );
}

interface CameraAdminBarProps {
  onAdd: () => void;
  onDiscover: () => void;
}

/** Akcje administracyjne ekranu kamer (tylko przy połączeniu z Sztudio Core). */
export function CameraAdminBar({ onAdd, onDiscover }: CameraAdminBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="primary" icon={Plus} onClick={onAdd}>
        Dodaj kamerę
      </Button>
      <Button size="sm" icon={Radar} onClick={onDiscover}>
        Szukaj ONVIF
      </Button>
      <span className="ml-auto">
        <Go2rtcBadge />
      </span>
    </div>
  );
}
