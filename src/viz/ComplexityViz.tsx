import { type Key, Slider, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Field, Segmented, Toggle } from './kit/controls';
import { ChartLegend, LineChart } from './kit/LineChart';
import { Panel, StepNote, VizShell } from './kit/shell';

/* =====================================================================
 *  Eksploruesi i Kompleksitetit — Laboratori 2 dhe 3, Leksioni 2
 *  The classes and examples are the table of Laboratori 2.
 * ===================================================================== */

interface Klass {
  id: string;
  label: string;
  name: string;
  f: (n: number) => number;
  color: string;
  example: string;
}

const CLASSES: Klass[] = [
  {
    id: '1',
    label: 'O(1)',
    name: 'Konstant',
    f: () => 1,
    color: 'var(--viz-done)',
    example: 'Lexo elementin e parë të listës',
  },
  {
    id: 'logn',
    label: 'O(log n)',
    name: 'Logaritmik',
    f: (n) => Math.log2(Math.max(n, 1)),
    color: 'oklch(0.7 0.15 190)',
    example: 'Binary Search',
  },
  {
    id: 'n',
    label: 'O(n)',
    name: 'Linear',
    f: (n) => n,
    color: 'var(--viz-compare)',
    example: 'Kërko elementin në listë',
  },
  {
    id: 'nlogn',
    label: 'O(n log n)',
    name: 'Linearitmik',
    f: (n) => n * Math.log2(Math.max(n, 2)),
    color: 'var(--viz-path)',
    example: 'Merge Sort',
  },
  {
    id: 'n2',
    label: 'O(n²)',
    name: 'Kuadratik',
    f: (n) => n * n,
    color: 'var(--viz-active)',
    example: 'Insertion Sort, Selection Sort',
  },
  {
    id: '2n',
    label: 'O(2ⁿ)',
    name: 'Eksponencial',
    f: (n) => 2 ** Math.min(n, 1000),
    color: 'var(--viz-reject)',
    example: 'Problemet rekursive naive',
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

const fmtTime = (ops: number) => {
  const s = ops / 1e9;
  if (!Number.isFinite(s) || s > 3.15e7 * 1e6) return 'më shumë se mosha e universit';
  if (s < 1e-6) return `${(s * 1e9).toFixed(0)} ns`;
  if (s < 1e-3) return `${(s * 1e6).toFixed(1)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(1)} ms`;
  if (s < 3600) return `${s.toFixed(1)} s`;
  if (s < 86400 * 365) return `${(s / 86400).toFixed(1)} ditë`;
  return `${(s / (86400 * 365)).toExponential(1).replace('e+', '×10^')} vite`;
};

export default function ComplexityViz() {
  const [selected, setSelected] = useState(new Set<Key>(['n', 'nlogn', 'n2']));
  const [range, setRange] = useState('100');
  const [n, setN] = useState(32);
  const [logY, setLogY] = useState(true);

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
      title="Eksploruesi i kompleksitetit"
      subtitle="Lëvizni n dhe shihni sa operacione kërkon secila klasë. Për n të mëdha, rendi i rritjes vendos gjithçka."
      icon={<TrendingUp />}
      toolbar={
        <>
          <Field label="Klasat që krahasoni" className="min-w-0">
            <ToggleButtonGroup
              aria-label="Klasat e kompleksitetit"
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
          <Field label="Diapazoni">
            <Segmented label="Diapazoni i n" value={range} onChange={setRange} options={RANGES} />
          </Field>
          <Toggle label="Bosht Y logaritmik" value={logY} onChange={setLogY} />
        </>
      }
      footer={
        <StepNote
          text={
            active.length > 1
              ? `Për **n = ${nNow}**: ${worst.label} kërkon ${fmtNum(worst.f(nNow))} veprime, ${best.label} vetëm ${fmtNum(best.f(nNow))} — **${fmtNum(ratio)} herë** më pak.`
              : `Për **n = ${nNow}**: ${active[0].label} kërkon ${fmtNum(active[0].f(nNow))} veprime.`
          }
        />
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={`Madhësia e inputit — n = ${nNow}`}>
            <Slider
              aria-label="Madhësia e inputit n"
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
              xLabel="n (madhësia e inputit)"
              yLabel="veprime"
              ariaLabel="Rritja e funksioneve të kompleksitetit"
            />
          </div>
          <ChartLegend series={series} />
        </div>
        <div className="grid content-start gap-3">
          <Panel title={`Për n = ${nNow}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1.5 font-medium">Klasa</th>
                  <th className="pb-1.5 text-right font-medium">Veprime</th>
                  <th className="pb-1.5 text-right font-medium">Koha*</th>
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
                      {fmtTime(k.f(nNow))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">* me 10⁹ veprime në sekondë, si në Leksionin 3.</p>
          </Panel>
          <Panel title="Shembuj nga lënda">
            <ul className="space-y-1.5 text-sm">
              {active.map((k) => (
                <li key={k.id} className="flex gap-2">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: k.color }} />
                  <span>
                    <span className="font-semibold">{k.name}</span> <span className="text-muted">— {k.example}</span>
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
