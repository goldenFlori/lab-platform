import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Cross-origin isolation, so the Python worker shares memory with the page (Stop, input()). Also in public/_headers. */
const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

/**
 * Pyodide's engine served from our own site (#47), at /pyodide/<version>/: copied from the npm
 * package into the build, and served from it in development. The packages a cell imports come
 * from Pyodide's CDN at the same version (src/web/python/worker.ts).
 */
function pyodideEngine(): Plugin {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string };
  const files: Record<string, string> = {
    'pyodide.asm.mjs': 'text/javascript',
    'pyodide.asm.wasm': 'application/wasm',
    'python_stdlib.zip': 'application/zip',
    'pyodide-lock.json': 'application/json',
  };
  const base = `pyodide/${version}/`;
  return {
    name: 'pyodide-engine',
    configureServer(server) {
      server.middlewares.use(`/${base}`, (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        const type = files[name];
        if (!type) return next();
        res.setHeader('Content-Type', type);
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      if (this.environment.name !== 'client') return;
      for (const name of Object.keys(files)) {
        this.emitFile({ type: 'asset', fileName: base + name, source: readFileSync(join(dir, name)) });
      }
    },
  };
}

/**
 * The service worker (#89), emitted as /sw.js with the build's version (from its files' names, so
 * it changes whenever they do) and the Python engine's, which name its caches.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    generateBundle(_, bundle) {
      if (this.environment.name !== 'client') return;
      const pyodide = createRequire(import.meta.url)('pyodide/package.json') as { version: string };
      const build = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync('src/web/pwa/sw.js', 'utf8')
        .replace('__BUILD__', build)
        .replace('__PYODIDE__', pyodide.version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    // Generates src/web/routeTree.gen.ts from the files in src/web/routes; must run before React.
    tanstackRouter({
      target: 'react',
      routesDirectory: './src/web/routes',
      generatedRouteTree: './src/web/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    // LOCAL_STATE points dev or preview at another local database folder (the end-to-end tests use one).
    // That folder also means no remote bindings, so no Cloudflare sign-in is needed (Workers AI is one).
    cloudflare({
      persistState: process.env.LOCAL_STATE ? { path: process.env.LOCAL_STATE } : true,
      remoteBindings: !process.env.LOCAL_STATE,
      // Only Cloudflare has jurisdictions; the local runtime refuses them, so dev runs Live Labs without.
      config: command === 'serve' ? (config) => ({ vars: { ...config.vars, LIVE_JURISDICTION: 'none' } }) : undefined,
    }),
    pyodideEngine(),
    serviceWorker(),
  ],
  server: { headers: ISOLATION },
  worker: { format: 'es' },
  // The Python engine's version, for what the app keeps per version (the get-ready check, #191),
  // without importing Pyodide into the app's own bundle.
  define: {
    __PYODIDE_VERSION__: JSON.stringify(
      (createRequire(import.meta.url)('pyodide/package.json') as { version: string }).version,
    ),
  },
  build: {
    // Largest chunk: the converter's WebAssembly (about 620 kB), loaded only when staff upload a
    // notebook. The app shell every visit loads (React, React Aria, TanStack) is about 425 kB.
    // Raise this deliberately.
    chunkSizeWarningLimit: 650,
  },
}));
