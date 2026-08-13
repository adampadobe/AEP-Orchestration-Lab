/**
 * AEP Orchestration Lab execution framework — MCP-side source of truth for Coworker.
 * Canonical UI/backend references:
 *   web/profile-viewer/profile-generation-shared.js (email scaler)
 *   web/profile-viewer/profile-generation-*.js (per-industry streams)
 *   functions/profileGenerateService.js, profileStreamingCore.js
 *   functions/industryAttributeMap.js, profileCoreV2Manifest.js
 *   docs/PROFILE_CORE_V2_TOPUP.md, docs/ANONYMOUS_EDGE_DEMO_PATTERN.md
 *   docs/COWORKER_HTTP_STREAMING_FLOWS.md, docs/COWORKER_EDGE_DATASTREAMS.md
 */

import { LAB_INDUSTRY_KEYS, INDUSTRY_ALIASES } from '../industries.mjs';
import {
  SEGMENT_HINTS_BY_INDUSTRY,
  TRAVEL_SEGMENT_HINTS,
  FSI_SEGMENT_HINTS,
  RETAIL_SEGMENT_HINTS,
} from '../personaBuilder/segments.mjs';
import { INDUSTRY_CONNECTION_COLLECTION } from '../sandboxConfig.mjs';
import { LAB_EVENT_TOOL_TARGET_ID } from './eventIdentity.mjs';

/** Lab-default mobile used in Profile Viewer placeholders and bulk seed scripts. */
export const LAB_DEFAULT_MOBILE_PHONE = '+447425627462';

/** Preferred test email domain in lab demos. */
export const LAB_TEST_EMAIL_DOMAIN = 'adobetest.com';

/** BCP-47 default when persona/UI omits language. */
export const LAB_DEFAULT_PREFERRED_LANGUAGE = 'en-US';

/**
 * Non-negotiable profile-generation rules distilled from Profile Viewer UI +
 * functions/profileGenerateService.js + profileStreamingCore.js.
 * Surfaced at top of lab_get_execution_framework and playbooks.
 */
