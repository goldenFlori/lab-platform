import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

// The code editor for a cell (#49): CodeMirror with Python, loaded only when someone edits. Its
// colors follow the site's code (the tok-* classes in styles.css). Tab indents; Esc then Tab moves
// on, so the keyboard is never trapped. Lines are numbered, and the line where the last run failed
// is marked until the code changes (#131).
//
// The editor owns its text once it opens: copying the page's value back in after each render would
// overwrite keys typed while that render was on its way. A reset reaches it as a new mount (a new
// `key`), with its new starting text.

/** The line where the last run stopped with an error; cleared by the next edit, which may move it. */
const setError = StateEffect.define<number | null>();
const errorMark = Decoration.line({ class: 'cm-errorLine' });
const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setError)) continue;
      const n = effect.value;
      return n && n <= tr.state.doc.lines
        ? Decoration.set([errorMark.range(tr.state.doc.line(n).from)])
        : Decoration.none;
    }
    return tr.docChanged ? Decoration.none : marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const theme = EditorView.theme({
  '&': { fontSize: '0.84rem', backgroundColor: 'transparent' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '0.85rem 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 1rem' },
  '.cm-scroller': { lineHeight: '1.6' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--accent) 7%, transparent)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--accent) 22%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'color-mix(in oklab, var(--muted) 70%, transparent)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.25rem 0 0.75rem', minWidth: '2.25rem' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--accent) 22%, transparent) !important',
  },
  '.cm-errorLine': {
    backgroundColor: 'color-mix(in oklab, var(--state-reject) 12%, transparent)',
    boxShadow: 'inset 3px 0 0 var(--state-reject)',
  },
});

export default function CodeEditor({
  initialValue,
  onChange,
  label,
  autoFocus = false,
  errorLine = null,
}: {
  initialValue: string;
  onChange: (code: string) => void;
  label: string;
  autoFocus?: boolean;
  /** The line where the last run failed, to mark. */
  errorLine?: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: made once; a reset mounts a new editor
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          lineNumbers(),
          errorField,
          history(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          indentUnit.of('    '),
          python(),
          syntaxHighlighting(classHighlighter),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          theme,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    if (autoFocus) editor.focus();
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: setError.of(errorLine) });
  }, [errorLine]);

  return <div ref={host} className="nb-editor" />;
}
