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
- **Packages and figures** (#48):
  - Pyodide's own packages (numpy, matplotlib, networkx…) load from a cell's imports;
  - plotly is installed with micropip from PyPI (`MICROPIP_PACKAGES` in `runner.ts`), its
    progress kept out of the student's output;
  - matplotlib draws off-screen (Agg): each `plt.show()`, or a figure left open when the cell ends,
    becomes a PNG in place, and matplotlib's own deprecation notices while saving stay out;
  - plotly's `fig.show()` sends the figure's JSON, drawn with the same `PlotlyFigure` as saved
    outputs;
  - a figure as a cell's last value shows as a figure;
  - figures reach the page through the worker's `_lab_display` module as object URLs, released
    when the cell runs again or is cleared;
  - code that measures time (`time.perf_counter()` and the like) gets a note that the browser runs
    it slower, while the trends stay the same.
- **Caching:** the engine's files are served with a year-long `Cache-Control` (`public/_headers`):
  their path names the version, so they never change in place. About 6 MB on the first run
  (the WebAssembly compresses from 9.6 MB to 3.5 MB).
- **Tested:**
  - the runner in Pyodide under Node;
  - every runnable cell of the 19 course notebooks, through the same runner under Node
    (`test/notebook/course-cells.test.ts`): only exercise blanks (`___`) may fail, and every
    Plotly `fig.show()` shows its figure. It needs the network once; packages are then cached in
    `node_modules/pyodide`;
  - an end-to-end student run on desktop and phone: output, namespace, errors, Stop, `input()`,
    restart and run-above;
  - numpy, a matplotlib image, a Plotly figure and the timing note in the browser.

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

Built in #49.

- **Editor:** CodeMirror 6 with Python (`components/notebook/CodeEditor.tsx`), its own chunk
  (about 120 kB gzipped), loaded the first time someone edits.
  - Colors follow the site's code (the `tok-*` classes in `styles.css`).
  - Tab indents; Esc then Tab moves on.
- **What can be edited:** on the lab page, every cell that can run; ✎ opens the editor.
  - An edited cell shows the editor, an "Edited" label, ↺ to restore the original and the
    original code folded below.
  - Run and "run the cells above" use the student's own code (`PythonProvider`'s `codeFor`).
- **Saving** (`lib/code-edits.tsx`):
  - 0.8 s after typing stops, and at once (with `keepalive`) when the page is hidden or closed;
  - code put back exactly as it was deletes the saved copy;
  - a bar above the notebook shows how many cells changed, whether they are saved, and "restore
    all", which asks first.
- **Storage:** `code_edits`, one row per user, notebook and cell (srcIndex), code only, at most
  100,000 characters.
  - `GET/PUT/DELETE …/notebooks/:id/edits[/:cell]` serve only the signed-in user's own rows, to
    anyone who may read the notebook.
  - Staff have no route to a student's edits; submitted work is shared on its own (#52).
  - A notebook uploaded again is a new notebook, so old edits never land on changed cells.
