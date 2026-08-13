# AEP Orchestration Lab — agent instructions

## What this repo is

Firebase-backed lab: **Hosting** serves static assets from `web/` (Profile Viewer and demos). **Cloud Functions** in `functions/` implement AEP/platform proxies, tooling APIs, and server logic wired in `firebase.json`.

## Tooling

- **Node:** `>= 22` and **npm** `>= 10` (see root `package.json` / `functions/package.json`).
- **Firebase:** project id **`aep-orchestration-lab`**; use `npx -y firebase-tools@latest` for CLI parity with CI/deploy docs.

## Layout (short)

| Path | Role |
|------|------|
| `web/` | Firebase Hosting `public` root; **`web/profile-viewer/`** is canonical for the main lab UI. |
| `functions/` | Cloud Functions (Node); AEP and other HTTPS proxies. |
| `scripts/` | predeploy checks, route verifiers, version stamp, etc. |
| `aep-prototypes/` | Mirrors / prototypes; see **CONTRIBUTING** before syncing. |

## Before you ship

- **Before substantive edits:** run `git fetch origin` and `git status`; if the branch is behind, update it before editing (`git pull --ff-only origin main` on `main`, or integrate `origin/main` on a feature branch).
- **Immediately before push:** repeat the fetch/status check. Rebase or merge if the branch is behind, then rerun affected tests and verifiers.
- **Production Firebase deploys:** only from a clean `main` whose `HEAD` exactly matches a freshly fetched `origin/main`. Feature branches, ahead/behind branches, tracked changes, and untracked files under deploy roots are blocked by `scripts/predeploy-check.mjs`.
- **Feature-branch Hosting:** use `npm run deploy:preview -- <channel-name>`. Never run a production Hosting deploy from a feature branch; preview channels expire after seven days.
- **Ship order:** feature branch → PR → required validation → merge to `main` → production deploy from exact `origin/main`. Do not bypass the predeploy gate except for a documented emergency rollback.
- **Human policy:** [CONTRIBUTING.md](CONTRIBUTING.md) — especially [Preserved Decisioning Profile Viewer routes](CONTRIBUTING.md#preserved-decisioning-profile-viewer-routes) and [Change workflow](CONTRIBUTING.md#change-workflow-mandatory).
- After edits under **`web/profile-viewer/`:** run **`npm run verify:profile-viewer-routes`** before PR; run **`npm run sync-profile-viewer-ui`** when the Express mirror must stay aligned (see CONTRIBUTING).
- **Preserved routes:** keep the `journey-arbitration.html` and `journey-arbitration-v2.html` redirect stubs targeting v3; keep v3 assets and nav wiring. Do not restore `decisioning-overview-v2.html` or `ajo-decisioning-pipeline-v8-demo.html`.
- **New lab demos** (Tags + generator): use the canonical strip documented in [CONTRIBUTING.md](CONTRIBUTING.md) and the Codex skill **`.agents/skills/profile-viewer-lab-demo-strip/SKILL.md`**.
- **Anonymous Web SDK + `_demoemea` (Edge → profile):** [docs/ANONYMOUS_EDGE_DEMO_PATTERN.md](docs/ANONYMOUS_EDGE_DEMO_PATTERN.md) — `getIdentity`, then `sendEvent` with `_demoemea.identification.core.ecid`; validate with **`GET /api/profile/table?namespace=ecid&identifier=…`**.
- **AJO content templates & fragments:** create via **terminal → `platform.adobe.io`** (not Firebase); see [docs/AJO_CONTENT_TEMPLATE_API.md](docs/AJO_CONTENT_TEMPLATE_API.md) — policy, correct `Content-Type` for `POST /ajo/content/templates`, `npm run ajo:create-content-template`, fragments base path, optional `/api/aep` `platform_headers` for browser-only tests, and **generic** template `name` / `description` / default `subject` (body may personalise; metadata defaults stay demo-safe per that doc).
- Rebuild vendored sub-apps when their sources change (e.g. **`npm run build:edp`**, **`npm run build:eds-quickstart`**) before deploy — see ship rule.

## Secrets and credentials

Never commit secrets. Use **Firebase `defineSecret`**, gitignored `.env` / local JSON, or team-documented env vars. See [Credentials, secrets and .env files](CONTRIBUTING.md#credentials-secrets-and-env-files).

## Codex skills in this workspace

Project skills live under `.agents/skills/`:

- `aep-demo-use-case` — researched, self-contained use-case and journey HTML.
- `aep-lab-profile-mcp` — lab profile, event, brand scrape, and infrastructure workflows. Adobe Coworker `dx-api` steps remain explicit handoffs because this Codex setup has no equivalent connector.
- `profile-viewer-lab-demo-strip` — canonical demo environment/profile strip.
- `sync-with-origin-main` — the shared-repo sync workflow used at all three checkpoints.

## MCP in Codex

- Global MCP configuration is in `~/.codex/config.toml`; Firebase and the Adobe MCP endpoints are already configured there for this machine.
- The legacy `.cursor/mcp.json` remains for teammates still using Cursor, but Codex does not load it.
- Never commit tokens or client secrets. Keep credential-backed MCP entries disabled until their environment variables are configured.
