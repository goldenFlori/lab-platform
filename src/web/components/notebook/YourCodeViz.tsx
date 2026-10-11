import { lazy, Suspense, useEffect, useState } from 'react';
import type { VizlabRun } from '../../../viz/algorithms/vizlab';
import type { VizlabGraphRun } from '../../../viz/algorithms/vizlab-graph';
import { VizErrorBoundary, VizPlaceholder } from '../VizEmbed';

// A run's vizlab steps, shown with the course's visualizers next to the reference: sorting (#69) or
// graphs (#70). A visualizer's code loads the first time a student's code needs it.

const YourSortViz = lazy(() => import('../../../viz/YourSortViz'));
const YourGraphViz = lazy(() => import('../../../viz/YourGraphViz'));

export function YourCodeViz({ src }: { src: string }) {
  const [run, setRun] = useState<VizlabRun | VizlabGraphRun | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => res.json() as Promise<VizlabRun | VizlabGraphRun>)
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);
  return (
    <div className="viz-embed my-2" data-testid="vizlab">
      <VizErrorBoundary>
        <Suspense fallback={<VizPlaceholder />}>
          {!run ? <VizPlaceholder /> : run.kind === 'graph' ? <YourGraphViz run={run} /> : <YourSortViz run={run} />}
        </Suspense>
      </VizErrorBoundary>
    </div>
  );
}
