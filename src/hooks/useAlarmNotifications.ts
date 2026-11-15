import { useEffect, useRef } from 'react';
import { useSettingsStore, type NotificationPrefs } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import type { Alarm } from '@/types/api';
import { useAlarms } from './useCoreData';
import { useDataSource } from './useCoreQuery';

function isEnabled(alarm: Alarm, prefs: NotificationPrefs): boolean {
  if (alarm.source.type === 'camera') return prefs.cameraOffline;
  if (alarm.source.type === 'network') return prefs.network;
  return prefs.alarms;
}

/**
 * Powiadamia o nowych aktywnych alarmach (komunikat w aplikacji oraz – po
 * wyrażeniu zgody – powiadomienie systemowe). Alarmy obecne przy pierwszym
 * pobraniu danych nie generują powiadomień.
 */
export function useAlarmNotifications(): void {
  const { data } = useAlarms();
  const source = useDataSource();
  const prefs = useSettingsStore((state) => state.notifications);
  const seen = useRef<Set<string> | null>(null);
  const sourceKey = `${source.mode}|${source.serverUrl}`;
  const lastSourceKey = useRef(sourceKey);

  useEffect(() => {
    if (lastSourceKey.current !== sourceKey) {
      lastSourceKey.current = sourceKey;
      seen.current = null;
    }
    if (!data) return;
    const active = data.filter((alarm) => alarm.status === 'active');
    if (seen.current === null) {
      seen.current = new Set(active.map((alarm) => alarm.id));
      return;
    }
    for (const alarm of active) {
      if (seen.current.has(alarm.id)) continue;
      seen.current.add(alarm.id);
      if (!isEnabled(alarm, prefs)) continue;
      toast.error(`Nowy alarm: ${alarm.title} (${alarm.source.name})`);
      if (prefs.browser && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Sztudio Smart Home – alarm', {
            body: `${alarm.title} · ${alarm.source.name}`,
            tag: alarm.id,
            icon: '/icons/icon-192.png',
          });
        } catch {
          // Część przeglądarek mobilnych nie pozwala tworzyć powiadomień poza Service Workerem.
        }
      }
    }
  }, [data, prefs, sourceKey]);
}
