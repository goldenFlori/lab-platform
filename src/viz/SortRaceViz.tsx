import { Button, Chip, Slider } from '@heroui/react';
import { Flag, RefreshCw, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type Case, countComparisons, makeInput, SORT_RUN, type SortAlgo, type SortStep } from './algorithms/sorting';
import { Field, PlayerBar, Segmented } from './kit/controls';
import { ChartLegend, LineChart } from './kit/LineChart';
import { must } from './kit/must';
import { Panel, StepNote, VizShell } from './kit/shell';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Gara e krahasimeve — Laboratori 3, Ushtrimi 1
 *  Three algorithms on the same list. One tick = one comparison for each
 *  algorithm, so whoever needs fewer comparisons finishes first.
 * ===================================================================== */

const ALGOS: { id: SortAlgo; name: string; color: string }[] = [
  { id: 'insertion', name: 'Insertion Sort', color: 'var(--viz-compare)' },
  { id: 'selection', name: 'Selection Sort', color: 'var(--viz-reject)' },
  { id: 'merge', name: 'Merge Sort', color: 'var(--viz-path)' },
];

const CASES: { value: Case; label: string }[] = [
  { value: 'random', label: 'E rastit' },
  { value: 'sorted', label: 'E renditur' },
  { value: 'reversed', label: 'E kundërt' },
];

/** frames[k] = the step reached after k comparisons */
function framesByComparison(steps: SortStep[]) {
  const total = steps[steps.length - 1].comparisons;
  const frames: SortStep[] = new Array(total + 1);
  let si = 0;
  for (let k = 0; k <= total; k++) {
    while (si + 1 < steps.length && steps[si + 1].comparisons <= k) si++;
    frames[k] = steps[si];
  }
  frames[total] = steps[steps.length - 1];
  return frames;
}

export default function SortRaceViz({ n: initialN = 24, initialCase = 'random' }: { n?: number; initialCase?: Case }) {
  const [n, setN] = useState(initialN);
  const [kase, setKase] = useState<Case>(initialCase);
  const [seed, setSeed] = useState(11);

  const input = useMemo(() => makeInput(n, kase, seed), [n, kase, seed]);
  const runs = useMemo(
    () =>
      ALGOS.map((a) => {
        const frames = framesByComparison(SORT_RUN[a.id](input));
        return { ...a, frames, total: frames.length - 1 };
      }),
    [input],
  );
  const ticks = useMemo(() => Array.from({ length: Math.max(...runs.map((r) => r.total)) + 1 }, (_, i) => i), [runs]);
  const player = usePlayer(ticks, 140);
  const t = player.index;

  const finished = runs.filter((r) => r.total <= t).sort((a, b) => a.total - b.total);
  const leader = runs.reduce((a, b) => (b.total < a.total ? b : a));

  const growth = useMemo(() => {
    const ns = Array.from({ length: 16 }, (_, i) => (i + 1) * 4);
    return [
      ...ALGOS.map((a) => ({
        label: a.name,
        color: a.color,
        points: ns.map((x) => ({ x, y: countComparisons(a.id, makeInput(x, kase, seed)) })),
      })),
      {
        label: 'n(n−1)/2',
        color: 'var(--muted)',
        dash: '5 5',
        width: 1.5,
        points: ns.map((x) => ({ x, y: (x * (x - 1)) / 2 })),
      },
      {
        label: 'n·log₂n',
        color: 'var(--muted)',
        dash: '1 5',
        width: 2,
        points: ns.map((x) => ({ x, y: x * Math.log2(x) })),
      },
    ];
  }, [kase, seed]);

  const note =
    t === 0
      ? `Të tre algoritmet nisin mbi të njëjtën listë me **n = ${n}** elemente. Çdo hap = **një krahasim** për secilin.`
      : finished.length === runs.length
        ? `Gara mbaroi. Fitoi **${leader.name}** me ${leader.total} krahasime. Selection Sort bën gjithmonë n(n−1)/2 = ${(n * (n - 1)) / 2}.`
        : `Pas ${t} krahasimesh: ${finished.length ? `**${finished.map((f) => f.name).join(', ')}** ka përfunduar.` : 'asnjë algoritëm nuk ka përfunduar ende.'}`;

  return (
    <VizShell
      title="Gara e krahasimeve — rendi i rritjes"
      subtitle="I njëjti input, tre algoritme. Kush ka nevojë për më pak krahasime përfundon i pari."
      icon={<Timer />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <Field label={`Madhësia e listës — n = ${n}`} className="w-56">
            <Slider
              aria-label="Madhësia e listës"
              minValue={8}
              maxValue={48}
              step={4}
              value={n}
              onChange={(v) => typeof v === 'number' && setN(v)}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          </Field>
          <Field label="Rasti">
            <Segmented label="Rasti i inputit" value={kase} onChange={setKase} options={CASES} />
          </Field>
          <Button size="sm" variant="tertiary" onPress={() => setSeed(Math.floor(Math.random() * 1e9))}>
            <RefreshCw /> Listë e re
          </Button>
        </>
      }
      footer={
        <>
          <StepNote text={note} tone={finished.length === runs.length ? 'success' : 'accent'} />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid gap-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {runs.map((r) => {
            const f = r.frames[Math.min(t, r.total)];
            const done = r.total <= t;
            const place = finished.findIndex((x) => x.id === r.id);
            return (
              <div
                key={r.id}
                className={`rounded-2xl border p-3 transition-colors ${done ? 'border-success/50 bg-success-soft/40' : 'border-border bg-surface'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                    {r.name}
                  </span>
                  {done && (
                    <Chip size="sm" color="success" variant="soft">
                      <Flag className="size-3" /> {place + 1}.
                    </Chip>
                  )}
                </div>
                <MiniBars step={f} color={r.color} />
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xs text-muted">krahasime</span>
                  <span className="font-mono text-xl font-semibold tabular-nums">{Math.min(t, r.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <Panel
          title={`Rritja e krahasimeve — rasti "${must(
            CASES.find((c) => c.value === kase),
            'case',
          ).label.toLowerCase()}"`}
        >
          <LineChart
            series={growth}
            markerX={n}
            xLabel="n (madhësia e listës)"
            yLabel="krahasime"
            ariaLabel="Krahasimet në varësi të n"
            width={960}
            height={300}
          />
          <ChartLegend series={growth} />
        </Panel>
      </div>
    </VizShell>
  );
}

function MiniBars({ step, color }: { step: SortStep; color: string }) {
  const max = Math.max(...step.arr, 1);
  const sortedTo = step.sortedTo ?? -1;
  const set = new Set(step.sortedSet ?? []);
  const cmp = new Set(step.compare ?? []);
  return (
    <div className="mt-2 flex h-28 items-end gap-[2px] rounded-xl bg-[var(--viz-canvas)] p-1.5">
      {step.arr.map((v, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a bar is a position in the array; the values move between positions
          key={i}
          className="min-w-0 flex-1 rounded-t-[3px]"
          style={{
            height: `${10 + (v / max) * 88}%`,
            background: cmp.has(i) ? color : i <= sortedTo || set.has(i) ? 'var(--viz-done)' : 'var(--viz-idle)',
            transition: 'height 0.2s',
          }}
        />
      ))}
    </div>
  );
}
