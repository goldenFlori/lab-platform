import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime (Miniflare) with the bindings from wrangler.jsonc.
// The D1 migrations are read here, in Node, and applied inside workerd by test/apply-migrations.ts.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        remoteBindings: false,
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: { include: ['test/**/*.test.ts'], setupFiles: ['./test/apply-migrations.ts'] },
  };
});
