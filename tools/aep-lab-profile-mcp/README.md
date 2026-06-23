# AEP Orchestration Lab MCP (Phase 3.9)

Streamable HTTP [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes AEP Orchestration Lab **profile** APIs to **Adobe AI Coworker** and other MCP clients. Calls the hosted lab at `https://aep-orchestration-lab.web.app/api/...` (configurable).

**Version 3.9.0** — 30 tools + 6 framework resources. All tools authenticate with a **single** `X-AEP-Lab-Mcp-Key` header.

## Framework tools & resources (v3.6)

**Dual-stream generate (v3.6):** `lab_generate_profile` / `lab_generate_profiles_batch` with `industry` ≠ `generic` POST twice — generic-owned paths to `industry=generic`, then industry-owned paths to the target industry with `appendIfExisting:true` (same email/ECID). Response includes `dual_stream`, `generate_plan`, `generate_step_results`.

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
| `lab_get_generation_prefs` | `GET /api/lab/generation-prefs` | Shared Portal/MCP base email, counter N, next scaled email |
| `lab_set_generation_prefs` | `PUT /api/lab/generation-prefs` | Update base email, mobile, reset counter |
| `lab_confirm_generation_plan` | `GET /api/lab/generation-prefs` | Read-only preview before generate |
| `lab_list_industries` | *(static)* | Canonical keys + alias notes |
| `lab_list_sandboxes` | `GET /api/sandboxes` | Active sandboxes list |
| `lab_mcp_access_info` | *(read-only)* | keyId, allowed sandboxes, principal label — no secrets |
| `lab_mcp_first_run_setup` | `POST /api/lab/mcp-first-run-setup` + readiness | **First Coworker session** — workspace profile, RTDB ldapSlug, infra/event checklist |
| `lab_profile_infra_status` | `GET /api/profile-infra/status-all` | All industries; optional `industry` filter |
| `lab_generate_profile` | `POST /api/profile/generate` | Stream test profile; **use_stored_prefs** (default when email omitted) reserves shared Firestore counter via `POST /api/lab/generation-prefs/next-email` |
| `lab_lookup_profile` | `GET /api/profile/table` | UPS profile table (raw lab response) |
| `lab_get_profile` | `GET /api/profile/table` + attribute ownership | Coworker-friendly summary + writability hints |
| `lab_update_profile` | `POST /api/profile/update?industry=` | **Full-snapshot stitch** |
| `lab_profile_activity` | events + consent APIs | Narration string; optional audiences |
| `lab_list_event_targets` | `GET /api/events/generator-targets` | Static + Firestore Edge presets for Event tool |
| `lab_setup_event_infra` | `POST /api/events/infra/step` (`setupEventInfra`) | ExperienceEvent schema + field groups + dataset (Event tool step 1) |
| `lab_get_event_config` | `GET /api/events/config` | Read saved datastream/schema/dataset Firestore config |
| `lab_save_event_datastream` | Firestore `eventEdgeConfig` (Admin) | Save Edge datastream ID after Data Collection setup |
| `lab_preflight_profile_event` | *(dry-run)* | Resolve identityMap + target without sending |
| `lab_send_profile_event` | `POST /api/events/generator` | Send experience event (any `event_type` string); portal-identical POST body |
| `lab_send_profile_events_batch` | `POST /api/events/generator` × N | Multiple events, one profile; `events[]` or `event_types[]` |
| `lab_send_retail_journey_events` | `POST /api/events/generator` (×4) | Portal-aligned retail commerce journey pack; preflight + staggered timestamps |
| `lab_send_edge_event` | `POST /api/events/edge` | Advanced: direct datastream_id + optional raw_payload |
| `lab_generate_profiles_batch` | *(async job)* | 1–100 profiles; `segment_hint`, `delay_ms` |
| `lab_batch_job_status` | *(job store)* | Poll `profile_batch` or `onboard_all` jobs |
| `lab_provision_profile_infra_step` | infra step API | Provisioning wizard step |
| `lab_enable_profile` | enable-profile API | Enable profile on infra |
| `lab_sandbox_profile_config` | status-all + connection APIs | `ready`, `missing_steps`, `next_action` |
| `lab_onboard_sandbox` | *(orchestrates provisioning)* | `plan`, `execute`, or `execute_all` (async) |
| `lab_brand_scrape` | `POST …/brandScraperAnalyze` (direct CF) + poll `GET …/scrapes/{id}` | Crawl brand URL; dedupes by default (`prefer_existing:true`); same Firestore/GCS as Portal |
| `lab_resolve_brand_scrape` | `GET /api/brand-scraper/scrapes` | Find reusable scrape for URL before crawling; returns scrape_id or need_new_scrape |
| `lab_cancel_brand_scrape` | `POST …/scrapes/{id}/cancel` | Cancel stuck Running scrape (Portal parity) |
| `lab_list_brand_scrapes` | `GET /api/brand-scraper/scrapes` | History list for sandbox |
| `lab_get_brand_scrape` | `GET /api/brand-scraper/scrapes/{id}` | Full record + Coworker summary (colours, fonts, personas) |
| `lab_generate_profile_from_brand_scrape` | `GET` scrape + `POST /api/profile/generate` + `POST /api/lab/generation-prefs/next-email` | Map scrape persona → golden UPS profile; **default** reserves scaled email + static mobile from Firestore generation prefs (Portal parity) |
| `lab_generate_profiles_from_brand_scrape` | same (all personas) | Batch alias — one profile per scrape persona; each reserves next prefs email |
| `lab_prepare_demo_from_brand_scrape` | profiles + optional events + optional CJv2 | Orchestrated demo prep; events step sends retail commerce journey when lab_industry=retail |
| `lab_create_journey_from_brand_scrape` | `GET` import/profile + `POST` clientJourneyV2Generate | Client Journey v2 HTML asset (not AJO platform journey) |

**Industry aliases:** `telecommunications` / `telco` → `telecom`; `public` → `generic`.

### Brand scrape (Phase 3.8)

Mirrors Profile Viewer **[Brand scraper](https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html)**:

0. **`lab_resolve_brand_scrape`** — list history for sandbox, match normalized URL host/path, return existing `scrape_id` when `scrapeStatus=complete` and `personasPresent` (configurable). Optional explicit check before scraping.
1. **`lab_brand_scrape`** — `url` + `sandbox`; hits direct Cloud Function `brandScraperAnalyze` (540s, bypasses Hosting 60s cap). Default **`prefer_existing:true`** reuses complete scrapes with personas for the same URL; **`force_new:true`** starts a fresh crawl. Default **`wait_for_complete:true`** polls until `scrapeStatus` is `complete` or `failed`.
2. **`lab_list_brand_scrapes`** — same Firestore index `brandScrapes/{sandbox}__{scrapeId}` the portal history uses.
3. **`lab_get_brand_scrape`** — hydrates GCS `record.json` + summary for Coworker (colours, fonts, about, persona counts).
4. **`lab_generate_profile_from_brand_scrape`** — maps a scrape marketing persona to a streamed AEP test profile (overlay name/age/location from scrape + randomized industry paths). **Omits persona-derived emails** — by default each profile calls `POST /api/lab/generation-prefs/next-email` (shared Portal counter + static mobile). Use **`lab_generate_profiles_from_brand_scrape`** for all personas, or **`lab_prepare_demo_from_brand_scrape`** to chain profiles + events + Client Journey v2 (accepts `scrape_id` or `url`).
5. **`lab_create_journey_from_brand_scrape`** — Client Journey Asset v2 (presentation HTML). **Not** an AJO platform journey create; lab has read-only `journeysBrowse` only.

Storage: Firestore index + GCS bucket `aep-orchestration-lab-brand-scrapes` (see `functions/brandScrapeStore.js`). Scrapes also surface in **Image hosting** and **Client Journey Asset v2** import pickers.

**Personas vs golden profiles:** Brand scraper personas are LLM narrative cards (goals, pain points, suggested segment *names*). They do not automatically create UPS profiles until `lab_generate_profile_from_brand_scrape` (or manual `lab_generate_profile`). Scrape `segments[]` are demo copy for presentations — not RTCDP audience definitions.

Optional env: **`AEP_LAB_BRAND_SCRAPER_CF_ORIGIN`** (default `https://us-central1-aep-orchestration-lab.cloudfunctions.net`).

**Tool timeouts:** set MCP client ≥ **540s** for `lab_brand_scrape` when `wait_for_complete:true`.

### Segment hints (Phase 3.1)

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
3. **`lab_send_profile_event`** — send with email/ecid + **any** `event_type` string (Event tool datalist is suggestions only), view_name, channel, public, message, timestamp (+ `_id`).
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
| `AEP_LAB_BRAND_SCRAPER_CF_ORIGIN` | No | Direct CF base for brandScraperAnalyze (default us-central1 project cloudfunctions.net) |
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

**Tool timeouts:** ≥ **300s** for infra, get/update/activity, provisioning, and `execute_all` polling. ≥ **540s** for **`lab_brand_scrape`** when waiting for completion.

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
  --timeout 540 \
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
| `GET /api/lab/mcp-keys?sandbox=` | Firebase ID token | List keys; `currentKey` is the active key for that sandbox |
| `POST /api/lab/mcp-keys?sandbox=` | Firebase ID token | Body `{ sandbox: "kirkham" }` — one key per user per sandbox; plaintext **once** |
| `POST /api/lab/mcp-keys/rotate` | Firebase ID token | Body `{ keyId, action: "rotate" }` — same `keyId`, new secret, old key invalid immediately |
| `DELETE /api/lab/mcp-keys?keyId=` | Firebase ID token | Revoke + remove `mcpSandboxAllowlist/{keyId}` |

- One active key per user **per sandbox**; `allowedSandboxes` on the key is always `[sandbox]`. Legacy multi-sandbox keys still work via `allowedSandboxes[0]`.
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
