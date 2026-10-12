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

/** Workers AI streams server-sent events: text in `response`, and the total `usage` in the last one. */
function fromEvents(body: ReadableStream<Uint8Array>): AiStream {
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
            if (typeof event.response === 'string' && event.response) out.enqueue(event.response);
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

/** Answers at once with the question's start, and reports 3 neurons. */
const fakeProvider: AiProvider = {
  async stream(_model, messages) {
    const words = `Përgjigje prove: ${messages.at(-1)?.content.slice(0, 60) ?? ''}`.split(' ');
    const text = new ReadableStream<string>({
      start(controller) {
        for (const word of words) controller.enqueue(`${word} `);
        controller.close();
      },
    });
    return { text, neurons: () => 3 };
  },
};
