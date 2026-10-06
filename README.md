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
| `npm run deploy` | Build and deploy to Cloudflare (needs a configured account) |

## Layout

```
src/web/      React app; pages are files in src/web/routes/
src/api/      API (Cloudflare Worker, Hono)
src/api/db/   Database schema and access (Drizzle)
migrations/   SQL migrations for D1
test/         Tests that run inside the Workers runtime
e2e/          End-to-end tests (Playwright, against the production build)
```

## License

Proprietary. All rights reserved (see `LICENSE`).
