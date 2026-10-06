# Lab Platform

An interactive lab platform for programming and algorithms courses. It has notebooks that run in the
browser, algorithm visualizations, live class sessions and an AI tutor, with pedagog and student
roles. It is multi-tenant: every university or school gets its own space.

**Status:** phase 1, foundation. Progress is tracked in the
[Phase 1: Foundation](../../milestone/1) milestone.

## Stack

| Part | Technology |
|---|---|
| App | React 19 + Vite 8 (single-page app) |
| API | Hono on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite), from phase 1 |
| Language | TypeScript |
| Quality | Biome (lint and format), Vitest running inside the Workers runtime, GitHub Actions CI |

## Getting started

Requirements: Node 24 (see `.nvmrc`) and npm 11.19 or newer.

```bash
npm install     # also generates the Worker types
npm run dev     # app and API on http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server for the app and the API |
| `npm run lint` | Lint and format check (Biome) |
| `npm run format` | Fix formatting and import order |
| `npm run typecheck` | TypeScript project check |
| `npm test` | Tests inside the Workers runtime |
| `npm run build` | Production build |
| `npm run deploy` | Build and deploy to Cloudflare (needs a configured account) |

## Layout

```
src/web/   React app
src/api/   API (Cloudflare Worker, Hono)
test/      Tests that run inside the Workers runtime
```

## License

Proprietary. All rights reserved (see `LICENSE`).
