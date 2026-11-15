import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DataMode = 'demo' | 'live';
export type CameraLayout = 1 | 4 | 6 | 9;
export type Density = 'comfortable' | 'compact';

export interface NotificationPrefs {
  alarms: boolean;
  cameraOffline: boolean;
  network: boolean;
  /** Powiadomienia systemowe przeglądarki (wymaga zgody użytkownika). */
  browser: boolean;
}

export interface SettingsState {
  mode: DataMode;
  /** Adres Sztudio Core; pusty = ten sam origin, z którego serwowany jest panel. */
  serverUrl: string;
  /** Opcjonalny token API wysyłany w nagłówku Authorization. */
  apiToken: string;
  /** Login użytkownika, którego token jest zapisany (pusty przy ręcznie wklejonym tokenie). */
  authUsername: string;
  /** Adres go2rtc; pusty = `<adres Core>/go2rtc`. */
  go2rtcUrl: string;
  refreshIntervalSec: number;
  defaultLayout: CameraLayout;
  dashboardCameraCount: 2 | 4;
  notifications: NotificationPrefs;
  density: Density;
  hour12: boolean;
  sidebarCollapsed: boolean;
  update: (patch: Partial<Omit<SettingsState, 'update' | 'updateNotifications'>>) => void;
  updateNotifications: (patch: Partial<NotificationPrefs>) => void;
}

const env = import.meta.env;

export const defaultSettings = {
  mode: (env.VITE_DEFAULT_MODE === 'live' ? 'live' : 'demo') as DataMode,
  serverUrl: env.VITE_CORE_URL ?? '',
  apiToken: '',
  authUsername: '',
  go2rtcUrl: env.VITE_GO2RTC_URL ?? '',
  refreshIntervalSec: 10,
  defaultLayout: 4 as CameraLayout,
  dashboardCameraCount: 4 as 2 | 4,
  notifications: { alarms: true, cameraOffline: true, network: true, browser: false },
  density: 'comfortable' as Density,
  hour12: false,
  sidebarCollapsed: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      update: (patch) => set(patch),
      updateNotifications: (patch) =>
        set((state) => ({ notifications: { ...state.notifications, ...patch } })),
    }),
    { name: 'sztudio.settings', version: 1 },
  ),
);

/** Usuwa końcowe ukośniki i białe znaki z adresu. */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Sprawdza, czy adres jest pusty (ten sam origin) albo poprawnym adresem http(s). */
export function isValidServerUrl(url: string): boolean {
  const value = url.trim();
  if (value === '') return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
