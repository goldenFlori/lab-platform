import { createContext, useContext } from 'react';
import type { PredictionInput } from '../../shared/predictions';

// First-try results (#151): a visualization embedded in a lab reports the student's first answer to
// each decision through this context, which the lab page provides. Elsewhere (the gallery, the
// presenter) there is none, and nothing is reported.

export type ReportResult = (result: PredictionInput) => void;

export const VizResults = createContext<ReportResult | null>(null);

export const useResults = () => useContext(VizResults);

/** A short, stable hash of a string (FNV-1a), in base 36. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Which decision this is, the same for every student who meets it: the step and the options and
 * answers as ids, never as text, so it does not change with the interface language. A run the
 * student changed (another graph, other values) gives other keys.
 */
export function decisionKey(step: number | string, options: string[], answers: string[]) {
  return `${step}:${hash(`${options.join(',')}>${answers.join(',')}`)}`;
}

/** The result as the API takes it, cut to its limits. */
export function result(r: PredictionInput): PredictionInput {
  return {
    ...r,
    decision: r.decision.slice(0, 120),
    pick: r.pick.slice(0, 80),
    answer: r.answer.slice(0, 80),
    prompt: r.prompt.slice(0, 240),
  };
}
