import { AboutSection } from '@/modules/settings/AboutSection';
import { AppearanceSection } from '@/modules/settings/AppearanceSection';
import { BcsSection } from '@/modules/settings/BcsSection';
import { CamerasSection } from '@/modules/settings/CamerasSection';
import { ConnectionSection } from '@/modules/settings/ConnectionSection';
import { NotificationsSection } from '@/modules/settings/NotificationsSection';
import { SecuritySection } from '@/modules/settings/SecuritySection';
import { ServerSection } from '@/modules/settings/ServerSection';

const SECTIONS = [
  { id: 'serwer', label: 'Konfiguracja serwera' },
  { id: 'polaczenie', label: 'Połączenie z Sztudio Core' },
  { id: 'kamery', label: 'Konfiguracja kamer' },
  { id: 'bcs', label: 'Integracja BCS' },
  { id: 'powiadomienia', label: 'Powiadomienia' },
  { id: 'bezpieczenstwo', label: 'Użytkownicy i bezpieczeństwo' },
  { id: 'wyglad', label: 'Wygląd aplikacji' },
  { id: 'wersja', label: 'Informacje o wersji' },
];

export function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-6xl items-start gap-6 p-3 sm:p-4 lg:p-6">
      <nav aria-label="Sekcje ustawień" className="sticky top-6 hidden w-56 shrink-0 xl:block">
        <ul className="space-y-0.5 border-l border-line">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="-ml-px block w-full border-l border-transparent px-3 py-1.5 text-left text-sm text-muted hover:border-primary hover:text-ink"
              >
                {section.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 space-y-3 lg:space-y-4">
        <ServerSection />
        <ConnectionSection />
        <CamerasSection />
        <BcsSection />
        <NotificationsSection />
        <SecuritySection />
        <AppearanceSection />
        <AboutSection />
      </div>
    </div>
  );
}
