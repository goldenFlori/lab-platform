import { type Key, Slider, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Field, Segmented, Toggle } from './kit/controls';
import { ChartLegend, LineChart } from './kit/LineChart';
import { Panel, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';

/* =====================================================================
 *  Eksploruesi i Kompleksitetit — Laboratori 2 dhe 3, Leksioni 2
 *  The classes and examples are the table of Laboratori 2.
 * ===================================================================== */

interface Klass {
  id: string;
  label: string;
  f: (n: number) => number;
  color: string;
}

const CLASSES: Klass[] = [
  {
    id: '1',
    label: 'O(1)',
    f: () => 1,
    color: 'var(--viz-done)',
  },
  {
    id: 'logn',
    label: 'O(log n)',
    f: (n) => Math.log2(Math.max(n, 1)),
    color: 'oklch(0.7 0.15 190)',
  },
  {
    id: 'n',
    label: 'O(n)',
    f: (n) => n,
    color: 'var(--viz-compare)',
  },
  {
    id: 'nlogn',
    label: 'O(n log n)',
    f: (n) => n * Math.log2(Math.max(n, 2)),
    color: 'var(--viz-path)',
  },
  {
    id: 'n2',
    label: 'O(n²)',
    f: (n) => n * n,
    color: 'var(--viz-active)',
  },
  {
    id: '2n',
    label: 'O(2ⁿ)',
    f: (n) => 2 ** Math.min(n, 1000),
    color: 'var(--viz-reject)',
  },
];

const RANGES = [
  { value: '16', label: 'n ≤ 16' },
  { value: '100', label: 'n ≤ 100' },
  { value: '1000', label: 'n ≤ 1000' },
];

/** Thousands grouping that is identical on the server and in every browser. */
const group = (v: number) => {
  const [int, dec] = String(v).split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  return dec ? `${g},${dec}` : g;
};

const fmtNum = (v: number) => {
  if (!Number.isFinite(v)) return '∞';
  if (v >= 1e15) return v.toExponential(1).replace('e+', ' × 10^');
  if (v >= 1e6) return group(Math.round(v));
  return group(Math.round(v * 10) / 10);
};

const TEXT = bilingual(
  {
    names: {
      '1': 'Konstant',
      logn: 'Logaritmik',
      n: 'Linear',
      nlogn: 'Linearitmik',
      n2: 'Kuadratik',
      '2n': 'Eksponencial',
    } as Record<string, string>,
    examples: {
      '1': 'Lexo elementin e parë të listës',
      logn: 'Binary Search',
      n: 'Kërko elementin në listë',
      nlogn: 'Merge Sort',
      n2: 'Insertion Sort, Selection Sort',
      '2n': 'Problemet rekursive naive',
    } as Record<string, string>,
    universe: 'më shumë se mosha e universit',
    days: (d: string) => `${d} ditë`,
    years: (y: string) => `${y} vite`,
    title: 'Eksploruesi i kompleksitetit',
    subtitle:
      'Lëvizni n dhe shihni sa operacione kërkon secila klasë. Për n të mëdha, rendi i rritjes vendos gjithçka.',
    classes: 'Klasat që krahasoni',
    classesLabel: 'Klasat e kompleksitetit',
    range: 'Diapazoni',
    rangeLabel: 'Diapazoni i n',
    logY: 'Bosht Y logaritmik',
    compare: (n: number, worst: string, w: string, best: string, b: string, ratio: string) =>
      `Për **n = ${n}**: ${worst} kërkon ${w} veprime, ${best} vetëm ${b} — **${ratio} herë** më pak.`,
    one: (n: number, k: string, v: string) => `Për **n = ${n}**: ${k} kërkon ${v} veprime.`,
    size: (n: number) => `Madhësia e inputit — n = ${n}`,
    sizeLabel: 'Madhësia e inputit n',
    xLabel: 'n (madhësia e inputit)',
    yLabel: 'veprime',
    chart: 'Rritja e funksioneve të kompleksitetit',
    forN: (n: number) => `Për n = ${n}`,
    klass: 'Klasa',
    operations: 'Veprime',
    time: 'Koha*',
    timeNote: '* me 10⁹ veprime në sekondë, si në Leksionin 3.',
    examplesTitle: 'Shembuj nga lënda',
  },
  {
    names: {
      '1': 'Constant',
      logn: 'Logarithmic',
      n: 'Linear',
      nlogn: 'Linearithmic',
      n2: 'Quadratic',
      '2n': 'Exponential',
    },
    examples: {
      '1': 'Read the first element of the list',
      logn: 'Binary Search',
      n: 'Search for an element in a list',
      nlogn: 'Merge Sort',
      n2: 'Insertion Sort, Selection Sort',
      '2n': 'Naive recursive problems',
    },
    universe: 'longer than the age of the universe',
    days: (d) => `${d} days`,
    years: (y) => `${y} years`,
    title: 'Complexity explorer',
    subtitle:
      'Move n and see how many operations each class needs. For large n, the order of growth decides everything.',
    classes: 'Classes to compare',
    classesLabel: 'Complexity classes',
    range: 'Range',
    rangeLabel: 'Range of n',
    logY: 'Logarithmic Y axis',
    compare: (n, worst, w, best, b, ratio) =>
      `For **n = ${n}**: ${worst} needs ${w} operations, ${best} only ${b} — **${ratio} times** fewer.`,
    one: (n, k, v) => `For **n = ${n}**: ${k} needs ${v} operations.`,
    size: (n) => `Input size — n = ${n}`,
    sizeLabel: 'Input size n',
    xLabel: 'n (input size)',
    yLabel: 'operations',
    chart: 'Growth of the complexity functions',
    forN: (n) => `For n = ${n}`,
    klass: 'Class',
    operations: 'Operations',
    time: 'Time*',
    timeNote: '* at 10⁹ operations per second, as in Lecture 3.',
    examplesTitle: 'Examples from the course',
  },
);

const fmtTime = (L: (typeof TEXT)['sq'], ops: number) => {
  const s = ops / 1e9;
  if (!Number.isFinite(s) || s > 3.15e7 * 1e6) return L.universe;
  if (s < 1e-6) return `${(s * 1e9).toFixed(0)} ns`;
  if (s < 1e-3) return `${(s * 1e6).toFixed(1)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(1)} ms`;
  if (s < 3600) return `${s.toFixed(1)} s`;
  if (s < 86400 * 365) return L.days((s / 86400).toFixed(1));
  return L.years((s / (86400 * 365)).toExponential(1).replace('e+', '×10^'));
};

export default function ComplexityViz() {
  const [selected, setSelected] = useState(new Set<Key>(['n', 'nlogn', 'n2']));
  const [range, setRange] = useState('100');
  const [n, setN] = useState(32);
  const [logY, setLogY] = useState(true);
  const L = useText(TEXT);

  const nMax = Number(range);
  const nNow = Math.min(n, nMax);
  const active = CLASSES.filter((k) => selected.has(k.id));

  const series = useMemo(() => {
    const steps = 120;
    const xs = Array.from({ length: steps + 1 }, (_, i) => 1 + ((nMax - 1) * i) / steps);
    return active.map((k) => ({ label: k.label, color: k.color, points: xs.map((x) => ({ x, y: k.f(x) })) }));
  }, [active, nMax]);

  const yMax = useMemo(() => {
    const ys = series.flatMap((s) => s.points.map((p) => p.y)).filter(Number.isFinite);
    return Math.min(Math.max(...ys, 10), logY ? 1e30 : Math.max(...ys.filter((y) => y < 1e12), 10));
  }, [series, logY]);

  const ranked = [...active].sort((a, b) => a.f(nNow) - b.f(nNow));
  const best = ranked[0],
    worst = ranked[ranked.length - 1];
  const ratio = worst && best ? worst.f(nNow) / Math.max(best.f(nNow), 1e-9) : 1;

  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<TrendingUp />}
      toolbar={
        <>
          <Field label={L.classes} className="min-w-0">
            <ToggleButtonGroup
              aria-label={L.classesLabel}
              selectionMode="multiple"
              selectedKeys={selected}
              onSelectionChange={(keys) => keys.size > 0 && setSelected(new Set(keys))}
              size="sm"
              className="flex-wrap"
            >
              {CLASSES.map((k, i) => (
                <ToggleButton key={k.id} id={k.id}>
                  {i > 0 && <ToggleButtonGroup.Separator />}
                  <span className="size-2 rounded-full" style={{ background: k.color }} />
                  {k.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Field>
          <Field label={L.range}>
            <Segmented label={L.rangeLabel} value={range} onChange={setRange} options={RANGES} />
          </Field>
          <Toggle label={L.logY} value={logY} onChange={setLogY} />
        </>
      }
      footer={
        <StepNote
          text={
            active.length > 1
              ? L.compare(nNow, worst.label, fmtNum(worst.f(nNow)), best.label, fmtNum(best.f(nNow)), fmtNum(ratio))
              : L.one(nNow, active[0].label, fmtNum(active[0].f(nNow)))
          }
        />
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={L.size(nNow)}>
            <Slider
              aria-label={L.sizeLabel}
              minValue={1}
              maxValue={nMax}
              value={nNow}
              onChange={(v) => typeof v === 'number' && setN(v)}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          </Field>
          <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] p-2">
            <LineChart
              series={series}
              logY={logY}
              yMax={yMax}
              markerX={nNow}
              xLabel={L.xLabel}
              yLabel={L.yLabel}
              ariaLabel={L.chart}
            />
          </div>
          <ChartLegend series={series} />
        </div>
        <div className="grid content-start gap-3">
          <Panel title={L.forN(nNow)}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1.5 font-medium">{L.klass}</th>
                  <th className="pb-1.5 text-right font-medium">{L.operations}</th>
                  <th className="pb-1.5 text-right font-medium">{L.time}</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((k) => (
                  <tr key={k.id} className="border-t border-separator">
                    <td className="py-1.5">
                      <span className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                        <span className="size-2 rounded-full" style={{ background: k.color }} />
                        {k.label}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs tabular-nums">{fmtNum(k.f(nNow))}</td>
                    <td className="py-1.5 text-right font-mono text-xs text-muted tabular-nums">
                      {fmtTime(L, k.f(nNow))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{L.timeNote}</p>
          </Panel>
          <Panel title={L.examplesTitle}>
            <ul className="space-y-1.5 text-sm">
              {active.map((k) => (
                <li key={k.id} className="flex gap-2">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: k.color }} />
                  <span>
                    <span className="font-semibold">{L.names[k.id]}</span>{' '}
                    <span className="text-muted">— {L.examples[k.id]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </VizShell>
  );
}
