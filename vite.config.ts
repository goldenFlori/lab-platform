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

export default defineConfig({
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
    }),
    pyodideEngine(),
  ],
  server: { headers: ISOLATION },
  worker: { format: 'es' },
  build: {
    // Largest chunk: the converter's WebAssembly (about 620 kB), loaded only when staff upload a
    // notebook. The app shell every visit loads (React, React Aria, TanStack) is about 425 kB.
    // Raise this deliberately.
    chunkSizeWarningLimit: 650,
  },
});
