import type { RenderedNotebook } from './types';

// What a notebook's rendered.json holds. The converter's images and figures become files of their
// own, so they are left out. Kept apart from the converter, so that reading a stored notebook never
// loads Shiki or KaTeX.

/** Bump when the stored shape changes, so that older renderings can be found and converted again. */
export const STORED_FORMAT = 1;

export type StoredNotebook = Omit<RenderedNotebook, 'assets'> & { format: typeof STORED_FORMAT };

export function toStored({ assets: _assets, ...rendered }: RenderedNotebook): StoredNotebook {
  return { format: STORED_FORMAT, ...rendered };
}
