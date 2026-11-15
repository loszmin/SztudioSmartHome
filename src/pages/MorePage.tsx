import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NAV_ITEMS } from '@/app/navigation';
import { Logo } from '@/components/Logo';
import { CoreStatus } from '@/layouts/CoreStatus';

/** Ekran „Więcej” – pozostałe pozycje nawigacji na telefonie. */
export function MorePage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <Logo tagline className="px-1 py-2" />
      <nav aria-label="Pozostałe ekrany" className="overflow-hidden rounded-xl border border-line bg-navy">
        <ul className="divide-y divide-line">
          {NAV_ITEMS.filter((item) => !item.primary).map((item) => (
            <li key={item.path}>
              <Link to={item.path} className="flex h-14 items-center gap-3 px-4 text-sm font-medium text-ink hover:bg-raised/50">
                <item.icon className="h-5 w-5 text-primary-soft" />
                {item.label}
                <ChevronRight className="ml-auto h-4 w-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <CoreStatus />
    </div>
  );
}