export const CRITICAL_RULES = [
  {
    id: 'test_profile_required',
    rule:
      'Every lab-generated profile MUST be an AEP test profile. MCP defaults test_profile:true; ' +
      'profileGenerateService sets root testProfile:true unless explicitly opted out.',
    payload:
      'Streaming root keys testProfile + xdm:testProfile (dual-write via mirrorRootTestProfileFields). ' +
      'Profile Viewer checkbox pushes both paths before POST.',
    mcp: 'lab_generate_profile test_profile defaults true; false requires test_profile_override_reason.',
    ui: 'web/profile-viewer/profile-generation*.js — "Mark as AEP test profile" (default ON).',
  },
  {
    id: 'preferred_language_required',
    rule:
      'Profiles must carry BCP-47 preferred language or AJO/localization demos fail silently.',
    paths: {
      ui_generic_travel: ['preferences.preferredLanguage', 'personalEmail.language'],
      ui_industry_runtime: ['preferredLanguage', 'personalEmail.language'],
      streaming_root: 'preferredLanguage',
      streaming_preferences: 'preferences.preferredLanguage',
      streaming_personalEmail: 'personalEmail.language',
      tenant_mirror: '_<tenant>.preferredLanguage',
    },
    mirror:
      'profileStreamingCore.mirrorPreferredLanguageDemoSchema — precedence: root preferredLanguage → preferences.preferredLanguage → personalEmail.language; mirrors to tenant.',
    mcp: `MCP randomize enforces language (default ${LAB_DEFAULT_PREFERRED_LANGUAGE}) on all three dot-paths when missing.`,
    default: LAB_DEFAULT_PREFERRED_LANGUAGE,
  },
  {
    id: 'sandbox_config_preflight',
    rule: 'Generate/update fail until lab_sandbox_profile_config reports ready for the target industry.',
    connectionFields: ['streaming.url', 'streaming.flowId', 'streaming.datasetId', 'streaming.schemaId', 'streaming.xdmKey'],
    firestore: 'One collection per industry ({industry}ProfileConnections), doc id = sanitized sandbox name.',
    tool: 'lab_preflight_profile_generate or lab_sandbox_profile_config before first generate on a sandbox.',
  },
  {
    id: 'dual_stream_generate',
    rule:
      'Non-generic lab_generate_profile MUST dual-stream: step 1 POST /api/profile/generate industry generic ' +
      '(generic-owned paths — person, scoring, loyalty, personalEmail, …), step 2 POST industry travel|fsi|… ' +
      'with appendIfExisting:true (industry-owned paths, same email/ECID). Matches Profile Viewer Attributes table Source column.',
    split: 'functions/industryAttributeMap.js resolveIndustryForPath — MCP planDualStreamGenerate mirrors ownership.',
    portal:
      'Travel Generate panel streams via POST /api/profile/update to the travel HTTP connection; union profile Source pills ' +
      'reflect path ownership (generic vs travel), not a single physical dataflow.',
    mcp: 'lab_generate_profile and lab_generate_profiles_batch apply dual-stream automatically when industry !== generic.',
  },
  {
    id: 'full_snapshot_update',
    rule: 'lab_update_profile streams FULL writable industry snapshot — never minimal attribute deltas.',
  },
  {
    id: 'test_email_domain',
    rule:
      'Profile emails use scaled plus-addressing: <local>+DDMMYYYY-N@<domain> (shared Firestore labProfileGenerationPrefs counter). ' +
      'Omit email on lab_generate_profile to auto-reserve; legacy patterns like travel.demo+001@adobetest.com are rejected.',
  },
  {
    id: 'shared_generation_counter',
    rule:
      'Profile Viewer and MCP share one daily counter N per Firebase uid + sandbox in Firestore labProfileGenerationPrefs. ' +
      'POST /api/lab/generation-prefs/next-email atomically reserves the next scaled email (<local>+DDMMYYYY-N@<domain>).',
    portal: 'web/profile-viewer/profile-generation-prefs-sync.js + Profile Viewer Generate button',
    mcp:
      'lab_confirm_generation_plan (preview) → lab_generate_profile with use_stored_prefs:true (default when email omitted) → lab_set_generation_prefs / lab_get_generation_prefs',
    api: [
      'GET /api/lab/generation-prefs?sandbox=',
      'PUT /api/lab/generation-prefs',
      'POST /api/lab/generation-prefs/next-email',
    ],
  },
  {
    id: 'event_identity_stitch',
    rule:
      'Experience events must land on the profile: at least one of email or ecid (10+ digits). After lab_generate_profile, pass BOTH — ecid from response + email.',
    identityMap:
      'ECID primary:true when present; Email primary:false (secondary). Email-only when ecid absent (primary:true). Matches eventEdgeService.buildXdm.',
    tenant:
      '_demoemea.identification.core.ecid + .email must mirror identityMap strings for Demo Website / Event tool stitching.',
    target_id: `Default ${LAB_EVENT_TOOL_TARGET_ID} (Firestore eventConfig datastream) — lab_list_event_targets.`,
    tools: 'lab_preflight_profile_event (dry-run) → lab_send_profile_event → lab_profile_activity verify.',
    mcp:
      'lab_send_profile_event auto-fetches ecid from UPS when email-only; warns when ecid missing on profile. Prefer explicit ecid from generate.',
    ui: 'web/profile-viewer/event-generator.js + event-tool.js — strip requires email or browser ECID.',
  },
  {
    id: 'coworker_event_governed_params',
    rule:
      'NEVER pass custom XDM, schema $refs, mixin definitions, descriptors, or tenant field-group blobs to event tools. ' +
      'Default intent events use sandbox, email, ecid, event_type, channel, timestamp and remain minimal. ' +
      'When the colleague explicitly requests industry detail, pass industry plus optional flat industry_fields; the MCP validates the allowlist, nests public.{industry}.*, and selects full XDM automatically. ' +
      'NEVER pass view_name or view_url or construct event.xdm yourself.',
    never_pass: [
      'xdm / event.xdm JSON blobs',
      'view_name / view_url / viewName / viewUrl',
      'schema $id / meta:altId / allOf mixin definitions',
      'descriptor payloads or field-group schema fragments',
      'hand-built public / message / tenant / xdm_tenant_key; use industry + industry_fields instead',
      'xdm_style=full or edge_minimal=false directly; industry opt-in selects these internally',
      'lab_send_edge_event raw_payload (advanced Edge debugging only — breaks when schema refs are injected)',
    ],
    preferred_tools: ['lab_send_profile_event', 'lab_send_profile_events_batch', 'lab_preflight_profile_event'],
    server_build:
      'POST /api/events/generator → eventEdgeService.buildGeneratorEdgeInteractXdm. Minimal intent calls use buildMinimalEdgeXdm; ' +
      'governed industry calls add validated public.{industry} fields and xdmStyle=full. MCP sends camelCase POST fields only—never viewName/viewUrl or raw XDM.',
    server_built_xdm_shape: {
      wrapper: '{ event: { xdm: { … } } }',
      required_fields: ['identityMap (ECID primary + Email secondary)', 'eventType', '_id', 'timestamp'],
      server_adds_automatically: ['interactionDetails.core.channel when channel param is set'],
      never_in_minimal: [
        'view_name / web.webPageDetails',
        '_demoemea tenant mirror',
        '_experience.campaign.orchestration.eventID',
        'schema refs / mixin blobs',
      ],
      example:
        '{ "event": { "xdm": { "identityMap": { "ECID": [{"id":"…","primary":true}], "Email": [{"id":"…","primary":false}] }, "_id": "…", "eventType": "donation.made", "timestamp": "2026-07-15T18:41:26.946Z", "interactionDetails": { "core": { "channel": "web" } } } } }',
    },
    intent_demo_flow:
      'lab_generate_profile → capture email + ecid → lab_send_profile_events_batch with event_types [donation.made, web.webPageDetails.pageViews, transaction] and channel web → lab_profile_activity after 30–60s.',
    mcp:
      'Default remains minimal. Rich opt-in: industry generic|retail|fsi|telecom|media|travel|sports|public plus optional industry_fields. Omit industry_fields for safe sample defaults.',
  },
  {
    id: 'portal_event_types_free_text',
    rule:
      'event_type accepts ANY string — same free-text field as Event tool / mobile lab senders (e.g. transaction, donation.made, ' +
      'starbucks.mobile.page.view, ferrariworld.pageView). Event tool datalist and retail journey pack are optional suggestions only.',
    retail_journey:
      'lab_send_retail_journey_events or lab_prepare_demo_from_brand_scrape steps.events — optional commerce pack when event_types omitted; ' +
      'retail lab_industry defaults commerce.productViews → … → transaction with email+ecid from generate.',
    batch: 'lab_send_profile_events_batch (sequential POST /api/events/generator per event) or event_types[] on lab_prepare_demo_from_brand_scrape for arbitrary multi-event sequences.',
    ui: 'web/profile-viewer/event-generator.js + mobile lab shells — buildGeneratorPostBody parity in MCP.',
    verify: 'lab_profile_activity after send — allow 30–60s UPS lag; retry if ecid was missing on first attempt.',
  },
  {
    id: 'demo_config_governed_update',
    rule:
      'Real-Time Database demo preparation is user-scoped and preview-first. Always inspect the key-derived workspace, preview allowlisted Section.field changes, show the diff, and obtain explicit colleague confirmation before apply.',
    tools:
      'lab_demo_config_inspect → lab_demo_config_preview (manual changes or completed scrape_id) → explicit confirmation → lab_demo_config_apply → lab_demo_config_inspect readback. Use lab_demo_config_restore for previewed rollback.',
    ownership:
      'The Firebase API derives workspaceSlug from the user-generated MCP key principalUid and verifies workspaceClaims. Never accept or construct an arbitrary ajoLookups path.',
    never:
      'Never write raw RTDB JSON, protected meta, AgenticLayer, ContentDecisionLive, uncatalogued fields, expiring signed logo URLs, invented slogans/short names, or use the shared ops MCP key.',
  },
  {
    id: 'live_activity_preflight_confirmation',
    rule:
      'AJO Live Activity sends are important external actions. Resolve the profile ECID, select an allowlisted customer template, ' +
      'run lab_live_activity_preflight, ask only for missingFields, show the ready summary, and obtain explicit colleague confirmation before lab_live_activity_send.',
    identity:
      'The AJO unitary execution uses ECID as recipients[0].userId. Profile field liveActivityPushNotificationDetails.0.token is returned as the suggested live_activity_id and is not used as the recipient identifier.',
    tools:
      'lab_live_activity_list_templates → lab_live_activity_profile_context → lab_live_activity_save_execution_state when the colleague supplies a campaign ID → lab_live_activity_preflight → explicit confirmation → lab_live_activity_send → lab_live_activity_list_runs.',
    templates:
      'User templates are scoped to MCP principalUid + sandbox and mirrored to the Portal saved-template list. Built-ins are global read-only.',
    execution_state:
      'Campaign and Live Activity IDs are shared with the Portal Live Activities page through principalUid + sandbox state. Read with lab_live_activity_get_execution_state; save colleague-supplied values with lab_live_activity_save_execution_state. Preflight also persists supplied IDs.',
    never:
      'Never send arbitrary raw payloads, bypass preflight, invent campaign/live-activity IDs, reuse another principal preflight, or claim this updates the AJO campaign asset.',
  },
  {
    id: 'decisioning_edge_evaluate',
    rule:
      'Decisioning lab Edge evaluate uses POST /api/decisioning/edge-evaluate (not /api/aep). Load Decision lab config first; pass email + ecid with ECID primary when both present.',
    tools:
      'lab_decision_lab_config → lab_decisioning_edge_evaluate → lab_explain_decision_response → lab_decisioning_resolve_treatment_name (per offer-item id).',
    modes:
      'surfaces (default): web://host/path#fragment URIs from targetPageUrl + placements. decisionScopes: explicit scopes or placement-derived web:// scopes.',
    ui: 'web/profile-viewer/content-decision-live-edge-inline.js + content-decision-edge-mounts.js',
    mcp: 'Sandbox allowlist required. Auto-fetch ecid from UPS when email-only (same as event tools).',
  },
  {
    id: 'decisioning_catalog',
    rule:
      'Decisioning catalog browse uses allowlisted DPS proxies only (POST /api/decisioning/catalog/* — not /api/aep). offer-items requires x-schema-id from GET /api/catalog/config or auto-detect.',
    tools:
      'lab_decisioning_catalog_schema → lab_decisioning_catalog_list → lab_decisioning_catalog_get → lab_decisioning_catalog_assess.',
    entity_types: 'offer-items | item-collections | selection-strategies — limit ≤ 50.',
    ui: 'web/profile-viewer/decisioning-catalog.js',
    mcp: 'Sandbox allowlist required. Run lab_decisioning_catalog_assess before Edge evaluate demos to catch expired offers and empty collections.',
  },
  {
    id: 'audience_delete_confirmation',
    rule:
      'Audience deletion is irreversible: lab_audience_list → lab_audience_audit for one exact id → show sandbox/id/name and risks → explicit colleague confirmation → lab_audience_delete.',
    auth:
      'Requires a user-generated MCP key. The Firebase proxy enforces that the requested sandbox exactly matches the key sandbox.',
    guardrails:
      'Delete accepts one audience only, requires confirmed=true plus the exact expected_name, and re-fetches immediately before DELETE so stale or mismatched confirmations fail closed.',
    audit_limit:
      'Audience detail exposes dependencies/dependents but cannot prove there is no destination, Account Audience, or AJO usage. Adobe may reject deletion while usage remains.',
    never:
      'Never call /api/aep, infer confirmation from a general cleanup request, delete by name alone, or batch-delete audiences.',
  },
  {
    id: 'ajo_cleanup_confirmation',
    rule:
      'AJO deletion is irreversible: use the matching journey/campaign list → audit one exact id → show sandbox/id/name/status and blockers → obtain explicit colleague confirmation → delete one asset.',
    auth:
      'Requires a user-generated MCP key. The Firebase proxy enforces that the requested sandbox exactly matches the key sandbox.',
    guardrails:
      'Delete requires confirmed=true plus exact expected_name and expected_status, re-fetches immediately, allows Draft or Finished journeys and Draft campaigns only, and never batch-deletes.',
    api_note:
      'Current public AJO references document retrieval, while deletion uses the allowlisted authoring lifecycle operations. Adobe permissions or dependencies can still reject deletion.',
    never:
      'Never delete a Live, Paused, Closed, or Stopped journey; never delete a non-Draft campaign; never infer confirmation from a broad cleanup request.',
  },
  {
    id: 'snowflake_profile_readback_by_email',
    rule:
      'NEVER tell the user to run Snowflake console SQL or raw Snowflake MCP SELECT * for dual-load profile verification. ' +
      'Lab MCP returns the full selected industry CRM row (every table column in profiles[].columns + createdAt from _RECORDCREATEDTIMESTAMP).',
    tools:
      'lab_snowflake_get_profile_by_email (email required — most discoverable) or lab_snowflake_query_profiles with email=<email> or ecid=<ecid>.',
    when:
      'After lab_generate_profile with dual_load_snowflake:true — pass the same email from the generate response; read profiles[0].columns for every column.',
    never:
      'Snowflake web console SELECT *, generic Snowflake MCP ad-hoc SQL, or asking colleague to paste SQL manually.',
    mcp: 'Requires user-generated MCP key (ops shared key cannot resolve Snowflake credentials).',
  },
  {
    id: 'brand_scrape_offline_fallback',
    rule:
      'When live brand crawl fails (403, bot protection, auth wall) or LLM analysis fails, do NOT retry lab_brand_scrape in a loop. ' +
      'Use offline upload: colleague produces save-page ZIP (≤30 MB, ~40 files) via external LLM or manual Chrome save + Image Eye.',
    tools:
      'lab_brand_scrape_brief → (colleague external LLM / manual ZIP) → lab_brand_scrape_upload → lab_poll_brand_scrape → lab_build_demo_website (optional).',
    upload:
      'MCP upload.zip_base64 or upload.files[] — same payload as Portal Brand Scraper Options → HTML upload. upload_only:true skips crawl; use_as_fallback:true merges after blocked live pages.',
    limits: 'Max 30 MB ZIP, ~40 files; at least one non-empty .html required.',
    ui: 'web/profile-viewer/brand-scraper-brief.js + brand-scraper.js buildUploadedHtmlPayload',
    mcp: 'lab_brand_scrape also accepts optional upload params; lab_brand_scrape_upload is the dedicated upload-only path.',
  },
];

/** Shared language documentation for playbooks. */
const LANGUAGE_PLAYBOOK = {
  default: LAB_DEFAULT_PREFERRED_LANGUAGE,
  ui_by_generator: {
    generic: ['preferences.preferredLanguage', 'personalEmail.language'],
    travel: ['preferences.preferredLanguage', 'personalEmail.language'],
    fsi_retail_telecom_media_sports: ['preferredLanguage', 'personalEmail.language'],
  },
  streaming_mirror:
    'profileStreamingCore.mirrorPreferredLanguageDemoSchema sets root + tenant preferredLanguage from any source path.',
  mcp_persona_paths: ['preferredLanguage', 'preferences.preferredLanguage', 'personalEmail.language'],
};

