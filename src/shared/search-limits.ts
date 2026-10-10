// How much of a notebook its search index keeps (#17). No imports: the converter uses these in the
// browser, and the API checks them.

/** Sections per notebook: the course notebooks have at most about 70. */
export const MAX_SECTIONS = 400;
/** Characters of text kept per section. */
export const MAX_SECTION_TEXT = 4000;
/** Characters of function and class names kept per section. */
export const MAX_SECTION_KEYWORDS = 400;
/** Characters of a section's title. */
export const MAX_SECTION_TITLE = 300;
