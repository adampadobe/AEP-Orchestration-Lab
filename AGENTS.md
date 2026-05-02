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

- **Git + deploy ritual:** `.cursor/rules/ship-git-and-firebase.mdc` and `.cursor/rules/sync-origin-main.mdc` (always-on). Do not deploy hosting while behind `origin/main`.
- **Human policy:** [CONTRIBUTING.md](CONTRIBUTING.md) — especially [Preserved Decisioning Profile Viewer routes](CONTRIBUTING.md#preserved-decisioning-profile-viewer-routes) and [Change workflow](CONTRIBUTING.md#change-workflow-mandatory).
- After edits under **`web/profile-viewer/`:** run **`npm run verify:profile-viewer-routes`** before PR; run **`npm run sync-profile-viewer-ui`** when the Express mirror must stay aligned (see CONTRIBUTING).
- Rebuild vendored sub-apps when their sources change (e.g. **`npm run build:edp`**, **`npm run build:eds-quickstart`**) before deploy — see ship rule.

## Secrets and credentials

Never commit secrets. Use **Firebase `defineSecret`**, gitignored `.env` / local JSON, or team-documented env vars. See [Credentials, secrets and .env files](CONTRIBUTING.md#credentials-secrets-and-env-files).

## MCP in this workspace

- **`.cursor/mcp.json`** enables the **Firebase MCP** (`firebase-tools experimental:mcp`) for this folder. Uses the same auth as **Firebase CLI** on your machine (`firebase login` / ADC).
- **Adobe / AEP MCP** (e.g. Marketing Agent): there is no repo-committed stdio block for it here — add it in **Cursor global MCP** or extend `.cursor/mcp.json` locally from your org’s documented command/env (avoid committing tokens).

## Global Cursor baseline (all projects)

For the same defaults in **every** repo, paste the repo-root **`.cursorrules`** text into **Cursor Settings → Rules → User rules** with **Always apply** (Agent chat only).
