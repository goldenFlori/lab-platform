---
name: platform-vision
description: Product vision and agreed decisions for the multi-tenant lab platform (pedagog/student roles, sign-in, live coding, AI, multi-tenancy, roadmap, current phase, decision log). Use before planning, scoping or prioritizing platform work, when a product decision is needed, or when the user says "you decide".
---

# Lab platform: vision and decisions

## What we are building

A web application where students do more than read a lab. They run the code, watch the algorithm
move, and get help in Albanian, while the pedagog controls what each student sees.

- **Multi-tenant from day one:** universities, faculties and schools each get their own space.
- **Free to run for one course;** institutions pay for the advanced layer.
- **Pitch:** "Classroom shares files. This platform teaches."
- **First tenant:** the "Struktura Diskrete & Algoritme" labs (the course repo's `site/`). The first
  pilot runs there.

Related skills:
- `platform-architecture`: how to build it.
- `platform-live-coding`: code execution and live sessions.
- `platform-ai`: AI features.
- `platform-business`: pitch, market, grant.

## Principles (ranked; use them to decide)

1. **Teaching quality first:** clean labs, real outputs, interactive visualizations, live coding.
2. **Longevity:**
   - open formats (`.ipynb` in, `.ipynb` out);
   - full export;
   - a portable stack;
   - permissions stored as data, not code.
3. **Multi-tenant everywhere:** every tenant-owned row is scoped to an organization and checked on
   every request.
4. **Privacy and security:**
   - all access is enforced on the server (UI hiding is never the protection);
   - collect minimal personal data;
   - solutions are visible only to staff.
5. **Cost:**
   - free tiers first;
   - work that grows with users runs on the user's device (Python in the browser);
   - AI is metered.
6. **Simplicity:** the team is one lecturer plus an AI.

## Roles (decided)

| Role | Example | Can do |
|---|---|---|
| Platform owner | the company (us) | Support, tenant management (hidden from tenants) |
| Institution admin | faculty IT or head of department | Register email domains, approve staff, set branding and licences |
| Coordinator | the course coordinator | Own the official course (program, lectures, labs); share it with pedagogs; see all groups |
| Pedagog | lecturer or lab teacher | Run a course: students, show/hide labs, live labs, solutions, grades |
| Assistant | lab assistant | Help in a group: present, manage students, review work. Can't change course structure or delete |
| Student | — | See opened labs, run code, submit work, ask the AI |

- Roles are templates over capabilities, so new roles (for example an observer) can be added
  without code changes.
- See `platform-architecture` for the capabilities of each role (decided 2026-10-08).

## Getting in (decided)

- **The email domain decides the institution, never the role.**
  - A verified address on a registered domain joins that institution automatically. Example:
    FSHN registers `@fshnstudent.info` as its student domain.
  - Staff-domain sign-ups become "pedagog (pending)" until an admin or coordinator approves them,
    or the institution turns on auto-approve.
  - Students can never promote themselves.
  - This matters because many universities share one domain between staff and students.
- **Sign-in methods, chosen by each institution:**
  - **Now:** pedagog-issued username + password (printed slips).
  - **Later:**
    - Google or Microsoft login (where the university uses Google Workspace or Microsoft 365);
    - one-time email codes, which wait for the paid phase (the free email tier allows 100 a day).
- **Joining a course:** a class code or QR on the projector; roster import (CSV, later Google
  Classroom); or issued credentials.
- **One account for life:**
  - Students keep the same account across years and courses.
  - **New academic year:** clone last year's course from the coordinator's template ("SDA
    2027/28"); students join with the new code; archive last year's course. Passwords are not
    reissued each year.

## Product pillars

- **Labs:** clean notebooks with real outputs, the 13 visualizations, presentation mode
  (fullscreen, step by step: explanation → code → ▶ run or reveal), solutions for staff only,
  show/hide and scheduled publishing per lab and group.
- **Live coding:** run and edit any block in the browser, Live Lab sessions, "your code,
  visualized", and exercises with instant checks. See `platform-live-coding`.
- **AI:** optional per course and controlled by the pedagog. A tutor that explains and hints
  rather than solving, plus a copilot for the pedagog. See `platform-ai`.
- **Customization:**
  - institution branding (logo, colors);
  - language (Albanian and English from day one);
  - a template → course offering → groups hierarchy;
  - integrations (Google Classroom roster import, LTI 1.3 for Moodle, `.ipynb` export).
- **Analytics from day one:** privacy-friendly aggregates (active students, labs opened, code runs,
  live participation, exercise completion). Pedagogs need them, and they are the evidence for the
  grant.

## Roadmap

1. **Foundation (pilot with this course):**
   - organizations, courses, groups and roles;
   - issued-credential login;
   - show/hide and scheduling;
   - port the labs and the 13 visualizations;
   - presentation mode;
   - solutions for staff;
   - basic analytics;
   - deploy free on Cloudflare.
2. **Live coding:** Pyodide runs and edits, autosave, exercises with checks, submissions graded on
   the pedagog's machine.
3. **Live Labs** (real-time sessions) and "your code, visualized".
4. **AI:** tutor modes, pedagog copilot, quotas.
5. **SaaS:**
   - self-service institutions;
   - domain verification;
   - Google/Microsoft login, email codes;
   - Classroom import, LTI/Moodle;
   - branding, billing;
   - shared course library.

Apply for the grant after phase 2 or 3, with pilot data (see `platform-business`).

## Status (keep updated)

- **2026-10-06:** vision agreed through brainstorming.
- **2026-10-06:** private repo `goldenFlori/lab-platform` created at `~/Desktop/lab-platform`.
  - Merged: PR #1 (React + Hono on Cloudflare Workers), PR #2 (Biome, Vitest in workerd, CI) and
    PR #3 (project guide and decision notes).
  - Phase 1 is tracked as GitHub issues in the "Phase 1: Foundation" milestone.
- **2026-10-06:** #4 done. D1 with Drizzle and migrations, `organizations` as the first table,
  database status in `/api/health` (PR #21). The founding handoff is merged (PR #20).
- **2026-10-07:** #5 done. App shell with the course site's design system (light and dark),
  TanStack Router and Query, home, labs, 404 and error pages, and Playwright end-to-end tests in
  CI on desktop and a 375px phone (PR #23).
- **2026-10-07:** #7 done. Core data model (global users, memberships, templates, courses,
  groups, labs, lab access, sessions), the tenant-scoped data layer `forTenant()`, and
  cross-tenant isolation enforced by the database and proven by tests (PR #24).
- **2026-10-07:** #6 done. Live at https://lab-platform.florjanimema.workers.dev; merges to
  `main` deploy after every check passes, with migrations first. The database is in the EU
  jurisdiction, with weekly encrypted backups (PR #25).
- **2026-10-07:** #8 done. Username and password sign-in with an Albanian login page, secure
  30-day sessions, brute-force limits and a script for an organization's first account
  (PR #26).
- **2026-10-08:** #9 done. Role templates stored as data, capabilities resolved per request from
  memberships in their scope, enforced by the API and proven per role by tests (PR #29).
- **2026-10-08:** #10 done. Courses (create, copy last year's labs, archive), groups with join
  codes and a QR view for the projector, and joining by code (PRs #30 and #31).
- **2026-10-08:** #11 done. Student import from pasted lists, CSV or Excel, with passwords generated
  and hashed in the browser, printable A4 slips, and password reset by the pedagog (PR #32).
- **2026-10-10:** #12 done. Labs per course (add, rename, remove) and their visibility: hidden until
  opened, per course or per group, scheduled, with a solutions date, enforced by the API (PRs #33
  and #34).
- **2026-10-10:** #13 done. The notebook converter in TypeScript (`src/notebook`) for the browser,
  matching the course site's output on all 19 course notebooks (PR #35).
- **2026-10-10:** #14 done. The 13 visualizations with a public gallery, the lab page that shows a
  lab's notebooks with their outputs, figures and visualizations (sanitized), and uploading and
  editing them from the browser. Every course notebook renders with its visualizations
  (PRs #37, #39 and #40).
- **2026-10-10:** #15 done. Presentation mode: a lab's notebook fullscreen in class, one step at a
  time with the keyboard, visualizations in place of desktop-window code, and the solved code
  and outputs on a switch (PR #41).
- **2026-10-10:** #16 done. `npm run course:import` brings a course site's labs, notebooks,
  visualizations and solutions (staff-only) in through the API. Re-running it updates only what
  changed. Labs 5 and 6 each get their own part of the notebook they share on the site. Next, the
  owner imports "Struktura Diskrete & Algoritme" 2026/27 into FSHN in production.
- **2026-10-10:** #17 done. A ⌘K search over labs, notebook sections and visualizations, instant
  as you type and without accents mattering. A student never gets text from a hidden lab or a
  closed solution: the server sends only what they may see, proven by tests. Re-running the
  course import gives the notebooks already imported their search index (PR #43).
- **2026-10-10:** #18 done. Each course has an activity page for its pedagogs: how many students
  opened, downloaded and tried each lab, week by week, for the whole course or one group. Counts
  only, never a name, and staff are not counted (PR #44).
- **2026-10-10:** #19, first half. Every screen of the app speaks Albanian and English. Each user
  chooses with the account menu (visitors with a toggle), and a course can set the language for
  those who have not chosen (PR #45).
- **2026-10-10:** #19 done. The 13 visualizations speak both languages too, their step-by-step
  explanations and pseudocode included. Phase 1 (foundation) is complete (PR #46).
- **2026-10-11:** Phase 2 planned as the "Phase 2: Live coding" milestone, issues #47–#53.
- **2026-10-11:** #47 done. Students run a notebook's code on the lab page, in their own browser:
  output and errors in place, one namespace per notebook, Stop for runaway loops and `input()`
  answered on the page (PR #54).
- **2026-10-11:** #48 done. numpy, networkx, matplotlib and plotly work in the browser, with their
  figures in place. Every runnable cell of the 19 course notebooks runs, apart from the exercise
  blanks left for students (PR #55).
- **2026-10-11:** #49 done. Students edit the code cells; their changes are saved to their account
  as they type, run in place of the original, come back on any device, and can be restored to the
  original. Staff never see them (PRs #56 and #57).
- **2026-10-11:** #50 done. The pedagog runs each code step live from the presenter (R, or the
  button), in one namespace for the notebook, with the solved code when the solution is shown;
  outputs and errors at projector size (PR #58).
- **2026-10-11:** #51 done. Exercises are checked as soon as their cell runs: ✓, ✗ with the
  failing case, or not written yet. The course notebooks' `kontrollo(…)` checks are found on
  their own, staff can add exercises with visible tests, and the pedagog sees how many students
  solved each, as counts in the lab and the course activity (PR #60).
- **2026-10-11:** #52 done. Staff open a notebook for submission per group with a deadline;
  students hand in their saved code and solved exercises, again until the deadline; pedagogs and
  assistants see who handed in, group by group, and read each one's code. No student sees another's
  work (PR #62).
- **2026-10-11:** #53 done, and with it Phase 2. The pedagog sets points and hidden tests,
  grades a group's submissions in one batch run in their own browser, adjusts scores with
  feedback, and releases them; students then see their grade (PR #63).
- **2026-10-11:** Phase 3 planned as the "Phase 3: Live Labs" milestone, issues #64–#70.
- **2026-10-11:** #64 done. Pedagogs manage their course's staff in the app: add pedagogs and
  assistants for the course or one group, from the institution's accounts or as new accounts,
  and remove them (PR #71).
- **2026-10-11:** #65 done. A pedagog starts a Live Lab from the lab page; students join from a
  banner or the projector's QR code; the host sees how many are connected, and their names (PR #72).
- **2026-10-11:** #66 done. Joined students' pages follow the step the pedagog presents or the
  cell they stop at on the lab page; a student can work on their own and follow again (PR #73).
- **2026-10-11:** #67 done. The pedagog starts a challenge on an exercise in a Live Lab; students'
  checks send only their results, and the pedagog's board shows passed, failed, not yet and the
  most common error, with names on request (PR #74).
- **2026-10-11:** #68 done. In a Live Lab, students ask for help without raising a hand and staff
  take and close requests from a queue; quick reactions show on the host panel and the presenter
  (PR #75).
- **2026-10-11:** #69 done. A student's own sorting code, instrumented with `vizlab`, animates in
  the course's sorting visualizer next to the reference algorithm on the same list (PR #76).
- **2026-10-11:** #70 done, and with it Phase 3. A student's own BFS, DFS or Dijkstra, recorded with
  `vizlab`, animates on the course's graph canvas next to the reference on the same graph (PR #77).
- **2026-10-11:** #78 fixed: ▶ waits until a student's saved code has loaded (PR #79).
- **2026-10-11:** #80 done. Staff who manage a course can delete it, after a confirmation popup that
  says what goes with it (PR #81).
- **2026-10-11:** #82 fixed: every dropdown draws its arrow inset from the edge (PR #83).
- **2026-10-12:** Phase 4 planned as the "Phase 4: AI and mobile" milestone, issues #84–#89, to be
  ready for the March 2027 semester. The grant application follows in early 2027, with a January
  mini-pilot (see `platform-business`).
- **2026-10-12:** #84 done. Staff who may configure AI switch it on per course. Every AI call goes
  through one metered gateway on Workers AI's free allocation, with daily limits per user and per
  organization, and a staff copilot that streams its answers (PR #90).
- **2026-10-12:** #85 done. On a notebook's exercises, staff ask the copilot for a variant. They
  edit it, their browser checks that the solution passes its tests and the starter does not, and
  they save it as a new notebook in the lab with a staff-only solution notebook (PR #91).
- **2026-10-12:** #86 done. Under a failed run or check, students ask "Explain the error" and get a
  short Albanian explanation with hints, never the solution, within their daily quota. Staff set
  each exercise's AI to off, hints or full (after the solutions date). Pedagogs and assistants read
  their groups' questions on the course page (PR #92).
- **2026-10-12:** #93 fixed: AI answers keep their numbers. Workers AI streams number tokens as JSON
  numbers, which the gateway had dropped (PR #94).
- **2026-10-12:** #87 done. In a Live Lab the host asks a quick multiple-choice question, written or
  taken from 3 drafts the copilot makes from the section on screen. Students answer once on their
  phones; staff see the counts live and the host reveals the answer to everyone (PR #95).
- **2026-10-12:** #88 done. Staff translate a notebook between Albanian and English with the
  copilot. They review each text and comment beside the original and save it as a new notebook with
  the same code, visualizations and exercises (PR #96).
- **2026-10-12:** #89 done, and with it Phase 4. The app installs from the browser on phones and
  laptops (an "Install the app" entry, with steps for iPhone). It keeps the Python engine, so a lab's
  code runs at once after reopening, and it shows an offline page without a connection (PR #97).
- **2026-10-12:** Phase 5 planned as the "Phase 5: Ready for the pilot" milestone, issues #98–#103:
  what the March 2027 semester and the grant application need. The owner also runs a dry run with
  the FSHN course before the semester, and in January a mini-pilot and the Startup Albania
  application (see `platform-business`).
- **2026-10-12:** #98 done. The lab header has an "AI" menu for staff that opens each copilot tool
  and says what it needs. A notebook whose exercises were never saved shows a bar to save them in
  one click, and the copilot section always says what is missing (PR #104).
- **2026-10-12:** #106 fixed: the two heaviest API tests (30 Live Lab sign-ins, 100 failed sign-ins)
  get a 30 s limit, after a busy CI runner passed the 5 s default on main and #104 was not deployed
  (PR #107).
- **2026-10-12:** #99 done. Students open "My progress" from their course. It shows the labs they
  opened, the exercises solved per notebook, their deadlines and hand-ins, and their released grades
  with feedback. Only their own data, gathered in one batch of queries (PR #105).
- **2026-10-12:** #100 done. A public privacy page (`/privacy`, linked in every page's footer) says
  what is kept, where, for how long and who sees it. "My data" in the account menu downloads
  everything stored about the user as one JSON file, and sends their institutions a deletion
  request, which admins see and mark handled on their courses page (PR #108).
- **2026-10-12:** #101 done. Code runs and joining a Live Lab now count in the activity, one record
  per student, lab and day. Staff with analytics open the "Pilot report" from the activity page:
  for a chosen period (up to 200 days) and group, the students active per week and in all, labs
  opened, code runs, Live Lab participation, visualizations, exercises, submissions, and AI questions
  and requests. Counts only, and it prints on two pages (PR #109).
- **2026-10-12:** #102 done. Pedagogs open an anonymous end-of-semester survey until a date: four
  ratings from 1 to 5 (running code, visualizations, Live Labs, AI) and a comment. Students answer
  once from their course page. Staff see the averages and comments from five answers, also in the
  pilot report (PR #110).
- **2026-10-12:** #103 done, and with it Phase 5's issues. The front page explains the platform in
  Albanian and English: the pitch, a real visualization to try (the maze, BFS versus DFS), six
  features, and a section for institutions. The demo video and the contact address show once the
  owner sets `DEMO_VIDEO` and `CONTACT_EMAIL` in `src/web/lib/brand.ts` (PR #111).
- **2026-10-13:** #112 fixed: the pilot report counts submissions, exercises and AI questions from
  Tirana's midnight, not UTC's, so work done between 00:00 and 02:00 is no longer missed (PR #113).
- **2026-10-18:** Phase 6 planned as the "Phase 6: Before selling" milestone, issues #114–#118:
  what a second institution needs before it signs.
- **2026-10-18:** #114 done. Staff who grade download a group's grades for a notebook, and the
  course's released grades (a row per student, a column per notebook and the total), as CSV files
  that Excel opens with Albanian letters intact (PR #119).
- **2026-10-18:** #115 done. On an open deletion request, the institution's admin erases the
  person's data in the institution, after a confirmation that offers their released grades as a CSV
  for the records. Their data in other institutions stays; the account goes when nothing ties it to
  another institution. The institution keeps a record of each erasure without the person's name.
  (PR #120).
- **2026-10-18:** #116 done. One retention list in `src/shared/retention.ts` drives the nightly job,
  the sign-in lifetime and the privacy page: sign-in 30 days without use, AI questions 180 days,
  daily activity, AI counts and ended Live Labs two years, handled deletion requests one year; the
  rest lives as long as its course. The job deletes at most 5,000 rows per table a night.
  (PR #121).
- **2026-10-19:** #117 done. The institution's admin downloads its data from the courses page as
  one JSON file: people (no password hashes), course structure, notebooks with their original
  .ipynb, exercises, submissions, grades, activity, AI records, surveys, deletion requests and
  erasures. The Worker serves it in small pages and the browser assembles it. Students'
  unsubmitted code stays out (PR #122).
- **2026-10-19:** #118 done, and with it Phase 6. A data processing agreement template in Albanian
  and English (`docs/legal/`), written against Law No. 124/2024 and the Commissioner's adequacy
  Decision No. 1/2025, with the platform's security measures, sub-processors and retention as
  annexes, for a lawyer to review. Making its claims true, Live Lab rooms now run in Cloudflare's
  EU jurisdiction and keep nothing once a class ends, and the privacy page says that AI requests
  (never names) may be processed outside the EU and that the encrypted backups sit at GitHub.
- **2026-10-25:** Phase 7 planned as the "Phase 7: Design that teaches" milestone, issues #125–#133:
  a visual identity from algorithm states, a live front page, gallery previews, a content-first lab
  page, a learning path, predict mode, editor polish, and visualizations for Labs 3 and 5.
- **2026-10-25:** #128 done. The foundation every screen uses: ink-and-paper surfaces, one set of
  algorithm-state colours (frontier, current, visited, path, done, rejected) shared by the interface
  and the visualizations, Bricolage Grotesque for headings, a motion system (Motion for React) that
  respects reduced motion, and a logo drawn from a moment of BFS (PR #134).
- **2026-10-25:** #129 done. The front page opens on a live graph running the course's own BFS, DFS
  and Dijkstra with their narration: visitors switch the algorithm or tap a vertex to start from
  it, and watch the queue, stack or priority queue do the work. It cycles on its own until touched
  and pauses off screen (PR #135).
- **2026-10-25:** #125 done. The gallery is grouped by topic (sorting and complexity, graphs and
  traversal, shortest paths, flows and matching), each card with a looping preview of its own
  idea in the state colours: small SVGs that play only on screen and hold still under reduced
  motion (PR #137).
- **2026-10-25:** #130 done. The lab page puts content first: one toolbar (download, present, AI,
  Live Lab, and a "More" menu for uploading or deleting notebooks), so a phone's first screen shows
  the lab instead of a wall of buttons. Upload, translation and deletion open from the menus through
  the lab-tools channel (PR #138).
- **2026-10-25:** #126 done. Students see their way through the course on the course page: the
  labs open to them as a path, each coloured not started / in progress / handed in / graded, with
  a ring for exercises solved, a summary, and "Continue with Lab N" to the next unfinished lab.
  Only their own progress, from the "My progress" data (PRs #139, #140).
- **2026-10-25:** #127 done. Predict mode in the visualizations: they stop at each decision and ask
  the student first: which vertex leaves the queue (BFS) or the stack (DFS), which vertex Dijkstra
  settles (ties accepted), which element Selection Sort puts in each position. Options come from
  the algorithm's state, never in an order that gives the answer away; a wrong guess shows the right
  answer and why, and a score is kept. Built into the kit (`usePredict`), so any visualization
  can add it (PR #141).
- **2026-10-25:** #131 done. A failed run marks the line where it stopped, in the code students read
  and in the editor (from the cell's traceback), until the code changes. The editor gains line
  numbers and the palette's accent for the active line and selection. Syntax colours stay GitHub's,
  matching the code highlighted at upload (PR #142).
- **2026-10-25:** #133 done. A 14th visualization, the recursion tree, for Lab 3: Merge Sort's calls
  split down and merge back up beside a work-per-level table (n per level × log₂n levels), and
  recursive Fibonacci with its repeated calls counted and a memo switch that prunes them (2n − 1
  calls). In the gallery and the embeds editor; the course site does not have it, so Lab 3 embeds it
  from the platform (PR #143).
- **2026-10-25:** #132 done, and with it Phase 7's issues. A 15th visualization for Lab 5: Kruskal
  with the union-find forest drawn at every step (union by rank, path compression, sets merging in
  colour, the sorted edges accepted or rejected), beside Prim on the same graph; both reach the same
  weight. Next: refresh the course notebook fixtures once the course repo's PRs merge, then the
  remaining lab fixes (Labs 1, 4, 5, 6, 8, 9).
- **2026-10-25:** #145 done. The course's 2026/27 lab review is complete in the course repo (PRs
  #15–#25: corrected texts and class problems, the cut property, Kosaraju and Kahn, negative cycles,
  stability, Lab 7 single-source with Floyd-Warshall moved to Lab 8, and the Lab 9 homework on the
  students' own functions with checks). The converter's fixtures, snapshots and embeds follow it,
  with 3 new exercise checks found. Next: re-import the course (`npm run course:import`) so the
  production labs get the new texts and exercises.
- **Next (the owner):** have a lawyer review the agreement and fill in the operator once a company
  is registered; record the 2-minute demo video (a self-hosted MP4 in `public/`), choose the
  contact address, run a dry run with the FSHN course before March, then the January mini-pilot and
  the Startup Albania application (see `platform-business`).
- The course's static site (the course repo's `site/`, on GitHub Pages) stays in production until
  phase 1 replaces it.

## Decision log

| Date | Decision | Status |
|---|---|---|
| 2026-10-04 | Multi-tenant design from day one, even with one tenant | Decided |
| 2026-10-04 | Host on Cloudflare free tier (Workers + D1); no Supabase/Firebase/VPS | Decided |
| 2026-10-05 | TypeScript everywhere: React + Vite SPA, Hono API, Drizzle, Zod; own session auth | Decided |
| 2026-10-06 | Roles: institution admin, coordinator, pedagog, assistant, student (capabilities underneath) | Decided |
| 2026-10-06 | Domain → institution automatically; role → approval or invitation | Decided |
| 2026-10-06 | Live coding with Pyodide in the browser; Live Labs on Durable Objects | Decided |
| 2026-10-06 | AI designed in now, enabled in phase 4; never grades alone | Decided |
| 2026-10-06 | Platform code in a new private repo; this course becomes the first tenant | Decided; repo created 2026-10-06 |
| 2026-10-07 | Users are global accounts, one for life; organizations reach them only through memberships; usernames are unique platform-wide | Decided |
| 2026-10-07 | Student data stays in the EU: the production database uses D1's EU jurisdiction (fixed at creation) | Decided |
| 2026-10-07 | Weekly backups are encrypted with the owner's key before leaving Cloudflare; GitHub keeps only ciphertext, for 90 days | Decided |
| 2026-10-08 | Capabilities of the built-in roles (matrix in platform-architecture): the admin runs the institution, not courses; teaching staff get course rights where they are assigned; students view labs and submit | Decided |
| 2026-10-08 | A join code is an invitation: any signed-in user with it becomes a student of that group (even from another institution); staff can replace it or switch joining off; archived courses refuse it | Decided |
| 2026-10-08 | Whoever creates a course becomes its pedagog; "copy from last year" brings the labs, not the groups, members or visibility | Decided |
| 2026-10-10 | Labs are hidden until opened, for the course or per group (a group's own setting wins), optionally scheduled; students see solutions only from a set date; staff see every lab to prepare | Decided |
| 2026-10-08 | Imported students' passwords are made in the pedagog's browser: 12 lowercase letters and digits (easy on a phone), shown once and printed on slips, never stored or exported in plain text | Decided |
| 2026-10-10 | The 13 visualizations are platform content, open to everyone at `/visualizations`: they hold no tenant data, are already public on the course site, and show what the product does | Decided |
| 2026-10-10 | Course content is imported through the API with a pedagog's sign-in, never written straight into the database: the same permission checks and storage as the app, for any environment. Re-running it is safe, and it never opens labs | Decided |
| 2026-10-10 | When the site shows parts of one notebook in two labs, each lab gets its own notebook of those cells, so students download only their lab's part | Decided |
| 2026-10-11 | A student's code edits are private to them, saved per cell as they type; staff see code only once it is submitted | Decided |
| 2026-10-11 | Python runs in the student's browser (Pyodide in a Web Worker). Its engine is served from our own site, pinned to the npm version; the packages a cell imports come from Pyodide's CDN at the same version for now | Decided |
| 2026-10-11 | The app is cross-origin isolated (COOP + COEP), so Stop keeps a student's variables and `input()` works; every cross-origin resource must send CORS or CORP headers | Decided |
| 2026-10-10 | Activity counts students, not clicks: at most one record per student, lab, kind (opened, downloaded, tried a visualization) and day, shown only as weekly counts to staff with analytics rights, for the groups they may see. Staff are not counted | Decided |
| 2026-10-10 | The interface's messages are typed objects in the code (Albanian the source, English checked against it by the build), not an i18n library: two languages, a tiny team, and no extraction step. Language: the user's choice, else the device's, else the course's, else Albanian | Decided |
| 2026-10-11 | Practice checks run in the student's browser and are trusted only as practice: a passed check marks the exercise solved and counts in the activity, never in a grade (grades come from the pedagog's re-runs, #53) | Decided |
| 2026-10-11 | A submission is per notebook, opened per group with a deadline. The server copies the student's saved code and solved exercises at that moment; the last one before the deadline counts, and closing a submission never deletes work | Decided |
| 2026-10-11 | Grades come only from the pedagog's batch re-run in their browser, a fresh Python per submission, with checks from the notebook and server-side hidden tests; the pedagog can adjust them, and students see them once released | Decided |
| 2026-10-11 | Courses can be deleted by staff who manage them, with everything in them, after a confirmation popup; archiving stays the way to end a year (owner's choice, over allowing deletion only before students join) | Decided |
| 2026-10-12 | AI runs on Workers AI's free allocation first (no key, no bill, no names sent), with Llama 4 Scout as the default after an Albanian test; paid models (Claude) only with grant or licence money | Decided |
| 2026-10-12 | AI quotas per day: 50 requests for staff who publish labs, 10 for students, 9,000 neurons per organization; counted per user, course and day, as counts only | Decided |
| 2026-10-12 | "Explain my error" gives hints by default and everywhere outside exercises; the full fix only on exercises staff set to it, after the solutions date. Students' questions and answers are visible to the staff of their group (students are told) and deleted after 180 days | Decided |
| 2026-10-12 | Data rights: every user downloads all their data across institutions as JSON (released grades only; drafts stay with staff). A deletion request goes to each institution's admins and deletes nothing on its own, since grades may have to stay in the institution's records | Decided |
| 2026-10-18 | Erasure is per institution and done by its admin from a deletion request: everything of the person there goes, released grades included (offered as a CSV first, since the platform is not the registry of record). The account goes only when it has no membership or grade in another institution. Each erasure leaves a record with dates and the admin, never the person | Decided |
| 2026-10-19 | The data processing agreement says only what the code does and changes with it. Stored data stays in the EU (database and Live Labs in Cloudflare's EU jurisdiction); AI requests, which carry no names, may be processed outside the EU by Cloudflare (DPF-certified, adequate under Decision No. 1/2025), and the agreement and privacy page say so rather than promise otherwise | Decided |
| 2026-10-19 | An institution's export holds everything it owns, in one JSON file its admin downloads, except secrets (password hashes, sessions, join codes), what is derived (search, renderings) and students' unsubmitted code, which stays private to them | Decided |
| 2026-10-18 | Retention: daily activity, AI use counts and ended Live Labs two years (two academic years of reports); handled deletion requests one year; AI questions 180 days; sign-in 30 days idle. Student work, grades and surveys live as long as their course, which the institution deletes. One list in code feeds the nightly job and the privacy page | Decided |
| 2026-10-12 | The survey is anonymous by design: ratings are stored only as counts, comments with random ids, no time and no author, in a WITHOUT ROWID table; who answered is kept apart, only to ask once. Results show from five answers | Decided |
| 2026-10-12 | A real mobile app means an installable web app (PWA) first; a store app (Capacitor) only if a need appears | Decided |
| 2026-10-10 | Search without FTS5: D1 cannot export databases with virtual tables, and backups must keep working. The server sends each user the text of what they may see; the browser matches it as they type | Decided |

Decisions were delegated to Claude ("you decide"). Record new ones here with the date.

## Open items

- **Questions:**
  - Product name and domain.
  - Which email domains FSHN uses for staff and for students.
  - The university's IP policy for software built for teaching (check before selling).
- **Course repo:**
  - Execute `bellman-ford-animated.ipynb`, the only notebook never run (3 s, 5 graph images).
    Needs the owner's OK and a `MANIFEST.json` update.
  - Two early commits there show another author. Leave them: rewriting them needs a force-push.
