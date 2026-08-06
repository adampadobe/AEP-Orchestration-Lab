---
name: aep-lab-profile-mcp
description: >-
  Workflows and example prompts for the AEP Orchestration Lab MCP
  (Streamable HTTP on Cloud Run v3.35.0). Use when generating test profiles, sending
  experience events, evaluating Edge decisioning (Decision lab), browsing Decisioning catalog (DPS),
  setting up event infrastructure (schema/dataset), checking infra, batch seeding, segment personas, brand scraping,
  provisioning profile pipelines, or reading lab execution framework / industry playbooks.
---

# AEP Orchestration Lab MCP — Codex workflows (Phase 3.35)

MCP server: **AEP Orchestration Lab MCP v3.35.0** (`aep-orchestration-lab-mcp`; see `tools/aep-lab-profile-mcp/README.md`).

Focused Coworker endpoints use the same API key: `/mcp/profile` (20 tools), `/mcp/audiences` (4), `/mcp/decisioning` (9), and `/mcp/demo-prep` (19). The demo-prep endpoint covers brand scrape, stable image hosting, governed RTDB configuration, and saved-customer restore. Prefer a focused endpoint when Coworker can discover the full `/mcp` catalog but cannot promote a deferred tool into a callable tool.

Configure in Codex or another MCP client with a **single** header:

- `X-AEP-Lab-Mcp-Key` — required for all tools (including provisioning)

**Portal:** generate an MCP key per sandbox **without** completing workspace slug first. The MCP client completes foundations via **`lab_mcp_first_run_setup`** on first connect.

Allowed sandboxes: Firestore **`mcpSandboxAllowlist/{keyId}`** per principal, or env fallback `apalmer`, `kirkham`. Verify with **`lab_mcp_access_info`**.

## Framework knowledge (server-side — no manual retraining)

Codex should call these **before** improvising lab conventions:

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
| `lab://framework/brand-scrape-offline` | Offline fallback workflow when crawl fails (403/bot protection) |

### Critical rules (always enforce)

