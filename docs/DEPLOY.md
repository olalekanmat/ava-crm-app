# Deploying Ava for a client test

Ava ships as two things:

1. **The server** (`server/`): one Node process that serves the web app *and* the API, storing everything in one SQLite file. Managers' team views need this, because they show data from several reps' devices.
2. **The Android app** (APK): installs on any Android phone. It can sign in to the server, or run the demo without one.

A static web host alone (Netlify, Vercel, S3) can serve `dist/` too, but then only **demo mode** works.

## 1. Deploy the server (web app + API)

Any host that runs a Docker image with a persistent disk works. Two options:

### Option A: Render (simplest, ~$7/month for the disk)

1. Push this folder to a private GitHub repository.
2. In Render: **New → Blueprint**, pick the repository. `render.yaml` creates the `ava` web service with a 1 GB disk at `/data`.
3. When it is live, open **Environment** on the service and copy the generated `DEMO_PASSWORD`.
4. Your URL (e.g. `https://ava-xxxx.onrender.com`) is both the web app and the server address for the phone app.

### Option B: Fly.io, Railway, a VM, or anywhere with Docker

```bash
docker build -t ava .
docker run -d -p 8080:8080 -v ava-data:/data -e DEMO_PASSWORD='choose-one' ava
```

Put it behind HTTPS (the host usually does this). Health check: `GET /api/health`.

### Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | HTTP port |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where `ava.db` lives. **Must be a persistent volume.** |
| `SEED_DEMO` | `true` | Load the fictional demo organisation on first start |
| `DEMO_PASSWORD` | `ava-demo` | Password for the demo users. Set your own for anything public. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | – | Creates this administrator on start if missing |

**Client test with the demo data**: keep `SEED_DEMO=true`, set `DEMO_PASSWORD`, share the four demo logins (see the test guide).

**Client test with the client's own data**: start with `SEED_DEMO=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Sign in as that admin, then under *Import CSV* load users first (SLMs, then FLMs, then reps), then accounts, then products; add a cycle under *Cycles, products & rules*; set each user's temporary password under *Users & roles*.

The demo data and settings are created only on the very first start (empty disk). To start over, stop the server and delete `ava.db` from the data volume.

**Backups**: copy `/data/ava.db` (SQLite) on a schedule; most hosts offer volume snapshots.

## 2. The Android app

The APK is `Ava-1.1.0.apk` (in the project's `exports` folder). It is a release build signed with a development key, which is fine for side-loading to testers:

1. Send the APK (email, Drive, WhatsApp). On the phone, open it and allow *Install unknown apps* when asked.
2. Open Ava. Either **Explore the demo** (no server needed) or sign in: enter the email and password, tap *Server: … change* and enter the server URL from step 1.

To bake the server address in so testers do not type it, and to sign with a proper key, build with EAS (needs a free expo.dev account):

```bash
npx eas-cli@latest login
EXPO_PUBLIC_API_URL=https://your-ava-server.example.com npx eas-cli@latest build -p android --profile apk
```

Use `--profile production` for a Play Store bundle (`.aab`), and `-p ios` for TestFlight (needs an Apple developer account).

## 3. The web app

If you deployed the server, the web app is already at the server URL and signs in against it automatically.

For a demo-only web link without a server: `npm run build:web` and drag the `dist/` folder onto Netlify Drop (or any static host). Configure the host to serve `index.html` for unknown paths (single-page app).

## Before a real launch (not needed for a client test)

- Corporate single sign-on (Azure AD / Okta) instead of passwords.
- Move from one SQLite file to Postgres if you expect more than a few hundred users.
- A proper Android signing key (EAS manages one) and Play Store listing.
- Data-protection review for location data (NDPR / GDPR): Ava only records location at check-in, never in the background.
