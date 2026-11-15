import { KeyRound, RefreshCw, ServerOff, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { useConnection } from '@/hooks/useConnection';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ApiError, describeError } from '@/services/api/httpClient';

/** Pasek informujący o utracie połączenia z siecią lub z Sztudio Core. */
export function ConnectionBanner() {
  const online = useOnlineStatus();
  const connection = useConnection();

  const unauthorized = connection.error instanceof ApiError && (connection.error.status === 401 || connection.error.status === 403);

  if (connection.state === 'offline' && unauthorized) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/30 bg-warning/10 px-4 py-2 lg:px-6">
        <KeyRound className="h-4 w-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-xs text-ink sm:text-sm">
          <span className="font-semibold">Sztudio Core wymaga zalogowania.</span>{' '}
          <span className="text-silver">Sesja wygasła albo nie podano danych logowania.</span>
        </p>
        <Link
          to="/ustawienia"
          className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-raised px-2.5 text-xs font-medium text-ink hover:border-primary/60"
        >
          Zaloguj się
        </Link>
      </div>
    );
  }

  if (connection.state === 'offline') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-danger/30 bg-danger/10 px-4 py-2 lg:px-6">
        <ServerOff className="h-4 w-4 shrink-0 text-danger" />
        <p className="min-w-0 flex-1 text-xs text-ink sm:text-sm">
          <span className="font-semibold">Brak połączenia z Sztudio Core.</span>{' '}
          <span className="text-silver">
            {connection.stale ? 'Wyświetlane dane mogą być nieaktualne. ' : ''}
            {describeError(connection.error)}
          </span>
        </p>
        <Button size="sm" icon={RefreshCw} onClick={connection.retry} disabled={connection.isRetrying}>
          {connection.isRetrying ? 'Łączenie…' : 'Połącz ponownie'}
        </Button>
      </div>
    );
  }

  if (!online) {
    return (
      <div role="status" className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 lg:px-6">
        <WifiOff className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs text-ink sm:text-sm">
          <span className="font-semibold">Urządzenie jest offline.</span>{' '}
          <span className="text-silver">Sprawdź połączenie z siecią lokalną.</span>
        </p>
      </div>
    );
  }

  return null;
}
