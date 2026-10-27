import { QueryClient } from '@tanstack/react-query';
import { createRouter, type NavigateOptions, type ToOptions } from '@tanstack/react-router';
import { ErrorPage } from './components/ErrorPage';
import { routeTree } from './routeTree.gen';

// Coming back to the tab does not reload every query on the page (#177): it cost about eight requests
// each time, and a class switches tabs often. Pages still load fresh data when opened; what must stay
// current while open polls on its own (a kolokium's hand-ins) or arrives live (Live Labs).
export const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  // TanStack Query decides when cached data is stale, not the router.
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: ErrorPage,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// HeroUI (React Aria) links, such as menu items, navigate through the router with typed paths.
declare module 'react-aria-components' {
  interface RouterConfig {
    href: ToOptions['to'];
    routerOptions: Omit<NavigateOptions, keyof ToOptions>;
  }
}
