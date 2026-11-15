import { useId } from 'react';
import { cn } from '@/utils/cn';

/** Sygnet Sztudio – geometryczne „S” w srebrze i błękicie. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Sztudio">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E6ECF4" />
          <stop offset="1" stopColor="#93A3B8" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4BA3F5" />
          <stop offset="1" stopColor="#1B6FC7" />
        </linearGradient>
      </defs>
      <g fill="none" strokeWidth="6" strokeLinejoin="miter">
        <path d="M38 11H16l-6 6v3l4 4h10" stroke={`url(#${id}s)`} />
        <path d="M10 37h22l6-6v-3l-4-4H24" stroke={`url(#${id}b)`} />
      </g>
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Pokazuje hasło „Your home. Your security.” pod nazwą. */
  tagline?: boolean;
  compact?: boolean;
}

export function Logo({ className, tagline = false, compact = false }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoMark className="h-9 w-9 shrink-0" />
      {!compact && (
        <div className="min-w-0 leading-none">
          <div className="text-[15px] font-bold tracking-[0.18em] text-ink">SZTUDIO</div>
          <div className="mt-1 text-[10px] font-semibold tracking-[0.32em] text-primary-soft">SMART HOME</div>
          {tagline && (
            <div className="mt-1.5 text-[9px] font-medium tracking-[0.14em] text-muted">
              YOUR HOME. YOUR SECURITY.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