/** Shared testProfile documentation for playbooks. */
const TEST_PROFILE_PLAYBOOK = {
  required: true,
  mcp_default: true,
  payload_root_keys: ['testProfile', 'xdm:testProfile'],
  server_default:
    'profileGenerateService rootExtras.testProfile=true unless body.testProfile:false or omitTestProfile',
  opt_out: 'test_profile:false + test_profile_override_reason only for non-demo exceptions',
};

/** Catalog names for HTTP streaming — mirrors functions/*ProfileInfraService.js. */
const INDUSTRY_HTTP_CATALOG_NAMING = {
  generic: {
    schemaTitle: 'AEP Lab - Generic Profile - Schema',
    datasetName: 'AEP Lab - Generic Profile - Dataset',
    httpDataflowName: 'AEP Lab - Generic Profile - Dataflow',
  },
  travel: {
    schemaTitle: 'AEP Lab - Travel Profile - Schema',
    datasetName: 'AEP Lab - Travel Profile - Dataset',
    httpDataflowName: 'AEP Lab - Travel Profile - Dataflow',
  },
  fsi: {
    schemaTitle: 'AEP Lab - FSI Profile - Schema',
    datasetName: 'AEP Lab - FSI Profile - Dataset',
    httpDataflowName: 'AEP Lab - FSI Profile - Dataflow',
  },
  retail: {
    schemaTitle: 'AEP Lab - Retail Profile - Schema',
    datasetName: 'AEP Lab - Retail Profile - Dataset',
    httpDataflowName: 'AEP Lab - Retail Profile - Dataflow',
  },
  telecom: {
    schemaTitle: 'AEP Lab - Telecom Profile - Schema',
    datasetName: 'AEP Lab - Telecom Profile - Dataset',
    httpDataflowName: 'AEP Lab - Telecom Profile - Dataflow',
  },
  media: {
    schemaTitle: 'AEP Lab - Media Profile - Schema',
    datasetName: 'AEP Lab - Media Profile - Dataset',
    httpDataflowName: 'AEP Lab - Media Profile - Dataflow',
  },
  sports: {
    schemaTitle: 'AEP Lab - Sports Profile - Schema',
    datasetName: 'AEP Lab - Sports Profile - Dataset',
    httpDataflowName: 'AEP Lab - Sports Profile - Dataflow',
  },
};

/** Coworker dx-api guidance — no lab MCP Flow Service tool; use Adobe Flow Service skill. */
const HTTP_STREAMING_DX_API_GUIDANCE = {
  when:
    'After lab_provision_profile_infra_step createSchema/attachFieldGroups/createDataset (+ lab_enable_profile) when missing_steps includes save_http_streaming_connection or httpFlow step returns manual:true.',
  coworker_skill: 'dx-api (Flow Service API)',
  flow_service_base: 'https://platform.adobe.io/data/foundation/flowservice',
  headers: ['Authorization', 'x-api-key', 'x-gw-ims-org-id', 'x-sandbox-name'],
  steps: [
    'Resolve HTTP API streaming connectionSpec (GET /connectionSpecs)',
    'POST /connections — base connection',
    'POST /sourceConnections — link base + schema',
    'POST /targetConnections — link dataset (datasetId from MCP)',
    'POST /flows — dataflow (name from naming.httpDataflow); list-by-name first for idempotency',
  ],
  ids_from_mcp: {
    sandbox: 'MCP sandbox argument → x-sandbox-name',
    schemaId: 'lab_provision_profile_infra_step or lab_profile_infra_status → schemaId',
    datasetId: 'lab_provision_profile_infra_step or lab_profile_infra_status → datasetId',
    xdmKey: 'lab_provision response xdmKey → streaming.xdmKey on save',
    httpDataflowName: 'status naming.httpDataflow (e.g. AEP Lab - Travel Profile - Dataflow)',
    schemaTitle: 'status naming.schema',
    datasetName: 'status naming.dataset',
  },
  after_flow_created:
    'Profile Viewer Profile generation → Fetch URL & Flow ID from AEP → Save connection. Verify lab_sandbox_profile_config ready for industry.',
  doc: 'docs/COWORKER_HTTP_STREAMING_FLOWS.md',
};

/** Coworker dx-api guidance for Event tool Edge datastreams — not automated in lab MCP. */
const EDGE_DATASTREAM_DX_API_GUIDANCE = {
  when:
    'After lab_setup_event_infra (+ lab_enable_event_profile) when Firestore eventEdgeConfig has no datastreamId and lab-event-tool-edge is unavailable.',
  coworker_skill: 'dx-api (Edge Configuration / Datastream API)',
  edge_api_base: 'https://edge.adobe.io/ee/v2/datastreamConfigs',
  headers: ['Authorization', 'x-api-key', 'x-gw-ims-org-id', 'x-sandbox-name'],
  steps: [
    'lab_setup_event_infra (+ lab_enable_event_profile or enable_for_profile:true)',
    'GET /ee/v2/datastreamConfigs — list; reuse by title if present',
    'POST /ee/v2/datastreamConfigs — mappingSchemaId + Adobe Experience Platform service datasets[{id,schema}]',
    'lab_save_event_datastream datastream_id {uuid} (+ schema_id, dataset_name metadata)',
    'lab_list_event_targets — lab-event-tool-edge should include dataStreamId',
  ],
  ids_from_mcp: {
    sandbox: 'MCP sandbox argument → x-sandbox-name',
    schemaId: 'lab_setup_event_infra → schema_id',
    datasetId: 'lab_setup_event_infra → dataset_id',
    schemaTitle: 'default AEP Lab - Event Generic - Schema',
    datasetName: 'default AEP Lab - Event Generic - Dataset',
    suggestedDatastreamTitle: 'AEP Lab - Event Generic - Datastream',
  },
  aep_service_payload: {
    name: 'Adobe Experience Platform',
    enabled: true,
    settings: {
      datasets: [{ id: '<dataset_id>', schema: '<schema_id>' }],
    },
  },
  optional_services: [
    'Experience Cloud ID Service (Identity) — Web SDK ECID demos',
    'Real-time Customer Profile — when lab_enable_event_profile ran',
  ],
  lab_mcp_does_not_create: ['Edge datastream / datastreamConfigs POST'],
  after_save: 'lab_send_profile_event target_id lab-event-tool-edge (Edge interact, not Flow Service DCS)',
  doc: 'docs/COWORKER_EDGE_DATASTREAMS.md',
  reference_impl: 'functions/eventEdgeService.js createDatastreamConfig',
};

/** Shared dataflow / connection shape per industry. */
function dataflowPlaybook(industry) {
  const collection = INDUSTRY_CONNECTION_COLLECTION[industry];
  const catalogNaming = INDUSTRY_HTTP_CATALOG_NAMING[industry] || null;
  return {
    firestoreCollection: collection,
    firestoreDocPattern: '{sanitizedSandboxName}',
    connectionApi: `/api/${industry === 'generic' ? 'generic-profile' : `${industry}-profile`}-connection`,
    manifestFields: ['streaming.url', 'streaming.flowId', 'streaming.datasetId', 'streaming.schemaId', 'streaming.xdmKey'],
    prerequisite: 'lab_sandbox_profile_config ready:true for this industry before lab_generate_profile',
    flowPattern: 'HTTP API connection → Adobe DCS collection URL + flowId; envelope uses datasetId + schemaId',
    catalogNaming,
    http_streaming_via_dx_api: HTTP_STREAMING_DX_API_GUIDANCE,
  };
}

const COMMON_FAILURE_MODES = [
  {
    symptom: '400 missing streaming.datasetId/schemaId',
    cause: 'Firestore connection incomplete — HTTP API dataflow not saved after schema/dataset provision',
    fix:
      'lab_sandbox_profile_config → if infra ready but connection missing: use Coworker **dx-api** skill for Flow Service (base → source → target → dataflow) with datasetId/schemaId from lab_profile_infra_status, then Profile Viewer Fetch URL & Flow ID + Save connection. See workflows.http_streaming_dx_api.',
  },
  {
    symptom: 'httpFlow step returns manual:true / save_http_streaming_connection missing',
    cause: 'Lab MCP creates schema+FGs+dataset only; Flow Service entities are not automated in lab MCP',
    fix:
      'Use Coworker **dx-api** with naming.httpDataflow + datasetId + schemaId from MCP status. After flow exists, save inlet URL + flowId via Profile Viewer or verify with lab_sandbox_profile_config.',
  },
  {
    symptom: 'Profile streams but industry attributes missing in UPS',
    cause: 'Tenant-prefixed paths on OOTB root mixins (e.g. travelPreferences, personalFinances, subscriptions)',
    fix: 'Use paths from industry playbook; travel needs Profile Core v2 top-up for travelReservations/hotel',
  },
  {
    symptom: 'AJO cannot target profile / not in test segment',
    cause: 'testProfile or preferredLanguage not on streamed record',
    fix: 'Ensure test_profile:true (default) and language paths populated — run lab_preflight_profile_generate',
  },
  {
    symptom: 'Industry not ready',
    cause: 'Schema/dataset/profile union or HTTP connection not saved',
    fix: 'lab_sandbox_profile_config → lab_enable_profile → lab_provision_profile_infra_step',
  },
  {
    symptom: 'Event sent but not on profile / lab_profile_activity count unchanged',
    cause: 'Email-only event without ecid, wrong datastream (target_id), or UPS lag',
    fix:
      'lab_generate_profile → capture ecid → lab_preflight_profile_event → lab_send_profile_event with email+ecid → retry activity after 30–60s',
  },
  {
    symptom: '400 missing identity on event send',
    cause: 'Neither email nor valid ecid (10+ digits) in request',
    fix: 'Pass email and/or ecid from lab_generate_profile response',
  },
  {
    symptom: 'Event generator target missing / no datastream',
    cause: `Firestore eventConfig has no datastreamId for sandbox — ${LAB_EVENT_TOOL_TARGET_ID} unavailable`,
    fix:
      'lab_setup_event_infra + lab_enable_event_profile, then Coworker **dx-api** Edge datastream (see workflows.edge_datastream_dx_api), then lab_save_event_datastream. Or Event tool Step 2 save.',
  },
];

