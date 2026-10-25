import { RouterProvider as AriaRouterProvider } from '@heroui/react';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { NotFoundPage } from '../components/NotFoundPage';
import { SiteHeader } from '../components/SiteHeader';
import { useT } from '../i18n';
import { APP_NAME } from '../lib/brand';
import { useLocaleSync } from '../lib/locale';
import { MotionProvider, PageEnter } from '../lib/motion';

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useLocaleSync();
  return (
    <MotionProvider>
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
          <PageEnter id={pathname}>
            <Outlet />
          </PageEnter>
        </main>
        <footer className="container-page print:hidden flex flex-wrap items-center justify-between gap-3 border-t border-border py-6 text-sm text-muted">
          <span>{APP_NAME}</span>
          <Link to="/privacy" className="hover:text-foreground">
            {t.footer.privacy}
          </Link>
        </footer>
      </AriaRouterProvider>
    </MotionProvider>
  );
}
