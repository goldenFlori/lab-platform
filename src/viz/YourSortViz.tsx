import { Code2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SORT_META, SORT_RUN, type SortAlgo } from './algorithms/sorting';
import { SORTING_TEXT } from './algorithms/sorting.text';
import { type VizlabRun, vizlabSteps } from './algorithms/vizlab';
import { VIZLAB_TEXT } from './algorithms/vizlab.text';
import { PlayerBar, Segmented } from './kit/controls';
import { Legend, Panel, Stat, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';
import { Bars } from './SortingViz';

// "Your code, visualized" (#69): a student's own sort, recorded by vizlab, plays next to the lab's
// reference algorithm on the same list, step for step, with both counts of comparisons.

const ALGOS: { value: SortAlgo; label: string }[] = [
  { value: 'insertion', label: 'Insertion' },
  { value: 'selection', label: 'Selection' },
  { value: 'merge', label: 'Merge' },
];

const TEXT = bilingual(
  {
    title: 'Kodi juaj, i vizualizuar',
    subtitle: 'Hapat që bëri kodi juaj mbi listën, krahas algoritmit të laboratorit.',
    yours: 'Kodi juaj',
    reference: 'Referenca',
    comparisons: 'Krahasime',
    writes: 'Shkrime',
    comparing: 'Po krahasohet',
    written: 'Sapo u shkrua',
    final: 'Në pozicionin final',
    unsorted: 'E parenditur',
  },
  {
    title: 'Your code, visualized',
    subtitle: "The steps your code took on the list, next to the lab's algorithm.",
    yours: 'Your code',
    reference: 'Reference',
    comparisons: 'Comparisons',
    writes: 'Writes',
    comparing: 'Being compared',
    written: 'Just written',
    final: 'In its final position',
    unsorted: 'Unsorted',
  },
);

export default function YourSortViz({ run }: { run: VizlabRun }) {
  const L = useText(TEXT);
  const S = useText(SORTING_TEXT);
  const V = useText(VIZLAB_TEXT);
  const [algo, setAlgo] = useState<SortAlgo>('insertion');
  const mine = useMemo(() => vizlabSteps(run, V), [run, V]);
  const start = run.events[0]?.arr ?? [];
  const reference = useMemo(() => SORT_RUN[algo](start, S), [algo, start, S]);
  // One player for both: each side stops at its own last step.
  const frames = useMemo(
    () => Array.from({ length: Math.max(mine.length, reference.length) }, (_, i) => i),
    [mine.length, reference.length],
  );
  const player = usePlayer(frames, 600);
  const at = player.step ?? 0;
  const own = mine[Math.min(at, mine.length - 1)];
  const ref = reference[Math.min(at, reference.length - 1)];
  if (!own || !ref) return null;

  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<Code2 />}
      onKeyDown={playerKeys(player)}
      footer={
        <>
          <StepNote text={own.note} />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <Panel title={L.yours}>
          <div data-testid="vizlab-mine" className="grid gap-3">
            <Bars step={own} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label={L.comparisons} value={own.comparisons} tone="accent" />
              <Stat label={L.writes} value={own.writes} />
            </div>
          </div>
        </Panel>
        <Panel title={`${L.reference}: ${SORT_META[algo].name}`}>
          <div className="grid gap-3">
            <Segmented label={L.reference} value={algo} onChange={setAlgo} options={ALGOS} />
            <Bars step={ref} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label={L.comparisons} value={ref.comparisons} tone="accent" />
              <Stat label={L.writes} value={ref.writes} />
            </div>
          </div>
        </Panel>
      </div>
      <div className="px-4 pb-4 sm:px-5">
        <Legend
          items={[
            { color: 'var(--viz-compare)', label: L.comparing },
            { color: 'var(--viz-active)', label: L.written },
            { color: 'var(--viz-done)', label: L.final },
            { color: 'var(--viz-idle)', label: L.unsorted },
          ]}
        />
      </div>
    </VizShell>
  );
}