/**
 * @returns {object} Structured execution framework for lab_get_execution_framework / resources.
 */
export function getExecutionFramework() {
  return {
    version: '3.38.0',
    criticalRules: CRITICAL_RULES,
    summary:
      'The lab streams Profile-class XDM via per-industry HTTP API connections (Firestore manifest). ' +
      'Generate creates/streams a profile; update re-streams a full writable snapshot (not deltas); ' +
      'events add ExperienceEvent rows via Edge or DCS generator targets.',
    workflows: {
      mcp_first_run: {
        tools: ['lab_mcp_access_info', 'lab_mcp_first_run_setup', 'lab_sandbox_profile_config', 'lab_onboard_sandbox'],
        when: 'Immediately after Coworker connects with a new MCP key — before first lab_generate_profile.',
        order: [
          'lab_mcp_access_info — confirm sandbox on allowlist',
          'lab_mcp_first_run_setup sandbox {sandbox} workspace_slug {slug} — Firestore profile + RTDB ajoLookups/{slug}',
          'lab_sandbox_profile_config — industry connections ready vs notReadyIndustries',
          'lab_onboard_sandbox mode=plan or execute_all if infra missing',
        ],
        note:
          'Portal MCP key generation no longer requires workspace slug first. workspace_slug (ldapSlug) may equal or differ from AEP sandbox name.',
      },
      check_access: {
        tools: ['lab_mcp_access_info'],
        when: 'Start of every Coworker session or after sandbox switch.',
      },
      demo_config_prep: {
        tools: [
          'lab_demo_config_inspect',
          'lab_demo_config_preview',
          'lab_demo_config_apply',
          'lab_demo_config_restore',
        ],
        order: [
          'lab_demo_config_inspect — show current sections, values and editable fields for the key-owned workspace',
          'lab_demo_config_preview with explicit changes or completed scrape_id — no RTDB write',
          'Show the before/after diff and obtain explicit colleague confirmation',
          'lab_demo_config_apply preflight_id confirmed:true idempotency_key:<stable key>',
          'lab_demo_config_inspect — verify current values; save revisionId for optional restore',
        ],
        note:
          'Brand scrape mapping updates only evidence-backed customer name/URL/stable logo/colour and inferred industry. It never invents slogans or abbreviations.',
      },
      onboard_sandbox: {
        tools: ['lab_sandbox_profile_config', 'lab_onboard_sandbox', 'lab_batch_job_status'],
        order: [
          'lab_mcp_access_info — confirm sandbox on allowlist',
          'lab_sandbox_profile_config — list ready vs notReadyIndustries',
          'lab_onboard_sandbox mode=plan — ordered checklist',
          'lab_provision_profile_infra_step steps createSchema, attachFieldGroups, createDataset (+ lab_enable_profile)',
          'If connection still missing: Coworker dx-api Flow Service for HTTP dataflow (see http_streaming_dx_api)',
          'lab_onboard_sandbox mode=execute industry=<key> — one industry per call (sync)',
          'lab_onboard_sandbox mode=execute_all — async all industries; poll lab_batch_job_status',
        ],
        note: 'Generate/update fail until Firestore connection has streaming.url, flowId, datasetId, schemaId, xdmKey.',
      },
      http_streaming_dx_api: {
        tools: [
          'lab_provision_profile_infra_step',
          'lab_enable_profile',
          'lab_profile_infra_status',
          'lab_sandbox_profile_config',
        ],
        coworker_skill: 'dx-api (Flow Service API — not a lab MCP tool)',
        when:
          'Schema + field groups + dataset exist (lab MCP) but HTTP API streaming dataflow + Firestore connection manifest are missing.',
        lab_mcp_creates: ['schema', 'field groups', 'Profile-enabled dataset'],
        lab_mcp_does_not_create: ['Flow Service base/source/target connections', 'HTTP API dataflow', 'DCS inlet URL'],
        order: [
          'lab_provision_profile_infra_step sandbox {sandbox} industry {industry} step createSchema (skip if exists)',
          'lab_provision_profile_infra_step step attachFieldGroups',
          'lab_provision_profile_infra_step step createDataset',
          'lab_enable_profile sandbox {sandbox} industry {industry}',
          'lab_profile_infra_status — copy schemaId, datasetId, naming.httpDataflow, xdmKey',
          'Coworker dx-api: connectionSpec → POST /connections → POST /sourceConnections → POST /targetConnections → POST /flows',
          'Profile Viewer Profile generation → Fetch URL & Flow ID → Save connection (or POST /api/{industry}-profile-connection)',
          'lab_sandbox_profile_config — confirm industry ready:true',
        ],
        flow_service: HTTP_STREAMING_DX_API_GUIDANCE,
        doc: 'docs/COWORKER_HTTP_STREAMING_FLOWS.md',
      },
      generate_profile: {
        tools: ['lab_profile_infra_status', 'lab_generate_profile', 'lab_lookup_profile', 'lab_get_profile'],
        steps: [
          'Optional: lab_profile_infra_status for sandbox + industry',
          'lab_generate_profile with email, sandbox, industry, randomize:true (or explicit attributes)',
          'Verify: lab_get_profile namespace=email',
        ],
        api: 'POST /api/profile/generate',
        serverSidePersona: 'MCP randomize builds correlated attributes in src/personaBuilder/ (mirrors Profile Viewer Fill random sample).',
      },
      snowflake_dual_load_industry_crm: {
        tools: [
          'lab_snowflake_config',
          'lab_snowflake_test_connection',
          'lab_snowflake_industry_catalog',
          'lab_snowflake_table_structure',
          'lab_confirm_profile_generation',
          'lab_generate_profile',
          'lab_get_profile',
          'lab_snowflake_get_profile_by_email',
          'lab_snowflake_query_profiles',
          'lab_snowflake_create_profile',
        ],
        when:
          'Travel, FSI, retail, telecom, media, and sports demos: AEP behavioral persona + independent Snowflake operational CRM with shared email/ECID/CRMID.',
        requires: 'User-generated MCP key (principalUid) — ops shared key cannot resolve Snowflake credentials.',
        order: [
          'lab_snowflake_config — hasCredential must be true (save key pair in Profile Viewer if not)',
          'lab_snowflake_test_connection — confirm Snowflake version or NETWORK POLICY hint (static IP 34.58.81.28)',
          'lab_snowflake_industry_catalog — review phaseTables, dualLoadTarget, dualLoad.defaultMode (crm_generate), tableCheck',
          'lab_confirm_profile_generation — shared AEP email prefs (Firestore labProfileGenerationPrefs)',
          'lab_generate_profile industry {non-generic industry} randomize true dual_load_snowflake true — omit email; AEP streams persona and Snowflake independently generates operational CRM fields',
          'lab_get_profile + lab_snowflake_get_profile_by_email industry {same industry} email {same email} — verify shared identity plus complementary CRM columns; never Snowflake console SQL',
        ],
        doc: 'docs/SNOWFLAKE_INTEGRATION.md',
      },
      snowflake_travel_catalog: {
        tools: ['lab_snowflake_industry_catalog', 'lab_snowflake_table_structure'],
        when: 'Read-only Snowflake travel manifest introspection before generate-full or enrich (no arbitrary SQL).',
        order: [
          'lab_snowflake_industry_catalog sandbox {sandbox} industry travel',
          'lab_snowflake_table_structure sandbox {sandbox} phase phase1 (repeat phase2/phase3 as needed)',
        ],
        doc: 'docs/SNOWFLAKE_INTEGRATION.md',
      },
      snowflake_travel_provision: {
        tools: [
          'lab_snowflake_config',
          'lab_snowflake_test_connection',
          'lab_snowflake_industry_catalog',
          'lab_snowflake_validate_proposal',
          'lab_snowflake_provision',
          'lab_snowflake_generate_full',
          'lab_snowflake_query_profiles',
          'lab_snowflake_enrich_profiles',
        ],
        when:
          'Governed Snowflake travel table provision + phased generate/enrich via Python runner (AGENTIC_TRAVEL_RUNNER_URL).',
        requires: 'User-generated MCP key; runner configured on functions deployment.',
        order: [
          'lab_snowflake_config + lab_snowflake_test_connection',
          'lab_snowflake_industry_catalog — review provisionRecipes + tableCheck + runner.configured',
          'lab_snowflake_validate_proposal recipe_id travel.base_profiles.v1 (or preinstalled recipe)',
          'lab_snowflake_provision recipe_id travel.base_profiles.v1 dry_run true — then dry_run false',
          'lab_snowflake_validate_proposal count {n} event_types [website,booking,…]',
          'lab_snowflake_generate_full count {n}',
          'lab_snowflake_query_profiles limit 10',
          'lab_snowflake_enrich_profiles with CRM rows + event_types',
        ],
        doc: 'docs/SNOWFLAKE_INTEGRATION.md',
      },
      update_profile: {
        tools: ['lab_get_profile', 'lab_update_profile'],
        rule:
          'FULL-SNAPSHOT STITCH: fetch current UPS rows, merge attribute_changes, POST ALL writable fields for the industry dataflow. ' +
          'Never send minimal deltas — timeseries ingestion clears sibling leaves.',
        api: 'POST /api/profile/update?industry=',
      },
      send_event: {
        tools: [
          'lab_generate_profile',
          'lab_list_event_targets',
          'lab_preflight_profile_event',
          'lab_send_profile_event',
          'lab_send_profile_events_batch',
          'lab_profile_activity',
        ],
        steps: [
          'lab_generate_profile — capture ecid from response + email',
          'lab_list_event_targets — pick target_id (default lab-event-tool-edge)',
          'Optional: lab_preflight_profile_event — shows identityMap + generatorPostBody (NOT raw XDM to construct)',
          'lab_send_profile_event with email AND ecid, event_type, channel — server builds minimal XDM by default',
          'Optional rich detail: add industry + flat industry_fields; MCP validates and builds public.{industry} with full XDM',
          'Multi-event demos: lab_send_profile_events_batch supports the same industry + industry_fields per events[] step',
          'lab_profile_activity — confirm event count (allow UPS lag)',
        ],
        never_pass: [
          'Custom xdm / event.xdm JSON',
          'view_name / view_url (adds web.webPageDetails)',
          'Schema refs, mixin definitions, descriptors, tenant field-group payloads',
          'hand-built public / message / xdm_tenant_key; use industry + industry_fields for rich context',
        ],
        identity_rules: [
          'At least one of email or ecid required',
          'identityMap: ECID primary when both present; Email secondary',
          'Minimal default: identityMap + eventType + _id + timestamp + interactionDetails.core.channel only',
          'Industry opt-in: validated public.{industry}.* plus the same stitched identity',
        ],
        server_build:
          'eventEdgeService.buildGeneratorEdgeInteractXdm → minimal by default or governed full industry XDM. See criticalRules.coworker_event_governed_params.',
        coworker_event_send_recipe: {
          summary: 'Profile + intent events — params only, server builds XDM',
          steps: [
            'lab_generate_profile sandbox {sandbox} industry {industry} — save email + ecid from response',
            'lab_send_profile_events_batch sandbox {sandbox} email {email} ecid {ecid} channel web event_types ["donation.made","web.webPageDetails.pageViews","transaction"]',
            'Wait 30–60s, then lab_profile_activity sandbox {sandbox} identifier {email}',
          ],
          single_event_example:
            'lab_send_profile_event sandbox apalmer email {email} ecid {ecid} event_type donation.made channel web',
          rich_industry_example:
            'lab_send_profile_event sandbox apalmer email {email} ecid {ecid} industry media industry_fields {contentTitle, genre, subscriptionTier}',
          preflight:
            'lab_preflight_profile_event with same params — inspect generatorPostBody (camelCase POST fields), not hand-built XDM',
        },
        advanced:
          'lab_send_edge_event when datastream_id is known. Avoid raw_payload unless debugging — prefer lab_send_profile_event.',
        api: 'POST /api/events/generator or POST /api/events/edge',
      },
      send_live_activity: {
        tools: [
          'lab_live_activity_list_templates',
          'lab_live_activity_profile_context',
          'lab_live_activity_get_execution_state',
          'lab_live_activity_save_execution_state',
          'lab_live_activity_preflight',
          'lab_live_activity_send',
          'lab_live_activity_list_runs',
        ],
        steps: [
          'lab_live_activity_list_templates sandbox {sandbox} with optional customer filter',
          'lab_live_activity_profile_context with email or other identifier — capture ECID and suggested live_activity_id from the profile token',
          'lab_live_activity_get_execution_state — reuse the campaign ID already remembered for this user + sandbox when appropriate',
          'When the colleague supplies a campaign ID, lab_live_activity_save_execution_state so the Portal UI restores it',
          'lab_live_activity_preflight with template_id + known fields',
          'If ready:false, ask only for missingFields and preflight again',
          'If ready:true, show customer/template/campaign/masked recipient/event/Live Activity ID and ask for explicit confirmation',
          'lab_live_activity_send with preflight_id + confirmed:true; use stable idempotency_key for retries',
          'lab_live_activity_list_runs to inspect the result',
        ],
        note:
          'The payload references campaignId for AJO unitary execution; it does not edit the campaign asset. ECID is the recipient identifier. The profile push token is the suggested Live Activity ID. Execution IDs are shared with the Portal per principal + sandbox.',
      },
      event_infra_setup: {
        tools: [
          'lab_setup_event_infra',
          'lab_enable_event_profile',
          'lab_get_event_config',
          'lab_save_event_datastream',
          'lab_list_event_targets',
        ],
        when: 'Sandbox needs ExperienceEvent schema + dataset + Edge datastream before Event tool / lab_send_profile_event.',
        order: [
          'lab_setup_event_infra sandbox {sandbox} — schema + field groups + dataset',
          'lab_enable_event_profile (or enable_for_profile:true on setup) — identityMap alternate primary',
          'Coworker dx-api: POST edge.adobe.io/ee/v2/datastreamConfigs with AEP service → schema_id + dataset_id',
          'lab_save_event_datastream datastream_id {id} (+ schema_id, schema_title, dataset_name)',
          'lab_list_event_targets — confirm lab-event-tool-edge has dataStreamId',
        ],
        naming: {
          default_schema_title: 'AEP Lab - Event Generic - Schema',
          default_dataset_name: 'AEP Lab - Event Generic - Dataset',
          suggested_datastream_title: 'AEP Lab - Event Generic - Datastream',
          dataset_derive: 'Replace word Schema with Dataset in schema title unless dataset_name set',
        },
        edge_datastream: EDGE_DATASTREAM_DX_API_GUIDANCE,
        api: 'POST /api/events/infra/step step=setupEventInfra',
        doc: 'docs/COWORKER_EDGE_DATASTREAMS.md',
      },
      edge_datastream_dx_api: {
        tools: [
          'lab_setup_event_infra',
          'lab_enable_event_profile',
          'lab_get_event_config',
          'lab_save_event_datastream',
          'lab_list_event_targets',
        ],
        coworker_skill: 'dx-api (Edge Configuration API — not a lab MCP tool)',
        when: 'Event schema + dataset exist but no datastreamId in Firestore eventEdgeConfig.',
        lab_mcp_creates: ['ExperienceEvent schema', 'field groups', 'dataset', 'Profile enable (optional step)'],
        lab_mcp_does_not_create: ['Edge datastream / datastreamConfigs'],
        order: [
          'lab_setup_event_infra sandbox {sandbox}',
          'lab_enable_event_profile sandbox {sandbox}',
          'Coworker dx-api: GET then POST /ee/v2/datastreamConfigs (see edge_datastream payload)',
          'lab_save_event_datastream sandbox {sandbox} datastream_id {uuid}',
          'lab_list_event_targets — lab-event-tool-edge',
        ],
        edge_configuration: EDGE_DATASTREAM_DX_API_GUIDANCE,
        doc: 'docs/COWORKER_EDGE_DATASTREAMS.md',
      },
      decisioning_edge_evaluate: {
        tools: [
          'lab_decision_lab_config',
          'lab_decisioning_edge_evaluate',
          'lab_explain_decision_response',
          'lab_decisioning_resolve_treatment_name',
        ],
        when:
          'Coworker needs server-side Edge personalization propositions for Decisioning lab (surfaces or decisionScopes) without browser Alloy.',
        order: [
          'lab_generate_profile — capture email + ecid',
          'lab_decision_lab_config sandbox {sandbox} — datastreamId, targetPageUrl, placements, edgePersonalizationMode',
          'lab_decisioning_edge_evaluate sandbox {sandbox} email {email} ecid {ecid}',
          'lab_explain_decision_response with propositions from evaluate (or pass email/ecid to evaluate+explain)',
          'lab_decisioning_resolve_treatment_name for unresolved offer-item ids',
        ],
        identity_rules: [
          'email + ecid from generate; ECID primary in identityMap when both present',
          'Surfaces built from targetPageUrl + placement fragments (web://host/path#fragment)',
        ],
        api: ['POST /api/decisioning/edge-evaluate', 'POST /api/decisioning/explain', 'GET /api/decisioning/treatment-name'],
        ui: 'web/profile-viewer/content-decision-live-edge.html',
        never: 'Do not call /api/aep from MCP — lab proxies only.',
      },
      decisioning_catalog: {
        tools: [
          'lab_decisioning_catalog_schema',
          'lab_decisioning_catalog_list',
          'lab_decisioning_catalog_get',
          'lab_decisioning_catalog_assess',
        ],
        when:
          'Coworker needs AJO Experience Decisioning catalog inventory or pre-demo health check (offers, collections, strategies) without browser catalog UI.',
        order: [
          'lab_decisioning_catalog_schema sandbox {sandbox} — resolve offer-items x-schema-id',
          'lab_decisioning_catalog_list entity_type offer-items (then item-collections, selection-strategies)',
          'lab_decisioning_catalog_assess — expired offers, empty collections, duplicate strategy priorities',
          'Optional: lab_decisioning_catalog_get for single entity drill-down',
        ],
        entity_types: ['offer-items', 'item-collections', 'selection-strategies'],
        api: [
          'GET /api/decisioning/catalog/schema',
          'POST /api/decisioning/catalog/list',
          'POST /api/decisioning/catalog/get',
          'POST /api/decisioning/catalog/assess',
          'GET/POST /api/catalog/config (schema persistence)',
        ],
        ui: 'web/profile-viewer/decisioning-catalog.html',
        never: 'Do not call /api/aep from MCP — allowlisted DPS paths only via lab catalog proxies.',
      },
      audience_cleanup: {
        tools: ['lab_audience_list', 'lab_audience_audit', 'lab_audience_delete'],
        when: 'A colleague wants to inventory and remove obsolete AEP audiences.',
        order: [
          'lab_audience_list — search read-only inventory; retain the exact id field',
          'lab_audience_audit audience_id {id} — review current metadata, dependencies/dependents and audit limitations',
          'Show exact sandbox + audience id + expected name; obtain explicit colleague confirmation',
          'lab_audience_delete with the same id/name and confirmed true — one audience only',
        ],
        api: ['GET/DELETE /api/audience-management', 'DELETE /data/core/ups/audiences/{id}'],
        auth: 'User-generated MCP key; key sandbox must exactly match request sandbox.',
        never: 'No generic /api/aep access, deletion by name, inferred confirmation, or batch delete.',
      },
      batch_seed: {
        tools: ['lab_generate_profiles_batch', 'lab_batch_job_status'],
        limits: { maxCount: 100, rateLimit: '3 batch jobs/hour per MCP key' },
      },
      brand_scrape_to_profile: {
        tools: [
          'lab_resolve_brand_scrape',
          'lab_brand_scrape',
          'lab_get_brand_scrape',
          'lab_generate_profile_from_brand_scrape',
          'lab_send_profile_event',
          'lab_profile_activity',
        ],
        steps: [
          'lab_resolve_brand_scrape for sandbox + url (optional — lab_brand_scrape also dedupes by default)',
          'If need_new_scrape: lab_brand_scrape with include.personas:true (default MCP scrape omits personas — enable explicitly); force_new:true only to refresh',
          'lab_generate_profile_from_brand_scrape scrape_id + persona_index (or all_personas:true)',
          'lab_send_profile_event with email + ecid from generate response',
          'lab_profile_activity verify',
        ],
        note:
          'lab_brand_scrape defaults prefer_existing:true — reuses complete scrapes with personas for the same URL. ' +
          'Call lab_resolve_brand_scrape first for explicit checks, or force_new:true for a fresh crawl. ' +
          'Stuck runs: lab_cancel_brand_scrape or Portal history Cancel. ' +
          'Scrape personas are marketing narrative; golden profiles overlay identity onto personaBuilder industry randomize. ' +
          'Scrape segments[] are demo copy, not UPS audiences — use lab segment_hint or RTCDP APIs separately.',
      },
      brand_scrape_demo_prep: {
        tools: [
          'lab_resolve_brand_scrape',
          'lab_brand_scrape',
          'lab_prepare_demo_from_brand_scrape',
          'lab_demo_config_inspect',
          'lab_demo_config_preview',
          'lab_demo_config_apply',
          'lab_send_retail_journey_events',
          'lab_get_profile',
          'lab_profile_activity',
        ],
        steps: [
          'lab_resolve_brand_scrape sandbox + customer url (require_complete + require_personas default true)',
          'If need_new_scrape: lab_brand_scrape same url with include { personas: true, segments: true, campaigns: true }',
          'lab_prepare_demo_from_brand_scrape scrape_id (or url) steps { demo_config_preview: true, profiles: true, events: true } — RTDB remains preview-only until separately confirmed/applied',
          'Show pipeline.demoConfigPreview diff; after colleague confirmation call lab_demo_config_apply',
          'Or lab_send_retail_journey_events per profile with email + ecid from generate',
          'lab_get_profile / lab_profile_activity verify (allow UPS lag 30–60s after events)',
        ],
        note:
          'One-shot orchestration chains golden profiles, Portal-aligned event sequences (not generic web.webPageViews), optional CJv2 HTML. ' +
          'Event types MUST match Event tool datalist — never custom starbucks.* strings. Does not create RTCDP audiences or AJO platform journeys.',
      },
      brand_scrape_offline_fallback: {
        tools: [
          'lab_brand_scrape',
          'lab_brand_scrape_brief',
          'lab_brand_scrape_upload',
          'lab_poll_brand_scrape',
          'lab_build_demo_website',
          'lab_get_brand_scrape',
        ],
        steps: [
          'lab_brand_scrape sandbox + url — if scrapeStatus failed or crawl blocked (403/bot protection), read coworkerHints.offlineFallback',
          'lab_brand_scrape_brief same url + include flags — share LLM task prompt with colleague (or kind:checklist for manual save-page steps)',
          'Colleague: external LLM produces save-page ZIP OR manual Chrome Save As Complete + Image Eye for logos/images',
          'lab_brand_scrape_upload sandbox + url + upload.zip_base64 (or upload.files[]) — default upload_only:true; include.demoWebsite when site clone needed',
          'lab_poll_brand_scrape until scrapeStatus complete',
          'Optional: lab_build_demo_website when demo was not included in upload analyse',
        ],
        note:
          'Upload limits: 30 MB, ~40 files. MCP upload path matches Portal Options → HTML upload (Alan/kirkham sandboxes). ' +
          'use_as_fallback:true on lab_brand_scrape when some pages crawl but others are blocked. ' +
          'Resource: lab://framework/brand-scrape-offline',
      },
    },
    when_to_use: {
      lab_generate_profile:
        'New test identity, first stream into sandbox, or refresh with randomize/segment_hint. Sets testProfile by default.',
      lab_update_profile:
        'Change existing profile attributes after discuss step. Requires profile already in UPS. Uses industry dataflow from argument.',
      lab_preflight_profile_event:
        'Dry-run event identity + target resolution without sending; previews governed industry payloads when industry is supplied.',
      lab_send_profile_event:
        'Append experience events without rewriting profile attributes. Minimal by default; industry + industry_fields safely opts into richer public.{industry} context.',
      lab_send_edge_event:
        'Direct Alloy-style Edge interact when you have datastream_id; same identityMap rules; include _demoemea.identification.core for Demo Website schemas.',
      lab_live_activity_preflight:
        'Required dry-run for AJO Live Activity: resolves ECID and profile-derived Live Activity ID when possible, persists supplied execution IDs to shared Portal state, and returns missingFields or a redacted ready summary plus short-lived preflightId.',
      lab_live_activity_send:
        'Important external push action. Use only after explicit colleague confirmation of a ready preflight; exact payload hash and idempotency are enforced.',
      lab_demo_config_inspect:
        'First step for any Real-Time Database demo preparation request; shows the key-owned workspace structure and allowlisted editable fields.',
      lab_demo_config_preview:
        'Read-only before/after diff for explicit changes or evidence-backed mappings from a completed brand scrape.',
      lab_demo_config_apply:
        'Apply only an unexpired preview after explicit confirmation; performs conflict detection, atomic update, readback verification and revision creation.',
      lab_onboard_sandbox:
        'New colleague sandbox missing Firestore connection docs or profile not enabled on dataset.',
      lab_setup_event_infra:
        'Create ExperienceEvent schema, attach recommended field groups, and catalog dataset (Event tool Set up event infrastructure). Follow with dx-api Edge datastream + lab_save_event_datastream.',
      lab_save_event_datastream:
        'After Coworker dx-api or Data Collection creates the Edge datastream — persist datastreamId to Firestore so lab-event-tool-edge works.',
      lab_snowflake_get_profile_by_email:
        'Full selected-industry Snowflake CRM row by email — every column in profiles[].columns + createdAt. Optional industry defaults to travel. Use after dual_load_snowflake; never Snowflake console SQL.',
      lab_snowflake_query_profiles:
        'Same full-row readback with email/ecid filter or list filters (loyalty, time_period). Prefer lab_snowflake_get_profile_by_email when you only have email.',
    },
    dataflow_pattern: {
      description: 'Per industry: schema → dataset → HTTP API streaming flow (dx-api) → Firestore connection doc.',
      firestoreCollections: INDUSTRY_CONNECTION_COLLECTION,
      connectionFields: ['streaming.url', 'streaming.flowId', 'streaming.datasetId', 'streaming.schemaId', 'streaming.xdmKey'],
      http_streaming_dx_api: HTTP_STREAMING_DX_API_GUIDANCE,
      profileCoreV2TopUp:
        'During infra step attachFieldGroups, profileCoreV2TopUp adds missing tenant leaves from functions/profileCoreV2Manifest.js (ADD-only). ' +
        'Critical for travel (travelReservations.*, hotel.*) in sandboxes that drift from apalmer canonical mixin.',
    },
    conventions: getLabConventions(),
    industries: LAB_INDUSTRY_KEYS.map((key) => ({
      key,
      segment_hints: SEGMENT_HINTS_BY_INDUSTRY[key] || [],
      connectionCollection: INDUSTRY_CONNECTION_COLLECTION[key],
    })),
    aliases: INDUSTRY_ALIASES,
    segment_hints_catalog: {
      travel: TRAVEL_SEGMENT_HINTS,
      fsi: FSI_SEGMENT_HINTS,
      retail: RETAIL_SEGMENT_HINTS,
    },
    attribute_ownership:
      'Static map in functions/industryAttributeMap.js — industry-specific prefixes first, generic catch-all last. ' +
      'lab_get_profile includes ownership hints. Updates must target the owning industry dataflow.',
    failure_modes: COMMON_FAILURE_MODES,
    sources: [
      'web/profile-viewer/profile-generation-shared.js',
      'web/profile-viewer/event-generator.js',
      'web/profile-viewer/event-tool.js',
      'functions/profileGenerateService.js',
      'functions/eventGeneratorService.js',
      'functions/eventEdgeService.js',
      'functions/industryAttributeMap.js',
      'functions/profileCoreV2Manifest.js',
      'docs/PROFILE_CORE_V2_TOPUP.md',
      'docs/ANONYMOUS_EDGE_DEMO_PATTERN.md',
      'docs/COWORKER_HTTP_STREAMING_FLOWS.md',
      'docs/COWORKER_EDGE_DATASTREAMS.md',
    ],
  };
}

