import { expect, test } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #68: a student asks for help, staff take and close the request, and reactions reach the staff.

test('a student asks for help, staff take and close it, and a reaction reaches the host', async ({
  browser,
  isMobile,
}) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Help e2e', { open: true });
  await apiCall(staff, 'POST', `${labPath}/live`);
  await staff.goto(pageUrl);
  const host = staff.getByTestId('live-host');

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`${pageUrl}?live=1`);
  const panel = student.getByTestId('live-student');
  await panel.getByRole('button', { name: 'Jam bllokuar' }).click();
  await expect(panel.getByTestId('help-state')).toContainText('Në pritje të ndihmës');

  const queue = host.getByTestId('help-queue');
  await expect(queue).toContainText(E2E_ACCOUNT.fullName);
  await queue.getByRole('button', { name: 'E marr' }).click();
  await expect(panel.getByTestId('help-state')).toContainText(`${E2E_STAFF.fullName} po vjen te ju.`);
  await queue.getByRole('button', { name: 'U zgjidh' }).click();
  await expect(queue).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Jam bllokuar' })).toBeVisible();

  await panel.getByRole('button', { name: 'Reago me 👍' }).click();
  await expect(host.getByTestId('live-reactions')).toContainText('👍 1');
  await student.context().close();
  await staff.context().close();
});
