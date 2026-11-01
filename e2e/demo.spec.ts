import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { hashPassword } from '../src/shared/password';
import { E2E_STAFF } from './account';
import { uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #216: the owner makes the demo institution and its template course; after a reset, a visitor tries
// it from the front page as a student and as a pedagog, without an account, and is told it is a demo.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Grafet' },
    { cell_type: 'code', source: 'def shuma(a, b):\n    return a + b', outputs: [] },
  ],
  nbformat: 4,
});

test('anyone tries the demo institution as a student or a pedagog', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'there is one institution "demo" per run, made here');
  test.setTimeout(120_000);
  const owner = await signIn(browser, E2E_STAFF, isMobile);
  const admin = { username: 'demo.admin', password: 'Demo-admin-2026' };
  await apiCall(owner, 'POST', '/platform/institutions', {
    name: 'Institucioni Demo',
    slug: 'demo',
    admin: { fullName: 'Admin Demo', username: admin.username, passwordHash: await hashPassword(admin.password) },
  });
  // The template course, as the owner would import it.
  const adminPage = await signIn(browser, admin, isMobile);
  const course = await apiCall<{ id: string }>(adminPage, 'POST', '/orgs/demo/courses', {
    title: 'Struktura Diskrete',
    academicYear: '2026/27',
  });
  const lab = await apiCall<{ id: string }>(adminPage, 'POST', `/orgs/demo/courses/${course.id}/labs`, {
    n: 1,
    title: 'Grafet',
  });
  const labPath = `/orgs/demo/courses/${course.id}/labs/${lab.id}`;
  const nb = await uploadNotebook(adminPage, labPath, {
    kind: 'main',
    title: 'Grafet',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(adminPage, 'PUT', `${labPath}/notebooks/${nb.id}/exercises`, {
    exercises: [{ cell: 1, title: 'Shuma', test: 'assert shuma(1, 2) == 3' }],
  });
  await adminPage.context().close();
  await owner.goto('/platform');
  await owner.getByRole('button', { name: 'Rivendos demon tani' }).click();
  await expect(owner.getByText('Demoja u rivendos.')).toBeVisible();
  await owner.context().close();

  for (const [button, role] of [
    ['Provo si student', 'student'],
    ['Provo si pedagog', 'pedagog'],
  ] as const) {
    const visitor = await browser.newPage();
    await visitor.goto('/');
    await visitor.getByTestId('try-demo').getByRole('button', { name: button }).click();
    await expect(visitor).toHaveURL(/\/o\/demo\/courses\/[0-9a-f-]+$/);
    await expect(visitor.getByRole('heading', { level: 1, name: 'Struktura Diskrete' })).toBeVisible();
    await expect(visitor.getByTestId('demo-banner')).toContainText('Mos shkruani të dhëna personale');
    if (role === 'pedagog') {
      // The group with the made-up classmates, and the student's seat.
      await expect(visitor.getByText('Grupi A').first()).toBeVisible();
    }
    await visitor.context().close();
  }
});
