import { z } from 'zod';

// An error in a browser, reported to the owner (#179): where it happened and what it said, never who,
// nor their code or answers. The app imports only types from this file.

export const CLIENT_ERROR_KINDS = ['error', 'rejection', 'render'] as const;

export const clientErrorInput = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  /** The error's message, ids masked, at most 300 characters. */
  message: z.string().max(300),
  /** Where in the app's own code: "/assets/index-1a2b3c.js:1:2345". */
  source: z.string().max(200).nullable(),
  /** The page as its route, never with ids: "/_authed/o/$org/courses/$courseId/labs/$labId". */
  page: z.string().max(200),
  /** The app's build, from its script's name. */
  build: z.string().max(60),
});

export type ClientError = z.infer<typeof clientErrorInput>;
