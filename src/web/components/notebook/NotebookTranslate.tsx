import { Alert, Button } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Languages, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import { LOCALES, type Locale } from '../../../shared/locale';
import { ORIGINAL_FILE } from '../../../shared/notebook-files';
import type { NotebookDetail, NotebookSummary } from '../../../shared/notebooks';
import { LANGUAGE_NAMES, useT } from '../../i18n';
import { aiErrorText, aiPath, aiStatusQuery, streamAi } from '../../lib/ai';
import { api } from '../../lib/api';
import { revealSoon, useLabTool } from '../../lib/lab-tools';
import { batches, partsOf, type Segment, segmentsOf, translated } from '../../lib/translate';
import { uploadNotebook } from '../../lib/upload-notebook';

// The copilot translates a notebook (#88): its text cells and code comments, part by part, within
// the daily quota. Staff review each part beside the original and save the copy as a new notebook
// of the lab, with the original's visualizations and exercises. Code and outputs do not change.

type Phase = { at: 'idle' } | { at: 'translating'; done: number; of: number } | { at: 'review' } | { at: 'saving' };

type Ipynb = Parameters<typeof segmentsOf>[0];

export function NotebookTranslate({
  org,
  courseId,
  base,
  notebook,
  onSaved,
  withButton = true,
}: {
  org: string;
  courseId: string;
  base: string;
  notebook: NotebookSummary;
  onSaved: (nb: NotebookDetail) => unknown;
  /** Without its own button it opens from the lab's menus (#130). */
  withButton?: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const status = useQuery(aiStatusQuery(org, courseId));
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<Locale>('en');
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [source, setSource] = useState<{ ipynb: Ipynb; segments: Segment[] } | null>(null);
  const [texts, setTexts] = useState<string[]>([]);
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useLabTool('translate', () => {
    setOpen(true);
    revealSoon('[data-testid="translate"]');
  });

  if (!open) {
    return withButton ? (
      <Button variant="secondary" onPress={() => setOpen(true)}>
        <Languages className="size-4" /> {t.translate.open}
      </Button>
    ) : null;
  }

  const close = () => {
    abort.current?.abort();
    setOpen(false);
    setPhase({ at: 'idle' });
    setSource(null);
    setError(null);
  };

  async function start() {
    setError(null);
    let ipynb: Ipynb;
    try {
      // Its version in the address, so the browser never hands back an older one (#208).
      const res = await fetch(
        `/api${base}/${encodeURIComponent(notebook.id)}/files/${ORIGINAL_FILE}?v=${notebook.version}`,
        {
          credentials: 'same-origin',
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      ipynb = (await res.json()) as Ipynb;
    } catch {
      return setError(t.translate.loadFailed);
    }
    const segments = segmentsOf(ipynb);
    const groups = batches(segments);
    const result = segments.map((s) => s.text);
    const left = new Set(segments.map((_, i) => i));
    setSource({ ipynb, segments });
    setTitle(`${notebook.title} (${LANGUAGE_NAMES[to]})`.slice(0, 160));
    abort.current = new AbortController();
    try {
      for (const [n, group] of groups.entries()) {
        setPhase({ at: 'translating', done: n, of: groups.length });
        const answer = await streamAi(
          `${aiPath(org, courseId)}/translate`,
          { to, parts: group.map((i) => segments[i]?.text ?? '') },
          () => {},
          abort.current.signal,
        );
        const parts = partsOf(answer);
        group.forEach((i, k) => {
          const text = parts.get(k + 1);
          if (!text) return;
          result[i] = text;
          left.delete(i);
        });
      }
    } catch (reason) {
      // What was translated stays; the rest keeps the original text, marked for the review.
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(aiErrorText(t, reason));
    } finally {
      void queryClient.invalidateQueries({ queryKey: aiStatusQuery(org, courseId).queryKey });
    }
    setTexts(result);
    setMissing(left);
    setPhase({ at: 'review' });
  }

  async function save() {
    if (!source) return;
    setPhase({ at: 'saving' });
    setError(null);
    try {
      const name = notebook.originalName.replace(/\.ipynb$/i, '');
      const file = new File([translated(source.ipynb, source.segments, texts)], `${name}-${to}.ipynb`, {
        type: 'application/x-ipynb+json',
      });
      // A translated solution stays a solution; anything else joins the lab as an extra notebook.
      const kind = notebook.kind === 'solution' ? 'solution' : 'extra';
      const copy = await uploadNotebook(base, file, { kind, title: title.trim() || notebook.title }, () => {});
      const original = await api<NotebookDetail>(`${base}/${encodeURIComponent(notebook.id)}`);
      const path = `${base}/${encodeURIComponent(copy.id)}`;
      let detail = copy;
      if (original.embeds.length)
        detail = await api<NotebookDetail>(`${path}/embeds`, { method: 'PUT', body: { embeds: original.embeds } });
      if (original.exercises.length) {
        detail = await api<NotebookDetail>(`${path}/exercises`, {
          method: 'PUT',
          body: { exercises: original.exercises },
        });
      }
      close();
      await onSaved(detail);
    } catch {
      setPhase({ at: 'review' });
      setError(t.translate.saveFailed);
    }
  }

  const field = 'w-full min-w-0 rounded-xl border border-border bg-surface px-3';
  const segments = source?.segments ?? [];
  const text = segments.flatMap((s, i) => (s.line === null ? [i] : []));
  const comments = segments.flatMap((s, i) => (s.line === null ? [] : [i]));
  const row = (i: number) => (
    <li key={i} className="grid gap-2 sm:grid-cols-2" data-testid="translate-part">
      <pre className="max-h-48 overflow-auto rounded-xl bg-surface-secondary p-2 text-[0.8rem] whitespace-pre-wrap text-muted">
        {segments[i]?.text}
      </pre>
      <div className="grid gap-1">
        <textarea
          value={texts[i] ?? ''}
          rows={Math.min(8, Math.max(2, (texts[i] ?? '').split('\n').length))}
          aria-label={t.translate.partLabel(i + 1)}
          onChange={(e) => setTexts((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
          className={`${field} py-2 text-[0.85rem]`}
        />
        {missing.has(i) && <span className="text-xs text-warning">{t.translate.notTranslated}</span>}
      </div>
    </li>
  );

  return (
    <section
      aria-label={t.translate.title}
      className="grid w-full gap-3 rounded-2xl border border-border bg-surface p-4"
      data-testid="translate"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Languages className="size-4 text-accent" aria-hidden="true" /> {t.translate.titleOf(notebook.title)}
      </p>
      {!status.data?.enabled ? (
        <p className="text-sm text-muted">{t.translate.needsAi}</p>
      ) : phase.at === 'idle' ? (
        <>
          <p className="text-sm text-muted">{t.translate.help}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t.translate.to}</span>
              <select value={to} onChange={(e) => setTo(e.target.value as Locale)} className={`${field} h-10`}>
                {LOCALES.map((code) => (
                  <option key={code} value={code} lang={code}>
                    {LANGUAGE_NAMES[code]}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="primary" onPress={start} isDisabled={status.data.left === 0}>
              {t.translate.start}
            </Button>
          </div>
          <p className="text-xs text-muted">{t.translate.left(status.data.left)}</p>
        </>
      ) : phase.at === 'translating' ? (
        <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          <p className="text-sm">{t.translate.progress(phase.done + 1, phase.of)}</p>
          <Button size="sm" variant="secondary" onPress={() => abort.current?.abort()}>
            <Square className="size-4" /> {t.variant.stop}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">{t.translate.review(missing.size)}</p>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.translate.newTitle}</span>
            <input
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              className={`${field} h-10`}
            />
          </label>
          <ul className="grid gap-3">{text.map(row)}</ul>
          {comments.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">{t.translate.comments(comments.length)}</summary>
              <ul className="mt-3 grid gap-3">{comments.map(row)}</ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onPress={save} isPending={phase.at === 'saving'}>
              {t.translate.save}
            </Button>
          </div>
        </>
      )}
      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div>
        <Button size="sm" variant="ghost" onPress={close}>
          {t.common.close}
        </Button>
      </div>
    </section>
  );
}
