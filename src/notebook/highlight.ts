import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

// Python syntax highlighting with Shiki: only the Python grammar and the two GitHub themes.
//
// It uses Oniguruma (WebAssembly), the regex engine the course site uses. Shiki's pure-JavaScript
// engine highlights differently after identifiers with letters such as "ë" (JavaScript's word
// boundaries are ASCII-only), and Albanian variable names are common in the labs. The converter
// runs in the browser, where WebAssembly is fine; it is not meant for the Worker, which forbids
// compiling WebAssembly at run time.

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [import('@shikijs/langs/python')],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  return highlighter;
}

/** Light and dark colors as CSS variables (no default color), as on the course site. */
export async function highlightPython(code: string) {
  return (await getHighlighter()).codeToHtml(code, {
    lang: 'python',
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}
