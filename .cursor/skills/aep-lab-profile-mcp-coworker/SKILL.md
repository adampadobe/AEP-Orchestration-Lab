---
name: aep-lab-profile-mcp-coworker
description: >-
  Workflows and example prompts for the AEP Orchestration Lab MCP
  (Streamable HTTP on Cloud Run v3.10.0). Use when generating test profiles, sending
  experience events, setting up event infrastructure (schema/dataset), checking infra, batch seeding, segment personas, brand scraping,
  access info, MCP first-run onboarding, getting/updating profiles (full-snapshot stitch), profile activity,
  provisioning profile pipelines, or reading lab execution framework / industry playbooks.
---

# AEP Orchestration Lab MCP — Coworker workflows (Phase 3.13)

MCP server: **AEP Orchestration Lab MCP v3.13.0** (`aep-orchestration-lab-mcp`; see `tools/aep-lab-profile-mcp/README.md`).

Configure in Coworker or Cursor with a **single** header:

- `X-AEP-Lab-Mcp-Key` — required for all tools (including provisioning)

**Portal:** generate an MCP key per sandbox **without** completing workspace slug first. Coworker completes foundations via **`lab_mcp_first_run_setup`** on first connect.

Allowed sandboxes: Firestore **`mcpSandboxAllowlist/{keyId}`** per principal, or env fallback `apalmer`, `kirkham`. Verify with **`lab_mcp_access_info`**.

## Framework knowledge (server-side — no manual retraining)

Coworker should call these **before** improvising lab conventions:

| Tool / resource | Purpose |
|-----------------|--------|
| **`lab_get_execution_framework`** | **criticalRules** at top + workflows, dataflow pattern, when to use generate vs update vs event |
| **`lab_get_industry_playbook`** | Per-industry persona paths, language/testProfile rules, dataflow manifest shape, failure_modes |
| **`lab_confirm_profile_generation`** | **Ask colleague first** — format rules, questions, prefs preview; `confirmed:true` persists base email + mobile |
| **`lab_confirm_generation_plan`** | Read-only preview of next scaled email (does not consume counter) |
| **`lab_preflight_profile_generate`** | Dry-run: sandbox config ready + what will be sent (testProfile, language, connection, format rules) without streaming |
| `lab://framework/overview` | Markdown execution overview (MCP resource) |
| `lab://framework/conventions` | Email, phone, testProfile, preferredLanguage, stitching rules |
| `lab://framework/industries/{industry}` | JSON playbook for one industry |

### Critical rules (always enforce)

1. **testProfile** — every generated profile is an AEP test profile. MCP defaults `test_profile:true` → POST `body.testProfile` → server sets root `testProfile` + mirrors `xdm:testProfile`. Opt out only with `test_profile:false` + `test_profile_override_reason`.
2. **preferredLanguage** — BCP-47 on `preferredLanguage` (root), `preferences.preferredLanguage`, and `personalEmail.language`. MCP randomize defaults `en-US` when missing. `profileStreamingCore.mirrorPreferredLanguageDemoSchema` dual-writes root + tenant.
3. **Preflight** — call `lab_sandbox_profile_config` or `lab_preflight_profile_generate` before first generate on a sandbox; industry Firestore doc must have `streaming.url`, `flowId`, `datasetId`, `schemaId`, `xdmKey`.
4. **Event identity** — after generate, pass **email + ecid** to `lab_send_profile_event`; `identityMap.ECID` primary, `Email` secondary; `_demoemea.identification.core` mirrors both. Preflight: `lab_preflight_profile_event`.
5. **Portal event types** — `event_type` is **free text** (any string, same as Event tool). Datalist / `lab_send_retail_journey_events` commerce pack are optional suggestions. Multi-event: `lab_send_profile_events_batch` or `event_types[]` on `lab_prepare_demo_from_brand_scrape`.
6. **Shared generation counter** — Portal and MCP share Firestore `labProfileGenerationPrefs` per uid+sandbox (keyed by MCP API key `principalUid`). **Call `lab_confirm_profile_generation` before first generate** — ask colleague to confirm base email + domain; then omit email on `lab_generate_profile` (or `use_stored_prefs:true`) to atomically reserve `<local>+DDMMYYYY-N@<domain>`. Custom emails **must** match `+DDMMYYYY-N` or MCP rejects with format guidance. **Brand scrape profile tools** use the same prefs by default — persona **names** overlay on attributes but **email never** comes from `homepage.{name}@domain`. Static **mobilePhone.number** comes from prefs. Configure via `lab_set_generation_prefs` or Profile Viewer base email field.
7. **Brand scrape industry** — `lab_get_brand_scrape` / `lab_resolve_brand_scrape` expose `scrape_industry`, `lab_industry`, and `industry_source`. Profile tools (`lab_generate_profile_from_brand_scrape`, `lab_prepare_demo_from_brand_scrape`) **default to scrape-inferred `lab_industry`** for dual-stream generate (e.g. Food & beverage → `retail`, Travel & Hospitality → `travel`). **Never pass `industry` unless the user explicitly asks to override.** If `warnings` mention infra, call `lab_sandbox_profile_config` for that `lab_industry` (and `generic` when dual-stream).

