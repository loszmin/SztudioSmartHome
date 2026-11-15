import { useState } from 'react';
import { ChevronDown, HardDrive, Info, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/Dialog';
import { EmptyState, QueryState } from '@/components/StateViews';
import { Badge, ConnectionBadge } from '@/components/Status';
import { useCoreAction, useIntegrationInfo, useRecorders } from '@/hooks/useCoreData';
import { useDataSource } from '@/hooks/useCoreQuery';
import { ChannelList } from '@/modules/recorders/ChannelList';
import { ProtocolChecks } from '@/modules/recorders/ProtocolChecks';
import { RecorderFormDialog } from '@/modules/recorders/RecorderFormDialog';
import { SERIES_LABELS } from '@/modules/recorders/recorderMeta';
import type { Recorder } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';

type DialogState = { kind: 'add' } | { kind: 'edit'; recorder: Recorder } | { kind: 'delete'; recorder: Recorder } | null;

function IntegrationNotice() {
  const info = useIntegrationInfo();
  const [open, setOpen] = useState(false);
  if (!info.data) return null;
  return (
    <Card as="div" className="border-primary/25 px-4 py-3">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-soft" />
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-silver">
          <p>
            <span className="font-semibold text-ink">Integracja BCS korzysta z protokołów standardowych (ONVIF, RTSP)</span> i nie była jeszcze
            sprawdzana z rzeczywistym rejestratorem. Funkcje wymagające API producenta nie są dostępne.
          </p>
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="mt-1 inline-flex items-center gap-1 font-medium text-primary-soft hover:text-ink">
            Co jest potrzebne do pełnej integracji
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <div>
                <p className="label-caps mb-1">Informacje o rejestratorze</p>
                <ul className="list-disc space-y-1 pl-4">
                  {info.data.requiredInformation.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <p className="label-caps mb-1">Funkcje jeszcze niedostępne</p>
                <ul className="list-disc space-y-1 pl-4">
                  {info.data.unsupportedFeatures.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function RecorderCard({ recorder, admin, onDialog }: { recorder: Recorder; admin: boolean; onDialog: (state: DialogState) => void }) {
  const [channelsOpen, setChannelsOpen] = useState(false);
  const check = useCoreAction((api, id: string) => api.checkRecorder(id), {
    invalidate: ['recorders', 'devices', 'diagnostics'],
    success: (probe) => probe.message,
    failure: 'Nie udało się sprawdzić rejestratora.',
  });
  const details: Array<[string, string]> = [
    ['Seria', SERIES_LABELS[recorder.series]],
    ['Adres', recorder.ipAddress ?? '—'],
    ['Model', recorder.model || '—'],
    ['Kanały', recorder.channels ? String(recorder.channels) : '—'],
    ['Ostatnie połączenie', formatRelative(recorder.lastSuccessAt ?? recorder.lastSeenAt)],
  ];

  return (
    <Card as="article" aria-label={recorder.name}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', recorder.status === 'online' ? 'border-line-strong bg-deep text-primary-soft' : 'border-danger/30 bg-danger/10 text-danger')}>
          <HardDrive className="h-4 w-4" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{recorder.name}</h2>
        <ConnectionBadge status={recorder.status} />
        {admin && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={RefreshCw} disabled={check.isPending} onClick={() => check.mutate(recorder.id)}>
              {check.isPending ? 'Testowanie…' : 'Testuj'}
            </Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onDialog({ kind: 'edit', recorder })}>Edytuj</Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onDialog({ kind: 'delete', recorder })}>Usuń</Button>
          </div>
        )}
      </div>
      <div className="space-y-3 px-4 py-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="inline text-muted">{label}: </dt>
              <dd className="inline text-silver">{value}</dd>
            </div>
          ))}
        </dl>
        {recorder.protocols && recorder.protocols.length > 0 ? (
          <ProtocolChecks checks={recorder.protocols} />
        ) : (
          <Badge tone="neutral">Protokoły nie były jeszcze sprawdzane</Badge>
        )}
        {recorder.errorMessage && (
          <p role="status" className="text-xs text-danger">
            {recorder.errorMessage}
            {recorder.errorCode && <span className="ml-2 font-mono text-[11px] text-muted">kod: {recorder.errorCode}</span>}
          </p>
        )}
        {admin && (
          <div>
            <button
              type="button"
              aria-expanded={channelsOpen}
              onClick={() => setChannelsOpen((value) => !value)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-soft hover:text-ink"
            >
              Kanały rejestratora
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', channelsOpen && 'rotate-180')} />
            </button>
            {channelsOpen && <div className="mt-2"><ChannelList recorder={recorder} /></div>}
          </div>
        )}
      </div>
    </Card>
  );
}

export function RecordersPage() {
  const recorders = useRecorders();
  const { mode } = useDataSource();
  const admin = mode === 'live';
  const [dialog, setDialog] = useState<DialogState>(null);
  const remove = useCoreAction((api, id: string) => api.deleteRecorder(id), {
    invalidate: ['recorders', 'devices', 'diagnostics', 'cameras'],
    success: 'Rejestrator został usunięty.',
    failure: 'Nie udało się usunąć rejestratora.',
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 p-3 sm:p-4 lg:gap-4 lg:p-6">
      {admin && (
        <>
          <div>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'add' })}>
              Dodaj rejestrator
            </Button>
          </div>
          <IntegrationNotice />
        </>
      )}

      <QueryState
        query={recorders}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={HardDrive}
            title="Brak rejestratorów"
            description={admin ? 'Dodaj rejestrator, podając jego adres IP i dane logowania, a następnie przetestuj połączenie.' : undefined}
            className="py-20"
          />
        }
        className="py-20"
      >
        {(data) => (
          <div className="grid gap-3 lg:gap-4">
            {data.map((recorder) => (
              <RecorderCard key={recorder.id} recorder={recorder} admin={admin} onDialog={setDialog} />
            ))}
          </div>
        )}
      </QueryState>

      {dialog?.kind === 'add' && <RecorderFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <RecorderFormDialog recorder={dialog.recorder} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Usunąć rejestrator?"
          message={`Rejestrator „${dialog.recorder.name}” zostanie usunięty razem z zapisanym hasłem. Kamery dodane z jego kanałów pozostaną, ale stracą źródło obrazu.`}
          confirmLabel="Usuń rejestrator"
          pending={remove.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => remove.mutate(dialog.recorder.id, { onSettled: () => setDialog(null) })}
        />
      )}
    </div>
  );
}
