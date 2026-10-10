import type { Page } from '@playwright/test';
import { uploadNotebook as upload } from '../scripts/course-import/apply';
import type { StoredNotebook } from '../src/notebook/stored';
import type { CourseSummary, GroupView } from '../src/shared/courses';
import type { LabView } from '../src/shared/labs';
import type { NotebookKind } from '../src/shared/notebooks';
import { apiCall, pageApi } from './sign-in';

/** A new course in the E2E organization, with one group and one lab, made by its admin. */
export async function courseWithLab(staff: Page, name: string, { open = false } = {}) {
  const course = await apiCall<CourseSummary>(staff, 'POST', '/orgs/e2e/courses', {
    title: `${name} ${crypto.randomUUID().slice(0, 6)}`,
    academicYear: '2026/27',
  });
  const coursePath = `/orgs/e2e/courses/${course.id}`;
  const group = await apiCall<GroupView>(staff, 'POST', `${coursePath}/groups`, { name: 'Grupi A' });
  const lab = await apiCall<LabView>(staff, 'POST', `${coursePath}/labs`, { n: 1, title: 'Algoritmet e renditjes' });
  const labPath = `${coursePath}/labs/${lab.id}`;
  if (open) {
    await apiCall(staff, 'PUT', `${labPath}/access`, {
      groupId: null,
      visibleFrom: new Date(Date.now() - 60_000).toISOString(),
      visibleUntil: null,
      solutionsFrom: null,
    });
  }
  return { course, group, lab, labPath, pageUrl: `/o/e2e/courses/${course.id}/labs/${lab.id}` };
}

/** Uploads a converted notebook through the API, in the same steps as the app. */
export function uploadNotebook(
  staff: Page,
  labPath: string,
  notebook: {
    kind: NotebookKind;
    title: string;
    raw: string;
    stored: StoredNotebook;
    assets?: Map<string, Uint8Array>;
  },
) {
  return upload(pageApi(staff), labPath, { ...notebook, originalName: `${notebook.title}.ipynb` });
}
