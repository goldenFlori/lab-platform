import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import type { Slip } from '../lib/students';

/** `institution`: its name, printed first on each slip (#201). */
type Props = { slips: Slip[]; courseTitle: string; groupName: string; institution?: string };

/**
 * Credential slips: on screen as a preview, and a print-only copy at the top of the page, so the
 * printout holds the slips and nothing else. A4, ten per page in two columns, dashed cut lines.
 */
export function CredentialSlips(props: Props) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {props.slips.map((slip) => (
          <SlipCard key={slip.username} slip={slip} {...props} screen />
        ))}
      </div>
      {createPortal(
        <div className="print-only">
          <div className="slips-print">
            {props.slips.map((slip) => (
              <SlipCard key={slip.username} slip={slip} {...props} />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function SlipCard({
  slip,
  courseTitle,
  groupName,
  institution,
  screen = false,
}: Props & { slip: Slip; screen?: boolean }) {
  const t = useT();
  return (
    <div
      className={screen ? 'rounded-2xl border border-dashed border-border bg-surface p-5' : 'slip-print'}
      data-testid={screen ? 'slip' : undefined}
    >
      <p className={screen ? 'text-xs text-muted' : 'slip-meta'}>
        <span aria-hidden="true">✂ </span>
        {institution ? `${institution} · ` : ''}
        {courseTitle} · {groupName}
      </p>
      <p className={screen ? 'mt-2 text-lg font-semibold' : 'slip-name'}>{slip.fullName}</p>
      <dl className={screen ? 'mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1' : 'slip-fields'}>
        <dt className={screen ? 'text-sm text-muted' : ''}>{t.slip.username}</dt>
        <dd className="font-mono font-semibold">{slip.username}</dd>
        <dt className={screen ? 'text-sm text-muted' : ''}>{t.slip.password}</dt>
        <dd className="font-mono font-semibold tracking-wider" data-testid={screen ? 'slip-password' : undefined}>
          {slip.password}
        </dd>
      </dl>
      <p className={screen ? 'mt-3 text-xs text-muted' : 'slip-hint'}>{t.slip.hint(window.location.host)}</p>
    </div>
  );
}