### How the lab executes

1. **Onboard** (new sandbox): `lab_sandbox_profile_config` → `lab_onboard_sandbox` (plan / execute / execute_all) until each industry Firestore connection has `streaming.url`, `flowId`, `datasetId`, `schemaId`, `xdmKey` and profile is enabled on the dataset. **HTTP API dataflows:** lab MCP creates schema/FGs/dataset; Coworker **dx-api** creates Flow Service connections + dataflow (see Workflow 4b).
2. **Generate**: `lab_generate_profile` POSTs to `/api/profile/generate` — streams XDM via per-industry HTTP API connections. **Non-generic industries dual-stream automatically:** step 1 `industry generic` (generic-owned paths), step 2 `industry travel|fsi|…` with `appendIfExisting` (industry-owned paths, same email/ECID). `randomize:true` builds correlated attributes in MCP `personaBuilder/` (mirrors Profile Viewer **Fill random sample**). Default `testProfile:true`.
3. **Update**: `lab_update_profile` — **full-snapshot stitch** only (fetch UPS → merge changes → stream ALL writable rows for that industry). Never minimal deltas.
4. **Events**: `lab_send_profile_event` appends ExperienceEvents via `/api/events/generator` (same POST body as Profile Viewer **Event Generator** and mobile lab shells). **`event_type` is free text** — any string (e.g. `transaction`, `donation.made`, `starbucks.mobile.page.view`, `ferrariworld.pageView`). Event tool datalist / `lab_send_retail_journey_events` commerce pack are **suggestions only**. **Identity**: pass email **and** ecid from `lab_generate_profile`; `identityMap` uses ECID primary + Email secondary; `_demoemea.identification.core` mirrors both. Default `target_id`: `lab-event-tool-edge`. Dry-run: `lab_preflight_profile_event` (returns `generatorPostBody`). Multi-event: `lab_send_profile_events_batch` or `event_types[]` on `lab_prepare_demo_from_brand_scrape`. Auto-fetches ecid from UPS when email-only.

### Test data conventions

