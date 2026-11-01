/** Saves text made in the browser as a file. */
export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Downloads a notebook's original with someone's code in it (#214), named after the original. The
 * original is fetched with the session, by its versioned address.
 */
export async function downloadWithCode(
  original: { url: string; name: string },
  code: ReadonlyMap<number, string>,
  label: string,
) {
  const res = await fetch(original.url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`original notebook: ${res.status}`);
  const { ipynbNamed, withCode } = await import('../../notebook/with-code');
  downloadText(ipynbNamed(original.name, label), withCode(await res.text(), code), 'application/x-ipynb+json');
}
