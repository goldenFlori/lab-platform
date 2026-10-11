/// <reference lib="webworker" />
import { loadPyodide, type PyodideAPI, version } from 'pyodide';
import type { PyProxy } from 'pyodide/ffi';
import { type FromWorker, STDIN_HEADER, type ToWorker } from './protocol';
import { MICROPIP_PACKAGES, RUNNER_PY, type RunOutcome } from './runner';

// The sandbox where students' Python runs (#47): Pyodide in a Web Worker, so the page never
// freezes and the code cannot touch it. The engine comes from our own site (its files are copied
// at build time, see vite.config.ts); the packages a cell imports come from Pyodide's CDN at the
// same version.

declare const self: DedicatedWorkerGlobalScope;

const post = (message: FromWorker) => self.postMessage(message);

let pyodide: PyodideAPI | undefined;
let interrupt: Uint8Array | undefined;
let stdinControl: Int32Array | undefined;
let stdinData: Uint8Array | undefined;
let current = 0;
/** Package installs print their own progress; that is not the student's output. */
let muted = false;

/** Output goes out in pieces, not a message per print(): a loop of prints must not flood the page. */
function stream(name: 'stdout' | 'stderr') {
  const decoder = new TextDecoder();
  let pending = '';
  let last = Date.now();
  const flush = () => {
    if (pending) post({ type: 'output', id: current, stream: name, text: pending });
    pending = '';
    last = Date.now();
  };
  return {
    flush,
    write(buffer: Uint8Array) {
      if (muted) return buffer.length;
      pending += decoder.decode(buffer, { stream: true });
      if (pending.length > 4096 || Date.now() - last > 50) flush();
      return buffer.length;
    },
  };
}

const stdout = stream('stdout');
const stderr = stream('stderr');
const installed = new Set<string>();

/** Figures, in their place among the prints. */
const display = {
  image(data: PyProxy) {
    stdout.flush();
    stderr.flush();
    const bytes = (data.toJs() as Uint8Array).slice();
    data.destroy();
    self.postMessage({ type: 'figure', id: current, kind: 'image', data: bytes } satisfies FromWorker, [bytes.buffer]);
  },
  plotly(json: string) {
    stdout.flush();
    stderr.flush();
    post({ type: 'figure', id: current, kind: 'plotly', data: json });
  },
};

/** "Loading numpy, matplotlib" → the names, for the page to say in its language. */
const packageNames = (message: string) => /^Loading (.+)$/.exec(message)?.[1]?.split(/,\s*/).filter(Boolean) ?? [];

/** input(): ask the page and wait, in this worker, until it answers. Without shared memory, EOF. */
function readLine() {
  if (!stdinControl || !stdinData) return undefined;
  stdout.flush();
  stderr.flush();
  Atomics.store(stdinControl, 0, 0);
  post({ type: 'input', id: current });
  Atomics.wait(stdinControl, 0, 0);
  const length = Atomics.load(stdinControl, 1);
  if (length < 0) return undefined;
  const copy = new Uint8Array(length);
  copy.set(stdinData.subarray(0, length));
  return `${new TextDecoder().decode(copy)}\n`;
}

async function start(message: Extract<ToWorker, { type: 'init' }>) {
  try {
    pyodide = await loadPyodide({
      indexURL: `/pyodide/${version}/`,
      packageBaseUrl: `https://cdn.jsdelivr.net/pyodide/v${version}/full/`,
    });
    pyodide.setStdout(stdout);
    pyodide.setStderr(stderr);
    pyodide.setStdin({ stdin: readLine });
    pyodide.registerJsModule('_lab_display', display);
    if (message.interrupt) {
      interrupt = new Uint8Array(message.interrupt);
      pyodide.setInterruptBuffer(interrupt);
    }
    if (message.stdin) {
      stdinControl = new Int32Array(message.stdin, 0, 2);
      stdinData = new Uint8Array(message.stdin, STDIN_HEADER);
    }
    await pyodide.runPythonAsync(RUNNER_PY);
    post({ type: 'ready' });
  } catch (error) {
    post({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function run({ id, code, filename }: Extract<ToWorker, { type: 'run' }>) {
  if (!pyodide) return;
  current = id;
  if (interrupt) interrupt[0] = 0;
  let outcome: RunOutcome;
  try {
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: (text) => {
        const names = packageNames(text);
        if (names.length) post({ type: 'packages', names });
      },
    });
    for (const [name, pattern] of Object.entries(MICROPIP_PACKAGES)) {
      if (installed.has(name) || !pattern.test(code)) continue;
      post({ type: 'packages', names: [name] });
      muted = true;
      try {
        await pyodide.loadPackage('micropip', { messageCallback: () => {} });
        await pyodide.pyimport('micropip').install(name);
      } finally {
        muted = false;
      }
      installed.add(name);
    }
    const result = await pyodide.globals.get('_lab_run')(code, filename);
    // Python's None arrives as undefined.
    const [kind, text = null] = result.toJs() as [string, string | undefined];
    result.destroy();
    outcome =
      kind === 'ok'
        ? { kind: 'ok', value: text }
        : kind === 'error'
          ? { kind: 'error', traceback: text ?? '' }
          : { kind: 'interrupted' };
  } catch (error) {
    outcome = { kind: 'error', traceback: error instanceof Error ? error.message : String(error) };
  }
  stdout.flush();
  stderr.flush();
  post({ type: 'done', id, outcome });
}

// Runs come one at a time: the page queues them, and a run awaits its packages before it starts.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === 'init') queue = queue.then(() => start(message));
  else queue = queue.then(() => run(message));
};
