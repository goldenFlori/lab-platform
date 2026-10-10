// The names of a notebook's two fixed files. No imports, so the app can use them without Zod.

/** The notebook as uploaded. */
export const ORIGINAL_FILE = 'notebook.ipynb';
/** The converted cells (`StoredNotebook`, gzipped); its images and figures keep the converter's names. */
export const RENDERED_FILE = 'rendered.json';
