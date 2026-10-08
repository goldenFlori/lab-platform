/** The student account the end-to-end tests sign in with; it belongs to its own school, E2E School. */
export const E2E_ACCOUNT = {
  username: 'e2e.student',
  fullName: 'Studenti Testues',
  password: 'E2e-sakte-2026',
};

/** A staff account: admin of the E2E organization, so it may create courses there. */
export const E2E_STAFF = {
  username: 'e2e.staff',
  fullName: 'Pedagogia Testuese',
  password: 'E2e-stafi-2026',
};

/** Local database folder for the tests, rebuilt before every run. */
export const E2E_STATE = '.wrangler/e2e';
