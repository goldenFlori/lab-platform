import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Runs before every test file: brings the test database up to the latest migration.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
