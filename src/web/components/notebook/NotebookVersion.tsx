import { Alert, Button, ProgressBar } from '@heroui/react';
import { FileDiff } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { NotebookDetail } from '../../../shared/notebooks';
import { type Messages, useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { revealSoon, useLabTool } from '../../lib/lab-tools';
import {
  planVersion,
  publishVersion,
  UploadError,
  type UploadProgress,
  type VersionPlan,
} from '../../lib/upload-notebook';

// A new version in place of a notebook (#208), for staff who manage the lab: they pick the corrected
// .ipynb, see how its cells match the one in place and what a cell that is gone would take with it,
// and only then put it in place. Students keep their work, moved with its cell.

function message(t: Messages, error: unknown) {
  if (error instanceof UploadError) return error.message;
  if (error instanceof ApiError && error.code === 'network') return t.upload.network;
  if (error instanceof ApiError && error.status === 413) return t.upload.tooLarge;
  return t.notebookVersion.failed;
}

/** A cell named by its kind and first line, as staff wrote it. */
function cellName(t: Messages, cell: { type: string; source: string } | undefined) {
  const line = cell?.source.split('\n').find((l) => l.trim()) ?? '';
  const shown = line.length > 60 ? `${line.slice(0, 60)}…` : line;
  return `${cell?.type === 'code' ? t.notebookVersion.code : t.notebookVersion.text}: «${shown}»`;
}

export function NotebookVersion({
  base,
  notebook,
  onDone,
}: {
  base: string;
  notebook: NotebookDetail;
  onDone: (notebook: NotebookDetail) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<VersionPlan | null>(null);
  const [comparing, setComparing] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  useLabTool('version', () => {
    setOpen(true);
    revealSoon('[data-testid="notebook-version"]');
  });
  if (!open) return null;

  const close = () => {
    setOpen(false);
    setPlan(null);
    setError(null);
  };

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('file');
    if (!(file instanceof File) || file.size === 0) return;
    setError(null);
    setPlan(null);
    setComparing(true);
    try {
      setPlan(await planVersion(base, notebook, file));
    } catch (failure) {
      setError(message(t, failure));
    } finally {
      setComparing(false);
    }
  }

  async function publish() {
    if (!plan) return;
    setError(null);
    try {
      const updated = await publishVersion(base, notebook, plan, setProgress);
      close();
      onDone(updated);
    } catch (failure) {
      setError(message(t, failure));
    } finally {
      setProgress(null);
    }
  }

  const students = (cell: number) => plan?.work.find((w) => w.cell === cell)?.students ?? 0;
  // What a cell with no place in the new version holds, and so loses.
  const lost = (plan?.match.removed ?? [])
    .map((cell) => ({
      cell,
      students: students(cell),
      embed: notebook.embeds.find((e) => e.cell === cell),
      exercise: notebook.exercises.find((x) => x.cell === cell),
    }))
    .filter((c) => c.students > 0 || c.embed || c.exercise);
  const changedWithWork = (plan?.match.changed ?? []).filter(([cell]) => students(cell) > 0).length;
  const unchanged = plan && plan.match.changed.length + plan.match.added.length + plan.match.removed.length === 0;
  const busy = comparing || progress !== null;

  return (
    <section
      aria-labelledby="notebook-version"
      data-testid="notebook-version"
      className="grid w-full gap-3 rounded-2xl border border-border bg-surface p-4"
    >
      <h2 id="notebook-version" className="flex items-center gap-2 font-semibold">
        <FileDiff className="size-4 text-accent" aria-hidden="true" /> {t.notebookVersion.title(notebook.title)}
      </h2>
      <p className="text-sm text-muted">{t.notebookVersion.help}</p>
      <form onSubmit={(e) => void compare(e)} className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 basis-64 gap-1 text-sm">
          <span className="font-medium">{t.upload.file}</span>
          <input
            name="file"
            type="file"
            accept=".ipynb,application/x-ipynb+json"
            required
            disabled={busy}
            onChange={() => setPlan(null)}
            className="rounded-xl border border-border bg-surface p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
          />
        </label>
        <Button type="submit" variant="secondary" size="sm" isPending={comparing} isDisabled={progress !== null}>
          {t.notebookVersion.compare}
        </Button>
      </form>
      {comparing && (
        <p className="text-sm text-muted" aria-live="polite">
          {t.notebookVersion.comparing}
        </p>
      )}

      {plan && (
        <div className="grid gap-3 border-t border-separator pt-3" data-testid="version-plan">
          <p className="text-sm" role="status">
            {unchanged
              ? t.notebookVersion.same
              : t.notebookVersion.summary(
                  plan.match.same,
                  plan.match.changed.length,
                  plan.match.added.length,
                  plan.match.removed.length,
                )}
          </p>
          {lost.length > 0 && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{t.notebookVersion.lost}</Alert.Title>
                <Alert.Description>
                  <ul className="mt-1 grid gap-1">
                    {lost.map((c) => (
                      <li key={c.cell}>
                        {cellName(t, plan.before[c.cell])}:{' '}
                        {[
                          c.students > 0 ? t.notebookVersion.students(c.students) : null,
                          c.embed ? t.notebookVersion.embed(c.embed.title ?? c.embed.viz) : null,
                          c.exercise ? t.notebookVersion.exercise(c.exercise.title) : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </li>
                    ))}
                  </ul>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {changedWithWork > 0 && <p className="text-sm text-muted">{t.notebookVersion.kept(changedWithWork)}</p>}
          <p className="text-xs text-muted">{t.notebookVersion.handedIn}</p>
        </div>
      )}

      {progress && (
        <div>
          <ProgressBar
            aria-label={t.notebookVersion.publishing}
            value={progress.phase === 'uploading' ? progress.done : 1}
            maxValue={progress.phase === 'uploading' ? progress.total : 1}
          />
          <p className="mt-2 text-sm text-muted" aria-live="polite">
            {t.notebookVersion.publishing}
          </p>
        </div>
      )}
      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {plan && !unchanged && (
          <Button
            variant={lost.length > 0 ? 'danger' : 'primary'}
            size="sm"
            isPending={progress !== null}
            onPress={() => void publish()}
          >
            {t.notebookVersion.publish}
          </Button>
        )}
        <Button variant="ghost" size="sm" isDisabled={busy} onPress={close}>
          {t.common.cancel}
        </Button>
      </div>
    </section>
  );
}
