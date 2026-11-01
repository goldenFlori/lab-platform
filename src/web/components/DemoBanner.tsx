import { FlaskConical } from 'lucide-react';
import { isDemoAccount } from '../../shared/demo';
import { useT } from '../i18n';
import { useMe } from '../lib/auth';

/**
 * One line under the header for whoever is trying the demo (#216): a shared account, rebuilt every
 * night, where nothing personal should be typed.
 */
export function DemoBanner() {
  const t = useT();
  const me = useMe();
  if (!me || !isDemoAccount(me.user.username)) return null;
  return (
    <div role="note" className="border-b border-accent/30 bg-accent-soft print:hidden" data-testid="demo-banner">
      <p className="container-page flex items-start gap-2 py-2.5 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        {t.demo.banner}
      </p>
    </div>
  );
}
