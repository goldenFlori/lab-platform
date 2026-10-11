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
//
// The editor owns its text once it opens: copying the page's value back in after each render would
// overwrite keys typed while that render was on its way. A reset reaches it as a new mount (a new
// `key`), with its new starting text.

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
  initialValue,
  onChange,
  label,
  autoFocus = false,
}: {
  initialValue: string;
  onChange: (code: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
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
    if (autoFocus) editor.focus();
    return () => editor.destroy();
  }, []);

  return <div ref={host} className="nb-editor" />;
}
