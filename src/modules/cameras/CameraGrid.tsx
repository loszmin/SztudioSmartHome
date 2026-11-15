import { Cctv } from 'lucide-react';
import type { CameraLayout } from '@/stores/settingsStore';
import type { Camera } from '@/types/api';
import { cn } from '@/utils/cn';
import { CameraTile } from './CameraTile';
import { GRID_CLASS } from './layouts';

interface CameraGridProps {
  layout: CameraLayout;
  /** Kamery w kolejności slotów; null = pusty slot. */
  slots: Array<Camera | null>;
  selectedId?: string | null;
  onSelect?: (camera: Camera) => void;
  onToggleExpand?: (camera: Camera) => void;
  className?: string;
}

/** Siatka podglądu kamer: 1, 4, 6 (1 duża + 5 małych) lub 9 kafli. */
export function CameraGrid({ layout, slots, selectedId, onSelect, onToggleExpand, className }: CameraGridProps) {
  return (
    <div data-layout={layout} className={cn('grid gap-1.5 sm:gap-2', GRID_CLASS[layout], className)}>
      {slots.map((camera, index) => {
        const featured = layout === 6 && index === 0;
        const span = featured ? 'sm:col-span-2 sm:row-span-2' : undefined;
        if (!camera) {
          return (
            <div
              key={`empty-${index}`}
              className={cn(
                'flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-muted/60',
                span,
              )}
            >
              <Cctv className="h-5 w-5" />
              <span className="text-[11px]">Wolny slot</span>
            </div>
          );
        }
        return (
          <CameraTile
            key={camera.id}
            camera={camera}
            selected={layout !== 1 && camera.id === selectedId}
            expanded={layout === 1}
            controls
            onSelect={onSelect}
            onToggleExpand={onToggleExpand}
            className={span}
          />
        );
      })}
    </div>
  );
}
