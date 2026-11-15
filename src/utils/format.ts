const LOCALE = 'pl-PL';

export function formatTime(date: Date | string, hour12 = false, withSeconds = true): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12,
  }).format(new Date(date));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(date),
  );
}

export function formatDateTime(date: Date | string, hour12 = false): string {
  return `${formatDate(date)}, ${formatTime(date, hour12, false)}`;
}

export function formatLongDate(date: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(date),
  );
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'short' });

/** Czas względny, np. „5 min temu”. */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const diffSec = Math.round((new Date(date).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'przed chwilą';
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(diffSec / 3600), 'hour');
  return relative.format(Math.round(diffSec / 86_400), 'day');
}

/** Czas pracy, np. „4 d 3 godz.”. */
export function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} godz.`;
  if (hours > 0) return `${hours} godz. ${minutes} min`;
  return `${minutes} min`;
}

/** Klucz dnia w czasie lokalnym (RRRR-MM-DD) – zgodny z wartością `<input type="date">`. */
export function localDayKey(date: Date | string): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
