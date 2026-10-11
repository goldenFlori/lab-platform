// Messages between the page and the Python worker (#47).

export type ToWorker =
  | {
      type: 'init';
      /** Shared memory, when the page is cross-origin isolated: Stop and input() then work in place. */
      interrupt?: SharedArrayBuffer;
      stdin?: SharedArrayBuffer;
    }
  /** `check`: the run is an exercise's, and checks it (#51). */
  | { type: 'run'; id: number; code: string; filename: string; check?: import('./runner').RunCheck };

export type FromWorker =
  | { type: 'ready' }
  /** Packages being loaded for the next run, by name. */
  | { type: 'packages'; names: string[] }
  | { type: 'figure'; id: number; kind: 'image'; data: Uint8Array }
  | { type: 'figure'; id: number; kind: 'plotly'; data: string }
  | { type: 'output'; id: number; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'input'; id: number }
  | { type: 'done'; id: number; outcome: import('./runner').RunOutcome }
  | { type: 'failed'; message: string };

/** Bytes the page can hand to input() at once. */
export const STDIN_BYTES = 64 * 1024;

/**
 * The stdin buffer: [0] is 0 while the worker waits and 1 once answered; [1] is the answer's length
 * in bytes, or −1 when the run was stopped instead. The answer follows from byte 8.
 */
export const STDIN_HEADER = 8;
