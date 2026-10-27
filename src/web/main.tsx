import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startErrorReports } from './lib/report-error';
import { queryClient, router } from './router';
import './styles.css';

// Errors in this browser reach the owner (#179), named by the page's route, never its ids. Not in
// development, where they show on screen.
if (import.meta.env.PROD) startErrorReports(() => router.state.matches.at(-1)?.routeId);

// The installable app (#89): its service worker, in the production build only.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
