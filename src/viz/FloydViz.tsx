import { Button, Chip } from '@heroui/react';
import { FastForward, Grid2x2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type FwStep, floydSteps, fwPath, INF, inf, weightMatrix } from './algorithms/shortest';
import { SHORTEST_TEXT } from './algorithms/shortest.text';
import { Choice, Field, PlayerBar, Segmented } from './kit/controls';
import { fitLayout, type GEdge, type GNode, GraphCanvas } from './kit/GraphCanvas';
import { must } from './kit/must';
import { Panel, Stat, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Floyd-Warshall — Laboratori 7 (Ush. 5, Punë në Klasë 3) dhe 8 (Ush. 1–2)
 * ===================================================================== */

interface FwPreset {
  id: string;
  directed: boolean;
  labels: string[];
  edges: GEdge[];
  pos?: [number, number][];
}

const E = (list: number[][], L: string[]): GEdge[] => list.map(([u, v, w]) => ({ u: L[u], v: L[v], w }));

const URBAN_L = ['DQ', 'QR-A', 'QR-B', 'QR-C', 'PD-1', 'PD-2', 'PD-3', 'PD-4'];
const MED_L = ['SQ', 'SA-1', 'SA-2', 'SA-3', 'KR-A', 'KR-B', 'QU-1', 'QU-2'];
const CITY6 = ['Alfa', 'Beta', 'Gama', 'Delta', 'Eta', 'Zeta'];

const TEXT = bilingual(
  {
    presets: {
      klasa3: {
        name: 'Punë në Klasë 3 — me dorë',
        note: 'Matrica D⁰ e Problemit 3 të Laboratorit 7. Kontrolloni D¹ … D⁴ tuaja.',
      },
      ush5: { name: 'Matrica e distancave (Lab 7, Ush. 5)', note: 'Gjashtë qytete me rrugë të dyanshme.' },
      urbanpost: {
        name: 'UrbanPost — logjistika (Lab 8, Ush. 1)',
        note: 'Depoja qendrore, 3 qendra rajonale dhe 4 pika dorëzimi; 21 harqe të drejtuara.',
      },
      mjekesor: {
        name: 'Klinikat dhe urgjenca (Lab 8, Ush. 2)',
        note: 'Spitali qendror, stacionet e ambulancave, klinikat rajonale dhe qendrat e urgjencës.',
      },
    } as Record<string, { name: string; note: string }>,
    title: 'Floyd-Warshall — rrugët ndërmjet të gjitha çifteve',
    subtitle:
      'D[i][j] = min(D[i][j], D[i][k] + D[k][j]). Për çdo k, pyesim: a e shkurton kalimi nëpër k rrugën nga i te j?',
    network: 'Rrjeti',
    matrix: 'Matrica',
    distances: 'D — distancat',
    predecessors: 'P — paraardhësit',
    nextK: 'k tjetër',
    rebuild: 'Rindërtimi i rrugës nga matrica P',
    from: 'Nga',
    to: 'Te',
    cost: 'kosto',
    noPath: 'nuk ka rrugë (ende)',
    improvements: 'Përmirësime',
    step: 'Hapi',
    matrixD: (zero: boolean) => `Matrica D${zero ? '⁰' : ''}`,
    matrixP: 'Matrica P (paraardhësi i j në rrugën nga i)',
    cycle: 'cikël negativ',
    legendStart: 'Rreshti dhe kolona e',
    legendEnd: 'nuk ndryshojnë gjatë fazës k. Qeliza e verdhë = (i, j) që po krahasohet; e gjelbër = u përmirësua.',
  },
  {
    presets: {
      klasa3: { name: 'Class work 3 — by hand', note: 'The D⁰ matrix of Problem 3 of Lab 7. Check your D¹ … D⁴.' },
      ush5: { name: 'The distance matrix (Lab 7, Ex. 5)', note: 'Six cities with two-way roads.' },
      urbanpost: {
        name: 'UrbanPost — logistics (Lab 8, Ex. 1)',
        note: 'The central depot, 3 regional centres and 4 delivery points; 21 directed edges.',
      },
      mjekesor: {
        name: 'Clinics and emergencies (Lab 8, Ex. 2)',
        note: 'The central hospital, ambulance stations, regional clinics and emergency centres.',
      },
    },
    title: 'Floyd-Warshall — paths between all pairs',
    subtitle:
      'D[i][j] = min(D[i][j], D[i][k] + D[k][j]). For each k we ask: does going through k shorten the path from i to j?',
    network: 'Network',
    matrix: 'Matrix',
    distances: 'D — distances',
    predecessors: 'P — predecessors',
    nextK: 'next k',
    rebuild: 'Rebuilding the path from the matrix P',
    from: 'From',
    to: 'To',
    cost: 'cost',
    noPath: 'no path (yet)',
    improvements: 'Improvements',
    step: 'Step',
    matrixD: (zero) => `Matrix D${zero ? '⁰' : ''}`,
    matrixP: 'Matrix P (the predecessor of j on the path from i)',
    cycle: 'negative cycle',
    legendStart: 'The row and column of',
    legendEnd: 'do not change during phase k. The yellow cell = the (i, j) being compared; green = it improved.',
  },
);

export const FW_PRESETS: FwPreset[] = [
  {
    id: 'klasa3',
    directed: true,
    labels: ['0', '1', '2', '3'],
    edges: E(
      [
        [0, 1, 3],
        [0, 3, 7],
        [1, 0, 8],
        [1, 2, 2],
        [2, 0, 5],
        [2, 3, 1],
        [3, 0, 2],
      ],
      ['0', '1', '2', '3'],
    ),
    pos: [
      [120, 80],
      [480, 80],
      [480, 320],
      [120, 320],
    ],
  },
  {
    id: 'ush5',
    directed: false,
    labels: CITY6,
    edges: E(
      [
        [0, 1, 3],
        [0, 3, 7],
        [1, 2, 2],
        [1, 4, 4],
        [2, 4, 1],
        [2, 5, 5],
        [3, 4, 2],
        [4, 5, 3],
      ],
      CITY6,
    ),
    pos: [
      [150, 200],
      [330, 120],
      [500, 200],
      [150, 480],
      [330, 560],
      [500, 480],
    ],
  },
  {
    id: 'urbanpost',
    directed: true,
    labels: URBAN_L,
    edges: E(
      [
        [0, 1, 12],
        [0, 2, 18],
        [0, 3, 22],
        [1, 2, 7],
        [1, 4, 15],
        [1, 5, 20],
        [2, 1, 7],
        [2, 3, 9],
        [2, 5, 11],
        [2, 6, 17],
        [3, 2, 9],
        [3, 6, 13],
        [3, 7, 19],
        [4, 5, 6],
        [4, 7, 24],
        [5, 4, 6],
        [5, 6, 8],
        [5, 7, 14],
        [6, 5, 8],
        [6, 7, 10],
        [7, 6, 10],
      ],
      URBAN_L,
    ),
    pos: [
      [60, 220],
      [250, 80],
      [250, 220],
      [250, 360],
      [470, 60],
      [470, 200],
      [470, 340],
      [660, 220],
    ],
  },
  {
    id: 'mjekesor',
    directed: true,
    labels: MED_L,
    edges: E(
      [
        [0, 1, 8],
        [0, 2, 12],
        [0, 3, 15],
        [1, 0, 8],
        [1, 4, 10],
        [1, 6, 18],
        [2, 0, 12],
        [2, 1, 6],
        [2, 4, 14],
        [2, 5, 11],
        [3, 5, 9],
        [3, 7, 13],
        [4, 6, 7],
        [4, 7, 16],
        [5, 4, 5],
        [5, 7, 8],
        [6, 7, 6],
        [6, 1, 20],
        [7, 3, 17],
      ],
      MED_L,
    ),
    pos: [
      [60, 220],
      [250, 70],
      [250, 220],
      [250, 370],
      [470, 100],
      [470, 300],
      [660, 100],
      [660, 300],
    ],
  },
];

const W = 680;
const H = 420;
const soft = (c: string, p = 24) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

export default function FloydViz({ preset: initial = 'klasa3' }: { preset?: string }) {
  const X = useText(TEXT);
  const S = useText(SHORTEST_TEXT);
  const p0 = FW_PRESETS.find((p) => p.id === initial) ?? FW_PRESETS[0];
  const [presetId, setPresetId] = useState(p0.id);
  const preset = must(
    FW_PRESETS.find((p) => p.id === presetId),
    'preset',
  );
  const [show, setShow] = useState<'D' | 'P'>('D');
  const L = preset.labels;
  const [qs, setQs] = useState(L[0]);
  const [qt, setQt] = useState(L[L.length - 1]);

  const nodes = useMemo<GNode[]>(
    () =>
      fitLayout(
        L.map((id, i) => ({
          id,
          x: preset.pos?.[i]?.[0] ?? Math.cos((2 * Math.PI * i) / L.length) * 200,
          y: preset.pos?.[i]?.[1] ?? Math.sin((2 * Math.PI * i) / L.length) * 200,
        })),
        W,
        H,
        56,
      ),
    [preset, L],
  );
  const steps = useMemo<FwStep[]>(
    () => floydSteps(weightMatrix(L, preset.edges, preset.directed), L, S),
    [preset, L, S],
  );
  const player = usePlayer(steps, 650);
  const s = player.step;

  const load = (id: string) => {
    const p = must(
      FW_PRESETS.find((x) => x.id === id),
      'preset',
    );
    setPresetId(id);
    setQs(p.labels[0]);
    setQt(p.labels[p.labels.length - 1]);
  };
  const nextK = () => {
    const at = steps.findIndex((x, idx) => idx > player.index && x.phase === 'k');
    player.go(at === -1 ? steps.length - 1 : at);
  };

  const si = L.indexOf(qs),
    ti = L.indexOf(qt);
  const route = si >= 0 && ti >= 0 ? fwPath(s.P, si, ti) : null;
  const routeSet = new Set<string>();
  if (route) for (let k = 0; k + 1 < route.length; k++) routeSet.add(`${L[route[k]]}>${L[route[k + 1]]}`);

  const nodeLook = (n: GNode) => {
    const idx = L.indexOf(n.id);
    if (idx === s.k && s.phase !== 'init' && s.phase !== 'done')
      return { fill: soft('var(--viz-active)', 30), stroke: 'var(--viz-active)', ring: 'var(--viz-active)', sub: 'k' };
    if (idx === s.i) return { fill: soft('var(--viz-path)', 28), stroke: 'var(--viz-path)', sub: 'i' };
    if (idx === s.j) return { fill: soft('var(--viz-compare)', 32), stroke: 'var(--viz-compare)', sub: 'j' };
    return {};
  };
  const edgeLook = (e: GEdge) => {
    const onRoute = routeSet.has(`${e.u}>${e.v}`) || (!preset.directed && routeSet.has(`${e.v}>${e.u}`));
    const ik = s.i >= 0 && s.k >= 0 && ((e.u === L[s.i] && e.v === L[s.k]) || (e.u === L[s.k] && e.v === L[s.j]));
    if (ik && s.phase === 'cmp')
      return { stroke: s.improved ? 'var(--viz-done)' : 'var(--viz-compare)', width: 3.5, front: true };
    if (onRoute) return { stroke: 'var(--viz-active)', width: 4, front: true, animated: true };
    return {};
  };

  const M = show === 'D' ? s.D : s.P;
  return (
    <VizShell
      title={X.title}
      subtitle={X.subtitle}
      icon={<Grid2x2 />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <Field label={X.network}>
            <Choice
              label={X.network}
              value={presetId}
              onChange={load}
              options={FW_PRESETS.map((p) => ({ value: p.id, label: X.presets[p.id]?.name ?? p.id }))}
              className="w-72"
            />
          </Field>
          <Field label={X.matrix}>
            <Segmented
              label={X.matrix}
              value={show}
              onChange={setShow}
              options={[
                { value: 'D', label: X.distances },
                { value: 'P', label: X.predecessors },
              ]}
            />
          </Field>
          <Button size="sm" variant="tertiary" onPress={nextK} isDisabled={player.atEnd}>
            <FastForward /> {X.nextK}
          </Button>
        </>
      }
      footer={
        <>
          <StepNote text={s.note} tone={s.phase === 'done' ? 'success' : s.improved ? 'success' : 'accent'} />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
            <GraphCanvas
              nodes={nodes}
              edges={preset.edges}
              directed={preset.directed}
              width={W}
              height={H}
              shape={L.some((l) => l.length > 2) ? 'pill' : 'circle'}
              nodeLook={nodeLook}
              edgeLook={edgeLook}
              ariaLabel={X.presets[preset.id]?.name ?? preset.id}
            />
          </div>
          <Panel title={X.rebuild}>
            <div className="flex flex-wrap items-center gap-2">
              <Choice
                label={X.from}
                value={qs}
                onChange={setQs}
                options={L.map((l) => ({ value: l, label: l }))}
                className="w-32"
              />
              <span className="text-muted">→</span>
              <Choice
                label={X.to}
                value={qt}
                onChange={setQt}
                options={L.map((l) => ({ value: l, label: l }))}
                className="w-32"
              />
              <span className="text-sm">
                {route ? (
                  <>
                    <b>{route.map((x) => L[x]).join(' → ')}</b> · {X.cost}{' '}
                    <b className="font-mono">{inf(s.D[si][ti])}</b>
                  </>
                ) : (
                  <span className="text-muted">{X.noPath}</span>
                )}
              </span>
            </div>
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="k" value={s.k >= 0 && s.phase !== 'init' ? L[s.k] : '—'} tone="accent" />
            <Stat label={X.improvements} value={s.updates} tone="success" />
            <Stat label={X.step} value={`${player.index + 1} / ${steps.length}`} />
          </div>
          <Panel
            title={show === 'D' ? X.matrixD(s.phase === 'init') : X.matrixP}
            aside={
              s.negativeCycle ? (
                <Chip size="sm" color="danger" variant="soft">
                  {X.cycle}
                </Chip>
              ) : undefined
            }
          >
            <div className="overflow-x-auto">
              <table className="mx-auto border-separate border-spacing-1 font-mono text-[0.78rem]">
                <thead>
                  <tr>
                    <th />
                    {L.map((l, j) => (
                      <th
                        key={l}
                        className={`px-1 pb-1 font-semibold ${j === s.k && s.phase !== 'init' ? 'text-accent' : 'text-muted'}`}
                      >
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {L.map((rl, i) => (
                    <tr key={rl}>
                      <th
                        className={`pr-1.5 text-right font-semibold ${i === s.k && s.phase !== 'init' ? 'text-accent' : 'text-muted'}`}
                      >
                        {rl}
                      </th>
                      {L.map((cl, j) => {
                        const v = M[i][j];
                        const cur = i === s.i && j === s.j;
                        const src = s.phase === 'cmp' && ((i === s.i && j === s.k) || (i === s.k && j === s.j));
                        const inK = s.phase !== 'init' && s.phase !== 'done' && (i === s.k || j === s.k);
                        const cls = cur
                          ? s.improved
                            ? 'bg-success text-white font-bold'
                            : 'bg-warning text-black font-bold'
                          : src
                            ? 'ring-2 ring-accent bg-accent-soft text-accent font-semibold'
                            : inK
                              ? 'bg-accent-soft/60'
                              : i === j
                                ? 'text-muted/60'
                                : '';
                        return (
                          <td
                            key={cl}
                            className={`min-w-10 rounded-lg px-1.5 py-1.5 text-center tabular-nums transition-colors ${cls}`}
                          >
                            {show === 'D' ? inf(v as number) : v === null ? '—' : L[v as number]}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              {X.legendStart} <b className="text-accent">k</b> {X.legendEnd}
            </p>
          </Panel>
        </div>
      </div>
    </VizShell>
  );
}

export { INF };
