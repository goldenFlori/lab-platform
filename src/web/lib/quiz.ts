import { QUIZ_SECTIONS } from '../../shared/ai-sections';

// Quick questions drafted by the copilot (#87), read from their headings.

export type QuizDraft = { question: string; options: string[]; correct: number };

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const HEADING = new RegExp(`^#{1,4}\\s*(${QUIZ_SECTIONS.join('|')})\\s*:?\\s*$`, 'gm');

/** The questions written in full so far: a question, four answers and the right letter. */
export function parseQuiz(text: string): QuizDraft[] {
  const marks = [...text.matchAll(HEADING)];
  const drafts: QuizDraft[] = [];
  let current: Partial<Record<(typeof QUIZ_SECTIONS)[number], string>> = {};
  marks.forEach((mark, i) => {
    const name = mark[1] as (typeof QUIZ_SECTIONS)[number];
    const body = text.slice((mark.index ?? 0) + mark[0].length, marks[i + 1]?.index ?? text.length).trim();
    if (name === 'QUESTION') current = {};
    current[name] = body;
    if (name !== 'ANSWER') return;
    const options = LETTERS.map((letter) => current[letter]?.split('\n')[0]?.trim() ?? '');
    const correct = LETTERS.indexOf(body.replace(/[^A-D]/g, '').slice(0, 1) as (typeof LETTERS)[number]);
    if (current.QUESTION && options.every(Boolean) && correct >= 0) {
      drafts.push({ question: current.QUESTION, options, correct });
    }
  });
  return drafts;
}
