import { AlertDialog, Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { useT } from '../../i18n';

export function DeleteNotebook({
  title,
  isPending,
  onDelete,
}: {
  title: string;
  isPending: boolean;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <Button variant="ghost" isPending={isPending}>
        <Trash2 className="size-4" /> {t.notebook.deleteButton}
      </Button>
      <AlertDialog.Backdrop>
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
    </AlertDialog>
  );
}
