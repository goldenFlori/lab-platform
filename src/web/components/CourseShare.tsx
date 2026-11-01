import { Button, Label, Switch } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import { formatMoment } from '../lib/labs';
import { courseShareQuery, shareLink, useShareChanges } from '../lib/sharing';

// Sharing the course with other institutions (#203), for staff who manage it: a link, whether the
// solutions go with it, and the institutions that copied it.

export function CourseShare({
  org,
  courseId,
  canShareSolutions,
}: {
  org: string;
  courseId: string;
  canShareSolutions: boolean;
}) {
  const t = useT();
  const query = useQuery(courseShareQuery(org, courseId));
  const changes = useShareChanges(org, courseId);
  const [solutions, setSolutions] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const share = query.data?.share ?? null;
  const copies = query.data?.copies ?? [];

  async function run(change: () => Promise<unknown>) {
    setNotice(null);
    try {
      await change();
    } catch {
      setNotice({ tone: 'danger', text: t.sharing.failed });
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ tone: 'success', text: t.sharing.linkCopied });
    } catch {
      // The field stays selectable, so the link can still be copied by hand.
    }
  }

  const solutionsSwitch = canShareSolutions && (
    <div className="grid gap-1">
      <Switch
        isSelected={share ? share.solutions : solutions}
        isDisabled={changes.set.isPending}
        onChange={(on) => (share ? void run(() => changes.set.mutateAsync(on)) : setSolutions(on))}
        aria-describedby="share-solutions-help"
        className="flex-row items-center gap-2"
      >
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>
          <Label className="text-sm font-medium">{t.sharing.solutions}</Label>
        </Switch.Content>
      </Switch>
      <span id="share-solutions-help" className="text-xs text-muted">
        {t.sharing.solutionsHelp}
      </span>
    </div>
  );

  return (
    <section aria-labelledby="course-share" className="mt-10" data-testid="course-share">
      <h2 id="course-share" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Share2 className="size-5 text-accent" aria-hidden="true" /> {t.sharing.title}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t.sharing.help}</p>
      <div className="mt-4 grid max-w-3xl gap-4 rounded-2xl border border-border bg-surface p-5">
        {share ? (
          <>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t.sharing.link}</span>
              <span className="flex flex-wrap gap-2">
                <input
                  readOnly
                  value={shareLink(share.token)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-describedby="share-link-help"
                  className="h-10 min-w-0 flex-1 basis-64 rounded-xl border border-border bg-surface px-3 font-mono text-xs"
                />
                <Button variant="secondary" onPress={() => void copyLink(shareLink(share.token))}>
                  <Copy className="size-4" /> {t.sharing.copyLink}
                </Button>
              </span>
              <span id="share-link-help" className="text-xs text-muted">
                {t.sharing.linkHelp}
              </span>
            </label>
            {solutionsSwitch}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="tertiary"
                isPending={changes.stop.isPending}
                onPress={() => void run(() => changes.stop.mutateAsync())}
              >
                {t.sharing.stop}
              </Button>
              <span className="text-xs text-muted">{t.sharing.stopHelp}</span>
            </div>
          </>
        ) : (
          <>
            {solutionsSwitch}
            <div>
              <Button
                variant="primary"
                isPending={changes.set.isPending}
                isDisabled={!query.data}
                onPress={() => void run(() => changes.set.mutateAsync(solutions))}
              >
                <Share2 className="size-4" /> {t.sharing.start}
              </Button>
            </div>
          </>
        )}
        {notice && (
          <p
            role={notice.tone === 'danger' ? 'alert' : 'status'}
            className={`text-sm ${notice.tone === 'danger' ? 'text-danger' : 'text-success'}`}
          >
            {notice.text}
          </p>
        )}
        <div className="border-t border-separator pt-4">
          <h3 className="text-sm font-medium">{t.sharing.copies}</h3>
          {copies.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t.sharing.noCopies}</p>
          ) : (
            <ul className="mt-1 grid gap-1 text-sm" data-testid="share-copies">
              {copies.map((copy) => (
                <li key={`${copy.institution}-${copy.copiedAt}`}>
                  {copy.institution} · {copy.academicYear}{' '}
                  <span className="text-muted">· {formatMoment(copy.copiedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
