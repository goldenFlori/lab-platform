import { defineConfig, devices } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STATE } from './e2e/account';

// End-to-end tests against the production build, served by the Workers runtime (vite preview),
// with their own database: migrated from scratch, with one test account.
const port = 4173;

const server = [
  `rm -rf ${E2E_STATE}`,
  'npm run build',
  `npx wrangler d1 migrations apply DB --local --persist-to ${E2E_STATE}`,
  `ACCOUNT_PASSWORD=${E2E_ACCOUNT.password} node scripts/create-account.ts --org-slug e2e --org-name E2E --username ${E2E_ACCOUNT.username} --full-name "${E2E_ACCOUNT.fullName}" --role student --persist-to ${E2E_STATE}`,
  `LOCAL_STATE=${E2E_STATE} npx vite preview --port ${port} --strictPort`,
].join(' && ');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The narrowest phone we support.
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: server,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