/**
 * @returns {object} Lab-wide conventions (emails, phone, testProfile, stitching).
 */
export function getLabConventions() {
  return {
    test_email_domain: LAB_TEST_EMAIL_DOMAIN,
    email_patterns: {
      ui_scaler:
        'Profile Viewer scales base email with today DDMMYYYY + daily counter: apalmer@adobetest.com → apalmer+23062026-1@adobetest.com. ' +
        'If local part already has +tag, appends -DDMMYYYY-N instead.',
      mcp_batch_default:
        'base_email without @ → {base}+{industry}-{n}@adobetest.com. With @: plus-tag {local}+{industry}-{n}@domain or {local}-{n} if + exists.',
      coworker_examples: [
        'travel.demo+001@adobetest.com',
        'hotel.reactivation+001@adobetest.com',
        'fsi.hnw+001@adobetest.com',
        'kirkham+retail-seed → kirkham+retail-1@adobetest.com (batch)',
      ],
      email_pattern_tokens: '{n}, {index}, {industry} for lab_generate_profiles_batch email_pattern',
    },
    mobile_phone: {
      lab_default: LAB_DEFAULT_MOBILE_PHONE,
      note:
        'Profile Viewer generators default to this UK test MSISDN (placeholder in profile-generation.html, bulk-seed script). ' +
        'MCP randomize uses lab_default unless attributes override mobilePhone.number.',
    },
    testProfile: {
      ...TEST_PROFILE_PLAYBOOK,
      behavior:
        'profileGenerateService sets root testProfile:true unless test_profile:false or omitTestProfile. ' +
        'Streaming mirrors to xdm:testProfile for OOTB test-details mixin.',
      mcp_param: 'lab_generate_profile test_profile (defaults true; false needs test_profile_override_reason)',
    },
    preferredLanguage: LANGUAGE_PLAYBOOK,
    identity_stitching: {
      profile_stream: 'Email is primary identity on generate/update; ECID in identityMap when append_if_existing or from prior generate.',
      anonymous_edge:
        'Web SDK: getIdentity → sendEvent with identityMap.ECID AND _<tenant>.identification.core.ecid (same string). See ANONYMOUS_EDGE_DEMO_PATTERN.md.',
      known_profile_event:
        'identityMap.ECID [{ id, primary:true }] + identityMap.Email [{ id, primary:false }]; _demoemea.identification.core.ecid + email match eventEdgeService.buildXdm.',
      event_identity_map_example: {
        ECID: [{ id: '<ecid-from-generate>', primary: true }],
        Email: [{ id: 'travel.demo+001@adobetest.com', primary: false }],
      },
      event_tenant_core_example: {
        _demoemea: {
          identification: { core: { ecid: '<ecid-from-generate>', email: 'travel.demo+001@adobetest.com' } },
        },
      },
      default_target_id: LAB_EVENT_TOOL_TARGET_ID,
    },
    full_snapshot_update:
      'lab_update_profile merges into entire writable industry snapshot before POST — same as Profile Viewer table editor.',
    rate_limits: {
      generate_per_minute: 30,
      event_send_per_minute: 30,
      batch_jobs_per_hour: 3,
    },
  };
}

