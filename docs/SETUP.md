# Setting up Ava CRM for real companies

Ava CRM has three parts:

1. **The app**: the Android APK, plus the same app on the web at `https://avahealthcareltd.com/AvaCRM/app/`.
2. **The Ava CRM server** on this site (`/AvaCRM/api`, the Netlify function). It handles:
   - licences, through your developer console at `https://avahealthcareltd.com/AvaCRM`;
   - sign-in;
   - passing files to and from each company's OneDrive.
3. **Each company administrator's OneDrive**, where all of that company's data lives in a folder named `Ava CRM - <company>`. Ava Healthcare stores none of the company data.

## How people sign in

- **Only the company administrator links OneDrive**, once, while setting up the company (on the web: *Set up a new company*).
- **Everyone else signs in with three things:**
  - the 6-character **company code**;
  - their **work email**;
  - a **password**.
- **New users start with the password `12345678`** and must choose their own the first time they sign in. Passwords are stored only as scrypt hashes, in `ava-credentials.json` in the company folder. The server never lets that file be listed or read through the app.
- **Admins** add users under **Users & roles** (or Import CSV). They can **Reset password**, which puts that user back to `12345678` with a forced change.
- **Inactive users** are refused immediately.
- **Microsoft sign-in is not used by staff**, on the phone or the web.

## One-time Microsoft setup (you)

In https://entra.microsoft.com > **App registrations** > **Ava CRM** (client ID `8f4e9855-5ae1-4d74-8801-cc05d985b6f6`):

1. **Authentication** > **Add a platform** > **Web**, then add the redirect URI:
   `https://avahealthcareltd.com/AvaCRM/api/ms/callback`
   - The old single-page and mobile redirects can stay or be removed. They are no longer used.
2. **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated**, then add:
   - `Files.ReadWrite`
   - `offline_access`
   - `User.Read`
3. **Certificates & secrets** > **New client secret**:
   - Description: `Ava CRM server`. Expiry: **24 months**.
   - Copy the **Value** (not the Secret ID). It is shown only once.
   - Set a reminder to replace it before it expires.
4. In Netlify, open the site > **Site configuration** > **Environment variables**, and add:

   | Key | Value |
   |---|---|
   | `AVACRM_MS_CLIENT_ID` | `8f4e9855-5ae1-4d74-8801-cc05d985b6f6` |
   | `AVACRM_MS_CLIENT_SECRET` | the secret **Value** from step 3 |

   `AVACRM_SIGNING_KEY`, `AVACRM_DEV_PASSWORD` and `AVACRM_SESSION_SECRET` stay as they are. `AVACRM_SESSION_SECRET` also signs app sign-ins: changing it signs everyone out, but it does not unlink OneDrive.
5. **Deploys** > **Trigger deploy** > **Deploy site**.

The refresh token for each administrator's OneDrive is stored encrypted in Netlify Blobs. If the client secret is replaced, existing links keep working once the new secret is in Netlify.

## How a company gets going

1. **The administrator** opens `https://avahealthcareltd.com/AvaCRM/app/setup` (or taps *Set up a new company* in the app, which opens that page).
   - They enter the company details, plus their own name, email and password.
   - They sign in to Microsoft and allow access.
   - Ava CRM creates the company folder in their OneDrive and shows the **company code**.
2. **You** see the company as *Pending* in the developer console, and approve it for the agreed number of days.
   - Until then, the admin can set up users, accounts and products, but reps cannot record anything.
3. **The administrator** goes to **Company & approval**, where they can:
   - **Copy invitation message**: code, email and `12345678`;
   - add users;
   - set tier names.
4. **Each person** signs in with the code, their email and `12345678`, then chooses their own password.

## How the data works

- **Folder files**
  - **Journals:** each person's changes go to their own file, `ava-journal-<user>-<device>.json`. The server only lets a person write their own journal.
  - **Admin-only files:** the licence (`ava-license.json`), the user list used for sign-in (`ava-roster.json`) and the readable CSV copies (`Ava CRM - *.csv`).
- **Saving**
  - **Automatic:** every change saves a moment after it is made. The web version has no Sync button.
  - **Offline (phone):** changes wait on the device until the connection returns. The Home tab shows the save status and a **Sync** button.
  - **Refreshing:** devices pull other people's changes every 5 minutes while open, and on returning to the app.
- **Cycles** are the calendar quarters, created automatically:
  - Cycle 1: Jan–Mar
  - Cycle 2: Apr–Jun
  - Cycle 3: Jul–Sep
  - Cycle 4: Oct–Dec
- **Quarterly plans** are built by reps and sent to their manager (**Submit for approval**). The manager approves the plan or requests changes.
- **Licences**
  - Licences are signed by your server and checked against the public key built into the app.
  - Each one lasts at most 14 days and renews automatically while the subscription is active.
- **Size:** every device downloads every journal, which suits teams of up to a few hundred people.

## Building the app

```bash
npm install
npm test && npx tsc --noEmit
# web build for the site (from the app repo), then install it into this repo:
AVA_WEB_BASE=/AvaCRM/app npx expo export --platform web --clear
node ../avahealthcareltd-site/scripts/install-web-app.mjs dist
# Android APK:
npx eas-cli build -p android --profile apk
```

The public licence key is in the app repo's `.env`, so builds pick it up automatically.

## Testing locally

```bash
AVACRM_FAKE_MS=1 node scripts/dev-server.mjs   # simulated Microsoft/OneDrive
npm test                                         # licence + relay tests
```
