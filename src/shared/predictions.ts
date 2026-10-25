import { z } from 'zod';

// First-try results of predictions and trace tables (#151). A student's first answer to each
// decision of an embedded visualization is kept, right or not and what they picked; later tries
// change nothing. Practice, never a grade: students see their own accuracy per topic, and staff
// with analytics see counts from five students up, never names. The app imports only types.

/** The algorithm a decision practises: a predict question's, or a trace table's (trace-…). */
export const PREDICTION_TOPICS = [
  'insertion',
  'selection',
  'merge',
  'bfs',
  'dfs',
  'kruskal',
  'prim',
  'topo',
  'dijkstra',
  'bellman',
  'floyd',
  'flow',
  'trace-kruskal',
  'trace-prim',
  'trace-kahn',
  'trace-dijkstra',
  'trace-bellman',
  'trace-floyd',
] as const;

export type PredictionTopic = (typeof PREDICTION_TOPICS)[number];

export const predictionInput = z.object({
  topic: z.enum(PREDICTION_TOPICS),
  /** Which decision of the run, the same for every student who sees the same run. */
  decision: z.string().trim().min(1).max(120),
  right: z.boolean(),
  /** What the student answered first (an option, or a trace row's first wrong cell). */
  pick: z.string().max(80),
  /** The right answer, as shown. */
  answer: z.string().max(80),
  /** The question, as the student saw it, for staff reading the hardest decisions. */
  prompt: z.string().max(240),
});

export type PredictionInput = z.infer<typeof predictionInput>;

/** Staff see a result only once this many students are behind it. */
export const MIN_STUDENTS = 5;

/** A student's own first-try accuracy on one topic. */
export type TopicResult = { topic: PredictionTopic; asked: number; right: number };

/** One decision students found hard, and the wrong answer most of them gave. */
export type HardDecision = {
  prompt: string;
  answer: string;
  students: number;
  right: number;
  wrong: { pick: string; students: number } | null;
};

/** An embedded visualization's first-try results in a course, for the groups shown. */
export type EmbedUnderstanding = {
  labId: string;
  lab: number;
  labTitle: string;
  notebook: string;
  cell: number;
  viz: string;
  title: string | null;
  topics: PredictionTopic[];
  /** Students who answered at least one of its decisions. */
  students: number;
  answers: number;
  right: number;
  /** At most three, the lowest first-try accuracy first, each from MIN_STUDENTS students up. */
  hardest: HardDecision[];
};

export type UnderstandingReport = { group: string | null; embeds: EmbedUnderstanding[] };
