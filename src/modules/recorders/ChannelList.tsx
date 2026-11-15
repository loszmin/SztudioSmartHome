import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/Button';
import { Select } from '@/components/FormControls';
import { ResultBox } from '@/components/ResultBox';
import { LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/Status';
import { useCoreAction } from '@/hooks/useCoreData';
import { describeError } from '@/services/api/httpClient';
import type { ChannelImportItem, Recorder, RecorderChannel } from '@/types/api';

/** Kanały odczytane z rejestratora z możliwością dodania ich jako kamer. */
export function ChannelList({ recorder }: { recorder: Recorder }) {
  const [channels, setChannels] = useState<RecorderChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<number, string>>({});
  const load = useCoreAction((api, id: string) => api.getRecorderChannels(id));
  const importChannels = useCoreAction(
    (api, items: ChannelImportItem[]) => api.importRecorderChannels(recorder.id, items),
    {
      invalidate: ['cameras', 'devices', 'diagnostics'],
      success: (cameras) => (cameras.length === 1 ? `Dodano kamerę „${cameras[0]!.name}”.` : `Dodano kamer: ${cameras.length}.`),
      failure: 'Nie udało się dodać kanałów.',
    },
  );

  const refresh = () => {
    setError(null);
    load.mutate(recorder.id, { onSuccess: setChannels, onError: (cause) => setError(describeError(cause)) });
  };
  // Kanały są odczytywane z urządzenia przy otwarciu listy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [recorder.id]);

  const add = (items: RecorderChannel[]) =>
    importChannels.mutate(
      items.map((channel) => ({ number: channel.number, profile: profiles[channel.number] })),
      { onSuccess: refresh },
    );

  if (error) {
    return (
      <div className="space-y-2">
        <ResultBox ok={false} title="Nie udało się odczytać kanałów">{error}</ResultBox>
        <Button size="sm" onClick={refresh}>Spróbuj ponownie</Button>
      </div>
    );
  }
  if (!channels) return <LoadingState rows={2} className="!p-0" />;

  const pending = channels.filter((channel) => !channel.cameraId && channel.profiles.some((profile) => profile.rtspPath));
  const fromTemplate = channels.some((channel) => channel.origin === 'template');

  return (
    <div className="space-y-2">
      {fromTemplate && (
        <p className="text-xs leading-relaxed text-warning">
          Kanały wyliczono z szablonu ścieżki RTSP – nie zostały odczytane z rejestratora. Poprawność adresów pokaże test po dodaniu kamery.
        </p>
      )}
      <ul aria-label={`Kanały rejestratora ${recorder.name}`} className="divide-y divide-line rounded-lg border border-line">
        {channels.map((channel) => {
          const usable = channel.profiles.filter((profile) => profile.rtspPath);
          return (
            <li key={channel.number} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="w-20 shrink-0 text-sm font-medium text-ink">{channel.name}</span>
              {channel.cameraId ? (
                <Badge tone="success">dodany jako kamera</Badge>
              ) : usable.length === 0 ? (
                <span className="text-xs text-muted">Brak adresu strumienia{channel.profiles[0]?.error ? ` – ${channel.profiles[0].error}` : ''}</span>
              ) : (
                <>
                  <Select
                    aria-label={`Profil kanału ${channel.number}`}
                    value={profiles[channel.number] ?? usable[0]!.name}
                    onChange={(event) => setProfiles((current) => ({ ...current, [channel.number]: event.target.value }))}
                    className="h-8 w-auto min-w-0 max-w-full flex-1 text-xs"
                  >
                    {usable.map((profile) => (
                      <option key={profile.name} value={profile.name}>
                        {[profile.name, profile.resolution, profile.encoding].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" icon={Plus} disabled={importChannels.isPending} onClick={() => add([channel])}>
                    Dodaj
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {pending.length > 1 && (
        <Button size="sm" variant="primary" icon={Plus} disabled={importChannels.isPending} onClick={() => add(pending)}>
          Dodaj wszystkie kanały ({pending.length})
        </Button>
      )}
    </div>
  );
}
