// Spreadsheets out of the app (#114): RFC 4180 CSV that Excel opens with Albanian letters intact.

type Cell = string | number | null | undefined;

/** A cell as text: quoted when needed, and never read as a formula by a spreadsheet. */
function cell(value: Cell) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: Cell[][]) {
  // The byte order mark tells Excel the file is UTF-8.
  return `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** A file name from a title: lowercase, no accents or spaces. */
export function fileSlug(title: string) {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function downloadCsv(name: string, rows: Cell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
