import { useRef, useState } from 'react';
import { Cctv } from 'lucide-react';
import { ConnectionBadge } from '@/components/Status';
import { signalLabel } from '@/components/SignalBars';
import { EmptyState, QueryState } from '@/components/StateViews';
import { useCameras } from '@/hooks/useCoreData';
import { useFullscreen } from '@/hooks/useFullscreen';
import { CameraGrid } from '@/modules/cameras/CameraGrid';
import { CameraToolbar } from '@/modules/cameras/CameraToolbar';
import { pageCount, pageOf, pageSlots } from '@/modules/cameras/layouts';
import { useSettingsStore, type CameraLayout } from '@/stores/settingsStore';
import type { Camera } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';

function CameraDetails({ camera }: { camera: Camera }) {
  const items: Array<[string, React.ReactNode]> = [
    ['Lokalizacja', camera.location],
    ['Jakość połączenia', camera.signalQuality === null ? '—' : `${signalLabel(camera.signalQuality)} (${camera.signalQuality}%)`],
    ['Źródło', `${camera.source.toUpperCase()}${camera.channel !== undefined ? ` · kanał ${camera.channel}` : ''}`],
    ['Strumień go2rtc', <span className="font-mono text-xs">{camera.streamName}</span>],
    ['Obraz', camera.resolution ? `${camera.resolution}${camera.fps ? ` · ${camera.fps} kl./s` : ''}` : '—'],
    ['Ostatnia aktywność', formatRelative(camera.lastSeenAt)],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-navy px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold">{camera.name}</span>
        <ConnectionBadge status={camera.status} />
      </div>
      {items.map(([label, value]) => (
        <div key={label} className="text-xs">
          <span className="text-muted">{label}: </span>
          <span className="text-silver">{value}</span>
        </div>
      ))}
    </div>
  );
}

function Monitor({ cameras }: { cameras: Camera[] }) {
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
    <div className="flex flex-col gap-3 p-3 sm:p-4 lg:p-6">
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

      <div
        ref={stage}
        className={cn(fullscreen.isFullscreen && 'flex items-center justify-center bg-black p-2')}
      >
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
              : 'lg:max-w-[calc((100dvh-16.5rem)*16/9)]',
          )}
        />
      </div>

      {selected && <CameraDetails camera={selected} />}
    </div>
  );
}

export function CamerasPage() {
  const cameras = useCameras();
  return (
    <QueryState
      query={cameras}
      isEmpty={(data) => data.length === 0}
      empty={
        <EmptyState
          icon={Cctv}
          title="Brak skonfigurowanych kamer"
          description="Sztudio Core nie zwrócił żadnej kamery. Dodaj kamery lub rejestrator BCS w konfiguracji serwera."
          className="py-24"
        />
      }
      className="py-24"
    >
      {(data) => <Monitor cameras={data} />}
    </QueryState>
  );
}
