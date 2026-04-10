# Standalone Firebase project (AEP Orchestration Lab)

This repo can be deployed as its **own** Firebase project so it does not touch your other Firebase apps.

## What gets deployed

- **Hosting** (`web/`): full lab including `content-decision-live.html`, `index.html`, etc.
- **Cloud Functions (2nd gen)** in `functions/`:
  - **`aepProxy`** — `POST /api/aep` → Adobe IMS + `platform.adobe.io` (same contract as `proxy_server.py`).
  - **`webhookListenerProxy`** — `GET /api/webhook-listener` → allowlisted webhook listener host only.

Rewrites in `firebase.json` map those paths on your Hosting domain to the functions.

## Prerequisites

1. **Firebase CLI**: `npm install -g firebase-tools`
2. **Google account** with access to create a Firebase project.
3. **Blaze (pay-as-you-go)** on that project — required for Functions that call external APIs (Adobe, webhook listener).
4. **Adobe I/O** credentials with scopes that include **Profile / UPS** (and whatever else you call via the lab).

## One-time setup

### 1. Create a new Firebase project

In [Firebase Console](https://console.firebase.google.com/) → Add project → note the **Project ID**.

### 2. Point this repo at that project

Edit **`.firebaserc`** and replace `YOUR_FIREBASE_PROJECT_ID` with your real project ID, or run:

```bash
firebase use --add
```

and choose the new project.

### 3. Define secrets (Functions)

From the **repo root**:

```bash
firebase functions:secrets:set ADOBE_CLIENT_ID
firebase functions:secrets:set ADOBE_CLIENT_SECRET
firebase functions:secrets:set ADOBE_IMS_ORG
firebase functions:secrets:set ADOBE_SCOPES
```

Use the same values you use locally with `adobe-ims-auth` / your I/O integration.  
`ADOBE_SCOPES` is the full space-separated scope string (paste as one line).

### 3b. Sandbox name (Platform API)

**`aepProxy`** always sends **`x-sandbox-name`**. The default baked in at deploy is **`apalmer`** (see **`DEFAULT_ADOBE_SANDBOX`** in `functions/index.js`).

To use another sandbox without editing the file, deploy with an environment variable set in your shell:

```bash
ADOBE_SANDBOX_NAME=your-sandbox-technical-name firebase deploy --only functions:aepProxy
```

That value is stored on the Cloud Run revision as **`ADOBE_SANDBOX_NAME`**. A later `firebase deploy` without the variable uses the default from code again unless you keep exporting it.

### 4. Install function dependencies

```bash
cd functions && npm install && cd ..
```

### 5. Deploy

```bash
firebase deploy --only functions,hosting
```

First deploy can take several minutes.

### 6. Open the app

After deploy, opening **`https://<project-id>.web.app/`** (site root) **redirects** to **`/profile-viewer/home.html`** — the colleague Profile Viewer dashboard (static copy under **`web/profile-viewer/`**).

- **Experience Decisioning lab (original):** `https://<project-id>.web.app/index.html`
- **Content decision (simple):** `https://<project-id>.web.app/content-decision-live.html`

After changing Profile Viewer files under **`web/profile-viewer/`**, optionally
update the vendored prototype mirror (for local Express) with:

```bash
npm run sync-profile-viewer-ui
```

**Note:** On Hosting, Profile Viewer pages are **static only**. Calls to **`/api/profile`** and other Express routes still require **`npm run profile-viewer`** locally (or your own backend). **`POST /api/aep`** and **`/api/webhook-listener`** continue to work via Cloud Functions.

Ensure your **Experience event** Cloud Run URL still allows **CORS** from that Hosting origin (`https://<project-id>.web.app` and the `firebaseapp.com` host if you use it).

## Optional: custom webhook listener URL

By default the proxy uses the same listener host as the Python server. To override, set the env var on **`webhookListenerProxy`** in Google Cloud Console (Cloud Run service for that function) — variable name **`WEBHOOK_LISTENER_URL`** — to an **HTTPS** URL whose **hostname** is still the allowlisted host in `functions/index.js`, or change the allowlist in code and redeploy.

## Deploy only these functions later

```bash
firebase deploy --only "functions:aepProxy,functions:webhookListenerProxy,hosting"
```

## Local emulators (optional)

Secrets must be available to the emulator (see Firebase docs). Easiest path for Adobe is often to test against **deployed** functions and Hosting preview channel.

## Region

Functions are set to **`us-central1`** in `functions/index.js` and `firebase.json`. Change both if you standardize on another region.
