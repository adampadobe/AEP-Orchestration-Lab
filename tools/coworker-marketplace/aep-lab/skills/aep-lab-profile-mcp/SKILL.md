---
name: aep-lab-profile-mcp
description: >-
  Workflows and example prompts for the AEP Orchestration Lab MCP
  (Streamable HTTP on Cloud Run v3.40.0). Use when choosing an MCP context, generating test profiles, sending
  experience events, evaluating Edge decisioning (Decision lab), browsing Decisioning catalog (DPS),
  setting up event infrastructure (schema/dataset), checking infra, batch seeding, segment personas, brand scraping,
  provisioning profile pipelines, or reading lab execution framework / industry playbooks.
metadata:
  version: "1.0.0"
---

# AEP Orchestration Lab MCP — Coworker workflows

MCP server: **AEP Orchestration Lab MCP v3.40.0** (`aep-orchestration-lab-mcp`; see `tools/aep-lab-profile-mcp/README.md`).

This plugin installs nine focused Coworker connections that share the same API key: `aep-lab-entry` (`/mcp/entry`), `aep-lab-profiles` (`/mcp/profile`), `aep-lab-demo-prep`, `aep-lab-pdf-prep`, `aep-lab-audiences`, `aep-lab-decisioning`, `aep-lab-ajo-cleanup`, `aep-lab-command-centre`, and `aep-lab-weather`. The entry connection is a read-only capability directory and workflow recommender, plus `lab_load_toolset` to pull a domain toolset into the same session; it cannot connect, switch, proxy, or execute another MCP. **Known limitation:** as tested, Adobe Coworker's tool-discovery layer only reflects the tools present at session `initialize` and does not act on the `notifications/tools/list_changed` signal `lab_load_toolset` sends — newly loaded tools register successfully but never become callable in Coworker. That's exactly why this plugin installs the other eight connections directly rather than relying on `lab_load_toolset` alone.

Configure in Coworker with a **single** header, already wired into this plugin's `.mcp.json`:

- `X-AEP-Lab-Mcp-Key` — required for all tools (including provisioning)

**Portal:** generate an MCP key per sandbox **without** completing workspace slug first. The MCP client completes foundations via **`lab_mcp_first_run_setup`** on first connect.

Allowed sandboxes: Firestore **`mcpSandboxAllowlist/{keyId}`** per principal, or env fallback `apalmer`, `kirkham`. Verify with **`lab_mcp_access_info`**.

## Framework knowledge (server-side — no manual retraining)

Call these **before** improvising lab conventions:

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
16. **A complete customer switch auto-classifies then uses one governed preview and apply** — prefer **`lab_demo_customer_switch`** for demo prep. It calls Gemini vision automatically when the saved scrape lacks a usable logo or supporting image classification, then shows the RTDB diff plus all five transformed image slots. Use **`lab_brand_scrape_classify_images`** for an explicit inventory or forced refresh. After explicit confirmation, apply with both preflight ids and one idempotency key. The server labels and privately backs up the prior customer, verifies image hashes before applying RTDB, checks final alignment, and restores the prior image set if the switch fails.
17. **PDF preparation is inspect → preview/analyse → generate or publish → visually verify** — use **`lab_pdf_capabilities`** first. HTML should pass through **`lab_pdf_html_preview`** before **`lab_pdf_generate`**. Documents are previewed through the generated PDF link. Use a fresh idempotency key for each new PDF and reuse it only for an exact retry. Use **`lab_pdf_job_list`** to recover stored output. Analyse server templates before publishing; publication and archive require explicit confirmation. Never place PDF binary in model context or use the broad operational `X-PDF-API-Key`.

### How the lab executes

1. **Onboard** (new sandbox): `lab_sandbox_profile_config` → `lab_onboard_sandbox` (plan / execute / execute_all) until each industry Firestore connection has `streaming.url`, `flowId`, `datasetId`, `schemaId`, `xdmKey` and profile is enabled on the dataset. **HTTP API dataflows:** lab MCP creates schema/FGs/dataset; Coworker **dx-api** creates Flow Service connections + dataflow.
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

