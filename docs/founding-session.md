# Founding session: context and handoff

Written on 2026-10-06, at the end of the planning sessions that started this project. Read it at
the start of a session to know where things stand.

This file is temporary. `CLAUDE.md` ("Keep the always-loaded context small and true") says when and
how to shrink or remove it.
- The decisions themselves live in `.claude/skills/platform-*`.
- This file holds the background, the owner's preferences, and the open items.
- If a detail is missing, the full conversation is saved locally at
  `~/.claude/projects/-Users-florjanmema-Desktop-discrete-structures-algorithms-course/9586924b-1578-4cfa-8a7d-677aeb94b0cf.jsonl`.
  It is very large, so search it (for example with `grep`) instead of reading it whole. Where it
  disagrees with this file or the skills, the later decisions here win.

## Owner and goals

- **Owner:** Florjan Mema (GitHub `goldenFlori`), lab teacher (pedagog) of the first-year course
  "Struktura Diskrete & Algoritme" at FSHN. Writes to us in English; student-facing text is Albanian.
- **How they teach:** they project each notebook block in class, run it, and explain its output or
  visualization. They want students to see only what the pedagog has opened.
- **Goals:**
  - a very modern, long-lived, multi-tenant web application;
  - an application for the Startup Albania grant;
  - possibly selling it to other universities and schools.
- **Hosting budget:** at most €10–20 a year, so free tiers come first.
- **Pedagog-created accounts:** each student gets a full name + password from the pedagog, about
  100–120 students a year. Coordinator and assistant roles are wanted too.

## What happened before this repo

This happened in the course repo `goldenFlori/discrete-structures-algorithms-course` (public, at
`~/Desktop/discrete-structures-algorithms-course`).

1. **Labs aligned with the coordinator's lecture program** (repo `goldenFlori/materials`):
   - supplementary exercise notebooks for labs 1–4 and 9;
   - a new Lab 10 (matching and assignment);
   - Lab 1's timing exercise fixed.

   Solutions and the student-version generator are in the git-ignored `zgjidhjet/`, which has no
   backup.
2. **Site redesigned:** Astro 7 + React islands + Tailwind v4 + HeroUI v3.
   - Clean notebook pages (no errors or noise).
   - 13 React visualizers in 40 embeds, covering all 10 labs.
   - ⌘K search.
   - 78 Playwright QA checks.
   - Search and Plotly also work in `npm run dev`.
3. **Shipped as PRs #2–#5 there,** all merged on 2026-10-06.
   - Live at https://goldenflori.github.io/discrete-structures-algorithms-course/.
   - The first deploy failed because the lockfile written by npm 11.6 was rejected by CI's newer
     npm. PR #5 repaired it and added a CI check on every PR.
4. **Audit of the 151 code blocks:**
   - Blank outputs are by design: exercise stubs and homework.
   - The one exception is `bellman-ford-animated.ipynb`, which was never executed. It runs in 3 s
     and produces 5 graph images. Running it is still open.

## Why the platform looks the way it does

Details are in the skills; one line per decision here.

- **Separate private repo:** GitHub Pages is free only for public repos, the architecture is
  different, and the product (code) stays separate from course content for IP clarity.
- **Cloudflare free tier (Workers, D1, Durable Objects):**
  - Supabase's free tier pauses after 7 days, and its paid plan is over budget.
  - Firebase needs email-based logins.
  - A VPS costs money and needs maintenance.
- **Own session auth:** the free plan allows 10 ms of CPU per request, so hashing must be tuned and
  heavy work runs in the browser.
- **Multi-tenant from day one:** cheap now, a rewrite later.
- **AI designed in now, switched on later:** it costs money per student, so it is funded by the
  grant or institution licences.

## This repo so far

- **Merged:**
  - PR #1: React + Hono on one Cloudflare Worker.
  - PR #2: Biome, Vitest inside workerd, CI.
  - PR #3: project guide and decision notes.
- **Roadmap:** the milestone "Phase 1: Foundation" holds issues #4–#19, in work order.
- **Next:** #4, the database foundation (D1, Drizzle, migrations).

## Owner's preferences (follow them)

- **"You decide" means decide:** give the reason in one line, measured against the product goals.
  The ranked principles are in `CLAUDE.md`.
- **Git:**
  - no AI attribution anywhere;
  - one PR per change, closing its issue;
  - English Conventional Commits;
  - merge commits, not squash;
  - CI green before merging.

  The owner cares about the GitHub profile (contribution graph, achievements such as Pull Shark),
  so real work flows through issues and PRs. Never create artificial PRs.
- **Plain explanations:** say what something does for teaching or for the business, not just the
  tech.
- **Work smart:** prefer the solution that lasts over the quick one, without overbuilding.

## Open items

- **Owner actions:**
  - turn on "Include private contributions on my profile" in the GitHub settings;
  - create a free Cloudflare account before issue #6 (deploy).
- **Decisions still open:**
  - the product name and domain;
  - the FSHN email domains for staff and for students;
  - the university's IP policy, to check before selling.
- **Course repo:**
  - Execute `bellman-ford-animated.ipynb`. This needs the owner's OK and a `MANIFEST.json` update.
  - Two early commits there show another author. They were deliberately left alone, because
    rewriting them would need a force-push.
- **Achievements:** the Pull Shark badge was still being processed by GitHub at handoff time,
  after 5 merged PRs in the course repo.
