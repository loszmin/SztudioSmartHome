import { Cctv, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '@/components/Card';
import { EmptyState, QueryState } from '@/components/StateViews';
import { useCameras } from '@/hooks/useCoreData';
import { CameraTile } from '@/modules/cameras/CameraTile';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/utils/cn';

/** Podgląd pierwszych kamer na dashboardzie. */
export function CameraPreview() {
  const cameras = useCameras();
  const count = useSettingsStore((state) => state.dashboardCameraCount);
  const navigate = useNavigate();
  const online = cameras.data?.filter((camera) => camera.status === 'online').length;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title="Podgląd kamer"
        icon={Cctv}
        meta={cameras.data ? `${online} z ${cameras.data.length} online` : undefined}
        action={
          <Link to="/kamery" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary-soft hover:text-ink">
            Monitoring
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <QueryState
        query={cameras}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState icon={Cctv} title="Brak kamer" description="Sztudio Core nie zwrócił żadnej kamery." />}
      >
        {(data) => (
          <div className={cn('grid gap-2 p-2 sm:p-3', count === 4 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
            {data.slice(0, count).map((camera) => (
              <CameraTile key={camera.id} camera={camera} onSelect={() => navigate('/kamery')} />
            ))}
          </div>
        )}
      </QueryState>
    </Card>
  );
}
