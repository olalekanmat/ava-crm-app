# RepField

A field CRM for pharma sales reps (Veeva-style), built as **one codebase for iOS, Android and web** with Expo.

MVP scope: **account lists** (HCPs and HCOs) and **call logging**.

## Run it

Requires Node 20+.

```bash
npm install
npm run web        # opens in the browser
npm start          # then scan the QR code with Expo Go on a phone
npm run typecheck
npm run build:web  # static web build in dist/
```

The app starts with a fictional demo territory. "Reset demo data" on the Today tab restores it.

## Build an Android APK

Needs a free Expo account (expo.dev). From the project folder:

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile apk
```

The build runs in Expo's cloud and ends with a link to download the `.apk`, which installs on any Android phone (allow "install unknown apps"). Use `--profile production` for a Play Store bundle.

## What's in the MVP

- **Today**: today's planned calls, drafts waiting to be submitted, follow-ups due this week.
- **Accounts**: search by name, specialty or city; filter people (HCP) vs organizations (HCO); tier A/B/C; last submitted call date. Add new accounts.
- **Account detail**: contact info (tap to call or email), people affiliated with an organization, full call history, "Log a call".
- **Call logging**: account, date and time, channel (in person, phone, video, email), products discussed in presentation order, key messages per product, attendees, notes, next step, follow-up date.
- **Call lifecycle**: Planned (future) → Saved draft → Submitted. Submitting needs at least one product and a time that is not in the future. **Submitted calls are locked** (compliance rule, as in Veeva).
- Data is stored on the device (AsyncStorage, which is localStorage on web).

## Code layout

```
src/app/            screens (Expo Router: every file is a route)
  (tabs)/           Today, Accounts, Calls tabs
  account/[id].tsx  account detail       account/new.tsx  add account
  call/[id].tsx     call detail          call/edit.tsx    log or edit a call
src/data/           types, store (React context), storage, validation, seed data
src/ui/             theme and shared components
docs/MVP_PLAN.md    stack choice and roadmap
```

`src/data/storage.ts` is the single persistence seam; swapping it for a synced backend does not touch the screens.