- **Email format (required)**: `<local>+DDMMYYYY-N@<domain>` — e.g. `apalmer+14072026-3@adobetest.com` (today's date + daily counter N). Legacy `travel.demo+001@adobetest.com` is **rejected** by MCP guardrails.
- **Base email**: stored in Firestore `labProfileGenerationPrefs` (Profile Viewer Profile Generation field or `lab_set_generation_prefs`). MCP `lab_generate_profile` **omits email** to auto-reserve the next counter value.
- **Mobile**: static E.164 from prefs — lab default **`+447425627462`** (visible in Portal + MCP responses).
- **segment_hint** (with `randomize:true`): travel `hotel_high_value` \| `hotel_reactivation`; fsi `high_net_worth` \| `credit_rebuild`; retail `loyalty_vip` \| `cart_abandoner`.
- **Industry aliases**: `telco` / `telecommunications` → `telecom`; `public` → `generic`.
- **Known-profile events** (MCP / Event tool): after `lab_generate_profile`, capture **ecid** from response. Send with **both** email + ecid so `identityMap.ECID` is primary and `identityMap.Email` secondary; `_demoemea.identification.core` carries the same strings. See `lab_get_execution_framework` → `criticalRules.event_identity_stitch`.
- **Anonymous Edge** (Web SDK demos): `getIdentity` then `sendEvent` with `identityMap.ECID` **and** `_<tenant>.identification.core.ecid` (same ECID string). See `docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`.
- **Profile Core v2 top-up**: travel sandboxes need `travelReservations.*` + `hotel.*` tenant leaves — provision step 2 runs ADD-only patch from `profileCoreV2Manifest.js`.

### Example prompt that needs zero manual context (v3.13+)

> Call **lab_get_execution_framework** (read criticalRules). **lab_confirm_profile_generation** for sandbox apalmer — show colleague format rules and next preview email. When confirmed, **lab_preflight_profile_generate** industry travel. If ready, **lab_generate_profile** sandbox apalmer industry travel, **omit email** (stored prefs), randomize true, segment_hint `hotel_reactivation`. Verify with **lab_get_profile** — email should be `+DDMMYYYY-N` scaled form.

## Workflow 0a — Confirm email format before first generate

1. **Preview format + prefs**

   > Call **lab_confirm_profile_generation** for sandbox `apalmer`. Read `questionsForColleague` and `formatRules` back to the user.

2. **Colleague confirms base email**

   > If prefs empty: ask "What base email should we use (e.g. apalmer@adobetest.com)?" Then **lab_confirm_profile_generation** with `confirmed:true`, `base_email` from colleague, optional `mobile_phone`.

3. **Generate without email**

   > **lab_generate_profile** sandbox apalmer industry travel, randomize true — **omit email** so MCP reserves `apalmer+DDMMYYYY-N@adobetest.com` from shared counter.

## Workflow 0 — Check MCP access

> Call **lab_mcp_access_info**. Report keyId, allowed sandboxes, principal label, and allowlist source.

## Workflow 0b — First-run foundations (new sandbox / new key)

Run **once** after connecting Coworker — replaces Portal workspace-slug gate before key generation.

> Call **lab_mcp_access_info**, then **lab_mcp_first_run_setup** with sandbox `prisacar`, workspace_slug `prisacar`, first_name, last_name, and adobe_email if not already on the MCP key principal. Summarize checklist (workspace profile, RTDB ldapSlug, sandbox infra, event targets). If `notReadyIndustries` is non-empty, run **lab_onboard_sandbox** mode=plan.

Example (user on sandbox **prisacar**):

> After connecting MCP, call **lab_mcp_first_run_setup** for sandbox **prisacar** with **workspace_slug** **prisacar**, **first_name** Priya, **last_name** Sacar, **adobe_email** prisacar@adobe.com. Report what is ready vs needs Portal or **lab_onboard_sandbox**.

## Workflow 1 — Check infra → generate travel profile → lookup

1. **Check infra readiness**

   > Use lab_profile_infra_status for sandbox apalmer and industry travel. Summarize whether streaming is configured.

2. **Generate one randomized profile**

   > Call lab_generate_profile with sandbox apalmer, industry travel, **omit email** (stored prefs), randomize true.

3. **Lookup by email**

   > Use the scaled email returned from generate. Call lab_lookup_profile with sandbox apalmer, namespace email, identifier `<email from generate response>`. Summarize key travel attributes.

## Workflow 2 — Hotel segment personas (travel)

1. **Reactivation segment**

   > lab_generate_profile: sandbox apalmer, industry travel, omit email, randomize true, segment_hint hotel_reactivation.

2. **High-value segment**

   > lab_generate_profile: sandbox apalmer, industry travel, omit email, randomize true, segment_hint hotel_high_value.

3. **Batch seed for segments**

   > lab_generate_profiles_batch: sandbox apalmer, industry travel, count 10, use_stored_prefs true, randomize true, segment_hint hotel_reactivation, delay_ms 800. Poll lab_batch_job_status until complete.

## Workflow 2b — FSI segment personas (Phase 3.1)

1. **High net worth**

   > lab_generate_profile: sandbox apalmer, industry fsi, email fsi.hnw+001@adobetest.com, randomize true, segment_hint high_net_worth.

2. **Credit rebuild**

   > lab_generate_profile: sandbox apalmer, industry fsi, email fsi.rebuild+001@adobetest.com, randomize true, segment_hint credit_rebuild.

3. **Batch seed FSI segments**

   > lab_generate_profiles_batch: sandbox apalmer, industry fsi, count 10, base_email kirkham+fsi-seed, randomize true, segment_hint credit_rebuild, delay_ms 800. Poll lab_batch_job_status.

## Workflow 2c — Retail segment personas (Phase 3.1)

1. **Loyalty VIP**

   > lab_generate_profile: sandbox apalmer, industry retail, email retail.vip+001@adobetest.com, randomize true, segment_hint loyalty_vip.

2. **Cart abandoner**

   > lab_generate_profile: sandbox apalmer, industry retail, email retail.abandon+001@adobetest.com, randomize true, segment_hint cart_abandoner.

3. **Batch seed retail VIP cohort**

   > lab_generate_profiles_batch: sandbox apalmer, industry retail, count 25, base_email kirkham+retail-vip, randomize true, segment_hint loyalty_vip.

## Workflow 3 — Get profile → discuss changes → full-snapshot update

Profile Viewer streams **full writable snapshots** per industry dataflow — not minimal deltas. The MCP mirrors this.

1. **Get profile with metadata**

   > Use lab_get_profile for sandbox apalmer, namespace email, identifier travel.demo+001@adobetest.com. Summarize writable industries and key attributes.

2. **Discuss changes with the user**

   > Propose attribute_changes as dot-path / value pairs (e.g. person.name.firstName, loyalty.points). Confirm industry dataflow (travel, generic, etc.).

3. **Update with full stitch**

   > Call lab_update_profile: sandbox apalmer, industry travel, email travel.demo+001@adobetest.com, attribute_changes [{ path: "person.name.firstName", value: "Alex" }]. Explain that the server merged into the full writable snapshot before POST /api/profile/update.

4. **Verify**

   > Call lab_get_profile again and confirm the changed fields.

## Workflow 4 — Switch sandbox / onboard new sandbox

When Coworker switches to a sandbox that has no Firestore connection docs, generate/update will fail until infra is provisioned.

1. **Assess config**

   > Use lab_sandbox_profile_config for sandbox apalmer. Summarize ready vs notReadyIndustries and next_action per industry.

2. **Get onboarding plan**

   > Use lab_onboard_sandbox with sandbox apalmer, mode plan. List the ordered steps.

3. **Execute one industry (sync)**

   > Use lab_onboard_sandbox with sandbox apalmer, mode execute, industry travel. Wait for completion, then repeat for other not-ready industries.

3b. **HTTP streaming dataflow (Coworker dx-api — when connection missing)**

   Lab MCP creates **schema, field groups, and dataset** (`lab_provision_profile_infra_step` steps `createSchema`, `attachFieldGroups`, `createDataset`) and can **enable Profile** (`lab_enable_profile`). It does **not** create Flow Service entities — use Coworker **dx-api** for that gap.

   > Call **lab_profile_infra_status** for sandbox **apalmer** industry **travel**. If schema/dataset exist but `missing_steps` includes `save_http_streaming_connection`, use **dx-api** (Flow Service) to create: (1) base connection, (2) source connection mapped to schema **`schemaId`**, (3) target connection to dataset **`datasetId`**, (4) dataflow named **`AEP Lab - Travel Profile - Dataflow`**. Header **`x-sandbox-name: apalmer`**. After the flow exists, Profile Viewer → Travel profile generation → **Fetch URL & Flow ID** → **Save connection**. Verify with **lab_sandbox_profile_config**.

   Full reference: `docs/COWORKER_HTTP_STREAMING_FLOWS.md` and **`lab_get_execution_framework`** → `workflows.http_streaming_dx_api`.

4. **Execute all industries (async, Phase 3)**

   > lab_onboard_sandbox: sandbox apalmer, mode execute_all. Poll lab_batch_job_status with job_id every 15s until completed. Report per-industry results.

5. **Ops note for new colleague sandboxes**

   > Ops seeds Firestore mcpSandboxAllowlist/{keyId} or updates AEP_LAB_MCP_ALLOWED_SANDBOXES — see README. Coworker verifies with lab_mcp_access_info.

## Workflow 4b — HTTP streaming via dx-api (profile generation)

Use when **`lab_sandbox_profile_config`** shows infra ready (schema + dataset) but **`save_http_streaming_connection`** or missing `streaming.flowId` / `streaming.url`.

**Lab MCP handles:** schema shell, field groups, Profile-enabled dataset, Profile union (`lab_enable_profile`).

**Coworker dx-api handles:** Flow Service HTTP API ingestion (no dedicated lab MCP tool).

1. **Provision catalog objects**

   > lab_provision_profile_infra_step sandbox prisacar industry travel step createSchema — then attachFieldGroups, createDataset. lab_enable_profile sandbox prisacar industry travel.

2. **Collect IDs for dx-api**

   > lab_profile_infra_status sandbox prisacar industry travel — note schemaId, datasetId, xdmKey, naming.httpDataflow (e.g. AEP Lab - Travel Profile - Dataflow).

3. **Create flow (dx-api prompt — paste into Coworker)**

   > Using **dx-api** and sandbox **prisacar**, create an HTTP API streaming dataflow for profile ingestion: resolve HTTP API connectionSpec, POST base connection, POST source connection (schema **{schemaId}**), POST target connection (dataset **{datasetId}**), POST flow named **AEP Lab - Travel Profile - Dataflow**. Return flowId and DCS inlet URL.

4. **Save connection + verify**

   > Profile Viewer Travel profile generation → Fetch URL & Flow ID → Save connection. Then lab_sandbox_profile_config sandbox prisacar — travel should be ready. lab_preflight_profile_generate → lab_generate_profile.

Per-industry dataflow names: `AEP Lab - {Industry} Profile - Dataflow`. See `docs/COWORKER_HTTP_STREAMING_FLOWS.md`.

## Workflow 5 — Profile activity narration

1. **Events + channels**

   > Use lab_profile_activity for sandbox apalmer, identifier travel.demo+001@adobetest.com. Read the narration field and summarize for the user (event count, active channels).

2. **Optional audiences**

   > Re-run lab_profile_activity with include_audiences true if audience membership matters for the demo.

## Workflow 5b — Generate → event → verify (canonical chain)

Mirrors Profile Viewer **Event tool** identity rules (`eventEdgeService.buildXdm`).

1. **Generate profile and capture ECID**

   > lab_generate_profile: sandbox apalmer, industry travel, email event.demo+001@adobetest.com, randomize true. **Save ecid from the response.**

2. **Optional preflight (no send)**

   > lab_preflight_profile_event: sandbox apalmer, email event.demo+001@adobetest.com, ecid from step 1. Confirm identityMap + target_id lab-event-tool-edge.

3. **List event targets**

   > lab_list_event_targets for sandbox apalmer. Pick target_id (default **lab-event-tool-edge**).

4. **Send event (email + ecid)**

   > lab_send_profile_event: sandbox apalmer, email event.demo+001@adobetest.com, ecid from step 1, target_id lab-event-tool-edge, event_type transaction, view_name "Lab demo page", channel web.

5. **Verify**

   > lab_profile_activity for sandbox apalmer, identifier event.demo+001@adobetest.com. Confirm event count increased (allow UPS lag 30–60s).

**If ecid omitted:** MCP auto-fetches from UPS by email; response includes `warnings` when stitching may be weak.

**Public-sector donation demo:**

   > lab_send_profile_event with event_type donation.made, public { donationAmount: 250, donationDate: "2026-06-23", eventRegistration: "annual-gala" }.

**Advanced (direct datastream):**

   > lab_send_edge_event: sandbox apalmer, datastream_id from lab_list_event_targets, email event.demo+001@adobetest.com, ecid from generate, event_type transaction.

## Workflow 5c — Event infrastructure setup (schema + dataset + datastream)

Mirrors Profile Viewer **Event tool** step 1 (`setupEventInfra`) and step 2 (save datastream ID).

1. **Create schema, field groups, and dataset**

   > lab_setup_event_infra for sandbox prisacar. Default schema **AEP Lab - Event Generic - Schema**; dataset name auto-derives **AEP Lab - Event Generic - Dataset**.

2. **Enable Profile (identityMap alternate primary)**

   > lab_enable_event_profile sandbox prisacar — or `lab_setup_event_infra` with `enable_for_profile:true`. Required before UPS reflects events on known profiles.

3. **Create Edge datastream (Coworker dx-api)**

   > Using **dx-api** (Edge Configuration API, `x-sandbox-name: prisacar`): `GET https://edge.adobe.io/ee/v2/datastreamConfigs` then `POST` with `mappingSchemaId` = schema_id from step 1 and **Adobe Experience Platform** service `datasets: [{ id: dataset_id, schema: schema_id }]`. Suggested title: **AEP Lab - Event Generic - Datastream**. Enable Identity + Profile services for Web SDK demos. See `docs/COWORKER_EDGE_DATASTREAMS.md`.

4. **Save datastream ID**

   > lab_save_event_datastream sandbox prisacar datastream_id `<edge-uuid>` schema_id from step 1 schema_title "AEP Lab - Event Generic - Schema" dataset_name "AEP Lab - Event Generic - Dataset". Or Portal [Event tool](https://aep-orchestration-lab.web.app/profile-viewer/event-tool.html).

5. **Verify**

   > lab_list_event_targets for sandbox prisacar — preset **lab-event-tool-edge** should include `dataStreamId`. Then chain **Workflow 5b** to send events.

**One-shot Coworker prompt (schema + dataset + datastream + save):**

> For sandbox **prisacar**: (1) **lab_setup_event_infra** with **enable_for_profile** true — save schema_id and dataset_id. (2) **dx-api**: create Edge datastream with AEP service mapped to that schema/dataset (see `docs/COWORKER_EDGE_DATASTREAMS.md`). (3) **lab_save_event_datastream** with the new datastream_id. (4) **lab_list_event_targets** to confirm **lab-event-tool-edge**.

## Workflow 6 — Batch seed N profiles

1. **Start batch job**

   > Use lab_generate_profiles_batch: sandbox apalmer, industry retail, count 25, use_stored_prefs true, randomize true.

2. **Poll until complete**

   > Poll lab_batch_job_status with the returned job_id every 10 seconds until status is completed, completed_with_errors, or failed. Report succeeded/failed counts.

3. **Spot-check one profile**

   > Pick the first succeeded email from results and run lab_get_profile (namespace email).

## Workflow 7 — Provision industry infra

Same MCP key as all other tools.

1. **Status baseline**

   > lab_profile_infra_status for sandbox apalmer, industry fsi.

2. **Run all core steps**

   > lab_provision_profile_infra_step: sandbox apalmer, industry fsi, step createSchema — then attachFieldGroups, createDataset (or run each step idempotently).

2b. **If httpFlow / connection still missing — dx-api**

   > lab_profile_infra_status sandbox apalmer industry fsi — then Coworker **dx-api** Flow Service for HTTP dataflow (base → source → target → flow) using datasetId, schemaId, and naming.httpDataflow from status. Save inlet URL + flowId in Profile Viewer, verify lab_sandbox_profile_config.

3. **Enable profile**

   > lab_enable_profile: sandbox apalmer, industry fsi.

4. **Verify**

   > lab_profile_infra_status again and confirm profile enabled / connection saved.

## Workflow 6 — Brand scrape (Portal parity)

> **One scrape per URL:** `lab_brand_scrape` reuses **complete** scrapes (`prefer_existing:true`, default) and **in-flight** scrapes for the same URL+sandbox. **Never** fire parallel `lab_brand_scrape` calls — Coworker retries and parallel tool calls were creating duplicate history cards (most cancelled, one running).
>
> **Be patient:** Brand crawls typically take **3–8 minutes**. Use **`lab_poll_brand_scrape`** (or `wait_for_complete:true` on `lab_brand_scrape`) and tell the user progress is normal. Do **not** start a new scrape because the first is still running.
>
> Call **`lab_resolve_brand_scrape`** first — it returns `scrape_id` when a complete scrape exists, or `in_flight` + `scrape_id` when a crawl is already running. Set **`force_new:true`** only when the user explicitly wants a fresh crawl.

> Call **lab_mcp_access_info** first. Then **lab_resolve_brand_scrape** with sandbox and customer url. If `need_new_scrape:false`, reuse `scrape_id` and poll if status is still running. If `need_new_scrape:true`, run **one** **lab_brand_scrape** with `include.personas:true` for demo prep.

1. **Resolve or list existing scrapes**

   > lab_resolve_brand_scrape for sandbox apalmer, url `https://www.adobe.com` (or customer site). If `need_new_scrape:false`, note scrape_id and whether `in_flight` is set. Else lab_list_brand_scrapes to show history.

2. **Run a new scrape (only when needed — once)**

   > lab_brand_scrape: sandbox apalmer, url https://nike.com, max_pages 3, include `{ "personas": true, "segments": true, "demoWebsite": true }`, wait_for_complete true. Add `force_new: true` only to bypass dedupe. Set MCP timeout ≥ **600s** when demoWebsite is on.

2b. **Build demo website on existing scrape**

   > lab_build_demo_website: sandbox apalmer, scrape_id `<id>`, regenerate true. Portal **Regenerate demo** parity — no new crawl. Poll with lab_poll_brand_scrape if timed out.

2c. **Poll progress (preferred when user is waiting)**

   > lab_poll_brand_scrape: sandbox apalmer, scrape_id `<id>`, timeout_sec 480. Read `progress` / `progressMessages` back to the user. Repeat if `terminal:false` and `timedOut:true` — do not call lab_brand_scrape again for the same URL.

3. **Cancel stuck scrapes**

   > lab_cancel_brand_scrape: sandbox apalmer, scrape_id `<stuck-id>`. Or Portal Brand scraper history card → **Cancel**.

4. **Fetch one scrape for demos**

   > lab_get_brand_scrape: sandbox apalmer, scrape_id `<id>`. Use summary in conversation; check `profileViewerDemoHref` / `demoWebsitePath` for the site clone URL; full `lab` payload for CJv2 / LLM Demo import.

Portal: [Brand scraper](https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html) history and [Image hosting](https://aep-orchestration-lab.web.app/profile-viewer/image-hosting.html) read the same Firestore/GCS records.

## Workflow 8 — Brand scrape → golden profiles → events → journey asset

End-to-end chain for customer-specific demo prep.

1. **Resolve existing scrape or scrape with personas**

   > lab_resolve_brand_scrape: sandbox apalmer, url `https://example-brand.com`. If need_new_scrape, lab_brand_scrape same url with include `{ "personas": true, "segments": true, "campaigns": true, "demoWebsite": true }`, wait_for_complete true. If scrape exists but summary has no profileViewerDemoHref, call lab_build_demo_website instead of re-scraping.

2. **Golden profiles**

   > lab_generate_profile_from_brand_scrape: sandbox apalmer, scrape_id `<id>`, persona_index 0 — **omit industry** so `lab_industry` comes from scrape taxonomy; **omit email** so Firestore generation prefs supply scaled email + mobile (same as Portal Profile Generation). Check response `lab_industry` / `industry_readiness` before events.

3. **One-shot orchestration (optional)**

   > lab_prepare_demo_from_brand_scrape: sandbox apalmer, url `https://example-brand.com` (or scrape_id), steps `{ "profiles": true, "events": true, "journey": true }`. Retail/F&B scrapes send commerce journey events (productViews → cart → purchase) with email+ecid from generate — not generic page views.

4. **Retail journey events (Starbucks / F&B)**

   > lab_send_retail_journey_events: sandbox apalmer, email from generate, ecid from generate, brand_name Starbucks. Or chain via prepare demo events step.

5. **Client Journey v2 HTML (~60–180s, optional)**

   > lab_create_journey_from_brand_scrape: sandbox apalmer, scrape_id `<id>`. Uses campaigns/personas/segments from scrape via CJv2 import mapping.

5. **Verify events**

   > lab_profile_activity per profile email. Allow 30–60s UPS lag. If 0 events: confirm ecid was passed; re-run lab_preflight_profile_event; retry lab_send_retail_journey_events.

**AJO platform gap:** CJv2 tools produce a **sales presentation journey** (HTML/PPTX), not a live AJO journey. Lab only browses existing AJO journeys; no create API.

## Tips

- Set MCP client tool timeout ≥ **300s** for infra status, get/lookup/update/activity/onboarding, and provisioning. ≥ **540s** for **lab_brand_scrape** with `wait_for_complete:true`. ≥ **600s** when **`include.demoWebsite:true`** or **lab_build_demo_website**.
- **lab_mcp_access_info** — check allowlist without secrets; use after ops adds Kirkham ACL.
- **segment_hint** — travel: `hotel_high_value`, `hotel_reactivation`; fsi: `high_net_worth`, `credit_rebuild`; retail: `loyalty_vip`, `cart_abandoner`.
- Rate limits (per instance): 30 generates/min, 30 event sends/min, 3 batch jobs/hr — backoff using retryAfterSec.
- Batch jobs max **100** profiles; use `email_pattern` for custom addressing (`{n}`, `{industry}`).
- Industry aliases: `telco` → `telecom`, `public` → `generic`.
- Provisioning is sandbox-allowlist gated like every other tool.
- **HTTP streaming flows:** no lab MCP Flow Service tool — after schema/dataset provision, use Coworker **dx-api** (see Workflow 4b, `docs/COWORKER_HTTP_STREAMING_FLOWS.md`, `lab_get_execution_framework` → `workflows.http_streaming_dx_api`).
