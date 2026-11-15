import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/Button';

/** Rejestruje Service Workera i informuje o dostępnej nowej wersji panelu. */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-primary/40 bg-raised px-4 py-3 shadow-xl shadow-black/40 lg:bottom-5"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">Dostępna jest nowa wersja panelu.</p>
      <Button size="sm" variant="primary" icon={RefreshCw} onClick={() => void updateServiceWorker(true)}>
        Odśwież
      </Button>
      <button type="button" aria-label="Zamknij" onClick={() => setNeedRefresh(false)} className="rounded p-1 text-muted hover:text-ink">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
