import { describe, expect, it } from 'vitest';
import { fromEvents } from '../../src/api/ai/provider';

// What Workers AI streams (#93): numbers arrive as JSON numbers, and the usage comes last.

const events = (...data: string[]) =>
  new Response(data.map((d) => `data: ${d}\n\n`).join('')).body as ReadableStream<Uint8Array>;

describe('reading a Workers AI stream', () => {
  it('keeps number tokens and reports the total neurons', async () => {
    const answer = fromEvents(
      events(
        '{"response":"assert len(k) =="}',
        '{"response":" "}',
        '{"response":4}',
        '{"response":", \\"n <= "}',
        '{"response":6}',
        '{"response":"\\""}',
        '{"response":"","usage":{"neurons":1.5}}',
        '[DONE]',
      ),
    );
    expect(await new Response(answer.text.pipeThrough(new TextEncoderStream())).text()).toBe(
      'assert len(k) == 4, "n <= 6"',
    );
    expect(answer.neurons()).toBe(1.5);
  });
});
