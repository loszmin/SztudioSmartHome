import { Palette } from 'lucide-react';
import { Switch } from '@/components/FormControls';
import { useSettingsStore } from '@/stores/settingsStore';
import { InfoRow, SettingsSection } from './SettingsSection';

export function AppearanceSection() {
  const settings = useSettingsStore();

  return (
    <SettingsSection id="wyglad" title="Wygląd aplikacji" description="Preferencje wyświetlania zapisywane w tej przeglądarce." icon={Palette}>
      <dl>
        <InfoRow label="Motyw">Ciemny (Sztudio Midnight)</InfoRow>
      </dl>
      <div className="divide-y divide-line border-t border-line">
        <Switch
          label="Widok kompaktowy"
          description="Mniejsza skala interfejsu – więcej informacji na ekranie."
          checked={settings.density === 'compact'}
          onChange={(compact) => settings.update({ density: compact ? 'compact' : 'comfortable' })}
        />
        <Switch
          label="Zegar 12-godzinny"
          description="Domyślnie czas jest prezentowany w formacie 24-godzinnym."
          checked={settings.hour12}
          onChange={(hour12) => settings.update({ hour12 })}
        />
        <Switch
          label="Zwinięty panel boczny"
          description="Panel nawigacyjny pokazuje same ikony (ekrany desktopowe)."
          checked={settings.sidebarCollapsed}
          onChange={(sidebarCollapsed) => settings.update({ sidebarCollapsed })}
        />
      </div>
    </SettingsSection>
  );
}
