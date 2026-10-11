import { Button, Chip, Input } from '@heroui/react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, BarChart3, Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { makeInput, parseNumbers, SORT_META, SORT_RUN, type SortAlgo, type SortStep } from './algorithms/sorting';
import { SORTING_TEXT } from './algorithms/sorting.text';
import { Field, PlayerBar, Segmented } from './kit/controls';
import { Legend, Panel, Pseudocode, Stat, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

const ALGOS: { value: SortAlgo; label: string }[] = [
  { value: 'insertion', label: 'Insertion' },
  { value: 'selection', label: 'Selection' },
  { value: 'merge', label: 'Merge' },
];

const TEXT = bilingual(
  {
    title: (name: string) => `Vizualizuesi i renditjes — ${name}`,
    algorithm: 'Algoritmi',
    yourList: 'Lista juaj',
    numbers: 'Lista e numrave',
    apply: 'Zbato',
    generate: 'Gjenero',
    random: 'E rastit',
    sorted: 'E renditur',
    worst: 'Rasti më i keq',
    comparing: 'Po krahasohet',
    written: 'Sapo u shkrua',
    final: 'Në pozicionin final',
    unsorted: 'E parenditur',
    comparisons: 'Krahasime',
    writes: 'Shkrime',
    pseudocode: 'Pseudokodi',
    complexity: 'Kompleksiteti',
    best: 'më i miri',
    average: 'mesatar',
    worstCase: 'më i keqi',
  },
  {
    title: (name) => `Sorting visualizer — ${name}`,
    algorithm: 'Algorithm',
    yourList: 'Your list',
    numbers: 'List of numbers',
    apply: 'Apply',
    generate: 'Generate',
    random: 'Random',
    sorted: 'Sorted',
    worst: 'Worst case',
    comparing: 'Being compared',
    written: 'Just written',
    final: 'In its final position',
    unsorted: 'Unsorted',
    comparisons: 'Comparisons',
    writes: 'Writes',
    pseudocode: 'Pseudocode',
    complexity: 'Complexity',
    best: 'best',
    average: 'average',
    worstCase: 'worst',
  },
);

export default function SortingViz({
  algo: initialAlgo = 'insertion',
  values: initialValues = [6, 4, 3, 8, 5, 1, 7, 2],
  title,
}: {
  algo?: SortAlgo;
  values?: number[];
  title?: string;
}) {
  const [algo, setAlgo] = useState<SortAlgo>(initialAlgo);
  const [values, setValues] = useState<number[]>(initialValues);
  const [text, setText] = useState(initialValues.join(', '));
  const [error, setError] = useState<string | null>(null);

  const L = useText(TEXT);
  const S = useText(SORTING_TEXT);
  const steps = useMemo(() => SORT_RUN[algo](values, S), [algo, values, S]);
  const player = usePlayer<SortStep>(steps, 700);
  const s = player.step;
  const meta = SORT_META[algo];

  const apply = (next: number[]) => {
    setValues(next);
    setText(next.join(', '));
    setError(null);
  };
  const fromText = () => {
    const r = parseNumbers(text, S.parse);
    if (r.values.length) apply(r.values);
    setError(r.error);
  };
  const gen = (kind: 'random' | 'sorted' | 'reversed') =>
    apply(makeInput(Math.max(6, Math.min(16, values.length)), kind, Math.floor(Math.random() * 1e9)));

  return (
    <VizShell
      title={title ?? L.title(meta.name)}
      subtitle={S.meta[algo].idea}
      icon={<BarChart3 />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <Field label={L.algorithm}>
            <Segmented label={L.algorithm} value={algo} onChange={setAlgo} options={ALGOS} />
          </Field>
          <Field label={L.yourList} className="min-w-[14rem] flex-1">
            <div className="flex gap-2">
              <Input
                aria-label={L.numbers}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fromText()}
                className="min-w-0 flex-1 font-mono text-sm"
              />
              <Button size="sm" variant="secondary" onPress={fromText}>
                {L.apply}
              </Button>
            </div>
          </Field>
          <Field label={L.generate}>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="tertiary" onPress={() => gen('random')}>
                <Shuffle /> {L.random}
              </Button>
              <Button size="sm" variant="tertiary" onPress={() => gen('sorted')}>
                <ArrowUpNarrowWide /> {L.sorted}
              </Button>
              <Button size="sm" variant="tertiary" onPress={() => gen('reversed')}>
                <ArrowDownWideNarrow /> {L.worst}
              </Button>
            </div>
          </Field>
        </>
      }
      footer={
        <>
          {error && <p className="text-sm text-warning">{error}</p>}
          <StepNote text={s.note} />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <Bars step={s} />
          <Legend
            items={[
              { color: 'var(--viz-compare)', label: L.comparing },
              { color: 'var(--viz-active)', label: L.written },
              { color: 'var(--viz-done)', label: L.final },
              { color: 'var(--viz-idle)', label: L.unsorted },
            ]}
          />
        </div>
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={L.comparisons} value={s.comparisons} tone="accent" />
            <Stat label={L.writes} value={s.writes} />
          </div>
          <Panel title={L.pseudocode}>
            <Pseudocode lines={S.meta[algo].pseudo} active={s.line} />
          </Panel>
          <Panel title={L.complexity}>
            <div className="flex flex-wrap gap-1.5">
              <Chip size="sm" color="success" variant="soft">
                {L.best} {meta.best}
              </Chip>
              <Chip size="sm" variant="soft">
                {L.average} {meta.avg}
              </Chip>
              <Chip size="sm" color="danger" variant="soft">
                {L.worstCase} {meta.worst}
              </Chip>
            </div>
          </Panel>
        </div>
      </div>
    </VizShell>
  );
}

export function Bars({ step }: { step: SortStep }) {
  const arr = step.arr;
  const lo = Math.min(...arr, 0);
  const hi = Math.max(...arr, 1);
  const span = hi - lo || 1;
  const sorted = new Set<number>(
    step.sortedSet ??
      (step.sortedTo !== undefined && step.sortedTo >= 0 ? Array.from({ length: step.sortedTo + 1 }, (_, i) => i) : []),
  );
  const cmp = new Set(step.compare ?? []);
  const wr = new Set(step.write ?? []);
  const [r0, r1] = step.range ?? [-1, -1];

  return (
    <div className="relative rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid px-3 pt-8 pb-2">
      <div className="flex h-56 items-end gap-1 sm:h-64 sm:gap-1.5" role="img" aria-label={`Lista: ${arr.join(', ')}`}>
        {arr.map((v, i) => {
          const color = wr.has(i)
            ? 'var(--viz-active)'
            : cmp.has(i)
              ? 'var(--viz-compare)'
              : sorted.has(i)
                ? 'var(--viz-done)'
                : 'var(--viz-idle)';
          const inRange = i >= r0 && i <= r1;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a bar is a position in the array; the values move between positions
              key={i}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span
                className={`font-mono text-[0.7rem] font-semibold tabular-nums ${cmp.has(i) || wr.has(i) ? 'text-foreground' : 'text-muted'}`}
              >
                {v}
              </span>
              <div
                className={`w-full rounded-t-lg ${inRange ? 'ring-2 ring-accent/35 ring-offset-1 ring-offset-[var(--viz-canvas)]' : ''}`}
                style={{
                  height: `${8 + ((v - lo) / span) * 86}%`,
                  background: color,
                  transition: 'height 0.35s var(--ease-out-quart), background 0.2s',
                }}
              />
              <span className="font-mono text-[0.62rem] text-muted/70">{i}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