1. **testProfile** — every generated profile is an AEP test profile. MCP defaults `test_profile:true` → POST `body.testProfile` → server sets root `testProfile` + mirrors `xdm:testProfile`. Opt out only with `test_profile:false` + `test_profile_override_reason`.
2. **preferredLanguage** — BCP-47 on `preferredLanguage` (root), `preferences.preferredLanguage`, and `personalEmail.language`. MCP randomize defaults `en-US` when missing. `profileStreamingCore.mirrorPreferredLanguageDemoSchema` dual-writes root + tenant.
3. **Preflight** — call `lab_sandbox_profile_config` or `lab_preflight_profile_generate` before first generate on a sandbox; industry Firestore doc must have `streaming.url`, `flowId`, `datasetId`, `schemaId`, `xdmKey`.
4. **Event identity** — after generate, pass **email + ecid** to `lab_send_profile_event`; `identityMap.ECID` primary, `Email` secondary; server adds `_demoemea.identification.core` automatically. Preflight: `lab_preflight_profile_event`.
5. **Event params only (never inject XDM)** — Coworker must use `lab_send_profile_event` / `lab_send_profile_events_batch` with tool params. Minimal default: `sandbox`, `email`, `ecid`, `event_type`, `channel`, `timestamp`. Governed rich opt-in: add `industry` plus optional flat `industry_fields`; the MCP allowlists fields, nests `public.{industry}.*`, and selects full XDM automatically. **Never** pass `view_name`, `view_url`, custom `xdm`, schema `$ref`s, mixin definitions, descriptors, tenant blobs, or raw `public`/`xdm_style` overrides.
6. **Portal event types** — `event_type` is **free text** (any string, same as Event tool). Datalist / `lab_send_retail_journey_events` commerce pack are optional suggestions. Multi-event: `lab_send_profile_events_batch` or `event_types[]` on `lab_prepare_demo_from_brand_scrape`.
7. **Shared generation counter** — Portal and MCP share Firestore `labProfileGenerationPrefs` per uid+sandbox (keyed by MCP API key `principalUid`). **Call `lab_confirm_profile_generation` before first generate** — ask colleague to confirm base email + domain; then omit email on `lab_generate_profile` (or `use_stored_prefs:true`) to atomically reserve `<local>+DDMMYYYY-N@<domain>`. Custom emails **must** match `+DDMMYYYY-N` or MCP rejects with format guidance. **Brand scrape profile tools** use the same prefs by default — persona **names** overlay on attributes but **email never** comes from `homepage.{name}@domain`. Static **mobilePhone.number** comes from prefs. Configure via `lab_set_generation_prefs` or Profile Viewer base email field.
8. **Brand scrape industry** — `lab_get_brand_scrape` / `lab_resolve_brand_scrape` expose `scrape_industry`, `lab_industry`, and `industry_source`. Profile tools (`lab_generate_profile_from_brand_scrape`, `lab_prepare_demo_from_brand_scrape`) **default to scrape-inferred `lab_industry`** for dual-stream generate (e.g. Food & beverage → `retail`, Travel & Hospitality → `travel`). **Never pass `industry` unless the user explicitly asks to override.** If `warnings` mention infra, call `lab_sandbox_profile_config` for that `lab_industry` (and `generic` when dual-stream).
9. **Decisioning Edge evaluate** — use `lab_decision_lab_config` then `lab_decisioning_edge_evaluate` (POST `/api/decisioning/edge-evaluate`, **not** `/api/aep`). Pass **email + ecid** from generate; ECID primary when both. Follow with `lab_explain_decision_response` and `lab_decisioning_resolve_treatment_name` for offer-item ids. Sandbox allowlist required.
10. **Decisioning catalog** — use allowlisted DPS proxies only: `lab_decisioning_catalog_schema` → `lab_decisioning_catalog_list` / `lab_decisioning_catalog_get` → `lab_decisioning_catalog_assess`. **offer-items** requires **x-schema-id** (Firestore `/api/catalog/config` or auto-detect). Never call `/api/aep` from MCP. Run **assess** before Edge evaluate demos.
11. **Brand scrape offline fallback** — when `lab_brand_scrape` returns `scrapeStatus: failed` or crawl is blocked (403/bot protection), **do not retry crawl in a loop**. Chain: **`lab_brand_scrape_brief`** → colleague runs external LLM or manual Chrome save-page + Image Eye → **`lab_brand_scrape_upload`** with `upload.zip_base64` (≤30 MB, ~40 files) → **`lab_poll_brand_scrape`** → optional **`lab_build_demo_website`**. Resource: `lab://framework/brand-scrape-offline`. Upload path matches Portal Options → HTML upload (Alan/kirkham sandboxes).
12. **Snowflake full profile readback** — **NEVER** tell the user to run Snowflake console SQL or raw Snowflake MCP `SELECT *` for dual-load verification. After `lab_generate_profile` with `dual_load_snowflake:true`, call **`lab_snowflake_get_profile_by_email`** (preferred) or **`lab_snowflake_query_profiles`** with `email=<same email>`. Response includes `profiles[].columns` with **all 39** AGENTIC_TRAVEL columns plus `createdAt` from `_RECORDCREATEDTIMESTAMP`. Snowflake CRM fields (LTV, holidays, preferences) are **generated independently** — not mirrored from AEP attributes. Requires user-generated MCP key.
13. **Live Activity confirmation gate** — use **`lab_live_activity_list_templates`** → **`lab_live_activity_profile_context`** → **`lab_live_activity_preflight`**. Profile context returns the ECID recipient and, when present, suggests `live_activity_id` from **`liveActivityPushNotificationDetails.0.token`**. When a colleague supplies a campaign ID, call **`lab_live_activity_save_execution_state`** so the same per-user, per-sandbox value restores in the Portal UI; preflight also persists supplied execution IDs as a fallback. Ask only for `missingFields`; when ready, show the redacted summary and obtain explicit colleague confirmation before **`lab_live_activity_send`**. AJO unitary execution still uses **ECID** as the recipient. Never pass arbitrary payloads or claim the campaign asset is being edited.
14. **RTDB demo configuration is inspect → preview → confirm → apply** — use **`lab_demo_config_inspect`** first; **`lab_demo_config_preview`** with explicit changes or a complete `scrape_id`; show the diff; then **`lab_demo_config_apply`** only after explicit colleague confirmation. The Firebase API derives the workspace from the user-generated MCP key and creates a reversible revision. Never write raw RTDB JSON, protected/uncatalogued paths, or use the shared ops key.
15. **Audience deletion is list → audit → exact confirmation → single delete** — use **`lab_audience_list`** to find candidates, then **`lab_audience_audit`** for one exact `id`. Show sandbox, ID, name, dependencies/dependents and audit limitations; obtain explicit colleague confirmation of that exact ID + name before **`lab_audience_delete`**. Requires a user-generated MCP key scoped to the same sandbox. Never use `/api/aep`, infer confirmation, or batch-delete.
16. **Customer demo images are inspect → preview → confirm → apply** — use **`lab_demo_assets_inspect`**, then **`lab_demo_assets_preview_from_scrape`** for one completed scrape. Show the transformed previews, stable target URLs, current customer backup label, and expiry. Only after explicit confirmation call **`lab_demo_assets_apply`** with the preflight id and an idempotency key. The server backs up only allowlisted customer slots, never the whole shared library. Restore a saved customer with **`lab_demo_assets_restore`** preview first, then confirmed apply.

### How the lab executes

