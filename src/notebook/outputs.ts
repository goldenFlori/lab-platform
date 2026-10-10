import type { CodeFlags, OutputItem } from './types';

// Code cell outputs, made safe and clean. Ported from the course site's site/scripts/notebook.mjs.
// Notebooks are untrusted: HTML is sanitized, JavaScript outputs are never run, and nothing is
// ever executed.

const MAX_STREAM_CHARS = 4000;

// Strips ANSI escape codes from stream output and tracebacks.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');
const stripAnsi = (text: string) => String(text).replace(ANSI, '');

const joined = (value: unknown) => (Array.isArray(value) ? value.join('') : String(value ?? ''));

/** First 12 hex digits of the SHA-1 of the text: the same asset names as the course site. */
async function hash(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

function fromBase64(b64: string) {
  const binary = atob(b64.replace(/[^A-Za-z0-9+/=]/g, ''));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Static inspection only: the code is never run to learn what it does. */
export function codeFlags(code: string): CodeFlags {
  return {
    pygame: /\bimport\s+pygame\b|\bpygame\./.test(code),
    tkinter: /\bimport\s+tkinter\b|\btkinter\./.test(code),
    widgets: /\bipywidgets\b/.test(code),
    plotly: /\bplotly\b/.test(code),
    subprocess: /\bsubprocess\b/.test(code),
    sysexit: /\bsys\.exit\s*\(/.test(code),
    networkx: /\bnetworkx\b/.test(code),
    matplotlib: /\bmatplotlib\b/.test(code),
  };
}

/** A cell whose real output is a desktop window or a live Jupyter widget. */
export function isInteractiveCell(flags: CodeFlags) {
  return flags.pygame || flags.tkinter || flags.subprocess || flags.widgets;
}

type RawOutput = {
  output_type?: string;
  name?: string;
  text?: string | string[];
  ename?: string;
  evalue?: string;
  traceback?: string[];
  data?: Record<string, unknown>;
};

/**
 * A closed Pygame/Tkinter window leaves a SystemExit or a "Kernel crashed" trace in the saved
 * notebook. That is the desktop program ending, not the algorithm failing.
 */
function classifyError(out: RawOutput, flags: CodeFlags): OutputItem {
  const name = out.ename || '';
  const traceback = stripAnsi((out.traceback || []).join('\n'));
  const gui = flags.pygame || flags.tkinter;
  if (name === 'SystemExit') {
    return {
      kind: 'error',
      benign: true,
      title: 'Programi u mbyll normalisht',
      note: 'Dritarja interaktive u mbyll. Kjo nuk është gabim — algoritmi përfundoi.',
    };
  }
  if (!name && /kernel crashed/i.test(traceback) && gui) {
    return {
      kind: 'error',
      benign: true,
      title: 'Dritarja u mbyll / kerneli u ristartua',
      note: 'Gjurmë e zakonshme kur një dritare Pygame mbyllet nga brenda Jupyter. Kodi vetë është në rregull — ekzekutojeni lokalisht.',
    };
  }
  return { kind: 'error', benign: false, name, evalue: out.evalue || '', traceback };
}

/** Conservative sanitizer for HTML from an untrusted notebook (pages also run DOMPurify). */
export function sanitizeHtml(html: string) {
  return String(html)
    .replace(/<\s*(script|iframe|object|embed|link|meta|form|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta|form|style)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

export async function renderOutputs(
  outputs: RawOutput[] | undefined,
  flags: CodeFlags,
  assets: Map<string, Uint8Array>,
) {
  const items: OutputItem[] = [];
  for (const out of outputs || []) {
    const type = out.output_type;

    if (type === 'stream') {
      let text = stripAnsi(joined(out.text));
      const truncated = text.length > MAX_STREAM_CHARS;
      if (truncated) text = `${text.slice(0, MAX_STREAM_CHARS)}\n…`;
      if (text.trim()) items.push({ kind: 'stream', stream: out.name || 'stdout', text, truncated });
      continue;
    }

    if (type === 'error') {
      items.push(classifyError(out, flags));
      continue;
    }

    if (type === 'display_data' || type === 'execute_result') {
      const data = out.data || {};

      if (data['application/vnd.plotly.v1+json']) {
        const json = JSON.stringify(data['application/vnd.plotly.v1+json']);
        const file = `plotly-${await hash(json)}.json`;
        assets.set(file, new TextEncoder().encode(json));
        items.push({ kind: 'plotly', file, bytes: json.length });
        continue;
      }
      if (data['application/vnd.jupyter.widget-view+json']) {
        items.push({ kind: 'widget' });
        continue;
      }
      if (data['image/png']) {
        const b64 = joined(data['image/png']).replace(/\s/g, '');
        const bytes = fromBase64(b64);
        const file = `img-${await hash(b64)}.png`;
        assets.set(file, bytes);
        items.push({ kind: 'image', file, bytes: bytes.length });
        continue;
      }
      if (data['image/svg+xml']) {
        const svg = joined(data['image/svg+xml']);
        const file = `img-${await hash(svg)}.svg`;
        assets.set(file, new TextEncoder().encode(sanitizeHtml(svg)));
        items.push({ kind: 'image', file, bytes: svg.length });
        continue;
      }
      if (data['application/javascript']) {
        // Never executed. Shown as an inert notice so the record stays honest.
        items.push({ kind: 'inert-js' });
        continue;
      }
      if (data['text/html']) {
        items.push({ kind: 'html', html: sanitizeHtml(joined(data['text/html'])) });
        continue;
      }
      if (data['text/plain']) {
        const text = stripAnsi(joined(data['text/plain']));
        if (text.trim()) items.push({ kind: 'stream', stream: 'result', text });
      }
    }
  }
  return items;
}

/*
 * The page shows a clean lab, not a log of someone's Jupyter session:
 *  - desktop programs (Pygame, Tkinter, launched scripts) and widgets keep no output at all; their
 *    interactive version is a web visualizer on the page instead;
 *  - errors, stderr, the Pygame start-up banner and the "⏳ pending" lines are dropped.
 */
const NOISE_LINE = [/^pygame \d+\.\d+/, /Hello from the pygame community/, /^\s*⏳/];

export function cleanOutputs(items: OutputItem[], flags: CodeFlags): OutputItem[] {
  if (isInteractiveCell(flags)) return [];
  const out: OutputItem[] = [];
  for (const item of items) {
    if (item.kind === 'error' || item.kind === 'widget' || item.kind === 'inert-js') continue;
    if (item.kind === 'stream') {
      if (item.stream === 'stderr') continue;
      const text = item.text
        .split('\n')
        .filter((line) => !NOISE_LINE.some((re) => re.test(line)))
        .join('\n')
        .replace(/^\n+|\s+$/g, '');
      if (text) out.push({ ...item, text });
      continue;
    }
    out.push(item);
  }
  return out;
}
