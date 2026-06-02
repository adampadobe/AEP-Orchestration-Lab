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
- **New lab demos** (Tags + generator): use the canonical strip documented in [CONTRIBUTING.md](CONTRIBUTING.md) (section *Profile Viewer lab demos — environment strip*) and the Cursor skill **`.cursor/skills/profile-viewer-lab-demo-strip/SKILL.md`**.
- **Anonymous Web SDK + `_demoemea` (Edge → profile):** [docs/ANONYMOUS_EDGE_DEMO_PATTERN.md](docs/ANONYMOUS_EDGE_DEMO_PATTERN.md) — `getIdentity`, then `sendEvent` with `_demoemea.identification.core.ecid`; validate with **`GET /api/profile/table?namespace=ecid&identifier=…`**.
- **AJO content templates & fragments:** create via **terminal → `platform.adobe.io`** (not Firebase); see [docs/AJO_CONTENT_TEMPLATE_API.md](docs/AJO_CONTENT_TEMPLATE_API.md) — policy, correct `Content-Type` for `POST /ajo/content/templates`, `npm run ajo:create-content-template`, fragments base path, optional `/api/aep` `platform_headers` for browser-only tests, and **generic** template `name` / `description` / default `subject` (body may personalise; metadata defaults stay demo-safe per that doc).
- Rebuild vendored sub-apps when their sources change (e.g. **`npm run build:edp`**, **`npm run build:eds-quickstart`**) before deploy — see ship rule.

## Secrets and credentials

Never commit secrets. Use **Firebase `defineSecret`**, gitignored `.env` / local JSON, or team-documented env vars. See [Credentials, secrets and .env files](CONTRIBUTING.md#credentials-secrets-and-env-files).

## MCP in this workspace

Cursor loads MCP from two places — they appear as separate sections in **Settings → MCP**:

| Location | File | Cursor UI label |
|----------|------|-----------------|
| **Workspace** (committed, team default for this repo) | `.cursor/mcp.json` | **Workspace MCP Servers** |
| **User / global** (your machine only, all projects) | `~/.cursor/mcp.json` | **User MCP Servers** |

- **Workspace (this repo):** **Firebase MCP** only — `firebase-tools experimental:mcp` (same auth as **Firebase CLI** / ADC). Keeps deploy/emulator tooling tied to the lab project without duplicating personal Adobe OAuth servers in git.
- **User / global:** Adobe product MCPs (**Real-Time CDP**, **Journey Optimizer**, AEP AMA, Analytics, etc.) belong here alongside your other Adobe entries. Paste into `~/.cursor/mcp.json` (merge; do not wipe existing servers):

```json
"rtcdp": {
  "type": "streamable-http",
  "url": "https://rtcdp-mcp.adobe.io/mcp"
},
"ajo": {
  "type": "streamable-http",
  "url": "https://ajo-mcp.adobe.io/mcp"
}
```

Optional — if you want **Firebase MCP in every project**, add the same block as workspace `firebase` to your user file (or enable the workspace entry when this repo is open). Browser Adobe ID sign-in on first tool use for OAuth MCPs; no static auth headers in the repo.

- **Secrets:** never commit tokens or client secrets. Use user-level `headers` / `env` only in `~/.cursor/mcp.json` (gitignored on your machine).

## Global Cursor baseline (all projects)

For the same defaults in **every** repo, paste the repo-root **`.cursorrules`** text into **Cursor Settings → Rules → User rules** with **Always apply** (Agent chat only).
