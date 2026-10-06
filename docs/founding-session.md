# Founding session: background

How the project started and who it is for, from the planning sessions of 2026-10-04 to 2026-10-06.

- The decisions live in `.claude/skills/platform-*`.
- Status and open items live in `platform-vision`; working preferences live in `CLAUDE.md`.
- If a detail is missing, the full conversation is saved locally at
  `~/.claude/projects/-Users-florjanmema-Desktop-discrete-structures-algorithms-course/9586924b-1578-4cfa-8a7d-677aeb94b0cf.jsonl`.
  It is very large, so search it (for example with `grep`) instead of reading it whole. Where it
  disagrees with the skills, the skills win.

## Owner and goals

- **Owner:** Florjan Mema (GitHub `goldenFlori`), lab teacher (pedagog) of the first-year course
  "Struktura Diskrete & Algoritme" at FSHN.
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
4. **Audit of the 151 code blocks:** blank outputs are by design (exercise stubs and homework).
   The one exception, `bellman-ford-animated.ipynb`, is an open item in `platform-vision`.

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
