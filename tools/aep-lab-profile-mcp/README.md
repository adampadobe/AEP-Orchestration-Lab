# AEP Orchestration Lab — Profile MCP (Phase 2)

Streamable HTTP [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes AEP Orchestration Lab **profile** APIs to **Adobe AI Coworker** and other MCP clients. Calls the hosted lab at `https://aep-orchestration-lab.web.app/api/...` (configurable).

All tools authenticate with a **single** `X-AEP-Lab-Mcp-Key` header. Sandbox allowlist applies to every tool including provisioning.

## Tools

| Tool | Lab API | Notes |
|------|---------|--------|
| `lab_list_industries` | *(static)* | Canonical keys + alias notes |
| `lab_list_sandboxes` | `GET /api/sandboxes` | Active sandboxes list |
| `lab_profile_infra_status` | `GET /api/profile-infra/status-all` | All industries; optional `industry` filter |
| `lab_generate_profile` | `POST /api/profile/generate` | Stream test profile; optional `randomize` / `fill_sample_data` |
| `lab_lookup_profile` | `GET /api/profile/table` | UPS profile table |
| `lab_generate_profiles_batch` | *(async job)* | Queue 1–100 profiles; returns `job_id` |
| `lab_batch_job_status` | *(job store)* | Poll batch job progress + results |
| `lab_provision_profile_infra_step` | `POST /api/{industry}-profile-infra/step` | Provisioning wizard step |
| `lab_enable_profile` | `POST /api/{industry}-profile-infra/enable-profile` | Enable profile on infra |

**Industry aliases** (normalized before lab calls): `telecommunications` / `telco` → `telecom`; `public` → `generic`.

**Sandbox allowlist** (env `AEP_LAB_MCP_ALLOWED_SANDBOXES`, default `apalmer,kirkham`): tools that accept `sandbox` reject others with a clear error listing allowed names.

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

**Tool timeouts:** `lab_profile_infra_status`, `lab_lookup_profile`, and provisioning tools can take up to ~5 minutes. Configure MCP client timeout ≥ **300s** for those tools.

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

## Phase 3 (not implemented)

- OAuth bearer validation (`validateOAuthBearer` stub in `src/auth.mjs`)
- Optional lab-side MCP key on `/api/*` (Firebase functions unchanged)
- Firestore audit collection persistence

## Related

- Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md`
- Stdio Adobe MCP (IMS direct): `tools/aep-lab-adobe-mcp/`
- Lab profile generate service: `functions/profileGenerateService.js`
