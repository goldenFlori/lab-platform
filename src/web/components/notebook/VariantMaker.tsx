import { Alert, Button } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, RefreshCw, Sparkles, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import type { StoredNotebook } from '../../../notebook/stored';
import type { VariantInput } from '../../../shared/ai';
import { VARIANT_SECTIONS } from '../../../shared/ai-sections';
import { MAX_TEST } from '../../../shared/exercise-limits';
import type { Exercise } from '../../../shared/exercises';
import type { NotebookDetail } from '../../../shared/notebooks';
import { useT } from '../../i18n';
import { aiErrorText, aiPath, aiStatusQuery, streamAi } from '../../lib/ai';
import { api } from '../../lib/api';
import { uploadNotebook } from '../../lib/upload-notebook';
import {
  checkVariant,
  parseVariant,
  sectionsWritten,
  VARIANT_CELL,
  type Variant,
  type VariantCheck,
  variantNotebooks,
} from '../../lib/variant';

// The copilot makes a variant of an exercise (#85): the same concept with new data. Staff review
// it, their browser runs its tests against the reference solution and the starter code, and only a
// variant whose solution passes (and whose starter does not) is saved: as a new notebook in the lab,
// with its exercise, and a staff-only solution notebook.

export type VariantTarget = { org: string; courseId: string; base: string; onSaved: (nb: NotebookDetail) => unknown };

type Phase =
  | { at: 'idle' }
  | { at: 'writing'; sections: number }
  | { at: 'review'; checking: boolean; check: VariantCheck | null }
  | { at: 'saving' };

/** The text just above an exercise's cell (its statement), and its code, as the copilot reads them. */
function exerciseContext(notebook: StoredNotebook, exercise: Exercise): VariantInput | null {
  const index = notebook.cells.findIndex((c) => c.type === 'code' && c.srcIndex === exercise.cell);
  const cell = notebook.cells[index];
  if (cell?.type !== 'code') return null;
  const statement = notebook.cells
    .slice(Math.max(0, index - 2), index)
    .flatMap((c) =>
      c.type === 'markdown' ? [new DOMParser().parseFromString(c.html, 'text/html').body.textContent ?? ''] : [],
    )
    .join('\n\n')
    .trim();
  return {
    title: exercise.title,
    statement: statement.slice(0, 4000),
    code: cell.raw.slice(0, 8000),
    test: exercise.test,
  };
}

