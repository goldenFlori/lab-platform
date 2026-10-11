import { expect, test } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #65: a pedagog starts a Live Lab, a student joins from the QR link, the host sees them, and
// ending the session lets the student go.

test('a pedagog runs a Live Lab and sees a student join', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, pageUrl } = await courseWithLab(staff, 'Live e2e', { open: true });
  await staff.goto(pageUrl);
  await staff.getByRole('button', { name: 'Fillo Live Lab' }).click();
  const host = staff.getByTestId('live-host');
  await expect(host.getByTestId('live-count')).toContainText('0 studentë të lidhur');
  await host.getByRole('button', { name: 'Kodi QR' }).click();
  await expect(host.getByRole('img', { name: 'Kodi QR për t’u bashkuar me Live Lab' })).toBeVisible();

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`${pageUrl}?live=1`);
  await expect(student.getByTestId('live-student')).toContainText('Jeni në Live Lab');
  await expect(host.getByTestId('live-count')).toContainText('1 student i lidhur');

  await host.getByRole('button', { name: 'Mbyll sesionin' }).click();
  await expect(staff.getByRole('button', { name: 'Fillo Live Lab' })).toBeVisible();
  await expect(student.getByTestId('live-student')).toHaveCount(0);
  await student.context().close();
  await staff.context().close();
});
