# AEP Orchestration Lab MCP (Phase 3.38)

Streamable HTTP [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes AEP Orchestration Lab **profile** APIs to **Adobe AI Coworker** and other MCP clients. Calls the hosted lab at `https://aep-orchestration-lab.web.app/api/...` (configurable).

**Version 3.40.0.** All Lab tools authenticate with a **single** `X-AEP-Lab-Mcp-Key` header.

## Focused endpoints for Coworker

The original `/mcp` endpoint remains backward compatible and exposes the complete catalog. Clients that struggle to invoke tools from a large deferred catalog can connect to a focused endpoint using the same API key header:

| Endpoint | Tools | Intended workflow |
|----------|------:|-------------------|
| `/mcp/guide` | 5 | Read-only access check, capability directory, context recommendation, cross-context workflow planning, and `lab_load_toolset` to pull another toolset into this same session |
| `/mcp/profile` | 20 | Complete profile lifecycle: readiness, create/update/read, governed AEP industry events, and Snowflake dual-load readiness, enrichment, and readback |
| `/mcp/audiences` | 4 | Access check plus governed list → audit → delete |
| `/mcp/ajo-cleanup` | 7 | Access check plus governed journey and campaign list → audit → one exact delete |
| `/mcp/decisioning` | 9 | Edge evaluation, explanation, treatment resolution, and catalog health |
| `/mcp/demo-prep` | 21 | Brand scrape, Gemini image classification, governed all-in-one customer switching, stable asset restore, RTDB, and one-shot demo preparation |
| `/mcp/pdf` | 14 | HTML/document upload, draft and merge preview, PDF generation/storage, recent jobs, and server-template management |

Every tool publishes MCP read-only, destructive, idempotent, and open-world annotations. Structured request telemetry records only endpoint, toolset, RPC method, tool name, HTTP status, and duration—never API keys or tool arguments.

### Read-only MCP guide (Phase 3.38)

Configure `aep-lab-guide` as a lightweight companion when Coworker has several Lab MCPs. It describes the available contexts and recommends the smallest useful one, but deliberately does **not** expose a generic proxy or `call_any_tool` operation. The Coworker host must already have each recommended server configured.

| Guide tool / resource | Purpose |
|---|---|
| `lab_mcp_contexts` | Copy-ready context names, URLs, capabilities, access method, and safety posture |
| `lab_mcp_recommend_context` | Deterministic goal-to-context recommendation with a suggested handoff prompt |
| `lab_mcp_workflow` | Read-only multi-context plans such as customer demo preparation or governed cleanup |
| `lab_load_toolset` | Registers another toolset (`profile`, `audiences`, `ajo-cleanup`, `decisioning`, `demo-prep`, `pdf`, `command-centre`) into the *current* session via `McpServer.registerTool` + `sendToolListChanged` — no reconnect needed. Guide-endpoint only; the full `/mcp` catalog already has everything, and the other focused endpoints stay intentionally scoped. |
| `lab://mcp/contexts` | Static capability directory resource |
| `lab://mcp/workflows/{workflow}` | Static workflow plan resource |

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
| `lab_mcp_contexts` | *(static)* | Canonical Lab and Adobe MCP capability directory |
| `lab_mcp_recommend_context` | *(static)* | Recommends the smallest useful configured MCP context for a goal |
| `lab_mcp_workflow` | *(static)* | Cross-context handoff plan; never invokes another MCP |
| `lab_load_toolset` | *(local, no Lab API call)* | Registers another named toolset into the current session (guide endpoint only) |
| `lab_get_execution_framework` | *(static)* | Lab execution framework JSON — **criticalRules** at top |
| `lab_get_industry_playbook` | *(static)* | Per-industry playbook; omit industry for all |
| `lab_preflight_profile_generate` | status-all + connection APIs | Dry-run generate: config ready + payload preview |
| `lab_confirm_profile_generation` | `GET` + optional `PUT /api/lab/generation-prefs` | Ask colleague format questions; `confirmed:true` persists base email + mobile |
| `lab_get_generation_prefs` | `GET /api/lab/generation-prefs` | Shared Portal/MCP base email, counter N, next scaled email |
| `lab_set_generation_prefs` | `PUT /api/lab/generation-prefs` | Update base email, mobile, reset counter |
| `lab_confirm_generation_plan` | `GET /api/lab/generation-prefs` | Read-only preview before generate |
| `lab_list_industries` | *(static)* | Canonical keys + alias notes |
| `lab_list_sandboxes` | `GET /api/sandboxes` | Active sandboxes list |
| `lab_mcp_access_info` | *(read-only)* | keyId, allowed sandboxes, principal label — no secrets |
| `lab_mcp_first_run_setup` | `POST /api/lab/mcp-first-run-setup` + readiness | **First Coworker session** — workspace profile, RTDB ldapSlug, infra/event checklist |
| `lab_demo_config_inspect` | `GET /api/lab/demo-config` | Read-only structure and current values for the MCP key owner's RTDB workspace; protected values redacted |
| `lab_demo_config_preview` | `POST /api/lab/demo-config` (`action=preview`) | Before/after diff for allowlisted manual changes or evidence-backed mappings from a completed brand scrape |
| `lab_demo_config_apply` | `POST /api/lab/demo-config` (`action=apply`) | Confirmed, conflict-checked, idempotent atomic RTDB update with readback and revision |
| `lab_demo_config_restore` | `POST /api/lab/demo-config` (`action=restore-preview/apply`) | Preview-first rollback of a prior revision |
| `lab_demo_assets_inspect` | `GET /api/lab/demo-assets` | Active stable image slots, permanent URLs, hashes, and saved customer revisions |
| `lab_brand_scrape_classify_images` | `POST brandScraperClassify` | Auto-classify up to 20 scrape images with Gemini vision; skip when usable saved categories already exist unless forced |
| `lab_demo_assets_preview_from_scrape` | `POST /api/lab/demo-assets` (`action=preview`) | Transform a completed scrape into preview-only fixed logo/hero/mobile PNG slots |
| `lab_demo_assets_apply` | `POST /api/lab/demo-assets` (`action=apply`) | Confirmed activation with current-customer backup, conflict detection, verification, idempotency, and rollback |
| `lab_demo_assets_restore` | `POST /api/lab/demo-assets` (`action=restore-preview/apply`) | Preview-first restoration of a named customer revision to the same stable CDN paths |
| `lab_demo_customer_switch` | `POST /api/lab/demo-assets` (`action=switch-apply`) | Preferred two-phase switch: preview RTDB plus all five image slots, then one confirmed apply with verification and cross-system rollback |
| `lab_profile_infra_status` | `GET /api/profile-infra/status-all` | All industries; optional `industry` filter |
| `lab_generate_profile` | `POST /api/profile/generate` | Stream test profile; **use_stored_prefs** reserves the shared counter; **dual_load_snowflake** creates an independent CRM row; non-travel **snowflake_enrichment** optionally adds industry events |
| `lab_snowflake_config` | `GET /api/snowflake/config` | Redacted Snowflake connection readiness — **user MCP key required** |
| `lab_snowflake_test_connection` | `POST /api/snowflake/connection-test` | `SELECT CURRENT_VERSION()`; NETWORK POLICY hints (static IP 34.58.81.28) |
| `lab_snowflake_generate_base_profiles` | `POST /api/snowflake/generate-base-profiles` | Snowflake-only batch INSERT; default **use_generation_prefs:true** (shared Firestore `<local>+DDMMYYYY-N@domain` counter) |
| `lab_snowflake_create_profile` | `POST /api/snowflake/insert-profile-from-aep` | Single independent industry CRM row (dual-load repair) |
| `lab_snowflake_get_profile_by_email` | `POST /api/snowflake/agentic/query-profiles` | **Full industry row by email**; optional `industry` defaults to travel |
| `lab_snowflake_query_profiles` | `POST /api/snowflake/agentic/query-profiles` | Industry-aware full-row readback by email/ecid or list filters |
| `lab_snowflake_enrich_profiles` | `POST /api/snowflake/agentic/enrich-profiles` | Populate selected industry event/enrichment tables for existing CRM profiles |
| `lab_snowflake_get_profile_bundle` | `POST /api/snowflake/agentic/profile-bundle` | Non-travel profile plus bounded rows from all five allowlisted activity tables |
| `lab_snowflake_provision` | `POST /api/snowflake/provision` | Governed recipes, including `{fsi,retail,telecom,media,sports}.all.v1` (six tables each) |
| `lab_live_activity_list_templates` | `GET /api/ajo/live-activity/templates` | Built-in + principal/sandbox customer templates |
| `lab_live_activity_get_template` | `GET /api/ajo/live-activity/templates` | Full template and required-variable definitions |
| `lab_live_activity_profile_context` | `GET /api/profile/table` + `/api/profile/consent` | Resolve profile ECID and suggest `live_activity_id` from `liveActivityPushNotificationDetails.0.token` |
| `lab_live_activity_get_execution_state` | `GET /api/ajo/live-activity/execution-state` | Read Campaign / Live Activity IDs shared with the Portal UI for this user + sandbox |
| `lab_live_activity_save_execution_state` | `POST /api/ajo/live-activity/execution-state` | Persist colleague-supplied IDs into the same per-user, per-sandbox Portal state |
| `lab_live_activity_preflight` | `POST /api/ajo/live-activity/preflight` | Required dry-run; missing fields or redacted preview + short-lived preflight ID |
| `lab_live_activity_send` | `POST /api/ajo/live-activity` | Confirmed, hash-bound, idempotent AJO unitary execution |
| `lab_live_activity_upsert_template` | `POST /api/ajo/live-activity/templates` | Create/version principal + sandbox customer template; mirrors Portal |
| `lab_live_activity_delete_template` | `DELETE /api/ajo/live-activity/templates` | Confirmed custom-template deletion |
| `lab_live_activity_list_runs` | `GET /api/ajo/live-activity/runs` | Recent principal/sandbox execution audit |
| `lab_audience_list` | `GET /api/audience-management` | Read-only Segmentation audience inventory/search; user-generated MCP key + exact sandbox scope required |
| `lab_audience_audit` | `GET /api/audience-management?audience_id=…` | Required exact-ID pre-delete review: current name, origin, lifecycle, dates, dependencies/dependents and limitations |
| `lab_audience_delete` | `DELETE /api/audience-management` | Irreversible single-audience delete only after explicit confirmation; re-reads and exact-matches ID + name |
| `lab_ajo_journey_list` | `GET /api/ajo-cleanup?asset_type=journey` | Read-only journey inventory/search with exact sandbox scope |
| `lab_ajo_journey_audit` | `GET /api/ajo-cleanup?asset_type=journey&asset_id=…` | Exact-ID lifecycle and metadata review; returns confirmation fields and blockers |
| `lab_ajo_journey_delete` | `DELETE /api/ajo-cleanup` | One Draft or Finished journey only; exact ID/name/status confirmation and immediate re-read |
| `lab_ajo_campaign_list` | `GET /api/ajo-cleanup?asset_type=campaign` | Read-only campaign inventory/search with exact sandbox scope |
| `lab_ajo_campaign_audit` | `GET /api/ajo-cleanup?asset_type=campaign&asset_id=…` | Exact-ID lifecycle, audience/message, and metadata review |
| `lab_ajo_campaign_delete` | `DELETE /api/ajo-cleanup` | One Draft campaign only; exact ID/name/status confirmation and immediate re-read |
| `lab_lookup_profile` | `GET /api/profile/table` | UPS profile table (raw lab response) |
| `lab_get_profile` | `GET /api/profile/table` + attribute ownership | Coworker-friendly summary + writability hints |
| `lab_update_profile` | `POST /api/profile/update?industry=` | **Full-snapshot stitch** |
| `lab_profile_activity` | events + consent APIs | Narration string; optional audiences |
| `lab_list_event_targets` | `GET /api/events/generator-targets` | Static + Firestore Edge presets for Event tool |
| `lab_setup_event_infra` | `POST /api/events/infra/step` (`setupEventInfra`) | ExperienceEvent schema + field groups + dataset (Event tool step 1) |
| `lab_get_event_config` | `GET /api/events/config` | Read saved datastream/schema/dataset Firestore config |
| `lab_save_event_datastream` | Firestore `eventEdgeConfig` (Admin) | Save Edge datastream ID after Coworker **dx-api** or Data Collection setup |
| `lab_preflight_profile_event` | *(dry-run)* | Resolve identityMap + target; preview governed `industry` + `industry_fields` payloads |
| `lab_send_profile_event` | `POST /api/events/generator` | Minimal by default; optional `industry` + flat `industry_fields` builds validated `public.{industry}.*` full XDM |
| `lab_send_profile_events_batch` | `POST /api/events/generator` × N (sequential) | One generator POST per event; `events[]` supports optional `industry` + `industry_fields` per step |
| `lab_send_retail_journey_events` | `POST /api/events/generator` (×4) | Portal-aligned retail commerce journey pack; preflight + staggered timestamps |
| `lab_send_edge_event` | `POST /api/events/edge` | Advanced: direct datastream_id + optional raw_payload |
| `lab_generate_profiles_batch` | *(async job)* | 1–100 profiles; `segment_hint`, `delay_ms` |
| `lab_batch_job_status` | *(job store)* | Poll `profile_batch` or `onboard_all` jobs |
| `lab_provision_profile_infra_step` | infra step API | Provisioning wizard step |
| `lab_enable_profile` | enable-profile API | Enable profile on infra |
| `lab_sandbox_profile_config` | status-all + connection APIs | `ready`, `missing_steps`, `next_action` |
| `lab_onboard_sandbox` | *(orchestrates provisioning)* | `plan`, `execute`, or `execute_all` (async) |
| `lab_brand_scrape` | `POST …/brandScraperAnalyze` (direct CF) + poll `GET …/scrapes/{id}` | Crawl brand URL; optional `upload` + `upload_only` / `use_as_fallback`; dedupes complete + in-flight scrapes per URL |
| `lab_brand_scrape_brief` | *(local markdown generator)* | Offline fallback brief + LLM task prompt when crawl fails (403/bot protection) |
| `lab_brand_scrape_upload` | `POST …/brandScraperAnalyze` with uploaded HTML/ZIP | Upload-only analyse — same Portal HTML upload path; max 30 MB / ~40 files |
| `lab_poll_brand_scrape` | `GET …/scrapes/{id}` (poll loop) | Human-readable progress until complete/failed/timeout — use instead of parallel `lab_brand_scrape` retries |
| `lab_resolve_brand_scrape` | `GET /api/brand-scraper/scrapes` | Find reusable or in-flight scrape for URL; returns scrape_id or need_new_scrape |
| `lab_cancel_brand_scrape` | `POST …/scrapes/{id}/cancel` | Cancel stuck Running scrape (Portal parity) |
| `lab_list_brand_scrapes` | `GET /api/brand-scraper/scrapes` | History list for sandbox |
| `lab_get_brand_scrape` | `GET /api/brand-scraper/scrapes/{id}` | Full record + Coworker summary (colours, fonts, personas, demo website URL when present) |
| `lab_build_demo_website` | `POST …/brandScraperAnalyze` (`mode: demo_build`, direct CF) | Regenerate Profile Viewer site clone from existing scrape — no new crawl |
| `lab_generate_profile_from_brand_scrape` | `GET` scrape + `POST /api/profile/generate` + `POST /api/lab/generation-prefs/next-email` | Map scrape persona → golden UPS profile; **default** reserves scaled email + static mobile from Firestore generation prefs (Portal parity) |
| `lab_generate_profiles_from_brand_scrape` | same (all personas) | Batch alias — one profile per scrape persona; each reserves next prefs email |
| `lab_prepare_demo_from_brand_scrape` | RTDB preview + profiles + optional events + optional CJv2 | Orchestrated demo prep; `steps.demo_config_preview` is preview-only and requires separate confirmed apply |
| `lab_create_journey_from_brand_scrape` | `GET` import/profile + `POST` clientJourneyV2Generate | Client Journey v2 HTML asset (not AJO platform journey) |

**Industry aliases:** `telecommunications` / `telco` → `telecom`; `public` → `generic`.

### Governed audience cleanup (Phase 3.32)

Audience deletion uses a dedicated allowlisted proxy, never the generic `/api/aep` route. It requires a user-generated MCP key whose single sandbox scope exactly matches the request.

1. `lab_audience_list sandbox apalmer name "demo"` — inspect IDs, origin, lifecycle and timestamps. This is read-only.
2. `lab_audience_audit sandbox apalmer audience_id {exact id}` — review dependencies/dependents, source-system warning, and the limits of what the audience record can prove. Destination, Account Audience and AJO usage may still cause Adobe to reject deletion.
3. Show the exact sandbox, `audience_id`, and `expected_name` returned by audit. Obtain explicit colleague confirmation for that one audience.
4. `lab_audience_delete sandbox apalmer audience_id {id} expected_name {exact name} confirmed true` — the server re-fetches immediately and fails closed if the ID/name changed. No batch delete tool exists.

Adobe documents successful `DELETE /data/core/ups/audiences/{id}` as HTTP 204. The MCP records list, audit and delete calls in `mcpProfileAuditLog`; deletes include the selected audience ID and result.

### Governed AJO journey and campaign cleanup (Phase 3.36)

Use `/mcp/ajo-cleanup` for a compact seven-tool context, or use the same six cleanup tools through the complete `/mcp` endpoint. The user-generated MCP key must match the requested sandbox exactly.

1. Run `lab_ajo_journey_list` or `lab_ajo_campaign_list` and select one exact ID.
2. Run the matching audit tool. It returns current name, status, timestamps, blockers, and exact confirmation values.
3. Show the exact sandbox, ID, name, and status. Obtain explicit confirmation for that one asset.
4. Run the matching delete tool with the returned `expected_name`, `expected_status`, and `confirmed true`.
5. The Firebase proxy re-fetches immediately, blocks identity/lifecycle changes, and permits only Draft or Finished journeys and Draft campaigns. There is no batch delete tool.

Adobe's current public Journey and Campaign references document retrieval but not deletion. These delete calls use the allowlisted AJO authoring operations used by product lifecycle management; availability still depends on the integration's Journey/Campaign permissions and Adobe may reject unsupported dependencies.

### Governed Real-Time Database demo preparation (Phase 3.31)

RTDB demo configuration is scoped to the Firebase `principalUid` on a **user-generated** MCP key. The Firebase API resolves the saved workspace slug and verifies `workspaceClaims`; tools never accept an arbitrary `ajoLookups/{slug}` path. Shared ops keys are rejected.

1. `lab_demo_config_inspect sandbox apalmer` — show the current tree, ordinary values, descriptions, editable fields and validation rules.
2. `lab_demo_config_preview sandbox apalmer changes [...]` — or pass `scrape_id` to map verified brand name/URL/stable logo/colour and inferred industry. No write occurs.
3. Show the returned diff and obtain explicit colleague confirmation.
4. `lab_demo_config_apply sandbox apalmer preflight_id ... confirmed true idempotency_key ...` — atomic partial update, readback verification and automatic revision.
5. Re-run inspect. Use `lab_demo_config_restore` to preview and then confirm a rollback.

Protected metadata, infrastructure sections, uncatalogued fields, nested objects, expiring signed logo URLs and invented scrape values remain read-only. Preflights expire after 15 minutes and fail closed if any proposed field changed after preview.

### Brand scrape (Phase 3.8)

Mirrors Profile Viewer **[Brand scraper](https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html)**:

0. **`lab_resolve_brand_scrape`** — list history for sandbox, match normalized URL host/path, return existing `scrape_id` when complete (with personas) or **in-flight** when a crawl is already running.
1. **`lab_brand_scrape`** — `url` + `sandbox`; hits direct Cloud Function `brandScraperAnalyze` (540s, bypasses Hosting 60s cap). Default **`prefer_existing:true`** reuses complete scrapes with personas **and** in-flight scrapes for the same URL; **`force_new:true`** starts a fresh crawl. Set **`include.demoWebsite:true`** to build a Profile Viewer site clone after analysis (same as Portal Options → Demo website). Default **`wait_for_complete:true`** polls until `scrapeStatus` is `complete` or `failed`.
1a. **`lab_build_demo_website`** — `scrape_id` + `sandbox`; POST `mode: demo_build` to the same Cloud Function (Portal **Regenerate demo**). Use when the scrape exists but has no demo folder, or set **`regenerate:true`** to overwrite. Polls until complete by default.
1b. **`lab_poll_brand_scrape`** — poll with progress messages when Coworker needs to reassure the user or `lab_brand_scrape` timed out. **Do not** start another `lab_brand_scrape` for the same URL while one is running.
2. **`lab_list_brand_scrapes`** — same Firestore index `brandScrapes/{sandbox}__{scrapeId}` the portal history uses.
3. **`lab_get_brand_scrape`** — hydrates GCS `record.json` + summary for Coworker (colours, fonts, about, persona counts).
4. **`lab_generate_profile_from_brand_scrape`** — maps a scrape marketing persona to a streamed AEP test profile (overlay name/age/location from scrape + randomized industry paths). **Omits persona-derived emails** — by default each profile calls `POST /api/lab/generation-prefs/next-email` (shared Portal counter + static mobile). Use **`lab_generate_profiles_from_brand_scrape`** for all personas, or **`lab_prepare_demo_from_brand_scrape`** to chain profiles + events + Client Journey v2 (accepts `scrape_id` or `url`).
5. **`lab_create_journey_from_brand_scrape`** — Client Journey Asset v2 (presentation HTML). **Not** an AJO platform journey create; lab has read-only `journeysBrowse` only.

Storage: Firestore index + GCS bucket `aep-orchestration-lab-brand-scrapes` (see `functions/brandScrapeStore.js`). Scrapes also surface in **Image hosting** and **Client Journey Asset v2** import pickers.

**Personas vs golden profiles:** Brand scraper personas are LLM narrative cards (goals, pain points, suggested segment *names*). They do not automatically create UPS profiles until `lab_generate_profile_from_brand_scrape` (or manual `lab_generate_profile`). Scrape `segments[]` are demo copy for presentations — not RTCDP audience definitions.

Optional env: **`AEP_LAB_BRAND_SCRAPER_CF_ORIGIN`** (default `https://us-central1-aep-orchestration-lab.cloudfunctions.net`).

**Tool timeouts:** set MCP client ≥ **540s** for `lab_brand_scrape` when `wait_for_complete:true`. ≥ **600s** when **`include.demoWebsite:true`** or **`lab_build_demo_website`** (demo build adds several minutes after crawl).

### Brand scrape offline fallback (Phase 3.20)

When live crawl fails (403, bot protection, login wall):

1. **`lab_brand_scrape_brief`** — markdown brief + copy-paste LLM task prompt (mirrors Portal Download brief).
2. Colleague runs external LLM or manual Chrome save-page + Image Eye → ZIP ≤ **30 MB**, ~**40 files**.
3. **`lab_brand_scrape_upload`** — `upload.zip_base64` or `upload.files[]`; default `upload_only:true` (Alan/kirkham upload path = Portal Options → HTML upload).
4. **`lab_poll_brand_scrape`** → optional **`lab_build_demo_website`**.

Resource: **`lab://framework/brand-scrape-offline`**. Failed `lab_brand_scrape` responses include `coworkerHints.offlineFallback`.

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
3. **`lab_send_profile_event`** — send with email/ecid + **any** `event_type` string + optional `channel`. **Coworker: pass tool params only** (`sandbox`, `email`, `ecid`, `event_type`, `channel`) — **never** custom XDM, schema refs, or mixin blobs. Server builds minimal Edge XDM via `buildGeneratorEdgeInteractXdm` (`identityMap`, `eventType`, `_id`, `timestamp`, `interactionDetails` when channel set). Omit `public`/`message`/`xdm_style=full` unless colleague explicitly needs rich tenant fields.
4. **`lab_profile_activity`** or **`lab_get_profile`** — verify events landed on the profile.

**Multi-event intent demos:** `lab_send_profile_events_batch` with `event_types: ["donation.made", "web.webPageDetails.pageViews", "transaction"]` — sequential generator POSTs (not one Edge bulk payload), same identity, no XDM construction. Edge results use `requestId` (`eventId` is null for `lab-event-tool-edge`).

Advanced: **`lab_send_edge_event`** when you have `datastream_id` directly. **Avoid `raw_payload`** — schema injection causes failures; prefer `lab_send_profile_event`.

Read-only event history is already available via **`lab_profile_activity`** (GET `/api/profile/events`).

### Profile Viewer workflows (Phase 2.1)

**Get → discuss → update (full stitch)** — see Phase 2 docs; `lab_update_profile` uses full-snapshot stitch.

### Sandbox config & onboarding (Phase 2.2 + 3)

Connection stores per industry in Firestore (see Phase 2 README section). **`lab_onboard_sandbox`**:

- `mode=plan` — Coworker checklist
- `mode=execute` + `industry` — one industry (sync, avoids timeout)
- `mode=execute_all` — async all industries (**poll `lab_batch_job_status`**)

### HTTP streaming dataflows — Lab MCP + Coworker dx-api

Lab MCP **creates schema, field groups, and Profile-enabled dataset** (`lab_provision_profile_infra_step`: `createSchema`, `attachFieldGroups`, `createDataset`; then `lab_enable_profile`). It does **not** create Flow Service HTTP API dataflows.

For **profile generation** streaming, use Coworker **dx-api** (Flow Service API) after MCP provision:

1. **Base connection** — `POST /connections` (HTTP API streaming connectionSpec)
2. **Source connection** — `POST /sourceConnections` (map to schema `$id` from MCP)
3. **Target connection** — `POST /targetConnections` (dataset id from MCP)
4. **Dataflow** — `POST /flows` (name from status `naming.httpDataflow`, e.g. `AEP Lab - Travel Profile - Dataflow`)

Pass from MCP output: **`sandbox`** (`x-sandbox-name`), **`schemaId`**, **`datasetId`**, **`xdmKey`**, catalog names from `lab_profile_infra_status` / `lab_sandbox_profile_config`.

After the flow exists: Profile Viewer Profile generation → **Fetch URL & Flow ID from AEP** → **Save connection**. Verify with **`lab_sandbox_profile_config`**.

Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md` (Workflow 4b). MCP framework: **`lab_get_execution_framework`** → `workflows.http_streaming_dx_api`. Human doc: [`docs/COWORKER_HTTP_STREAMING_FLOWS.md`](../docs/COWORKER_HTTP_STREAMING_FLOWS.md).

**Experience events** use Edge datastreams (`lab_setup_event_infra` + `lab_save_event_datastream`), not HTTP profile-style flows, unless your demo explicitly needs DCS event streaming.

### Edge datastreams — Event tool + Coworker dx-api

Lab MCP **creates ExperienceEvent schema, field groups, and dataset** (`lab_setup_event_infra`) and can **enable Profile** (`lab_enable_event_profile`). It does **not** create Edge datastreams.

For **Event tool** / `lab_send_profile_event` (target `lab-event-tool-edge`), use Coworker **dx-api** (Edge Configuration API):

1. `GET https://edge.adobe.io/ee/v2/datastreamConfigs` — list existing
2. `POST /ee/v2/datastreamConfigs` — `mappingSchemaId` + **Adobe Experience Platform** service `datasets: [{ id, schema }]` from `lab_setup_event_infra` response
3. **`lab_save_event_datastream`** — persist `datastream_id` to Firestore `eventEdgeConfig`
4. **`lab_list_event_targets`** — confirm `lab-event-tool-edge` has `dataStreamId`

Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md` (Workflow 5c). MCP framework: **`lab_get_execution_framework`** → `workflows.edge_datastream_dx_api`. Human doc: [`docs/COWORKER_EDGE_DATASTREAMS.md`](../docs/COWORKER_EDGE_DATASTREAMS.md).

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

Recommended read-only guide companion:

```json
"aep-lab-guide": {
  "type": "streamable-http",
  "url": "https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/guide",
  "headers": {
    "X-AEP-Lab-Mcp-Key": "<same user-generated key>"
  }
}
```

Focused demo preparation uses the same key:

```json
"aep-lab-demo-prep": {
  "type": "streamable-http",
  "url": "https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/demo-prep",
  "headers": {
    "X-AEP-Lab-Mcp-Key": "<same user-generated key>"
  }
}
```

Focused PDF preparation uses the same key:

```json
"aep-lab-pdf-prep": {
  "type": "streamable-http",
  "url": "https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/pdf",
  "headers": {
    "X-AEP-Lab-Mcp-Key": "<same user-generated key>"
  }
}
```

**Tool timeouts:** ≥ **300s** for infra, get/update/activity, provisioning, PDF generation/publishing, and `execute_all` polling. ≥ **540s** for **`lab_brand_scrape`** when waiting for completion.

## Deploy to Cloud Run

GCP project: **`aep-orchestration-lab`**, region: **`us-central1`**.

Cloud Run service account needs **Cloud Datastore User** for Firestore collections:

- `mcpProfileBatchJobs`
- `mcpProfileAuditLog`
- `mcpSandboxAllowlist`
- `labDemoConfigPreflights`
- `labDemoConfigRevisions`
- `labDemoConfigIdempotency`
- `labDemoAssetPreflights`
- `labDemoAssetRevisions`
- `labDemoAssetIdempotency`
- `labDemoAssetActive`

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
| `GET /api/lab/mcp-keys?sandbox=` | Firebase ID token | List keys; `currentKey` is the newest active key for that sandbox |
| `POST /api/lab/mcp-keys?sandbox=` | Firebase ID token | Body `{ sandbox: "kirkham", keyLabel: "ChatGPT" }` — creates an additional named key; plaintext **once** |
| `POST /api/lab/mcp-keys/rotate` | Firebase ID token | Body `{ keyId, action: "rotate" }` — same `keyId`, new secret, old key invalid immediately |
| `DELETE /api/lab/mcp-keys?keyId=` | Firebase ID token | Revoke + remove `mcpSandboxAllowlist/{keyId}` |

- Up to 10 active keys per user **per sandbox** so each client can have its own independently rotatable/revocable credential. `allowedSandboxes` on each key is always `[sandbox]`. Legacy multi-sandbox keys still work via `allowedSandboxes[0]`.
- Firestore: `mcpApiKeys/{keyId}` stores `keyHash` (SHA-256), `keyPrefix`, `keyLabel`, `allowedSandboxes`, `principalUid`, `revoked`.
- MCP Cloud Run auth: shared ops key (`AEP_LAB_MCP_API_KEY`) **or** user key via `keyHash` query on `mcpApiKeys`.
- Ops seed script `scripts/seed-mcp-sandbox-allowlist.mjs` remains for shared / legacy keys.

## Phase 3.5 OAuth (future)

`validateOAuthBearer` in `src/auth.mjs` checks `AEP_LAB_MCP_OAUTH_ISSUER` and `AEP_LAB_MCP_OAUTH_AUDIENCE`. When both are set, a stub returns *not implemented* until Coworker OIDC docs land. **Today:** use `X-AEP-Lab-Mcp-Key` only.

The audience-management route is authenticated with a user-generated MCP key and is not an anonymous profile API. Existing public profile read routes remain unchanged.

## Related

- Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md`
- Stdio Adobe MCP: `tools/aep-lab-adobe-mcp/`
- Hotel segment seed reference: `scripts/bulk-seed-travel-hotel-segment-profiles.mjs`
