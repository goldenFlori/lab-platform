import { Chip } from '@heroui/react';
import { Flower2, Heart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type FlowStep, maxflowSteps, type RArc } from './algorithms/maxflow';
import { MAXFLOW_TEXT } from './algorithms/maxflow.text';
import { Field, PlayerBar, Segmented, Toggle } from './kit/controls';
import { type EdgeLook, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { Legend, Panel, Stat, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Çiftëzimi dyanësor dhe problemet e caktimit — Laboratori 10
 *  (Leksionet 5–6, slides 80–90). The flow network is built exactly as on
 *  slide 83: s → X, X → Y, Y → t.
 * ===================================================================== */

const GIRLS = ['Helena', 'Aria', 'Ema', 'Sara', 'Maja'];
const KITTENS = ['Mace', 'Bubi', 'Lulu', 'Tigri', 'Pupi'];
const PREFS: Record<string, string[]> = {
  Helena: ['Mace', 'Bubi'],
  Aria: ['Mace'],
  Ema: ['Bubi', 'Tigri'],
  Sara: ['Lulu', 'Tigri'],
  Maja: ['Mace', 'Lulu'],
};

// Flowers and bouquets by key; their names, which also name the network's vertices, are in TEXT.
type Flower = 'redRose' | 'pinkRose' | 'whiteRose' | 'pinkLily' | 'redTulip' | 'whiteLily' | 'pinkTulip';
type Bouquet = 'red' | 'pink' | 'white' | 'roses' | 'tulips' | 'lilies';
const FLOWERS: [Flower, number][] = [
  ['redRose', 10],
  ['pinkRose', 15],
  ['whiteRose', 15],
  ['pinkLily', 15],
  ['redTulip', 15],
  ['whiteLily', 15],
  ['pinkTulip', 10],
];
const BOUQUETS: [Bouquet, number, Flower[]][] = [
  ['red', 15, ['redRose', 'redTulip']],
  ['pink', 15, ['pinkRose', 'pinkLily', 'pinkTulip']],
  ['white', 15, ['whiteRose', 'whiteLily']],
  ['roses', 20, ['redRose', 'pinkRose', 'whiteRose']],
  ['tulips', 15, ['redTulip', 'pinkTulip']],
  ['lilies', 15, ['pinkLily', 'whiteLily']],
];

const TEXT = bilingual(
  {
    flowers: {
      redRose: 'Trëndafil i kuq',
      pinkRose: 'Trëndafil rozë',
      whiteRose: 'Trëndafil i bardhë',
      pinkLily: 'Zambak rozë',
      redTulip: 'Tulipan i kuq',
      whiteLily: 'Zambak i bardhë',
      pinkTulip: 'Tulipan rozë',
    } as Record<Flower, string>,
    bouquets: {
      red: 'Buqetë e kuqe',
      pink: 'Buqetë rozë',
      white: 'Buqetë e bardhë',
      roses: 'Vetëm trëndafila',
      tulips: 'Vetëm tulipanë',
      lilies: 'Vetëm zambakë',
    } as Record<Bouquet, string>,
    leaves: (who: string, what: string) => `**${who}** lëshon ${what}`,
    takes: (who: string, what: string) => `**${who}** merr ${what}`,
    augmenting: (path: string, parts: string, x: number) =>
      `Rrugë rritëse: ${path}. Në gjuhën e çiftëzimit: ${parts}. Çiftëzimi rritet me ${x}.`,
    problem: 'Problemi',
    girlsKittens: 'Vajzat dhe kotelet',
    flowersBouquets: 'Lulet dhe buqetat',
    matchingTitle: 'Çiftëzimi maksimum me rrjedhë max',
    matchingSubtitle:
      'Çdo vajzë ka preferencat e saj. Si i bëjmë të lumtura sa më shumë vajza? Rrjeta rrjedhë me kapacitete 1 e zgjidh (slide 83).',
    fromNaive: 'Nis nga zgjidhja naive',
    showNetwork: 'Shfaq rrjetën (s, t)',
    naive: (n: number) =>
      `Zgjidhja **naive**: secila vajzë, me radhë, merr koteleten e parë të lirë → ${n} çifte. A mund të bëjmë më mirë?`,
    empty: 'Nisim me çiftëzim bosh. Edmonds-Karp kërkon rrugë rritëse në rrjetën me kapacitete 1.',
    maximum: (n: number, short: boolean) =>
      `Çiftëzimi maksimum ka **${n} çifte** = vlera e rrjedhës max. ${short ? 'Nuk mund të jenë të gjitha të lumtura: shihni sa kotele të ndryshme pëlqejnë së bashku.' : ''}`,
    bipartite: 'Graf dyanësor vajza–kotele',
    inMatching: 'Në çiftëzim (rrjedhë 1)',
    augmentingPath: 'Rruga rritëse',
    changeMind: 'Brinjë kthyese — "ndërrim mendjeje"',
    editPrefs: 'Ndryshoni preferencat: klikoni një vajzë, pastaj një kotele për të shtuar ose hequr pëlqimin.',
    pairs: 'Çifte',
    girls: 'Vajza',
    matching: 'Çiftëzimi',
    noKitten: 'pa kotele',
    why: 'Pse funksionon (slide 85)',
    whyPoints: [
      'Kapacitetet janë të plota → rrjedhat janë 0 ose 1.',
      'Ruajtja e rrjedhës → çdo vajzë merr të shumtën 1 kotele.',
      'Brinjët me rrjedhë 1 formojnë një çiftëzim.',
      'Vlera e rrjedhës = numri i çifteve.',
    ],
    assignmentTitle: 'Problemi i caktimit — lulet dhe buqetat',
    assignmentSubtitle:
      'c(x) = sa lule kemi, c(y) = sa lule mban buqeta, c(x, y) = 10 = të shumtën 10 lule të një lloji në një buqetë (slides 86–89).',
    scarce: 'Vetëm 3 trëndafila të kuq (të tjerat me bollëk)',
    allDone: (v: number, total: number) =>
      `Të gjitha buqetat u realizuan: **${v} / ${total} lule**. Kontrolloni: buqeta e kuqe merr 10 trëndafila të kuq + 5 tulipanë të kuq (slide 89).`,
    bottleneck: (v: number, total: number) =>
      `Rrjedha max = **${v} / ${total}**. Prerja min (vijat e kuqe) tregon ngushticën: buqeta e kuqe merr të shumtën 3 + 10 = 13 lule.`,
    flowerNetwork: 'Rrjeta e luleve dhe buqetave',
    assigned: 'Lule të caktuara',
    capacity: 'Kapaciteti',
    filling: 'Mbushja e buqetave',
  },
  {
    flowers: {
      redRose: 'Red rose',
      pinkRose: 'Pink rose',
      whiteRose: 'White rose',
      pinkLily: 'Pink lily',
      redTulip: 'Red tulip',
      whiteLily: 'White lily',
      pinkTulip: 'Pink tulip',
    },
    bouquets: {
      red: 'Red bouquet',
      pink: 'Pink bouquet',
      white: 'White bouquet',
      roses: 'Roses only',
      tulips: 'Tulips only',
      lilies: 'Lilies only',
    },
    leaves: (who, what) => `**${who}** gives up ${what}`,
    takes: (who, what) => `**${who}** takes ${what}`,
    augmenting: (path, parts, x) =>
      `Augmenting path: ${path}. In matching terms: ${parts}. The matching grows by ${x}.`,
    problem: 'Problem',
    girlsKittens: 'The girls and the kittens',
    flowersBouquets: 'The flowers and the bouquets',
    matchingTitle: 'Maximum matching with max flow',
    matchingSubtitle:
      'Each girl has her own preferences. How do we make as many girls happy as possible? A flow network with capacities 1 solves it (slide 83).',
    fromNaive: 'Start from the naive solution',
    showNetwork: 'Show the network (s, t)',
    naive: (n) =>
      `The **naive** solution: each girl in turn takes the first free kitten → ${n} pairs. Can we do better?`,
    empty: 'Start with an empty matching. Edmonds-Karp looks for augmenting paths in the network with capacities 1.',
    maximum: (n, short) =>
      `The maximum matching has **${n} pairs** = the value of the max flow. ${short ? 'They cannot all be happy: look how many different kittens they like between them.' : ''}`,
    bipartite: 'Bipartite graph of girls and kittens',
    inMatching: 'In the matching (flow 1)',
    augmentingPath: 'Augmenting path',
    changeMind: 'Back edge — "a change of mind"',
    editPrefs: 'Change the preferences: click a girl, then a kitten, to add or remove a like.',
    pairs: 'Pairs',
    girls: 'Girls',
    matching: 'Matching',
    noKitten: 'no kitten',
    why: 'Why it works (slide 85)',
    whyPoints: [
      'The capacities are integers → the flows are 0 or 1.',
      'Flow conservation → each girl gets at most 1 kitten.',
      'The edges with flow 1 form a matching.',
      'The value of the flow = the number of pairs.',
    ],
    assignmentTitle: 'The assignment problem — flowers and bouquets',
    assignmentSubtitle:
      'c(x) = how many flowers we have, c(y) = how many flowers a bouquet holds, c(x, y) = 10 = at most 10 flowers of one kind in a bouquet (slides 86–89).',
    scarce: 'Only 3 red roses (plenty of the others)',
    allDone: (v, total) =>
      `Every bouquet was made: **${v} / ${total} flowers**. Check: the red bouquet gets 10 red roses + 5 red tulips (slide 89).`,
    bottleneck: (v, total) =>
      `Max flow = **${v} / ${total}**. The min cut (the red lines) shows the bottleneck: the red bouquet gets at most 3 + 10 = 13 flowers.`,
    flowerNetwork: 'The network of flowers and bouquets',
    assigned: 'Flowers assigned',
    capacity: 'Capacity',
    filling: 'Filling the bouquets',
  },
);

type MatchingText = (typeof TEXT)['sq'];

const soft = (c: string, p = 24) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

function column(ids: string[], x: number, top: number, bottom: number): GNode[] {
  return ids.map((id, i) => ({
    id,
    x,
    y: ids.length === 1 ? (top + bottom) / 2 : top + (i * (bottom - top)) / (ids.length - 1),
  }));
}

/** A step of the augmenting-path search, told in matching terms. */
function describeMatching(L: MatchingText, path: RArc[], x: number) {
  const parts = path
    .filter((a) => GIRLS.includes(a.u) || GIRLS.includes(a.v))
    .filter((a) => a.u !== 's' && a.v !== 't')
    .map((a) => (a.back ? L.leaves(a.v, a.u) : L.takes(a.u, a.v)));
  return L.augmenting(['s', ...path.map((a) => a.v)].join(' → '), parts.join(', '), x);
}

export default function MatchingViz({ mode: initialMode = 'matching' }: { mode?: 'matching' | 'assignment' }) {
  const [mode, setMode] = useState<'matching' | 'assignment'>(initialMode);
  return mode === 'matching' ? <Matching setMode={setMode} /> : <Assignment setMode={setMode} />;
}

function ModeSwitch({
  mode,
  setMode,
}: {
  mode: 'matching' | 'assignment';
  setMode: (m: 'matching' | 'assignment') => void;
}) {
  const L = useText(TEXT);
  return (
    <Field label={L.problem}>
      <Segmented
        label={L.problem}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'matching', label: L.girlsKittens, icon: <Heart className="size-4" /> },
          { value: 'assignment', label: L.flowersBouquets, icon: <Flower2 className="size-4" /> },
        ]}
      />
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Bipartite matching                                                  */
/* ------------------------------------------------------------------ */

function Matching({ setMode }: { setMode: (m: 'matching' | 'assignment') => void }) {
  const L = useText(TEXT);
  const M = useText(MAXFLOW_TEXT);
  const [prefs, setPrefs] = useState<Record<string, string[]>>(PREFS);
  const [fromNaive, setFromNaive] = useState(true);
  const [network, setNetwork] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  const { edges, middle } = useMemo(() => {
    const es: GEdge[] = [];
    const mid: number[] = [];
    for (const g of GIRLS) es.push({ u: 's', v: g, w: 1 });
    for (const g of GIRLS) {
      for (const k of prefs[g]) {
        mid.push(es.length);
        es.push({ u: g, v: k, w: 1 });
      }
    }
    for (const k of KITTENS) es.push({ u: k, v: 't', w: 1 });
    return { edges: es, middle: new Set(mid) };
  }, [prefs]);

  const naive = useMemo(() => {
    const f = edges.map(() => 0);
    const taken = new Set<string>();
    for (const g of GIRLS) {
      const k = prefs[g].find((x) => !taken.has(x));
      if (!k) continue;
      taken.add(k);
      f[edges.findIndex((e) => e.u === 's' && e.v === g)] = 1;
      f[edges.findIndex((e) => e.u === g && e.v === k)] = 1;
      f[edges.findIndex((e) => e.u === k && e.v === 't')] = 1;
    }
    return f;
  }, [edges, prefs]);

  const steps = useMemo<FlowStep[]>(
    () =>
      maxflowSteps(
        [],
        edges,
        's',
        't',
        'ek',
        50,
        fromNaive ? naive : undefined,
        (p, x) => describeMatching(L, p, x),
        M,
      ),
    [edges, fromNaive, naive, L, M],
  );
  const player = usePlayer(steps, 1300);
  const st = player.step;
  const matched = edges.map((e, i) => ({ e, i })).filter(({ i }) => middle.has(i) && st.flow[i] === 1);
  const pathEdges = new Map<number, boolean>();
  if (st.phase === 'path' || st.phase === 'augment') for (const a of st.path) pathEdges.set(a.ei, a.back);

  const W = 760,
    H = 420;
  const nodes: GNode[] = [
    ...(network
      ? [
          { id: 's', x: 50, y: H / 2 },
          { id: 't', x: W - 50, y: H / 2 },
        ]
      : []),
    ...column(GIRLS, network ? 230 : 190, 50, H - 50),
    ...column(KITTENS, network ? 530 : 570, 50, H - 50),
  ];
  const shown = edges.map((e, i) => ({ e, i })).filter(({ i }) => network || middle.has(i));

  const togglePref = (id: string) => {
    if (GIRLS.includes(id)) return setPick(pick === id ? null : id);
    if (KITTENS.includes(id) && pick) {
      const has = prefs[pick].includes(id);
      setPrefs({ ...prefs, [pick]: has ? prefs[pick].filter((k) => k !== id) : [...prefs[pick], id] });
    }
  };

  const nodeLook = (n: GNode): NodeLook => {
    const isGirl = GIRLS.includes(n.id);
    const isMatched = matched.some(({ e }) => e.u === n.id || e.v === n.id);
    if (n.id === 's') return { fill: soft('var(--viz-done)', 30), stroke: 'var(--viz-done)', strokeWidth: 3 };
    if (n.id === 't') return { fill: soft('var(--viz-reject)', 26), stroke: 'var(--viz-reject)', strokeWidth: 3 };
    return {
      fill: isMatched ? soft(isGirl ? 'var(--brand)' : 'var(--brand-2)', 28) : undefined,
      stroke:
        pick === n.id ? 'var(--viz-active)' : isMatched ? (isGirl ? 'var(--brand)' : 'var(--brand-2)') : undefined,
      ring: pick === n.id ? 'var(--viz-active)' : undefined,
    };
  };
  const edgeLook = (_: GEdge, k: number): EdgeLook => {
    const i = shown[k].i;
    if (pathEdges.has(i))
      return {
        stroke: pathEdges.get(i) ? 'var(--viz-compare)' : 'var(--viz-active)',
        width: 4.5,
        dash: pathEdges.get(i) ? '7 5' : undefined,
        front: true,
        label: network ? undefined : null,
      };
    if (st.flow[i] === 1)
      return {
        stroke: 'var(--viz-done)',
        width: middle.has(i) ? 4.5 : 3,
        front: true,
        label: network ? '1/1' : null,
        labelTone: 'success',
      };
    return { dim: !network && false, label: network ? '0/1' : null, labelTone: 'muted' };
  };

  const size = matched.length;
  const done = st.phase === 'done';
  return (
    <VizShell
      title={L.matchingTitle}
      subtitle={L.matchingSubtitle}
      icon={<Heart />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <ModeSwitch mode="matching" setMode={setMode} />
          <div className="flex flex-wrap items-center gap-4 pb-1">
            <Toggle label={L.fromNaive} value={fromNaive} onChange={setFromNaive} />
            <Toggle label={L.showNetwork} value={network} onChange={setNetwork} />
          </div>
        </>
      }
      footer={
        <>
          <StepNote
            tone={done ? 'success' : 'accent'}
            text={
              st.phase === 'init'
                ? fromNaive
                  ? L.naive(size)
                  : L.empty
                : done
                  ? L.maximum(size, size < GIRLS.length)
                  : st.note
            }
          />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
            <GraphCanvas
              nodes={nodes}
              edges={shown.map((x) => x.e)}
              directed={network}
              width={W}
              height={H}
              shape="pill"
              nodeLook={nodeLook}
              edgeLook={edgeLook}
              showWeights={false}
              onNodeClick={togglePref}
              ariaLabel={L.bipartite}
            />
          </div>
          <Legend
            items={[
              { color: 'var(--viz-done)', label: L.inMatching, shape: 'line' },
              { color: 'var(--viz-active)', label: L.augmentingPath, shape: 'line' },
              { color: 'var(--viz-compare)', label: L.changeMind, shape: 'dash' },
            ]}
          />
          <p className="text-xs text-muted">{L.editPrefs}</p>
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={L.pairs} value={size} tone="success" />
            <Stat label={L.girls} value={GIRLS.length} />
          </div>
          <Panel title={L.matching}>
            <ul className="space-y-1 text-sm">
              {GIRLS.map((g) => {
                const m = matched.find(({ e }) => e.u === g);
                return (
                  <li key={g} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{g}</span>
                    {m ? (
                      <Chip size="sm" variant="soft" color="success">
                        {m.e.v}
                      </Chip>
                    ) : (
                      <span className="text-xs text-muted">{L.noKitten}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title={L.why}>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
              {L.whyPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </VizShell>
  );
}

/* ------------------------------------------------------------------ */
/* Assignment: flowers and bouquets                                    */
/* ------------------------------------------------------------------ */

function Assignment({ setMode }: { setMode: (m: 'matching' | 'assignment') => void }) {
  const [scarce, setScarce] = useState(false);
  const L = useText(TEXT);
  const M = useText(MAXFLOW_TEXT);
  // The vertices are named in the interface language, so the steps read in it too.
  const flower = (key: Flower) => L.flowers[key];
  const bouquet = (key: Bouquet) => L.bouquets[key];
  const supply = useMemo(
    () => FLOWERS.map(([key, c]) => [key, scarce ? (key === 'redRose' ? 3 : 30) : c] as [Flower, number]),
    [scarce],
  );
  const edges = useMemo<GEdge[]>(() => {
    const es: GEdge[] = supply.map(([f, c]) => ({ u: 's', v: L.flowers[f], w: c }));
    for (const [b, , allowed] of BOUQUETS)
      for (const f of allowed) es.push({ u: L.flowers[f], v: L.bouquets[b], w: 10 });
    for (const [b, c] of BOUQUETS) es.push({ u: L.bouquets[b], v: 't', w: c });
    return es;
  }, [supply, L]);
  const steps = useMemo(() => maxflowSteps([], edges, 's', 't', 'ek', undefined, undefined, undefined, M), [edges, M]);
  const player = usePlayer(steps, 1000);
  const st = player.step;
  const total = BOUQUETS.reduce((s, [, c]) => s + c, 0);
  const done = st.phase === 'done';
  const cutS = new Set(done ? st.cutS : []);

  const W = 860,
    H = 480;
  const nodes: GNode[] = [
    { id: 's', x: 40, y: H / 2 },
    { id: 't', x: W - 40, y: H / 2 },
    ...column(
      FLOWERS.map((f) => flower(f[0])),
      230,
      40,
      H - 40,
    ),
    ...column(
      BOUQUETS.map((b) => bouquet(b[0])),
      610,
      60,
      H - 60,
    ),
  ];
  const pathEdges = new Set<number>();
  if (st.phase === 'path' || st.phase === 'augment') for (const a of st.path) pathEdges.add(a.ei);

  const edgeLook = (e: GEdge, i: number): EdgeLook => {
    const f = st.flow[i],
      c = e.w ?? 0;
    if (done && cutS.has(e.u) && !cutS.has(e.v) && scarce && e.u !== 's')
      return { stroke: 'var(--viz-reject)', width: 4, label: `✂ ${f}/${c}`, labelTone: 'danger', front: true };
    if (pathEdges.has(i))
      return { stroke: 'var(--viz-active)', width: 4, front: true, label: `${f}/${c}`, labelTone: 'accent' };
    if (f > 0)
      return {
        stroke: f === c ? 'var(--viz-reject)' : 'var(--viz-path)',
        width: 1.5 + (2.5 * f) / c,
        label: e.u === 's' || e.v === 't' ? `${f}/${c}` : String(f),
        labelTone: f === c ? 'danger' : 'default',
      };
    return { label: e.u === 's' || e.v === 't' ? `0/${c}` : null, dim: true };
  };

  return (
    <VizShell
      title={L.assignmentTitle}
      subtitle={L.assignmentSubtitle}
      icon={<Flower2 />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <ModeSwitch mode="assignment" setMode={setMode} />
          <div className="pb-1">
            <Toggle label={L.scarce} value={scarce} onChange={setScarce} />
          </div>
        </>
      }
      footer={
        <>
          <StepNote
            tone={done ? (st.value === total ? 'success' : 'warning') : 'accent'}
            text={done ? (st.value === total ? L.allDone(st.value, total) : L.bottleneck(st.value, total)) : st.note}
          />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            directed
            width={W}
            height={H}
            shape="pill"
            showWeights={false}
            nodeLook={(n) =>
              n.id === 's'
                ? { fill: soft('var(--viz-done)', 30), stroke: 'var(--viz-done)' }
                : n.id === 't'
                  ? { fill: soft('var(--viz-reject)', 26), stroke: 'var(--viz-reject)' }
                  : done && cutS.has(n.id)
                    ? { fill: soft('var(--brand)', 18), stroke: 'var(--brand)' }
                    : {}
            }
            edgeLook={edgeLook}
            maxHeight="620px"
            ariaLabel={L.flowerNetwork}
          />
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={L.assigned} value={st.value} tone="success" />
            <Stat label={L.capacity} value={total} />
          </div>
          <Panel title={L.filling}>
            <ul className="space-y-2 text-sm">
              {BOUQUETS.map(([b, c]) => {
                const i = edges.findIndex((e) => e.u === bouquet(b) && e.v === 't');
                const f = st.flow[i];
                return (
                  <li key={b}>
                    <div className="flex justify-between gap-2">
                      <span>{bouquet(b)}</span>
                      <span className="font-mono text-xs">
                        {f} / {c}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(100 * f) / c}%`,
                          background: f === c ? 'var(--viz-done)' : 'var(--viz-path)',
                          transition: 'width 0.4s',
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </VizShell>
  );
}
