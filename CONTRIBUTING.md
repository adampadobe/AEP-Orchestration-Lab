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
12. [Version control and rollback](#version-control-and-rollback)
13. [Things you must never do](#things-you-must-never-do)

---

## Collaboration, Git, and environment

Upstream is **`https://github.com/adampadobe/AEP-Orchestration-Lab`** (`origin`). Treat GitHub as the source of truth. Use **Phase A** at the start of a substantive work session, **Phase B** immediately before every `git push`, **and Phase C** immediately before every `firebase deploy`, so you do not build or deploy on stale `main` and you do not silently overwrite a teammate's hosted assets.

> **Why three phases (and not two)?** `firebase deploy --only hosting` ships whatever is on YOUR local disk under `web/`, NOT what is on `origin/main`. If a teammate pushes between your `git push` and your `firebase deploy`, your deploy will silently overwrite their hosted assets even though `git` itself stayed clean. Phase C is the only protection.

> **`git fetch` is not `git pull`.** **`git fetch origin`** only refreshes your local copy of the remote refs (`refs/remotes/origin/*`). It does **not** touch your local `main` branch or your working tree. Your local branch is only truly "up to date" once **either** (a) **`git status`** reports **`Your branch is up to date with 'origin/main'`** after a fresh fetch, **or** (b) you have run **`git pull --ff-only origin main`** to fast-forward your local `main` to match. Every phase below therefore runs **`git fetch` + `git status` + (only if behind) `git pull --ff-only`** in that order.

### Phase A — start of session (before substantive edits)

1. **`git fetch origin`** — refreshes remote refs only (does not advance your local `main`).
2. **`git status`** — must show **`Your branch is up to date with 'origin/main'`**. If it instead says **`Your branch is behind 'origin/main' by N commits`**, your local `main` is **not** in sync yet — continue to step 3.
3. On **`main`**: **`git pull --ff-only origin main`** — this is what actually advances your local `main` to match `origin/main`. If Git refuses because of uncommitted local changes: `git stash push -m "wip"`, pull, then `git stash pop`.
4. On a **feature branch**: merge or rebase **`origin/main`** so your branch includes the latest shared commits (`git pull --rebase origin main`, or `git merge origin/main`).
5. Re-run **`git status`** to confirm you are now `up to date` before starting edits.

**Cursor:** **`.cursor/skills/sync-with-origin-main/SKILL.md`** encodes this workflow for agents. **`.cursor/rules/sync-origin-main.mdc`** is the short workspace reminder.

### Phase B — immediately before `git push`

Someone else may have merged while you were working, so the local branch you are about to push could now be missing their commits.

1. **`git fetch origin`** again.
2. **`git status`** — confirm `Your branch is up to date with 'origin/main'` (you may also see `Your branch is ahead of 'origin/main' by N commits`, which is expected for the commits you are about to push).
3. If status says you are **behind** or **diverged**: integrate before pushing — **`git pull --ff-only origin main`** on `main`, or **`git pull --rebase origin main`** on a feature branch. Resolve conflicts and re-run any verifiers/tests the integration may have invalidated.
4. **Only then** run `git push`.

If **`git push` is rejected**, do **not** force-push to **`main`**. Pull or rebase from `origin`, fix conflicts, then push. For other repositories, the **github-git-workflow** Cursor skill describes the same habits.

### Phase C — immediately before `firebase deploy`

This is the most often forgotten phase and the most dangerous. Even if your `git push` succeeded a minute ago, a teammate may have pushed in the meantime — and `firebase deploy --only hosting` does not consult Git, it just ships whatever is on your local disk under `web/`.

1. **`git fetch origin`** again.
2. **`git status`** — must show **`Your branch is up to date with 'origin/main'`**. Anything else (`behind`, `diverged`) means your local working tree does **not** yet match what is on GitHub, and a deploy now would ship stale assets.
3. If you are behind: **`git pull --ff-only origin main`** (or rebase your feature branch onto `origin/main`). After the pull, re-run `git status` and confirm you are now `up to date`.
4. **Rebuild any vendored sub-apps** so the deploy carries the teammate's pulled source, not your stale committed build output:
   - `npm run build:edp` — if their commit touched `web/profile-viewer/experience-decisioning-playground/`.
   - `npm run build:eds-quickstart` — if their commit touched the `tools/eds-quickstart` submodule pointer.
5. Re-run `npm run verify:profile-viewer-routes` if `web/profile-viewer/` was touched by either side.
6. **Only then** run `firebase deploy --only hosting` (and/or `--only functions`).

**Cursor:** **`.cursor/rules/sync-origin-main.mdc`** and **`.cursor/rules/ship-git-and-firebase.mdc`** encode all three phases as `alwaysApply: true` so any agent in this workspace is required to follow them on every commit-and-deploy cycle.

**When you suspect this rule was violated** (a feature that you know shipped is suddenly "gone" from the live site, or another agent's changes overwrite yours): work through [Diagnosing a stale deploy (edge cache or parallel-agent overwrite)](#diagnosing-a-stale-deploy-edge-cache-or-parallel-agent-overwrite) before redeploying blindly. The one-line `curl -fsSI "<url>?cb=$(date +%s)"` probe distinguishes a stale Fastly edge cache (fixed by a single redeploy that invalidates the edge) from a true parallel-agent overwrite of the origin (fixed only by pulling the latest `main` and re-deploying from a clean tree).

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
git fetch origin                     # refreshes remote refs ONLY — does not move local main
git status                           # MUST show "Your branch is up to date with 'origin/main'"
# If status reports "behind by N commits", local main is NOT yet in sync.
# git pull --ff-only is what actually advances local main:
git pull --ff-only origin main
git status                           # re-verify: must now show "up to date" before continuing

# 2. Rebuild any vendored sub-apps so the deploy carries pulled source
npm run build:edp                    # if EDP playground source changed upstream
npm run build:eds-quickstart         # if eds-quickstart submodule pointer changed upstream

# 3. Mirror + verify
npm run sync-profile-viewer-ui       # copy web/profile-viewer/ → prototype public/ (keep mirror in sync)
npm run verify:profile-viewer-routes # fail if preserved Decisioning + EDS Quickstart routes are broken
cd functions && npm install && cd ..
```

**Why every step matters:** `firebase deploy --only hosting` ships whatever is on your local disk under `web/`, NOT what is on `origin/main`. Skip step 1 and you may silently overwrite a teammate's hosted assets. Skip step 2 and your deploy will carry stale built artefacts that don't match the freshly-pulled source.

> Reminder: **`git fetch` alone does not update your local branch** — it only refreshes `refs/remotes/origin/*` so `git status` can compare. **`git pull --ff-only`** is what actually advances local `main` to match `origin/main`. See [Collaboration, Git, and environment](#collaboration-git-and-environment) for the full three-phase pull discipline.

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

### Diagnosing a stale deploy (edge cache or parallel-agent overwrite)

Two failure modes look identical from a user's perspective ("the live page doesn't show my changes" or "a feature we just shipped is gone again") but have different root causes and different fixes. Both come up routinely when **multiple agents or sessions are touching the same workspace** in parallel — exactly the scenario Phase C is designed to prevent. When in doubt, work through the diagnosis below before redeploying blindly.

**Failure mode 1 — parallel-agent deploy without sync (silent overwrite).** A teammate or another agent in a parallel session ran `firebase deploy --only hosting` from a workspace that hadn't pulled your latest commit. Because **`firebase deploy --only hosting` ships what's on local disk**, not what's on `origin/main`, their stale local files have just been published over the top of your live deploy. **Git history is still linear and clean** — nothing in `git log` reveals the regression. The live origin really is serving the older content. This is the exact failure mode that Phase C exists to prevent — see [Phase C — immediately before `firebase deploy`](#phase-c--immediately-before-firebase-deploy).

**Failure mode 2 — stale Fastly edge cache in front of Hosting.** Firebase Hosting is fronted by a Fastly CDN. Even with `cache-control: max-age=0, must-revalidate` on HTML, an edge node can occasionally keep serving a stale cached response without revalidating against origin. You see `x-cache: HIT` and an old `etag` / `last-modified` even though the origin already has the newer content.

**Distinguish them with a one-line probe.** A `?cb=<timestamp>` query string is enough to bypass the edge cache and hit origin directly:

```bash
# 1. Hit origin directly (cache-busted)
curl -fsSI "https://aep-orchestration-lab.web.app/profile-viewer/<page>.html?cb=$(date +%s)" \
  | rg -i "etag|last-modified|x-cache"

# 2. Hit the canonical URL (whatever the user sees)
curl -fsSI "https://aep-orchestration-lab.web.app/profile-viewer/<page>.html" \
  | rg -i "etag|last-modified|x-cache"
```

| If… | Diagnosis | Fix |
|-----|-----------|-----|
| Both URLs return the **same** ETag, and that ETag corresponds to **old** content | **Origin is stale** (parallel-agent overwrite, or your own deploy never ran) | Pull `origin/main`, run Phase C, redeploy hosting |
| The cache-buster URL returns a **newer** ETag than the canonical URL | **Edge cache is stale** | Run `firebase deploy --only hosting` once — a new release invalidates Fastly edges immediately |

**Body-level confirmation.** When you need to verify which version of the actual bytes is being served (HTML markup, CSS/JS cache-bust strings), the same `?cb=` trick works on body inspection:

```bash
curl -fsS "https://aep-orchestration-lab.web.app/profile-viewer/<page>.html?cb=$(date +%s)" \
  | rg -n '<feature-marker>|<page>\.(css|js)\?v='
```

For example, when verifying that the Image hosting **Backup customer images** progress dialog landed live, an `imageHostingBackupDialog` marker in the HTML body together with `?v=20260430b` (or newer) on the linked CSS/JS confirmed the live origin had the right version. If the canonical URL is missing those markers but the cache-bust URL has them, you have failure mode 2 (stale edge); if both are missing them, you have failure mode 1 (stale origin).

**Don't try to "hard-refresh" out of failure mode 1.** When the origin itself is serving the wrong bytes, no amount of `Cmd+Shift+R`, `?cb=` query strings, or DevTools cache-disables on the user side will help — the file is genuinely wrong on Hosting. Pull, re-sync, and redeploy is the only fix. **This is why Phase C is non-negotiable when more than one agent or person is touching the workspace at the same time.** Asking the user to hard-refresh is the right answer for failure mode 2 only, and only after the probe above has confirmed the diagnosis.

---

## Version control and rollback

Every Firebase deploy is **automatically stamped with the deploying git SHA** so you can answer three questions at any time without guessing:

1. **What's live right now?** — single-commit answer for both Hosting and Cloud Functions.
2. **Did my deploy actually land?** — compare local `git rev-parse HEAD` against the live stamp.
3. **What was live an hour ago, and how do I roll back?** — Firebase Hosting and Cloud Run keep version history out of the box; the stamp is the bridge from "the user reports problem at 14:03" to "the commit that was live at 14:03".

The mechanism is two small JSON files written by `scripts/build-version.mjs`, which runs as a `predeploy` hook in `firebase.json` for both `hosting` and `functions` targets:

| File | Read by | Purpose |
|------|---------|---------|
| **`web/version.json`** | Hosting → served at **`https://aep-orchestration-lab.web.app/version.json`** | Tells the world (and `npm run deploy:status`) which commit is live on Hosting |
| **`functions/version.json`** | `functions/buildInfo.js` at cold-start; emitted as **`X-Build-Sha` / `X-Build-Short-Sha` / `X-Build-Branch` / `X-Build-Deployed-At`** response headers from every function via `setCors()` | Tells the world which commit is live on Cloud Functions, independently of Hosting |

Both files are **gitignored** — they're build artefacts that change on every deploy and would create endless merge churn if committed. They are deployed (not in `firebase.json`'s `ignore` lists) and regenerated automatically before every `firebase deploy`.

### Reading what's live

```bash
# Quick pretty-printed view of Hosting + Functions deployed SHAs and any drift
npm run deploy:status

# Same data as JSON for tooling / scripts
npm run deploy:status -- --json

# Direct curl (handy on a colleague's machine without the repo cloned)
curl -fsS "https://aep-orchestration-lab.web.app/version.json?cb=$(date +%s)" | jq

# Live X-Build-Sha header from a function (any function — they all stamp via setCors)
curl -fsSI "https://aep-orchestration-lab.web.app/api/event-config?cb=$(date +%s)" | rg -i "^x-build-"
```

`npm run deploy:status` prints **local checkout** state (HEAD, branch, ahead/behind origin, dirty), the **Hosting stamp**, the **Cloud Functions stamp**, and a final **Drift** summary that flags two failure modes:

- **Hosting SHA differs from both your HEAD and `origin/main`** → likely an unsynced parallel-agent deploy (see [Diagnosing a stale deploy](#diagnosing-a-stale-deploy-edge-cache-or-parallel-agent-overwrite)).
- **Hosting SHA ≠ Functions SHA** → they were deployed from different working trees. Usually fine if you only deployed one target intentionally; investigate if you deployed both and they disagree.

### Pre-deploy guard (automatic)

`scripts/predeploy-check.mjs` runs as the `predeploy` hook for both `hosting` and `functions` in `firebase.json`. It does three things on every `firebase deploy`:

1. **REFUSES the deploy if the local branch is BEHIND `origin/main`.** This is the parallel-agent-overwrite guard — see [Phase C](#phase-c--immediately-before-firebase-deploy). The error message walks the user through the exact `git pull --ff-only origin main` fix.
2. **WARNS (does not block) if the working tree is dirty or you have unpushed commits.** Sometimes you deploy hotfixes from a dirty tree intentionally — the warning prints in yellow and the SHA in `/version.json` will have `dirtyWorkingTree: true` so the regression is visible after the fact.
3. **Stamps `web/version.json` + `functions/version.json`** with the current SHA, branch, commit subject/author/date, deployer, and sync status (ahead / behind / dirty) so the live deploy carries a record of how it was built.

You can run the check ad-hoc without deploying:

```bash
npm run deploy:check        # full check + stamp (writes version.json files)
npm run deploy:stamp        # just rewrite the stamp files (skip the safety check)
```

**Emergency override** (use sparingly, document in the commit message):

```bash
SKIP_PREDEPLOY_CHECKS=1 firebase deploy --only hosting
```

This bypasses the behind-origin block. Use only when you genuinely accept overwriting whatever is upstream — for example, an emergency rollback where you must ship an older commit over a known-bad current state.

### Rolling back

Firebase keeps deploy history for **Hosting** (release versions in the console) and **Cloud Functions** (Cloud Run revisions) out of the box. The version stamp tells you *which* git SHA you want to roll back to; the consoles let you actually do it without redeploying.

#### Hosting rollback (UI, fast)

1. Open **[Firebase Console → Hosting → Release history](https://console.firebase.google.com/project/aep-orchestration-lab/hosting/main)**.
2. Find the previous good release. Each release shows the deployer's name and timestamp; cross-reference with `git log` and the stamps you've collected via `npm run deploy:status` over time.
3. Click **⋯ → Rollback**. Firebase serves the previous release's files within seconds — no redeploy required.
4. Verify with: `curl -fsS "https://aep-orchestration-lab.web.app/version.json?cb=$(date +%s)" | jq .gitShortSha`

> Rollback does **not** touch `functions/`. If the bad release also touched function code, follow the Cloud Functions section below.

#### Cloud Functions rollback (gcloud)

Cloud Functions v2 runs on **Cloud Run**, which keeps every revision and lets you redirect traffic to an older one without redeploying:

```bash
# 1. List recent revisions for the function you want to roll back
gcloud run revisions list --service=imageHostingLibrary --region=us-central1 --project=aep-orchestration-lab --limit=10

# 2. Send 100% of traffic to the previous revision (no redeploy needed)
gcloud run services update-traffic imageHostingLibrary \
  --region=us-central1 --project=aep-orchestration-lab \
  --to-revisions=imagehostinglibrary-00042-abc=100

# 3. Verify the X-Build-Sha header now matches the older revision
curl -fsSI "https://aep-orchestration-lab.web.app/api/image-hosting/library?cb=$(date +%s)&sandbox=prod" | rg -i "^x-build-"
```

Each Cloud Run revision corresponds to one `firebase deploy --only functions` run; the revision name (`imagehostinglibrary-NNNNN-xxx`) is opaque to git. The way you know **which** older revision corresponds to **which** git SHA is the `X-Build-Sha` header you've been collecting via `npm run deploy:status` — capture the SHA of every successful deploy somewhere your team can search (chat, ticket, deploy log) and cross-reference at rollback time.

> If you need to roll back to a SHA that's older than any retained Cloud Run revision (default retention is generous but not infinite), the path is: `git checkout <sha>` → `firebase deploy --only functions`. The `predeploy-check.mjs` guard will need `SKIP_PREDEPLOY_CHECKS=1` because `<sha>` is by definition behind `origin/main` — that's the legitimate emergency-override case.

### Quick rollback decision tree

| Symptom | Action |
|---------|--------|
| User reports "the page looks wrong / a feature is gone" but you don't know yet whether it's stale-edge or stale-origin | `npm run deploy:status` first. If Drift shows nothing, do the `?cb=` probe from [Diagnosing a stale deploy](#diagnosing-a-stale-deploy-edge-cache-or-parallel-agent-overwrite). |
| Stale-edge cache (`?cb=` shows newer ETag than canonical) | Trigger an edge invalidation: `firebase deploy --only hosting`. No git changes needed. |
| Stale origin (`/version.json` shows a SHA that doesn't match the latest commit you intended to ship) | Pull, re-sync, redeploy from a clean tree (Phase C). The version stamp on the next deploy will confirm the fix. |
| The latest deploy itself is broken and you need to revert | Hosting console rollback (UI) for `web/`-only regressions; gcloud `update-traffic --to-revisions` for `functions/`-only regressions; both for combined regressions. |
| You need to roll back to a commit older than any retained revision | `git checkout <sha>` + `SKIP_PREDEPLOY_CHECKS=1 firebase deploy --only functions,hosting`. Document the SKIP in the commit message. |

### Optional: in-page version pill

A future enhancement (not yet wired) is a small "v 13e9449" pill in the dashboard topbar that fetches `/version.json` and links to the GitHub commit URL on click. The data is already live — the stamp file's `commitUrl` field is a ready-made `https://github.com/.../commit/<sha>` link. Wiring is one small `<script>` block in `home.css` / a shared topbar partial.

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
| **Don't deploy hosting from a workspace where another agent or session is also editing in parallel without re-running Phase C first** | This is the most common way Phase C gets violated in practice. Two agents finish their work, both push, both deploy in alternation — and whichever deploys last from a workspace that hasn't pulled the other's commit silently reverts those changes on the live site. Git history stays linear and clean; nothing in `git log` reveals the regression. The `curl -fsSI "<url>?cb=$(date +%s)"` probe in [Diagnosing a stale deploy (edge cache or parallel-agent overwrite)](#diagnosing-a-stale-deploy-edge-cache-or-parallel-agent-overwrite) is the post-mortem tool when this happens. |
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
- [ ] **Phase A** sync ran before substantive edits (`git fetch origin` → `git status` → `git pull --ff-only origin main` if behind, then re-`git status` to confirm `up to date`)
- [ ] **Phase B** sync ran immediately before `git push` (re-fetched, re-`git status`, re-integrated via `git pull --ff-only` / `git pull --rebase` if a teammate had pushed)
- [ ] **Phase C** sync ran immediately before `firebase deploy` (re-fetched, re-`git status`, pulled if behind, AND re-ran any `npm run build:edp` / `npm run build:eds-quickstart` if the teammate's commit touched a vendored sub-app)

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
