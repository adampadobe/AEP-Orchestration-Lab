# AEP Orchestration Lab — Profile MCP (Phase 1)

Streamable HTTP [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes AEP Orchestration Lab **profile** APIs to **Adobe AI Coworker** and other MCP clients. Calls the hosted lab at `https://aep-orchestration-lab.web.app/api/...` (configurable).

Phase 1 protects **this MCP server** with `X-AEP-Lab-Mcp-Key`. Lab Cloud Functions remain public invoker (unchanged).

## Tools (MVP)

| Tool | Lab API | Notes |
|------|---------|--------|
| `lab_list_industries` | *(static)* | Canonical keys + alias notes |
| `lab_list_sandboxes` | `GET /api/sandboxes` | Active sandboxes list |
| `lab_profile_infra_status` | `GET /api/profile-infra/status-all` | All industries; optional `industry` filter |
| `lab_generate_profile` | `POST /api/profile/generate` | Stream test profile |
| `lab_lookup_profile` | `GET /api/profile/table` | UPS profile table |

**Industry aliases** (normalized before lab calls): `telecommunications` / `telco` → `telecom`; `public` → `generic`.

**Sandbox allowlist** (env `AEP_LAB_MCP_ALLOWED_SANDBOXES`, default `apalmer,kirkham`): tools that accept `sandbox` reject others with a clear error listing allowed names.

## Environment

Copy `.env.mcp.example` → `.env.mcp` (gitignored):

```bash
cp tools/aep-lab-profile-mcp/.env.mcp.example tools/aep-lab-profile-mcp/.env.mcp
openssl rand -hex 32   # use output for AEP_LAB_MCP_API_KEY
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AEP_LAB_MCP_API_KEY` | Yes | Secret sent by Coworker as `X-AEP-Lab-Mcp-Key` |
| `AEP_LAB_API_ORIGIN` | No | Lab origin (default `https://aep-orchestration-lab.web.app`) |
| `AEP_LAB_MCP_ALLOWED_SANDBOXES` | No | Comma-separated allowlist (default `apalmer,kirkham`) |
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

Smoke test (starts ephemeral server):

```bash
cd tools/aep-lab-profile-mcp
AEP_LAB_MCP_API_KEY='local-smoke-test-key' npm run smoke
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

**Tool timeouts:** `lab_profile_infra_status` and `lab_lookup_profile` can take up to ~2 minutes (lab fan-out / UPS). Configure Coworker MCP client timeout ≥ **180s** if your client defaults are lower.

## Audit logging

Phase 1 writes structured JSON lines to stdout:

```json
{"type":"aep-lab-profile-mcp-audit","timestamp":"…","keyId":"abc123…","tool":"lab_generate_profile","sandbox":"apalmer","industry":"telecom"}
```

`keyId` is a SHA-256 prefix of the API key (not the secret). Optional Firestore persistence is stubbed in `src/auditLog.mjs`.

## Deploy to Cloud Run

GCP project: **`aep-orchestration-lab`**, region: **`us-central1`** (same as lab functions).

```bash
cd tools/aep-lab-profile-mcp

# Build & push (replace REGION/PROJECT if needed)
export PROJECT_ID=aep-orchestration-lab
export REGION=us-central1
export SERVICE=aep-lab-profile-mcp
export AEP_LAB_MCP_API_KEY='$(openssl rand -hex 32)'   # generate once; store in Secret Manager

gcloud builds submit --tag "gcr.io/${PROJECT_ID}/${SERVICE}" .

gcloud run deploy "${SERVICE}" \
  --image "gcr.io/${PROJECT_ID}/${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "AEP_LAB_API_ORIGIN=https://aep-orchestration-lab.web.app,AEP_LAB_MCP_ALLOWED_SANDBOXES=apalmer,kirkham" \
  --set-secrets "AEP_LAB_MCP_API_KEY=aep-lab-profile-mcp-api-key:latest" \
  --memory 512Mi \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10
```

**Before first deploy**, create the secret (one-time):

```bash
echo -n "$AEP_LAB_MCP_API_KEY" | gcloud secrets create aep-lab-profile-mcp-api-key \
  --project=aep-orchestration-lab \
  --data-file=-
```

Use the Cloud Run URL + same key in Coworker headers.

## Phase 2 (not implemented)

- OAuth bearer validation (`validateOAuthBearer` stub in `src/auth.mjs`)
- Optional lab-side MCP key on `/api/*` (Firebase functions unchanged in Phase 1)
- Firestore audit collection

## Related

- Stdio Adobe MCP (IMS direct): `tools/aep-lab-adobe-mcp/`
- Lab profile generate service: `functions/profileGenerateService.js`
