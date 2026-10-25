import { AlertDialog, Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { useLabTool } from '../../lib/lab-tools';

export function DeleteNotebook({
  title,
  isPending,
  onDelete,
  withButton = true,
}: {
  title: string;
  isPending: boolean;
  onDelete: () => void;
  /** Without its own button it opens from the lab's "More" menu (#130). */
  withButton?: boolean;
}) {
  const t = useT();
  const [isOpen, setOpen] = useState(false);
  useLabTool('delete', () => setOpen(true));
  return (
    <>
      {withButton && (
        <Button variant="ghost" isPending={isPending} onPress={() => setOpen(true)}>
          <Trash2 className="size-4" /> {t.notebook.deleteButton}
        </Button>
      )}
      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t.notebook.deleteTitle(title)}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{t.notebook.deleteText}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t.common.cancel}
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                {t.notebook.deleteButton}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}
