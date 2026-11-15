import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '@/app/navigation';
import { Logo } from '@/components/Logo';
import { useAlarms } from '@/hooks/useCoreData';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/utils/cn';
import { CoreStatus } from './CoreStatus';

/** Lewy panel nawigacyjny (desktop / PWA na Windows). */
export function Sidebar() {
  const collapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const update = useSettingsStore((state) => state.update);
  const { data: alarms } = useAlarms();
  const activeAlarms = alarms?.filter((alarm) => alarm.status === 'active').length ?? 0;
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-line bg-deep lg:flex',
        collapsed ? 'w-[68px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center border-b border-line', collapsed ? 'justify-center' : 'px-5')}>
        <Logo compact={collapsed} />
      </div>

      <nav aria-label="Nawigacja główna" className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center' : 'px-3',
                isActive
                  ? 'bg-primary/12 text-ink shadow-[inset_0_0_0_1px_rgb(37_137_232/0.3)]'
                  : 'text-silver/80 hover:bg-raised/70 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-3 top-2 h-6 w-[3px] rounded-r bg-primary" />}
                <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary-soft')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {item.path === '/alarmy' && activeAlarms > 0 && (
                  <span
                    aria-label={`Aktywne alarmy: ${activeAlarms}`}
                    className={cn(
                      'tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white',
                      collapsed ? 'absolute right-1.5 top-0.5 h-4 min-w-4 px-1 text-[10px]' : 'ml-auto',
                    )}
                  >
                    {activeAlarms}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-line p-3">
        <CoreStatus compact={collapsed} />
        <button
          type="button"
          onClick={() => update({ sidebarCollapsed: !collapsed })}
          aria-label={collapsed ? 'Rozwiń panel boczny' : 'Zwiń panel boczny'}
          title={collapsed ? 'Rozwiń panel boczny' : 'Zwiń panel boczny'}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-lg text-xs text-muted hover:bg-raised/70 hover:text-ink',
            collapsed ? 'justify-center' : 'px-3',
          )}
        >
          <ToggleIcon className="h-4 w-4" />
          {!collapsed && 'Zwiń panel'}
        </button>
      </div>
    </aside>
  );
}
