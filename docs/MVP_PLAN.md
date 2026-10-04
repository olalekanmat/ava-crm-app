# Ava CRM roadmap

## Stack

| Layer | Choice |
|---|---|
| App (Android, iOS, web) | Expo SDK 57, React Native 0.86, TypeScript, Expo Router |
| Storage | Each company's own Google Drive / OneDrive / SharePoint folder: per-device journals replayed through the shared rules |
| Approvals | Static page + one Netlify Function at avahealthcareltd.com/AvaCRM, Ed25519-signed licences |
| Rules | `src/data/mutations.ts`, run on each change and again on every device's replay |
| Builds | Gradle locally or EAS Build in the cloud |

## Done

- Phase 1 (RepField MVP): accounts, call logging, planned → draft → submitted lifecycle, locked submitted calls.
- Phase 3 (Ava CRM 2.0): company setup with logo and details; data in each company's own drive with offline sync; Microsoft and Google sign-in (no stored passwords); developer approval page with subscription durations and revoke; tier names per team; colour-coded call calendar.
- Phase 2 (Ava 1.1): new brand and interface; Rep, FLM, SLM and Admin roles with scoped data; team and region dashboards; cycle planning with manager approval; GPS check-in and verification; CSV import with preview and CSV exports; server with sign-in, offline queue and audit log; demo mode.

## Next

- Journal compaction (periodic snapshot file) for companies with hundreds of users.
- Per-team subfolders so reps' drive access matches what the app shows them.
- Google app verification (needed to open Google sign-in beyond 100 test users).
- Map view of accounts and a day route.
- Approved content (CLM) during calls and tracking which slides were shown.
- Sample management with signature capture (needs compliance review).
- Approved-email templates; push notifications for plan approvals.

## Open decisions for the owner

1. First market and its rules (e.g. NDPR in Nigeria, GDPR in the EU, US Sunshine Act).
2. Where account master data comes from (CSV now; later an HCP data provider).
3. Check-in policy: radius, and whether check-in is mandatory for in-person calls.