/** @type {Record<string, object>} */
const INDUSTRY_PLAYBOOKS = {
  generic: {
    label: 'Generic · CDP lab',
    profileGenerateIndustry: 'generic',
    persona_fields: [
      'individualCharacteristics.core.favouriteCategory',
      'homeAddress.*',
      'individualCharacteristics.public.* (donation demos when favouriteCategory=public_sector)',
      'person.*, personalEmail.*, scoring.* (shared common persona)',
      'loyalty.* when loyalty_member:true (LYL-{6 digits}; Portal #genLoyaltyEnabled)',
    ],
    tenant_paths: ['_<tenant>.individualCharacteristics.core.*', 'scoring.* (shared)'],
    field_groups: ['Profile Core v2 (tenant)', 'Profile preferences-details', 'Consent and Preference Details'],
    segment_hints: [],
    testProfile: TEST_PROFILE_PLAYBOOK,
    language: LANGUAGE_PLAYBOOK,
    dataflow: dataflowPlaybook('generic'),
    preflight: ['lab_sandbox_profile_config sandbox {sandbox} industry generic', 'lab_preflight_profile_generate sandbox {sandbox} industry generic email demo+001@adobetest.com'],
    failure_modes: COMMON_FAILURE_MODES,
    infra_prerequisites: ['genericProfileConnections Firestore doc with full streaming manifest', 'Profile enabled on generic dataset', 'Profile Core v2 top-up (shared leaves)'],
    example_prompt_chain: [
      'lab_get_industry_playbook industry generic',
      'lab_preflight_profile_generate sandbox apalmer industry generic email demo+001@adobetest.com randomize true',
      'lab_generate_profile sandbox apalmer industry generic email demo+001@adobetest.com randomize true',
      'lab_get_profile sandbox apalmer identifier demo+001@adobetest.com',
      'lab_preflight_profile_event sandbox apalmer email demo+001@adobetest.com ecid <from-generate>',
      'lab_send_profile_event sandbox apalmer email demo+001@adobetest.com ecid <from-generate> event_type donation.made',
      'lab_profile_activity sandbox apalmer identifier demo+001@adobetest.com',
    ],
  },
  travel: {
    label: 'Travel & hospitality',
    profileGenerateIndustry: 'travel',
    dual_stream_generate: {
      when: 'industry travel (and all non-generic industries)',
      steps: [
        '1. POST /api/profile/generate — industry generic — generic-owned persona paths (person.*, scoring.*, loyalty.*, personalEmail.*, …)',
        '2. POST /api/profile/generate — industry travel — travel-owned paths (individualCharacteristics.travel.*, hotel.*, travelReservations.*, travelPreferences.*) with appendIfExisting:true and same email/ECID',
      ],
      verify:
        'lab_lookup_profile or Profile Viewer attribute table: rows show Source pills Generic AND Travel for the same email.',
      mcp: 'lab_generate_profile industry travel — dual_stream:true in response; generate_plan lists both steps.',
    },
    persona_fields: [
      'travelReservations.flightReservations.* (airports, IATA, dates, class, passengers, layovers)',
      'travelPreferences.* (OOTB root mixin — meal/seat/room/vehicle enums, amenity booleans)',
      'hotel.* (bookingDetails, checkIn, housekeeping, amenities, roomService, checkOut)',
      'loyalty.* when loyalty_member:true (LYL-{6 digits}; Portal #travelLoyaltyEnabled)',
    ],
    tenant_paths: [
      'travelReservations.*',
      'hotel.*',
    ],
    field_groups: ['Profile Travel v1', 'Hotel Experience', 'Travel Preferences (root)', 'Profile Core v2 top-up: travelReservations + hotel'],
    segment_hints: TRAVEL_SEGMENT_HINTS,
    segment_semantics: {
      hotel_reactivation: 'Checkout >12 months ago, totalNights≥5, elevated churn/propensity — hotel edge segments',
      hotel_high_value: 'Platinum tier, high LTV, recent stay, rich hotel.bookingDetails',
    },
    testProfile: TEST_PROFILE_PLAYBOOK,
    language: LANGUAGE_PLAYBOOK,
    dataflow: dataflowPlaybook('travel'),
    preflight: ['lab_sandbox_profile_config sandbox {sandbox} industry travel'],
    failure_modes: [
      ...COMMON_FAILURE_MODES,
      {
        symptom: 'travelPreferences or flight/hotel leaves missing in UPS',
        cause: 'Paths tenant-prefixed incorrectly or Profile Core v2 top-up not run',
        fix: 'lab_provision_profile_infra_step step all_core (attachFieldGroups runs profileCoreV2TopUp)',
      },
    ],
    infra_prerequisites: [
      'travelProfileConnections doc with streaming.url/flowId/datasetId/schemaId/xdmKey',
      'Profile Travel v1 + Hotel Experience FG',
      'Profile Core v2 top-up for travelReservations + hotel subtrees',
    ],
    example_prompt_chain: [
      'lab_generate_profile sandbox apalmer industry travel email hotel.reactivation+001@adobetest.com randomize true segment_hint hotel_reactivation',
      'lab_generate_profile sandbox apalmer industry travel email travel.demo+001@adobetest.com randomize true loyalty_member true',
      'lab_send_profile_event sandbox apalmer email hotel.reactivation+001@adobetest.com ecid <from-generate> event_type transaction channel web',
      'lab_profile_activity sandbox apalmer identifier hotel.reactivation+001@adobetest.com',
    ],
  },
  fsi: {
    label: 'FSI · banking & wealth',
    persona_fields: [
      'industryFsi.* (householdIncomeBand, creditScoreBand, lifeStage, employment, primaryBankingChannel)',
      'industryFsi.financialProducts.* (checking, savings, creditCard, mortgage, investment, loan)',
      'individualCharacteristics.core.creditScore, employer, occupation',
      'personalFinances.* (OOTB root — employmentStatus, creditScores[], accountCardsTotal, personalTaxProfile.*)',
      'loyalty.* when loyalty_member:true (Portal #fsiLoyaltyEnabled)',
    ],
    tenant_paths: ['industryFsi.*'],
    root_paths: ['personalFinances.*', 'individualCharacteristics.core.creditScore'],
    field_groups: ['Profile FSI v2', 'Personal Finance Details (root personalFinances.*)'],
    segment_hints: FSI_SEGMENT_HINTS,
    segment_semantics: {
      high_net_worth: 'Income 500k_plus, excellent credit 780+, high savings, platinum tier',
      credit_rebuild: 'Income under_50k, poor credit ≤579, elevated churn, bronze tier',
    },
    testProfile: TEST_PROFILE_PLAYBOOK,
    language: { ...LANGUAGE_PLAYBOOK, ui_note: 'FSI uses industry-runtime generator: root preferredLanguage + personalEmail.language' },
    dataflow: dataflowPlaybook('fsi'),
    preflight: ['lab_sandbox_profile_config sandbox {sandbox} industry fsi'],
    failure_modes: COMMON_FAILURE_MODES,
    infra_prerequisites: ['fsiProfileConnections full manifest', 'Profile FSI v2 FG', 'personalFinances on schema union'],
    example_prompt_chain: [
      'lab_generate_profile sandbox apalmer industry fsi email fsi.hnw+001@adobetest.com randomize true segment_hint high_net_worth',
    ],
  },
  retail: {
    label: 'Retail',
    persona_fields: [
      'individualCharacteristics.core.favouriteCategory, childrenInHouseHold',
      'individualCharacteristics.retail.* (sizes, favorites, linkedStore, cobrandedCreditCardHolder)',
      'scoring.retail.* (cobrandedCreditCardSignUp, loyaltyProgramSignUp, loyaltyStatusUpgrade)',
      'orderProfile.* (LTV, lastOrderDate; full last-order block when last_order_details:true — Portal #retailLastOrderEnabled)',
      'loyalty.* when loyalty_member:true (Portal #retailLoyaltyEnabled)',
    ],
    tenant_paths: ['individualCharacteristics.retail.*', 'scoring.retail.*', 'industryRetail.*'],
    field_groups: ['Profile Retail v2'],
    segment_hints: RETAIL_SEGMENT_HINTS,
    segment_semantics: {
      loyalty_vip: 'Platinum, LTV≥25k, high ordersYTD, cobranded card',
      cart_abandoner: 'Recent basket, low propensity, modest LTV',
    },
    testProfile: TEST_PROFILE_PLAYBOOK,
    language: LANGUAGE_PLAYBOOK,
    dataflow: dataflowPlaybook('retail'),
    preflight: ['lab_sandbox_profile_config sandbox {sandbox} industry retail'],
    failure_modes: COMMON_FAILURE_MODES,
    infra_prerequisites: ['retailProfileConnections full manifest', 'Profile Retail v2 FG'],
    example_prompt_chain: [
      'lab_generate_profiles_batch sandbox apalmer industry retail count 25 base_email kirkham+retail-vip randomize true segment_hint loyalty_vip',
    ],
  },
  telecom: {
    label: 'Telecommunications',
    persona_fields: [
      'industryTelecom.* (planTier, monthlySpendBand, dataAllowance, contractEndBand, deviceTier, networkNps)',
      'industryTelecom.serviceFlags.* (hasMobile, hasBroadband, hasTv, hasFamilyPlan, recentNetworkIssue, upgradeEligible)',
      'telecomSubscription.* (bundleName, mobileSubscription[], internetSubscription[], mediaSubscription[], landlineSubscription[])',
      'loyalty.* when loyalty_member:true (Portal #telecomLoyaltyEnabled)',
    ],
    tenant_paths: ['industryTelecom.*'],
    root_paths: ['telecomSubscription.*'],
    field_groups: ['Profile Telecom v1'],
    segment_hints: [],
    testProfile: TEST_PROFILE_PLAYBOOK,
    language: LANGUAGE_PLAYBOOK,
    dataflow: dataflowPlaybook('telecom'),
    preflight: ['lab_sandbox_profile_config sandbox {sandbox} industry telecom'],
    failure_modes: COMMON_FAILURE_MODES,
    infra_prerequisites: ['telecomProfileConnections full manifest', 'Profile Telecom v1 FG'],
    aliases: ['telecommunications', 'telco'],
  },
  media: {
    label: 'Media & entertainment',
    persona_fields: [
      'industryMedia.* (subscriptionTier, preferredDevice, viewingMinutesBand, primaryGenre, lastViewedRecency, accountSharingBand)',
      'industryMedia.engagementFlags.* (adSupported, downloadsEnabled, sportsPackage, hasKidsProfile, liveTv, bingeWatcher)',
      'individualCharacteristics.core.favouriteSubCategory (genre fan-out)',
      'subscriptions[0].* (OOTB root — planName, SKU, billingPeriod, status, term, dates)',
      'loyalty.* when loyalty_member:true (Portal #mediaLoyaltyEnabled)',
    ],
    tenant_paths: ['industryMedia.*'],
    root_paths: ['subscriptions.*'],
    field_groups: ['Profile Media v1/v2', 'Subscription Details (root subscriptions.*)'],
    segment_hints: [],
    testProfile: TEST_PROFILE_PLAYBOOK,
    language: LANGUAGE_PLAYBOOK,
    dataflow: dataflowPlaybook('media'),
    preflight: ['lab_sandbox_profile_config sandbox {sandbox} industry media'],
    failure_modes: COMMON_FAILURE_MODES,
    infra_prerequisites: ['mediaProfileConnections full manifest'],
  },
  sports: {
    label: 'Sports & venues',
    persona_fields: [
      'industrySports.* (favouriteSport, favouriteTeam, fanSegment, jerseySize, merchSpendBand, lastAttendedEvent)',
      'industrySports.fanFlags.* (seasonTicket, fantasyPlayer, betsRegularly, streamLive, newsletterSub, childFan)',
      'individualCharacteristics.core.favouriteCategory=sports, favouriteSubCategory',
      'scoring.product.affinity (team name fan-out)',
      'loyalty.* when loyalty_member:true (Portal #sportsLoyaltyEnabled)',
    ],
    tenant_paths: ['industrySports.*'],
    field_groups: ['Profile Sports v1'],
    segment_hints: [],
    testProfile: TEST_PROFILE_PLAYBOOK,
    language: LANGUAGE_PLAYBOOK,
    dataflow: dataflowPlaybook('sports'),
    preflight: ['lab_sandbox_profile_config sandbox {sandbox} industry sports'],
    failure_modes: COMMON_FAILURE_MODES,
    infra_prerequisites: ['sportsProfileConnections full manifest'],
  },
};