- **Tested:**
  - API: per-cell saves, resets, privacy between students and staff, limits, tenant isolation;
  - end-to-end: a student edits, runs the edit, finds it after a reload and on another device;
    staff see the original; one cell and then all are restored.

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
- **Running code** (#50): on a code step that can run, **Ekzekuto (R)** runs it, and R again stops
  it; "run the cells above" sits beside it.
  - One Python for the notebook while presenting, so a lab runs top to bottom as in Jupyter. With
    the solution shown, the solved code runs instead (`codeFor`), in the same namespace.
  - A run stands in for the saved output until "Show the saved output". A step that ran shows its
    own output, so → moves straight on.
  - Outputs use the projector sizes (`run-text` and `run-note` in `styles.css`). An error shows
    where it failed, then the error itself in bold (also on the lab page).
  - The presenter holds the session itself (`useNotebookPython` + `PythonScope`), because its
    keyboard handler drives it.
- **Keyboard:**
  - → and PageDown (what clickers send) move on, but first show a step's hidden output, like a
    slide that builds;
  - ← and PageUp go back;
  - Space shows or hides the output;
  - Home and End jump;
  - R runs the step's code, or stops it;
  - Esc leaves, back to the same notebook.
  - Inside a visualization its own keys apply, and Esc hands the keyboard back to the slides.
- **Solution switch** (S, or the **Zgjidhja** button): it appears when the lab has a solution
  notebook with the same cells and text (`isSolutionOf`). All 6 course solution notebooks match
  their student versions. Each code step then shows the solved code and its real outputs. It
  follows the API's permissions: students get it only once the solutions are open.
- **Tested:** a whole lab is presented with the keyboard alone, on desktop and phone; a lab is run
  step by step with the keyboard alone: one namespace, the solved code, an error and projector
  sizes.

## Exercises and grading

- **Practice** (built in #51):
  - **An exercise** is a cell whose run checks it (`exercises`, one row per notebook and cell):
    either the cell calls `kontrollo(title, tests)` itself, as the course's supplementary
    notebooks do, or staff wrote a visible test (Python, usually asserts) that runs right after
    the cell, in its namespace.
  - **Found where the notebook is converted** (`detectExercises` in `src/notebook/exercises.ts`):
    the upload in the app and the course import save the `kontrollo(…)` cells; the import fills
    kept notebooks only when they have none, so a list staff changed stays. Staff change the list
    on the lab page ("Ushtrimet në këtë fletore", with "Gjej në fletore"), and
    `PUT …/notebooks/:id/exercises` replaces it.
  - **The check runs in Python** (`_lab_run` in `runner.ts`): while an exercise runs, the
    namespace's `kontrollo` is ours, and a visible test runs as a function after the cell. A check
    passes, fails with its assert's message (the failing case), finds the exercise not written
    yet (`NotImplementedError`), or names the error. A `NameError` offers "run the cells above".
    Each cell's source is kept in `linecache`, as Jupyter does, so checks that read a function's
    source (`inspect.getsource`) work.
  - **On the page:** the exercise's cell shows its title, "Solved" once its check has passed, and
    for staff with analytics "N of M students have solved it" (their groups only, counts only).
    The check shows as a card in the run's output; presentations show it too.
  - **Completion** (`POST …/exercises/:cell/done`): kept once per student and exercise
    (`exercise_completions`) the first time a check passes, and recorded as `exercise` activity.
    It is practice: the browser is trusted with it, it never counts for a grade, and staff are not
    counted.
  - **Tested:** every course check runs and finds the student version not written yet; all 29
    solved versions pass (checked locally against the git-ignored solutions); end to end, a
    student solves two exercises and the pedagog sees the counts.
  - The AI hint level is set by the pedagog (see `platform-ai`).
- **Submissions** (built in #52, `src/api/routes/submissions.ts`):
  - **Opening:** staff with `lab.publish` open a notebook for submission to a group with a
    deadline (`assignments`, one per notebook and group), move the deadline or close it, from
    "Dorëzimi i kësaj fletoreje" on the lab page. Closing removes the deadline, never the work.
  - **Handing in:** a student of a group with an open deadline (`submission.create`) presses
    "Dorëzo punën". The page saves their last changes first; then the server copies their saved
    code (`code_edits`) and solved exercises (`exercise_completions`) into `submissions`, one per
    student and notebook, replaced on each resubmission (attempts counted) until the deadline;
    after it, 409. The browser sends nothing but the request, so a submission is what the account
    holds.
  - **Reading:** a student sees only their own (`GET …/submission`). Staff with
    `submission.review` in a group (pedagogs, assistants) list its students with what each handed
    in (`GET …/submissions?group=`) and read one student's code (`GET …/submissions/:userId`) on
    the lab's "Dorëzimet" page; other staff, other students and other groups get 403 or 404.
  - Grading the submissions is #53.
- **Grading** (built in #53, `src/api/routes/grading.ts`, `src/web/python/grade.ts`):
  - **Setup** (`exercise_grading`, staff with `grade.edit` for the whole course): each exercise's
    points (default 1) and an optional hidden test, never sent to students.
  - **The batch run** happens on the "Dorëzimet" page, in the pedagog's browser. It fetches the
    group's submissions with their code, then runs each one in a fresh Python worker (no
    `input()`, 30 s per cell). The notebook's cells run in order with the student's code. An
    exercise's check comes from the notebook and the server, never from the student: a cell that
    only checks (`kontrollo`) runs as the notebook has it; one that is also left to fill
    (`NotImplementedError`, `___`, `PLOTESO`) runs as the student wrote it. The hidden test runs
    after a passing check. Each grade is stored as it is made (`grades`); the server never runs
    Python, and students' own browsers never write grades.
  - **Review:** the pedagog adjusts a score (`score` overrides the run's) and writes feedback; a
    new run updates the run's score and keeps the adjustment.
  - **Release** per group: students then see their grade and feedback in the submission bar.
  - **Known limit:** a student who studies the platform's runner could tamper with the checks from
    their own code; the pedagog reads the code, and hidden tests make guessing harder.
- **Exercise variants:** generated per group or student (different data, same concept) so copying
  stops working. The AI copilot can draft them; the pedagog approves.

## Live Lab sessions (phase 3)

Built in #65 (`src/api/live/session.ts`, `src/api/routes/live.ts`, `src/web/components/LiveLab.tsx`):

- **A session** is a `live_sessions` row (lab, host, started, ended; at most one running per lab)
  plus one `LiveSession` Durable Object (`idFromName(sessionId)`, binding `LIVE`, SQLite class).
- **Start and end:** staff with `live.host` ("Fillo Live Lab" on the lab page). Ending sends
  `{t:'ended'}` to every socket and closes it (code 4000); a close code alone does not always
  survive the proxies.
- **Joining:** `GET …/labs/:labId/live/:id/ws`, from our own Origin, for users who may see the lab.
  The Worker hands the socket to the object with the member (`X-Live-Member`: user, name, role);
  the object is reachable only through the Worker. Students join from the banner, or at once from
  the QR code, which opens the lab page with `?live=1`; no extra code, since they are course
  members already.
- **Hibernation:** `acceptWebSocket` with the role as tag and the member as attachment; `ping` is
  answered by an auto-response that does not wake the object (the page sends one every 45 s).
- **Presence:** the host and assistants get `{t:'presence', students, staff, names}` on every join
  and leave; students get nothing about each other.
- **Students do not poll:** the page checks for a session when it opens and regains focus. A drop
  reconnects with growing pauses and re-checks that the session still runs.

- **Follow mode** (#66): the host's page sends `{t:'step', notebook, at}` (`at` is the cell's
  position in the stored notebook, marked `data-at` in `NotebookView`): the presenter on each step,
  the lab page where scrolling settles (0.6 s). The object keeps the latest step in its storage,
  passes it to everyone else and to each newcomer, and ignores steps from anyone but the host.
  Joined students follow by default: their page switches notebook if needed and scrolls to the
  cell. "Puno vetë" detaches; "Ndiq pedagogun" goes to where the host is now. The presenter
  shows the host "Live · N".

- **Challenges** (#67): the host starts one from an exercise's strip ("Fillo sfidën";
  `{t:'challenge', notebook, cell, title}`), stops it the same way; everyone sees it highlighted,
  newcomers too. A joined student's run of that exercise sends `{t:'result', cell, status, error,
  ms}` (the error's type only, never code), from `EditablePython`'s `onRun`. The object keeps each
  student's latest result and sends the staff `{t:'board', passed, failed, waiting, topError,
  names}`; the panel shows counts and the most common error, and names only on "Shfaq emrat".
- **The lab page's live state** is one `LiveProvider` (`lib/live-context.tsx`): the header panel,
  the exercise strips and the runs read it with `useLive()`.

- **Help and reactions** (#68): "Jam bllokuar" sends `{t:'help', where}` (the heading of the
  section the student is reading) and joins a queue kept in the object's storage; staff get
  `{t:'help-queue', items}` (also on connecting), take a request ("E marr": the student learns who
  is coming, `{t:'help-state'}`) and close it ("U zgjidh"); the student can cancel. Reactions
  (👍 ❓ 🎉, `REACTIONS`) pass to the staff, one per student every 3 s, and show as passing
  counts for 8 s on the host panel and in the presenter's header, with the number asking for help.
  Students never see each other's requests or reactions.

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
