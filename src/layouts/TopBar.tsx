import { FlaskConical, LoaderCircle, Wifi, WifiOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { findNavItem, MORE_PATH } from '@/app/navigation';
import { LogoMark } from '@/components/Logo';
import { Badge } from '@/components/Status';
import type { Tone } from '@/components/tone';
import { useClock } from '@/hooks/useClock';
import { useConnection, type ConnectionState } from '@/hooks/useConnection';
import { useSystemStatus } from '@/hooks/useCoreData';
import { ARMING_MODES } from '@/modules/alarms/arming';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatLongDate, formatTime } from '@/utils/format';
import { NotificationsMenu } from './NotificationsMenu';

const CONNECTION: Record<ConnectionState, { tone: Tone; label: string; short: string; icon: typeof Wifi }> = {
  demo: { tone: 'primary', label: 'Tryb demonstracyjny', short: 'Demo', icon: FlaskConical },
  connecting: { tone: 'neutral', label: 'Łączenie z Sztudio Core…', short: 'Łączenie…', icon: LoaderCircle },
  online: { tone: 'success', label: 'Połączono z Sztudio Core', short: 'Połączono', icon: Wifi },
  offline: { tone: 'danger', label: 'Brak połączenia z Sztudio Core', short: 'Brak połączenia', icon: WifiOff },
};

function Clock() {
  const now = useClock();
  const hour12 = useSettingsStore((state) => state.hour12);
  return (
    <div className="hidden text-right leading-tight md:block">
      <div className="tabular text-sm font-semibold text-ink">{formatTime(now, hour12)}</div>
      <div className="text-[11px] text-muted">{formatLongDate(now)}</div>
    </div>
  );
}

/** Górny pasek statusu: tytuł ekranu, połączenie z serwerem, stan alarmu, zegar, powiadomienia. */
export function TopBar() {
  const { pathname } = useLocation();
  const connection = useConnection();
  const { data: status } = useSystemStatus();
  const title = pathname === MORE_PATH ? 'Więcej' : (findNavItem(pathname)?.title ?? 'Sztudio Smart Home');
  const info = CONNECTION[connection.state];
  const arming = status ? ARMING_MODES[status.alarmSystem.mode] : null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-deep/80 px-4 backdrop-blur lg:h-16 lg:px-6">
      <Link to="/" aria-label="Sztudio Smart Home – start" className="lg:hidden">
        <LogoMark className="h-8 w-8" />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-ink lg:text-lg">{title}</h1>

      {arming && (
        <Link to="/alarmy" className="hidden sm:block" title="Stan systemu alarmowego">
          <Badge tone={arming.tone} className="h-7 px-2.5">
            <arming.icon className="h-3.5 w-3.5" />
            {arming.short}
          </Badge>
        </Link>
      )}

      <Link to="/ustawienia" title={info.label} aria-label={`Połączenie z serwerem: ${info.label}`}>
        <Badge tone={info.tone} className="h-7 px-2.5">
          <info.icon className={connection.state === 'connecting' ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          <span className="hidden xl:inline">{info.label}</span>
          <span className="xl:hidden">{info.short}</span>
        </Badge>
      </Link>

      <Clock />
      <NotificationsMenu />
    </header>
  );
}
