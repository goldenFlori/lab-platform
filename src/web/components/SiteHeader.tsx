import { Button, Dropdown, Label } from '@heroui/react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { GraduationCap, LogOut, Menu, Waypoints } from 'lucide-react';
import type { Me } from '../../shared/auth';
import { useLogout, useMe } from '../lib/auth';
import { APP_NAME } from '../lib/brand';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const links = [
  { to: '/courses', label: 'Kurset', icon: GraduationCap },
  { to: '/visualizations', label: 'Vizualizimet', icon: Waypoints },
] as const;

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
