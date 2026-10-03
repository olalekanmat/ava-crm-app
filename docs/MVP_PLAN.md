# RepField MVP plan

## Stack

| Layer | Choice | Why |
|---|---|---|
| App (iOS, Android, web) | Expo SDK 57, React Native 0.86, TypeScript | One codebase for mobile and web; over-the-air updates via EAS |
| Navigation | Expo Router | File-based routes; same URLs work on web |
| Local data | AsyncStorage now, SQLite (expo-sqlite) next | Reps work offline in hospitals; calls must save without signal |
| Backend (phase 2) | Postgres with an API (e.g. Supabase or a Node service) | Accounts, territories, call sync, audit trail |
| Auth (phase 2) | SSO / OIDC (Azure AD, Okta) | Pharma companies require corporate sign-in |
| Builds | EAS Build and Submit | No local Xcode or Android Studio needed |

## Phase 1: this MVP (done)

- Account list with search, HCP/HCO filter, tiers, affiliations
- Account detail with call history
- Call logging: channel, products in order, key messages, notes, next step, follow-up
- Planned → draft → submitted lifecycle; submitted calls locked
- Today view with planned calls, drafts and follow-ups
- Runs on web and in Expo Go; data stored on device

## Phase 2: real data and sync

- Backend with users, territories, and account assignment per rep
- Offline-first sync: local SQLite queue, push on reconnect, conflict rule "server wins except unsubmitted drafts"
- Corporate SSO, session timeout, encrypted local storage
- Audit trail for call submits (who, when, device)
- Import accounts from a master data source (CSV first, later an HCP data provider)

## Phase 3: field features reps expect from Veeva-style CRMs

- Call planning calendar and route view on a map
- Sample tracking with signature capture and lot numbers (regulated: needs compliance review)
- Approved content (CLM): show approved slides during a call and record what was shown
- Manager dashboards: call reach and frequency by tier, coverage gaps
- Email with approved templates only

## Open decisions for the owner

1. Backend: managed (Supabase) for speed, or a custom service for full control.
2. First market and its rules (e.g. US Sunshine Act reporting, EU data residency).
3. Where account master data comes from.
