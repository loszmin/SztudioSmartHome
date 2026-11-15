import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useToastStore, type ToastTone } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

const icons: Record<ToastTone, typeof Info> = { success: CheckCircle2, danger: TriangleAlert, info: Info };
const colors: Record<ToastTone, string> = {
  success: 'border-success/40 text-success',
  danger: 'border-danger/50 text-danger',
  info: 'border-primary/40 text-primary-soft',
};

/** Krótkie komunikaty o wyniku akcji. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-20 z-50 flex flex-col items-center gap-2 lg:inset-x-auto lg:bottom-5 lg:right-5 lg:items-end"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-raised px-4 py-3 shadow-xl shadow-black/40',
              colors[toast.tone],
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 text-sm text-ink">{toast.message}</p>
            <button
              type="button"
              aria-label="Zamknij komunikat"
              onClick={() => dismiss(toast.id)}
              className="rounded p-0.5 text-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
