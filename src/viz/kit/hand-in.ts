import { createContext, useContext } from 'react';
import type { TraceAnswers } from '../../shared/trace-answers';

// A graded trace table on a lab page (#168): the student's saved rows, whether its notebook is open to
// them for submission, and how to save. Elsewhere (the gallery, the presenter) there is none, and the
// table is practice.

export type HandIn = {
  /** Undefined while loading. */
  state: TraceAnswers | undefined;
  save: (rows: Record<string, string>[]) => void;
};

export const VizHandIn = createContext<HandIn | null>(null);

export const useHandIn = () => useContext(VizHandIn);
