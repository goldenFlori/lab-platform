import { createContext, useContext } from 'react';

// Who is looking at a visualization embedded in a lab (#167): the seed of their own variant, and for
// staff the students whose variants they may look up. Elsewhere (the gallery, the presenter) there is
// none, and a variant shows an example.

export type Learner = {
  seed: string;
  /** Staff only: the students of the groups they manage, each with their seed for this embed. */
  others: { name: string; seed: string }[];
};

export const VizLearner = createContext<Learner | null>(null);

export const useLearner = () => useContext(VizLearner);
