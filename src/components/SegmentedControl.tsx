import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Etykieta dostępności, gdy `label` nie jest tekstem. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-deep p-0.5', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors',
              selected ? 'bg-primary text-white' : 'text-silver hover:bg-raised hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
