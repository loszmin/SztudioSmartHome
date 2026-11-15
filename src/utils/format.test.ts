import { describe, expect, it } from 'vitest';
import { formatRelative, formatUptime, localDayKey } from './format';

describe('format', () => {
  const now = new Date('2026-03-10T12:00:00');

  it('opisuje czas względny', () => {
    expect(formatRelative(new Date(now.getTime() - 10_000), now)).toBe('przed chwilą');
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), now)).toMatch(/5 min/);
    expect(formatRelative(new Date(now.getTime() - 3 * 3_600_000), now)).toMatch(/3 godz/);
    expect(formatRelative(new Date(now.getTime() - 2 * 86_400_000), now)).toMatch(/przedwczoraj|2 dni/);
  });

  it('formatuje czas pracy', () => {
    expect(formatUptime(90)).toBe('1 min');
    expect(formatUptime(2 * 3600 + 300)).toBe('2 godz. 5 min');
    expect(formatUptime(4 * 86_400 + 3 * 3600)).toBe('4 d 3 godz.');
  });

  it('zwraca klucz dnia w czasie lokalnym', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
