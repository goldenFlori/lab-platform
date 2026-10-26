import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #169 is done when the pedagog sets a notebook as a kolokium, a student sees it closed until they
// start their own clock, hands it in once, and staff see who started and who handed in.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Kolokiumi' },
    { cell_type: 'code', source: 'def shuma(a, b):\n    raise NotImplementedError', outputs: [] },
  ],
  nbformat: 4,
});

/** A moment `minutes` from now, as a datetime-local input takes it. */
function local(minutes: number) {
  const date = new Date(Date.now() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test('a kolokium opens to each student at their start, runs on their clock and is handed in once', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Kolokium e2e', { open: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Kolokiumi 1',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  // The pedagog makes it a 30-minute kolokium, open from a few minutes ago until tomorrow.
  await staff.goto(pageUrl);
  await staff.getByText('Dorëzimi i kësaj fletoreje').click();
  const groupForm = staff.getByRole('form', { name: 'Grupi A' });
  await groupForm.getByLabel('Afati për Grupi A').fill(local(24 * 60));
  await groupForm.getByText('Kolokium me kohë').click();
  await groupForm.getByLabel('Nisja e lejuar për Grupi A nga').fill(local(-5));
  await groupForm.getByLabel('Minuta').fill('30');
  await groupForm.getByRole('button', { name: 'Hap dorëzimin' }).click();
  await expect(groupForm).toContainText('Kolokium: 30 minuta');

  // The student sees the kolokium, but not its notebook, until they start.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  const card = student.getByTestId('kolokium');
  await expect(card).toContainText('Nga nisja keni 30 minuta');
  await expect(student.getByText('def shuma')).toHaveCount(0);
  await card.getByRole('button', { name: 'Nis kolokiumin' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Nis kolokiumin' }).click();
  await expect(card).toContainText(/Koha e mbetur: (30:00|29:\d\d)/);
  await expect(student.getByText('def shuma').first()).toBeVisible();

  // Handed in once: then the bar offers no second hand-in, and the card says it is over.
  const bar = student.getByTestId('submission');
  await expect(bar).toContainText('Koha e mbetur');
  await bar.getByRole('button', { name: 'Dorëzo punën' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Dorëzo punën' }).click();
  await expect(bar).toContainText('Puna u dorëzua.');
  await expect(bar.getByRole('button')).toHaveCount(0);
  await expect(card).toContainText('Kolokiumi mbaroi për ju.');
  await student.context().close();

  // Staff see the kolokium and who handed in.
  await staff.goto(`${pageUrl}/submissions`);
  await expect(staff.getByText('Kolokium: 30 minuta')).toBeVisible();
  await expect(staff.getByTestId('submission-count')).toHaveText('1 nga 1 e dorëzuan');

  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
});
