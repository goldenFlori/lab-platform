import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
    cloudflare({ persistState: process.env.LOCAL_STATE ? { path: process.env.LOCAL_STATE } : true }),
  ],
  build: {
    // Largest chunk: the converter's WebAssembly (about 620 kB), loaded only when staff upload a
    // notebook. The app shell every visit loads (React, React Aria, TanStack) is about 425 kB.
    // Raise this deliberately.
    chunkSizeWarningLimit: 650,
  },
});
