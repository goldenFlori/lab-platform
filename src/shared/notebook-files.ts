// A notebook's files: the two fixed names and the size limit. No imports, so the app can use them
// without Zod.

/** The notebook as uploaded. */
export const ORIGINAL_FILE = 'notebook.ipynb';
/** The converted cells (`StoredNotebook`, gzipped); its images and figures keep the converter's names. */
export const RENDERED_FILE = 'rendered.json';

/** Largest file accepted in one request (stored in chunks; Workers accept 100 MB bodies). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Files of a new version (#208) wait under this prefix until it is put in place. */
export const STAGED_PREFIX = 'next.';
