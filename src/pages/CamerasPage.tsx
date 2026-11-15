import { useRef, useState, type ReactNode } from 'react';
import { Cctv, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/Dialog';
import { Badge, ConnectionBadge } from '@/components/Status';
import { signalLabel } from '@/components/SignalBars';
import { EmptyState, QueryState } from '@/components/StateViews';
import type { Tone } from '@/components/tone';
import { useCameras, useCoreAction } from '@/hooks/useCoreData';
import { useDataSource } from '@/hooks/useCoreQuery';
import { useFullscreen } from '@/hooks/useFullscreen';
import { CameraAdminBar } from '@/modules/cameras/CameraAdminBar';
import type { CameraFormState } from '@/modules/cameras/cameraForm';
import { CameraFormDialog } from '@/modules/cameras/CameraFormDialog';
import { CameraGrid } from '@/modules/cameras/CameraGrid';
import { CameraToolbar } from '@/modules/cameras/CameraToolbar';
import { pageCount, pageOf, pageSlots } from '@/modules/cameras/layouts';
import { OnvifDiscoveryDialog } from '@/modules/cameras/OnvifDiscoveryDialog';
import { useSettingsStore, type CameraLayout } from '@/stores/settingsStore';
import type { Camera, StreamRegistration } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';

const SOURCE_LABELS: Record<Camera['source'], string> = { bcs: 'Rejestrator BCS', onvif: 'ONVIF', rtsp: 'RTSP' };
const STREAM: Record<StreamRegistration, { tone: Tone; label: string }> = {
  registered: { tone: 'success', label: 'Strumień zarejestrowany' },
  not_configured: { tone: 'neutral', label: 'Brak źródła obrazu' },
  disabled: { tone: 'neutral', label: 'Kamera wyłączona' },
  error: { tone: 'danger', label: 'Błąd rejestracji strumienia' },
};

type DialogState =
  | { kind: 'add'; initial?: Partial<CameraFormState> }
  | { kind: 'edit'; cameraId: string }
  | { kind: 'delete'; camera: Camera }
  | { kind: 'discover' }
  | null;

interface CameraDetailsProps {
  camera: Camera;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function CameraDetails({ camera, admin, onEdit, onDelete }: CameraDetailsProps) {
  const check = useCoreAction((api, id: string) => api.checkCamera(id), {
    invalidate: ['cameras', 'diagnostics'],
    success: (result) => (result.ok ? `Kamera odpowiada (${result.responseTimeMs ?? 0} ms).` : null),
    failure: 'Nie udało się sprawdzić kamery.',
  });
  const items: Array<[string, ReactNode]> = [
    ['Lokalizacja', camera.location || '—'],
    ['Jakość połączenia', camera.signalQuality === null ? '—' : `${signalLabel(camera.signalQuality)} (${camera.signalQuality}%)`],
    ['Źródło obrazu', `${SOURCE_LABELS[camera.source]}${camera.channel !== undefined ? ` · kanał ${camera.channel}` : ''}`],
    ['Profil', camera.streamProfile ?? '—'],
    ['Obraz', camera.resolution ? `${camera.resolution}${camera.fps ? ` · ${camera.fps} kl./s` : ''}` : '—'],
    ['Ostatnia aktywność', formatRelative(camera.lastSeenAt)],
  ];
  const stream = camera.streamState ? STREAM[camera.streamState] : null;

  return (
    <section aria-label="Wybrana kamera" className="rounded-lg border border-line bg-navy px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold">{camera.name}</span>
          <ConnectionBadge status={camera.status} />
          {stream && <Badge tone={stream.tone}>{stream.label}</Badge>}
        </div>
        {items.map(([label, value]) => (
          <div key={label} className="text-xs">
            <span className="text-muted">{label}: </span>
            <span className="text-silver">{value}</span>
          </div>
        ))}
        {admin && (
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={RefreshCw} disabled={check.isPending} onClick={() => check.mutate(camera.id)}>
              {check.isPending ? 'Sprawdzanie…' : 'Sprawdź'}
            </Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>Edytuj</Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete}>Usuń</Button>
          </div>
        )}
      </div>
      {camera.errorMessage && camera.status === 'offline' && (
        <p role="status" className="mt-2 border-t border-line pt-2 text-xs text-danger">
          {camera.errorMessage}
          {camera.errorCode && <span className="ml-2 font-mono text-[11px] text-muted">kod: {camera.errorCode}</span>}
        </p>
      )}
    </section>
  );
}

function Monitor({ cameras, admin, onDialog }: { cameras: Camera[]; admin: boolean; onDialog: (state: DialogState) => void }) {
  const defaultLayout = useSettingsStore((state) => state.defaultLayout);
  const [layout, setLayout] = useState<CameraLayout>(defaultLayout);
  const [gridLayout, setGridLayout] = useState<CameraLayout>(defaultLayout === 1 ? 4 : defaultLayout);
  const [selectedId, setSelectedId] = useState<string | null>(cameras[0]?.id ?? null);
  const [page, setPage] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(stage);

  const pages = pageCount(cameras.length, layout);
  const currentPage = Math.min(page, pages - 1);
  const slots = pageSlots(cameras, layout, currentPage);
  const selected = cameras.find((camera) => camera.id === selectedId) ?? cameras[0] ?? null;
  const indexOf = (id: string) => cameras.findIndex((camera) => camera.id === id);

  const changeLayout = (next: CameraLayout) => {
    if (next !== 1) setGridLayout(next);
    setLayout(next);
    setPage(selected ? pageOf(indexOf(selected.id), next) : 0);
  };

  const selectCamera = (id: string) => {
    setSelectedId(id);
    setPage(pageOf(indexOf(id), layout));
  };

  const changePage = (next: number) => {
    setPage(next);
    const first = cameras[next * layout];
    if (first && (layout === 1 || !pageSlots(cameras, layout, next).some((camera) => camera?.id === selectedId))) {
      setSelectedId(first.id);
    }
  };

  const toggleExpand = (camera: Camera) => {
    setSelectedId(camera.id);
    const next = layout === 1 ? gridLayout : 1;
    setLayout(next);
    setPage(pageOf(indexOf(camera.id), next));
  };

  return (
    <>
      <CameraToolbar
        cameras={cameras}
        layout={layout}
        onLayoutChange={changeLayout}
        selectedId={selected?.id ?? null}
        onSelectCamera={selectCamera}
        page={currentPage}
        pages={pages}
        onPageChange={changePage}
        isFullscreen={fullscreen.isFullscreen}
        fullscreenSupported={fullscreen.supported}
        onToggleFullscreen={() => void fullscreen.toggle()}
      />

      <div ref={stage} className={cn(fullscreen.isFullscreen && 'flex items-center justify-center bg-black p-2')}>
        <CameraGrid
          layout={layout}
          slots={slots}
          selectedId={selected?.id}
          onSelect={(camera) => setSelectedId(camera.id)}
          onToggleExpand={toggleExpand}
          className={cn(
            'mx-auto w-full',
            fullscreen.isFullscreen
              ? 'max-w-[calc((100dvh-1rem)*16/9)]'
              : admin
                ? 'lg:max-w-[calc((100dvh-19.5rem)*16/9)]'
                : 'lg:max-w-[calc((100dvh-16.5rem)*16/9)]',
          )}
        />
      </div>

      {selected && (
        <CameraDetails
          camera={selected}
          admin={admin}
          onEdit={() => onDialog({ kind: 'edit', cameraId: selected.id })}
          onDelete={() => onDialog({ kind: 'delete', camera: selected })}
        />
      )}
    </>
  );
}

export function CamerasPage() {
  const cameras = useCameras();
  const { mode } = useDataSource();
  const admin = mode === 'live';
  const [dialog, setDialog] = useState<DialogState>(null);
  const remove = useCoreAction((api, id: string) => api.deleteCamera(id), {
    invalidate: ['cameras', 'devices', 'diagnostics', 'alarms'],
    success: 'Kamera została usunięta.',
    failure: 'Nie udało się usunąć kamery.',
  });

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 lg:p-6">
      {admin && <CameraAdminBar onAdd={() => setDialog({ kind: 'add' })} onDiscover={() => setDialog({ kind: 'discover' })} />}

      <QueryState
        query={cameras}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={Cctv}
            title="Brak skonfigurowanych kamer"
            description={
              admin
                ? 'Dodaj kamerę przez adres IP albo wyszukaj urządzenia ONVIF w sieci lokalnej. Kamery podłączone do rejestratora dodasz na ekranie Rejestratory.'
                : 'Tryb demonstracyjny nie zawiera kamer.'
            }
            className="py-20"
          />
        }
        className="py-20"
      >
        {(data) => <Monitor cameras={data} admin={admin} onDialog={setDialog} />}
      </QueryState>

      {dialog?.kind === 'add' && <CameraFormDialog initial={dialog.initial} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <CameraFormDialog cameraId={dialog.cameraId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'discover' && (
        <OnvifDiscoveryDialog
          onClose={() => setDialog(null)}
          onSelect={(device) =>
            setDialog({
              kind: 'add',
              initial: {
                source: 'onvif',
                host: device.ip,
                onvifPort: String(device.onvifPort),
                name: device.name ?? device.hardware ?? '',
                model: device.hardware ?? '',
              },
            })
          }
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Usunąć kamerę?"
          message={`Kamera „${dialog.camera.name}” zostanie usunięta razem z konfiguracją źródła i zapisanym hasłem. Historia zdarzeń pozostanie.`}
          confirmLabel="Usuń kamerę"
          pending={remove.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => remove.mutate(dialog.camera.id, { onSettled: () => setDialog(null) })}
        />
      )}
    </div>
  );
}
