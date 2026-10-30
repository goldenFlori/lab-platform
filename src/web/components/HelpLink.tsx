import { Link } from '@tanstack/react-router';
import { CircleHelp } from 'lucide-react';
import { useT } from '../i18n';

/** "Help", where a guide explains the screen it sits on (#194). */
export function HelpLink({ guide, className = '' }: { guide: string; className?: string }) {
  const t = useT();
  return (
    <Link
      to="/help/$guide"
      params={{ guide }}
      className={`inline-flex items-center gap-1 rounded-full text-sm font-medium text-muted hover:text-foreground ${className}`}
    >
      <CircleHelp className="size-4" aria-hidden="true" /> {t.help.link}
    </Link>
  );
}
