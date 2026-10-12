import { Button } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AiMode } from '../../../shared/exercise-limits';
import { useT } from '../../i18n';
import { aiErrorText, aiStatusQuery, streamAi } from '../../lib/ai';
import { type NotebookRef, notebooksPath } from '../../lib/notebooks';

// "Explain my error" (#86): under a failed run or check, in courses with AI on. The answer is
// written in as it arrives; hints only unless staff chose otherwise for the exercise. Students are
// told that the course's staff can read the question.

export type ExplainTarget = { notebookRef: NotebookRef; cell: number; code: string; context: string; mode: AiMode };

export function ExplainError({ target, error }: { target: ExplainTarget; error: string }) {
  const t = useT();
  const { notebookRef: ref } = target;
  const queryClient = useQueryClient();
  const status = useQuery(aiStatusQuery(ref.org, ref.courseId));
  const [answer, setAnswer] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  if (!status.data?.enabled || target.mode === 'off') return null;

  async function ask() {
    asked.current = true;
    setBusy(true);
    setFailure(null);
    setAnswer('');
    const path = `${notebooksPath(ref.org, ref.courseId, ref.labId)}/${encodeURIComponent(ref.notebookId)}/explain`;
    try {
      await streamAi(path, { cell: target.cell, code: target.code, error, context: target.context }, setAnswer);
    } catch (reason) {
      setAnswer(null);
      setFailure(aiErrorText(t, reason));
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: aiStatusQuery(ref.org, ref.courseId).queryKey });
    }
  }

  return (
    <div className="mt-2" data-testid="explain">
      {answer === null ? (
        <Button size="sm" variant="secondary" onPress={ask} isDisabled={status.data.left === 0}>
          <Lightbulb className="size-4" /> {t.explain.ask}
        </Button>
      ) : (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/30 p-3" aria-live="polite" aria-busy={busy}>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <Lightbulb className="size-3.5" aria-hidden="true" /> {t.explain.title}
          </p>
          <p className="run-text mt-1 text-sm whitespace-pre-wrap" data-testid="explain-answer">
            {answer || t.explain.thinking}
          </p>
        </div>
      )}
      {failure && <p className="mt-1 text-sm text-danger">{failure}</p>}
      <p className="mt-1 text-xs text-muted">
        {status.data.left === 0 && !asked.current ? t.ai.limitUser : t.explain.footer(status.data.left)}
      </p>
    </div>
  );
}
