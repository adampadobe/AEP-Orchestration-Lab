# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

AEP Orchestration Lab — a Firebase-hosted internal tool for Adobe Experience Platform architects and engineers. It provides a Profile Viewer dashboard, Experience Decisioning lab, Architecture diagram editor, and webhook/streaming testing tools. Deployed to Firebase project `aep-orchestration-lab`.

## Commands

```bash
# Local dev — Express prototype of Profile Viewer (mirrors web/profile-viewer/)
npm run profile-viewer

# Install dependencies for local Express prototype
npm run profile-viewer:install

# After editing web/profile-viewer/, sync to vendored Express mirror
npm run sync-profile-viewer-ui

# Guard hosted routes: journey-arbitration.html redirect + journey-arbitration-v2 + decisioning-overview-v2 (run before deploy if profile-viewer changed)
npm run verify:profile-viewer-routes

# Build the React/Vite Experience Decisioning Playground sub-app
npm run build:edp

# Validate architecture logo taxonomy tags
npm run validate:architecture-logos-tags

# Validate ecosystem vendor logo index
npm run validate:ecosystem-vendor-index

# Deploy (from repo root — always commit and push first)
npx -y firebase-tools@latest deploy --only functions,hosting
npx -y firebase-tools@latest deploy --only hosting
npx -y firebase-tools@latest deploy --only functions

# Cloud Functions local emulator
cd functions && npm run serve

# Run E2E architecture line bend test
npm run test:arch-line-e2e
```

Node.js 22 (LTS) is required — pinned in `.nvmrc`. Run `nvm use` before `npm install` or deploy.

## Architecture

```
Browser → Firebase Hosting (web/)
              │
              ├── /profile-viewer/*   Static HTML/CSS/JS dashboard
              ├── /index.html         Experience Decisioning lab
              └── /api/*  ──────────▶ Cloud Functions (functions/)
                                          └──▶ Adobe IMS + platform.adobe.io
```

**`web/`** — Firebase Hosting root. Vanilla HTML/CSS/JS, no build step, no framework. All dashboard pages are in `web/profile-viewer/`. The Experience Decisioning Playground at `web/profile-viewer/experience-decisioning-playground/` is a React + Vite sub-app that builds into `web/profile-viewer/experience-decisioning/`.

**`functions/`** — Firebase Cloud Functions v2 (Node 22). `index.js` is the thin export layer (~2500 LOC); complex logic lives in `*Service.js` modules. All functions use `onRequest`, region `us-central1`, and the shared `aepHeaders()` helper for IMS token caching. Every `/api/*` route is a rewrite in `firebase.json` pointing to a named function.

**`aep-prototypes/AEP Profile/03 Profile Viewer/public/`** — a vendored Express mirror of `web/profile-viewer/`. **`web/profile-viewer/` is canonical.** Run `npm run sync-profile-viewer-ui` after editing there; never sync in the reverse direction.

## Git workflow

Before substantive edits:
1. `git fetch origin`
2. If behind `origin/main`: `git pull --ff-only origin main` (stash WIP first if needed)
3. On a feature branch: rebase or merge `origin/main` in

Immediately before `git push`: fetch and integrate again if anyone else may have pushed.

Ship order: **commit → push → deploy**. Never deploy uncommitted work. Never force-push `main`.

Upstream: `https://github.com/adampadobe/AEP-Orchestration-Lab`

## Light / dark theming — critical rules

Every UI change must work in both themes. The system uses `html[data-aep-theme="dark"]` set by an inline IIFE in `<head>` (avoids flash), toggled by `aep-theme.js`, stored in `localStorage` as `aepTheme`.

**Always use `--dash-*` CSS custom properties for colors.** Never hardcode hex values. Key tokens: `--dash-bg`, `--dash-surface`, `--dash-surface-alt`, `--dash-sidebar`, `--dash-border`, `--dash-text`, `--dash-text-secondary`, `--dash-muted`, `--dash-blue`, `--dash-input-bg`, `--dash-input-border`, `--dash-hover`, `--dash-shadow`, `--dash-radius` (16px), `--dash-radius-sm` (12px), plus semantic sets for success/error/warning/info.

Light-mode tokens are defined on `body.home-dashboard-concierge` in `home.css`. Dark-mode overrides redefine the same properties under `html[data-aep-theme='dark'] body.home-dashboard-concierge` in `aep-theme.css`. **`aep-theme.css` must always load last** among stylesheets.

`web/index.html` and `web/edge-test.html` use a separate `data-theme="dark"` attribute and inline token blocks — follow their own pattern when editing those files.

## Adding a new profile-viewer page

1. Copy an existing page (e.g. `consent.html`) as template
2. Include the early-paint IIFE in `<head>` before any stylesheets:
   ```html
   <script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');if(localStorage.getItem('aepSidebarCollapsed')==='1')d.setAttribute('data-sidebar-collapsed','');}catch(e){}})();</script>
   ```
3. Load stylesheets: `style.css` → feature CSS → `home.css?v=YYYYMMDD` → `aep-theme.css?v=YYYYMMDD`
4. Set `<body class="my-feature-page home-dashboard-concierge">`
5. Use the dashboard shell: `div.dashboard-shell > aside.dashboard-sidebar + div.dashboard-main-wrap > header.dashboard-topbar + main.dashboard-main`
6. Load `aep-lab-nav.js` and `aep-theme.js defer` at end of `<body>`
7. If the page calls an API: add a rewrite to `firebase.json` and export the function from `functions/index.js`

## Adding a new Cloud Function

```js
exports.myNewProxy = onRequest({
  region: REGION,              // always 'us-central1'
  secrets: PROFILE_FN_SECRETS,
  invoker: 'public',
  environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
}, async (req, res) => { /* set CORS headers, proxy to platform.adobe.io */ });
```

Add the matching rewrite to `firebase.json` with `"region": "us-central1"`. Region must match in both places or `/api/*` calls 404.

## Credentials

**Never commit `.env` files** — they are gitignored. For local dev, credentials resolve in this order (later wins):
1. `~/.config/adobe-ims/credentials.env` (recommended)
2. `.env` at repo root
3. `aep-prototypes/AEP Profile/00 Adobe Auth/.env`
4. `.env` in current working directory

Production secrets are set via `firebase functions:secrets:set` and accessed via `defineSecret()` — never hardcoded.

## Hard rules

- No hardcoded hex colors in CSS or inline styles — `var(--dash-*)` only
- No CSS frameworks (no Tailwind, Bootstrap, etc.)
- No `prefers-color-scheme` — theme is explicit via localStorage
- Do not edit `firestore.rules` to allow client reads/writes — all Firestore access goes through Admin SDK in functions
- Do not hardcode Firebase project ID in JS/HTML — use relative `/api/...` paths
- Do not delete or rename body class `home-dashboard-concierge`
- Do not skip the early-paint IIFE in new pages

## Further reading

- `CONTRIBUTING.md` — full detail on all patterns above
- `docs/COLLEAGUE_PROFILE_VIEWER.md` — local Express setup, OAuth, sandbox selection
- `docs/FIREBASE_STANDALONE_DEPLOY.md` — full deploy walkthrough with secrets
- `docs/DECISIONING_APIS.md` — Adobe Experience Decisioning API reference
- `docs/EDGE_TESTING.md` — Edge Network / Web SDK testing
