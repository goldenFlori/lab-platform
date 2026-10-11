---
name: platform-live-coding
description: Design of the live-coding layer of the lab platform. Covers Python in the browser with Pyodide, editable and autosaved code blocks, presentation mode, Live Lab real-time sessions on Durable Objects, "your code, visualized" (student code driving the React algorithm visualizers), and exercises, submissions and grading on the pedagog's machine. Use when building code execution, live sessions, exercises, submissions or grading.
---

# Live coding

This is the platform's core innovation and the main difference from Google Classroom.
- Product context: `platform-vision`.
- Limits and stack: `platform-architecture`.

## Python in the browser (Pyodide)

Built in #47: ▶ on every code cell of the lab page (not desktop-window cells), "run the cells
above", Stop, Restart Python, and `input()` answered on the page.

- **Code:** `src/web/python/`: `worker.ts` (the sandbox), `session.ts` (one per notebook shown,
  queues runs), `runner.ts` (the Python side), `PythonProvider.tsx`; the UI is in
  `components/notebook/RunControls.tsx`.
- **The engine** comes from our own site: Vite copies `pyodide.asm.*`, `python_stdlib.zip` and
  `pyodide-lock.json` from the npm package (pinned with `--save-exact`) to `/pyodide/<version>/`,
  where Cloudflare compresses them. The packages a cell imports come from Pyodide's CDN
  (jsdelivr) at the same version, through `packageBaseUrl`.
- **Cross-origin isolation:** `public/_headers` (and `server.headers` in development) send
  COOP and COEP on every page. The worker then shares memory with the page:
  - Stop raises `KeyboardInterrupt` in the student's code and keeps the variables; Python
    restarts only if the code does not stop within 3 s;
  - `input()` waits in the worker (`Atomics.wait`) until the page answers.

  Without isolation, Stop restarts Python and `input()` reads end of file.
- **Each run:**
  - goes through `eval_code_async` with the file name `<cell N>`, so tracebacks name the cell and
    leave out Pyodide's frames;
  - shows the last expression's value, as Jupyter does;
  - ends after 2 minutes;
  - keeps at most 200 kB of output.
- **On the page:**
  - a run's output replaces the stored outputs until "Show the saved output";
  - the namespace lives as long as the notebook is shown.
- **Tested:**
  - the runner in Pyodide under Node;
  - an end-to-end student run on desktop and phone: output, namespace, errors, Stop, `input()`,
    restart and run-above.

- **Where it runs:** a dedicated Web Worker, which is the sandbox; the UI never blocks.
  - Lazy-load on the first ▶ and keep it cached.
  - Show a clear "Python is starting…" state.
- **Packages:**
  - numpy, matplotlib and networkx ship with Pyodide;
  - plotly installs through micropip;
  - preload only what the lab imports.
- **Outputs:**
  - Capture stdout and stderr.
  - Run matplotlib on the Agg backend; each figure becomes a PNG output.
  - Render outputs exactly like the stored notebook outputs (same components).
- **State, like Jupyter:**
  - one Python namespace per notebook;
  - "Run all above" to satisfy dependencies;
  - "Reset" restores the original code.
- **`input()`:** a small prompt UI shim.
- **Long loops:** a timeout plus a Stop button, which terminates and restarts the worker.
- **Not supported: pygame and tkinter.** Those cells keep their web visualizations (the `embeds`
  mechanism from the current site). Later option: pygame via pygbag-style async loops.
- **Honesty:** timing experiments (Labs 1–3) run slower in WebAssembly. The UI says so; the trends
  still show.

## Editing and autosave

- Student edits are saved per user, cell and lab version, debounced, in D1. Payloads are small:
  code text only.
- Students can always reset, or compare with the original.
- Staff never see private scratch work unless it is submitted.

## Presentation mode (built in #15; works without Pyodide)

- **Where:** **Prezanto** on the lab page opens `/o/:org/courses/:courseId/labs/:labId/present`
  for the notebook shown. The step is in the URL (`?step=`), so a reload keeps the place.
- **Fullscreen** starts with that click, because browsers allow it only on a user gesture. On an
  iPhone, which has no fullscreen for pages, the presentation still fills the screen. Text, code
  and headings are larger, for a projector.
- **Steps** (`src/notebook/slides.ts`, unit-tested):
  - one per cell: explanation, code, or visualization;
  - a cell that only opens a section becomes a large title slide;
  - code that opens a desktop window gives way to its visualization;
  - any other visualization follows its cell.
  - Phase 2 adds ▶ run beside reveal.
- **Keyboard:**
  - → and PageDown (what clickers send) move on, but first show a step's hidden output, like a
    slide that builds;
  - ← and PageUp go back;
  - Space shows or hides the output;
  - Home and End jump;
  - Esc leaves, back to the same notebook.
  - Inside a visualization its own keys apply, and Esc hands the keyboard back to the slides.
- **Solution switch** (S, or the **Zgjidhja** button): it appears when the lab has a solution
  notebook with the same cells and text (`isSolutionOf`). All 6 course solution notebooks match
  their student versions. Each code step then shows the solved code and its real outputs. It
  follows the API's permissions: students get it only once the solutions are open.
- **Tested:** a whole lab is presented with the keyboard alone, on desktop and phone.

## Exercises and grading

- **Practice:**
  - Visible tests run in the student's browser for instant feedback (✓ or ✗ with the failing
    case).
  - The AI hint level is set by the pedagog (see `platform-ai`).
- **Graded work:**
  - Submissions (code plus a metadata snapshot) are stored on the server.
  - Hidden tests are stored server-side and sent only to staff.
  - The **pedagog's browser re-runs every submission** in sandboxed Pyodide workers, in a batch.
    Results are trustworthy, and the server never executes Python.
- **Exercise variants:** generated per group or student (different data, same concept) so copying
  stops working. The AI copilot can draft them; the pedagog approves.

## Live Lab sessions (phase 3)

- **Infrastructure:** one Durable Object per session, using WebSocket Hibernation.
- **Joining:** students join with a code or QR. Room roles: host, assistant, student.
- **Message types (keep them small):**
  - `host.navigate` (current block);
  - `challenge.start` / `challenge.stop`;
  - `run.result` (pass/fail, error type, duration; never keystrokes);
  - `help.request` ("I'm stuck");
  - `reaction`.
- **Host dashboard:** live counts of passed, failed and stuck students, plus the most common error.
  Default to anonymous aggregates; names show only to staff.
- **Free-tier budget:** incoming WebSocket messages count 20:1 against 100k requests a day. Send
  events, not streams; throttle per student. A 90-minute class of 40 students uses a small
  fraction of that.
- **Follow mode:** student screens follow the host's block. They can detach and rejoin.
- **Later:** record a session (navigation, code and run events) for replay.

## "Your code, visualized" (phase 3)

- A small Python module, working name `vizlab`, preloaded in Pyodide. Its hooks post events to the
  page:
  - `vizlab.visit(node)`
  - `vizlab.relax(u, v, dist)`
  - `vizlab.compare(i, j)`
  - `vizlab.swap(i, j)`
  - `vizlab.mark(edge, state)`
- The page turns those events into step lists for the **same** React visualizers (GraphCanvas,
  the sorting player and others). A student's own BFS or Dijkstra animates exactly like the lab's
  reference version, side by side.
- Optional generic mode: a `sys.settrace` variable view, in the style of Python Tutor. Later.

## Security

- **Student code runs only in browsers,** inside Web Worker sandboxes. No `eval` on the main
  thread, and no network access from Python beyond Pyodide package loading.
- **Treat all run results from students as untrusted.** Only staff-side re-runs count for grades.
