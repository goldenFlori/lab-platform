import { Button, Chip } from '@heroui/react';
import { ArrowRight, Clock, HelpCircle, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { bellmanFordSteps, bfSnapshots, inf, pathTo, toArcs } from './algorithms/shortest';
import { GraphCanvas } from './kit/GraphCanvas';
import { must } from './kit/must';
import { StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { PATH_PRESETS } from './PathsViz';

/* =====================================================================
 *  Kuiz Bellman-Ford — Laboratori 7, Ushtrimi 4
 *  The graph and the questions of the lab. Graph-dependent answers are
 *  computed, never hard-coded.
 * ===================================================================== */

interface Q {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

const SECONDS = 20;

const TEXT = bilingual(
  {
    q1: 'Pas iterimit të parë të Bellman-Ford (burim A), sa është dist[D]?',
    e1: (d: string) => `Në iterimin e parë relaksohen A→B (4) dhe pastaj B→D (5): 4 + 5 = **${d}**.`,
    q2: 'Cila është distanca finale nga A te F?',
    e2: (route: string, sum: string, d: string) =>
      `Rruga optimale është **${route}** = ${sum} = **${d}** (falë brinjës negative B→E).`,
    q3: 'Sa iterime bën Bellman-Ford, të shumtën, në një graf me V kulme?',
    e3: 'Një rrugë e thjeshtë ka të shumtën **V − 1** brinjë, prandaj mjaftojnë V − 1 iterime.',
    q4: 'A mund të zbulojë Bellman-Ford ciklet negative?',
    a4: ['Po', 'Jo', 'Vetëm me peshë pozitive', 'Vetëm në grafe të padrejtuar'],
    e4: 'Po: nëse pas V − 1 iterimeve një brinjë **ende relaksohet**, grafi ka cikël negativ.',
    q5: 'Cili është kompleksiteti kohor i Bellman-Ford?',
    e5: '**V − 1** iterime × **E** brinjë në çdo iterim = O(V·E).',
    q6: 'Dijkstra apo Bellman-Ford: cili lejon peshë negative?',
    a6: ['Vetëm Bellman-Ford', 'Vetëm Dijkstra', 'Të dy', 'Asnjëri'],
    e6: 'Dijkstra **kërkon w ≥ 0**: një kulm i tabeluar nuk rishikohet më. Bellman-Ford nuk e ka këtë kufizim.',
    q7: 'Pas iterimit të dytë (burim A), sa është dist[E]?',
    e7: (d: string) => `A→B→E = 4 + (−3) = 1, ndërsa A→C→E = 2 + 3 = 5. Minimumi: **${d}**.`,
    q8: 'Bellman-Ford gjen rrugët nga…',
    a8: ['Një burim te të gjitha kulmet', 'Të gjitha çiftet', 'Një burim te një destinacion', 'Asnjë nga këto'],
    e8: 'Bellman-Ford (si Dijkstra) është algoritëm **me një burim**. Për të gjitha çiftet: Floyd-Warshall.',
    title: 'Kuiz: Bellman-Ford',
    subtitle:
      'Grafi i kuizit të laboratorit: 6 kulme, harqe me peshë pozitive dhe negative. Përgjigjuni shpejt për pikë bonus.',
    finished: (correct: number, total: number, score: number) =>
      `Përfunduat: **${correct} / ${total}** të sakta, **${score} pikë**.`,
    restart: 'Rifillo',
    right: '**Saktë!**',
    timeUp: '**Koha mbaroi.**',
    wrong: '**Jo.**',
    result: 'Rezultati',
    next: 'Pyetja tjetër',
    pick: 'Zgjidhni një përgjigje.',
    ready: 'Koha nis me përgjigjen e parë — lexoni grafin me qetësi.',
    graph: 'Grafi i kuizit Bellman-Ford',
    summary: (correct: number, total: number) => `pikë · ${correct} nga ${total} të sakta`,
    question: (i: number, total: number) => `Pyetja ${i} nga ${total}`,
  },
  {
    q1: 'After the first iteration of Bellman-Ford (source A), what is dist[D]?',
    e1: (d) => `In the first iteration A→B (4) is relaxed, then B→D (5): 4 + 5 = **${d}**.`,
    q2: 'What is the final distance from A to F?',
    e2: (route, sum, d) => `The optimal path is **${route}** = ${sum} = **${d}** (thanks to the negative edge B→E).`,
    q3: 'At most how many iterations does Bellman-Ford make on a graph with V vertices?',
    e3: 'A simple path has at most **V − 1** edges, so V − 1 iterations are enough.',
    q4: 'Can Bellman-Ford detect negative cycles?',
    a4: ['Yes', 'No', 'Only with positive weights', 'Only in undirected graphs'],
    e4: 'Yes: if an edge **still relaxes** after V − 1 iterations, the graph has a negative cycle.',
    q5: 'What is the time complexity of Bellman-Ford?',
    e5: '**V − 1** iterations × **E** edges in each iteration = O(V·E).',
    q6: 'Dijkstra or Bellman-Ford: which allows negative weights?',
    a6: ['Only Bellman-Ford', 'Only Dijkstra', 'Both', 'Neither'],
    e6: 'Dijkstra **needs w ≥ 0**: a settled vertex is never revisited. Bellman-Ford has no such limit.',
    q7: 'After the second iteration (source A), what is dist[E]?',
    e7: (d) => `A→B→E = 4 + (−3) = 1, while A→C→E = 2 + 3 = 5. The minimum: **${d}**.`,
    q8: 'Bellman-Ford finds the paths from…',
    a8: ['One source to every vertex', 'All pairs', 'One source to one destination', 'None of these'],
    e8: 'Bellman-Ford (like Dijkstra) is a **single-source** algorithm. For all pairs: Floyd-Warshall.',
    title: 'Quiz: Bellman-Ford',
    subtitle:
      'The lab quiz’s graph: 6 vertices, edges with positive and negative weights. Answer fast for bonus points.',
    finished: (correct, total, score) => `Finished: **${correct} / ${total}** right, **${score} points**.`,
    restart: 'Restart',
    right: '**Right!**',
    timeUp: '**Time is up.**',
    wrong: '**No.**',
    result: 'Result',
    next: 'Next question',
    pick: 'Choose an answer.',
    ready: 'The clock starts with your first answer — read the graph calmly.',
    graph: 'The Bellman-Ford quiz graph',
    summary: (correct, total) => `points · ${correct} of ${total} right`,
    question: (i, total) => `Question ${i} of ${total}`,
  },
);

function buildQuestions(L: (typeof TEXT)['sq']): Q[] {
  const g = must(
    PATH_PRESETS.find((p) => p.id === 'kuizi'),
    'preset kuizi',
  );
  const arcs = toArcs(g.edges, true);
  const snaps = bfSnapshots(g.nodes, arcs, 'A');
  const final = must(bellmanFordSteps(g.nodes, arcs, 'A').at(-1), 'final Bellman-Ford step');
  const route = pathTo(final.prev, 'A', 'F') ?? [];
  const weights = route
    .slice(1)
    .map((v, i) => must(g.edges.find((e) => e.u === route[i] && e.v === v)?.w, `weight ${route[i]}→${v}`));
  const opts = (right: string, wrong: string[]) => {
    const list = [right, ...wrong.filter((w) => w !== right)].slice(0, 4);
    // deterministic shuffle per question, so the correct answer is not always first
    const k = right.length % list.length;
    const rotated = [...list.slice(k), ...list.slice(0, k)];
    return { options: rotated, answer: rotated.indexOf(right) };
  };
  return [
    {
      q: L.q1,
      ...opts(inf(snaps[1].D), ['5', '∞', '4', '7']),
      explain: L.e1(inf(snaps[1].D)),
    },
    {
      q: L.q2,
      ...opts(inf(final.dist.F), ['11', '13', '15', '9']),
      explain: L.e2(route.join(' → '), weights.join(' + ').replace(/\+ -/g, '− '), inf(final.dist.F)),
    },
    {
      q: L.q3,
      ...opts('V − 1', ['V', 'V + 1', 'V²']),
      explain: L.e3,
    },
    {
      q: L.q4,
      ...opts(L.a4[0] ?? '', L.a4.slice(1)),
      explain: L.e4,
    },
    {
      q: L.q5,
      ...opts('O(V·E)', ['O(V²)', 'O(E log V)', 'O(V + E)']),
      explain: L.e5,
    },
    {
      q: L.q6,
      ...opts(L.a6[0] ?? '', L.a6.slice(1)),
      explain: L.e6,
    },
    {
      q: L.q7,
      ...opts(inf(snaps[2].E), ['7', '5', '3']),
      explain: L.e7(inf(snaps[2].E)),
    },
    {
      q: L.q8,
      ...opts(L.a8[0] ?? '', L.a8.slice(1)),
      explain: L.e8,
    },
  ];
}

export default function BfQuiz() {
  const L = useText(TEXT);
  const questions = useMemo(() => buildQuestions(L), [L]);
  const graph = must(
    PATH_PRESETS.find((p) => p.id === 'kuizi'),
    'preset kuizi',
  );
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const [started, setStarted] = useState(false);
  const over = i >= questions.length;
  const q = questions[Math.min(i, questions.length - 1)];

  useEffect(() => {
    if (!started || picked !== null || over) return;
    if (left <= 0) {
      setPicked(-1);
      return;
    }
    const t = window.setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => window.clearTimeout(t);
  }, [started, left, picked, over]);

  const choose = (k: number) => {
    if (picked !== null) return;
    setStarted(true);
    setPicked(k);
    if (k === q.answer) {
      setScore((s) => s + 10 + Math.ceil(left / 2));
      setCorrect((c) => c + 1);
    }
  };
  const next = () => {
    setPicked(null);
    setLeft(SECONDS);
    setI((x) => x + 1);
  };
  const restart = () => {
    setI(0);
    setPicked(null);
    setScore(0);
    setCorrect(0);
    setLeft(SECONDS);
    setStarted(false);
  };

  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<HelpCircle />}
      badges={
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft" color="accent">
            <Trophy className="size-3" /> {score}
          </Chip>
          {!over && (
            <Chip size="sm" variant="soft" color={left <= 5 ? 'danger' : 'default'}>
              <Clock className="size-3" /> {left}s
            </Chip>
          )}
        </div>
      }
      footer={
        over ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <StepNote tone="success" text={L.finished(correct, questions.length, score)} />
            </div>
            <Button onPress={restart}>
              <RotateCcw /> {L.restart}
            </Button>
          </div>
        ) : picked !== null ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <StepNote
                tone={picked === q.answer ? 'success' : 'danger'}
                text={`${picked === q.answer ? L.right : picked === -1 ? L.timeUp : L.wrong} ${q.explain}`}
              />
            </div>
            <Button onPress={next}>
              {i === questions.length - 1 ? L.result : L.next} <ArrowRight />
            </Button>
          </div>
        ) : (
          <StepNote tone="default" text={started ? L.pick : L.ready} />
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
          <GraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            directed
            width={graph.w}
            height={graph.h}
            edgeLook={(e) => ({ label: String(e.w), labelTone: (e.w ?? 0) < 0 ? 'danger' : 'muted' })}
            ariaLabel={L.graph}
          />
        </div>
        {over ? (
          <div className="grid place-items-center rounded-3xl bg-gradient-to-br from-brand/12 via-brand-2/10 to-transparent p-8 text-center">
            <div>
              <Trophy className="mx-auto size-10 text-accent" />
              <div className="mt-3 font-mono text-5xl font-bold">{score}</div>
              <div className="mt-1 text-muted">{L.summary(correct, questions.length)}</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-xs font-semibold tracking-wider text-muted uppercase">
              {L.question(i + 1, questions.length)}
            </div>
            <p className="text-lg leading-snug font-semibold">{q.q}</p>
            <div className="grid gap-2">
              {q.options.map((o, k) => {
                const isRight = picked !== null && k === q.answer;
                const isWrong = picked === k && k !== q.answer;
                return (
                  <Button
                    // biome-ignore lint/suspicious/noArrayIndexKey: a question's options are a fixed list
                    key={k}
                    fullWidth
                    variant={isRight ? 'primary' : isWrong ? 'danger' : 'secondary'}
                    onPress={() => choose(k)}
                    isDisabled={picked !== null && !isRight && !isWrong}
                    className="h-auto justify-start rounded-2xl px-4 py-3 text-left whitespace-normal"
                  >
                    <span className="mr-2 grid size-6 shrink-0 place-items-center rounded-full bg-surface/60 font-mono text-xs">
                      {String.fromCharCode(65 + k)}
                    </span>
                    {o}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </VizShell>
  );
}
