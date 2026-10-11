import { lazy, Suspense, useEffect, useState } from 'react';
import type { VizlabRun } from '../../../viz/algorithms/vizlab';
import { VizErrorBoundary, VizPlaceholder } from '../VizEmbed';

// A run's vizlab steps (#69), shown with the course's sorting visualizer next to the reference.
// The visualizer's code loads the first time a student's code is visualized.

const YourSortViz = lazy(() => import('../../../viz/YourSortViz'));

export function YourCodeViz({ src }: { src: string }) {
  const [run, setRun] = useState<VizlabRun | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => res.json() as Promise<VizlabRun>)
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
        <Suspense fallback={<VizPlaceholder />}>{run ? <YourSortViz run={run} /> : <VizPlaceholder />}</Suspense>
      </VizErrorBoundary>
    </div>
  );
}
