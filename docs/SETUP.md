# Setting up Ava CRM for real companies

Ava CRM has three parts:

1. **The app** (Android APK, plus the same app on the web at `https://avahealthcareltd.com/AvaCRM/app/`).
2. **The approval page** at `https://avahealthcareltd.com/AvaCRM` (folder `ava-crm-site/`): your developer console to approve companies. Install steps are in `ava-crm-site/INSTALL.md`.
3. **Each company's own drive** (Google Drive, OneDrive or SharePoint), where all of that company's data lives. Ava Healthcare stores none of it.

Before a company can sign in, three one-time steps are needed on your side. Ava CRM was built with placeholders for them; nothing has been registered or deployed.

| Step | Who | Needed for |
|---|---|---|
| A. Deploy the approval page (`ava-crm-site/INSTALL.md`) | You, on Netlify | Approvals, the web app, the APK download |
| B. Register a Microsoft app (Microsoft Entra) | You, free | "Sign in with Microsoft" (OneDrive, SharePoint) |
| C. Register a Google app (Google Cloud) | You, free | "Sign in with Google" (Google Drive) |

Steps B and C produce **client IDs**. These are public, not passwords. Put them in `AvaCRM/app-config.json` on the site; the app reads that file, so **no rebuild is needed**. You can do just B or just C first.

## A. Approval page

Follow `ava-crm-site/INSTALL.md`. The licence signing key pair has already been generated:

- the **public key** is built into this APK and web app (`EXPO_PUBLIC_AVA_LICENSE_PUBKEY`);
- the **private key** (`AVACRM_SIGNING_KEY`) is in `PRIVATE-licence-signing-key.txt`. Put it in Netlify's environment variables, store a copy in your password manager, then delete the file. Anyone with it could issue licences.

If you make a new key instead, the app has to be rebuilt with the new public key.

## B. Microsoft (OneDrive and SharePoint)

1. Go to https://entra.microsoft.com > **App registrations** > **New registration**.
   - Name: `Ava CRM`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
   - Leave the redirect URI empty for now. Register.
2. Copy the **Application (client) ID**.
3. **Authentication** > **Add a platform**:
   - **Single-page application**: `https://avahealthcareltd.com/AvaCRM/app/oauthredirect`
   - **Mobile and desktop applications**: custom redirect `ava://oauthredirect`
4. **API permissions** > Add > Microsoft Graph > **Delegated**: `User.Read`, `Files.ReadWrite.All`, `offline_access`, `openid`, `profile`, `email`.
5. In `AvaCRM/app-config.json` set `"microsoftClientId": "<the client ID>"` and deploy.

Some company tenants require an IT admin to consent to `Files.ReadWrite.All` the first time. The admin sees this on their first sign-in; their IT team grants it once for everyone.

## C. Google (Google Drive)

1. Go to https://console.cloud.google.com, create a project `Ava CRM`, and enable the **Google Drive API**.
2. **OAuth consent screen**: External, app name Ava CRM, your support email. Add the scope `.../auth/drive`. While the app is in **Testing**, add each tester's Google address under **Test users** (up to 100).
3. **Credentials** > **Create credentials** > **OAuth client ID**, twice:
   - **Web application**:
     - Authorized JavaScript origin: `https://avahealthcareltd.com`
     - Authorized redirect URI: `https://avahealthcareltd.com/AvaCRM/app/oauthredirect`
   - **Android**:
     - Package name: `com.avacrm.app`
     - SHA-1: the fingerprint below
     - Then open the new client > **Advanced settings** and turn on **Custom URI scheme**.
4. In `AvaCRM/app-config.json` set:
   - `"googleWebClientId"` to the Web client ID
   - `"googleAndroidClientId"` to the Android client ID

   Then deploy.

SHA-1 of the key this test APK is signed with: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. A Play Store build is signed with a different key, so add that key's SHA-1 too.

