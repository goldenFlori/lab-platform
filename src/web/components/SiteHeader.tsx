import { Button, Dropdown, Label } from '@heroui/react';
import { Link } from '@tanstack/react-router';
import { FlaskConical, Menu } from 'lucide-react';
import { APP_NAME } from '../lib/brand';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const links = [{ to: '/labs', label: 'Laboratorët', icon: FlaskConical }] as const;

export function SiteHeader() {
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
