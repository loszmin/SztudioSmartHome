import { Badge } from '@/components/Status';
import type { ProtocolCheck } from '@/types/api';
import { PROTOCOL_LABELS, PROTOCOL_STATES } from './recorderMeta';

/** Wynik weryfikacji protokołów rejestratora (HTTP / RTSP / ONVIF). */
export function ProtocolChecks({ checks, detailed = false }: { checks: ProtocolCheck[]; detailed?: boolean }) {
  if (!detailed) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {checks.map((check) => (
          <Badge key={check.protocol} tone={PROTOCOL_STATES[check.state].tone} dot>
            <span title={check.detail}>
              {PROTOCOL_LABELS[check.protocol]} :{check.port} – {PROTOCOL_STATES[check.state].label}
            </span>
          </Badge>
        ))}
      </div>
    );
  }
  return (
    <ul aria-label="Sprawdzone protokoły" className="divide-y divide-line rounded-lg border border-line">
      {checks.map((check) => (
        <li key={check.protocol} className="flex items-start gap-3 px-3 py-2 text-sm">
          <span className="w-24 shrink-0 font-medium text-ink">
            {PROTOCOL_LABELS[check.protocol]} <span className="font-mono text-xs text-muted">:{check.port}</span>
          </span>
          <span className="min-w-0 flex-1 text-xs leading-relaxed text-silver">
            {check.detail}
            {check.server ? ` Serwer: ${check.server}.` : ''}
            {check.responseTimeMs !== undefined ? ` (${check.responseTimeMs} ms)` : ''}
          </span>
          <Badge tone={PROTOCOL_STATES[check.state].tone}>{PROTOCOL_STATES[check.state].label}</Badge>
        </li>
      ))}
    </ul>
  );
}
