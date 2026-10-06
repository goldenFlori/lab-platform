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
- See `platform-architecture` for the capability list.

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
- **Next:** #8, accounts and sessions (username and password login). #6 (deploy) waits for the
  owner's Cloudflare account.
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

Decisions were delegated to Claude ("you decide"). Record new ones here with the date.

## Open items

- **Questions:**
  - Product name and domain.
  - Which email domains FSHN uses for staff and for students.
  - The university's IP policy for software built for teaching (check before selling).
- **Owner actions:**
  - Turn on "Include private contributions on my profile" in the GitHub settings.
  - Create a free Cloudflare account before #6 (deploy).
- **Course repo:**
  - Execute `bellman-ford-animated.ipynb`, the only notebook never run (3 s, 5 graph images).
    Needs the owner's OK and a `MANIFEST.json` update.
  - Two early commits there show another author. Leave them: rewriting them needs a force-push.
