import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, ChevronRight, ServerOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/Button';
import { StatusDot } from '@/components/Status';
import { severityTone } from '@/components/tone';
import { useConnection } from '@/hooks/useConnection';
import { useAlarms } from '@/hooks/useCoreData';
import { formatRelative } from '@/utils/format';

/** Powiadomienia w górnym pasku: aktywne alarmy i stan połączenia. */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const { data: alarms } = useAlarms();
  const connection = useConnection();
  const active = (alarms ?? []).filter((alarm) => alarm.status === 'active');
  const serverDown = connection.state === 'offline';
  const count = active.length + (serverDown ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <IconButton
        icon={Bell}
        label={count > 0 ? `Powiadomienia (${count})` : 'Powiadomienia'}
        aria-expanded={open}
        aria-haspopup="dialog"
        active={open}
        onClick={() => setOpen((value) => !value)}
      />
      {count > 0 && (
        <span className="tabular pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Powiadomienia"
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line-strong bg-navy shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Powiadomienia</h2>
            <span className="tabular text-xs text-muted">{count}</span>
          </div>

          {count === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <BellOff className="h-5 w-5 text-muted" />
              <p className="mt-2 text-sm text-ink">Brak nowych powiadomień</p>
              <p className="mt-0.5 text-xs text-muted">Wszystkie alarmy zostały potwierdzone.</p>
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {serverDown && (
                <li className="flex items-start gap-3 px-4 py-3">
                  <ServerOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Brak połączenia z Sztudio Core</p>
                    <p className="text-xs text-muted">Dane mogą być nieaktualne.</p>
                  </div>
                </li>
              )}
              {active.slice(0, 6).map((alarm) => (
                <li key={alarm.id}>
                  <Link
                    to="/alarmy"
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-raised/60"
                  >
                    <StatusDot tone={severityTone[alarm.severity]} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{alarm.title}</p>
                      <p className="truncate text-xs text-muted">
                        {alarm.source.name} · {formatRelative(alarm.triggeredAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/alarmy"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 border-t border-line px-4 py-2.5 text-xs font-medium text-primary-soft hover:bg-raised/60"
          >
            Przejdź do alarmów
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
