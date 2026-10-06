import { QueryClient } from '@tanstack/react-query';
import { createRouter, type NavigateOptions, type ToOptions } from '@tanstack/react-router';
import { ErrorPage } from './components/ErrorPage';
import { routeTree } from './routeTree.gen';

export const queryClient = new QueryClient();

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
