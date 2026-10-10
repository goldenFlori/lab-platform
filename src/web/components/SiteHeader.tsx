import { Button, Dropdown, Kbd, Label } from '@heroui/react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { GraduationCap, LogOut, Menu, Search, Waypoints } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Me } from '../../shared/auth';
import { useLogout, useMe } from '../lib/auth';
import { APP_NAME } from '../lib/brand';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const links = [
  { to: '/courses', label: 'Kurset', icon: GraduationCap },
  { to: '/visualizations', label: 'Vizualizimet', icon: Waypoints },
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
        Kërko
        <Kbd className="ml-2">{APPLE ? '⌘K' : 'Ctrl K'}</Kbd>
      </Button>
      <Button isIconOnly size="sm" variant="ghost" onPress={() => show(true)} aria-label="Kërko" className="sm:hidden">
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

function AccountMenu({ me }: { me: Me }) {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <Dropdown>
      <Button size="sm" variant="ghost" className="gap-2 px-1.5" aria-label={`Llogaria: ${me.user.fullName}`}>
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
          aria-label="Llogaria"
          onAction={(key) => {
            if (key === 'logout') logout.mutate(undefined, { onSettled: () => navigate({ to: '/' }) });
          }}
        >
          <Dropdown.Item id="logout" textValue="Dil">
            <LogOut className="size-4" />
            <Label>Dil</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function SiteHeader() {
  const me = useMe();
  const onLoginPage = useRouterState({ select: (state) => state.location.pathname === '/login' });
  return (
    <header className="glass sticky top-0 z-50 h-(--nav-h) border-b border-separator/80">
      <div className="container-page flex h-full items-center gap-3">
        <Link to="/" className="group flex min-w-0 items-center gap-2.5 rounded-xl pr-2" aria-label="Kreu">
          <Logo className="size-9 shrink-0 transition-transform duration-300 group-hover:rotate-[-6deg]" />
          <span className="truncate text-[0.95rem] font-semibold tracking-tight">{APP_NAME}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Navigimi kryesor">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
              activeProps={{ className: 'bg-accent-soft text-accent' }}
              inactiveProps={{ className: 'text-foreground/75 hover:bg-default hover:text-foreground' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-2">
          {!onLoginPage && <SearchButton />}
          <ThemeToggle />
          {me ? (
            <AccountMenu me={me} />
          ) : onLoginPage ? null : (
            <Link to="/login" className="button button--sm button--primary">
              Hyr
            </Link>
          )}
          <div className="md:hidden">
            <Dropdown>
              <Button isIconOnly size="sm" variant="ghost" aria-label="Menyja">
                <Menu className="size-[18px]" />
              </Button>
              <Dropdown.Popover placement="bottom end" className="w-60">
                <Dropdown.Menu aria-label="Navigimi kryesor">
                  {links.map((link) => (
                    <Dropdown.Item key={link.to} id={link.to} href={link.to} textValue={link.label}>
                      <link.icon className="size-4" />
                      <Label>{link.label}</Label>
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
