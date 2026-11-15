import { useState } from 'react';
import { RotateCcw, UserCog } from 'lucide-react';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Status';
import { defaultSettings, useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { InfoRow, Note, SettingsSection } from './SettingsSection';

export function SecuritySection() {
  const apiToken = useSettingsStore((state) => state.apiToken);
  const serverUrl = useSettingsStore((state) => state.serverUrl);
  const update = useSettingsStore((state) => state.update);
  const [confirming, setConfirming] = useState(false);
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  const encrypted = serverUrl ? serverUrl.startsWith('https://') : typeof window !== 'undefined' && window.location.protocol === 'https:';

  const reset = () => {
    update(defaultSettings);
    setConfirming(false);
    toast.success('Przywrócono ustawienia domyślne.');
  };

  return (
    <SettingsSection
      id="bezpieczenstwo"
      title="Użytkownicy i bezpieczeństwo"
      description="Stan zabezpieczeń tego panelu i dane zapisane w przeglądarce."
      icon={UserCog}
    >
      <dl className="divide-y divide-line">
        <InfoRow label="Token API">
          <Badge tone={apiToken ? 'success' : 'neutral'}>{apiToken ? 'Ustawiony' : 'Nie ustawiono'}</Badge>
        </InfoRow>
        <InfoRow label="Połączenie z serwerem">
          <Badge tone={encrypted ? 'success' : 'warning'}>{encrypted ? 'Szyfrowane (HTTPS)' : 'Nieszyfrowane (HTTP)'}</Badge>
        </InfoRow>
        <InfoRow label="Bezpieczny kontekst przeglądarki">
          <Badge tone={secure ? 'success' : 'warning'}>{secure ? 'Tak' : 'Nie'}</Badge>
        </InfoRow>
      </dl>
      <div className="mt-3 space-y-3">
        <Note>
          Konta użytkowników i logowanie nie są dostępne w wersji 1.0 – zostaną dodane razem z Sztudio Core. Do tego czasu dostęp
          do panelu należy ograniczać na poziomie sieci lokalnej, a dostęp do API – tokenem.
        </Note>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink">Usunąć adres serwera, token i preferencje z tej przeglądarki?</span>
            <Button size="sm" variant="danger" onClick={reset}>Tak, przywróć</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Anuluj</Button>
          </div>
        ) : (
          <Button icon={RotateCcw} onClick={() => setConfirming(true)}>Przywróć ustawienia domyślne</Button>
        )}
      </div>
    </SettingsSection>
  );
}