/**
 * @param {string | undefined | null} rawIndustry
 * @returns {{ ok: true, industry: string, playbook: object } | { ok: false, error: string, supported: string[] }}
 */
export function getIndustryPlaybook(rawIndustry) {
  const key = String(rawIndustry || '').trim().toLowerCase();
  if (!key) {
    return {
      ok: true,
      industry: 'all',
      playbook: {
        industries: LAB_INDUSTRY_KEYS.map((k) => ({ key: k, ...INDUSTRY_PLAYBOOKS[k] })),
        criticalRules: CRITICAL_RULES,
        conventions: getLabConventions(),
      },
    };
  }

  let resolved = key;
  if (!LAB_INDUSTRY_KEYS.includes(resolved)) {
    const alias = INDUSTRY_ALIASES[resolved];
    if (alias) resolved = alias.key;
  }

  if (!INDUSTRY_PLAYBOOKS[resolved]) {
    return {
      ok: false,
      error: `Unknown industry "${rawIndustry}".`,
      supported: [...LAB_INDUSTRY_KEYS],
    };
  }

  return {
    ok: true,
    industry: resolved,
    playbook: {
      ...INDUSTRY_PLAYBOOKS[resolved],
      criticalRules: CRITICAL_RULES,
      conventions: getLabConventions(),
      framework_tools: [
        'lab_get_execution_framework',
        'lab_get_industry_playbook',
        'lab_preflight_profile_generate',
        'lab_sandbox_profile_config',
        'lab_generate_profile',
      ],
    },
  };
}

