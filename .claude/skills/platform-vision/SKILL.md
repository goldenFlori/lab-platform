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
- **Next:** try Phase 2 and 3 in class with the FSHN course and collect pilot data for the Startup
  Albania application (see `platform-business`); then plan Phase 4 (AI), which needs funding.
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
| 2026-10-10 | Search without FTS5: D1 cannot export databases with virtual tables, and backups must keep working. The server sends each user the text of what they may see; the browser matches it as they type | Decided |

Decisions were delegated to Claude ("you decide"). Record new ones here with the date.

## Open items

- **Questions:**
  - Product name and domain.
  - Which email domains FSHN uses for staff and for students.
  - The university's IP policy for software built for teaching (check before selling).
- **How long to keep learning activity:** for example two academic years, then delete. Decide
  before selling to other institutions, and write it into the data processing agreement.
- **Course repo:**
  - Execute `bellman-ford-animated.ipynb`, the only notebook never run (3 s, 5 graph images).
    Needs the owner's OK and a `MANIFEST.json` update.
  - Two early commits there show another author. Leave them: rewriting them needs a force-push.
