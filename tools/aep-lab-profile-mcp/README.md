# AEP Orchestration Lab — Profile MCP (Phase 2 + Profile Viewer workflows)

Streamable HTTP [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes AEP Orchestration Lab **profile** APIs to **Adobe AI Coworker** and other MCP clients. Calls the hosted lab at `https://aep-orchestration-lab.web.app/api/...` (configurable).

All tools authenticate with a **single** `X-AEP-Lab-Mcp-Key` header. Sandbox allowlist applies to every tool including provisioning.

## Tools

| Tool | Lab API | Notes |
|------|---------|--------|
| `lab_list_industries` | *(static)* | Canonical keys + alias notes |
| `lab_list_sandboxes` | `GET /api/sandboxes` | Active sandboxes list |
| `lab_profile_infra_status` | `GET /api/profile-infra/status-all` | All industries; optional `industry` filter |
| `lab_generate_profile` | `POST /api/profile/generate` | Stream test profile; optional `randomize` / `fill_sample_data` |
| `lab_lookup_profile` | `GET /api/profile/table` | UPS profile table (raw lab response) |
| `lab_get_profile` | `GET /api/profile/table` + `GET /api/profile/attribute-ownership` | Coworker-friendly summary + writability hints |
| `lab_update_profile` | `POST /api/profile/update?industry=` | **Full-snapshot stitch** — fetch, merge `attribute_changes`, stream all writable industry rows |
| `lab_profile_activity` | `GET /api/profile/events` + `GET /api/profile/consent` | Event count, recent events, active channels; optional audiences |
| `lab_generate_profiles_batch` | *(async job)* | Queue 1–100 profiles; returns `job_id` |
| `lab_batch_job_status` | *(job store)* | Poll batch job progress + results |
| `lab_provision_profile_infra_step` | `POST /api/{industry}-profile-infra/step` | Provisioning wizard step |
| `lab_enable_profile` | `POST /api/{industry}-profile-infra/enable-profile` | Enable profile on infra |
| `lab_sandbox_profile_config` | `GET /api/profile-infra/status-all` + `GET /api/{industry}-profile-connection` | Infra + saved connection manifest; `ready`, `missing_steps`, `next_action` |
| `lab_onboard_sandbox` | *(orchestrates provisioning tools)* | Plan or execute onboarding for a sandbox (one industry per execute call) |

**Industry aliases** (normalized before lab calls): `telecommunications` / `telco` → `telecom`; `public` → `generic`.

**Sandbox allowlist** (env `AEP_LAB_MCP_ALLOWED_SANDBOXES`, default `apalmer,kirkham`): tools that accept `sandbox` reject others with a clear error listing allowed names.

### Profile Viewer workflows (Phase 2.1)

**Get → discuss → update (full stitch)**

1. `lab_get_profile` — flattened UPS rows, per-industry writability, attribute-ownership map.
2. Coworker proposes `attribute_changes` (path/value pairs).
3. `lab_update_profile` — server **fetches current profile**, merges changes, builds **full writable snapshot** for the target industry, POSTs to `/api/profile/update?industry=` (same as Profile Viewer **Update profile** — not minimal deltas).

Alternative: pass explicit `attributes` dot-path object when you already have a complete snapshot.

**Activity / visualization**

`lab_profile_activity` aggregates event count, recent events (with channel), marketing consent/opt-in-out channels, and an narration string (e.g. `"3 events, email + push active"`). Set `include_audiences: true` for audience membership (slower).

Merge logic lives in `src/profileMerge.mjs` (unit-tested in `npm run test:phase2`).

### Sandbox config & onboarding (Phase 2.2)

When Coworker switches sandbox, generate/update require **per-industry Firestore connection docs** (streaming URL, flow ID, dataset/schema IDs). New sandboxes have none until provisioned.

**Connection stores (Firestore)**

Each industry has its own collection (via `functions/profileConnectionStoreFactory.js`):

| Industry | Firestore collection | Lab GET API |
|----------|---------------------|-------------|
| generic | `genericProfileConnections` | `/api/generic-profile-connection?sandbox=` |
| travel | `travelProfileConnections` | `/api/travel-profile-connection?sandbox=` |
| fsi | `fsiProfileConnections` | `/api/fsi-profile-connection?sandbox=` |
| telecom | `telecomProfileConnections` | `/api/telecom-profile-connection?sandbox=` |
| retail | `retailProfileConnections` | `/api/retail-profile-connection?sandbox=` |
| media | `mediaProfileConnections` | `/api/media-profile-connection?sandbox=` |
| sports | `sportsProfileConnections` | `/api/sports-profile-connection?sandbox=` |

Document id = sanitized sandbox name (`docIdForSandbox`: `/`, spaces, `.`, `#`, `$`, `[`, `]` → `_`).

Each document shape:

```json
{
  "sandbox": "apalmer",
  "streaming": {
    "url": "https://…dcs.adobedc.net/…",
    "flowId": "…",
    "datasetId": "…",
    "schemaId": "…",
    "xdmKey": "_demoemea"
  },
  "infra": { "schemaId": "…", "datasetId": "…", "…": "…" },
  "updatedAt": "<server timestamp>"
}
```

**How generate/update resolve connections**

`profileGenerateService` and `profileUpdateProxy` (`functions/profileRoutes.js`) map `industry` → connection store module, call `store.get(sandbox)`, and use `record.streaming.{url,flowId,datasetId,schemaId,xdmKey}` when the POST body omits `streaming.*`. Body values always win over Firestore.

Provisioning wizard step `all_core` (via `lab_provision_profile_infra_step`) creates schema/dataset/dataflow in AEP and writes the connection doc via `saveConnection`.

**Coworker tools**

- `lab_sandbox_profile_config` — assess one or all industries: infra flags + connection manifest + `ready` / `missing_steps` / `next_action`.
- `lab_onboard_sandbox` — `mode=plan` (default) returns chained steps; `mode=execute` + `industry` runs provisioning for one industry (avoids MCP timeout).

Assessment logic: `src/sandboxConfig.mjs`.

### Persona randomization (Phase 2)

`lab_generate_profile` accepts `randomize: true` or `fill_sample_data: true`. When set and `attributes` is omitted, the server builds rich dot-path XDM attributes server-side (`src/personaBuilder.mjs`) for all seven industries — demographics, scoring, loyalty, and industry-specific fields aligned with Profile Viewer defaults.

### Batch generation (Phase 2)

- Max **100** profiles per job (`count`).
- Returns `job_id` immediately; processing runs in the background with configurable delay between items (default 500ms).
- Job store: **Firestore** collection `mcpProfileBatchJobs` on Cloud Run (ADC); in-memory fallback locally (set `AEP_LAB_MCP_BATCH_STORE=memory`).
- Email addressing: `base_email` (plus-tag pattern) or `email_pattern` with `{n}`, `{index}`, `{industry}`.

### Provisioning (Phase 2)

Same auth as all other tools — no separate admin key. Common step names: `createSchema`, `attachFieldGroups`, `createDataset`, `createDataflow`, `saveConnection`, **`all_core`**.

## Environment

Copy `.env.mcp.example` → `.env.mcp` (gitignored):

```bash
cp tools/aep-lab-profile-mcp/.env.mcp.example tools/aep-lab-profile-mcp/.env.mcp
openssl rand -hex 32   # AEP_LAB_MCP_API_KEY
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AEP_LAB_MCP_API_KEY` | Yes | Secret sent as `X-AEP-Lab-Mcp-Key` (all tools) |
| `AEP_LAB_API_ORIGIN` | No | Lab origin (default `https://aep-orchestration-lab.web.app`) |
| `AEP_LAB_MCP_ALLOWED_SANDBOXES` | No | Comma-separated allowlist (default `apalmer,kirkham`) |
| `AEP_LAB_MCP_BATCH_STORE` | No | `memory` forces in-memory jobs; omit for Firestore on Cloud Run |
| `AEP_LAB_MCP_BATCH_DELAY_MS` | No | Delay between batch generates (default `500`, max `5000`) |
| `PORT` | No | HTTP port (default `8080`; Cloud Run sets this) |
| `HOST` | No | Bind address (default `0.0.0.0`) |

## Run locally

From repo root:

```bash
cd tools/aep-lab-profile-mcp
npm install
npm start
# or: npm run profile-mcp   (from repo root)
```

Health: `GET http://localhost:8080/health`  
MCP endpoint: `POST http://localhost:8080/mcp`

Tests:

```bash
cd tools/aep-lab-profile-mcp
AEP_LAB_MCP_API_KEY='local-smoke-test-key' npm run smoke
AEP_LAB_MCP_API_KEY='test' AEP_LAB_MCP_BATCH_STORE=memory npm run test:phase2
```

## Adobe AI Coworker setup

Add a **Streamable HTTP** MCP server in Coworker (or `~/.cursor/mcp.json` for Cursor):

```json
"aep-lab-profile": {
  "type": "streamable-http",
  "url": "https://<your-cloud-run-host>/mcp",
  "headers": {
    "X-AEP-Lab-Mcp-Key": "<same value as AEP_LAB_MCP_API_KEY>"
  }
}
```

For local dev:

```json
"aep-lab-profile-local": {
  "type": "streamable-http",
  "url": "http://127.0.0.1:8080/mcp",
  "headers": {
    "X-AEP-Lab-Mcp-Key": "<your-local-key>"
  }
}
```

**Tool timeouts:** `lab_profile_infra_status`, `lab_get_profile`, `lab_lookup_profile`, `lab_update_profile`, `lab_profile_activity`, and provisioning tools can take up to ~5 minutes. Configure MCP client timeout ≥ **300s** for those tools.

## Audit logging

Structured JSON lines to stdout:

```json
{"type":"aep-lab-profile-mcp-audit","timestamp":"…","keyId":"abc123…","tool":"lab_generate_profiles_batch","sandbox":"apalmer","jobId":"…"}
```

`keyId` is a SHA-256 prefix of the API key (not the secret).

## Deploy to Cloud Run

GCP project: **`aep-orchestration-lab`**, region: **`us-central1`**.

**Redeploy notes (Phase 2):** ensure Cloud Run service account can write Firestore (`mcpProfileBatchJobs` collection).

```bash
cd tools/aep-lab-profile-mcp

export PROJECT_ID=aep-orchestration-lab
export REGION=us-central1
export SERVICE=aep-lab-profile-mcp

gcloud builds submit --tag "gcr.io/${PROJECT_ID}/${SERVICE}" .

cat > /tmp/aep-lab-profile-mcp-env.yaml <<'EOF'
AEP_LAB_API_ORIGIN: https://aep-orchestration-lab.web.app
AEP_LAB_MCP_ALLOWED_SANDBOXES: apalmer,kirkham
GOOGLE_CLOUD_PROJECT: aep-orchestration-lab
EOF

gcloud run deploy "${SERVICE}" \
  --image "gcr.io/${PROJECT_ID}/${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --env-vars-file /tmp/aep-lab-profile-mcp-env.yaml \
  --set-secrets "AEP_LAB_MCP_API_KEY=aep-lab-profile-mcp-api-key:latest" \
  --memory 512Mi \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10
```

Grant the Cloud Run runtime service account **Cloud Datastore User** (Firestore) if batch jobs fail with permission errors.

## Onboarding a new sandbox

Use this when a new architect or sandbox must work in Coworker/MCP (not just Profile Viewer UI).

### 1. Ops — allowlist the sandbox on Cloud Run

Adobe org credentials are already in Firebase Secret Manager (shared org IMS). The MCP server additionally gates tools by sandbox name:

```bash
# Edit env vars (comma-separated, no spaces)
cat > /tmp/aep-lab-profile-mcp-env.yaml <<'EOF'
AEP_LAB_API_ORIGIN: https://aep-orchestration-lab.web.app
AEP_LAB_MCP_ALLOWED_SANDBOXES: apalmer,kirkham,new-sandbox-name
GOOGLE_CLOUD_PROJECT: aep-orchestration-lab
EOF

gcloud run deploy aep-lab-profile-mcp \
  --region us-central1 \
  --project aep-orchestration-lab \
  --env-vars-file /tmp/aep-lab-profile-mcp-env.yaml \
  --set-secrets "AEP_LAB_MCP_API_KEY=aep-lab-profile-mcp-api-key:latest"
```

Redeploy Cloud Run after changing `AEP_LAB_MCP_ALLOWED_SANDBOXES`. No Firebase Functions redeploy required for allowlist-only changes.

### 2. Per-sandbox — provision profile infra

**Via MCP (Coworker):**

1. `lab_sandbox_profile_config` — see which industries are not `ready`.
2. `lab_onboard_sandbox` with `mode=plan` — get ordered steps.
3. For each industry: `lab_onboard_sandbox` with `mode=execute`, `industry=travel` (one industry per call), **or** manually:
   - `lab_provision_profile_infra_step` with `step=all_core`
   - `lab_enable_profile` if dataset not Profile-enabled
4. `lab_sandbox_profile_config` with `refresh=true` — verify `ready: true`.

**Via Profile Viewer:** Generate Profiles page → per-industry setup wizard (same underlying APIs).

Firestore connection docs are **auto-created** on successful `saveConnection` / `all_core` — no manual Firestore edits.

### 3. Optional — Profile Core v2 top-up

If your sandbox uses tenant-specific profile fields, see [Profile Core v2 top-up](../../docs/PROFILE_CORE_V2_TOPUP.md). Provisioning runs top-up during field-group attach; new streaming paths must be registered in `functions/profileCoreV2Manifest.js` when adding generator leaves.

### 4. Verify

```text
lab_sandbox_profile_config sandbox=<name> industry=travel
→ ready: true, connection.streaming.url + flowId present

lab_generate_profile sandbox=<name> industry=travel email=test+1@adobetest.com randomize true
```

## Phase 3 (not implemented)

- OAuth bearer validation (`validateOAuthBearer` stub in `src/auth.mjs`)
- Optional lab-side MCP key on `/api/*` (Firebase functions unchanged)
- Firestore audit collection persistence

## Related

- Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md`
- Stdio Adobe MCP (IMS direct): `tools/aep-lab-adobe-mcp/`
- Lab profile generate service: `functions/profileGenerateService.js`
