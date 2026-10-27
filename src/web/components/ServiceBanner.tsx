import { CloudOff } from 'lucide-react';
import { useT } from '../i18n';
import { formatTime } from '../lib/labs';
import { nextReset, useService } from '../lib/service';

/**
 * One line under the header while the platform cannot be reached (#178): no connection, or the free
 * plan's limits used up for today. Work is kept on the device meanwhile and saved by itself after.
 */
export function ServiceBanner() {
  const t = useT();
  const service = useService();
  if (service === 'ok') return null;
  return (
    <div role="status" className="border-b border-warning/40 bg-warning/10 print:hidden" data-testid="service-banner">
      <p className="container-page flex items-start gap-2 py-2.5 text-sm">
        <CloudOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        {service === 'offline' ? t.service.offline : t.service.limit(formatTime(nextReset().toISOString()))}
      </p>
    </div>
  );
}
