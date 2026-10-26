import { useQueries, useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { variantSeed } from '../../shared/trace-problem';
import { type Learner, VizLearner } from '../../viz/kit/learner';
import { useMe } from './auth';
import { courseQuery } from './courses';
import type { NotebookRef } from './notebooks';
import { groupStudentsQuery } from './students';

// Who looks at an embedded visualization (#167): their seed for this embed, so a trace table asked as a
// variant gives each student their own graph; and for staff, the students of the groups they manage,
// to look up any of their variants. Only fetched for an embed that asks for a variant.

export function LearnerProvider({
  notebookRef,
  cell,
  variant,
  children,
}: {
  notebookRef: NotebookRef;
  cell: number;
  variant: boolean;
  children: ReactNode;
}) {
  const me = useMe();
  const { org, courseId, notebookId } = notebookRef;
  const course = useQuery({ ...courseQuery(org, courseId), enabled: variant });
  const managed = variant ? (course.data?.groups ?? []).filter((g) => g.permissions.manageStudents) : [];
  const students = useQueries({ queries: managed.map((g) => groupStudentsQuery(org, courseId, g.id)) });
  const list = students.flatMap((q) => q.data ?? []);
  const key = list.map((s) => s.id).join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the students' ids, not the arrays' identity
  const learner = useMemo<Learner | null>(
    () =>
      me
        ? {
            seed: variantSeed(me.user.id, notebookId, cell),
            others: list
              .map((s) => ({ name: s.fullName, seed: variantSeed(s.id, notebookId, cell) }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          }
        : null,
    [me, notebookId, cell, key],
  );
  return <VizLearner.Provider value={learner}>{children}</VizLearner.Provider>;
}
