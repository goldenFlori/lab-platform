import { AlertDialog, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CircleCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { useCodeEdits } from '../../lib/code-edits';
import { formatMoment } from '../../lib/labs';
import type { NotebookRef } from '../../lib/notebooks';
import { mySubmissionQuery, useSubmit } from '../../lib/submissions';

/**
 * Above the notebook, for a student whose group has it open for submission (#52): the deadline,
 * what they handed in, and handing in, after their last changes are saved.
 */
export function SubmissionBar({ notebookRef }: { notebookRef: NotebookRef }) {
  const t = useT();
  const edits = useCodeEdits();
  const query = useQuery(mySubmissionQuery(notebookRef));
  const submit = useSubmit(notebookRef);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const data = query.data;
  if (!data || (!data.dueAt && !data.submission)) return null;

  async function handIn() {
    setMessage(null);
    if (edits && (edits.saving === 'failed' || !(await edits.flush()))) {
      return setMessage({ tone: 'danger', text: t.submissions.unsaved });
    }
    try {
      await submit.mutateAsync();
      setMessage({ tone: 'success', text: t.submissions.done });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) void query.refetch();
      const closed = error instanceof ApiError && error.status === 409;
      setMessage({ tone: 'danger', text: closed ? t.submissions.closedError : t.submissions.failed });
    }
  }

  const { submission } = data;
  return (
    <section
      aria-label={t.submissions.title}
      data-testid="submission"
      className="mb-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            <CalendarClock className="size-4 shrink-0 text-accent" aria-hidden="true" />
            {data.dueAt
              ? data.open
                ? t.submissions.due(formatMoment(data.dueAt))
                : t.submissions.over(formatMoment(data.dueAt))
              : t.submissions.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-muted">
            {submission ? (
              <>
                <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
                {t.submissions.submitted(formatMoment(submission.submittedAt), submission.attempts)}
              </>
            ) : (
              t.submissions.notYet
            )}
          </p>
        </div>
        {data.open && (
          <AlertDialog>
            <Button size="sm" variant={submission ? 'secondary' : 'primary'} isPending={submit.isPending}>
              <Send className="size-4" /> {submission ? t.submissions.again : t.submissions.submit}
            </Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog>
                  <AlertDialog.Header>
                    <AlertDialog.Icon status="accent" />
                    <AlertDialog.Heading>{t.submissions.confirmTitle}</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body>{t.submissions.confirmText}</AlertDialog.Body>
                  <AlertDialog.Footer>
                    <Button slot="close" variant="tertiary">
                      {t.common.cancel}
                    </Button>
                    <Button slot="close" variant="primary" onPress={() => void handIn()}>
                      {submission ? t.submissions.again : t.submissions.submit}
                    </Button>
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        )}
      </div>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.tone === 'danger' ? 'text-danger' : 'text-success'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
