import { cn } from '@/utils/cn';

interface SignalBarsProps {
  /** Jakość 0–100 lub null (brak sygnału). */
  quality: number | null;
  className?: string;
}

export function signalLevel(quality: number | null): 0 | 1 | 2 | 3 | 4 {
  if (quality === null || quality <= 0) return 0;
  if (quality < 40) return 1;
  if (quality < 60) return 2;
  if (quality < 80) return 3;
  return 4;
}

export function signalLabel(quality: number | null): string {
  const labels = ['Brak sygnału', 'Słaba', 'Średnia', 'Dobra', 'Bardzo dobra'] as const;
  return labels[signalLevel(quality)];
}

/** Wskaźnik jakości połączenia (4 słupki). */
export function SignalBars({ quality, className }: SignalBarsProps) {
  const level = signalLevel(quality);
  const color = level <= 1 ? 'bg-danger' : level === 2 ? 'bg-warning' : 'bg-success';
  const label =
    quality === null ? 'Jakość połączenia: brak sygnału' : `Jakość połączenia: ${signalLabel(quality)} (${quality}%)`;

  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex h-3.5 items-end gap-[2px]', className)}>
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={cn('w-[3px] rounded-[1px]', bar <= level ? color : 'bg-silver/25')}
          style={{ height: `${bar * 25}%` }}
        />
      ))}
    </span>
  );
}
