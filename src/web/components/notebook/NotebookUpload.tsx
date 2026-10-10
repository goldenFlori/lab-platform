import { Alert, Button, ProgressBar } from '@heroui/react';
import { FileUp } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { NotebookDetail, NotebookKind } from '../../../shared/notebooks';
import { ApiError } from '../../lib/api';
import { UploadError, type UploadProgress, uploadNotebook } from '../../lib/upload-notebook';

const KIND_LABEL: Record<NotebookKind, string> = {
  main: 'Fletorja e laboratorit',
  extra: 'Material plotësues',
  solution: 'Zgjidhje',
};

function message(error: unknown) {
  if (error instanceof UploadError) return error.message;
  if (error instanceof ApiError) {
    if (error.code === 'network') return 'Lidhja u ndërpre. Provoni sërish.';
    if (error.status === 403) return 'Nuk keni të drejtë të ngarkoni fletore në këtë laborator.';
    if (error.status === 413) return 'Një nga skedarët e fletores është shumë i madh.';
  }
  return 'Ngarkimi dështoi. Provoni sërish; fletorja e papërfunduar mund të fshihet.';
}

function progressLabel(progress: UploadProgress) {
  if (progress.phase === 'converting') return 'Duke përgatitur fletoren…';
  if (progress.phase === 'uploading') return `Duke ngarkuar skedarët… ${progress.done} nga ${progress.total}`;
  return 'Duke përfunduar…';
}

/** Staff: pick an .ipynb, convert it in this browser and upload it into the lab. */
export function NotebookUpload({
  base,
  hasMain,
  onUploaded,
}: {
  base: string;
  hasMain: boolean;
  onUploaded: (notebook: NotebookDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" onPress={() => setOpen(true)}>
        <FileUp className="size-4" /> Ngarko fletore
      </Button>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) return;
    setError(null);
    try {
      const notebook = await uploadNotebook(
        base,
        file,
        { kind: String(data.get('kind')) as NotebookKind, title: String(data.get('title') ?? '') },
        setProgress,
      );
      setOpen(false);
      onUploaded(notebook);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setProgress(null);
    }
  }

  const field = 'h-10 rounded-xl border border-border bg-surface px-3';
  const busy = progress !== null;
  return (
    <form
      onSubmit={submit}
      aria-label="Ngarko fletore"
      className="grid w-full gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2"
    >
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Fletorja (.ipynb)</span>
        <input
          name="file"
          type="file"
          accept=".ipynb,application/x-ipynb+json"
          required
          disabled={busy}
          className="rounded-xl border border-border bg-surface p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Lloji</span>
        <select name="kind" defaultValue={hasMain ? 'extra' : 'main'} disabled={busy} className={field}>
          {(Object.keys(KIND_LABEL) as NotebookKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Titulli (s'është i detyrueshëm)</span>
        <input name="title" maxLength={160} placeholder="Merret nga fletorja" disabled={busy} className={field} />
      </label>
      <p className="text-xs text-muted sm:col-span-2">
        Fletorja përgatitet në këtë shfletues dhe studentët e shohin vetëm kur laboratori është i hapur. Një zgjidhje
        shfaqet vetëm pas datës së zgjidhjeve.
      </p>
      {progress && (
        <div className="sm:col-span-2">
          <ProgressBar
            aria-label={progressLabel(progress)}
            value={progress.phase === 'uploading' ? progress.done : progress.phase === 'finishing' ? 1 : 0}
            maxValue={progress.phase === 'uploading' ? progress.total : 1}
          />
          <p className="mt-2 text-sm text-muted" aria-live="polite">
            {progressLabel(progress)}
          </p>
        </div>
      )}
      {error && (
        <Alert status="danger" className="sm:col-span-2">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" size="sm" isPending={busy}>
          Ngarko
        </Button>
        <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => setOpen(false)}>
          Anulo
        </Button>
      </div>
    </form>
  );
}
