import { AlertDialog, Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';

export function DeleteNotebook({
  title,
  isPending,
  onDelete,
}: {
  title: string;
  isPending: boolean;
  onDelete: () => void;
}) {
  return (
    <AlertDialog>
      <Button variant="ghost" isPending={isPending}>
        <Trash2 className="size-4" /> Fshi fletoren
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Të fshihet {title}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>Fletorja, figurat dhe vizualizimet e saj fshihen nga ky laborator.</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Anulo
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                Fshi fletoren
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
