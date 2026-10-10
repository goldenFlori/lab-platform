import { z } from 'zod';
import type { NotebookKind } from './notebooks';
import { MAX_SECTION_KEYWORDS, MAX_SECTION_TEXT, MAX_SECTION_TITLE, MAX_SECTIONS } from './search-limits';

// Request and response shapes for search (#17). The app imports only types from this file.

/** A notebook's search index, sent by whoever uploads it (made by src/notebook/search.ts). */
export const searchSectionsInput = z.object({
  sections: z
    .array(
      z.object({
        anchor: z.string().min(1).max(200).nullable(),
        title: z.string().max(MAX_SECTION_TITLE),
        text: z.string().max(MAX_SECTION_TEXT),
        keywords: z.string().max(MAX_SECTION_KEYWORDS),
      }),
    )
    .max(MAX_SECTIONS),
});

/**
 * What a user may search in one course: the labs they see, their notebooks and the notebooks'
 * sections. Students get only labs open to them and solutions only once they are open; searching
 * happens in the browser over this.
 */
export type SearchIndex = {
  labs: { id: string; n: number; title: string; summary: string | null }[];
  notebooks: { id: string; labId: string; kind: NotebookKind; title: string }[];
  sections: { notebookId: string; anchor: string | null; title: string; text: string; keywords: string }[];
};