1. **Onboard** (new sandbox): `lab_sandbox_profile_config` → `lab_onboard_sandbox` (plan / execute / execute_all) until each industry Firestore connection has `streaming.url`, `flowId`, `datasetId`, `schemaId`, `xdmKey` and profile is enabled on the dataset. **HTTP API dataflows:** lab MCP creates schema/FGs/dataset; Coworker **dx-api** creates Flow Service connections + dataflow (see Workflow 4b).
2. **Generate**: `lab_generate_profile` POSTs to `/api/profile/generate` — streams XDM via per-industry HTTP API connections. **Non-generic industries dual-stream automatically:** step 1 `industry generic` (generic-owned paths), step 2 `industry travel|fsi|…` with `appendIfExisting` (industry-owned paths, same email/ECID). `randomize:true` builds correlated attributes in MCP `personaBuilder/` (mirrors Profile Viewer **Generate**). Pass partial `attributes` with `randomize:true` to merge overrides onto the randomized base (Portal parity: honor user-provided fields). Default `testProfile:true`.
3. **Update**: `lab_update_profile` — **full-snapshot stitch** only (fetch UPS → merge changes → stream ALL writable rows for that industry). Never minimal deltas.
4. **Events**: `lab_send_profile_event` appends ExperienceEvents via `/api/events/generator`. Minimal calls use `sandbox`, `email`, `ecid`, `event_type`, `channel`, `timestamp`. For travel/media/retail/etc. detail, add `industry` plus optional flat `industry_fields`; omit fields for safe defaults. The MCP builds the nested rich payload—never pass custom XDM, schema refs, mixins, tenant blobs, `view_name`, or `view_url`. **Identity**: pass email **and** ecid from `lab_generate_profile`. Default `target_id`: `lab-event-tool-edge`. Dry-run: `lab_preflight_profile_event`. Batch `events[]` supports the same governed industry fields per step.

### Test data conventions

#### Email scaler (Portal + MCP — shared Firestore counter)

Profile Generation in Profile Viewer and all MCP generate tools share **`labProfileGenerationPrefs`** per uid+sandbox (keyed by MCP API key `principalUid`).

| Concept | Example | Notes |
|---------|---------|--------|
| **Base email** (stored) | `apalmer@adobetest.com` | Set via Profile Viewer base email field, `lab_set_generation_prefs`, or **`lab_confirm_profile_generation`** with `confirmed:true` |
| **Scaled profile email** (generated) | `apalmer+14072026-3@adobetest.com` | Pattern: **`<local>+DDMMYYYY-N@<domain>`** — today's date + daily counter **N** |
| **Mobile** (static) | `+447425627462` | E.164 from prefs; applied to every generated profile |
| **How to reserve** | Omit `email` on `lab_generate_profile` | Default `use_stored_prefs:true` atomically reserves next counter via `POST /api/lab/generation-prefs/next-email` |

**Before first generate on a sandbox:** call **`lab_confirm_profile_generation`** — Codex reads `questionsForColleague` + `formatRules`, asks the colleague, then persists with `confirmed:true` + `base_email`. **`lab_mcp_first_run_setup`** and **`lab_prepare_demo_from_brand_scrape`** block the profiles step when prefs are missing and return the same confirm hints.

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

### One-shot full demo prep (v3.14+ — confirm → scrape → profiles → events)

> Sandbox **apalmer**, customer site **https://example-brand.com**. (1) **lab_mcp_access_info**. (2) **lab_mcp_first_run_setup** if new key — if `readiness.generation_prefs.ready` is false, **lab_confirm_profile_generation** and ask colleague for base email (e.g. apalmer@adobetest.com), then `confirmed:true`. (3) **lab_resolve_brand_scrape** url — if `need_new_scrape`, one **lab_brand_scrape** with `include: { personas: true, segments: true, demoWebsite: true }`, `wait_for_complete: true`. (4) **lab_prepare_demo_from_brand_scrape** with `steps: { profiles: true, events: true }` — omit industry and email (scrape-inferred industry + stored prefs). (5) Open demo URL from `profileViewerDemoHref` / `lab_list_brand_scrapes`. (6) **lab_get_profile** + **lab_profile_activity** per scaled email (allow 30–60s UPS lag).

## Workflow 0c — Prepare the user-scoped RTDB for a customer demo

1. **Inspect before suggesting changes**

   > **lab_demo_config_inspect** sandbox apalmer — show current sections, ordinary values, editable paths and recommended brand fields.

2. **Preview explicit or scrape-derived changes**

   > **lab_demo_config_preview** sandbox apalmer scrape_id `{complete scrape id}` preset brand_and_industry — or pass explicit `changes: [{ path, value }]`. Never invent slogans or short names.

3. **Confirm and apply**

   > Show the before/after diff. After explicit colleague confirmation call **lab_demo_config_apply** with the returned `preflight_id`, `confirmed:true`, and a stable `idempotency_key`.

4. **Verify or restore**

   > Re-run **lab_demo_config_inspect**. To roll back, call **lab_demo_config_restore** first with `revision_id` and `confirmed:false`, show the restore diff, then call it again with the returned `preflight_id`, `confirmed:true`, and a new idempotency key.

## Workflow 0d — Prepare stable customer images and saved-customer restore

1. **Inspect active slots and saved customers**

   > **lab_demo_assets_inspect** sandbox apalmer — report the active customer, permanent CDN URLs, slot hashes, and named revisions.

2. **Preview from a completed scrape**

   > **lab_demo_assets_preview_from_scrape** sandbox apalmer scrape_id `{id}` asset_pack `core` (or `core_and_mobile`). Show each signed preview, its stable target URL, source classification/confidence, and the current customer backup label. Do not apply yet.

