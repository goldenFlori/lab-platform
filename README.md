# Lab Platform

An interactive lab platform for programming and algorithms courses. It has notebooks that run in the
browser, algorithm visualizations, live class sessions and an AI tutor, with pedagog and student
roles. It is multi-tenant: every university or school gets its own space.

**Status:** phase 1, foundation. Progress is tracked in the
[Phase 1: Foundation](../../milestone/1) milestone.

## Stack

| Part | Technology |
|---|---|
| App | React 19 + Vite 8 (single-page app), TanStack Router and Query |
| Design | Tailwind CSS v4 + HeroUI v3, light and dark theme, Inter and JetBrains Mono |
| API | Hono on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) through Drizzle ORM |
| Language | TypeScript |
| Quality | Biome (lint and format), Vitest inside the Workers runtime, Playwright, GitHub Actions CI |

## Getting started

Requirements: Node 24 (see `.nvmrc`) and npm 11.19 or newer.

```bash
npm install         # also generates the Worker types
npm run db:migrate  # creates the local database
npm run dev         # app and API on http://localhost:5173
```

For the end-to-end tests, install the browser once with `npx playwright install chromium`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server for the app and the API |
| `npm run lint` | Lint and format check (Biome) |
| `npm run format` | Fix formatting and import order |
| `npm run typecheck` | TypeScript project check |
| `npm test` | Tests inside the Workers runtime |
| `npm run test:e2e` | End-to-end tests in Chromium, desktop and a 375px phone |
| `npm run build` | Production build |
| `npm run db:generate` | Write a migration after changing `src/api/db/schema.ts` |
| `npm run db:migrate` | Apply the migrations to the local database |
| `npm run account:create` | Create an organization's first account (see below) |
| `npm run course:import` | Import a course site's labs, notebooks and solutions (see below) |
| `npm run deploy` | Build and deploy from this machine (needs `npx wrangler login`); merges to `main` deploy on their own |
| `npm run measure:class` | A class of 120 against the free plan's daily limits, on a local copy |
| `npm run errors` | Browser and server errors in production as they happen (needs `npx wrangler login`) |
| `npm run usage` | Today's use of the free plan's daily limits (see Usage below) |
| `npm run backup:restore` | Prove the latest weekly backup restores (see Backups below) |

## Layout

```
src/web/      React app; pages are files in src/web/routes/
src/api/      API (Cloudflare Worker, Hono)
src/api/db/   Database schema and access (Drizzle)
migrations/   SQL migrations for D1
test/         Tests that run inside the Workers runtime
e2e/          End-to-end tests (Playwright, against the production build)
```

## First account

Everyone signs in with a username and password. An organization's first account is created from
the command line. The password is generated, shown once, and only its hash is stored:

```bash
npm run account:create -- --org-slug fshn --org-name "FSHN" \
  --username florjan.mema --full-name "Florjan Mema" --role admin --remote
```

Leave out `--remote` to create it in the local database for `npm run dev`.

## Course content

A course site in the course repository's format (`site/content/course.mjs`, its notebooks and the
git-ignored `zgjidhjet/` solutions) is imported with a pedagog's or admin's account:

```bash
npm run course:import -- --from ~/Desktop/discrete-structures-algorithms-course \
  --org fshn --year 2026/27 --username florjan.mema \
  --url https://lab-platform.florjanimema.workers.dev
```

- It asks for the password (or reads `LAB_PASSWORD`). Leave out `--url` to import into
  `npm run dev`, and add `--dry-run` to see the plan without uploading.
- Running it again updates only the labs that changed.
- Visualizations only the platform has (the trace tables, the recursion tree, Kruskal & Prim) come
  from `site/content/platform.mjs` when the course repo has one, by notebook and cell like the site's:
  `export const embeds = { 'laborator-05.ipynb': [{ cell: 15, viz: 'tabela-gjurmimit', props: { preset: 'lab05-kruskal' } }] };`
- Labs stay hidden until you open them. Solutions are for staff, and for students from the date
  set on each lab.

## Deploy

Merging to `main` deploys automatically. Once every check passes, GitHub Actions applies the
database migrations, deploys to Cloudflare and checks the live site:
https://lab-platform.florjanimema.workers.dev

`npm run deploy` deploys from your machine. Use it only to create the Worker the first time or in
an emergency.

## Usage

Cloudflare's free plan allows 100,000 Worker requests, 5 million D1 rows read and 100,000 rows
written a day, and refuses more until midnight UTC. The Usage workflow reads today's numbers four
times a day and fails from 70% of any of them, so GitHub emails you in time; each run's summary shows
the table. To set it up once:

1. In the Cloudflare dashboard, **My Profile → API Tokens → Create Token → Create Custom Token**:
   name it "lab-platform usage", permission **Account → Account Analytics → Read**, for your account
   only. Nothing else: it can read counts and change nothing.
2. Store it in the repository: `gh secret set CLOUDFLARE_ANALYTICS_TOKEN` and paste the token.
   (`CLOUDFLARE_ACCOUNT_ID` is already there.)
3. Run it once: **Actions → Usage → Run workflow**, or on your machine
   `CLOUDFLARE_ANALYTICS_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run usage`.

## Backups

- **Time Travel:** D1 can restore the database to any minute of the last 7 days
  (`npx wrangler d1 time-travel restore DB --timestamp=<time>`).
- **Weekly export:** every Monday the Backup workflow exports the database, encrypts it with the
  owner's [age](https://age-encryption.org) key and keeps it for 90 days as a workflow artifact.
- **Check that it restores:** `npm run backup:restore` takes the latest backup, decrypts it with
  `~/lab-platform-backup.key`, restores it into a throwaway local database, applies any newer
  migrations, and checks it: tables, integrity, links between rows, files, and the app opening a
  course. It prints counts only and deletes the decrypted copy. Run it after changing the schema or
  the backup, and once a month.
- **Restore after a disaster** (use Time Travel instead for anything in the last 7 days):
  1. `npm run backup:restore -- --prepared restore.sql` checks the backup and writes it in a form D1
     can import. A raw export cannot be imported: its indexes come after the rows that need them,
     and file chunks exceed D1's 100 KB per statement. The file is plaintext student data: keep it on
     this machine and delete it at the end.
  2. `npx wrangler d1 create lab-platform-restored --jurisdiction eu`
  3. `npx wrangler d1 execute lab-platform-restored --remote --file restore.sql`
  4. `npx wrangler d1 migrations apply lab-platform-restored --remote`
  5. Put the new `database_id` in `wrangler.jsonc`, merge it so it deploys, and `rm restore.sql`.

## License

Proprietary. All rights reserved (see `LICENSE`).
