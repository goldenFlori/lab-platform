import { AlertDialog, Button } from '@heroui/react';
import { Check, CloudOff, Loader2, RotateCcw } from 'lucide-react';
import { useT } from '../../i18n';
import { useCodeEdits } from '../../lib/code-edits';

/** Above the notebook once the student has changed code (#49): how much, whether it is saved, and undo all. */
export function EditsBar() {
  const t = useT();
  const edits = useCodeEdits();
  if (!edits || (edits.count === 0 && edits.saving !== 'failed')) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 px-4 py-2.5 text-sm">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{t.edits.count(edits.count)}</span>
        <span
          className={`flex items-center gap-1.5 text-xs ${edits.saving === 'failed' ? 'text-danger' : 'text-muted'}`}
          aria-live="polite"
          data-testid="edits-saving"
        >
          {edits.saving === 'saving' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : edits.saving === 'failed' ? (
            <CloudOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          {t.edits[edits.saving]}
        </span>
      </span>
      {edits.count > 0 && (
        <AlertDialog>
          <Button size="sm" variant="ghost">
            <RotateCcw className="size-4" /> {t.edits.resetAll}
          </Button>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog>
                <AlertDialog.Header>
                  <AlertDialog.Icon status="warning" />
                  <AlertDialog.Heading>{t.edits.resetAllTitle}</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>{t.edits.resetAllText}</AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="tertiary">
                    {t.common.cancel}
                  </Button>
                  <Button slot="close" variant="danger" onPress={() => edits.resetAll()}>
                    {t.edits.resetAll}
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}
    </div>
  );
}
