import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { Switch } from '@/components/FormControls';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { SettingsSection } from './SettingsSection';

export function NotificationsSection() {
  const prefs = useSettingsStore((state) => state.notifications);
  const update = useSettingsStore((state) => state.updateNotifications);
  const supported = typeof Notification !== 'undefined';
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  );

  const toggleBrowser = async (enabled: boolean) => {
    if (!enabled) {
      update({ browser: false });
      return;
    }
    if (!supported) return;
    const granted = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(granted);
    if (granted === 'granted') update({ browser: true });
    else toast.error('Przeglądarka nie zezwoliła na powiadomienia systemowe.');
  };

  const browserDescription =
    permission === 'unsupported'
      ? 'Ta przeglądarka nie obsługuje powiadomień systemowych.'
      : permission === 'denied'
        ? 'Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony.'
        : 'Powiadomienie systemu Windows / Android o nowym alarmie, gdy panel jest otwarty.';

  return (
    <SettingsSection
      id="powiadomienia"
      title="Ustawienia powiadomień"
      description="O których nowych alarmach panel ma informować. Powiadomienia działają, gdy panel jest uruchomiony."
      icon={BellRing}
    >
      <div className="divide-y divide-line">
        <Switch
          label="Alarmy czujników i systemu"
          description="Ruch, otwarcie, zalanie, dym, temperatura, wibracje oraz alarmy systemowe."
          checked={prefs.alarms}
          onChange={(alarms) => update({ alarms })}
        />
        <Switch
          label="Utrata połączenia z kamerą"
          description="Alarmy, których źródłem jest kamera."
          checked={prefs.cameraOffline}
          onChange={(cameraOffline) => update({ cameraOffline })}
        />
        <Switch
          label="Alarmy sieciowe"
          description="Niedostępność rejestratora, routera i innych urządzeń sieci."
          checked={prefs.network}
          onChange={(network) => update({ network })}
        />
        <Switch
          label="Powiadomienia systemowe"
          description={browserDescription}
          checked={prefs.browser && permission === 'granted'}
          disabled={permission === 'unsupported' || permission === 'denied'}
          onChange={(enabled) => void toggleBrowser(enabled)}
        />
      </div>
    </SettingsSection>
  );
}