**Before first generate on a sandbox:** call **`lab_confirm_profile_generation`** — read `questionsForColleague` + `formatRules`, ask the colleague, then persist with `confirmed:true` + `base_email`. **`lab_mcp_first_run_setup`** and **`lab_prepare_demo_from_brand_scrape`** block the profiles step when prefs are missing and return the same confirm hints.

- **Email format (required)**: `<local>+DDMMYYYY-N@<domain>` — e.g. `apalmer+14072026-3@adobetest.com` (today's date + daily counter N). Legacy `travel.demo+001@adobetest.com` is **rejected** by MCP guardrails.
- **Base email**: stored in Firestore `labProfileGenerationPrefs` (Profile Viewer Profile Generation field or `lab_set_generation_prefs`). MCP `lab_generate_profile` **omits email** to auto-reserve the next counter value.
- **Mobile**: static E.164 from prefs — lab default **`+447425627462`** (visible in Portal + MCP responses).
- **segment_hint** (with `randomize:true`): travel `hotel_high_value` \| `hotel_reactivation`; fsi `high_net_worth` \| `credit_rebuild`; retail `loyalty_vip` \| `cart_abandoner`.
- **Industry aliases**: `telco` / `telecommunications` → `telecom`; `public` → `generic`.
- **Known-profile events** (MCP / Event tool): after `lab_generate_profile`, capture **ecid** from response. Send with **both** email + ecid so `identityMap.ECID` is primary and `identityMap.Email` secondary; `_demoemea.identification.core` carries the same strings. See `lab_get_execution_framework` → `criticalRules.event_identity_stitch`.
- **Anonymous Edge** (Web SDK demos): `getIdentity` then `sendEvent` with `identityMap.ECID` **and** `_<tenant>.identification.core.ecid` (same ECID string). See `docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`.
- **Profile Core v2 top-up**: travel sandboxes need `travelReservations.*` + `hotel.*` tenant leaves — provision step 2 runs ADD-only patch from `profileCoreV2Manifest.js`.

### Example prompt that needs zero manual context

> Call **lab_get_execution_framework** (read criticalRules). **lab_confirm_profile_generation** for sandbox apalmer — show colleague format rules and next preview email. When confirmed, **lab_preflight_profile_generate** industry travel. If ready, **lab_generate_profile** sandbox apalmer industry travel, **omit email** (stored prefs), randomize true, segment_hint `hotel_reactivation`. Verify with **lab_get_profile** — email should be `+DDMMYYYY-N` scaled form.

### One-shot full demo prep (confirm → scrape → profiles → events)

> Sandbox **apalmer**, customer site **https://example-brand.com**. (1) **lab_mcp_access_info**. (2) **lab_mcp_first_run_setup** if new key — if `readiness.generation_prefs.ready` is false, **lab_confirm_profile_generation** and ask colleague for base email (e.g. apalmer@adobetest.com), then `confirmed:true`. (3) **lab_resolve_brand_scrape** url — if `need_new_scrape`, one **lab_brand_scrape** with `include: { personas: true, segments: true, demoWebsite: true }`, `wait_for_complete: true`. (4) **lab_prepare_demo_from_brand_scrape** with `steps: { profiles: true, events: true }` — omit industry and email (scrape-inferred industry + stored prefs). (5) Open demo URL from `profileViewerDemoHref` / `lab_list_brand_scrapes`. (6) **lab_get_profile** + **lab_profile_activity** per scaled email (allow 30–60s UPS lag).

## Full workflow playbook

The critical rules above cover what to always enforce. For the complete numbered workflow catalog — sandbox onboarding, Snowflake dual-load, decisioning Edge evaluation, brand scraping (including the offline fallback), event infrastructure setup, batch seeding, RTDB demo config, audience/AJO cleanup, and AJO Live Activity — see **`references/workflows.md`**. Load it when a task matches one of those areas rather than trying to hold the whole catalog in context up front.
