// The app's service worker (#89), built into /sw.js with its build and Python versions
// (vite.config.ts). It makes the installed app open fast and Python start without downloading again:
// - /api is never touched: protected content always comes from the server after a permission check;
// - pages come from the network, and the offline page when there is none;
// - the build's files (/assets, named by their content) and the Python engine and its packages
//   (named by their version, or by their hash on PyPI) are kept once fetched. A new build drops the old files; the engine
//   stays until its version changes.
// The responses keep their own headers, so the app stays cross-origin isolated (COOP and COEP).

const BUILD = '__BUILD__';
const SHELL = `shell-${BUILD}`;
const ENGINE = 'python-__PYODIDE__';
// public/offline.html, at the address Cloudflare serves it from (it redirects the .html one).
const OFFLINE = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then(async (cache) => {
        await cache.add('/favicon.svg');
        // Kept as a plain response: a page may not be answered with a redirected one.
        const page = await fetch(OFFLINE);
        await cache.put(OFFLINE, new Response(await page.blob(), { headers: page.headers }));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== ENGINE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  const ours = url.origin === self.location.origin;
  if (ours && url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  // The engine, Pyodide's packages, and the packages micropip takes from PyPI (plotly), whose files
  // are named by their content's hash and never change (#191).
  const engine =
    (ours && url.pathname.startsWith('/pyodide/')) ||
    (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/')) ||
    (url.hostname === 'files.pythonhosted.org' && url.pathname.endsWith('.whl'));
  if (engine) event.respondWith(kept(request, ENGINE));
  else if (ours && url.pathname.startsWith('/assets/')) event.respondWith(kept(request, SHELL));
});

/** From the cache when there; otherwise fetched, and kept if it came back whole. */
async function kept(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
    await cache.put(request, response.clone());
  }
  return response;
}
