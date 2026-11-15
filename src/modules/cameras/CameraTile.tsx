import { useState } from 'react';
import { Camera as CameraIcon, Cctv, LoaderCircle, Maximize2, Minimize2, RefreshCw, TriangleAlert, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { SignalBars } from '@/components/SignalBars';
import { StatusDot } from '@/components/Status';
import { useClock } from '@/hooks/useClock';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import type { Camera } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatDate, formatRelative, formatTime } from '@/utils/format';
import { saveSnapshot, useCameraStream, type StreamState } from './useCameraStream';

interface CameraTileProps {
  camera: Camera;
  selected?: boolean;
  /** Kafel jest jedynym w widoku (przycisk „powiększ” zmienia się w „wróć do siatki”). */
  expanded?: boolean;
  /** Pokazuje przyciski sterowania (migawka, dźwięk, powiększenie). */
  controls?: boolean;
  onSelect?: (camera: Camera) => void;
  onToggleExpand?: (camera: Camera) => void;
  className?: string;
}

function Timestamp() {
  const now = useClock();
  const hour12 = useSettingsStore((state) => state.hour12);
  return (
    <time dateTime={now.toISOString()} className="font-mono text-[11px] tabular text-white/90">
      {formatDate(now)} {formatTime(now, hour12)}
    </time>
  );
}

function Placeholder({ state, camera, error, onRetry }: {
  state: Exclude<StreamState, 'live'>;
  camera: Camera;
  error: string | null;
  onRetry: () => void;
}) {
  const content = {
    demo: { icon: Cctv, color: 'text-silver/40', title: 'Podgląd demonstracyjny', detail: 'Brak strumienia wideo – połącz z Sztudio Core.' },
    offline: { icon: VideoOff, color: 'text-danger/80', title: 'Kamera offline', detail: camera.lastSeenAt ? `Ostatnio widziana ${formatRelative(camera.lastSeenAt)}.` : 'Kamera nie nawiązała jeszcze połączenia.' },
    connecting: { icon: LoaderCircle, color: 'text-primary-soft', title: 'Łączenie ze strumieniem…', detail: '' },
    error: { icon: TriangleAlert, color: 'text-warning', title: 'Brak obrazu', detail: error ?? 'Nie udało się połączyć ze strumieniem.' },
  }[state];
  const Icon = content.icon;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center">
      <Icon className={cn('h-5 w-5 @[16rem]:h-8 @[16rem]:w-8', content.color, state === 'connecting' && 'animate-spin')} />
      <p className="text-[11px] font-medium text-silver @[16rem]:mt-1 @[16rem]:text-sm">{content.title}</p>
      {content.detail && <p className="hidden max-w-xs text-xs text-muted @[26rem]:block">{content.detail}</p>}
      {state === 'error' && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2 py-1 text-xs text-ink hover:border-primary/60"
        >
          <RefreshCw className="h-3 w-3" />
          Ponów
        </button>
      )}
    </div>
  );
}

function TileButton({ label, icon: Icon, onClick, disabled }: {
  label: string;
  icon: typeof CameraIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/55"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** Kafel kamery: obraz (WebRTC z go2rtc) lub czytelny stan zastępczy oraz nakładki statusu. */
export function CameraTile({ camera, selected = false, expanded = false, controls = false, onSelect, onToggleExpand, className }: CameraTileProps) {
  const stream = useCameraStream(camera);
  const [muted, setMuted] = useState(true);
  const live = stream.state === 'live';
  const online = camera.status === 'online';
  const needsStream = 'Dostępne po połączeniu ze strumieniem wideo';

  return (
    <article
      aria-label={`Kamera ${camera.name}`}
      data-state={stream.state}
      onClick={onSelect ? () => onSelect(camera) : undefined}
      onDoubleClick={onToggleExpand ? () => onToggleExpand(camera) : undefined}
      className={cn(
        'group @container relative aspect-video overflow-hidden rounded-lg border bg-[#060a13]',
        selected ? 'border-primary shadow-glow' : 'border-line',
        onSelect && 'cursor-pointer',
        className,
      )}
    >
      {stream.active && (
        <video
          ref={stream.videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={cn('absolute inset-0 h-full w-full object-contain', !live && 'invisible')}
        />
      )}
      {stream.state !== 'live' && (
        <Placeholder state={stream.state} camera={camera} error={stream.error} onRetry={stream.reconnect} />
      )}

      {/* Górna nakładka: nazwa i status */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-2 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusDot tone={online ? 'success' : 'danger'} />
            <h3 className="truncate text-xs font-semibold text-white @[16rem]:text-sm">{camera.name}</h3>
          </div>
          <p className="hidden truncate pl-3.5 text-[11px] text-white/60 @[16rem]:block">{camera.location}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn('hidden text-[10px] font-semibold uppercase tracking-wider @[16rem]:inline', online ? 'text-success' : 'text-danger')}>
            {online ? 'Online' : 'Offline'}
          </span>
          <SignalBars quality={camera.signalQuality} />
        </div>
      </div>

      {/* Dolna nakładka: czas, kanał, nagrywanie */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2 pt-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden @[16rem]:inline"><Timestamp /></span>
          {camera.channel !== undefined && (
            <span className="font-mono text-[10px] text-white/55">CH{camera.channel}</span>
          )}
          {camera.recording && online && (
            <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-danger" title="Rejestrator nagrywa ten kanał">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              REC
            </span>
          )}
        </div>
      </div>

      {controls && (
        <div
          className={cn(
            'absolute bottom-1.5 right-1.5 flex gap-1 transition-opacity',
            selected || expanded ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
          )}
        >
          <TileButton
            label={live ? 'Zapisz migawkę' : `Zapisz migawkę – ${needsStream.toLowerCase()}`}
            icon={CameraIcon}
            disabled={!live}
            onClick={() => {
              if (saveSnapshot(stream.videoRef.current, camera.name)) toast.success(`Zapisano migawkę: ${camera.name}`);
              else toast.error('Nie udało się zapisać migawki.');
            }}
          />
          <TileButton
            label={!live ? `Dźwięk – ${needsStream.toLowerCase()}` : muted ? 'Włącz dźwięk' : 'Wycisz'}
            icon={muted ? VolumeX : Volume2}
            disabled={!live}
            onClick={() => setMuted((value) => !value)}
          />
          {stream.active && <TileButton label="Połącz ponownie ze strumieniem" icon={RefreshCw} onClick={stream.reconnect} />}
          {onToggleExpand && (
            <TileButton
              label={expanded ? 'Wróć do siatki' : 'Powiększ kamerę'}
              icon={expanded ? Minimize2 : Maximize2}
              onClick={() => onToggleExpand(camera)}
            />
          )}
        </div>
      )}
    </article>
  );
}
