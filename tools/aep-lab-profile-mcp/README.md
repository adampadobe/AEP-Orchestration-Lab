# AEP Orchestration Lab MCP (Phase 3.4)

Streamable HTTP [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes AEP Orchestration Lab **profile** APIs to **Adobe AI Coworker** and other MCP clients. Calls the hosted lab at `https://aep-orchestration-lab.web.app/api/...` (configurable).

**Version 3.4.0** — 21 tools + 6 framework resources. All tools authenticate with a **single** `X-AEP-Lab-Mcp-Key` header.

## Framework tools & resources (v3.4)

Coworker should call **`lab_get_execution_framework`** first — encodes **criticalRules** (testProfile, preferredLanguage, sandbox preflight) plus lab execution knowledge:

| Tool / URI | Purpose |
|------------|---------|
| `lab_get_execution_framework` | **criticalRules** array + workflows, conventions, dataflow pattern, segment catalog |
| `lab_get_industry_playbook` | Per-industry persona paths, testProfile/language, dataflow manifest, failure_modes |
| `lab_preflight_profile_generate` | Dry-run: config ready + payload preview (no AEP stream) |
| `lab://framework/overview` | Markdown overview |
| `lab://framework/conventions` | Email, `+447425627462`, testProfile, preferredLanguage, stitching |
| `lab://framework/industries/{industry}` | JSON industry playbook |
| `lab://framework/overview.json` | Same as execution framework tool (JSON) |

Implementation: `src/framework/labFramework.mjs` (canonical MCP copy; UI sources in `web/profile-viewer/profile-generation-*.js`, `functions/industryAttributeMap.js`).

## Tools

| Tool | Lab API | Notes |
|------|---------|--------|
| `lab_get_execution_framework` | *(static)* | Lab execution framework JSON — **criticalRules** at top |
| `lab_get_industry_playbook` | *(static)* | Per-industry playbook; omit industry for all |
| `lab_preflight_profile_generate` | status-all + connection APIs | Dry-run generate: config ready + payload preview |
| `lab_list_industries` | *(static)* | Canonical keys + alias notes |
| `lab_list_sandboxes` | `GET /api/sandboxes` | Active sandboxes list |
| `lab_mcp_access_info` | *(read-only)* | keyId, allowed sandboxes, principal label — no secrets |
| `lab_profile_infra_status` | `GET /api/profile-infra/status-all` | All industries; optional `industry` filter |
| `lab_generate_profile` | `POST /api/profile/generate` | Stream test profile; defaults **test_profile:true**, enforces **preferredLanguage**; `randomize`, `segment_hint` |
| `lab_lookup_profile` | `GET /api/profile/table` | UPS profile table (raw lab response) |
| `lab_get_profile` | `GET /api/profile/table` + attribute ownership | Coworker-friendly summary + writability hints |
| `lab_update_profile` | `POST /api/profile/update?industry=` | **Full-snapshot stitch** |
| `lab_profile_activity` | events + consent APIs | Narration string; optional audiences |
| `lab_list_event_targets` | `GET /api/events/generator-targets` | Static + Firestore Edge presets for Event tool |
| `lab_preflight_profile_event` | *(dry-run)* | Resolve identityMap + target without sending |
| `lab_send_profile_event` | `POST /api/events/generator` | Send experience event; auto-fetch ecid; email+ecid stitching |
| `lab_send_edge_event` | `POST /api/events/edge` | Advanced: direct datastream_id + optional raw_payload |
| `lab_generate_profiles_batch` | *(async job)* | 1–100 profiles; `segment_hint`, `delay_ms` |
| `lab_batch_job_status` | *(job store)* | Poll `profile_batch` or `onboard_all` jobs |
| `lab_provision_profile_infra_step` | infra step API | Provisioning wizard step |
| `lab_enable_profile` | enable-profile API | Enable profile on infra |
| `lab_sandbox_profile_config` | status-all + connection APIs | `ready`, `missing_steps`, `next_action` |
| `lab_onboard_sandbox` | *(orchestrates provisioning)* | `plan`, `execute`, or `execute_all` (async) |

**Industry aliases:** `telecommunications` / `telco` → `telecom`; `public` → `generic`.

### Per-principal sandbox ACL (Phase 3)

Default allowlist: env `AEP_LAB_MCP_ALLOWED_SANDBOXES` (`apalmer,kirkham`).

**Without redeploy**, ops can grant sandboxes per API key via Firestore:

- Collection: **`mcpSandboxAllowlist`**
- Document id: **`keyId`** — SHA-256 prefix (first 12 hex chars) of the MCP API key (same as audit logs)
- Fields: `allowedSandboxes[]`, `principalLabel`, `updatedAt`

Resolution order: Firestore doc for caller's `keyId` → env fallback.

Coworker can verify with **`lab_mcp_access_info`**.

**Seed a colleague (e.g. Kirkham, sandbox `kirkham`):**

```bash
cd tools/aep-lab-profile-mcp

# Dry-run (shows keyId + doc shape)
node scripts/seed-mcp-sandbox-allowlist.mjs \
  --dry-run \
  --api-key "$AEP_LAB_MCP_API_KEY" \
  --sandboxes kirkham \
  --label kirkham

# Write to Firestore (ADC / gcloud auth application-default login)
node scripts/seed-mcp-sandbox-allowlist.mjs \
  --api-key "$AEP_LAB_MCP_API_KEY" \
  --sandboxes kirkham \
  --label kirkham
```

Shared key + per-principal docs: use the same `--api-key` and different `--sandboxes` only when rotating to per-colleague keys. For a dedicated Kirkham key, rotate Secret Manager `aep-lab-profile-mcp-api-key` (or issue a second key in a future release) and seed `mcpSandboxAllowlist/{thatKeyId}`.

### Segment hints (Phase 3.1)

On **`lab_generate_profile`** and **`lab_generate_profiles_batch`** when `randomize: true` and `attributes` omitted:

| Industry | `segment_hint` | Persona overlay |
|----------|----------------|-----------------|
| **travel** | `hotel_reactivation` | Checkout **>12 months ago**, `totalNights` ≥5, churn >0.5, propensity >0.65 — aligns with hotel edge segments |
| **travel** | `hotel_high_value` | Platinum tier, high LTV/propensity, recent stay, rich `hotel.bookingDetails` |
| **fsi** | `high_net_worth` | Income `500k_plus`, excellent credit (780+), high savings/investment holdings, platinum tier |
| **fsi** | `credit_rebuild` | Income `under_50k`, poor credit (≤579), elevated churn, low propensity |
| **retail** | `loyalty_vip` | Platinum loyalty, LTV ≥25k, high ordersYTD, cobranded card, high retail propensity scores |
| **retail** | `cart_abandoner` | Recent basket activity, low propensity/churn risk, modest LTV — abandonment demo cohort |

Base personas for all **7 industries** (generic, travel, fsi, retail, telecom, media, sports) mirror Profile Viewer **Fill random sample** correlations: FSI income→credit band, retail order-value triplet, telecom bundle coherence, media subscription/viewing, sports fan/team, etc. Implementation: `src/personaBuilder/` submodules.

### Batch & onboard async jobs (Phase 3)

- **`lab_generate_profiles_batch`**: optional `segment_hint`, `delay_ms` (0–5000, overrides env).
- **`lab_onboard_sandbox`** `mode=execute_all`: queues **`onboard_all`** job — provisions all not-ready industries sequentially; poll **`lab_batch_job_status`** (same store as batch).
- Job store: Firestore **`mcpProfileBatchJobs`** on Cloud Run; `AEP_LAB_MCP_BATCH_STORE=memory` locally.

### Rate limits (Phase 3, in-memory per instance)

| Limit | Scope |
|-------|--------|
| 30 / minute | `lab_generate_profile` + each batch item generate |
| 30 / minute | `lab_send_profile_event` + `lab_send_edge_event` (shared bucket) |
| 3 / hour | new `lab_generate_profiles_batch` jobs |

Clear MCP error with `retryAfterSec`. Not global across Cloud Run instances.

### Audit logging (Phase 3)

Structured JSON to **stdout** (Cloud Logging) **and** Firestore collection **`mcpProfileAuditLog`**:

`timestamp`, `keyId`, `tool`, `sandbox`, `industry`, `email`/`identifier`, `result` (`ok`/`error`), `durationMs`, optional `jobId`.

Disable Firestore locally: `AEP_LAB_MCP_FIRESTORE=off`.

### Event sending workflow (Phase 3.2)

Mirrors Profile Viewer **Event tool** (`event-generator.html`):

1. **`lab_generate_profile`** — capture `ecid` from response (or use email).
2. **`lab_list_event_targets`** — pick `target_id` (Edge or DCS streaming preset).
3. **`lab_send_profile_event`** — send with email/ecid + optional event_type, view_name, channel, public fields.
4. **`lab_profile_activity`** or **`lab_get_profile`** — verify events landed on the profile.

Advanced: **`lab_send_edge_event`** when you have `datastream_id` directly (optional `raw_payload` for full Edge interact body).

Read-only event history is already available via **`lab_profile_activity`** (GET `/api/profile/events`).

### Profile Viewer workflows (Phase 2.1)

**Get → discuss → update (full stitch)** — see Phase 2 docs; `lab_update_profile` uses full-snapshot stitch.

### Sandbox config & onboarding (Phase 2.2 + 3)

Connection stores per industry in Firestore (see Phase 2 README section). **`lab_onboard_sandbox`**:

- `mode=plan` — Coworker checklist
- `mode=execute` + `industry` — one industry (sync, avoids timeout)
- `mode=execute_all` — async all industries (**poll `lab_batch_job_status`**)

## Environment

Copy `.env.mcp.example` → `.env.mcp` (gitignored):

```bash
cp tools/aep-lab-profile-mcp/.env.mcp.example tools/aep-lab-profile-mcp/.env.mcp
openssl rand -hex 32   # AEP_LAB_MCP_API_KEY
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AEP_LAB_MCP_API_KEY` | Yes | Secret sent as `X-AEP-Lab-Mcp-Key` |
| `AEP_LAB_API_ORIGIN` | No | Lab origin (default hosted lab) |
| `AEP_LAB_MCP_ALLOWED_SANDBOXES` | No | Env fallback allowlist (default `apalmer,kirkham`) |
| `AEP_LAB_MCP_BATCH_STORE` | No | `memory` for local; omit for Firestore on Cloud Run |
| `AEP_LAB_MCP_BATCH_DELAY_MS` | No | Default batch delay (500ms, max 5000) |
| `AEP_LAB_MCP_FIRESTORE` | No | Set `off` to skip Firestore audit/ACL reads locally |
| `GOOGLE_CLOUD_PROJECT` | Cloud Run | `aep-orchestration-lab` |
| `AEP_LAB_MCP_OAUTH_ISSUER` / `AUDIENCE` | No | Phase 3.5 OAuth scaffold only |
| `PORT` / `HOST` | No | HTTP bind |

## Run locally

```bash
cd tools/aep-lab-profile-mcp
npm install
npm start
```

Tests:

```bash
AEP_LAB_MCP_API_KEY='local-smoke-test-key' npm run smoke
AEP_LAB_MCP_API_KEY='test' AEP_LAB_MCP_BATCH_STORE=memory AEP_LAB_MCP_FIRESTORE=off npm run test:phase2
AEP_LAB_MCP_API_KEY='test' AEP_LAB_MCP_BATCH_STORE=memory AEP_LAB_MCP_FIRESTORE=off npm run test:phase3
```

## Adobe AI Coworker setup

```json
"aep-orchestration-lab-mcp": {
  "type": "streamable-http",
  "url": "https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp",
  "headers": {
    "X-AEP-Lab-Mcp-Key": "<same value as AEP_LAB_MCP_API_KEY>"
  }
}
```

**Tool timeouts:** ≥ **300s** for infra, get/update/activity, provisioning, and `execute_all` polling.

## Deploy to Cloud Run

GCP project: **`aep-orchestration-lab`**, region: **`us-central1`**.

Cloud Run service account needs **Cloud Datastore User** for Firestore collections:

- `mcpProfileBatchJobs`
- `mcpProfileAuditLog`
- `mcpSandboxAllowlist`

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

## Onboarding a new sandbox

1. **Ops — allowlist:** Firestore `mcpSandboxAllowlist/{keyId}` **or** env `AEP_LAB_MCP_ALLOWED_SANDBOXES` + redeploy.
2. **Provision:** `lab_sandbox_profile_config` → `lab_onboard_sandbox` (`plan` / `execute` / `execute_all`).
3. **Verify:** `lab_mcp_access_info`, `lab_generate_profile`.

- `mcpSandboxAllowlist`
- `mcpApiKeys` (user-generated keys; hash lookup)

## Self-service API keys (Profile Viewer portal)

Colleagues with **approved lab access** can manage personal MCP keys on **Profile Viewer → MCP servers** (no ops seed script required for day-to-day use).

| API | Auth | Notes |
|-----|------|--------|
| `GET /api/lab/mcp-keys` | Firebase ID token | List keys (prefix, sandboxes, dates — no secret) |
| `POST /api/lab/mcp-keys` | Firebase ID token | Body `{ sandboxes: string[] }` — returns plaintext **once** |
| `POST /api/lab/mcp-keys/rotate` | Firebase ID token | Body `{ keyId, action: "rotate" }` — same `keyId`, new secret, old key invalid immediately |
| `DELETE /api/lab/mcp-keys?keyId=` | Firebase ID token | Revoke + remove `mcpSandboxAllowlist/{keyId}` |

- Max **3** active keys per user; sandboxes must match the user’s **workspace slug** and active Adobe sandboxes.
- Firestore: `mcpApiKeys/{keyId}` stores `keyHash` (SHA-256), `keyPrefix`, `allowedSandboxes`, `principalUid`, `revoked`.
- MCP Cloud Run auth: shared ops key (`AEP_LAB_MCP_API_KEY`) **or** user key via `keyHash` query on `mcpApiKeys`.
- Ops seed script `scripts/seed-mcp-sandbox-allowlist.mjs` remains for shared / legacy keys.

## Phase 3.5 OAuth (future)

`validateOAuthBearer` in `src/auth.mjs` checks `AEP_LAB_MCP_OAUTH_ISSUER` and `AEP_LAB_MCP_OAUTH_AUDIENCE`. When both are set, a stub returns *not implemented* until Coworker OIDC docs land. **Today:** use `X-AEP-Lab-Mcp-Key` only.

No changes to public Firebase `/api/*` profile routes in Phase 3.

## Related

- Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md`
- Stdio Adobe MCP: `tools/aep-lab-adobe-mcp/`
- Hotel segment seed reference: `scripts/bulk-seed-travel-hotel-segment-profiles.mjs`
