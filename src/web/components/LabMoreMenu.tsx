import { Button, Dropdown, Label } from '@heroui/react';
import { Ellipsis, FileUp, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { openLabTool } from '../lib/lab-tools';

// The lab header's "More" menu for staff who manage the lab (#130): the notebook tools that are
// not used every class, out of the way of the lab's content. Each opens its panel or dialog.

export function LabMoreMenu({ canDelete }: { canDelete: boolean }) {
  const t = useT();
  return (
    <Dropdown>
      <Button variant="tertiary" isIconOnly aria-label={t.labMenu.label}>
        <Ellipsis className="size-4" />
      </Button>
      <Dropdown.Popover placement="bottom end" className="w-64">
        <Dropdown.Menu
          aria-label={t.labMenu.label}
          disabledKeys={canDelete ? [] : ['delete']}
          onAction={(key) => openLabTool(key as 'upload' | 'delete')}
        >
          <Dropdown.Item id="upload" textValue={t.upload.open}>
            <FileUp className="size-4" />
            <Label>{t.upload.open}</Label>
          </Dropdown.Item>
          <Dropdown.Item id="delete" textValue={t.notebook.deleteButton} variant="danger">
            <Trash2 className="size-4" />
            <Label>{t.notebook.deleteButton}</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
