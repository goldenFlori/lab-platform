import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Two projects:
// - api: inside the Workers runtime (Miniflare) with the bindings from wrangler.jsonc. The D1
//   migrations are read here, in Node, and applied inside workerd by test/apply-migrations.ts.
// - notebook: the converter (src/notebook) in Node. It runs in the browser in production and uses
//   WebAssembly, which the Workers runtime does not allow to compile at run time.
// - viz: the visualizations' algorithms, in Node.
// - scripts: what the owner's scripts compute (scripts/), in Node.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.jsonc' },
              remoteBindings: false,
              miniflare: { bindings: { TEST_MIGRATIONS: migrations, AI_PROVIDER: 'fake', LIVE_JURISDICTION: 'none' } },
            }),
          ],
          test: { name: 'api', include: ['test/api/**/*.test.ts'], setupFiles: ['./test/apply-migrations.ts'] },
        },
        { test: { name: 'notebook', include: ['test/notebook/**/*.test.ts'], environment: 'node' } },
        // The visualizations' algorithms (src/viz/algorithms): plain functions, type-checked with the app.
        { test: { name: 'viz', include: ['test/viz/**/*.test.ts'], environment: 'node' } },
        { test: { name: 'scripts', include: ['test/scripts/**/*.test.ts'], environment: 'node' } },
      ],
    },
  };
});