3. **Confirm and activate**

   > After explicit colleague confirmation, **lab_demo_assets_apply** with `preflight_id`, `confirmed:true`, and a stable `idempotency_key`. The current managed slots are automatically saved as a named customer revision before replacement.

4. **Restore a previous customer**

   > Take `revisionId` from **lab_demo_assets_inspect**. Call **lab_demo_assets_restore** with `revision_id` and `confirmed:false`; show the preview. After confirmation call it again with returned `preflight_id`, `confirmed:true`, and a new idempotency key.

**Focused Coworker config:** name `aep-lab-demo-prep`, URL ending `/mcp/demo-prep`, same `X-AEP-Lab-Mcp-Key` as the full endpoint.

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

Run **once** after connecting Codex — replaces Portal workspace-slug gate before key generation. **`lab_mcp_first_run_setup`** reports `readiness.generation_prefs` — when `ready:false`, run **Workflow 0a** (`lab_confirm_profile_generation`) before any generate or **`lab_prepare_demo_from_brand_scrape`** profiles step.

> Call **lab_mcp_access_info**, then **lab_mcp_first_run_setup** with sandbox `prisacar`, workspace_slug `prisacar`, first_name, last_name, and adobe_email if not already on the MCP key principal. Summarize checklist (workspace profile, RTDB ldapSlug, sandbox infra, event targets, **generation prefs**). If `generation_prefs.ready` is false, **lab_confirm_profile_generation** before generate. If `notReadyIndustries` is non-empty, run **lab_onboard_sandbox** mode=plan.

Example (user on sandbox **prisacar**):

> After connecting MCP, call **lab_mcp_first_run_setup** for sandbox **prisacar** with **workspace_slug** **prisacar**, **first_name** Priya, **last_name** Sacar, **adobe_email** prisacar@adobe.com. Report what is ready vs needs Portal or **lab_onboard_sandbox**.

## Workflow 1 — Check infra → generate travel profile → lookup

1. **Check infra readiness**

   > Use lab_profile_infra_status for sandbox apalmer and industry travel. Summarize whether streaming is configured.

2. **Generate one randomized profile**

   > Call lab_generate_profile with sandbox apalmer, industry travel, **omit email** (stored prefs), randomize true.

3. **Lookup by email**

   > Use the scaled email returned from generate. Call lab_lookup_profile with sandbox apalmer, namespace email, identifier `<email from generate response>`. Summarize key travel attributes.

## Workflow 1b — Snowflake readiness + dual-load travel (v3.25+)

Requires **user-generated MCP key** (Profile Viewer → MCP servers). Ops shared key returns `MCP_USER_KEY_REQUIRED`.

**Roles:** **AEP** = behavioral intent (events, segmentation, travel persona paths). **Snowflake** = operational CRM (bookings, LTV, holiday history, preferences). Dual-load shares join keys only: **EMAIL**, **ECID**, **CRMID** (+ optional **FIRSTNAME/LASTNAME** from AEP).

1. **Check Snowflake config**

   > **lab_snowflake_config** sandbox apalmer — if `hasCredential` is false, colleague saves key pair in Profile Viewer → Profile generation – Snowflake.

2. **Test connection**

   > **lab_snowflake_test_connection** sandbox apalmer — expect Snowflake version or NETWORK POLICY hint with static IP **34.58.81.28**.

3. **Industry catalog (v3.22+)**

   > **lab_snowflake_industry_catalog** sandbox apalmer industry travel — review `dualLoadTarget` (`AGENTIC_TRAVEL_PROFILE_CUSTOMER`), `phaseTables`, and `tableCheck`. Optional **lab_snowflake_table_structure** phase phase1|phase2|phase3 for column metadata (no arbitrary SQL).

4. **Dual-load generate**

   > **lab_confirm_profile_generation** → **lab_generate_profile** sandbox apalmer industry travel randomize true segment_hint hotel_reactivation **dual_load_snowflake true** — **omit email** so Firestore reserves `<local>+DDMMYYYY-N@domain>` once for AEP + Snowflake; save email, ecid, snowflake.crmId. Snowflake row uses **crm_generate** mode (full CRM columns populated — LIFETIMEVALUE, LASTHOLIDAYDESTINATION, PREFERREDCABINCLASS, etc.). Legacy **dual_load_snowflake_mode mirror** maps AEP attributes only (CRM columns stay empty/default).

5. **Batch dual-load (optional)**

   > **lab_generate_profiles_batch** sandbox apalmer industry travel count N use_stored_prefs true dual_load_snowflake true — each profile reserves the next counter via `next-email` before AEP generate + Snowflake INSERT.

6. **Verify**

   > **lab_get_profile** + **lab_snowflake_get_profile_by_email** sandbox apalmer email `{email from generate}` — read `profiles[0].columns` (all 39 fields including LIFETIMEVALUE and holiday fields) and `createdAt`. Do **not** use Snowflake console SQL.

