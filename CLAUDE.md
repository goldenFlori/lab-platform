# Lab Platform

A multi-tenant lab platform for programming and algorithms courses. It has pedagog and student roles,
notebooks that run in the browser, algorithm visualizations, live classes and an AI tutor. It is
private and proprietary; "Lab Platform" is a working name.

## Read first

How the project started and who it is for:
@docs/founding-session.md

The product and technical decisions live in `.claude/skills/`:

- `platform-vision`: the hub. Roles, sign-in, roadmap, status and decision log. Read it before any
  planning.
- `platform-architecture`: the stack, Cloudflare free-tier limits and the design rules they force,
  tenancy and permissions, the data model and auth.
- `platform-live-coding`: Pyodide, presentation mode, Live Labs, "your code, visualized", grading.
- `platform-ai`: the tutor and copilot, guardrails, models, costs.
- `platform-business`: pitch, market, pricing, the Startup Albania grant.

The first tenant's content (the "Struktura Diskrete & Algoritme" labs and the 13 visualizations to
port) lives in the public repo `~/Desktop/discrete-structures-algorithms-course`. Exercise solutions
live in its git-ignored `zgjidhjet/`; never publish them.

## Working agreements

- **Decide when asked to decide.** Measure every decision against what we are building, in this
  order: teaching quality, longevity, multi-tenancy, privacy and security, cost (free tiers first),
  simplicity for a very small team. State the decision with a one-line reason. Revisit a settled
  decision only when new facts appear. Record product decisions in the `platform-vision` decision
  log.
- **Explain plainly:** say what something does for teaching or for the business, not just the
  tech. Write to the owner in English; student-facing text is Albanian.
- **Work smart:** prefer the solution that lasts over the quick one, without overbuilding.
- **Git:**
  - No AI attribution anywhere: no `Co-Authored-By` trailers, no "Generated with" lines, no
    `claude/` branch names, and no mention of AI tools in commit or PR text.
  - One focused PR per change, on branches like `feat/…`, `fix/…`, `docs/…`, `chore/…`.
  - Use English Conventional Commits with a few logical commits per PR. When work tracks an issue,
    the PR closes it ("Closes #n").
  - CI must be green before merging. Merge with a merge commit, not squash, and delete the branch
    after.
  - Never force-push or rewrite history without an explicit OK.
  - The owner cares about their GitHub profile, so real work flows through issues and PRs. Never
    create artificial PRs.
  - Commit or push only when asked.
- **Re-verify volatile facts** (prices, free-tier limits, grant dates) before relying on them.
- **Keep the always-loaded context small and true:**
  - Every PR that closes an issue updates the "Status" section of `platform-vision` in its last
    commit: what it completes and what's next. The status is then true the moment it merges.
  - `docs/founding-session.md` holds background only. Status, open items and preferences never go
    there. Fix or remove any line in it that stops being true.

## Layout and commands

- `src/web`: the React SPA (Vite). Pages are files in `src/web/routes/` (TanStack Router); the
  design tokens are in `src/web/styles.css`.
- `src/api`: the Hono API on the Cloudflare Worker. One Worker serves both; `/api/*` always reaches
  the Worker.
- `src/api/db`: the Drizzle schema and database access; `migrations/`: the generated SQL for D1.
- `test/`: Vitest tests that run inside workerd, each on an empty migrated database (seed with
  `test/api/fixtures.ts`); `e2e/`: Playwright tests against the production build.
- Commands:
  - `npm install`: also generates the Worker types (`worker-configuration.d.ts`, git-ignored).
  - `npm run dev`: app and API on http://localhost:5173.
  - `npm run lint` / `npm run format`: Biome.
  - `npm run typecheck`
  - `npm test`
  - `npm run test:e2e`: desktop and a 375px phone (`npx playwright install chromium` once).
  - `npm run build`
  - `npm run db:generate`: writes a migration from schema changes.
  - `npm run db:migrate`: applies the migrations to the local database (also needed before
    `npm run dev` the first time). Tests apply them on their own.

## Rules that bite

- **Node 24 (`.nvmrc`) and npm 11.19 or newer** (`devEngines` warns otherwise). Older npm writes a
  lockfile that CI's npm rejects (`Missing: … from lock file`). Repair it with
  `npx npm@<CI version> install --package-lock-only` and check that only entries were added.
- **`compatibility_date`** in `wrangler.jsonc` must not be newer than the test runtime supports,
  or the tests fail to start.
- **Vitest stays on 4.x** until `@cloudflare/vitest-pool-workers` supports 5.
- **Static assets are public.** Protected content must come from `/api` after a permission check.
- **Every tenant-owned query goes through `forTenant()`** (`src/api/db/tenant.ts`); lint blocks
  Drizzle and schema imports elsewhere in `src/api`. A new tenant table needs `org_id`,
  `(parent_id, org_id)` foreign keys, `org_id` in every unique index, and an entry in
  `test/api/tenant-isolation.test.ts`.
- **Rerun `npm run cf-typegen`** after changing bindings in `wrangler.jsonc`.
- **`src/web/routeTree.gen.ts` is generated and committed.** Never edit it; after adding or
  renaming a route, run `npm run dev` or `npm run build` and commit the result (CI checks).
- **Migrations are append-only.** Change the schema, run `npm run db:generate`, commit the new SQL.
  Never edit or delete a migration once it is merged. CI fails if the schema and the migrations
  disagree.
