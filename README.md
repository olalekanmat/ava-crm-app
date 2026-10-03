# Ava

A field CRM for pharma and life-sciences sales teams, built as **one codebase for Android, iOS and web** (Expo) with a small Node server for shared team data.

## What's in it

| Who | What they get |
|---|---|
| **Rep** | Today view (calls, drafts, follow-ups, accounts behind plan), accounts with search and filters, call logging with products, key messages and **GPS check-in**, cycle plan with progress against pace |
| **FLM** (first-line manager) | Team view: plan attainment vs. time elapsed, reach, geo-verified share, open drafts per rep; approve or send back cycle plans; drill into any rep |
| **SLM** (second-line manager) | Region overview: every FLM team side by side, rep ranking, coverage by tier |
| **Admin** | Users and reporting lines, CSV import (accounts, users, products), CSV export, planning cycles, product catalogue, check-in radius and rules, audit log (server mode) |

- **Geotagging**: in-person calls record the device location at check-in. Ava compares it with the account's pinned location: *Verified* (inside the radius, default 300 m), *Off-site*, *Unverified* (account not pinned yet) or *No check-in*. Admins can make check-in mandatory for in-person calls.
- **Cycle planning**: a rep builds a plan per cycle (suggested from tier frequencies A 6 / B 4 / C 2), submits it, and their FLM or SLM approves it or requests changes with a note.
- **Data export**: calls (with check-in coordinates and status), accounts, cycle plans, team KPIs, users. UTF-8 CSV that opens in Excel; values that look like formulas are neutralised.
- **CSV upload**: preview with per-line errors before anything is saved; downloadable templates; accounts and users exported from Ava re-import cleanly.
- **Compliance basics**: submitted calls are locked; every change on the server goes through the same rules as the app and lands in an audit log.

## Two modes

- **Demo mode** (no server): pick a role on the sign-in screen and explore a fictional sales organisation stored on the device. Switch roles under *More*.
- **Server mode**: users sign in with email and password; each person only receives the data their role allows (rep: own territory; FLM: team; SLM: region; admin: everything). Changes made offline are queued on the device and sync when the connection is back.

## Run it

Requires Node 22+.

```bash
npm install
npm run web          # app in the browser (demo mode)
npm run build:web    # static web build in dist/
npm run server       # API + web app on http://localhost:8080 (serves dist/)
npm test             # business rules, scoping, CSV, metrics
npm run typecheck
```

On first start the server loads the demo organisation; demo users sign in with password `ava-demo` (change it with `DEMO_PASSWORD`). Accounts: `tunde@ava.demo` (rep), `flm.mainland@ava.demo` (FLM), `slm@ava.demo` (SLM), `admin@ava.demo` (admin).

Deploying for a client test: see [docs/DEPLOY.md](docs/DEPLOY.md). What testers should try: [docs/CLIENT_TEST_GUIDE.md](docs/CLIENT_TEST_GUIDE.md).

## Code layout

```
src/app/              screens (Expo Router: every file is a route)
  (tabs)/             Home (per role), Accounts, Calls, Plan, More
  account/ call/      account detail and new; call detail and log/edit with check-in
  plan/ team/         plan review; drill-down into a rep, team or region
  admin/              users, user editor, CSV import, settings, audit log
  export.tsx          CSV exports    sign-in.tsx   sign in or enter the demo
src/screens/          role dashboards and the plan view
src/data/
  types.ts            data model          mutations.ts   every change + its rules
  access.ts           who sees what       metrics.ts     attainment, reach, geo KPIs
  csv.ts              import/export       geo.ts         distance and check-in status
  store.tsx           app state, demo/server modes, offline queue and sync
server/               Node HTTP server: sign-in, scoped data, audit log, static web app
tests/                node:test suite (npm test)
```

The rules in `src/data/mutations.ts` run in the app (instant feedback, works offline) and again on the server (`server/index.ts`), so a modified client cannot skip them.
