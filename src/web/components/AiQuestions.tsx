import { useQuery } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import type { AiQuestion } from '../../shared/ai';
import { useT } from '../i18n';
import { aiPath } from '../lib/ai';
import { api } from '../lib/api';

// What students asked with "Explain my error" (#86), for staff who review their groups: the
// error, the code and the answer. Hidden from anyone the API refuses.

export function AiQuestions({ org, courseId }: { org: string; courseId: string }) {
  const t = useT();
  const { data } = useQuery({
    queryKey: ['orgs', org, 'courses', courseId, 'ai', 'questions'],
    queryFn: () => api<AiQuestion[]>(`${aiPath(org, courseId)}/questions`),
    retry: false,
  });
  if (!data) return null;
  return (
    <details className="group mt-10 rounded-2xl border border-border bg-surface" data-testid="ai-questions">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <Lightbulb className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold">{t.aiQuestions.title(data.length)}</span>
      </summary>
      <div className="border-t border-border p-4">
        <p className="text-sm text-muted">{t.aiQuestions.help}</p>
        {data.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t.aiQuestions.none}</p>
        ) : (
          <ul className="mt-3 divide-y divide-separator">
            {data.map((q) => (
              <li key={q.id} className="grid gap-2 py-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{q.name}</span>
                  <span className="text-xs text-muted">
                    {t.aiQuestions.where(q.lab, q.notebook)} · {new Date(q.at).toLocaleString()}
                  </span>
                </p>
                <pre className="overflow-x-auto rounded-xl bg-danger/8 p-2 font-mono text-[0.78rem] whitespace-pre-wrap text-danger">
                  {q.error.trim().split('\n').at(-1)}
                </pre>
                <details>
                  <summary className="cursor-pointer text-xs text-muted">{t.aiQuestions.code}</summary>
                  <pre className="mt-1 overflow-x-auto rounded-xl bg-surface-secondary p-2 font-mono text-[0.78rem] whitespace-pre-wrap">
                    {q.code}
                  </pre>
                </details>
                <div>
                  <p className="text-xs font-semibold text-accent">{t.aiQuestions.answer}</p>
                  <p className="whitespace-pre-wrap">{q.answer}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
