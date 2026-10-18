import { Button } from '@heroui/react';
import { Download } from 'lucide-react';
import { useState } from 'react';
import type { CourseGrades } from '../../shared/grading';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { downloadCsv, fileSlug } from '../lib/csv';

// The course's released grades as one spreadsheet (#114): a row per student of the groups the user
// grades, a column per graded notebook and the total, for the institution's records.

export function CourseGradesCsv({ org, courseId, title }: { org: string; courseId: string; title: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setPending(true);
    setFailed(false);
    try {
      const data = await api<CourseGrades>(
        `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/grades`,
      );
      const c = t.grading.csvColumns;
      const score = new Map(data.grades.map((g) => [`${g.userId} ${g.notebookId}`, g]));
      downloadCsv(t.grading.csvFile(fileSlug(title)), [
        [
          c.group,
          c.username,
          c.fullName,
          ...data.notebooks.map((nb) => {
            const max = data.grades.find((g) => g.notebookId === nb.id)?.maxScore ?? 0;
            return c.notebook(nb.lab, nb.title, max);
          }),
          c.total,
        ],
        ...data.students.map((s) => {
          const scores = data.notebooks.map((nb) => score.get(`${s.id} ${nb.id}`)?.score ?? null);
          return [s.group, s.username, s.fullName, ...scores, scores.reduce<number>((sum, n) => sum + (n ?? 0), 0)];
        }),
      ]);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="tertiary" onPress={download} isPending={pending}>
        <Download className="size-4" /> {t.grading.csvCourse}
      </Button>
      {failed && (
        <p role="alert" className="basis-full text-sm text-danger">
          {t.grading.csvFailed}
        </p>
      )}
    </>
  );
}
