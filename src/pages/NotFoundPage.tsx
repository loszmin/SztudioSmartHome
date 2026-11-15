import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/StateViews';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Nie znaleziono strony"
      description="Podany adres nie istnieje w panelu Sztudio Smart Home."
      className="py-24"
      action={
        <Link to="/" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-soft">
          Wróć na Start
        </Link>
      }
    />
  );
}