**Example Coworker prompt (full Snowflake row by email):**

> After dual-load generate, call **lab_snowflake_get_profile_by_email** sandbox apalmer email `{email from lab_generate_profile}`. Summarize every column in `profiles[0].columns` — confirm CRM fields (LIFETIMEVALUE, LASTHOLIDAYDESTINATION, CUSTOMERSEGMENT) are populated, not zero/null. Confirm `createdAt` matches `_RECORDCREATEDTIMESTAMP`. Do not ask me to run SQL in Snowflake.

**Snowflake-only batch (`lab_snowflake_generate_base_profiles`)** — default `use_generation_prefs:true` shares the same Firestore counter as Profile Viewer (not the legacy `adamp.adobedemo+DDMMYYYY+N@gmail.com` Snowflake scan). Pass `use_generation_prefs:false` only for Agentic legacy demos.

## Workflow 1c — Snowflake travel governed provision (v3.23+)

Requires user MCP key + Snowflake credential. Full generate/enrich need **AGENTIC_TRAVEL_RUNNER_URL** on Cloud Functions (`runner.configured` from **lab_snowflake_industry_catalog**).

1. **Catalog + connection**

   > **lab_snowflake_config** → **lab_snowflake_test_connection** → **lab_snowflake_industry_catalog** sandbox apalmer industry travel.

2. **Validate proposal (read-only)**

   > **lab_snowflake_validate_proposal** sandbox apalmer recipe_id travel.base_profiles.v1 — or count 5 event_types ["website","booking","mobile"] for generate/enrich.

3. **Provision dry_run then execute**

   > **lab_snowflake_provision** sandbox apalmer industry travel recipe_id travel.base_profiles.v1 dry_run true — review plannedSql — then **lab_snowflake_provision** same args dry_run false.

   Preinstalled Agentic tables: **lab_snowflake_provision** recipe_id travel.agentic_all.preinstalled.v1 dry_run true (existence check only; no CREATE DDL).

4. **Generate full phased data**

   > **lab_snowflake_generate_full** sandbox apalmer count 5 — returns 501/`RUNNER_NOT_CONFIGURED` when runner env is unset.

5. **Query + enrich**

   > **lab_snowflake_query_profiles** limit 10 → **lab_snowflake_enrich_profiles** with CRM rows from query + event_types ["hotel","loyalty"].

## Workflow 1d — Snowflake non-travel event enrichment (v3.27+)

FSI, retail, telecom, media, and sports each have one CRM profile table, four event tables, and one enrichment profile table. All rows share **EMAIL**, **ECID**, and **CRMID**.

1. Provision all six tables idempotently:

   > **lab_snowflake_provision** sandbox apalmer industry retail recipe_id retail.all.v1

2. Generate a dual-load profile and opt into activity generation:

   > **lab_generate_profile** sandbox apalmer industry retail randomize true dual_load_snowflake true snowflake_enrichment true

   `snowflake_enrichment` defaults false for backward-compatible latency. Optionally pass `snowflake_event_types`; omit it for all five retail tables.

3. Validate the joined result without raw SQL:

   > **lab_snowflake_get_profile_bundle** sandbox apalmer industry retail email `{generated email}` event_limit 25

4. Re-running enrichment is retry-safe. The deterministic `GENERATIONID` causes already-populated tables to be reported as idempotent rather than duplicated.

Use the corresponding `{industry}.all.v1` recipe and manifest event keys for fsi, telecom, media, or sports. Travel continues to use its Python runner.

## Workflow 1e — AJO Live Activity customer test (v3.29+)

Live Activity sends are important external actions. They require a user-generated MCP key, an allowlisted sandbox, a customer template, preflight, and explicit colleague confirmation.

1. Find a customer template:

   > **lab_live_activity_list_templates** sandbox apalmer customer "Etihad"

2. Resolve the recipient:

   > **lab_live_activity_profile_context** sandbox apalmer identifier `{profile email}` namespace email

   The result supplies the **ECID** used as `recipients[0].userId` and, when present, a suggested **Live Activity ID** from `liveActivityPushNotificationDetails.0.token`. Use that suggestion unless the colleague explicitly overrides it.

3. Preflight:

   When the colleague supplies the campaign ID, persist it to the shared Portal state:

   > **lab_live_activity_save_execution_state** sandbox apalmer campaign_id `{campaign UUID}`

   Then preflight; `live_activity_id` may be omitted when profile context found the token:

   > **lab_live_activity_preflight** sandbox apalmer template_id `{id}` identifier `{email}` campaign_id `{campaign UUID}` event update variables `{...}`

   If `ready:false`, ask the colleague only for `missingFields`, then preflight again. Never invent campaign, Live Activity, or template-variable values.

4. Confirm and send:

   Read back customer, template, campaign, masked recipient, event, and Live Activity ID from the ready summary. After explicit confirmation:

   > **lab_live_activity_send** sandbox apalmer preflight_id `{id}` confirmed true idempotency_key `{stable retry key}`

5. Verify:

   > **lab_live_activity_list_runs** sandbox apalmer limit 10

