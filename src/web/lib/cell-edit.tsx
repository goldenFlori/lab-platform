import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import type { NotebookDetail } from '../../shared/notebooks';
import { useLabTool } from './lab-tools';
import { editCell, type UploadProgress } from './upload-notebook';

// Editing a cell in the browser (#232), for staff who manage the lab: "Ndrysho qelizat" in the lab's
// menu turns the mode on; each cell then offers its source to edit, and saving puts the notebook in
// place as a new version, students' work kept with its cells.

type CellEditValue = {
  /** The cell being edited, if any. */
  editing: number | null;
  open: (cell: number) => void;
  close: () => void;
  /** The cell's source in the version in place, once loaded. */
  source: (cell: number) => string | undefined;
  save: (cell: number, source: string) => Promise<void>;
  progress: UploadProgress | null;
};

const CellEditContext = createContext<CellEditValue | null>(null);

export function CellEditProvider({
  base,
  notebook,
  onSaved,
  children,
}: {
  /** The lab's notebooks path. */
  base: string;
  notebook: NotebookDetail | undefined;
  onSaved: (notebook: NotebookDetail) => void;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  useLabTool('edit-cells', () => setActive((on) => !on));
  // The original, read only while editing, by its version's address.
  const original = useQuery({
    queryKey: ['cell-edit', notebook?.id, notebook?.version],
    enabled: active && !!notebook,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const res = await fetch(
        `/api${base}/${encodeURIComponent(notebook?.id ?? '')}/files/notebook.ipynb?v=${notebook?.version}`,
        { credentials: 'same-origin' },
      );
      if (!res.ok) throw new Error(`original notebook: ${res.status}`);
      const raw = await res.text();
      const { sourceOf } = await import('../../notebook/with-code');
      return (cell: number) => sourceOf(raw, cell);
    },
  });

  const value = useMemo<CellEditValue | null>(() => {
    if (!active || !notebook) return null;
    return {
      editing,
      open: setEditing,
      close: () => setEditing(null),
      source: (cell) => original.data?.(cell),
      async save(cell, source) {
        try {
          onSaved(await editCell(base, notebook, cell, source, setProgress));
          setEditing(null);
        } finally {
          setProgress(null);
        }
      },
      progress,
    };
  }, [active, notebook, editing, original.data, base, onSaved, progress]);

  return <CellEditContext.Provider value={value}>{children}</CellEditContext.Provider>;
}

/** The edit mode, where staff turned it on; null otherwise. */
export const useCellEdit = () => useContext(CellEditContext);
