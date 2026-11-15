import { Download, Info } from 'lucide-react';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { useSystemStatus } from '@/hooks/useCoreData';
import { isStandalone, usePwaStore } from '@/stores/pwaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { formatDateTime } from '@/utils/format';
import { InfoRow, SettingsSection } from './SettingsSection';

export function AboutSection() {
  const { data: status } = useSystemStatus();
  const mode = useSettingsStore((state) => state.mode);
  const hour12 = useSettingsStore((state) => state.hour12);
  const canInstall = usePwaStore((state) => state.installEvent !== null);
  const installedNow = usePwaStore((state) => state.installed);
  const install = usePwaStore((state) => state.install);
  const installed = installedNow || isStandalone();

  const pwaText = installed
    ? 'Zainstalowana'
    : canInstall
      ? 'Gotowa do instalacji'
      : 'Instalacja z menu przeglądarki (Chrome / Edge)';

  return (
    <SettingsSection id="wersja" title="Informacje o wersji" icon={Info}>
      <div className="grid items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <Logo tagline className="py-2 lg:pr-6" />
        <div>
          <dl className="divide-y divide-line">
            <InfoRow label="Panel">Sztudio Smart Home {__APP_VERSION__}</InfoRow>
            <InfoRow label="Data kompilacji">{formatDateTime(__BUILD_DATE__, hour12)}</InfoRow>
            <InfoRow label="Sztudio Core">{status ? status.core.version : '—'}</InfoRow>
            <InfoRow label="Źródło danych">{mode === 'demo' ? 'Tryb demonstracyjny' : 'Sztudio Core'}</InfoRow>
            <InfoRow label="Aplikacja (PWA)">{pwaText}</InfoRow>
          </dl>
          {canInstall && !installed && (
            <Button
              className="mt-3"
              variant="primary"
              icon={Download}
              onClick={() => void install().then((accepted) => accepted && toast.success('Aplikacja została zainstalowana.'))}
            >
              Zainstaluj aplikację
            </Button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
