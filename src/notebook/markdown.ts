import { katex } from '@mdit/plugin-katex';
import MarkdownIt from 'markdown-it';
import type { SectionKind } from './types';

// Markdown cells: split into sections at headings, classified by the headings the course really
// uses, and rendered with KaTeX. Ported from the course site's site/scripts/notebook.mjs.

const md = new MarkdownIt({
  html: false, // untrusted content: no raw HTML passthrough
  linkify: false, // no auto-linking of untrusted text
  typographer: false, // would mangle -> and math-ish punctuation
}).use(katex, { throwOnError: false, strict: false });

// Tables need a wrapper so wide matrices scroll instead of breaking the page.
md.renderer.rules.table_open = () => '<div class="nb-table-wrap"><table>';
md.renderer.rules.table_close = () => '</table></div>';

export const escapeHtml = (text: string) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[ëé]/g, 'e')
    .replace(/[çć]/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'seksion';

/* Derived from the real headings used across the course notebooks. A heading that matches
   nothing stays "normal". */
const SECTION_RULES: { kind: SectionKind; label: string; re: RegExp }[] = [
  { kind: 'homework', label: 'Detyrë Shtëpie', re: /detyr[ëeaë]*\s*(p[ëe]r\s*)?sht[ëe]pi/i },
  { kind: 'classwork', label: 'Punë në Klasë', re: /pun[ëe]\s*n[ëe]\s*klas/i },
  {
    kind: 'reflect',
    label: 'Pyetje Reflektuese',
    re: /(pyetje\s*reflektuese|mendoni\s*pak|pyetje\s*p[ëe]r\s*diskutim|pyetjet?\s*e\s*analiz)/i,
  },
  { kind: 'scenario', label: 'Skenar Real', re: /skenari?\s*real/i },
  { kind: 'exercise', label: 'Ushtrim', re: /^\s*(ushtrimi?|loja\s*finale|practice\s*exercises?)\b/i },
  { kind: 'theory', label: 'Teori', re: /^\s*(\d+\.\s*)?(teoria|hyrje|kujtues\s*teorik)\b/i },
  { kind: 'complexity', label: 'Kompleksiteti', re: /^\s*(\d+\.\s*)?complexity\s*$/i },
];

export function classifyHeading(text: string): { kind: SectionKind; label: string | null } {
  for (const rule of SECTION_RULES) if (rule.re.test(text)) return rule;
  return { kind: 'normal', label: null };
}

export type Section = { level: number; title: string | null; lines: string[] };

/** Splits on ATX headings; a "# comment" inside a fenced code block never splits a section. */
export function splitIntoSections(source: string): Section[] {
  const out: Section[] = [];
  let current: Section = { level: 0, title: null, lines: [] };
  let fence: string | null = null;

  for (const line of source.split('\n')) {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = (f[1] as string)[0] as string;
      else if (line.trim().startsWith(fence)) fence = null;
      current.lines.push(line);
      continue;
    }
    const h = !fence && line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      if (current.title !== null || current.lines.join('').trim()) out.push(current);
      current = {
        level: (h[1] as string).length,
        title: (h[2] as string).trim().replace(/\s*#+\s*$/, ''),
        lines: [],
      };
    } else {
      current.lines.push(line);
    }
  }
  if (current.title !== null || current.lines.join('').trim()) out.push(current);
  return out;
}

/* Fenced blocks that are really complexity statements, e.g.  ```\nKompleksiteti kohor:  O(V + E)\n``` */
function preRenderFences(body: string) {
  return body.replace(/```\s*\n([\s\S]*?)```/g, (whole, inner: string) => {
    const t = inner.trim();
    if (/^kompleksiteti/i.test(t) && t.split('\n').length <= 4) {
      const rows = t
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const m = l.match(/^([^:]+):\s*(.+)$/);
          return m
            ? `<div class="cx-row"><span class="cx-k">${escapeHtml((m[1] as string).trim())}</span><span class="cx-v">${escapeHtml((m[2] as string).trim())}</span></div>`
            : `<div class="cx-row"><span class="cx-v">${escapeHtml(l.trim())}</span></div>`;
        })
        .join('');
      return `\n\n<<<RAW:<div class="callout callout-complexity">${rows}</div>>>>\n\n`;
    }
    return whole;
  });
}

export function renderMarkdownBody(body: string) {
  const parts = preRenderFences(body).split(/<<<RAW:([\s\S]*?)>>>/);
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    html += i % 2 === 1 ? parts[i] : md.render(parts[i] as string);
  }
  return html;
}
