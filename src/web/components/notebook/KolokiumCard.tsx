import { AlertDialog, Button } from '@heroui/react';
import { CircleCheck, Hourglass, Play, Timer } from 'lucide-react';
import { useState } from 'react';
import type { Kolokium } from '../../../shared/submissions';
import { useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { formatMoment } from '../../lib/labs';
import { clock, useNow, useStartKolokium } from '../../lib/submissions';

/**
 * A kolokium on the lab page, for its student (#169): when it opens, the button that starts their
 * clock, the time left while it runs, and how it ended. The notebook opens to them once they start;
 * handing in stays in the notebook's submission bar.
 */
export function KolokiumCard({
  kolokium,
  org,
  courseId,
  labId,
  onNotebook,
  current,
}: {
  kolokium: Kolokium;
  org: string;
  courseId: string;
  labId: string;
  /** Shows the kolokium's notebook. */
  onNotebook: () => void;
  /** Whether the page shows its notebook now. */
  current: boolean;
}) {
  const t = useT();
  const start = useStartKolokium(org, courseId, labId);
  const [error, setError] = useState<string | null>(null);
  const opens = Date.parse(kolokium.opensAt);
  const due = Date.parse(kolokium.dueAt);
  const ends = kolokium.endsAt ? Date.parse(kolokium.endsAt) : null;
  // The clock ticks while something on the card can still change on its own.
  const now = useNow(!kolokium.submittedAt && (ends ?? due) > Date.now());

  async function begin() {
    setError(null);
    try {
      await start.mutateAsync(kolokium.notebookId);
      onNotebook();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t.kolokium.notOpen : t.kolokium.startFailed);
    }
  }

  const running = ends !== null && now < ends && !kolokium.submittedAt;
  const ready = !kolokium.startedAt && opens <= now && now < due;
  let line: string;
  if (kolokium.submittedAt) line = t.kolokium.handedIn(formatMoment(kolokium.submittedAt));
  else if (running) line = t.kolokium.left(clock((ends as number) - now));
  else if (kolokium.startedAt) line = t.kolokium.timeUp;
  else if (now < opens) line = t.kolokium.upcoming(formatMoment(kolokium.opensAt), kolokium.minutes);
  else if (ready) line = t.kolokium.ready(kolokium.minutes, formatMoment(kolokium.dueAt));
  else line = t.kolokium.missed(formatMoment(kolokium.dueAt));
  const Icon = kolokium.submittedAt ? CircleCheck : running ? Timer : Hourglass;

  return (
    <section
      aria-label={`${t.kolokium.title}: ${kolokium.title}`}
      data-testid="kolokium"
      className={`mt-6 rounded-2xl border px-4 py-3 ${running ? 'border-accent bg-accent-soft' : 'border-border bg-surface'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t.kolokium.title}</p>
          <p className="truncate font-semibold">{kolokium.title}</p>
          <p
            className={`mt-0.5 flex items-center gap-1.5 text-sm ${running ? 'font-mono font-semibold text-accent' : 'text-muted'}`}
            // Read out when it changes state, not every second.
            aria-live={running ? 'off' : 'polite'}
            data-testid="kolokium-status"
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" /> {line}
          </p>
        </div>
        {ready && (
          <AlertDialog>
            <Button size="sm" variant="primary" isPending={start.isPending}>
              <Play className="size-4" /> {t.kolokium.start}
            </Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog>
                  <AlertDialog.Header>
                    <AlertDialog.Icon status="accent" />
                    <AlertDialog.Heading>{t.kolokium.confirmTitle}</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body>{t.kolokium.confirmText(kolokium.minutes)}</AlertDialog.Body>
                  <AlertDialog.Footer>
                    <Button slot="close" variant="tertiary">
                      {t.common.cancel}
                    </Button>
                    <Button slot="close" variant="primary" onPress={() => void begin()}>
                      {t.kolokium.start}
                    </Button>
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        )}
        {running && !current && (
          <Button size="sm" variant="primary" onPress={onNotebook}>
            {t.kolokium.goTo}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
