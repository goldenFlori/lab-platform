import { expect, test } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #102: the pedagog opens the survey, a student answers it once, and the pedagog sees the count; the
// totals wait for five answers.

test('a pedagog opens the semester survey and a student answers it once', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group } = await courseWithLab(staff, 'Survey e2e');
  await staff.goto(`/o/e2e/courses/${course.id}`);
  const panel = staff.getByTestId('survey-staff');
  await panel.getByRole('button', { name: 'Hap anketën' }).click();
  await expect(panel).toContainText('E hapur deri më');

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`/o/e2e/courses/${course.id}`);
  const form = student.getByTestId('survey-form');
  await expect(form).toContainText('anonime');
  const code = form.getByRole('group', { name: 'Sa ju ndihmoi ekzekutimi i kodit në shfletues për të mësuar?' });
  await code.getByRole('button', { name: '5 nga 5' }).click();
  await form.getByLabel('Çfarë do të ndryshonit? (jo i detyrueshëm)').fill('Më shumë ushtrime.');
  await form.getByRole('button', { name: 'Dërgo përgjigjet' }).click();
  await expect(student.getByText('Faleminderit!')).toBeVisible();
  await student.reload();
  await expect(student.getByTestId('survey-form')).toHaveCount(0);
  await student.context().close();

  await staff.reload();
  const results = staff.getByTestId('survey-results');
  await expect(results).toContainText('1 nga 1 studentë u përgjigjën.');
  await expect(results).toContainText('të paktën 5 studentë');
  await expect(results).not.toContainText('Më shumë ushtrime.');
  await staff.context().close();
});
