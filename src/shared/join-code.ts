// Join codes: 8 characters without look-alikes (no I, L, O, 0 or 1), shown as XXXX-XXXX so they
// are easy to read off a projector and type on a phone. 31^8 is about 850 billion codes.
// No imports: usable by the API and the app.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

export function generateJoinCode(): string {
  const chars: string[] = [];
  while (chars.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH))) {
      // Bytes past the last full multiple of the alphabet are dropped, so every character is equally likely.
      if (byte < 256 - (256 % ALPHABET.length) && chars.length < LENGTH)
        chars.push(ALPHABET[byte % ALPHABET.length] as string);
    }
  }
  return chars.join('');
}

/** What was typed, as stored: uppercase, without spaces or dashes. Undefined when it cannot be a code. */
export function normalizeJoinCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : undefined;
}

export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
