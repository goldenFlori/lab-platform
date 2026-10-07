/** The account the end-to-end tests sign in with. It exists only in their own local database. */
export const E2E_ACCOUNT = {
  username: 'e2e.student',
  fullName: 'Studenti Testues',
  password: 'E2e-sakte-2026',
};

/** Local database folder for the tests, rebuilt before every run. */
export const E2E_STATE = '.wrangler/e2e';
