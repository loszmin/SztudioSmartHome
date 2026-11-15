import { ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '@/components/Card';
import { QueryState } from '@/components/StateViews';
import { toneSoft } from '@/components/tone';
import { useSetArmingMode, useSystemStatus } from '@/hooks/useCoreData';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';
import { ARMING_MODES, ARMING_ORDER } from './arming';

/** Status uzbrojenia systemu wraz ze zmianą trybu. */
export function ArmingPanel() {
  const system = useSystemStatus();
  const setMode = useSetArmingMode();
  const hour12 = useSettingsStore((state) => state.hour12);

  return (
    <Card>
      <CardHeader title="Status uzbrojenia" icon={ShieldCheck} />
      <QueryState query={system} loadingRows={3}>
        {(status) => {
          const current = ARMING_MODES[status.alarmSystem.mode];
          return (
            <div className="p-4">
              <div className="flex items-center gap-3">
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border', toneSoft[current.tone])}>
                  <current.icon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink" data-testid="arming-state">{current.label}</p>
                  <p className="text-xs text-muted">
                    Od {formatDateTime(status.alarmSystem.changedAt, hour12)}
                    {status.alarmSystem.changedBy ? ` · ${status.alarmSystem.changedBy}` : ''}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-silver/80">{current.description}</p>

              <div role="group" aria-label="Zmiana trybu systemu" className="mt-4 grid gap-2">
                {ARMING_ORDER.map((mode) => {
                  const info = ARMING_MODES[mode];
                  const selected = mode === status.alarmSystem.mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      disabled={setMode.isPending || selected}
                      onClick={() => setMode.mutate(mode)}
                      className={cn(
                        'flex h-10 items-center gap-2.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-default',
                        selected
                          ? 'border-primary bg-primary/15 text-ink'
                          : 'border-line-strong bg-deep text-silver hover:border-primary/60 hover:text-ink disabled:opacity-50',
                      )}
                    >
                      <info.icon className={cn('h-4 w-4', selected && 'text-primary-soft')} />
                      {info.short}
                      {selected && <span className="ml-auto text-[11px] font-normal text-primary-soft">aktywny</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }}
      </QueryState>
    </Card>
  );
}
