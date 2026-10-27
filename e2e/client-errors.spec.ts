import { expect, test } from '@playwright/test';
import { E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { signIn } from './sign-in';

// #179: an error in a browser reaches the owner, named by the page's route and with ids masked:
// where and what, never who.

test('a failure in the page is reported by route, with its ids masked', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { lab, pageUrl } = await courseWithLab(staff, 'Client errors e2e', { open: true });
  await staff.goto(pageUrl);
  await expect(staff.getByRole('heading', { name: lab.title, level: 1 })).toBeVisible();

  // This error is on purpose: the sign-in helper's "any page error fails the test" is off for it.
  staff.removeAllListeners('pageerror');
  const reported = staff.waitForRequest('**/api/client-errors');
  await staff.evaluate((id) => {
    void Promise.reject(new Error(`Could not load lab ${id}`));
  }, lab.id);
  const request = await reported;
  expect(request.postDataJSON()).toEqual({
    kind: 'rejection',
    message: 'Could not load lab :id',
    source: null,
    page: '/_authed/o/$org/courses/$courseId/labs/$labId',
    build: expect.stringMatching(/^index-/),
  });
  expect((await request.response())?.status()).toBe(204);
  await staff.context().close();
});