/**
 * Markdown overview for lab://framework/overview resource.
 */
export function frameworkOverviewMarkdown() {
  const fw = getExecutionFramework();
  const lines = [
    '# AEP Orchestration Lab — execution framework',
    '',
    fw.summary,
    '',
    '## Critical rules (read first)',
    ...CRITICAL_RULES.map((r) => `- **${r.id}**: ${r.rule}`),
    '',
    '## Workflows',
    ...Object.entries(fw.workflows).map(([name, w]) => `- **${name}**: ${w.tools?.join(', ') || ''}`),
    '',
    '## When to use which tool',
    ...Object.entries(fw.when_to_use).map(([tool, desc]) => `- **${tool}**: ${desc}`),
    '',
    '## Conventions',
    `- Test email domain: **${LAB_TEST_EMAIL_DOMAIN}**`,
    `- Default mobile: **${LAB_DEFAULT_MOBILE_PHONE}**`,
    `- testProfile: default **true** on generate (root \`testProfile\` + \`xdm:testProfile\`)`,
    `- preferredLanguage: default **${LAB_DEFAULT_PREFERRED_LANGUAGE}** (root + preferences + personalEmail mirrors)`,
    `- Updates: **full-snapshot stitch** only`,
    '',
    'Call **lab_get_execution_framework** for full JSON.',
  ];
  return lines.join('\n');
}

/**
 * Markdown conventions doc for lab://framework/conventions resource.
 */
export function frameworkConventionsMarkdown() {
  const c = getLabConventions();
  return [
    '# Lab conventions',
    '',
    '## Email',
    c.email_patterns.ui_scaler,
    '',
    'Examples: ' + c.email_patterns.coworker_examples.join('; '),
    '',
    '## Mobile',
    `Default: ${c.mobile_phone.lab_default}`,
    c.mobile_phone.note,
    '',
    '## testProfile',
    c.testProfile.behavior,
    '',
    '## preferredLanguage',
    `Default: ${c.preferredLanguage.default}. UI paths: generic/travel use preferences.preferredLanguage; industry-runtime uses root preferredLanguage. Streaming mirrors via profileStreamingCore.mirrorPreferredLanguageDemoSchema.`,
    '',
    '## Identity / Edge',
    c.identity_stitching.anonymous_edge,
    '',
    '## Known-profile events',
    c.identity_stitching.known_profile_event,
    `Default target: **${LAB_EVENT_TOOL_TARGET_ID}**`,
  ].join('\n');
}
