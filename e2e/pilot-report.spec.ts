import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #101: a student's code run shows in the pilot report, and the printed report fits on two pages.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Python' },
    { cell_type: 'code', source: 'print(2 + 2)', outputs: [] },
  ],
  nbformat: 4,
});

test("a student's run counts in the pilot report, which prints on two pages", async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Report e2e', { open: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Python',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  await student.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();
  await expect(student.locator('[data-testid="run-output"][data-cell="1"]')).toContainText('4', { timeout: 90_000 });
  await student.context().close();

  await staff.goto(`/o/e2e/courses/${course.id}/activity`);
  await staff.getByRole('link', { name: 'Raporti i pilotit' }).click();
  const report = staff.getByTestId('pilot-report');
  await expect(report).toContainText('Ekzekutime kodi');
  await expect(report.locator('div', { hasText: /^Ekzekutime kodi/ }).first()).toContainText(
    '1ditë-studenti · nga 1 student',
  );
  await expect(report).toContainText('Vetëm numra');
  await expect(report).not.toContainText(E2E_ACCOUNT.fullName);

  if (!isMobile) {
    const pdf = (await staff.pdf({ format: 'A4' })).toString('latin1');
    expect((pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeLessThanOrEqual(2);
  }
  await staff.context().close();
});
