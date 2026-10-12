import type { Locale } from '../../shared/locale';
import type { ChatMessage } from './provider';

// What each AI feature asks of which model (#84). Llama 4 Scout won a small Albanian test on
// 2026-10-12 among the free Workers AI models: clear Albanian, it kept to hints when asked for the
// full solution, and it was the fastest and cheapest. Prices: neurons per million tokens.

export type Purpose = 'copilot';

type ModelChoice = { model: string; maxTokens: number; neurons: { input: number; output: number } };

const LLAMA_4_SCOUT = {
  model: '@cf/meta/llama-4-scout-17b-16e-instruct',
  neurons: { input: 24_545, output: 77_273 },
};

export const PURPOSES: Record<Purpose, ModelChoice> = {
  copilot: { ...LLAMA_4_SCOUT, maxTokens: 900 },
};

/** The most a call can use, reserved before it runs: about four characters to a token. */
export function estimateNeurons(purpose: Purpose, messages: ChatMessage[]) {
  const { neurons, maxTokens } = PURPOSES[purpose];
  const inputTokens = messages.reduce((sum, m) => sum + m.content.length, 0) / 4;
  return (inputTokens * neurons.input + maxTokens * neurons.output) / 1_000_000;
}

const COPILOT = {
  sq: (course: string) =>
    `Je kopiloti i stafit mësimor në një platformë laboratorësh për programim dhe algoritme. ` +
    `Ndihmon pedagogët e kursit "${course}" të përgatisin ushtrime, teste, pyetje dhe shpjegime. ` +
    `Përgjigju në shqip, qartë dhe shkurt. Kodi është në Python.`,
  en: (course: string) =>
    `You are the teaching staff's copilot on a lab platform for programming and algorithms. ` +
    `You help the staff of the course "${course}" prepare exercises, tests, questions and explanations. ` +
    `Answer in English, clearly and briefly. Code is in Python.`,
};

export function copilotSystem(courseTitle: string, locale: Locale | null): ChatMessage {
  return { role: 'system', content: COPILOT[locale ?? 'sq'](courseTitle) };
}
