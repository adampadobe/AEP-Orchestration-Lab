'use strict';

const timing = (kind, label) => ({ kind, label });
const node = (id, label, description, kind, labelTiming) =>
  ({ id, label, description, timing: timing(kind, labelTiming) });
const step = (title, description, nodeIds, kind, label) =>
  ({ title, description, nodeIds, timing: timing(kind, label) });

const industries = [
  ['travel', 'Travel', 'Customer, loyalty, preferences; booking, website, mobile, check-in, POS, call-centre, in-flight, hotel and disruption activity; booking segments and ancillaries.',
    'Customer, loyalty and preferences contribute Profile attributes. Activity contributes event-specific ExperienceEvent datasets.',
    ['reservation', 'flight_segment', 'passenger', 'ancillary_purchase', 'product_catalog']],
  ['fsi', 'FSI', 'Customer; transaction, application, advisory and digital activity; product holdings.',
    'Customer contributes Profile attributes. All four activity tables and product snapshots feed Agentic_Fsi_Event - Dataset (ExperienceEvent).',
    ['account', 'card', 'transaction', 'loan', 'mortgage', 'product_catalog']],
  ['retail', 'Retail', 'Customer; browse, order, return and service activity; rewards.',
    'Customer and Rewards are Profile-class datasets. Four activity tables feed Agentic_Retail_Event - Dataset.',
    ['order', 'order_line', 'return', 'rewards', 'product_catalog']],
  ['telecom', 'Telecom', 'Customer; usage, billing, network and service activity; devices.',
    'Customer is Profile-class. Four activity tables and device snapshots feed Agentic_Telecom_Event - Dataset.',
    ['subscription', 'device', 'plan_catalog']],
  ['media', 'Media', 'Customer; viewing, billing, engagement and download activity; watchlist.',
    'Customer is Profile-class. Four activity tables and watchlist snapshots feed Agentic_Media_Event - Dataset.',
    ['subscription', 'viewing', 'title_catalog']],
  ['sports', 'Sports', 'Customer; attendance, betting, engagement and merchandise activity; membership.',
    'Customer and Membership are Profile-class. Four activity tables feed Agentic_Sports_Event - Dataset.',
    ['membership', 'ticket', 'merch_order', 'merch_order_line', 'event_catalog']],
].map(([id, label, sourceDescription, xdmDescription, suffixes]) => ({
  id, label, sourceDescription, xdmDescription,
  relDatasets: suffixes.map((suffix) => `rel_${id}_${suffix}`),
}));

