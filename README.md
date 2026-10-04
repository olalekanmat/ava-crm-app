# Ava CRM

A field CRM for pharma and life-sciences sales teams, built as **one codebase for Android, iOS and web** (Expo). Each company keeps its own data in its own Google Drive, OneDrive or SharePoint; Ava Healthcare only approves companies.

## What's in it

| Who | What they get |
|---|---|
| **Rep** | Today view, accounts, call logging with **GPS check-in**, cycle plan, **call calendar** (green submitted, blue planned, red overdue) |
| **FLM** | Team view: plan attainment vs. time elapsed, reach, geo-verified share; approve or send back cycle plans |
| **SLM** | Region overview: every FLM team side by side, rep ranking, coverage by tier |
| **Admin** | Company profile and logo, approval status, drive folder and sharing, users and reporting lines, **tier names per team** (default ST, T1, T2, T3), CSV import and export, cycles, products, check-in rules, audit log |

- **Company setup**: the first admin signs in with the company's Microsoft or Google account, enters the company name, logo and details, picks the storage folder and requests approval from `https://avahealthcareltd.com/AvaCRM`.
- **Company logo** at the top left of every page.
- **Offline first**: changes are kept on the device and upload on open, hourly while open, in the background when the phone allows, and from the **Sync** button.
- **Licences**: signed by the approval server, checked in the app; read-only when expired or revoked.

## Modes

- **Demo**: pick a role on the sign-in screen and explore a fictional company stored on the device.
- **Company**: sign in with Microsoft or Google. See [docs/SETUP.md](docs/SETUP.md) for the one-time registration steps and how the data model works.

## Run it

Requires Node 22+.

```bash
npm install
npm run web          # app in the browser
npm test             # rules, scoping, CSV, metrics, drive sync, licences, calendar
npm run typecheck
```

## Code layout

```
src/app/            screens (Expo Router); setup.tsx = company setup, sign-in.tsx
  admin/            company & approval, tiers, users, import, settings, audit log
src/cloud/          drive storage: journal.ts (replay), sync.ts, google.ts, graph.ts,
                    auth.ts (Microsoft/Google sign-in), license.ts, background.ts, setup.ts
src/data/           types, mutations (all rules), sanitize, access, metrics, tiers, calendar, csv, store
src/screens/        role dashboards and the plan view
src/ui/             components, calendar, sync card, company form
tests/              node:test suite
```

The rules in `src/data/mutations.ts` run when a change is made and again when every device replays the company's journals, so a modified app cannot skip them.
