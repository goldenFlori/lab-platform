// Turning a class list into accounts (#11). No imports: the app runs all of this in the browser.

/** Students per import request. The server writes them in a few statements, within D1's limits. */
export const IMPORT_CHUNK = 25;

/** No i, l, o, 0 or 1: easy to read off a printed slip and type on a phone without Shift. */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH = 12;

/** 12 characters from 31: about 59 bits, far beyond guessing at 10 tries per 15 minutes. */
export function generateStudentPassword(): string {
  const chars: string[] = [];
  while (chars.length < PASSWORD_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(PASSWORD_LENGTH))) {
      if (byte < 256 - (256 % PASSWORD_ALPHABET.length) && chars.length < PASSWORD_LENGTH) {
        chars.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length] as string);
      }
    }
  }
  return chars.join('');
}

/**
 * The username a name suggests: first and last name, lowercase, without accents ("Ëndrit Çela" →
 * "endrit.cela"). The server adds a number when it is taken ("endrit.cela2").
 */
export function usernameBase(fullName: string): string {
  const parts = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'student';
  const base = parts.length === 1 ? (parts[0] as string) : `${parts[0]}.${parts[parts.length - 1]}`;
  return base.slice(0, 40);
}

const HEADER =
  /^(nr\.?|no\.?|#|id|emri|emër|emer|mbiemri|atësia|atesia|emri dhe mbiemri|emri i plotë|emri i plote|studenti|student|name|first name|last name|surname|full name|e-?mail)$/i;

function cells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  const separator = line.includes(';') ? ';' : ',';
  // A small CSV reader: quoted fields may contain the separator.
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === separator && !quoted) {
      out.push(current);
      current = '';
    } else current += char;
  }
  out.push(current);
  return out;
}

/**
 * Full names from a pasted or uploaded list: one name per line, or rows copied from Excel or
 * Google Sheets (tab-separated) or CSV. First and last names in separate columns are joined.
 * Header rows, row numbers and e-mail addresses are left out.
 */
export function parseNameList(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = cells(line)
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (row.length === 0 || row.every((cell) => HEADER.test(cell))) continue;
    const name = row
      .filter((cell) => !/^\d+[.)]?$/.test(cell) && !cell.includes('@'))
      .slice(0, 3)
      .join(' ')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (name) names.push(name.slice(0, 100));
  }
  return names;
}
