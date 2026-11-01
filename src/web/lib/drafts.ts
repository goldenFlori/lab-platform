// Students' unsaved work kept in this browser (#178), until it is saved: see code-edits.tsx. Its own
// module, so signing out (auth.ts) can forget it without importing the editor.

/** A device copy older than this is from another time and is dropped. */
const DRAFT_DAYS = 7;

export type Draft = {
  code: Record<string, string>;
  traces: Record<string, Record<string, string>[]>;
  at: number;
  /** The notebook's version it was typed on (#208); absent in copies made before versions. */
  version?: string;
};

export const DRAFT_PREFIX = 'lab-work:';

export const readDraft = (key: string): Draft | null => {
  try {
    const draft = JSON.parse(localStorage.getItem(key) ?? 'null') as Draft | null;
    return draft && Date.now() - draft.at < DRAFT_DAYS * 86_400_000 ? draft : null;
  } catch {
    return null;
  }
};

export const writeDraft = (key: string, draft: Draft | null) => {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Storage full or blocked: the work is still in the page and the queue.
  }
};

/** Every device copy of work, at sign-out. */
export function forgetDrafts() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}
