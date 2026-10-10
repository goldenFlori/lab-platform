import { Button, Chip } from '@heroui/react';
import { ArrowRight, Gamepad2, RotateCcw, Trophy } from 'lucide-react';
import { useState } from 'react';
import { countComparisons, makeInput, SORT_META, type SortAlgo } from './algorithms/sorting';
import { StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';

/* =====================================================================
 *  Lojë: Gjej Algoritmin! — Laboratori 3, Ushtrimi 4
 *  The program sorts a random list with a hidden algorithm and shows only
 *  the number of comparisons. Recognise the algorithm from the theory.
 * ===================================================================== */

const ROUNDS = 8;
const ORDER: SortAlgo[] = ['insertion', 'selection', 'merge'];
const KEYS: Record<string, SortAlgo> = { i: 'insertion', s: 'selection', m: 'merge' };

interface Puzzle {
  n: number;
  algo: SortAlgo;
  list: number[];
  comparisons: number;
}

function makePuzzle(seed: number, rand = Math.random): Puzzle {
  const n = 12 + Math.floor(rand() * 29);
  const algo = ORDER[Math.floor(rand() * 3)];
  const list = makeInput(n, 'random', seed);
  return { n, algo, list, comparisons: countComparisons(algo, list) };
}

// The first puzzle is fixed, so a class can work through the same list together.
const FIRST: Puzzle = (() => {
  const list = makeInput(24, 'random', 2024);
  return { n: 24, algo: 'insertion', list, comparisons: countComparisons('insertion', list) };
})();

const TEXT = bilingual(
  {
    selection: (sel: number) =>
      `Selection Sort bën **gjithmonë saktësisht n(n−1)/2 = ${sel}** krahasime, pavarësisht nga rendi i listës.`,
    merge: (nlog: number) => `Merge Sort bën afërsisht **n·log₂n ≈ ${nlog}** krahasime (pak më pak), për çdo listë.`,
    insertion: (quarter: number, sel: number, nlog: number) =>
      `Insertion Sort mbi një listë të rastit bën rreth **n²/4 ≈ ${quarter}** krahasime — shumë më pak se ${sel}, por shumë më tepër se ${nlog}.`,
    title: 'Lojë: Gjej Algoritmin!',
    subtitle: 'Programi renditi listën me një algoritëm të fshehur. Ju shihni vetëm numrin e krahasimeve.',
    points: (n: number) => `${n} pikë`,
    over: (score: number) =>
      `Loja mbaroi! Morët **${score} pikë**. Strategjia: n(n−1)/2 → Selection · ≈ n·log₂n → Merge · midis tyre → Insertion.`,
    again: 'Luaj sërish',
    right: '**Saktë!**',
    wrong: (name: string) => `**Jo** — ishte ${name}.`,
    result: 'Shiko rezultatin',
    nextRound: 'Raundi tjetër',
    hint: 'Krahasoni numrin me dy vlerat referuese. Shtypni **I**, **S** ose **M**, ose klikoni një buton.',
    list: (n: number) => `Lista me ${n} elemente`,
    comparisons: 'Krahasime',
    key: (k: string) => `tasti ${k}`,
  },
  {
    selection: (sel) =>
      `Selection Sort **always makes exactly n(n−1)/2 = ${sel}** comparisons, whatever the order of the list.`,
    merge: (nlog) => `Merge Sort makes about **n·log₂n ≈ ${nlog}** comparisons (a little fewer), for any list.`,
    insertion: (quarter, sel, nlog) =>
      `Insertion Sort on a random list makes about **n²/4 ≈ ${quarter}** comparisons — far fewer than ${sel}, but far more than ${nlog}.`,
    title: 'Game: Guess the algorithm!',
    subtitle: 'The program sorted the list with a hidden algorithm. You only see the number of comparisons.',
    points: (n) => `${n} points`,
    over: (score) =>
      `Game over! You scored **${score} points**. The strategy: n(n−1)/2 → Selection · ≈ n·log₂n → Merge · in between → Insertion.`,
    again: 'Play again',
    right: '**Right!**',
    wrong: (name) => `**No** — it was ${name}.`,
    result: 'See the result',
    nextRound: 'Next round',
    hint: 'Compare the number with the two reference values. Press **I**, **S** or **M**, or click a button.',
    list: (n) => `A list of ${n} elements`,
    comparisons: 'Comparisons',
    key: (k) => `key ${k}`,
  },
);

type GameText = (typeof TEXT)['sq'];

function explain(L: GameText, p: Puzzle) {
  const sel = (p.n * (p.n - 1)) / 2;
  const nlog = Math.round(p.n * Math.log2(p.n));
  if (p.algo === 'selection') return L.selection(sel);
  if (p.algo === 'merge') return L.merge(nlog);
  return L.insertion(Math.round((p.n * p.n) / 4), sel, nlog);
}

export default function GuessAlgoGame() {
  const [round, setRound] = useState(1);
  const [puzzle, setPuzzle] = useState<Puzzle>(FIRST);
  const [answer, setAnswer] = useState<SortAlgo | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const over = round > ROUNDS;
  const L = useText(TEXT);

  const choose = (a: SortAlgo) => {
    if (answer || over) return;
    setAnswer(a);
    if (a === puzzle.algo) {
      setScore((s) => s + 10 + streak * 2);
      setStreak((s) => s + 1);
    } else setStreak(0);
  };
  const next = () => {
    setAnswer(null);
    setRound((r) => r + 1);
    setPuzzle(makePuzzle(Math.floor(Math.random() * 1e9)));
  };
  const restart = () => {
    setRound(1);
    setScore(0);
    setStreak(0);
    setAnswer(null);
    setPuzzle(makePuzzle(Math.floor(Math.random() * 1e9)));
  };

  // I, S, M answer and Space or Enter moves on, while focus is inside the game.
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (KEYS[k]) choose(KEYS[k]);
    if ((k === ' ' || k === 'enter') && answer && !over) {
      e.preventDefault();
      next();
    }
  };

  const sel = (puzzle.n * (puzzle.n - 1)) / 2;
  const nlog = Math.round(puzzle.n * Math.log2(puzzle.n));
  const max = Math.max(...puzzle.list);

  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<Gamepad2 />}
      onKeyDown={onKey}
      badges={
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft" color="accent">
            <Trophy className="size-3" /> {L.points(score)}
          </Chip>
          <Chip size="sm" variant="soft">
            {Math.min(round, ROUNDS)} / {ROUNDS}
          </Chip>
        </div>
      }
      footer={
        over ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StepNote text={L.over(score)} tone="success" />
            <Button onPress={restart}>
              <RotateCcw /> {L.again}
            </Button>
          </div>
        ) : answer ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <StepNote
                tone={answer === puzzle.algo ? 'success' : 'danger'}
                text={`${answer === puzzle.algo ? L.right : L.wrong(SORT_META[puzzle.algo].name)} ${explain(L, puzzle)}`}
              />
            </div>
            <Button onPress={next}>
              {round === ROUNDS ? L.result : L.nextRound} <ArrowRight />
            </Button>
          </div>
        ) : (
          <StepNote text={L.hint} tone="default" />
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div
            className="flex items-end gap-[3px] rounded-2xl border border-border bg-[var(--viz-canvas)] p-3"
            style={{ height: 150 }}
            aria-label={L.list(puzzle.n)}
            role="img"
          >
            {puzzle.list.map((v, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: bars are positions in a fixed list
                key={i}
                className="min-w-0 flex-1 rounded-t-[3px] bg-[var(--viz-idle)]"
                style={{ height: `${10 + (v / max) * 88}%` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-border p-2.5">
              <div className="text-[0.68rem] font-semibold tracking-wider text-muted uppercase">n</div>
              <div className="font-mono text-lg font-semibold">{puzzle.n}</div>
            </div>
            <div className="rounded-2xl border border-border p-2.5">
              <div className="text-[0.68rem] font-semibold tracking-wider text-muted uppercase">n(n−1)/2</div>
              <div className="font-mono text-lg font-semibold">{sel}</div>
            </div>
            <div className="rounded-2xl border border-border p-2.5">
              <div className="text-[0.68rem] font-semibold tracking-wider text-muted uppercase">n·log₂n</div>
              <div className="font-mono text-lg font-semibold">{nlog}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4">
          <div className="rounded-3xl bg-gradient-to-br from-brand/12 via-brand-2/10 to-transparent p-5 text-center">
            <div className="text-xs font-semibold tracking-wider text-muted uppercase">{L.comparisons}</div>
            <div className="font-mono text-5xl font-bold tracking-tight tabular-nums">{puzzle.comparisons}</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ORDER.map((a) => {
              const isRight = answer && a === puzzle.algo;
              const isWrong = answer === a && a !== puzzle.algo;
              return (
                <Button
                  key={a}
                  variant={isRight ? 'primary' : isWrong ? 'danger' : 'secondary'}
                  onPress={() => choose(a)}
                  isDisabled={!!answer && !isRight && !isWrong}
                  fullWidth
                  className="h-auto flex-col gap-0.5 rounded-2xl py-3"
                >
                  <span className="text-[0.95rem] font-semibold">{SORT_META[a].name.split(' ')[0]}</span>
                  <span className="font-mono text-[0.7rem] opacity-70">{L.key(a[0].toUpperCase())}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </VizShell>
  );
}
