# Collaboration

Notes for anyone working in this repository together: tooling versions, conventions, and where things live.

## Git: stay current with `origin/main`

Upstream is **`https://github.com/adampadobe/AEP-Orchestration-Lab`** (`origin`). **Everyone** working in this repo—including **Alan**—should treat GitHub as the source of truth and follow the two-phase habit below so we do not edit or deploy on top of stale `main`, and we avoid surprise conflicts when the other person has already merged.

### Phase A — start of each work session (before substantive edits)

Run this **before** you spend time on code, docs, or a long Cursor/agent session:

1. `git fetch origin`
2. `git status` — if you are **behind** `origin/main`, update before continuing.
3. On branch `main`: `git pull --ff-only origin main`  
   If you have uncommitted changes and Git refuses: `git stash push -m "wip"`, pull, then `git stash pop`.
4. On a **feature branch**: merge or rebase **`origin/main`** into your branch so it includes the latest shared commits.

**Cursor:** the project skill **`.cursor/skills/sync-with-origin-main/SKILL.md`** tells the agent to run this pattern when syncing or before pushes. Prefer loading that skill (or following this section) so stays consistent.

### Phase B — immediately before `git push`

Someone else may have merged while you were working. Right before you push:

1. `git fetch origin` again
2. If your branch is behind `origin/main`, **`git pull --ff-only origin main`** (or rebase/merge your feature branch onto current `origin/main`) and fix any conflicts **before** `git push`.

If `git push` is **rejected**, do **not** force-push to `main`. Update from `origin`, resolve, then push again.

### Other references

- **`.cursor/rules/sync-origin-main.mdc`** — workspace reminder to align with `origin/main` before substantive edits.
- **github-git-workflow** skill (personal Cursor skills) — same habits for any shared repo.

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

- **`.cursor/skills/sync-with-origin-main/SKILL.md`** — agent workflow for Phase A / Phase B Git sync with `origin/main`.
- Firebase Functions runtime: [Manage functions](https://firebase.google.com/docs/functions/manage-functions) (2nd gen uses the `engines` field in `functions/package.json`).
