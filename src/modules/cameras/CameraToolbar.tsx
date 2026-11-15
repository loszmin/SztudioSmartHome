import { ChevronLeft, ChevronRight, Grid2x2, Grid3x3, LayoutGrid, Maximize, Minimize, Square } from 'lucide-react';
import { IconButton } from '@/components/Button';
import { Select } from '@/components/FormControls';
import { SegmentedControl } from '@/components/SegmentedControl';
import type { CameraLayout } from '@/stores/settingsStore';
import type { Camera } from '@/types/api';
import { CAMERA_LAYOUTS } from './layouts';

const LAYOUT_ICONS: Record<CameraLayout, typeof Square> = { 1: Square, 4: Grid2x2, 6: LayoutGrid, 9: Grid3x3 };
const LAYOUT_LABELS: Record<CameraLayout, string> = {
  1: 'Widok 1 kamery',
  4: 'Widok 4 kamer',
  6: 'Widok 6 kamer',
  9: 'Widok 9 kamer',
};

interface CameraToolbarProps {
  cameras: Camera[];
  layout: CameraLayout;
  onLayoutChange: (layout: CameraLayout) => void;
  selectedId: string | null;
  onSelectCamera: (id: string) => void;
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  onToggleFullscreen: () => void;
}

export function CameraToolbar(props: CameraToolbarProps) {
  const { cameras, layout, page, pages } = props;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label="Układ podglądu"
        value={layout}
        onChange={props.onLayoutChange}
        options={CAMERA_LAYOUTS.map((value) => {
          const Icon = LAYOUT_ICONS[value];
          return {
            value,
            ariaLabel: LAYOUT_LABELS[value],
            label: (
              <>
                <Icon className="h-3.5 w-3.5" />
                {value}
              </>
            ),
          };
        })}
      />

      <Select
        aria-label="Wybór kamery"
        value={props.selectedId ?? ''}
        onChange={(event) => props.onSelectCamera(event.target.value)}
        className="h-9 w-auto min-w-0 max-w-[13rem] flex-1 sm:flex-none"
      >
        {cameras.map((camera) => (
          <option key={camera.id} value={camera.id}>
            {camera.name}
            {camera.status === 'offline' ? ' (offline)' : ''}
          </option>
        ))}
      </Select>

      <div className="ml-auto flex items-center gap-1">
        {pages > 1 && (
          <>
            <IconButton
              icon={ChevronLeft}
              label={layout === 1 ? 'Poprzednia kamera' : 'Poprzednia strona'}
              disabled={page === 0}
              onClick={() => props.onPageChange(page - 1)}
            />
            <span className="tabular min-w-10 text-center text-xs text-muted" aria-live="polite">
              {page + 1} / {pages}
            </span>
            <IconButton
              icon={ChevronRight}
              label={layout === 1 ? 'Następna kamera' : 'Następna strona'}
              disabled={page >= pages - 1}
              onClick={() => props.onPageChange(page + 1)}
            />
          </>
        )}
        <IconButton
          icon={props.isFullscreen ? Minimize : Maximize}
          label={props.isFullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
          disabled={!props.fullscreenSupported}
          onClick={props.onToggleFullscreen}
        />
      </div>
    </div>
  );
}