Create customer templates with **lab_live_activity_upsert_template**. Use `validate_only:true` first, then save. `variable_definitions[]` paths must stay inside APS `attributes`, `content-state`, or `alert`; those definitions drive Coworker's missing-information questions. User templates are scoped to `principalUid + sandbox` and mirrored to the Portal Live Activities saved list.

### Retail draft table proposals (read-only)

> **lab_snowflake_validate_proposal** sandbox apalmer industry retail proposed_tables ["RETAIL_PROFILE_CUSTOMER","RETAIL_EVENT_PURCHASE"] — no provision recipes for retail yet.

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

When Codex switches to a sandbox that has no Firestore connection docs, generate/update will fail until infra is provisioned.

1. **Assess config**

   > Use lab_sandbox_profile_config for sandbox apalmer. Summarize ready vs notReadyIndustries and next_action per industry.

2. **Get onboarding plan**

   > Use lab_onboard_sandbox with sandbox apalmer, mode plan. List the ordered steps.

3. **Execute one industry (sync)**

   > Use lab_onboard_sandbox with sandbox apalmer, mode execute, industry travel. Wait for completion, then repeat for other not-ready industries.

3b. **HTTP streaming dataflow (Adobe Coworker `dx-api` handoff — when connection missing)**

   Lab MCP creates **schema, field groups, and dataset** (`lab_provision_profile_infra_step` steps `createSchema`, `attachFieldGroups`, `createDataset`) and can **enable Profile** (`lab_enable_profile`). It does **not** create Flow Service entities. This Codex setup has no `dx-api` connector, so hand this step to Adobe Coworker or perform the Flow Service API calls manually.

   > Call **lab_profile_infra_status** for sandbox **apalmer** industry **travel**. If schema/dataset exist but `missing_steps` includes `save_http_streaming_connection`, use **dx-api** (Flow Service) to create: (1) base connection, (2) source connection mapped to schema **`schemaId`**, (3) target connection to dataset **`datasetId`**, (4) dataflow named **`AEP Lab - Travel Profile - Dataflow`**. Header **`x-sandbox-name: apalmer`**. After the flow exists, Profile Viewer → Travel profile generation → **Fetch URL & Flow ID** → **Save connection**. Verify with **lab_sandbox_profile_config**.

   Full reference: `docs/COWORKER_HTTP_STREAMING_FLOWS.md` and **`lab_get_execution_framework`** → `workflows.http_streaming_dx_api`.

4. **Execute all industries (async, Phase 3)**

   > lab_onboard_sandbox: sandbox apalmer, mode execute_all. Poll lab_batch_job_status with job_id every 15s until completed. Report per-industry results.

5. **Ops note for new colleague sandboxes**

   > Ops seeds Firestore mcpSandboxAllowlist/{keyId} or updates AEP_LAB_MCP_ALLOWED_SANDBOXES — see README. Codex verifies with lab_mcp_access_info.

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

4. **Send event (email + ecid + params only — no XDM)**

   > lab_send_profile_event: sandbox apalmer, email event.demo+001@adobetest.com, ecid from step 1, target_id lab-event-tool-edge, event_type transaction, channel web.

5. **Verify**

   > lab_profile_activity for sandbox apalmer, identifier event.demo+001@adobetest.com. Confirm event count increased (allow UPS lag 30–60s).

## Coworker event send recipe (intent demos)

**Problem:** Coworker agents sometimes inject full XDM schema/mixin definitions into event payloads — Edge rejects them. **Fix:** use MCP tool params only; the lab server builds minimal XDM.

### Server-built minimal shape (reference)

When you pass `event_type`, `channel`, `email`, and `ecid`, the backend produces Edge interact XDM like:

```json
{
  "event": {
    "xdm": {
      "identityMap": {
        "ECID": [{"id": "<ecid>", "primary": true}],
        "Email": [{"id": "<email>", "primary": false}]
      },
      "_id": "<timestamp-ms>",
      "eventType": "donation.made",
      "timestamp": "2026-07-15T18:41:26.946Z",
      "interactionDetails": { "core": { "channel": "web" } }
    }
  }
}
```

The server also adds `_demoemea.identification.core` (ecid + email mirror) and a default orchestration `eventID` — **do not** construct these in prompts.

### Multi-event intent flow (profile + events)

1. **Generate profile** — capture `email` + `ecid` from response:

   > lab_generate_profile sandbox apalmer industry generic randomize true — save email and ecid.

2. **Optional preflight** (no send):

   > lab_preflight_profile_event sandbox apalmer email {email} ecid {ecid} event_type donation.made channel web — inspect `generatorPostBody`, not hand-built XDM.

3. **Send multiple simple events** (params only; one `POST /api/events/generator` per event, ~800ms apart):

   > lab_send_profile_events_batch sandbox apalmer email {email} ecid {ecid} channel web event_types ["donation.made", "web.webPageDetails.pageViews", "transaction"]

   Per-step `ok:true` means Edge accepted the event. For `lab-event-tool-edge`, `eventId` in results is **null** — use `requestId` instead. This is not a failure.

