import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

// The code editor for a cell (#49): CodeMirror with Python, loaded only when someone edits. Its
// colors follow the site's code (the tok-* classes in styles.css). Tab indents; Esc then Tab moves
// on, so the keyboard is never trapped.

const theme = EditorView.theme({
  '&': { fontSize: '0.84rem', backgroundColor: 'transparent' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '0.85rem 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 1rem' },
  '.cm-scroller': { lineHeight: '1.6' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--accent) 7%, transparent)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--accent) 22%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
});

export default function CodeEditor({
  value,
  onChange,
  label,
  autoFocus = false,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: made once; later values arrive below
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
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
    return () => editor.destroy();
  }, []);

  // A reset from outside (back to the original) replaces the text.
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="nb-editor" />;
}
