import { Button, Chip } from '@heroui/react';
import { ArrowRight, Check, Flag, RotateCcw, Trophy, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { floydSteps, fwPath, weightMatrix } from './algorithms/shortest';
import { fitLayout, type GEdge, type GNode, GraphCanvas } from './kit/GraphCanvas';
import { StepNote, VizShell } from './kit/shell';

/* =====================================================================
 *  Gara e Rrugëve — Laboratori 7, Ushtrimi 6
 *  The lab's 8-city graph. Build the shortest route by clicking cities;
 *  Floyd-Warshall's P matrix reveals the optimal one.
 * ===================================================================== */

const CITIES = ['Alfa', 'Beta', 'Gama', 'Delta', 'Eta', 'Zeta', 'Iota', 'Kapa'];
const POS: [number, number][] = [
  [140, 180],
  [340, 100],
  [560, 180],
  [740, 320],
  [140, 520],
  [340, 620],
  [560, 540],
  [700, 180],
];
const FIXED: [number, number, number][] = [
  [0, 1, 4],
  [1, 2, 3],
  [2, 3, 5],
  [3, 7, 6],
  [0, 4, 7],
  [1, 4, 8],
  [1, 5, 10],
  [2, 6, 4],
  [3, 6, 7],
  [4, 5, 3],
  [5, 6, 5],
  [6, 7, 4],
  [0, 2, 9],
  [4, 6, 6],
  [2, 7, 8],
];
const EDGES: GEdge[] = FIXED.map(([u, v, w]) => ({ u: CITIES[u], v: CITIES[v], w }));
const NODES: GNode[] = fitLayout(
  CITIES.map((id, i) => ({ id, x: POS[i][0], y: POS[i][1] })),
  760,
  520,
  56,
);
const ROUNDS = 8;

const fw = (() => {
  const steps = floydSteps(weightMatrix(CITIES, EDGES, false), CITIES);
  return steps[steps.length - 1];
})();

// every pair that is not directly adjacent — interesting rounds
const PAIRS = (() => {
  const adj = new Set(EDGES.flatMap((e) => [`${e.u}|${e.v}`, `${e.v}|${e.u}`]));
  const out: [number, number][] = [];
  for (let i = 0; i < CITIES.length; i++)
    for (let j = i + 1; j < CITIES.length; j++) if (!adj.has(`${CITIES[i]}|${CITIES[j]}`)) out.push([i, j]);
  return out;
})();

const FIRST_ROUNDS: [number, number][] = [
  [0, 3],
  [4, 7],
  [0, 6],
  [1, 3],
  [5, 2],
  [4, 3],
  [0, 5],
  [1, 7],
];

const weight = (a: string, b: string) => EDGES.find((e) => (e.u === a && e.v === b) || (e.u === b && e.v === a))?.w;

export default function PathRaceGame() {
  const [rounds, setRounds] = useState<[number, number][]>(FIRST_ROUNDS);
  const [r, setR] = useState(0);
  const [route, setRoute] = useState<string[]>([CITIES[FIRST_ROUNDS[0][0]]]);
  const [result, setResult] = useState<null | {
    cost: number | null;
    best: number;
    points: number;
    bestRoute: string[];
  }>(null);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const over = r >= ROUNDS;
  const [si, ti] = rounds[Math.min(r, ROUNDS - 1)];
  const src = CITIES[si],
    dst = CITIES[ti];

  const cost = useMemo(() => {
    let c = 0;
    for (let k = 0; k + 1 < route.length; k++) c += weight(route[k], route[k + 1]) ?? Infinity;
    return c;
  }, [route]);

  const click = (id: string) => {
    if (result || over) return;
    const last = route[route.length - 1];
    if (id === last) return;
    if (weight(last, id) === undefined)
      return setMsg(`${last} dhe ${id} nuk janë fqinjë — zgjidhni një qytet të lidhur me **${last}**.`);
    if (route.includes(id))
      return setMsg(`${id} është tashmë në rrugë — një rrugë e shkurtër nuk e përsërit një qytet.`);
    setMsg(null);
    setRoute([...route, id]);
  };
  const confirm = () => {
    const best = fw.D[si][ti];
    const bestRoute = (fwPath(fw.P, si, ti) ?? []).map((x) => CITIES[x]);
    const reached = route[route.length - 1] === dst;
    const points = !reached ? 0 : cost === best ? 15 : Math.max(3, 15 - (cost - best));
    setResult({ cost: reached ? cost : null, best, points, bestRoute });
    setScore((s) => s + points);
  };
  const next = () => {
    const nr = r + 1;
    setR(nr);
    setResult(null);
    setMsg(null);
    if (nr < ROUNDS) setRoute([CITIES[rounds[nr][0]]]);
  };
  const restart = () => {
    const shuffled = [...PAIRS]
      .sort(() => Math.random() - 0.5)
      .slice(0, ROUNDS)
      .map(([a, b]) => (Math.random() < 0.5 ? [a, b] : [b, a]) as [number, number]);
    setRounds(shuffled);
    setR(0);
    setRoute([CITIES[shuffled[0][0]]]);
    setResult(null);
    setScore(0);
    setMsg(null);
  };

  const onRoute = new Set(route.slice(1).map((v, k) => `${route[k]}|${v}`));
  const best = result?.bestRoute ?? [];
  const onBest = new Set(best.slice(1).map((v, k) => `${best[k]}|${v}`));
  const has = (set: Set<string>, e: GEdge) => set.has(`${e.u}|${e.v}`) || set.has(`${e.v}|${e.u}`);

  return (
    <VizShell
      title="Gara e rrugëve — Floyd-Warshall"
      subtitle="Ndërtoni rrugën më të shkurtër duke klikuar qytetet me radhë. Pas konfirmimit, matrica P zbulon rrugën optimale."
      icon={<Flag />}
      badges={
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft" color="accent">
            <Trophy className="size-3" /> {score}
          </Chip>
          <Chip size="sm" variant="soft">
            {Math.min(r + 1, ROUNDS)} / {ROUNDS}
          </Chip>
        </div>
      }
      footer={
        over ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <StepNote tone="success" text={`Gara mbaroi: **${score} / ${ROUNDS * 15} pikë**.`} />
            </div>
            <Button onPress={restart}>
              <RotateCcw /> Raunde të reja
            </Button>
          </div>
        ) : result ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <StepNote
                tone={result.points === 15 ? 'success' : result.points ? 'warning' : 'danger'}
                text={
                  result.cost === null
                    ? `Rruga nuk mbërriti te **${dst}**. Optimalja: ${result.bestRoute.join(' → ')} = **${result.best}**. 0 pikë.`
                    : result.points === 15
                      ? `**Optimale!** ${route.join(' → ')} = ${result.cost}. +15 pikë.`
                      : `Rrugë e vlefshme (${result.cost}), por optimalja është **${result.bestRoute.join(' → ')} = ${result.best}**. +${result.points} pikë.`
                }
              />
            </div>
            <Button onPress={next}>
              {r === ROUNDS - 1 ? 'Rezultati' : 'Raundi tjetër'} <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <StepNote
                tone={msg ? 'danger' : 'accent'}
                text={
                  msg ??
                  `Raundi ${r + 1}: nga **${src}** te **${dst}**. Rruga juaj: ${route.join(' → ')} (kosto ${cost}).`
                }
              />
            </div>
            <div className="flex gap-2">
              <Button variant="tertiary" isDisabled={route.length < 2} onPress={() => setRoute(route.slice(0, -1))}>
                <Undo2 /> Zhbëj
              </Button>
              <Button isDisabled={route.length < 2} onPress={confirm}>
                <Check /> Konfirmo
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="p-4 sm:p-5">
        <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
          <GraphCanvas
            nodes={NODES}
            edges={EDGES}
            width={760}
            height={520}
            shape="pill"
            onNodeClick={click}
            nodeLook={(n) => ({
              fill:
                n.id === src
                  ? 'color-mix(in oklab, var(--viz-active) 30%, var(--surface))'
                  : n.id === dst
                    ? 'color-mix(in oklab, var(--viz-reject) 25%, var(--surface))'
                    : route.includes(n.id)
                      ? 'color-mix(in oklab, var(--viz-done) 25%, var(--surface))'
                      : undefined,
              stroke:
                n.id === src
                  ? 'var(--viz-active)'
                  : n.id === dst
                    ? 'var(--viz-reject)'
                    : route.includes(n.id)
                      ? 'var(--viz-done)'
                      : undefined,
              strokeWidth: n.id === src || n.id === dst ? 3 : 2,
              ring: !result && n.id === route[route.length - 1] ? 'var(--viz-active)' : undefined,
            })}
            edgeLook={(e) =>
              result && has(onBest, e)
                ? { stroke: 'var(--viz-active)', width: 5, animated: true, front: true }
                : has(onRoute, e)
                  ? { stroke: 'var(--viz-done)', width: 4.5, front: true }
                  : {}
            }
            ariaLabel="Harta e garës me 8 qytete"
          />
        </div>
      </div>
    </VizShell>
  );
}
