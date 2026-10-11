import { type FromWorker, STDIN_BYTES, STDIN_HEADER, type ToWorker } from './protocol';
import type { RunCheck, RunOutcome } from './runner';

// One Python per notebook on the page (#47): a worker with one namespace, runs one at a time.
// When the page is cross-origin isolated (see public/_headers), Stop interrupts the code and keeps
// the namespace, and input() asks on the page. Otherwise Stop restarts Python.

export type PythonStatus = 'off' | 'starting' | 'ready' | 'failed';

/** Printed text, or a figure (an object URL of its PNG or Plotly JSON). */
export type OutputBlock =
  | { stream: 'stdout' | 'stderr'; text: string }
  | { figure: 'image' | 'plotly' | 'vizlab'; url: string };

export type CellRun = {
  state: 'queued' | 'running' | 'done';
  output: OutputBlock[];
  outcome?: RunOutcome;
  /** input() waits for an answer. */
  asking: boolean;
  /** Output past the limit was dropped. */
  truncated: boolean;
};

export type SessionState = {
  status: PythonStatus;
  /** The packages a run waits for, while they load. */
  packages: string[] | null;
  failure: string | null;
  runs: ReadonlyMap<string, CellRun>;
  /** The cell running now, if any. */
  running: string | null;
};

/** Time a single cell may run before it is stopped. */
export const RUN_LIMIT_MS = 120_000;
/** Output kept per cell; a loop that prints forever must not fill the page. */
const OUTPUT_LIMIT = 200_000;
/** How long an interrupt may take before the worker is replaced. */
const STOP_GRACE_MS = 3000;

type Job = {
  id: number;
  key: string;
  code: string;
  filename: string;
  check?: RunCheck;
  resolve: (run: CellRun) => void;
};

export type SessionOptions = {
  /** Whether input() asks on the page; without it, input() reads end of file (grading, #53). */
  input?: boolean;
  /** Time a single cell may run before it is stopped. */
  runLimitMs?: number;
};

export class PythonSession {
  constructor(private readonly options: SessionOptions = {}) {}

  private worker: Worker | null = null;
  private interrupt: Uint8Array | null = null;
  private stdin: SharedArrayBuffer | null = null;
  private nextId = 1;
  private queue: Job[] = [];
  private active: Job | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  /** Figures' object URLs per cell, released when the cell runs again or is cleared. */
  private urls = new Map<string, string[]>();

  private release(key?: string) {
    for (const [k, list] of this.urls) {
      if (key !== undefined && k !== key) continue;
      for (const url of list) URL.revokeObjectURL(url);
      this.urls.delete(k);
    }
  }
  private state: SessionState = { status: 'off', packages: null, failure: null, runs: new Map(), running: null };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private set(changes: Partial<SessionState>) {
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener();
  }

  private setRun(key: string, run: CellRun) {
    const runs = new Map(this.state.runs);
    runs.set(key, run);
    this.set({ runs });
  }

