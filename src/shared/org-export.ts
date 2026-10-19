// An institution's data, downloaded by its admin (#117). The Worker sends it in pages, part by part,
// and the admin's browser assembles one JSON file, so a large institution stays within the free
// plan's CPU and D1 limits. No imports: the app uses it without Zod.
//
// Left out on purpose: password hashes and sessions (secrets), students' unsubmitted code edits
// (private to them, #49), join codes (invitations), and what is derived (search index, renderings).

export const EXPORT_PARTS = [
  'people',
  'memberships',
  'courseTemplates',
  'courses',
  'groups',
  'labs',
  'labAccess',
  'notebooks',
  'embeds',
  'exercises',
  'exerciseGrading',
  'assignments',
  'submissions',
  'grades',
  'exerciseCompletions',
  'labActivity',
  'aiUsage',
  'aiQuestions',
  'liveSessions',
  'surveys',
  'surveyRatings',
  'surveyComments',
  'deletionRequests',
  'erasures',
] as const;

export type ExportPart = (typeof EXPORT_PARTS)[number];

export function isExportPart(value: string): value is ExportPart {
  return (EXPORT_PARTS as readonly string[]).includes(value);
}

/** One page of a part; `next` is the cursor for the following page, null after the last. */
export type ExportPage = { rows: Record<string, unknown>[]; next: string | null };

export const EXPORT_FORMAT = 'lab-platform-export';

/** The file the admin downloads. */
export type OrganizationExport = {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  organization: { id: string; name: string; slug: string };
  tables: Record<ExportPart, Record<string, unknown>[]>;
  /** Each notebook's original .ipynb, by notebook id. */
  notebookFiles: Record<string, unknown>;
};
