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
  tech. Write to the owner in English. The interface is Albanian first, with English beside it.
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
- `src/notebook`: the notebook converter. It runs in the browser, uses WebAssembly, and is never
  used in the Worker.
- `src/viz`: the visualizations (the course site's 13 and the platform's own) and their kit; their
  algorithms are in `src/viz/algorithms`, tested in the `viz` project. `src/viz/index.ts` loads
  each one lazily; `VizEmbed` (`src/web/components`) shows one.
- `src/shared`: request and response shapes for both sides. The app imports only types, which
  keeps Zod out of its bundle.
- `test/`: Vitest in two projects. `api` runs inside workerd, each test on an empty migrated
  database (seed with `test/api/fixtures.ts`). `notebook` runs in Node for the converter.
  `e2e/` holds Playwright tests against the production build.
- Commands:
  - `npm install`: also generates the Worker types (`worker-configuration.d.ts`, git-ignored).
  - `npm run dev`: app and API on http://localhost:5173.
  - `npm run lint` / `npm run format`: Biome.
  - `npm run typecheck`
  - `npm test`
  - `npm run test:e2e`: desktop and a 375px phone (`npx playwright install chromium` once).
  - `npm run build`
  - `npm run deploy`: only to create the Worker or in an emergency. Merges to `main` deploy on
    their own after CI passes.
  - `npm run db:generate`: writes a migration from schema changes.
  - `npm run db:migrate`: applies the migrations to the local database (also needed before
    `npm run dev` the first time). Tests apply them on their own.
  - `npm run account:create -- …`: an organization's first account; prints its password once
    (see the README). The end-to-end tests use it on their own database in `.wrangler/e2e`.
  - `npm run course:import -- …`: imports the course repo's labs, notebooks, embeds and
    solutions through the API (see the README); `--dry-run` shows the plan.
  - `npm run measure:class`: a class of 120 against the free plan's daily limits, on a local copy
    (`--students N`, `--no-build`); see `platform-architecture`.
  - `npm run errors`: browser and server errors in production as they happen (`wrangler tail`); the
    last 3 days are in the dashboard's Workers Observability.
  - `npm run usage`: today's use of the free plan's daily limits, from Cloudflare's analytics (needs
    `CLOUDFLARE_ANALYTICS_TOKEN`; see the README). The Usage workflow runs it four times a day.
  - `npm run backup:restore`: restores the latest backup into a throwaway local database and checks
    it (the owner's age key); `--prepared` writes the file to import after a disaster (README).

## Rules that bite

- **Node 24 (`.nvmrc`) and npm 11.19 or newer** (`devEngines` warns otherwise). Older npm writes a
  lockfile that CI's npm rejects (`Missing: … from lock file`). Repair it with
  `npx npm@<CI version> install --package-lock-only` and check that only entries were added.
- **`compatibility_date`** in `wrangler.jsonc` must not be newer than the test runtime supports,
  or the tests fail to start.
- **`npm test` needs the network once:** `test/notebook/course-cells.test.ts` runs every course
  cell in Pyodide and downloads its packages (from Pyodide's CDN and PyPI) into
  `node_modules/pyodide`, where later runs find them.
- **Vitest stays on 4.x** until `@cloudflare/vitest-pool-workers` supports 5.
- **No interface text inline.** Every word the app shows goes through `src/web/i18n`: add it to
  `sq.ts` (the source) and `en.ts`, which the build checks for every message. Components use
  `useT()`, page titles and error texts `t()`. A visualization keeps its own `bilingual()` text
  beside it (`src/viz/kit/text.ts`). Course content (notebooks, titles) is not translated.
- **The app is cross-origin isolated** (COOP and COEP in `public/_headers` and in Vite's dev
  server), so the Python worker can share memory with the page. Anything loaded from another
  origin must send CORS or `Cross-Origin-Resource-Policy` headers, or it will not load.
- **Static assets are public.** Protected content must come from `/api` after a permission check.
- **Every tenant-owned query goes through `forTenant()`** (`src/api/db/tenant.ts`); lint blocks
  Drizzle and schema imports elsewhere in `src/api`. A new tenant table needs `org_id`,
  `(parent_id, org_id)` foreign keys, `org_id` in every unique index, and an entry in
  `test/api/tenant-isolation.test.ts`.
- **The converter must keep making the course site's cells.** The 22 fixture notebooks and their
  snapshots in `test/notebook/fixtures` are the specification. Change a snapshot only on
  purpose, with `scripts/snapshot-course-notebooks.ts`, which also copies the site's embeds
  (`embeds.json`, used by the end-to-end tests). Run `npm run format` after it: the script writes
  plain JSON, and only formatting tells a real change from none.
- **Every organization route checks a capability.** It lives under `/api/orgs/:org` behind
  `tenantAccess` and uses `requireCapability` or `c.var.access.can(…)`, passing the resource's
  course and group. Add a test for who may and who may not.
- **Rerun `npm run cf-typegen`** after changing bindings in `wrangler.jsonc`.
- **`src/web/routeTree.gen.ts` is generated and committed.** Never edit it; after adding or
  renaming a route, run `npm run dev` or `npm run build` and commit the result (CI checks).
- **Migrations are append-only and additive.** Change the schema, run `npm run db:generate`, commit
  the new SQL. Never edit or delete a migration once it is merged. CI fails if the schema and the
  migrations disagree. Production applies them before the new code is live, so never rename or
  drop what the running code still uses in the same release.
- **No virtual tables in D1** (FTS5 included): `wrangler d1 export`, which the weekly backup
  uses, refuses a database that has one. Search uses plain rows (see `platform-architecture`).
- **D1 limits bulk writes:** 100 bound parameters per statement and 50 statements per request on
  the free plan. Write many rows as multi-row inserts of `ROWS_PER_INSERT` rows, split big jobs
  into several requests, and test parameter counts with `toSQL()`. The local database does not
  enforce these limits.
- **Uploaded files are served safely:** only allowlisted types, with `nosniff` and a sandboxing
  CSP (`src/api/routes/notebooks.ts`). Staff upload, but students open them.
- **Notebook HTML is shown only through `sanitize()`** (`src/web/lib/sanitize.ts`). A rendering is
  made in a browser and can be hand-crafted, so never trust the converter's escaping alone.
- **The data processing agreement describes the code** (`docs/legal/`): a change to security,
  sub-processors, data location or retention updates both language versions in the same PR.
- **Student data stays in the EU or encrypted.** The production database has the EU jurisdiction;
  backups are encrypted with the owner's key. Never commit, log or upload a plaintext export.
