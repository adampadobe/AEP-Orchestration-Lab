# Colleague Profile Viewer (kirkside-bit/cursor)

The folder **`aep-prototypes/`** is a vendored copy of [kirkside-bit/cursor](https://github.com/kirkside-bit/cursor.git) (nested `.git` removed so you can commit it in **AEP-Orchestration-Lab**).

The piece you run for **AEP Profile Viewer** is:

**`aep-prototypes/AEP Profile/03 Profile Viewer/`**

It is a **Node.js + Express** app. It calls Adobe **directly** from the server using OAuth credentials (same pattern as Firebase **`aepProxy`**, but with many more routes than we expose in Cloud Functions). It does **not** use `POST /api/aep` today.

## Adobe auth (shared with this repo’s Python lab)

The Profile Viewer’s Node **`00 Adobe Auth`** now loads credentials in the **same order of preference** as **`adobe_ims_auth`** / **`proxy_server.py`**:

1. **`~/.config/adobe-ims/credentials.env`** (global default — recommended)
2. **`.env`** at the **AEP-Orchestration-Lab repo root** (next to `aep-prototypes/`, `functions/`, `web/`)
3. **`aep-prototypes/AEP Profile/00 Adobe Auth/.env`** (overrides root)
4. **`.env`** in the **current working directory** when you start the server (e.g. `03 Profile Viewer/.env`)
5. **`ADOBE_CREDENTIALS_FILE`** if set (path to a `KEY=value` file)

Later sources override earlier keys for the same variable.

**Org id:** use either **`ADOBE_ORG_ID`** (Node + Python) or **`ADOBE_IMS_ORG`** (Firebase secret name) — both are accepted for **`x-gw-ims-org-id`**.

**Sandbox:** set **`ADOBE_SANDBOX_NAME=apalmer`** in whichever file you use (same as you use for Python / mental model for Platform).

You do **not** need a duplicate **`.env`** under **`00 Adobe Auth/`** if your **`~/.config/adobe-ims/credentials.env`** (or repo root **`.env`**) already has the same `ADOBE_*` keys.

### Optional: explicit file only for Profile Viewer

Copy **`00 Adobe Auth/.env.example`** → **`00 Adobe Auth/.env`** only when you want overrides without touching the global file.

### Test auth

```bash
cd aep-prototypes/AEP Profile/00 Adobe Auth
npm run test-auth
```

## Run Profile Viewer locally

From repo root:

```bash
npm run profile-viewer
```

Or manually:

```bash
cd aep-prototypes/AEP Profile/03 Profile Viewer
npm install   # first time
npm start
```

Open **http://localhost:3333/home.html**

### Global sandbox (browser)

Use **Global values** in the sidebar (**`global-settings.html`**) to load sandboxes from AEP and pick one. The choice is stored as **`localStorage['aepGlobalSandboxName']`** and reused on Profile Viewer, Data viewer, Audience, and Profile generation. On Firebase Hosting, the list is loaded via **`POST /api/aep`**; locally it uses **`/api/sandboxes`** if the proxy path is unavailable.

### Dark mode (browser)

Use **Dark mode** / **Light mode** at the bottom of the sidebar (or under **Appearance** on **Global values**). The choice is stored as **`localStorage['aepTheme']`** (`dark` or default light). A short script in the page `<head>` applies the class before paint to reduce flash.

The UI expects port **3333** (see server warning banner if you use another `PORT`).

## Experience Decisioning lab link (sidebar)

Every dashboard page loads **`aep-lab-nav.js`**, which adds **Decisioning lab** to the sidebar.

- **Default** when the viewer runs on **localhost:3333**: opens **`http://localhost:8765/content-decision-live.html`** (same default port as **`python proxy_server.py`** in this repo).
- **Override** in the browser:

  `localStorage.setItem('aepDecisioningLabUrl', 'https://YOUR-PROJECT.web.app/content-decision-live.html')`

  then reload.

- **Firebase Hosting** (if you later serve the lab on the same host as static pages): relative **`/content-decision-live.html`** is used when not on `:3333` localhost.

## Relationship to Firebase Cloud Functions

| Piece | Role |
|-------|------|
| **`functions/` `aepProxy`** | Hosted **`POST /api/aep`** for the **Experience Decisioning** static pages under **`web/`** (IMS + `x-sandbox-name` + `platform.adobe.io`). |
| **Profile Viewer Express** | Full **REST surface** (`/api/profile`, Query Service, schema viewer, etc.) using **`.env`** on your machine (or your own Cloud Run deploy later). |

Putting the whole Express app inside **`firebase functions`** would be a large, separate project (bundle size, timeouts, many routes). The practical split is: **Firebase** for the decisioning lab static UI + **`aepProxy`**; **Node locally** (or Cloud Run) for the Profile Viewer.

## Main lab menu

**`web/index.html`** links to the Profile Viewer home for local testing.

## Updating from upstream

```bash
git clone https://github.com/kirkside-bit/cursor.git /tmp/cursor-upstream
# Compare and merge selected paths into aep-prototypes/
```

Re-apply **`aep-lab-nav.js`** and **`</body>` script tags** if you replace HTML from upstream.