4. **Verify** (30–60s UPS lag):

   > lab_profile_activity sandbox apalmer identifier {email}

### Never do this

- Pass `xdm`, `event.xdm`, schema `$id`, `allOf` mixin defs, descriptors, or tenant field-group JSON in tool calls or prompts
- Pass `public: { donationAmount: … }` for basic intent demos — omit unless colleague explicitly needs rich tenant fields
- Use `lab_send_edge_event` `raw_payload` with schema blobs — use `lab_send_profile_event` params instead

### Troubleshooting — "event sent" but profile shows 0 events

**`ok:true` from `lab_send_profile_event` only means Edge accepted the payload** — not that UPS already stitched the event onto the profile. Always verify with **`lab_profile_activity`** after 30–60s.

Before sending, confirm Event tool wiring for the sandbox (not just that static demo targets exist):

1. **`lab_list_event_targets`** — `lab-event-tool-edge` must include a **`dataStreamId`** for this sandbox.
2. **`lab_get_event_config`** — Firestore `eventEdgeConfig` should show `datastreamId`, `schemaId`, `datasetName`.
3. **`lab_setup_event_infra` + `lab_enable_event_profile`** — ExperienceEvent schema/dataset must be Profile-enabled (identityMap alternate primary).
4. **`lab_preflight_profile_event`** — dry-run: check `identityMap`, `generatorPostBody.targetId`, and warnings (email-only / missing ecid).
5. **Identity** — pass **email + ecid** from `lab_generate_profile`; email must match the profile exactly.
6. **Sandbox** — MCP key allowlist sandbox must match the AEP sandbox where the profile and datastream live.

**Codex chain when a colleague reports missing events:**

> (1) `lab_mcp_first_run_setup` — check `readiness.event_targets.lab_event_tool_edge_configured`. (2) `lab_list_event_targets`. (3) Re-run generate, capture ecid. (4) `lab_preflight_profile_event` with email+ecid. (5) `lab_send_profile_event` with `target_id lab-event-tool-edge`. (6) Wait 60s, `lab_profile_activity`.

**If ecid omitted:** MCP auto-fetches from UPS by email; response includes `warnings` when stitching may be weak.

**Public-sector donation demo (rich tenant fields — only when explicitly requested):**

   > lab_send_profile_event with event_type donation.made, public { donationAmount: 250, donationDate: "2026-06-23", eventRegistration: "annual-gala" } — **only** when colleague needs donation attributes on the event; for basic intent demos omit `public`.

**Advanced (direct datastream — avoid raw_payload):**

   > lab_send_edge_event: sandbox apalmer, datastream_id from lab_list_event_targets, email event.demo+001@adobetest.com, ecid from generate, event_type transaction.

## Workflow 5d — Decisioning lab Edge evaluate (v3.18+)

Server-side Edge personalization for Decisioning lab — mirrors Profile Viewer **content-decision-live-edge** without browser Alloy.

1. **`lab_generate_profile`** — capture `email` + `ecid`.
2. **`lab_decision_lab_config`** — confirm `datastreamId`, `targetPageUrl`, `placements`, `edgePersonalizationMode` (`surfaces` | `decisionScopes`).
3. **`lab_decisioning_edge_evaluate`** — `sandbox`, `email`, `ecid` (auto-fetch ecid if email-only).
4. **`lab_explain_decision_response`** — pass `propositions` from step 3 (or `email`/`ecid` to evaluate+explain).
5. **`lab_decisioning_resolve_treatment_name`** — resolve any offer-item UUIDs from explain summaries.

**Example Coworker prompt:**

> Using AEP Orchestration Lab MCP sandbox apalmer: (1) lab_decision_lab_config, (2) lab_decisioning_edge_evaluate for email {email} and ecid {ecid from generate}, (3) lab_explain_decision_response with those propositions. Summarize which placement mounts received content and list treatment names.

**Zero propositions:** read `explain.checklist` — verify AJO policies, datastream personalization service, surface URIs match placement fragments, and profile eligibility.

## Workflow 5e — Decisioning catalog browse + health (v3.19+)

Allowlisted DPS catalog proxies — mirrors Profile Viewer **decisioning-catalog** without browser `/api/aep`.

1. **`lab_decisioning_catalog_schema`** — resolve offer-items `x-schema-id` (Firestore or auto-detect **Personalized Offer Items - Experience Decisioning**).
2. **`lab_decisioning_catalog_list`** — `entity_type` `offer-items` | `item-collections` | `selection-strategies`; `limit` ≤ 50.
3. **`lab_decisioning_catalog_assess`** — health report: expired/scheduled offers, empty collections, strategies without ranking, duplicate priorities, tag gaps; read `suggestions[]`.
4. Optional **`lab_decisioning_catalog_get`** — single entity by id.

**Example Coworker prompt (pre-demo health check):**

> Using AEP Orchestration Lab MCP sandbox apalmer: (1) lab_decisioning_catalog_schema, (2) lab_decisioning_catalog_assess, (3) summarize suggestions and list any expired offers or empty collections blocking Edge personalization.