export function VariantMaker({
  notebook,
  exercises,
  target,
}: {
  notebook: StoredNotebook;
  exercises: Exercise[];
  target: VariantTarget;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const status = useQuery(aiStatusQuery(target.org, target.courseId));
  const [cell, setCell] = useState(String(exercises[0]?.cell ?? ''));
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [variant, setVariant] = useState<Variant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  if (!status.data || exercises.length === 0) return null;
  if (!status.data.enabled) return <p className="mt-4 text-xs text-muted">{t.variant.needsAi}</p>;

  async function check(next: Variant) {
    setPhase({ at: 'review', checking: true, check: null });
    try {
      setPhase({ at: 'review', checking: false, check: await checkVariant(next) });
    } catch {
      setPhase({ at: 'review', checking: false, check: null });
      setError(t.variant.checkFailed);
    }
  }

  async function write() {
    const exercise = exercises.find((e) => String(e.cell) === cell);
    const context = exercise && exerciseContext(notebook, exercise);
    if (!context) return;
    setError(null);
    setVariant(null);
    setPhase({ at: 'writing', sections: 0 });
    abort.current = new AbortController();
    try {
      const text = await streamAi(
        `${aiPath(target.org, target.courseId)}/variant`,
        context,
        (so) => setPhase({ at: 'writing', sections: sectionsWritten(so) }),
        abort.current.signal,
      );
      const parsed = parseVariant(text);
      if (!parsed) {
        setPhase({ at: 'idle' });
        setError(t.variant.incomplete);
        return;
      }
      setVariant(parsed);
      await check(parsed);
    } catch (failure) {
      setPhase({ at: 'idle' });
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(aiErrorText(t, failure));
    } finally {
      void queryClient.invalidateQueries({ queryKey: aiStatusQuery(target.org, target.courseId).queryKey });
    }
  }

  async function save(ready: Variant) {
    setPhase({ at: 'saving' });
    setError(null);
    try {
      const files = variantNotebooks(ready);
      const nb = await uploadNotebook(target.base, files.exercise, { kind: 'extra', title: ready.title }, () => {});
      const detail = await api<NotebookDetail>(`${target.base}/${encodeURIComponent(nb.id)}/exercises`, {
        method: 'PUT',
        body: { exercises: [{ cell: VARIANT_CELL, title: ready.title, test: ready.tests }] },
      });
      await uploadNotebook(target.base, files.solution, { kind: 'solution', title: ready.title }, () => {});
      setVariant(null);
      setPhase({ at: 'idle' });
      await target.onSaved(detail);
    } catch {
      setPhase({ at: 'review', checking: false, check: null });
      setError(t.variant.saveFailed);
    }
  }

  const edit = (field: keyof Variant, value: string) => {
    if (!variant) return;
    setVariant({ ...variant, [field]: value });
    // Changed after the check: it must run again before saving.
    setPhase({ at: 'review', checking: false, check: null });
  };

  const field = 'w-full min-w-0 rounded-xl border border-border bg-surface px-3';
  const busy = phase.at === 'writing' || phase.at === 'saving';
  const verdict = phase.at === 'review' ? phase.check : null;
  const canSave = verdict?.solution.status === 'pass' && verdict.starter.status !== 'pass';

  return (
    <section aria-label={t.variant.title} className="mt-4 rounded-xl bg-surface-secondary p-3" data-testid="variant">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-accent" aria-hidden="true" /> {t.variant.title}
      </h3>
      <p className="mt-1 text-xs text-muted">{t.variant.help}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          <span className="font-medium">{t.variant.of}</span>
          <select value={cell} disabled={busy} onChange={(e) => setCell(e.target.value)} className={`${field} h-10`}>
            {exercises.map((e) => (
              <option key={e.cell} value={e.cell}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        {phase.at === 'writing' ? (
          <Button size="sm" variant="secondary" onPress={() => abort.current?.abort()}>
            <Square className="size-4" /> {t.variant.stop}
          </Button>
        ) : (
          <Button size="sm" variant="primary" isDisabled={busy || status.data.left === 0} onPress={write}>
            {variant ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
            {variant ? t.variant.another : t.variant.make}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {phase.at === 'writing'
          ? t.variant.writing(phase.sections, VARIANT_SECTIONS.length)
          : t.variant.left(status.data.left)}
      </p>

      {variant && phase.at !== 'writing' && (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.variant.fields.title}</span>
            <input
              value={variant.title}
              maxLength={160}
              disabled={busy}
              onChange={(e) => edit('title', e.target.value)}
              className={`${field} h-10`}
            />
          </label>
          <VariantText
            label={t.variant.fields.statement}
            value={variant.statement}
            rows={4}
            disabled={busy}
            onChange={(v) => edit('statement', v)}
          />
          <VariantText
            label={t.variant.fields.starter}
            value={variant.starter}
            code
            disabled={busy}
            onChange={(v) => edit('starter', v)}
          />
          <VariantText
            label={t.variant.fields.solution}
            value={variant.solution}
            code
            disabled={busy}
            onChange={(v) => edit('solution', v)}
          />
          <VariantText
            label={t.variant.fields.tests}
            value={variant.tests}
            code
            disabled={busy}
            onChange={(v) => edit('tests', v)}
          />

          <div className="grid gap-1.5 text-sm" aria-live="polite" data-testid="variant-check">
            {phase.at === 'review' && phase.checking && <p className="text-muted">{t.variant.checking}</p>}
            {verdict && (
              <>
                <CheckLine
                  ok={verdict.solution.status === 'pass'}
                  text={
                    verdict.solution.status === 'pass'
                      ? t.variant.solutionPasses
                      : t.variant.solutionFails(verdict.solution.message)
                  }
                />
                <CheckLine
                  ok={verdict.starter.status !== 'pass'}
                  text={verdict.starter.status !== 'pass' ? t.variant.starterFails : t.variant.starterPasses}
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy || (phase.at === 'review' && phase.checking)}
              onPress={() => check(variant)}
            >
              {t.variant.recheck}
            </Button>
            <Button
              size="sm"
              variant="primary"
              isDisabled={!canSave}
              isPending={phase.at === 'saving'}
              onPress={() => save(variant)}
            >
              {t.variant.save}
            </Button>
          </div>
          <p className="text-xs text-muted">{t.variant.saveHelp}</p>
        </div>
      )}

      {error && (
        <Alert status="danger" className="mt-3">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </section>
  );
}

function VariantText({
  label,
  value,
  code = false,
  rows = 6,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  code?: boolean;
  rows?: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        value={value}
        rows={rows}
        maxLength={MAX_TEST}
        spellCheck={!code}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 ${code ? 'font-mono text-[0.85rem]' : ''}`}
      />
    </label>
  );
}

function CheckLine({ ok, text }: { ok: boolean; text: string }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <p className={`flex items-start gap-2 ${ok ? 'text-success' : 'text-danger'}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}
