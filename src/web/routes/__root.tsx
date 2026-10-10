import { RouterProvider as AriaRouterProvider } from '@heroui/react';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, useRouter } from '@tanstack/react-router';
import { NotFoundPage } from '../components/NotFoundPage';
import { SiteHeader } from '../components/SiteHeader';
import { useT } from '../i18n';
import { APP_NAME } from '../lib/brand';
import { useLocaleSync } from '../lib/locale';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({ meta: [{ title: APP_NAME }] }),
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  const router = useRouter();
  const t = useT();
  useLocaleSync();
  return (
    <AriaRouterProvider
      navigate={(to, options) => router.navigate({ to, ...options })}
      useHref={(to) => router.buildLocation({ to }).href}
    >
      <HeadContent />
      <a
        href="#main"
        className="sr-only-focusable fixed top-3 left-3 z-[60] rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
      >
        {t.header.skipToContent}
      </a>
      <SiteHeader />
      <main id="main">
        <Outlet />
      </main>
    </AriaRouterProvider>
  );
}