const reference = {
  title: 'My data flows',
  asOf: '2026-11-10',
  summary: 'Two complementary models: XDM describes a person and their behaviour; REL preserves linked operational records. Direct Lab streaming and scheduled Snowflake ingestion are separate paths.',
  nodes: [
    node('lab', 'Orchestration Lab', 'Portal and MCP share generation services. The target selects Snowflake-first or explicit AEP streaming; dual-load is opt-in. A simulated walkthrough never calls generation.', 'simulation', 'Playback is illustrative; it does not create data.'),
    node('base', 'Snowflake shared recipient', 'TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE is the single physical parent for all six industries, despite its historical travel name. Shared Email, ECID, CRMID and recipient keys link records.', 'unknown', 'Write duration varies; verify the committed source row.'),
    node('crm', 'Snowflake CRM and activity', 'AEP_SCHEMA.AGENTIC_* stores industry CRM, events and enrichment. Operational values need not equal behavioural persona attributes. New generation and enrichment have separate scopes.', 'unknown', 'Source commits and activity generation are not an AEP ingestion receipt.'),
    node('rel', 'Snowflake REL layer', 'REL.RECIPIENT is a read-only view of the shared parent. Industry objects are derived dynamic tables or stored detail/catalogs. Existing AGENTIC source flows do not automatically consume new REL objects.', 'target', 'Non-travel dynamic tables target a one-minute lag; asynchronous refresh is not a guaranteed deadline.'),
    node('http', 'HTTP profile streaming', 'AEP-target generation writes generic-owned fields then industry-owned fields with the same Email and ECID. Updates fetch and stitch a full writable snapshot before streaming, not a minimal delta.', 'unknown', 'Acceptance is not storage or Profile indexing. No measured end-to-end SLA.'),
    node('edge', 'Edge event ingestion', 'Event tool builds ExperienceEvents with ECID primary and Email secondary. The saved datastream routes to the configured event dataset. Profile creation does not itself generate events.', 'unknown', 'Edge receipt proves acceptance only. Check stored event fields and associated identity.'),
    node('xdm-flow', 'Snowflake XDM flows', 'AEP Snowflake source connections read shared Base, CRM and activity tables. Each flow has its own Data Prep mapping and destination schema; table names alone do not identify the schema class.', 'configured', 'Reviewed recurring flows are scheduled every 15 minutes. Next-run wait, execution and indexing are separate.'),
    node('rel-flow', 'Snowflake REL CDC flows', 'Separate Snowflake source connections read REL objects using change tracking. Mappings preserve record keys and version fields. Recreating a source can invalidate its consumer checkpoint.', 'configured', '15-minute configured cadence is not a 15-minute availability guarantee.'),
    node('xdm-profile', 'XDM Profile datasets', 'Direct Lab persona datasets plus Base/industry CRM datasets contribute Profile fragments. Retail Rewards and Sports Membership are also Profile-class. Base owns shared recipient push-token arrays.', 'unknown', 'Stored batch values and merged Profile must be verified separately.'),
    node('xdm-events', 'XDM ExperienceEvent datasets', 'Direct Edge events and mapped Snowflake activity share the event model. FSI Products, Telecom Devices and Media Watchlist deliberately publish event snapshots, not Profile attributes.', 'unknown', 'An activity count alone does not prove rich fields survived mapping.'),
    node('rel-datasets', 'AEP relational datasets', 'rel_recipient and 27 industry datasets store operational records. They are CDC record datasets, not Real-Time Customer Profile-enabled. The four orphaned legacy Travel ingestion destinations are excluded from the active model.', 'observed', 'All 28 rel_* datasets reported data ingested and OC DDL_APPLIED on 10 Nov 2026; this is dated metadata evidence.'),
    node('profile', 'Real-Time Customer Profile', 'Identity stitching combines eligible Profile fragments and associated events. Same Email/ECID is required across paths. REL records do not automatically flatten into merged Profile.', 'unknown', 'Profile indexing and merge visibility have no measured deadline here; verify by both identities.'),
    node('query', 'Stored datasets / Query Service', 'Inspect source-specific stored records, counts, keys, numeric zero, false booleans, arrays and exact versions. Successful runs and merged values supplied by another dataset are not substitutes.', 'observed', 'ACCOUNT: 68 stored unique keys and no orphan recipients; populated incremental transfer verified 10 Nov 2026.'),
    node('oc', 'Orchestrated Campaign layer', 'REL extension enablement makes datasets available to the relational campaign layer. Relationships, targeting dimensions, channel configuration and consent still need independent validation.', 'unknown', 'Extension completion is not campaign-send readiness or delivery authorization.'),
    node('activation', 'Audiences / journeys / decisioning', 'Profile-based downstream uses depend on configured audiences, policies, surfaces, channels, entitlements and eligibility. No campaign or decision is executed by this page.', 'unknown', 'Downstream evaluation and activation timing depend on their own configuration.'),
  ],
  edges: [
    ['lab', 'base', 'Snowflake-first seed'], ['lab', 'crm', 'CRM and selected enrichment'],
    ['base', 'rel', 'Read-only recipient view'], ['crm', 'rel', 'Industry projections'],
    ['lab', 'http', 'Explicit AEP target'], ['lab', 'edge', 'Event tool'],
    ['base', 'xdm-flow', 'Shared Base ingestion'], ['crm', 'xdm-flow', 'CRM / activity ingestion'],
    ['rel', 'rel-flow', 'CDC source'], ['http', 'xdm-profile', 'Generic + industry streams'],
    ['edge', 'xdm-events', 'Saved datastream'], ['xdm-flow', 'xdm-profile', 'Profile-class mappings'],
    ['xdm-flow', 'xdm-events', 'ExperienceEvent mappings'], ['rel-flow', 'rel-datasets', 'Record mappings'],
    ['xdm-profile', 'profile', 'Profile fragments'], ['xdm-events', 'profile', 'Associated event history'],
    ['xdm-profile', 'query', 'Stored records'], ['xdm-events', 'query', 'Stored events'],
    ['rel-datasets', 'query', 'Stored REL records'], ['rel-datasets', 'oc', 'OC extension'],
    ['profile', 'activation', 'Subject to eligibility'],
  ].map(([from, to, label]) => ({ from, to, label })),
  scenarios: [
    {
      id: 'snowflake-first', label: 'New Snowflake-first profile',
      description: 'Follow a new shared recipient and industry records into two independent AEP models.',
      steps: [
        step('Create the person', 'A real seed reserves a new identity and writes the shared recipient before linked industry data. This playback does not do so.', ['lab', 'base', 'crm'], 'simulation', 'Generation duration varies; no synthetic wait is presented as an SLA.'),
        step('Prepare relational projections', 'The recipient view reads the parent; dynamic tables derive industry records asynchronously. Stored detail follows its own writer.', ['base', 'crm', 'rel'], 'target', 'One-minute non-travel target lag, not a guaranteed refresh deadline.'),
        step('Wait for parallel ingestion', 'XDM and REL flows are separate schedules; neither waits for the other to finish.', ['xdm-flow', 'rel-flow'], 'configured', 'Each reviewed flow runs every 15 minutes; eligibility and failures can extend waiting.'),
        step('Map into separate destinations', 'XDM Profile/ExperienceEvent and REL record mappings target different datasets and schemas.', ['xdm-flow', 'rel-flow', 'xdm-profile', 'xdm-events', 'rel-datasets'], 'unknown', 'Execution and commit time vary. Inspect actual nonzero-input runs and storage.'),
        step('Read stored data and downstream views', 'Check source-specific storage first, then merged Profile and OC configuration separately.', ['query', 'profile', 'oc'], 'unknown', 'Indexing and campaign-layer availability are unmeasured; no total sync promise.'),
      ],
    },
    {
      id: 'direct-aep', label: 'New direct-to-AEP profile',
      description: 'Bypass Snowflake and stream generic plus selected industry persona fields.',
      steps: [
        step('Generate an AEP persona', 'Explicit target aep selects streaming. Reuse the same Email/ECID across both streams.', ['lab'], 'simulation', 'No profile is generated by playback.'),
        step('Stream generic and industry fields', 'Generic owns shared fields; the selected industry owns its attributes.', ['http'], 'unknown', 'HTTP acceptance is not stored-data proof.'),
        step('Land Profile fragments', 'Both streams target their respective Profile-enabled datasets.', ['xdm-profile', 'query'], 'unknown', 'Verify the exact writable fields in storage.'),
        step('Verify the person', 'Read by both Email and ECID; allow for indexing without regenerating the identity.', ['profile', 'activation'], 'unknown', 'No measured indexing SLA; eligibility still governs activation.'),
      ],
    },
    {
      id: 'dual-load', label: 'Dual-load profile',
      description: 'One identity, two destinations; streaming and operational ingestion converge independently.',
      steps: [
        step('Reserve one identity', 'Explicit dual-load shares Email and ECID; Snowflake allocates or reuses CRMID.', ['lab'], 'simulation', 'No generation or retry is performed.'),
        step('Write both destinations', 'AEP receives behavioural persona fields while Snowflake receives operational CRM records. These are not one atomic cross-system transaction.', ['http', 'base', 'crm'], 'unknown', 'Verify each write independently; values need not be identical.'),
        step('Stream first, batch separately', 'The direct stream can arrive before scheduled Snowflake XDM/REL ingestion.', ['xdm-profile', 'rel', 'xdm-flow', 'rel-flow'], 'configured', '15-minute flow cadence plus execution; no fixed convergence time.'),
        step('Converge and validate', 'Check mapped storage, Profile identity/array ownership, and relational keys independently.', ['xdm-profile', 'xdm-events', 'rel-datasets', 'query', 'profile', 'oc'], 'unknown', 'Correct source arrays can still duplicate in merged Profile if multiple datasets own them.'),
      ],
    },
    {
      id: 'profile-update', label: 'Update an existing profile',
      description: 'Follow a full-snapshot AEP update, or inspect a separately approved source change.',
      steps: [
        step('Resolve the existing person', 'AEP updates look up the authoritative person, merge approved changes and preserve existing writable values.', ['lab', 'profile'], 'simulation', 'No update is issued by playback.'),
        step('Stream the stitched snapshot', 'The AEP update API streams a full writable industry snapshot, not an arbitrary minimal delta.', ['http', 'xdm-profile'], 'unknown', 'Acceptance and indexing remain separate checks.'),
        step('Distinguish source updates', 'Changing Snowflake instead follows its source refresh and scheduled ingestion path; an AEP update does not write Snowflake back.', ['crm', 'rel', 'xdm-flow', 'rel-flow'], 'configured', 'Scheduled source ingestion is a separate 15-minute path.'),
        step('Check versions and storage', 'A separately approved ACCOUNT source update was transferred by CDC with one update and no failures. Never infer that all source updates have this timing.', ['query', 'profile', 'rel-datasets'], 'observed', 'ACCOUNT run: 10 Nov 2026 10:10:47-10:14:00 UTC, about 3m14s execution; not end-to-end latency.'),
      ],
    },
    {
      id: 'event', label: 'New event for an existing person',
      description: 'Follow direct Edge behaviour without creating a replacement profile.',
      steps: [
        step('Select the existing identity', 'Use the exact Email and ECID from the person; the event tool builds the allowlisted XDM.', ['lab'], 'simulation', 'Playback never sends an event.'),
        step('Send through Edge', 'The configured datastream routes the event, with ECID primary and Email secondary.', ['edge'], 'unknown', 'An Edge acceptance receipt is not a storage receipt.'),
        step('Inspect the stored event', 'Validate rich industry fields, timestamps, channel, identities and numeric/boolean values.', ['xdm-events', 'query'], 'unknown', 'Storage timing is not measured by this walkthrough.'),
        step('See associated activity', 'The event becomes usable with the profile according to identity, indexing and downstream configuration.', ['profile', 'activation'], 'unknown', 'No automatic resend or new identity to work around indexing lag.'),
      ],
    },
  ],
  industries,
  evidence: [
    { title: 'FSI ACCOUNT end-to-end repair', verifiedAt: '2026-11-10', level: 'stored-data verified',
      description: 'Incremental Snowflake ACCOUNT, schema v1.1 and mapping v1; recovery merged 68 accounts. Stored AEP has 68 unique keys and no orphan recipients. One approved test update carried opening_balance 1234.56 and overdraft_limit numeric 0, preserved balance 5705.76 and advanced all three version/record timestamps to 09:33:26 UTC. CDC run f186ae78-1d1b-482b-9a0d-be5c3667d926 completed at 10:14:00.662 UTC: one update, no failures or deletions. Synthetic values remain; restoration was not authorized.' },
    { title: 'REL dataset inventory', verifiedAt: '2026-11-10', level: 'configuration and ingestion metadata',
      description: '28 rel_* datasets reported data ingested and OC enabled with COMPLETED / DDL_APPLIED. Not a new field-by-field storage audit or campaign-readiness certificate.' },
    { title: 'Direct AEP profile infrastructure', verifiedAt: '2026-11-10', level: 'configured',
      description: 'Generic and all six industries reported saved HTTP connections, schemas in the union and Profile-enabled datasets. Event configuration had a saved datastream. No new profile/event was sent during this inventory.' },
  ],
  notes: [
    'Shared relational parent is rel_recipient. Every listed industry dataset has the rel_ prefix. XDM means person/event models here; REL schemas are also registered in AEP, but are not Real-Time Profile-enabled.',
    'Live refresh reads a reviewed registry of flow IDs in apalmer, verifies actual source bindings, and does not discover every unrelated sandbox flow. Replacements require a reviewed registry update.',
    'The legacy Travel Recipient, bookings, booking segments and ancillaries destinations returned exact Catalog 404 on 13 Nov 2026. Their four flows are retirement candidates, not active model requirements; this observation is not deletion approval or replacement stored-data proof.',
    'A 15-minute schedule is not a promise of availability within 15 minutes. Include next eligible run, source refresh, execution, commit and indexing. Observed timings are dated examples, not SLAs.',
    'Unknown and absent counts stay unknown, never zero by default. A successful zero-input run does not prove a new record transferred.',
    'Reference refresh exposes no credentials, inlet URLs or source rows and does not query Snowflake. The separate owner-protected Live mode creates one test recipient only on explicit action and shows that trace identity with bounded source readbacks. No automatic repairs or generation retries.',
  ],
};

module.exports = { reference };
