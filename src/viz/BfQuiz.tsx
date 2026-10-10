import { Button, Chip } from '@heroui/react';
import { ArrowRight, Clock, HelpCircle, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { bellmanFordSteps, bfSnapshots, inf, pathTo, toArcs } from './algorithms/shortest';
import { GraphCanvas } from './kit/GraphCanvas';
import { must } from './kit/must';
import { StepNote, VizShell } from './kit/shell';
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

function buildQuestions(): Q[] {
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
      q: 'Pas iterimit të parë të Bellman-Ford (burim A), sa është dist[D]?',
      ...opts(inf(snaps[1].D), ['5', '∞', '4', '7']),
      explain: `Në iterimin e parë relaksohen A→B (4) dhe pastaj B→D (5): 4 + 5 = **${inf(snaps[1].D)}**.`,
    },
    {
      q: 'Cila është distanca finale nga A te F?',
      ...opts(inf(final.dist.F), ['11', '13', '15', '9']),
      explain: `Rruga optimale është **${route.join(' → ')}** = ${weights.join(' + ').replace(/\+ -/g, '− ')} = **${inf(final.dist.F)}** (falë brinjës negative B→E).`,
    },
    {
      q: 'Sa iterime bën Bellman-Ford, të shumtën, në një graf me V kulme?',
      ...opts('V − 1', ['V', 'V + 1', 'V²']),
      explain: 'Një rrugë e thjeshtë ka të shumtën **V − 1** brinjë, prandaj mjaftojnë V − 1 iterime.',
    },
    {
      q: 'A mund të zbulojë Bellman-Ford ciklet negative?',
      ...opts('Po', ['Jo', 'Vetëm me peshë pozitive', 'Vetëm në grafe të padrejtuar']),
      explain: 'Po: nëse pas V − 1 iterimeve një brinjë **ende relaksohet**, grafi ka cikël negativ.',
    },
    {
      q: 'Cili është kompleksiteti kohor i Bellman-Ford?',
      ...opts('O(V·E)', ['O(V²)', 'O(E log V)', 'O(V + E)']),
      explain: '**V − 1** iterime × **E** brinjë në çdo iterim = O(V·E).',
    },
    {
      q: 'Dijkstra apo Bellman-Ford: cili lejon peshë negative?',
      ...opts('Vetëm Bellman-Ford', ['Vetëm Dijkstra', 'Të dy', 'Asnjëri']),
      explain: 'Dijkstra **kërkon w ≥ 0**: një kulm i tabeluar nuk rishikohet më. Bellman-Ford nuk e ka këtë kufizim.',
    },
    {
      q: 'Pas iterimit të dytë (burim A), sa është dist[E]?',
      ...opts(inf(snaps[2].E), ['7', '5', '3']),
      explain: `A→B→E = 4 + (−3) = 1, ndërsa A→C→E = 2 + 3 = 5. Minimumi: **${inf(snaps[2].E)}**.`,
    },
    {
      q: 'Bellman-Ford gjen rrugët nga…',
      ...opts('Një burim te të gjitha kulmet', ['Të gjitha çiftet', 'Një burim te një destinacion', 'Asnjë nga këto']),
      explain: 'Bellman-Ford (si Dijkstra) është algoritëm **me një burim**. Për të gjitha çiftet: Floyd-Warshall.',
    },
  ];
}

export default function BfQuiz() {
  const questions = useMemo(buildQuestions, []);
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
      title="Kuiz: Bellman-Ford"
      subtitle="Grafi i kuizit të laboratorit: 6 kulme, harqe me peshë pozitive dhe negative. Përgjigjuni shpejt për pikë bonus."
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
              <StepNote
                tone="success"
                text={`Përfunduat: **${correct} / ${questions.length}** të sakta, **${score} pikë**.`}
              />
            </div>
            <Button onPress={restart}>
              <RotateCcw /> Rifillo
            </Button>
          </div>
        ) : picked !== null ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <StepNote
                tone={picked === q.answer ? 'success' : 'danger'}
                text={`${picked === q.answer ? '**Saktë!**' : picked === -1 ? '**Koha mbaroi.**' : '**Jo.**'} ${q.explain}`}
              />
            </div>
            <Button onPress={next}>
              {i === questions.length - 1 ? 'Rezultati' : 'Pyetja tjetër'} <ArrowRight />
            </Button>
          </div>
        ) : (
          <StepNote
            tone="default"
            text={started ? 'Zgjidhni një përgjigje.' : 'Koha nis me përgjigjen e parë — lexoni grafin me qetësi.'}
          />
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
            ariaLabel="Grafi i kuizit Bellman-Ford"
          />
        </div>
        {over ? (
          <div className="grid place-items-center rounded-3xl bg-gradient-to-br from-brand/12 via-brand-2/10 to-transparent p-8 text-center">
            <div>
              <Trophy className="mx-auto size-10 text-accent" />
              <div className="mt-3 font-mono text-5xl font-bold">{score}</div>
              <div className="mt-1 text-muted">
                pikë · {correct} nga {questions.length} të sakta
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-xs font-semibold tracking-wider text-muted uppercase">
              Pyetja {i + 1} nga {questions.length}
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