  private start() {
    if (this.worker) return;
    this.set({ status: 'starting', failure: null });
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<FromWorker>) => this.receive(event.data);
    worker.onerror = (event) => this.set({ status: 'failed', failure: event.message || 'worker' });
    const isolated = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated;
    const init: ToWorker = { type: 'init' };
    if (isolated) {
      const interrupt = new SharedArrayBuffer(1);
      this.interrupt = new Uint8Array(interrupt);
      init.interrupt = interrupt;
      if (this.options.input !== false) {
        this.stdin = new SharedArrayBuffer(STDIN_HEADER + STDIN_BYTES);
        init.stdin = this.stdin;
      }
    }
    worker.postMessage(init);
    this.worker = worker;
  }

  private receive(message: FromWorker) {
    const job = this.active;
    switch (message.type) {
      case 'ready':
        this.set({ status: 'ready' });
        this.next();
        return;
      case 'failed':
        this.set({ status: 'failed', failure: message.message });
        return;
      case 'packages':
        this.set({ packages: message.names });
        return;
      case 'figure': {
        if (!job || job.id !== message.id) return;
        const run = this.state.runs.get(job.key);
        if (!run) return;
        const blob =
          message.kind === 'image'
            ? new Blob([message.data as BlobPart], { type: 'image/png' })
            : new Blob([message.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        this.urls.set(job.key, [...(this.urls.get(job.key) ?? []), url]);
        this.setRun(job.key, { ...run, output: [...run.output, { figure: message.kind, url }] });
        return;
      }
      case 'output': {
        if (!job || job.id !== message.id) return;
        const run = this.state.runs.get(job.key);
        if (!run) return;
        const used = run.output.reduce((n, o) => n + ('text' in o ? o.text.length : 0), 0);
        if (used >= OUTPUT_LIMIT) {
          if (!run.truncated) this.setRun(job.key, { ...run, truncated: true });
          return;
        }
        const text = message.text.slice(0, OUTPUT_LIMIT - used);
        const last = run.output.at(-1);
        // Consecutive pieces of the same stream read as one block.
        const output =
          last && 'stream' in last && last.stream === message.stream
            ? [...run.output.slice(0, -1), { stream: last.stream, text: last.text + text }]
            : [...run.output, { stream: message.stream, text }];
        this.setRun(job.key, { ...run, output, truncated: text.length < message.text.length });
        return;
      }
      case 'input': {
        if (!job || job.id !== message.id) return;
        const run = this.state.runs.get(job.key);
        if (run) this.setRun(job.key, { ...run, asking: true });
        return;
      }
      case 'done': {
        if (!job || job.id !== message.id) return;
        this.finish(job, message.outcome);
        return;
      }
    }
  }

  private finish(job: Job, outcome: RunOutcome) {
    clearTimeout(this.timer);
    const run = this.state.runs.get(job.key);
    const done: CellRun = { ...(run ?? { output: [], truncated: false }), state: 'done', outcome, asking: false };
    this.setRun(job.key, done);
    this.active = null;
    this.set({ running: null, packages: null });
    job.resolve(done);
    this.next();
  }

  private next() {
    if (this.active || this.state.status !== 'ready') return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    const run = this.state.runs.get(job.key);
    if (run) this.setRun(job.key, { ...run, state: 'running' });
    this.set({ running: job.key });
    this.timer = setTimeout(() => this.stop(), this.options.runLimitMs ?? RUN_LIMIT_MS);
    this.worker?.postMessage({
      type: 'run',
      id: job.id,
      code: job.code,
      filename: job.filename,
      check: job.check,
    } satisfies ToWorker);
  }

  /** Queues a cell's code; resolves when it has run (or was stopped). An exercise's run checks it. */
  run(key: string, code: string, filename: string, check?: RunCheck): Promise<CellRun> {
    this.start();
    this.release(key);
    this.setRun(key, { state: 'queued', output: [], asking: false, truncated: false });
    return new Promise((resolve) => {
      this.queue.push({ id: this.nextId++, key, code, filename, check, resolve });
      this.next();
    });
  }

  /** Answers the input() the running cell waits for. */
  answer(text: string) {
    const job = this.active;
    if (!job || !this.stdin) return;
    const bytes = new TextEncoder().encode(text).slice(0, STDIN_BYTES);
    new Uint8Array(this.stdin, STDIN_HEADER).set(bytes);
    const control = new Int32Array(this.stdin, 0, 2);
    Atomics.store(control, 1, bytes.length);
    Atomics.store(control, 0, 1);
    Atomics.notify(control, 0);
    const run = this.state.runs.get(job.key);
    if (run)
      this.setRun(job.key, { ...run, asking: false, output: [...run.output, { stream: 'stdout', text: `${text}\n` }] });
  }

  /** Stops the running cell and drops the queued ones. Python restarts if it will not stop. */
  stop() {
    for (const job of this.queue.splice(0)) this.drop(job);
    const job = this.active;
    if (!job) return;
    if (this.interrupt) {
      this.interrupt[0] = 2; // SIGINT: KeyboardInterrupt in the student's code
      if (this.stdin) {
        // A run waiting in input() wakes up, stopped.
        const control = new Int32Array(this.stdin, 0, 2);
        Atomics.store(control, 1, -1);
        Atomics.store(control, 0, 1);
        Atomics.notify(control, 0);
      }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.active === job) this.restart(job);
      }, STOP_GRACE_MS);
    } else {
      this.restart(job);
    }
  }

  /** A fresh Python: the namespace is gone; outputs on the page stay. */
  restart(stopped?: Job) {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    const active = stopped ?? this.active;
    this.active = null;
    this.set({ status: 'off', running: null, packages: null });
    if (active) this.finish(active, { kind: 'interrupted' });
    for (const job of this.queue.splice(0)) this.drop(job);
  }

  /** A queued cell that will not run after all. */
  private drop(job: Job) {
    const run = this.state.runs.get(job.key);
    const dropped: CellRun = {
      ...(run ?? { output: [], truncated: false }),
      state: 'done',
      outcome: { kind: 'interrupted' },
      asking: false,
    };
    this.setRun(job.key, dropped);
    job.resolve(dropped);
  }

  /** Forgets a cell's run, so its stored outputs show again. */
  clear(key: string) {
    this.release(key);
    const runs = new Map(this.state.runs);
    runs.delete(key);
    this.set({ runs });
  }

  /** Forgets every run, so the stored outputs show again. */
  clearAll() {
    this.release();
    this.set({ runs: new Map() });
  }

  dispose() {
    this.release();
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
  }
}
