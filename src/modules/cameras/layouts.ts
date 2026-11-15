import type { CameraLayout } from '@/stores/settingsStore';

export const CAMERA_LAYOUTS: CameraLayout[] = [1, 4, 6, 9];

/** Klasy siatki dla poszczególnych układów (telefon → większe ekrany). */
export const GRID_CLASS: Record<CameraLayout, string> = {
  1: 'grid-cols-1',
  4: 'grid-cols-2',
  6: 'grid-cols-2 sm:grid-cols-3',
  9: 'grid-cols-2 sm:grid-cols-3',
};

export function pageCount(total: number, layout: CameraLayout): number {
  return Math.max(1, Math.ceil(total / layout));
}

export function pageOf(index: number, layout: CameraLayout): number {
  return index < 0 ? 0 : Math.floor(index / layout);
}

/** Wycina kamery dla danej strony; brakujące pozycje uzupełnia wartością null (pusty slot). */
export function pageSlots<T>(items: T[], layout: CameraLayout, page: number): Array<T | null> {
  const slice: Array<T | null> = items.slice(page * layout, page * layout + layout);
  while (slice.length < layout) slice.push(null);
  return slice;
}