**Google limit:** full Drive access (`drive` scope) is a restricted scope. In Testing mode it works for up to 100 named test users. To open it to everyone, Google requires app verification, including a paid third-party security assessment. Microsoft has no equivalent step, so Microsoft is the faster route for client tests.

## How a company gets going

1. **The company admin** opens the app and signs in with the work Microsoft or Google account that owns the company folder. Then they choose **Set up a new company** and fill in three things:
   - the company name, logo and details;
   - the storage: an empty folder link, or "create a new folder";
   - the approval server address (pre-filled).
2. **You** see the company as *Pending* on `https://avahealthcareltd.com/AvaCRM` (Developer sign in). Approve it for the agreed number of days. Later you can Extend, Set end date, or Revoke.
3. **The admin** taps *Check now* under Company & approval. Then they:
   - add users under **Users & roles** or **Import CSV**;
   - set **Tier names** per team;
   - tap **Share folder with team**, which gives each user edit access and sends the drive's invitation email.
4. **Each person** installs the app and signs in with their own work account. Their company appears automatically, or they paste the folder link from the admin's **Invitation message**.

## How the data works (and its limits)

- **One file per person per device.** Every change made on a phone is appended to that phone's own file in the company folder (`ava-journal-<user>-<device>.json`). Because phones never write to each other's files, there are no overwrite conflicts. Every device reads all the files and replays them through the same rules, so everyone ends up with the same data. A change that breaks a rule is dropped on every device and shown in **Audit log**. For example, a plan edited after the manager approved it.
- **Offline first.** Everything works without internet. Changes wait on the phone, and the header shows a cloud icon until they upload.
- **When the app syncs:**
  - when it opens;
  - every hour while it is open;
  - from the **Sync** button;
  - in the background, when the phone allows it.

  Android and iOS decide when background work runs (battery saver, how often the app is used), so the hourly upload is guaranteed only while the app is open. That is why there is a Sync button.
- **Readable copies.** The admin's device writes `Ava CRM - calls.csv`, `accounts.csv`, `cycle plans.csv` and `users.csv` into the folder every hour (and on Sync), so the company can open its data in Excel without the app.
- **No passwords are stored anywhere.** People sign in with Microsoft or Google; the app keeps only a sign-in token in the phone's secure storage. Who belongs to the company is the user list inside the company's data, managed by its admin.
- **Folder access is the boundary.** Anyone the folder is shared with can open its files in their drive, including other teams' calls. The app only shows each person their own scope (rep, team, region), but the files themselves are not hidden. Share the folder only with the company's own staff.
  - Edits made to someone else's file directly in the drive are detected and ignored when the drive reports who changed the file. Google Drive and work OneDrive/SharePoint report this; personal OneDrive does not.
  - Removing a person: switch them to inactive in Users & roles (their later changes are refused), and remove them from the folder's sharing.
- **Licences.** Your approval server signs each licence. The app checks the signature with the built-in public key, so a licence cannot be faked by editing a file or pointing the app at another server.
  - Each licence lasts at most 14 days and renews automatically while the subscription is active.
  - After a revoke or expiry, phones become read-only within 14 days, even if they stay offline.
  - Data is never deleted; it stays in the company's drive.
- **Size.** Every device downloads every journal. That suits teams of up to a few hundred people for the first year or so. Larger companies will need periodic compaction into a snapshot file (not built yet).

## Building the app yourself

```bash
npm install
npm test && npm run typecheck
# web build for the site:
AVA_WEB_BASE=/AvaCRM/app EXPO_PUBLIC_AVA_LICENSE_PUBKEY=<public key> npx expo export --platform web
# Android:
EXPO_PUBLIC_AVA_LICENSE_PUBKEY=<public key> npx eas-cli build -p android --profile apk
```

Client IDs can also be baked in with `EXPO_PUBLIC_MS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` and `EXPO_PUBLIC_MS_TENANT`. Values baked in this way take precedence over `app-config.json`.
