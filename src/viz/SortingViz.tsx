import { Button, Chip, Input } from '@heroui/react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, BarChart3, Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { makeInput, parseNumbers, SORT_META, SORT_RUN, type SortAlgo, type SortStep } from './algorithms/sorting';
import { Field, PlayerBar, Segmented } from './kit/controls';
import { Legend, Panel, Pseudocode, Stat, StepNote, VizShell } from './kit/shell';
import { playerKeys, usePlayer } from './kit/usePlayer';

const ALGOS: { value: SortAlgo; label: string }[] = [
  { value: 'insertion', label: 'Insertion' },
  { value: 'selection', label: 'Selection' },
  { value: 'merge', label: 'Merge' },
];

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

  const steps = useMemo(() => SORT_RUN[algo](values), [algo, values]);
  const player = usePlayer<SortStep>(steps, 700);
  const s = player.step;
  const meta = SORT_META[algo];

  const apply = (next: number[]) => {
    setValues(next);
    setText(next.join(', '));
    setError(null);
  };
  const fromText = () => {
    const r = parseNumbers(text);
    if (r.values.length) apply(r.values);
    setError(r.error);
  };
  const gen = (kind: 'random' | 'sorted' | 'reversed') =>
    apply(makeInput(Math.max(6, Math.min(16, values.length)), kind, Math.floor(Math.random() * 1e9)));

  return (
    <VizShell
      title={title ?? `Vizualizuesi i renditjes — ${meta.name}`}
      subtitle={meta.idea}
      icon={<BarChart3 />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <Field label="Algoritmi">
            <Segmented label="Algoritmi" value={algo} onChange={setAlgo} options={ALGOS} />
          </Field>
          <Field label="Lista juaj" className="min-w-[14rem] flex-1">
            <div className="flex gap-2">
              <Input
                aria-label="Lista e numrave"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fromText()}
                className="min-w-0 flex-1 font-mono text-sm"
              />
              <Button size="sm" variant="secondary" onPress={fromText}>
                Zbato
              </Button>
            </div>
          </Field>
          <Field label="Gjenero">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="tertiary" onPress={() => gen('random')}>
                <Shuffle /> E rastit
              </Button>
              <Button size="sm" variant="tertiary" onPress={() => gen('sorted')}>
                <ArrowUpNarrowWide /> E renditur
              </Button>
              <Button size="sm" variant="tertiary" onPress={() => gen('reversed')}>
                <ArrowDownWideNarrow /> Rasti më i keq
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
              { color: 'var(--viz-compare)', label: 'Po krahasohet' },
              { color: 'var(--viz-active)', label: 'Sapo u shkrua' },
              { color: 'var(--viz-done)', label: 'Në pozicionin final' },
              { color: 'var(--viz-idle)', label: 'E parenditur' },
            ]}
          />
        </div>
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Krahasime" value={s.comparisons} tone="accent" />
            <Stat label="Shkrime" value={s.writes} />
          </div>
          <Panel title="Pseudokodi">
            <Pseudocode lines={meta.pseudo} active={s.line} />
          </Panel>
          <Panel title="Kompleksiteti">
            <div className="flex flex-wrap gap-1.5">
              <Chip size="sm" color="success" variant="soft">
                më i miri {meta.best}
              </Chip>
              <Chip size="sm" variant="soft">
                mesatar {meta.avg}
              </Chip>
              <Chip size="sm" color="danger" variant="soft">
                më i keqi {meta.worst}
              </Chip>
            </div>
          </Panel>
        </div>
      </div>
    </VizShell>
  );
}

function Bars({ step }: { step: SortStep }) {
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
