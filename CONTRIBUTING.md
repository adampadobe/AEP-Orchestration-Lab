# Contributing to AEP Orchestration Lab

Welcome. This document explains how the project is structured, the design patterns
we rely on, and the rules you must follow so your changes work in both
**light mode** and **dark mode** without breaking the rest of the app.

Read this fully before making your first change.

---

## Table of contents

1. [Collaboration, Git, and environment](#collaboration-git-and-environment)
2. [Commit messages (GitHub handle prefix)](#commit-messages-github-handle-prefix)
3. [Architecture overview](#architecture-overview)
4. [Directory map](#directory-map)
5. [Light / dark theming system (critical)](#light--dark-theming-system)
6. [Adding a new page](#adding-a-new-page)
7. [CSS rules and conventions](#css-rules-and-conventions)
8. [Cloud Functions patterns](#cloud-functions-patterns)
9. [Credentials, secrets and .env files](#credentials-secrets-and-env-files)
10. [Change workflow (mandatory)](#change-workflow-mandatory)
11. [Deployment](#deployment)
12. [Things you must never do](#things-you-must-never-do)

---

## Collaboration, Git, and environment

Upstream is **`https://github.com/adampadobe/AEP-Orchestration-Lab`** (`origin`). Treat GitHub as the source of truth. Use **Phase A** at the start of a substantive work session, **Phase B** immediately before every `git push`, **and Phase C** immediately before every `firebase deploy`, so you do not build or deploy on stale `main` and you do not silently overwrite a teammate's hosted assets.

> **Why three phases (and not two)?** `firebase deploy --only hosting` ships whatever is on YOUR local disk under `web/`, NOT what is on `origin/main`. If a teammate pushes between your `git push` and your `firebase deploy`, your deploy will silently overwrite their hosted assets even though `git` itself stayed clean. Phase C is the only protection.

### Phase A — start of session (before substantive edits)

1. `git fetch origin`
2. `git status` — if you are **behind** `origin/main`, update before continuing.
3. On **`main`**: `git pull --ff-only origin main`. If Git refuses because of local changes: `git stash push -m "wip"`, pull, then `git stash pop`.
4. On a **feature branch**: merge or rebase **`origin/main`** so your branch includes the latest shared commits.

**Cursor:** **`.cursor/skills/sync-with-origin-main/SKILL.md`** encodes this workflow for agents. **`.cursor/rules/sync-origin-main.mdc`** is the short workspace reminder.

### Phase B — immediately before `git push`

Someone else may have merged while you were working.

1. `git fetch origin` again.
2. If you are behind `origin/main`, integrate (`git pull --ff-only origin main` on `main`, or rebase/merge your branch onto current `origin/main`) and resolve conflicts **before** `git push`.

If **`git push` is rejected**, do **not** force-push to **`main`**. Pull or rebase from `origin`, fix conflicts, then push. For other repositories, the **github-git-workflow** Cursor skill describes the same habits.

### Phase C — immediately before `firebase deploy`

This is the most often forgotten phase and the most dangerous. Even if your `git push` succeeded a minute ago, a teammate may have pushed in the meantime — and `firebase deploy --only hosting` does not consult Git, it just ships whatever is on your local disk.

1. `git fetch origin` again.
2. `git status` — must show `Your branch is up to date with 'origin/main'`.
3. If you are behind: `git pull --ff-only origin main` (or rebase your feature branch onto `origin/main`).
4. **Rebuild any vendored sub-apps** so the deploy carries the teammate's pulled source, not your stale committed build output:
   - `npm run build:edp` — if their commit touched `web/profile-viewer/experience-decisioning-playground/`.
   - `npm run build:eds-quickstart` — if their commit touched the `tools/eds-quickstart` submodule pointer.
5. Re-run `npm run verify:profile-viewer-routes` if `web/profile-viewer/` was touched by either side.
6. **Only then** run `firebase deploy --only hosting` (and/or `--only functions`).

**Cursor:** **`.cursor/rules/sync-origin-main.mdc`** and **`.cursor/rules/ship-git-and-firebase.mdc`** encode all three phases as `alwaysApply: true` so any agent in this workspace is required to follow them on every commit-and-deploy cycle.

### Node.js

| Location | Version |
|----------|---------|
| **Target / CI** | **Node.js 22** (LTS), pinned in **`.nvmrc`** |
| **`functions/package.json`** | `"engines": { "node": "22" }` — matches **Firebase Cloud Functions** (2nd gen) on deploy |
| **Root `package.json`** | `"engines": { "node": ">=22 <26", "npm": ">=10" }` — keep local Node in this range |

Install [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) (or another tool that reads `.nvmrc`). In the repo root run `nvm install` / `nvm use` (or `fnm install` / `fnm use`). Confirm **`node -v`** reports **`v22.x.x`**.

If `npm install` prints **`EBADENGINE`** under **`functions/`** because your global Node is too new, switch to **22** before **`npm ci`**, **`npm install`**, or **`firebase deploy --only functions`**.

### Continuous integration

The **Validate** workflow (`.github/workflows/validate.yml`) installs Node from **`.nvmrc`** and runs **`npm ci`** in **`functions/`** on pull requests so dependencies install cleanly on the pinned version. It also runs **`npm run verify:profile-viewer-routes`** so preserved Decisioning pages (see [Preserved Decisioning Profile Viewer routes](#preserved-decisioning-profile-viewer-routes)) are not accidentally removed.

### Profile Viewer UI — canonical path

Firebase Hosting serves static files from **`web/`**. The lab nav, themes, and assets under **`web/profile-viewer/`** are **canonical**. The Express prototype at **`aep-prototypes/AEP Profile/03 Profile Viewer/public/`** is a **mirror**: after you edit **`web/profile-viewer/`**, run **`npm run sync-profile-viewer-ui`** (see [Sync between prototypes and hosting](#sync-between-prototypes-and-hosting)). Running sync **from prototype → `web/`** in the wrong direction has overwritten Hosting in the past.

### Preserved Decisioning Profile Viewer routes

These hosted paths are part of the lab surface and must stay in **`web/profile-viewer/`** on **`main`** (with nav + Global values wiring intact). Do **not** remove or orphan them without an explicit product decision and a redirect or replacement plan:

| Path on Hosting | Canonical files |
|-----------------|-------------------|
| `/profile-viewer/journey-arbitration.html` | `journey-arbitration.html` only — **redirect stub** to `journey-arbitration-v2.html` (legacy `.js` / `.css` removed) |
| `/profile-viewer/journey-arbitration-v2.html` | `journey-arbitration-v2.html`, `journey-arbitration-v2.css`, `journey-arbitration-v2.js`, `journey-arbitration-v2-iframe-bridge.css`, `ajo-decisioning-pipeline-v8-demo.html` (iframe embed) |

**Hard-deleted (do not restore):**

- `/profile-viewer/decisioning-overview-v2.html` — removed on Apr 28, 2026 by explicit product decision. Bookmark URLs accepted to 404. The route verifier asserts the file does **not** exist, the nav entry is **not** present in `aep-lab-nav.js`, and the `decisioningOverviewV2` Global values hide-key is **not** present in `global-settings.html`. CI fails if any of these are reintroduced.

**Guardrail:** run **`npm run verify:profile-viewer-routes`** after substantive **`web/profile-viewer/`** edits and before **`firebase deploy --only hosting`** (or combined functions+hosting). The same check runs in **GitHub Actions** (`validate.yml`) on push/PR to `main`, so a bad merge that deletes these files should fail CI before merge.

### Architecture diagram (`aep-architecture-apps`) — logos & martech taxonomy

The interactive SVG diagram uses **`data/architecture-logos.json`** for the icon/logo picker. Optional **`tags`** on each entry are validated against **`data/martech-taxonomy-reference.json`** (`npm run validate:architecture-logos-tags`, also in CI). Ecosystem vendor SVGs live under **`web/profile-viewer/images/ecosystem-vendor-logos/`**; **`vendorIndex`** in the taxonomy file must match those files (`npm run validate:ecosystem-vendor-index`). Regenerate tags after bulk catalog edits with **`python3 scripts/tag-architecture-logos.py`**.

**Interop:** Full layout round-trip uses **Download JSON** / **Import JSON**. The smaller **stack summary** format is defined in **`data/diagram-interop.json`** and implemented in **`web/profile-viewer/diagram/interop.js`** (export includes **`catalogTags`** when asset paths match the logo catalog). **Import stack summary** adds vendor/icon boxes only; it does not restore connectors or canonical node positions.

---

## Commit messages (GitHub handle prefix)

We have had **ambiguous overwrites** when multiple people ship hosting, merge built assets, or push submodule updates. Make ownership obvious in **`git log --oneline`** and in GitHub history before you open a commit:

1. **Start the subject line** with your **GitHub username in brackets**, then a space, then the summary — for example: **`[apalmer] EDS quickstart: hide duplicate next-steps when repo exists`**. Use the handle people recognize on **`https://github.com/adampadobe/AEP-Orchestration-Lab`** (not an email local-part unless it matches that handle).
2. Keep **`git config user.name`** and **`git config user.email`** accurate; the bracket prefix is an extra signal when scanning history, when squashing, or when author metadata is generic across machines.
3. **Submodule repositories** (for example **`tools/eds-quickstart`**): use the **same `[handle]` prefix** on commits in the submodule so the parent repo’s submodule pointer traces to a human-readable subject.
4. **Automation** (bots, scripted commits): use a stable bracket tag such as **`[bot]`** or the service name in the same style.

**Optional:** install the repo’s commit template once so your editor opens with a reminder (replace the handle each time, or keep your personal clone configured with your handle baked in):

```bash
git config commit.template .gitmessage
```

The template file **`.gitmessage`** lives at the repository root next to this document.

---

## Architecture overview

```
Browser ──▶ Firebase Hosting (web/)
                │
                ├── /profile-viewer/*   Static HTML/CSS/JS dashboard
                ├── /index.html         Experience Decisioning lab
                └── /api/*  ──────────▶ Cloud Functions (functions/)
                                            │
                                            └──▶ Adobe IMS + platform.adobe.io
```

| Layer | Tech | Location |
|-------|------|----------|
| Static UI | Vanilla HTML / CSS / JS (no framework, no bundler) | `web/` |
| Cloud Functions | Node 22, Firebase Functions v2 (`onRequest`) | `functions/` |
| Firestore | Admin SDK only — client rules deny all | `firestore.rules` |
| Local dev server | Express (vendored) | `aep-prototypes/AEP Profile/03 Profile Viewer/` |
| Python lab / proxy | Flask-style proxy | `proxy_server.py`, `scripts/` |
| CI | GitHub Actions — Python compile + JSON validate | `.github/workflows/validate.yml` |

Firebase project ID: **`aep-orchestration-lab`** (see `.firebaserc`).

The root `/` redirects 302 to `/profile-viewer/home.html`.

---

## Directory map

```
.
├── web/                          ← Firebase Hosting root
│   ├── profile-viewer/           ← Main dashboard app (static)
│   │   ├── home.css              ← Light-mode --dash-* tokens + layout
│   │   ├── aep-theme.css         ← Dark-mode --dash-* overrides + structural
│   │   ├── aep-theme.js          ← Theme toggle logic (AepTheme API)
│   │   ├── aep-lab-nav.js        ← Shared sidebar navigation + theme button
│   │   ├── style.css             ← Base typography / resets
│   │   ├── *.css                 ← Per-feature sheets (consent, audit, etc.)
│   │   ├── *.html                ← Dashboard pages
│   │   ├── *.js                  ← Page-specific JS modules
│   │   └── images/               ← Static assets
│   ├── index.html                ← Decisioning lab (self-contained theme)
│   └── edge-test.html            ← Edge testing page
│
├── functions/                    ← Firebase Cloud Functions (Node 22)
│   ├── index.js                  ← All exported HTTP functions
│   ├── package.json              ← Dependencies (firebase-functions v6)
│   └── *Service.js               ← Service modules
│
├── aep-prototypes/               ← Vendored upstream (kirkside-bit/cursor)
│   └── AEP Profile/
│       ├── 00 Adobe Auth/        ← Shared IMS auth module
│       └── 03 Profile Viewer/    ← Express app; public/ mirrors web/profile-viewer/
│           └── public/           ← synced from web/profile-viewer/ (npm run sync-profile-viewer-ui)
│
├── docs/                         ← Operational docs (deploy, decisioning, etc.)
├── scripts/                      ← Python/shell utilities
├── samples/                      ← Sample JSON payloads
├── schemas/                      ← XDM schema samples
├── firebase.json                 ← Hosting / Functions / Firestore config
├── firestore.rules               ← Deny-all client rules
└── .gitignore
```

### Sync between prototypes and hosting

**Canonical Profile Viewer static UI is `web/profile-viewer/`** (Firebase Hosting serves `web/`).

The vendored Express prototype mirrors that tree under
`aep-prototypes/AEP Profile/03 Profile Viewer/public/`. After you change sidebar
icons, `aep-lab-nav.js`, CSS, or images under **`web/profile-viewer/`**, run:

```bash
npm run sync-profile-viewer-ui
```

This rsyncs **`web/profile-viewer/` → prototype `public/`** so local `npm run profile-viewer`
matches what ships on Hosting. Do **not** assume the prototype folder is the
source of truth; syncing the old direction overwrote Hosting assets and caused
nav icons to “revert.”

---

## Light / dark theming system

This is the most important section. Every UI change you make must work in
**both** light and dark mode.

### How it works

1. **localStorage key** `aepTheme` stores `'dark'` or `'light'` (default).
2. An **inline IIFE** in each page's `<head>` reads that value and sets
   `html[data-aep-theme="dark"]` **before first paint** (avoids flash).
3. **`aep-theme.js`** exposes `window.AepTheme` for toggling, syncing labels,
   and listening to `storage` events for cross-tab sync.
4. The sidebar (built by `aep-lab-nav.js`) injects a theme toggle button.

### Where tokens live

| File | Contains | Selector scope |
|------|----------|----------------|
| `home.css` | **Light-mode** `--dash-*` variables | `body.home-dashboard-concierge` |
| `aep-theme.css` | **Dark-mode** `--dash-*` overrides + structural rules | `html[data-aep-theme='dark'] body.home-dashboard-concierge` |

Light-mode values are defined directly on the body class. Dark-mode redefines
the same custom properties under the `data-aep-theme` attribute selector,
so components using `var(--dash-*)` automatically switch.

### The `--dash-*` token palette

These are the tokens you **must** use for colors. Never hardcode hex values
for anything that needs to change between themes.

| Token | Light | Dark | Use for |
|-------|-------|------|---------|
| `--dash-bg` | `#f0f0f2` | `#0f1114` | Page background |
| `--dash-surface` | `#ffffff` | `#181b21` | Cards, panels, modals |
| `--dash-surface-alt` | `#f8f9fa` | `#14161b` | Alternating rows, subtle contrast |
| `--dash-sidebar` | `#eae8ee` | `#12151a` | Sidebar background |
| `--dash-border` | `#e6e4ea` | `#2a3038` | All borders |
| `--dash-text` | `#2c2c2c` | `#e8eaed` | Primary text |
| `--dash-text-secondary` | `#555` | `#9aa0a8` | Secondary / label text |
| `--dash-muted` | `#6e6e73` | `#9aa0a8` | Muted / disabled text |
| `--dash-blue` | `#1473e6` | `#4b9fff` | Primary accent, links, active items |
| `--dash-input-bg` | `#fff` | `#0f1114` | Input / select backgrounds |
| `--dash-input-border` | `#ced4da` | `#2a3038` | Input borders |
| `--dash-hover` | `#f3f5f7` | `rgba(255,255,255,0.04)` | Hover backgrounds |
| `--dash-code-bg` | `#f0f0f0` | `#0f1114` | Code blocks |
| `--dash-success-bg/border/text` | green-tinted | green-tinted | Success alerts |
| `--dash-error-bg/border/text` | red-tinted | red-tinted | Error alerts |
| `--dash-warning-bg/border/text` | amber-tinted | amber-tinted | Warnings |
| `--dash-info-bg/border/text` | blue-tinted | blue-tinted | Info banners |
| `--dash-hero-grad` | pastel gradient | dark gradient | Hero banner background |
| `--dash-shadow` | light shadow | dark shadow | Card resting shadow |
| `--dash-shadow-hover` | deeper shadow | deeper shadow | Card hover shadow |
| `--dash-radius` | `16px` | (inherited) | Card border-radius |
| `--dash-radius-sm` | `12px` | (inherited) | Smaller element radius |

### Rules for using tokens

```css
/* CORRECT — adapts to theme automatically */
.my-card {
  background: var(--dash-surface);
  color: var(--dash-text);
  border: 1px solid var(--dash-border);
  border-radius: var(--dash-radius-sm);
  box-shadow: var(--dash-shadow);
}

/* WRONG — hardcoded colors break dark mode */
.my-card {
  background: #ffffff;
  color: #333;
  border: 1px solid #ddd;
}
```

If you need a color that does not map to an existing token, **add a new
`--dash-*` variable** in both `home.css` (light) and `aep-theme.css` (dark)
rather than using a raw hex value.

### Structural dark overrides

Some elements need more than a variable swap (gradients, opacity changes,
image overlays). Put these in `aep-theme.css` under:

```css
html[data-aep-theme='dark'] body.home-dashboard-concierge .your-selector {
  /* structural override */
}
```

### The decisioning lab (web/index.html) uses a different attribute

`web/index.html` and `web/edge-test.html` use `data-theme="dark"` (not
`data-aep-theme`). They have inline `<style>` blocks with their own `:root`
and `[data-theme="dark"]` tokens. Both systems sync via localStorage keys
`aepTheme` and `aep-decisioning-theme`, so the user's preference carries
across pages.

If you touch those pages, follow **their** pattern (`data-theme`, inline
tokens). If you work on anything in `web/profile-viewer/`, follow the
`data-aep-theme` + `--dash-*` pattern.

---

## Adding a new page

### Profile Viewer dashboard page (most common)

1. **Copy an existing page** (e.g. `consent.html`) as your starting template.

2. **Include the early-paint IIFE** in `<head>` before any stylesheets:

   ```html
   <script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');if(localStorage.getItem('aepSidebarCollapsed')==='1')d.setAttribute('data-sidebar-collapsed','');}catch(e){}})();</script>
   ```

3. **Load stylesheets in the standard order:**

   ```html
   <link rel="stylesheet" href="style.css">
   <!-- your feature CSS if any -->
   <link rel="stylesheet" href="home.css?v=YYYYMMDD">
   <link rel="stylesheet" href="aep-theme.css?v=YYYYMMDD">
   ```

   `aep-theme.css` must always be **last** so dark overrides win.

4. **Set the body class:** `home-dashboard-concierge` (required for tokens).
   Add a page-specific class too (e.g. `my-feature-page`).

   ```html
   <body class="my-feature-page home-dashboard-concierge">
   ```

5. **Use the dashboard shell markup:**

   ```html
   <div class="dashboard-shell">
     <aside class="dashboard-sidebar" aria-label="Primary"></aside>
     <div class="dashboard-main-wrap">
       <header class="dashboard-topbar">...</header>
       <main class="dashboard-main">
         <!-- your content -->
       </main>
     </div>
   </div>
   ```

6. **Load shared scripts at the end of `<body>`:**

   ```html
   <script src="aep-lab-nav.js"></script>
   <script src="aep-theme.js" defer></script>
   ```

7. **Use `--dash-*` tokens** in all your CSS. No hardcoded colors.

8. **Test in both themes** — toggle dark mode in the sidebar and verify
   everything is readable and correctly contrasted.

9. **Add to the sidebar navigation** if needed (edit `aep-lab-nav.js`).

10. **If the page calls an API**, add the rewrite to `firebase.json` and
    the function export to `functions/index.js`.

### Feature-specific CSS

Create a separate `.css` file (e.g. `my-feature.css`) for your page. Do not
dump styles into `home.css` or `style.css`. Your feature CSS should:

- Only use `var(--dash-*)` for colors, backgrounds, borders.
- Be scoped to your page's body class or a feature container class.
- If dark mode needs structural overrides (not just color swaps), put those
  in `aep-theme.css` under the standard selector pattern.

---

## CSS rules and conventions

1. **No CSS frameworks.** No Tailwind, Bootstrap, etc. We use vanilla CSS with
   custom properties.

2. **All colors must use `--dash-*` tokens.** The only exception is brand
   colors in self-contained demo components (e.g. a charity logo) where the
   color is intentionally theme-independent.

3. **No `!important` unless overriding a third-party or legacy rule.** If you
   reach for `!important`, document why.

4. **Font:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
   — loaded via Google Fonts. Don't add other fonts without discussion.

5. **Spacing:** Use `rem` units. Common values: `0.5rem`, `0.75rem`, `1rem`,
   `1.25rem`, `1.5rem`, `2rem`.

6. **Border radius:** Use `var(--dash-radius)` (16px) for cards/panels,
   `var(--dash-radius-sm)` (12px) for smaller elements, `8px–10px` for
   buttons and inputs.

7. **Shadows:** Use `var(--dash-shadow)` and `var(--dash-shadow-hover)`.
   Don't invent custom shadows.

8. **No inline `style=""` for colors.** Layout properties (flex, gap, margin)
   in inline styles are fine, but colors/backgrounds must come from CSS classes
   using tokens.

9. **Stylesheet load order matters.** `aep-theme.css` is always last.

---

## Cloud Functions patterns

All functions live in `functions/index.js` and use Firebase Functions **v2**
(`onRequest` from `firebase-functions/v2/https`).

### Adding a new function

1. Define secrets if it calls Adobe APIs:

   ```js
   const PROFILE_FN_SECRETS = [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES];
   ```

2. Use the shared `aepHeaders()` helper for Adobe API calls (handles IMS
   token caching and x-sandbox-name).

3. Export with consistent options:

   ```js
   exports.myNewProxy = onRequest({
     region: REGION,            // 'us-central1'
     secrets: PROFILE_FN_SECRETS,
     invoker: 'public',
     environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
   }, async (req, res) => {
     // set CORS headers, then proxy to platform.adobe.io
   });
   ```

4. Add the rewrite in `firebase.json`:

   ```json
   {
     "source": "/api/my-endpoint",
     "function": { "functionId": "myNewProxy", "region": "us-central1" }
   }
   ```

5. Region is always **`us-central1`**. Change both code and `firebase.json`
   if the project ever moves regions.

### Service modules

Complex logic goes into a separate `*Service.js` file in `functions/`
(e.g. `schemaViewerService.js`, `consentInfraService.js`).
Keep `index.js` as a thin routing / export layer.

---

## Credentials, secrets and .env files

### What is gitignored

```
.env
*.env
```

**Never commit credentials.** The `.gitignore` blocks `.env` files, but
double-check before every commit.

### Firebase Functions secrets (production)

Set via `firebase functions:secrets:set <NAME>`. The four Adobe secrets are:

- `ADOBE_CLIENT_ID`
- `ADOBE_CLIENT_SECRET`
- `ADOBE_IMS_ORG`
- `ADOBE_SCOPES`

These are accessed in code via `defineSecret()` and `.value()` — never
hardcoded.

### Local development

Credentials resolve in this priority order (later overrides earlier):

1. `~/.config/adobe-ims/credentials.env` (global default — recommended)
2. `.env` at repo root
3. `aep-prototypes/AEP Profile/00 Adobe Auth/.env`
4. `.env` in current working directory
5. `ADOBE_CREDENTIALS_FILE` environment variable

See `docs/COLLEAGUE_PROFILE_VIEWER.md` for full setup instructions.

---

## Change workflow (mandatory)

Every change **must** follow this ordered ritual. Do not skip any step.

| Step | Command / action | Why |
|------|-----------------|-----|
| 1. **Phase A sync** | `git fetch origin && git status` — pull if behind | Don't build on stale `main` (see [Phase A](#phase-a--start-of-session-before-substantive-edits)) |
| 2. **Make changes** | Edit files in `web/` (hosting) or `functions/` | Source of truth for deployed code |
| 3. **Sync prototypes** | `npm run sync-profile-viewer-ui` when you changed `web/profile-viewer/` (copies **→** prototype `public/`) | Keep the vendored Express mirror aligned with Hosting |
| 4. **Verify preserved routes** | `npm run verify:profile-viewer-routes` when you changed `web/profile-viewer/` | Fails if Decisioning **`journey-arbitration.html` redirect**, **journey-arbitration-v2** (and embed), or **eds-quickstart** files or nav wiring are wrong, OR if the hard-deleted **`decisioning-overview-v2.html`** is resurrected (see [Preserved Decisioning Profile Viewer routes](#preserved-decisioning-profile-viewer-routes)) |
| 5. **Commit** | `git add` (focused scope) → `git commit -m "[<github-handle>] …"` (see [Commit messages (GitHub handle prefix)](#commit-messages-github-handle-prefix)) | Atomic, reviewable units; handle prefix makes ownership obvious in history |
| 6. **Phase B sync** | `git fetch origin && git status` — pull/rebase if behind | Don't push on top of a teammate's commit (see [Phase B](#phase-b--immediately-before-git-push)) |
| 7. **Push** | `git push origin <branch>` | GitHub is the audit trail; teammates and CI see your work |
| 8. **Phase C sync** | `git fetch origin && git status` — pull AND rebuild sub-apps if behind | Don't silently overwrite a teammate's hosted assets (see [Phase C](#phase-c--immediately-before-firebase-deploy)) |
| 9. **Deploy** | `firebase deploy --only hosting` and/or `firebase deploy --only functions` | Live site and functions pick up what is on `origin/main` |

> **Never** deploy work you care about before it is **committed and pushed**. **Never** deploy without re-syncing in Phase C — `firebase deploy` does not consult Git, only your local disk under `web/`. See [Collaboration, Git, and environment](#collaboration-git-and-environment) for the full three-phase pull discipline.

---

## Deployment

### Pre-deploy (Phase C — mandatory)

```bash
# 1. Re-sync with origin (a teammate may have pushed since your git push)
git fetch origin
git status                           # MUST show "Your branch is up to date with 'origin/main'"
# If behind:
git pull --ff-only origin main

# 2. Rebuild any vendored sub-apps so the deploy carries pulled source
npm run build:edp                    # if EDP playground source changed upstream
npm run build:eds-quickstart         # if eds-quickstart submodule pointer changed upstream

# 3. Mirror + verify
npm run sync-profile-viewer-ui       # copy web/profile-viewer/ → prototype public/ (keep mirror in sync)
npm run verify:profile-viewer-routes # fail if preserved Decisioning + EDS Quickstart routes are broken
cd functions && npm install && cd ..
```

**Why every step matters:** `firebase deploy --only hosting` ships whatever is on your local disk under `web/`, NOT what is on `origin/main`. Skip step 1 and you may silently overwrite a teammate's hosted assets. Skip step 2 and your deploy will carry stale built artefacts that don't match the freshly-pulled source.

### Deploy

```bash
firebase deploy --only functions,hosting
```

Or selectively:

```bash
firebase deploy --only hosting
firebase deploy --only functions:aepProxy
```

### CI

GitHub Actions runs on push/PR to `main`:
- Python syntax check on `proxy_server.py` and `scripts/*.py`
- JSON validation on `samples/` and `schemas/`
- **`npm run verify:profile-viewer-routes`** (preserved Decisioning pages under `web/profile-viewer/`)

CI does **not** build or deploy functions. Deployment is manual.

---

## Things you must never do

| Rule | Why |
|------|-----|
| **Don't hardcode colors in CSS or inline styles** | Breaks dark mode. Use `var(--dash-*)` tokens. |
| **Don't skip the early-paint script in `<head>`** | Users see a bright flash before dark mode applies. |
| **Don't load `aep-theme.css` before `home.css`** | Dark overrides won't have the right specificity. |
| **Don't use `prefers-color-scheme`** | We use explicit user-chosen themes via localStorage, not OS preference. |
| **Don't add new CSS frameworks** | The project is vanilla CSS by design. |
| **Don't commit `.env` files or credentials** | They are gitignored. Never `git add --force` them. |
| **Don't run `firebase deploy` while behind `origin/main`** | `firebase deploy --only hosting` ships local disk under `web/`, NOT what is on `origin/main`. Skipping the Phase C `git fetch` + `git pull --ff-only` will silently overwrite a teammate's hosted assets even though `git` itself stays clean. See [Phase C — immediately before `firebase deploy`](#phase-c--immediately-before-firebase-deploy). |
| **Don't `git push --force` to `main`** | Destroys teammate commits irrecoverably. If your push is rejected, pull/rebase from `origin/main` and try again. |
| **Don't change the `us-central1` region** without updating both `functions/index.js` and every entry in `firebase.json` | Mismatched regions cause 404s on `/api/*` calls. |
| **Don't edit `firestore.rules` to allow client reads/writes** | All Firestore access goes through Admin SDK in functions. |
| **Don't hardcode the Firebase project ID** in JS/HTML | Use relative paths for API calls (`/api/...`). The project ID only appears in `.firebaserc`. |
| **Don't delete or rename `home-dashboard-concierge`** | This body class gates the entire token system. |
| **Don't add `<body>` without the dashboard shell** (sidebar + main wrap) | The sidebar nav and theme toggle won't render. |
| **Don't delete `journey-arbitration.html` (must remain a redirect to v2), `journey-arbitration-v2.*`, `journey-arbitration-v2-iframe-bridge.css`, `ajo-decisioning-pipeline-v8-demo.html`, or their nav / Global values wiring** without a deliberate replacement | Breaks hosted `/profile-viewer/journey-arbitration.html` (bookmark URL) or `/profile-viewer/journey-arbitration-v2.html`; CI runs `npm run verify:profile-viewer-routes` to catch this. |
| **Don't resurrect `decisioning-overview-v2.html`** (file, nav entry, or `decisioningOverviewV2` Global values hide-key) | The page was hard-deleted on Apr 28, 2026 by explicit product decision. The route verifier (`npm run verify:profile-viewer-routes`) asserts it stays gone and CI fails if it is reintroduced. |

---

## Quick checklist for every PR

- [ ] Tested in **light mode** — all text readable, all backgrounds correct
- [ ] Tested in **dark mode** — same checks
- [ ] No hardcoded color hex values in new CSS (only `var(--dash-*)`)
- [ ] Early-paint script present in any new HTML page's `<head>`
- [ ] `aep-theme.css` loaded **last** among stylesheets
- [ ] Body has class `home-dashboard-concierge` (for profile-viewer pages)
- [ ] No `.env` or credential files staged
- [ ] New API routes added to both `functions/index.js` and `firebase.json`
- [ ] `firebase.json` rewrites use `"region": "us-central1"`
- [ ] If you edited **`web/profile-viewer/`**: `npm run verify:profile-viewer-routes` passes (preserved Decisioning routes — see [Preserved Decisioning Profile Viewer routes](#preserved-decisioning-profile-viewer-routes))
- [ ] **Phase A** sync ran before substantive edits (`git fetch origin && git pull --ff-only origin main` if behind)
- [ ] **Phase B** sync ran immediately before `git push` (re-fetched, re-integrated if a teammate had pushed)
- [ ] **Phase C** sync ran immediately before `firebase deploy` (re-fetched, pulled, AND re-ran any `npm run build:edp` / `npm run build:eds-quickstart` if the teammate's commit touched a vendored sub-app)

---

## EDS Quickstart submodule

The **EDS Demo Creator (in development)** entry under the **Demos** sidebar is a
React + Adobe React Spectrum SPA vendored from a fork of Kasper Van Eeghem's
private `vaneeghemk/eds-quickstart` Adobe I/O App Builder project.

- **Fork**: [`adampadobe/eds-quickstart`](https://github.com/adampadobe/eds-quickstart) (our customisations live on `main`).
- **Submodule path**: [`tools/eds-quickstart/`](tools/eds-quickstart/) — outside `web/` so Firebase Hosting never serves source files.
- **Built static output** (committed): `web/profile-viewer/eds-quickstart/{index.html,static/js/main.<hash>.js}`.
- **Wrapper page**: [`web/profile-viewer/eds-quickstart.html`](web/profile-viewer/eds-quickstart.html) — iframes the SPA inside the lab dashboard shell.
- **Build**: `npm run build:eds-quickstart` (initialises submodule on first run, runs the fork's webpack 5 standalone config, rsyncs `dist/` → `web/profile-viewer/eds-quickstart/`).
- **Upstream-promotion workflow**: read [`docs/EDS_QUICKSTART_INTEGRATION.md`](docs/EDS_QUICKSTART_INTEGRATION.md) before merging upstream changes from `vaneeghemk` into our fork.

The fork adds an extra wizard step that injects Adobe Launch (Tags) and/or
Adobe Web SDK (alloy.js) script tags into every newly-created EDS site's
`head.html` via the GitHub Contents API, using the lab's existing
`tagsReactorProxy` (`/api/tags/reactor`) and `eventDatastreamsProxy`
(`/api/events/datastreams`) Cloud Functions. **Do not push the fork's `main`
back to `vaneeghemk/eds-quickstart`** — the upstream push URL inside the
submodule is set to a no-push dummy as a safety net.

---

## Further reading

- `docs/COLLEAGUE_PROFILE_VIEWER.md` — local Express setup, auth, sandbox selection
- `docs/FIREBASE_STANDALONE_DEPLOY.md` — full deploy walkthrough with secrets
- `docs/DECISIONING_APIS.md` — Adobe Experience Decisioning API reference
- `docs/EDGE_TESTING.md` — Edge Network / Web SDK testing
- `docs/EDS_QUICKSTART_INTEGRATION.md` — fork+submodule model, upstream promotion, AEP wiring
- `aep-prototypes/README.md` — vendored prototype overview
