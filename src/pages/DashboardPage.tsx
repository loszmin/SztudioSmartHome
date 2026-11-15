import { ActiveAlarmsCard } from '@/modules/dashboard/ActiveAlarmsCard';
import { CameraPreview } from '@/modules/dashboard/CameraPreview';
import { RecentEventsCard } from '@/modules/dashboard/RecentEventsCard';
import { StatusTiles } from '@/modules/dashboard/StatusTiles';

export function DashboardPage() {
  return (
    <div className="space-y-3 p-3 sm:p-4 lg:space-y-4 lg:p-6">
      <StatusTiles />
      {/*
        Desktop: kamery po lewej, alarmy i zdarzenia w kolumnie o wysokości podglądu kamer.
        Telefon: alarmy → kamery → zdarzenia (najpilniejsze informacje na górze).
      */}
      <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
        <div className="order-2 min-w-0 lg:order-none lg:col-span-8">
          <CameraPreview />
        </div>
        <div className="max-lg:contents lg:relative lg:col-span-4 lg:min-h-96">
          <div className="max-lg:contents lg:absolute lg:inset-0 lg:flex lg:flex-col lg:gap-4">
            <ActiveAlarmsCard className="order-1 lg:order-none lg:max-h-[45%] lg:shrink-0" />
            <RecentEventsCard className="order-3 lg:order-none lg:flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
