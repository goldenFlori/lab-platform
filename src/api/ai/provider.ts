// The model behind every AI feature (#84), behind one small interface so a provider can be swapped
// per purpose or per tenant plan. Workers AI in production; a fake one in tests and end-to-end
// runs, which cannot reach Cloudflare's models.

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** The answer as it is written, and the neurons it used once it has ended (null if never told). */
export type AiStream = { text: ReadableStream<string>; neurons: () => number | null };

export interface AiProvider {
  stream(model: string, messages: ChatMessage[], maxTokens: number): Promise<AiStream>;
}

/** Workers AI ran out of the day's free allocation (its error 4006). */
export class AiQuotaError extends Error {}

type Runner = { run(model: string, inputs: object): Promise<unknown> };

export function provider(env: Env): AiProvider {
  return (env.AI_PROVIDER as string) === 'fake' ? fakeProvider : workersAi(env.AI as unknown as Runner);
}

function workersAi(ai: Runner): AiProvider {
  return {
    async stream(model, messages, maxTokens) {
      try {
        const body = await ai.run(model, { messages, max_tokens: maxTokens, stream: true });
        return fromEvents(body as ReadableStream<Uint8Array>);
      } catch (error) {
        if (String(error).includes('4006')) throw new AiQuotaError();
        throw error;
      }
    },
  };
}

/**
 * Workers AI streams server-sent events: text in `response`, and the total `usage` in the last one.
 * A token that looks like a number comes as a JSON number (`"response":4`), so it is turned back
 * into text; dropping it lost every digit.
 */
export function fromEvents(body: ReadableStream<Uint8Array>): AiStream {
  let buffer = '';
  let used: number | null = null;
  const text = body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, string>({
      transform(chunk, out) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const data = line.startsWith('data:') ? line.slice(5).trim() : '';
          if (!data || data === '[DONE]') continue;
          try {
            const event = JSON.parse(data) as { response?: unknown; usage?: { neurons?: unknown } };
            const token = event.response;
            if (typeof token === 'number' || (typeof token === 'string' && token)) out.enqueue(String(token));
            if (typeof event.usage?.neurons === 'number') used = event.usage.neurons;
          } catch {
            // Not an event we know: skip it.
          }
        }
      },
    }),
  );
  return { text, neurons: () => used };
}

/** A variant a pedagog could save: its solution passes its tests and its starter does not. */
const FAKE_VARIANT = `### TITLE
Shuma e numrave çift
### TASK
Shkruani \`shuma_cift(lista)\` që kthen shumën e numrave çift të listës.
### STARTER
\`\`\`python
def shuma_cift(lista):
    # TODO
    pass
\`\`\`
### SOLUTION
\`\`\`python
def shuma_cift(lista):
    return sum(x for x in lista if x % 2 == 0)
\`\`\`
### TESTS
assert shuma_cift([1, 2, 3, 4]) == 6, "shuma_cift([1, 2, 3, 4]) duhet 6"
assert shuma_cift([]) == 0, "lista bosh jep 0"
`;

/** Quick questions as the copilot writes them: the right answers are B and A. */
const FAKE_QUIZ = `### QUESTION
Sa krahasime bën Insertion Sort në një listë të renditur me 5 elemente?
### A
0
### B
4
### C
10
### D
25
### ANSWER
B
### QUESTION
Cila strukturë përdoret nga BFS?
### A
Radha
### B
Stiva
### C
Pema
### D
Grumbulli
### ANSWER
A
`;

/** A translation that marks each part as translated, keeping its marks and its first line. */
const fakeTranslation = (parts: string) =>
  parts.replace(/^(\[\[\d+\]\]\n)(.*)$/gm, (_, mark: string, line: string) => `${mark}EN: ${line}`);

/** Answers at once (a variant, questions or a translation when asked, else the question's start), and reports 3 neurons. */
const fakeProvider: AiProvider = {
  async stream(_model, messages) {
    const system = messages[0]?.content ?? '';
    const last = messages.at(-1)?.content ?? '';
    const answer = system.includes('### SOLUTION')
      ? FAKE_VARIANT
      : system.includes('### ANSWER')
        ? FAKE_QUIZ
        : system.includes('You translate')
          ? fakeTranslation(last)
          : `Përgjigje prove: ${last.slice(0, 60)}`;
    const words = answer.split(' ');
    const text = new ReadableStream<string>({
      start(controller) {
        for (const word of words) controller.enqueue(`${word} `);
        controller.close();
      },
    });
    return { text, neurons: () => 3 };
  },
};
