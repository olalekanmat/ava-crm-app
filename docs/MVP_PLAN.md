# Ava roadmap

## Stack

| Layer | Choice |
|---|---|
| App (Android, iOS, web) | Expo SDK 57, React Native 0.86, TypeScript, Expo Router |
| Server | Node 22, single process, SQLite (`node:sqlite`), Docker; serves the web build too |
| Rules | `src/data/mutations.ts`, shared by app (offline, instant) and server (enforced) |
| Builds | Gradle locally or EAS Build in the cloud |

## Done

- Phase 1 (RepField MVP): accounts, call logging, planned → draft → submitted lifecycle, locked submitted calls.
- Phase 2 (Ava 1.1): new brand and interface; Rep, FLM, SLM and Admin roles with scoped data; team and region dashboards; cycle planning with manager approval; GPS check-in and verification; CSV import with preview and CSV exports; server with sign-in, offline queue and audit log; demo mode.

## Next

- Corporate SSO (Azure AD / Okta), session timeout, encrypted on-device storage.
- Postgres instead of SQLite when the user count grows; per-collection sync instead of whole snapshots.
- Map view of accounts and a day route; calendar view of planned calls.
- Approved content (CLM) during calls and tracking which slides were shown.
- Sample management with signature capture (needs compliance review).
- Approved-email templates; push notifications for plan approvals.

## Open decisions for the owner

1. First market and its rules (e.g. NDPR in Nigeria, GDPR in the EU, US Sunshine Act).
2. Where account master data comes from (CSV now; later an HCP data provider).
3. Check-in policy: radius, and whether check-in is mandatory for in-person calls.
