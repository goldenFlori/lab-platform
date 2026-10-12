import { Button, Dropdown, Kbd, Label, Modal } from '@heroui/react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Check, GraduationCap, Languages, LogOut, Menu, Search, Smartphone, Waypoints } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Me } from '../../shared/auth';
import { LOCALES } from '../../shared/locale';
import { LANGUAGE_NAMES, useLocale, useT } from '../i18n';
import { useLogout, useMe } from '../lib/auth';
import { APP_NAME } from '../lib/brand';
import { install, useInstall } from '../lib/install';
import { useChooseLocale } from '../lib/locale';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const links = [
  { to: '/courses', label: 'courses', icon: GraduationCap },
  { to: '/visualizations', label: 'visualizations', icon: Waypoints },
] as const;

const APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

// Loaded the first time it opens.
const SearchPalette = lazy(() => import('./SearchPalette'));

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable);

/** The search button and its shortcuts: ⌘K or Ctrl+K anywhere, and / when not typing. */
function SearchButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const show = (next: boolean) => {
    setOpen(next);
    if (next) setUsed(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((was) => !was);
        setUsed(true);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
        setUsed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onPress={() => show(true)}
        className="hidden gap-2 border border-border px-3 text-muted sm:inline-flex"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="size-4" aria-hidden="true" />
        {t.header.search}
        <Kbd className="ml-2">{APPLE ? '⌘K' : 'Ctrl K'}</Kbd>
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={() => show(true)}
        aria-label={t.header.search}
        className="sm:hidden"
      >
        <Search className="size-[18px]" />
      </Button>
      {used && (
        <Suspense fallback={null}>
          <SearchPalette isOpen={open} onOpenChange={show} />
        </Suspense>
      )}
    </>
  );
}

function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** For visitors who are not signed in: the other language, one press away. */
function LanguageToggle() {
  const t = useT();
  const locale = useLocale();
  const choose = useChooseLocale();
  const other = locale === 'sq' ? 'en' : 'sq';
  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-1.5 px-2"
      lang={other}
      aria-label={`${t.header.language}: ${LANGUAGE_NAMES[other]}`}
      onPress={() => choose(other)}
    >
      <Languages className="size-[18px]" aria-hidden="true" />
      <span className="text-xs font-semibold uppercase">{other}</span>
    </Button>
  );
}

function AccountMenu({ me }: { me: Me }) {
  const logout = useLogout();
  const navigate = useNavigate();
  const t = useT();
  const locale = useLocale();
  const choose = useChooseLocale();
  const installable = useInstall();
  const [appleSteps, setAppleSteps] = useState(false);
  return (
    <>
      <Dropdown>
        <Button size="sm" variant="ghost" className="gap-2 px-1.5" aria-label={t.header.account(me.user.fullName)}>
          <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
            {initials(me.user.fullName)}
          </span>
          <span className="hidden max-w-40 truncate text-sm font-medium lg:inline">{me.user.fullName}</span>
        </Button>
        <Dropdown.Popover placement="bottom end" className="w-60">
          <div className="px-3 pt-3 pb-1">
            <p className="truncate text-sm font-semibold">{me.user.fullName}</p>
            <p className="truncate text-xs text-muted">{me.user.username}</p>
          </div>
          <Dropdown.Menu
            aria-label={t.header.accountMenu}
            onAction={(key) => {
              if (key === 'logout') logout.mutate(undefined, { onSettled: () => navigate({ to: '/' }) });
              else if (key === 'install') installable === 'apple' ? setAppleSteps(true) : void install();
              else if (key === 'sq' || key === 'en') choose(key);
            }}
          >
            <Dropdown.Section aria-label={t.header.language}>
              {LOCALES.map((code) => (
                <Dropdown.Item key={code} id={code} textValue={LANGUAGE_NAMES[code]} lang={code}>
                  <Languages className="size-4" />
                  <Label>{LANGUAGE_NAMES[code]}</Label>
                  {code === locale && <Check className="ml-auto size-4 text-accent" aria-label="✓" />}
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
            {installable ? (
              <Dropdown.Item id="install" textValue={t.install.item}>
                <Smartphone className="size-4" />
                <Label>{t.install.item}</Label>
              </Dropdown.Item>
            ) : null}
            <Dropdown.Item id="logout" textValue={t.header.signOut}>
              <LogOut className="size-4" />
              <Label>{t.header.signOut}</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <Modal.Backdrop isOpen={appleSteps} onOpenChange={setAppleSteps}>
        <Modal.Container size="sm">
          <Modal.Dialog aria-label={t.install.appleTitle}>
            <Modal.Header>
              <Modal.Heading>{t.install.appleTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {t.install.appleSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="primary">
                {t.common.close}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}

export function SiteHeader() {
  const me = useMe();
  const t = useT();
  const onLoginPage = useRouterState({ select: (state) => state.location.pathname === '/login' });
  return (
    <header className="glass sticky top-0 z-50 h-(--nav-h) border-b border-separator/80">
      <div className="container-page flex h-full items-center gap-3">
        <Link to="/" className="group flex min-w-0 items-center gap-2.5 rounded-xl pr-2" aria-label={t.header.home}>
          <Logo className="size-9 shrink-0 transition-transform duration-300 group-hover:rotate-[-6deg]" />
          <span className="truncate text-[0.95rem] font-semibold tracking-tight">{APP_NAME}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label={t.header.mainNav}>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
              activeProps={{ className: 'bg-accent-soft text-accent' }}
              inactiveProps={{ className: 'text-foreground/75 hover:bg-default hover:text-foreground' }}
            >
              {t.header[link.label]}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-2">
          {!onLoginPage && <SearchButton />}
          {!me && <LanguageToggle />}
          <ThemeToggle />
          {me ? (
            <AccountMenu me={me} />
          ) : onLoginPage ? null : (
            <Link to="/login" className="button button--sm button--primary">
              {t.header.signIn}
            </Link>
          )}
          <div className="md:hidden">
            <Dropdown>
              <Button isIconOnly size="sm" variant="ghost" aria-label={t.header.menu}>
                <Menu className="size-[18px]" />
              </Button>
              <Dropdown.Popover placement="bottom end" className="w-60">
                <Dropdown.Menu aria-label={t.header.mainNav}>
                  {links.map((link) => (
                    <Dropdown.Item key={link.to} id={link.to} href={link.to} textValue={t.header[link.label]}>
                      <link.icon className="size-4" />
                      <Label>{t.header[link.label]}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </div>
      </div>
    </header>
  );
}
