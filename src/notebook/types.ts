// What the converter makes of a notebook (#13): the same shapes as the course site's
// site/scripts/notebook.mjs, so pages built from either look the same.

export type SectionKind =
  | 'homework'
  | 'classwork'
  | 'reflect'
  | 'scenario'
  | 'exercise'
  | 'theory'
  | 'complexity'
  | 'normal';

export type CodeFlags = {
  pygame: boolean;
  tkinter: boolean;
  widgets: boolean;
  plotly: boolean;
  subprocess: boolean;
  sysexit: boolean;
  networkx: boolean;
  matplotlib: boolean;
};

export type OutputItem =
  | { kind: 'stream'; stream: string; text: string; truncated?: boolean }
  | { kind: 'error'; benign: true; title: string; note: string }
  | { kind: 'error'; benign: false; name: string; evalue: string; traceback: string }
  | { kind: 'plotly'; file: string; bytes: number }
  | { kind: 'image'; file: string; bytes: number }
  | { kind: 'html'; html: string }
  | { kind: 'widget' }
  | { kind: 'inert-js' };

export type MarkdownCell = {
  type: 'markdown';
  kind: SectionKind;
  html: string;
  srcIndex: number;
  /** The text under the notebook's title, shown in the page header area. */
  intro?: true;
  label?: string | null;
  id?: string;
  heading?: string | null;
  level?: number;
  /** A heading repeated just before its code: the anchor stays, the heading is not shown again. */
  redundant?: boolean;
};

export type CodeCell = {
  type: 'code';
  srcIndex: number;
  /** Its real output is a desktop window or a live widget, so it keeps no output here. */
  interactive: boolean;
  html: string;
  raw: string;
  lines: number;
  collapsed: boolean;
  summary: { t: 'class' | 'def'; n: string }[];
  flags: CodeFlags;
  externalScripts: string[];
  outputs: OutputItem[];
};

export type Cell = MarkdownCell | CodeCell;

export type TocEntry = { id: string; title: string; level: number; kind: SectionKind };

export type RenderedNotebook = {
  title: string | null;
  toc: TocEntry[];
  tocFull: TocEntry[];
  sections: { id: string; title: string; kind: SectionKind }[];
  cells: Cell[];
  imports: string[];
  dependencies: string[];
  flags: {
    pygame: boolean;
    tkinter: boolean;
    widgets: boolean;
    plotly: boolean;
    matplotlib: boolean;
    networkx: boolean;
    numpy: boolean;
  };
  missingScripts: string[];
  stats: { cells: number; markdown: number; code: number; codeLines: number };
  hasEmbeddedHomework: boolean;
  hasClasswork: boolean;
  /** Images and Plotly figures by file name, to be stored next to the notebook. */
  assets: Map<string, Uint8Array>;
};
