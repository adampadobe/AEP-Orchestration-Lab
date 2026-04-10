# Collaboration

Notes for anyone working in this repository together: tooling versions, conventions, and where things live.

## Git: stay current with `origin/main`

Upstream is **`https://github.com/adampadobe/AEP-Orchestration-Lab`** (`origin`). Before starting work (or before pushing), **fetch and pull** so your branch is not behind **`origin/main`**—otherwise you risk conflicts and overwriting teammates’ changes.

1. `git fetch origin`
2. On `main`: `git pull --ff-only origin main` (use **`git stash`** first if you have dirty changes and Git refuses to pull)
3. See also **`.cursor/rules/sync-origin-main.mdc`** in this repo

Cursor’s **github-git-workflow** skill documents the same habit for all shared repos.

## Node.js

| Location | Version |
|----------|---------|
| **Target / CI** | **Node.js 22** (LTS), as specified in **`.nvmrc`** |
| **`functions/package.json`** | `"engines": { "node": "22" }` — matches **Firebase Cloud Functions** (2nd gen) runtime used on deploy |
| **Root `package.json`** | `"engines": { "node": ">=22 <26", "npm": ">=10" }` — keep local Node in this range for scripts and installs |

**Why 22:** The project was upgraded from Node 20 to **22** for alignment with current LTS and supported Cloud Functions (2nd gen) runtimes. Use a version manager so your shell matches CI and production.

If `npm install` prints `EBADENGINE` because your global Node is newer (for example v25), switch to Node 22 with `nvm use` / `fnm use` — that warning should disappear.

**Setup:**

1. Install [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) (or another tool that reads `.nvmrc`).
2. In the repo root: `nvm install` / `nvm use` (or `fnm install` / `fnm use`).
3. Confirm: `node -v` should report **`v22.x.x`**.

**Firebase Functions** (`functions/`): from that directory run `npm install` and emulators/deploy with Node 22 active. Mismatched Node versions can cause subtle lockfile or native-addon issues.

**If your machine shows a newer global Node** (for example v25): that is fine for ad-hoc scripts, but switch to **22** before `npm ci` / `npm install` under `functions/` or before `firebase deploy --only functions`.

## Continuous integration

The **Validate** workflow (`.github/workflows/validate.yml`) installs Node from **`.nvmrc`** and runs `npm ci` in **`functions/`** so pull requests verify that dependencies install cleanly on the pinned Node version.

## Profile Viewer UI (icons, sidebar, static assets)

Firebase Hosting serves static files from **`web/`**; the lab nav and Smock-style
icons live in **`web/profile-viewer/`** (for example `aep-lab-nav.js` and
`images/`). Treat that folder as the **canonical** copy.

To keep the local Express prototype in
`aep-prototypes/AEP Profile/03 Profile Viewer/public/` aligned after edits, run
**`npm run sync-profile-viewer-ui`** from the repo root (copies **web →
prototype**, not the reverse). Using the old reversed sync overwrote
`web/profile-viewer/` with an outdated prototype and made sidebar icons look
“reverted.” See **CONTRIBUTING.md** (sync section) for the full workflow.

## Related docs

- Firebase Functions runtime: [Manage functions](https://firebase.google.com/docs/functions/manage-functions) (2nd gen uses the `engines` field in `functions/package.json`).