**Example Coworker prompt (catalog inventory):**

> lab_decisioning_catalog_list sandbox apalmer entity_type selection-strategies limit 50 — then list strategy names, priorities, and linked item collections.

## Workflow 5f — Governed audience audit + deletion (v3.32+)

Audience deletion is irreversible and requires a **user-generated MCP key** whose sandbox scope exactly matches the requested sandbox.

1. **List/search (read-only)**

   > **lab_audience_list** sandbox apalmer name "demo" include_inactive true — inspect the exact `id`, name, origin, lifecycle, and timestamps.

2. **Audit one exact ID (read-only)**

   > **lab_audience_audit** sandbox apalmer audience_id `{exact id field}` — review dependencies/dependents, source-system warning, and the stated audit limitations. This cannot prove that destinations, Account Audiences, or AJO do not use it; Adobe may reject deletion while usage remains.

3. **Confirm**

   > Show the colleague the exact sandbox, `confirmation.audience_id`, and `confirmation.expected_name`. Ask them to explicitly confirm deletion of that one audience. Do not treat a general cleanup request as confirmation for any listed item.

4. **Delete one audience**

   > Only after confirmation: **lab_audience_delete** sandbox apalmer audience_id `{id}` expected_name `{exact current name}` confirmed true. The server re-fetches and exact-matches ID + name immediately before Adobe `DELETE /data/core/ups/audiences/{id}`. No batch-delete tool exists.

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

> **One scrape per URL:** `lab_brand_scrape` reuses **complete** scrapes (`prefer_existing:true`, default) and **in-flight** scrapes for the same URL+sandbox. **Never** fire parallel `lab_brand_scrape` calls — retries and parallel tool calls can create duplicate history cards (most cancelled, one running).
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

## Workflow 6b — Brand scrape offline fallback (blocked site / failed crawl)

Use when live crawl fails (403, bot protection, login wall) or LLM analysis keeps failing. Read **`lab_get_execution_framework`** → `workflows.brand_scrape_offline_fallback` or resource **`lab://framework/brand-scrape-offline`**.

> **Do not** loop `lab_brand_scrape` retries on blocked sites. Failed runs include `coworkerHints.offlineFallback` with the step chain below.

1. **Get offline brief + LLM prompt**

   > lab_brand_scrape_brief: url `https://blocked-brand.com`, customer_name `Blocked Brand`, include `{ "personas": true, "segments": true }`. Share the **LLM task prompt** section with the colleague (or `kind: checklist` for manual Chrome save-page steps).

2. **Colleague produces ZIP (external LLM or manual)**

   - External LLM: paste brief prompt; deliver save-page folder zipped (relative asset paths intact).
   - Manual: Chrome **Save As → Webpage, Complete** + **Image Eye** for logos/images; zip ≤ **30 MB**.

3. **Upload via MCP (Alan/kirkham upload path)**

   > lab_brand_scrape_upload: sandbox apalmer, url `https://blocked-brand.com`, upload_only true, include `{ "personas": true, "demoWebsite": true }`, upload `{ "zip_base64": "<base64>" }`. Default `upload_only:true` skips live crawl. Partial crawl + ZIP: use `lab_brand_scrape` with `use_as_fallback:true` instead.

4. **Poll and optional demo build**

   > lab_poll_brand_scrape scrape_id `<id>` until terminal. If demo clone missing: lab_build_demo_website scrape_id `<id>`.

**Example Coworker one-liner after failed scrape:**

> Crawl failed with bot protection. Call **lab_brand_scrape_brief** for this URL, paste the LLM prompt to the user, and when they return a ZIP call **lab_brand_scrape_upload** with upload_only true.

## Workflow 8 — Brand scrape → golden profiles → events → journey asset

End-to-end chain for customer-specific demo prep.

1. **Resolve existing scrape or scrape with personas**

   > lab_resolve_brand_scrape: sandbox apalmer, url `https://example-brand.com`. If need_new_scrape, lab_brand_scrape same url with include `{ "personas": true, "segments": true, "campaigns": true, "demoWebsite": true }`, wait_for_complete true. If scrape exists but summary has no profileViewerDemoHref, call lab_build_demo_website instead of re-scraping.

2. **Golden profiles**

   > lab_generate_profile_from_brand_scrape: sandbox apalmer, scrape_id `<id>`, persona_index 0 — **omit industry** so `lab_industry` comes from scrape taxonomy; **omit email** so Firestore generation prefs supply scaled email + mobile (same as Portal Profile Generation). Check response `lab_industry` / `industry_readiness` before events.

3. **One-shot orchestration (optional)**

   > lab_prepare_demo_from_brand_scrape: sandbox apalmer, url `https://example-brand.com` (or scrape_id), steps `{ "demo_config_preview": true, "profiles": true, "events": true, "journey": true }`. Show the RTDB diff and apply it separately only after confirmation. Retail/F&B scrapes send commerce journey events (productViews → cart → purchase) with email+ecid from generate — not generic page views.

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
