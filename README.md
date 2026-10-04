# Ava CRM

A field CRM for pharma and life-sciences sales teams, built as **one codebase for Android, iOS and web** (Expo). Each company keeps its own data in its administrator's OneDrive; Ava Healthcare approves companies and relays files, but stores no company data.

## What's in it

| Who | What they get |
|---|---|
| **Rep** | Today view, accounts, call logging with **GPS check-in**, quarterly plan sent to the manager for approval, **call calendar** (names shown in landscape/wide screens) (green submitted, blue planned, red overdue) |
| **FLM** | Team view: plan attainment vs. time elapsed, reach, geo-verified share; approve or send back cycle plans |
| **SLM** | Region overview: every FLM team side by side, rep ranking, coverage by tier |
| **Admin** | Company profile and logo, approval status, company code and OneDrive folder, password resets, users and reporting lines, **tier names per team** (default ST, T1, T2, T3), CSV import and export, products, check-in rules, audit log |

- **Company setup** (web): the admin enters the company details and their own password, then links their OneDrive once. Ava CRM creates the company folder and requests approval.
- **Sign-in**: everyone else uses the company code, work email and password (first password `12345678`, changed at first sign-in).
- **Cycles**: calendar quarters, created automatically (Cycle 1 = Jan–Mar … Cycle 4 = Oct–Dec).
- **Company logo** at the top left of every page.
- **Auto-save**: changes save a moment after they are made. Offline, the phone keeps them and uploads when the connection returns (or from the **Sync** button on Home).
- **Licences**: signed by the approval server, checked in the app; read-only when expired or revoked.

## Live use

The app runs only against live company data (no demo mode). See [docs/SETUP.md](docs/SETUP.md) for the one-time Microsoft and Netlify steps and how the data model works.

## Run it

Requires Node 22+.

```bash
npm install
npm run web          # app in the browser
npm test             # rules, scoping, CSV, metrics, drive sync, licences, calendar
npm run typecheck
```

## Build it

These are the exact commands used to build the Android APK and the web app shipped in `ava-crm-site/AvaCRM/app`. Expo reads `EXPO_PUBLIC_AVA_LICENSE_PUBKEY` from `.env` automatically, so builds always embed the licence public key.

### Android APK

Requires Node 22+, JDK 17 and the Android SDK (with NDK) at `~/android-sdk`.

```bash
npm ci
EXPO_OFFLINE=1 CI=1 npx expo prebuild -p android --no-install --clean
cd android
export ANDROID_HOME=~/android-sdk ANDROID_SDK_ROOT=~/android-sdk
echo "sdk.dir=$HOME/android-sdk" > local.properties
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
# APK: android/app/build/outputs/apk/release/app-release.apk
```

The `android/` folder is generated and not committed. The release build is signed with the debug keystore that prebuild creates, which is fine for side-loading and testing; for Google Play, add your own upload keystore. Before each new release, bump `expo.version` and `expo.android.versionCode` in `app.json`.

Cloud build alternative: `npx eas build -p android --profile preview` (profiles in `eas.json`, needs an Expo account).

### Web app (for avahealthcareltd.com/AvaCRM/app)

```bash
npm ci
rm -rf dist
AVA_WEB_BASE=/AvaCRM/app EXPO_OFFLINE=1 CI=1 npx expo export --platform web --output-dir dist
# Copy dist/ to ava-crm-site/AvaCRM/app/ and redeploy the site
```

`AVA_WEB_BASE` makes the web app work from the `/AvaCRM/app` folder (see `app.config.js`). Sign-in client IDs are not baked in; the app reads them at runtime from `https://avahealthcareltd.com/AvaCRM/app-config.json`.

### Checks before any build

```bash
npm test
npm run typecheck
```

## Code layout

```
src/app/            screens (Expo Router); setup.tsx = company setup, sign-in.tsx
  admin/            company & approval, tiers, users, import, settings, audit log
src/cloud/          relay.ts (sign-in and company folder via the Ava CRM server), journal.ts (replay),
                    sync.ts, license.ts, background.ts, setup.ts
src/data/           types, mutations (all rules), sanitize, access, metrics, tiers, calendar, csv, store
src/screens/        role dashboards and the plan view
src/ui/             components, calendar, sync card, company form
tests/              node:test suite
```

The rules in `src/data/mutations.ts` run when a change is made and again when every device replays the company's journals, so a modified app cannot skip them.
