import { z } from 'zod';
import type { Exercise } from './exercises';
import { tracePointsOk } from './trace-grading';
import { problemIssue, variantIssue } from './trace-problem';
import { isVisualizerId } from './visualizers';

// Request and response shapes for a lab's notebooks, their files and embeds (#14). The app
// imports only types from this file.

export const NOTEBOOK_KINDS = ['main', 'extra', 'solution'] as const;
export type NotebookKind = (typeof NOTEBOOK_KINDS)[number];

export { MAX_FILE_BYTES, ORIGINAL_FILE, RENDERED_FILE } from './notebook-files';

export const FILE_NAME = /^[A-Za-z0-9][\w.-]{0,99}$/;

export const createNotebookInput = z.object({
  kind: z.enum(NOTEBOOK_KINDS),
  title: z.string().trim().min(1).max(160),
  originalName: z.string().trim().min(1).max(200),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const embedsInput = z.object({
  embeds: z
    .array(
      z.object({
        cell: z.number().int().min(0).max(10_000),
        viz: z.string().refine(isVisualizerId, 'Unknown visualization'),
        title: z.string().trim().max(160).nullable().optional(),
        props: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .max(60)
    .refine((list) => new Set(list.map((e) => e.cell)).size === list.length, 'One embed per cell')
    .refine((list) => list.every((e) => JSON.stringify(e.props ?? {}).length <= 4000), 'Props too large')
    // A trace table with a pedagog's own problem (#166) must be one the table can trace.
    .refine(
      (list) =>
        list.every((e) => e.viz !== 'tabela-gjurmimit' || !e.props?.problem || problemIssue(e.props.problem) === null),
      'Invalid trace problem',
    )
    // And a variant per student (#167) must be one that can be made.
    .refine(
      (list) =>
        list.every((e) => e.viz !== 'tabela-gjurmimit' || !e.props?.variant || variantIssue(e.props.variant) === null),
      'Invalid trace variant',
    )
    // A graded trace table (#168) is worth a whole number of points.
    .refine((list) => list.every((e) => e.viz !== 'tabela-gjurmimit' || tracePointsOk(e.props)), 'Invalid points'),
});

export type Embed = { cell: number; viz: string; title: string | null; props: Record<string, unknown> | null };

export type NotebookSummary = {
  id: string;
  kind: NotebookKind;
  title: string;
  position: number;
  originalName: string;
  /** Staff also see notebooks whose upload has not finished (false). */
  ready: boolean;
};

export type NotebookDetail = NotebookSummary & { embeds: Embed[]; exercises: Exercise[] };
