import { Menu } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { MORE_PATH, NAV_ITEMS } from '@/app/navigation';
import { useAlarms } from '@/hooks/useCoreData';
import { cn } from '@/utils/cn';

const itemClass = (active: boolean) =>
  cn(
    'relative flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
    active ? 'text-primary-soft' : 'text-muted',
  );

/** Dolna nawigacja dla telefonów. */
export function BottomNav() {
  const { pathname } = useLocation();
  const { data: alarms } = useAlarms();
  const activeAlarms = alarms?.filter((alarm) => alarm.status === 'active').length ?? 0;
  const secondaryActive =
    pathname === MORE_PATH || NAV_ITEMS.some((item) => !item.primary && pathname.startsWith(item.path));

  return (
    <nav
      aria-label="Nawigacja mobilna"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-deep/95 backdrop-blur lg:hidden"
    >
      <div className="flex h-16">
        {NAV_ITEMS.filter((item) => item.primary).map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => itemClass(isActive)}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-0.5 w-10 rounded-b bg-primary" />}
                <span className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.path === '/alarmy' && activeAlarms > 0 && (
                    <span
                      aria-label={`Aktywne alarmy: ${activeAlarms}`}
                      className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
                    >
                      {activeAlarms}
                    </span>
                  )}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
        <NavLink to={MORE_PATH} className={itemClass(secondaryActive)}>
          {secondaryActive && <span className="absolute top-0 h-0.5 w-10 rounded-b bg-primary" />}
          <Menu className="h-5 w-5" />
          Więcej
        </NavLink>
      </div>
    </nav>
  );
}
