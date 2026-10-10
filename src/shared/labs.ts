import { z } from 'zod';

// Request and response shapes for labs and their visibility (#12). The app imports only types.

export const labInput = z.object({
  /** The lab's number as students know it ("Laboratori 3"). */
  n: z.number().int().min(0).max(99),
  title: z.string().trim().min(1).max(160),
  week: z.number().int().min(1).max(60).nullable().optional(),
  summary: z.string().trim().max(600).nullable().optional(),
});

export const updateLabInput = labInput.partial();

const moment = z.iso.datetime({ offset: true }).nullable();

export const labAccessInput = z
  .object({
    /** One group, or null for the whole course. */
    groupId: z.string().nullable(),
    /** Null: hidden. In the past: open now. In the future: opens then. */
    visibleFrom: moment,
    visibleUntil: moment,
    solutionsFrom: moment,
  })
  .refine(
    (rule) => !rule.visibleFrom || !rule.visibleUntil || Date.parse(rule.visibleUntil) > Date.parse(rule.visibleFrom),
    {
      message: 'visibleUntil must come after visibleFrom',
    },
  );

export type LabState = 'hidden' | 'scheduled' | 'open' | 'closed';

export type LabRule = {
  groupId: string | null;
  visibleFrom: string | null;
  visibleUntil: string | null;
  solutionsFrom: string | null;
};

export type LabView = {
  id: string;
  n: number;
  title: string;
  week: number | null;
  summary: string | null;
  /** Students: may they see the solutions now? Staff always may. */
  solutionsAvailable: boolean;
  /** Staff only: the rules, and what they mean for the course and for each group right now. */
  visibility?: {
    rules: LabRule[];
    course: LabState;
    groups: { groupId: string; state: LabState; ownRule: boolean }[];
  };
};

export type LabList = {
  labs: LabView[];
  permissions: { manage: boolean; publish: boolean; staff: boolean };
};
