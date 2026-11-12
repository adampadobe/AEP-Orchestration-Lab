const LAB_BASE_URL = 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app';
const LAB_ACCESS = 'Adobe IMS in Coworker marketplace; X-AEP-Lab-Mcp-Key in other clients';

export const MCP_CONTEXTS = Object.freeze([
  {
    id: 'aep-lab-entry',
    name: 'AEP Lab MCP entry point',
    url: `${LAB_BASE_URL}/mcp/entry`,
    kind: 'lab-focused',
    toolCount: 5,
    access: LAB_ACCESS,
    risk: 'read-only',
    capabilities: ['mcp discovery', 'context recommendation', 'cross-context workflow planning', 'optional dynamic tool loading for compatible clients'],
    useWhen: 'Start here when the best Lab or Adobe MCP context is unclear. In Coworker, use the focused integrations already installed by the marketplace rather than dynamically loading tools.',
  },
  {
    id: 'aep-lab-general',
    coworkerConnectionName: 'lab-all',
    name: 'AEP Lab general demo preparation',
    url: `${LAB_BASE_URL}/mcp`,
    kind: 'lab-complete',
    toolCount: 242,
    access: LAB_ACCESS,
    risk: 'mixed; individual mutations remain governed',
    capabilities: ['broad demo preparation', 'multi-step lab workflows', 'all focused Lab capabilities', 'advanced onboarding and administration', 'governed dataset and schema cleanup (list, audit, exact single-resource delete)', 'Orchestrated Campaign dataset status, validation, preview, serial enablement, and job status'],
    useWhen: 'Use for broad work, first-run setup, infrastructure, Snowflake, administration, read-only batch ingestion diagnostics and flow-run status, or existing key-based configurations.',
  },
  {
    id: 'aep-lab-demo-prep',
    name: 'AEP Lab customer demo preparation',
    url: `${LAB_BASE_URL}/mcp/demo-prep`,
    kind: 'lab-focused',
    toolCount: 24,
    access: LAB_ACCESS,
    risk: 'preview and explicit confirmation before writes',
    capabilities: ['brand scrape', 'Gemini image classification', 'customer research', 'atomic customer switch', 'stable hosted demo images', 'RTDB demo configuration', 'customer restore'],
    useWhen: 'Use for repeatable customer research, brand assets, and customer configuration swaps.',
  },
  {
    id: 'aep-lab-pdf-prep',
    name: 'AEP Lab PDF preparation',
    url: `${LAB_BASE_URL}/mcp/pdf`,
    kind: 'lab-focused',
    toolCount: 14,
    access: LAB_ACCESS,
    risk: 'private generation and storage; confirmation before publish or archive',
    capabilities: ['HTML preview', 'HTML to PDF', 'document to PDF', 'DOCX data extraction', 'stored PDF inventory', 'server template publishing'],
    useWhen: 'Use to upload, preview, generate, store, retrieve, or publish PDFs and PDF templates.',
  },
  {
    id: 'aep-lab-profiles',
    name: 'AEP Lab profiles and events',
    url: `${LAB_BASE_URL}/mcp/profile`,
    kind: 'lab-focused',
    toolCount: 23,
    access: LAB_ACCESS,
    risk: 'governed profile and event writes',
    capabilities: ['profile generation', 'profile updates', 'experience events', 'profile activity', 'Snowflake dual load and enrichment', 'profile and event place context (ten featured areas, any catalog city, or anywhere on Earth; k-anonymous clustering for batches)'],
    useWhen: 'Use for Snowflake-first recipient/industry generation (default), or explicit target:"aep" profile streaming, events and verification.',
  },
  {
    id: 'aep-lab-snowflake',
    name: 'AEP Lab Snowflake workspace',
    url: `${LAB_BASE_URL}/mcp/snowflake`,
    kind: 'lab-focused',
    toolCount: 16,
    access: LAB_ACCESS,
    risk: 'administrator-enabled access; separate human approval for table, data and grant changes; Cortex runs may invoke tools',
    capabilities: ['Snowflake metadata', 'read-only SQL jobs', 'bounded results and cancellation', 'data quality checks', 'typed table and data changes', 'approved grants and revokes', 'Cortex Agent delegation'],
    useWhen: 'Use for general Snowflake exploration, queries, data checks, approved changes or Cortex delegation. Start with capabilities; saved credentials do not prove workspace permission.',
  },
  {
    id: 'aep-lab-decisioning',
    coworkerConnectionName: 'lab-dps',
    name: 'AEP Lab decisioning',
    url: `${LAB_BASE_URL}/mcp/decisioning`,
    kind: 'lab-focused',
    toolCount: 24,
    access: LAB_ACCESS,
    risk: 'governed writes and destructive delete',
    capabilities: ['Edge decision evaluation', 'decision explanation', 'decisioning catalog', 'decisioning health', 'governed create/update/delete', 'async bulk migration', 'cloning', 'compound builders', 'offer eligibility attach', 'add-only schema field extension', 'async bulk tag attach/detach'],
    useWhen: 'Use for Decision Lab evaluation, catalog diagnostics, and governed catalog management.',
  },
  {
    id: 'aep-lab-audiences',
    name: 'AEP Lab audience cleanup',
    url: `${LAB_BASE_URL}/mcp/audiences`,
    kind: 'lab-focused',
    toolCount: 4,
    access: LAB_ACCESS,
    risk: 'controlled delete; exact audit and confirmation required',
    capabilities: ['audience inventory', 'audience audit', 'single audience deletion'],
    useWhen: 'Use to audit audiences and, only after exact confirmation, delete one audience.',
  },
  {
    id: 'aep-lab-ajo-cleanup',
    name: 'AEP Lab AJO cleanup',
    url: `${LAB_BASE_URL}/mcp/ajo-cleanup`,
    kind: 'lab-focused',
    toolCount: 7,
    access: LAB_ACCESS,
    risk: 'controlled delete; lifecycle audit and exact confirmation required',
    capabilities: ['AJO journey inventory', 'AJO campaign inventory', 'journey audit and deletion', 'campaign audit and deletion'],
    useWhen: 'Use for governed AJO journey and campaign cleanup.',
  },
  {
    id: 'aep-lab-ajo-oc-datasets',
    name: 'AEP Lab Orchestrated Campaign datasets',
    url: `${LAB_BASE_URL}/mcp/ajo-oc-datasets`,
    kind: 'lab-focused',
    toolCount: 4,
    access: LAB_ACCESS,
    risk: 'read-only status, validation, and job tracking; dataset changes require the complete General context and exact preview confirmation',
    capabilities: ['rel_ dataset status', 'read-only Adobe eligibility validation', 'owned enablement job status'],
    useWhen: 'Use to inspect Orchestrated Campaign dataset eligibility or track a previously submitted job. Use lab-all only for governed preview and apply.',
  },
  {
    id: 'aep-lab-command-centre',
    name: 'AEP Lab Command Centre',
    url: `${LAB_BASE_URL}/mcp/command-centre`,
    kind: 'lab-focused',
    toolCount: 11,
    access: LAB_ACCESS,
    risk: 'user-scoped writes; delete operations require exact targets',
    capabilities: ['customer engagement tracking', 'task management', 'meeting management'],
    useWhen: 'Use to manage the signed-in user\'s Command Centre engagements, tasks, and meetings.',
  },
  {
    id: 'aep-lab-weather',
    name: 'AEP Lab weather and maps',
    url: `${LAB_BASE_URL}/mcp/weather`,
    kind: 'lab-focused',
    toolCount: 4,
    access: LAB_ACCESS,
    risk: 'read-only third-party weather and map lookups',
    capabilities: ['current weather', 'weather forecast', 'weather map'],
    useWhen: 'Use for live weather or map context in a demo scenario; it does not call AEP or Lab APIs.',
  },
  {
    id: 'aep-lab-geo-insights',
    name: 'AEP Lab audience geo-insights',
    url: `${LAB_BASE_URL}/mcp/geo-insights`,
    kind: 'lab-focused',
    toolCount: 4,
    access: LAB_ACCESS,
    risk: 'read-only aggregate audience query plus confirmation-gated demo seeding',
    capabilities: ['current weather', 'profile place-context geo-hotspots', 'k=10 suppression', 'demo seeding in any featured area or catalog city'],
    useWhen: 'Use when one turn needs both live weather and governed audience geo-hotspots for the same city or coordinate center.',
  },
  {
    id: 'aep-lab-commerce',
    name: 'AEP Lab Commerce demo preparation',
    url: `${LAB_BASE_URL}/mcp/commerce`,
    kind: 'lab-focused',
    toolCount: 19,
    access: LAB_ACCESS,
    risk: 'preview and exact confirmation before curated admin writes; deletion requires a separate audit',
    capabilities: ['ACCS access verification', 'store configuration', 'catalog and attributes', 'categories and assignments', 'inventory sources', 'product media', 'live GraphQL schema', 'governed REST changes and deletion'],
    useWhen: 'Use to inspect, build, update, validate, or safely clean up the configured Adobe Commerce as a Cloud Service demo storefront.',
  },
  {
    id: 'aep-lab-commerce-optimizer',
    coworkerConnectionName: 'lab-aco',
    name: 'AEP Lab Commerce Optimizer demo preparation',
    url: `${LAB_BASE_URL}/mcp/commerce-optimizer`,
    kind: 'lab-focused',
    toolCount: 15,
    access: LAB_ACCESS,
    risk: 'read-only storefront queries; preview and exact confirmation before allowlisted ingestion changes',
    capabilities: ['ACO tenant access verification', 'catalog-view validation', 'product search', 'attribute metadata', 'category tree', 'navigation', 'recommendations', 'storefront GraphQL', 'governed products and metadata ingestion', 'governed categories, price books, prices, and product layers'],
    useWhen: 'Use to inspect, build, update, validate, or safely clean up the configured Adobe Commerce Optimizer demo catalog.',
  },
  {
    id: 'aep-lab-firefly',
    name: 'AEP Lab Adobe Firefly creative media',
    url: `${LAB_BASE_URL}/mcp/firefly`,
    kind: 'lab-focused',
    toolCount: 15,
    access: LAB_ACCESS,
    risk: 'billable non-idempotent generation; preview and exact confirmation required',
    capabilities: ['Firefly Image 5 text-to-image', 'Firefly five-second video generation', 'voice catalog and text to speech', 'audio/video transcription and captions', 'audio/video dubbing and optional lip sync', 'shared async job status'],
    useWhen: 'Use for governed Adobe Firefly image, video, speech, transcription, or dubbing workflows.',
  },
  {
    id: 'aep-lab-creativity',
    name: 'AEP Lab Adobe creative production',
    url: `${LAB_BASE_URL}/mcp/creativity`,
    kind: 'lab-focused',
    toolCount: 16,
    access: LAB_ACCESS,
    risk: 'read-only discovery plus preview and exact confirmation before processing jobs',
    capabilities: ['Photoshop v2 and Lightroom-style combined edits', 'InDesign CSV data merge', 'Substance 3D basic rendering', 'Adobe Express tagged document variations', 'Illustrator raster-to-SVG Image Trace', 'shared async job status'],
    useWhen: 'Use for governed Adobe creative transformation and template production. Use aep-lab-firefly for generative image, video, or audio.',
  },
  {
    id: 'aep-lab-adobe-capabilities',
    name: 'AEP Lab Adobe API capabilities',
    url: `${LAB_BASE_URL}/mcp/adobe-capabilities`,
    kind: 'lab-focused',
    toolCount: 4,
    access: LAB_ACCESS,
    risk: 'read-only catalog and bounded entitlement probes',
    capabilities: ['35-service API inventory', 'service-specific scope registry', 'AJO suppression and allow-list inspection', 'GenStudio approved Experience discovery'],
    useWhen: 'Use to understand the connected Adobe APIs, choose a narrow token profile, or verify the first AJO and GenStudio read operations.',
  },
  {
    id: 'aep-lab-measurement-quality',
    name: 'AEP Lab measurement quality',
    url: `${LAB_BASE_URL}/mcp/measurement-quality`,
    kind: 'lab-focused',
    toolCount: 6,
    access: LAB_ACCESS,
    risk: 'read-only bounded diagnostics; raw Assurance payload values omitted',
    capabilities: ['Assurance session discovery', 'Assurance event metadata', 'Tags property and rule audit', 'Tags environment inventory', 'Adobe Status incident correlation'],
    useWhen: 'Use to distinguish data-collection defects, Tags configuration drift, and relevant Adobe service incidents.',
  },
  {
    id: 'aep-lab-figma',
    name: 'AEP Lab Figma',
    url: `${LAB_BASE_URL}/mcp/figma`,
    kind: 'lab-focused',
    toolCount: 16,
    access: LAB_ACCESS,
    risk: 'read-only Figma access through a server-held token; comment posting requires preview and exact confirmation',
    capabilities: ['Figma URL parsing', 'file and page summary', 'node structure and design context', 'node renders', 'components and styles', 'variables (Enterprise)', 'comments', 'team projects and files'],
    useWhen: 'Use to read a Figma design for demo builds, email or page handoff, design tokens, or review comments without a Figma OAuth connection.',
  },
  {
    id: 'adobe-cx-coworker-gateway',
    name: 'Adobe CX Coworker Gateway',
    url: 'https://cx-coworker-gateway.adobe.io/mcp',
    kind: 'adobe-hosted',
    toolCount: null,
    access: 'Adobe browser sign-in and product entitlements',
    risk: 'depends on the entitled Adobe product tool',
    capabilities: ['AEP platform administration', 'RTCDP operations', 'AJO authoring and monitoring', 'CJA', 'Analytics', 'Workfront'],
    useWhen: 'Use official Adobe product tools when a task is outside the Lab wrappers or needs product-native authoring.',
  },
]);

export const MCP_WORKFLOWS = Object.freeze({
  snowflake_workspace: {
    title: 'Inspect and operate an approved Snowflake workspace',
    contexts: ['aep-lab-snowflake'],
    steps: [
      'Inspect capabilities and the effective configured target; request administrator activation if disabled.',
      'Discover objects, describe columns and run bounded data checks.',
      'Submit one read-only SQL job with a unique request_id; poll and fetch bounded results using its job_id.',
      'Preview one typed change, review SQL and bound values, then obtain independent authenticated Portal approval before apply.',
      'Delegate business questions to an approved Cortex Agent; preserve threads and reconcile unknown outcomes without replay.',
    ],
  },
  customer_demo: {
    title: 'Prepare a customer-specific demo',
    contexts: ['aep-lab-demo-prep', 'aep-lab-profiles', 'aep-lab-decisioning'],
    steps: [
      'Resolve or run one brand scrape and inspect its evidence.',
      'Inspect lab_demo_assets_inspect.customerLibrary, classify customer/shared paths, then lab_demo_customer_save for a cloud backup. Use lab_demo_customer_upload for supported attachments and lab_demo_customer_switch to preview a saved revision, scrape or staged files plus approved branding. Resolve missing outgoing names/brand fields; confirm the single preflight_id before apply. Inspect lab_demo_customer_operation after timeouts; never auto-retry.',
      'Generate test profiles and industry events, including Snowflake dual-load verification when requested.',
      'Evaluate and explain Edge decisions for the generated profile.',
    ],
  },
  profile_and_events: {
    title: 'Create and enrich a profile',
    contexts: ['aep-lab-profiles'],
    steps: [
      'Check access, confirm shared email preferences, industry and count.',
      'Default: lab_preflight_profile_generate then lab_generate_profile target snowflake (or lab_generate_profiles_batch) seeds the shared recipient parent before linked industry data. No AEP stream; downstream ingestion is separate.',
      'For AEP/event demos explicitly use target aep on preflight and generate; place context is added by the AEP persona workflow.',
      'Only for the AEP path: send governed industry events, passing place_context.city as place_area, then verify AEP activity.',
      'Snowflake path: inspect recipientId, recipientTable, tableRowcounts and relationalRefresh; verify industry readback. Never poll a Snowflake-default batch as an async AEP job.',
    ],
  },
  audience_cleanup: {
    title: 'Audit and delete one audience',
    contexts: ['aep-lab-audiences'],
    steps: ['List candidates.', 'Audit one exact audience ID.', 'Show limitations and obtain exact confirmation.', 'Delete one audience and read back the result.'],
  },
  ajo_cleanup: {
    title: 'Audit and delete one AJO journey or campaign',
    contexts: ['aep-lab-ajo-cleanup'],
    steps: ['List journeys or campaigns.', 'Audit one exact asset and its lifecycle.', 'Obtain exact ID, name, and status confirmation.', 'Delete one eligible asset and verify.'],
  },
  ajo_orchestrated_campaign_datasets: {
    title: 'Validate and enable Orchestrated Campaign datasets',
    contexts: ['aep-lab-ajo-oc-datasets', 'aep-lab-general'],
    steps: [
      'Use the read-only focused context to inspect exact rel_ dataset status and call Adobe validation; stop on HTTP 401/403.',
      'Use lab-all to preview the exact dataset IDs, eligibility, existing-data warnings, preflight ID, and confirmation phrase.',
      'Show the exact scope and phrase; only after explicit colleague confirmation call apply with the unchanged IDs, preflight ID, phrase, and confirmed true.',
      'The backend re-reads and revalidates each dataset, submits one dataset per request serially, never retries a write, and stops on the first failure or uncertain result.',
      'Poll the returned batch_job_id or owned Adobe job IDs; do not re-submit when a job is pending or a submission outcome is uncertain.',
    ],
  },
  platform_cleanup: {
    title: 'Governed AEP cleanup inventory, planning, and verification',
    contexts: ['aep-lab-general'],
    steps: [
      'Use /mcp or load platform-cleanup. Inventory explicit IDs, then create an immutable plan; never select deletion targets by name or broad workbook verdict.',
      'Review the complete ordered manifest, coverage, dependency graph, protected baseline, active schedules/runs and independent usage evidence. A workbook-only zero is not live proof.',
      'The batch path currently blocks apply: mapping-set/AJO-channel coverage, the protected 28-flow ID baseline, external campaign/destination usage, flow quiescence and conditional DELETE semantics are unresolved.',
      'Keep workbook inventories and exact batch manifests in session artifacts. Select only the explicitly reviewed subset; never import later batches, optional rows or wildcard patterns.',
      'Reconcile dependent campaigns even if draft or completed. Their usage is a blocker, not permission to delete or rebuild them.',
      'If a future fresh plan is executable, confirm its exact plan ID, digest, count and independently cleared usage. Apply is one-shot, serial and never retried; verify and recover by readback only.',
      'Legacy single-asset list/audit/delete APIs remain available, but hard protection policies apply to them too. Do not use them to bypass a blocked batch plan.',
    ],
  },
  pdf_preparation: {
    title: 'Prepare and store a personalised PDF',
    contexts: ['aep-lab-pdf-prep'],
    steps: [
      'Inspect PDF capabilities and source limits.',
      'Save or select an HTML draft, or provide one supported source document.',
      'Preview HTML or analyse document merge fields before generation.',
      'Generate with a fresh idempotency key and inspect the private preview URL.',
      'Use the recent-job inventory to retrieve the stored PDF until expiry; publish a server template only after explicit confirmation.',
    ],
  },
  commerce_demo_preparation: {
    title: 'Build and prepare an Adobe Commerce demo storefront',
    contexts: ['aep-lab-commerce'],
    steps: [
      'Verify the configured ACCS organization, instance, region, environment, and stores.',
      'Summarize products, attributes, categories, media, and inventory sources, then inspect exact demo targets.',
      'Discover the live storefront GraphQL schema and use bounded queries to validate shopper-facing responses.',
      'Preview one curated product, category, assignment, or inventory REST change and review the current-state diff.',
      'Obtain the exact confirmation, apply one request without retries, and inspect the live readback.',
      'For deletion, audit the exact target separately, preserve its snapshot, confirm exactly, then verify absence.',
    ],
  },
  commerce_optimizer_demo_preparation: {
    title: 'Inspect and prepare an Adobe Commerce Optimizer demo',
    contexts: ['aep-lab-commerce-optimizer'],
    steps: [
      'Verify the configured ACO organization, tenant, region, and readiness.',
      'Provide a public catalog view ID and validate its price-book context.',
      'Inspect searchable attributes, products, categories, navigation, and recommendation units needed for the demo.',
      'Keep all operations read-only; catalog ingestion is outside this MCP.',
    ],
  },
  firefly_image_generation: {
    title: 'Generate an image with Adobe Firefly',
    contexts: ['aep-lab-firefly'],
    steps: [
      'Inspect Firefly readiness and supported aspect ratios.',
      'Preview one prompt and review the exact request, preflight ID, and billable-operation warning.',
      'Obtain the exact confirmation and submit once without automatic retry.',
      'Check the Adobe job URL until it succeeds or fails, then use the returned output URL.',
      'Cancel only with the Adobe cancel URL and exact job confirmation.',
    ],
  },
  firefly_audio_processing: {
    title: 'Create or process audio with Adobe Firefly',
    contexts: ['aep-lab-firefly'],
    steps: [
      'Inspect Firefly audio readiness and list stock voices when generating speech.',
      'Choose speech, transcription/captions, or dubbing and run its preview tool.',
      'Review the bound request and obtain the exact confirmation before one submit.',
      'Check the shared Adobe job status URL until it succeeds or fails, then use the returned output URLs.',
    ],
  },
  creative_asset_production: {
    title: 'Transform and produce campaign-ready creative assets',
    contexts: ['aep-lab-creativity'],
    steps: [
      'Inspect the capability boundary and use a token-only access probe if entitlement evidence is needed.',
      'Choose Photoshop v2 edits, InDesign data merge, Substance 3D render, Express tagged-template variation, or Illustrator Image Trace.',
      'Run the matching preview and review its immutable request plus exact confirmation phrase.',
      'Submit once after confirmation; never retry an ambiguous processing response.',
      'Poll the returned Adobe status URL and pass the finished asset into the existing demo-prep, PDF, or activation workflow.',
    ],
  },
  adobe_api_discovery: {
    title: 'Discover and verify connected Adobe APIs',
    contexts: ['aep-lab-adobe-capabilities'],
    steps: [
      'Read the 35-service catalog and separate connected services from verified operations.',
      'Choose the smallest delivery phase and narrowest token profile for the use case.',
      'Run only the bounded read-only AJO or GenStudio probe needed for current evidence.',
      'Add mutation or billable adapters later with preview, exact confirmation, and readback.',
    ],
  },
  measurement_quality_diagnostics: {
    title: 'Diagnose Adobe data collection and service health',
    contexts: ['aep-lab-measurement-quality'],
    steps: [
      'List Assurance sessions and select one exact session.',
      'Inspect bounded event metadata without exposing raw payload values.',
      'Audit the relevant Tags property, extensions, rules, and environments.',
      'Correlate the observed time window with Adobe Status incidents.',
    ],
  },
  figma_design_handoff: {
    title: 'Turn a Figma design into build-ready context',
    contexts: ['aep-lab-figma'],
    steps: [
      'Parse the pasted Figma link and summarise the file with figma_get_file.',
      'Walk the relevant page or frame with figma_get_metadata to find exact node IDs.',
      'Pull figma_get_design_context for the target node and render it with figma_get_screenshot.',
      'Collect components, styles, or variables needed for tokens, then build the HTML or AJO content.',
    ],
  },
  geo_insights: {
    title: 'Explore governed audience geo-hotspots with live weather',
    contexts: ['aep-lab-geo-insights'],
    steps: [
      'Call lab_weather_current and lab_audience_geo_hotspots with the same city or coordinate center.',
      'Summarize current weather with aggregate profile counts and hotspot cells; never infer or expose individual identities.',
      'If there is no matching ingested data, request approval before lab_seed_geo_demo and rerun after the reported ingestion delay.',
    ],
  },
  platform_authoring: {
    title: 'Perform product-native Adobe authoring',
    contexts: ['adobe-cx-coworker-gateway'],
    steps: ['Connect the Adobe-hosted gateway.', 'Set organization and sandbox context.', 'Use the entitled product-native tools.', 'Return to a focused Lab context for Lab-specific orchestration if needed.'],
  },
});

const KEYWORDS = Object.freeze({
  'aep-lab-snowflake': ['snowflake', 'snowflake query', 'snowflake sql', 'cortex agent', 'snowflake grants', 'snowflake table', 'data quality'],
  'aep-lab-general': ['delete dataset', 'delete schema', 'dataset cleanup', 'schema cleanup', 'delete tables', 'platform cleanup'],
  'aep-lab-demo-prep': ['brand', 'customer', 'logo', 'hero', 'image', 'asset', 'scrape', 'website', 'rtdb', 'demo prep', 'restore customer'],
  'aep-lab-pdf-prep': ['pdf', 'html to pdf', 'document to pdf', 'docx', 'word document', 'boarding pass', 'attachment', 'pdf template', 'preview pdf'],
  'aep-lab-profiles': ['profile', 'persona', 'event', 'experience event', 'snowflake', 'dual load', 'enrich', 'seed'],
  'aep-lab-decisioning': ['decision', 'decisioning', 'offer', 'treatment', 'edge evaluate', 'catalog'],
  'aep-lab-audiences': ['audience', 'segment', 'delete audience', 'audience cleanup'],
  'aep-lab-ajo-cleanup': ['journey delete', 'campaign delete', 'journey cleanup', 'campaign cleanup', 'delete journey', 'delete campaign'],
  'aep-lab-ajo-oc-datasets': ['orchestrated campaign dataset', 'orchestrated campaigns dataset', 'orchestrated campaign enablement', 'ajo dataset enablement', 'rel_ dataset', 'relational dataset'],
  'aep-lab-command-centre': ['command centre', 'customer engagement', 'meeting', 'task list', 'next action'],
  'aep-lab-weather': ['weather', 'forecast', 'temperature', 'rain', 'weather map'],
  'aep-lab-geo-insights': ['geo insights', 'geo hotspots', 'audience hotspots', 'customers near', 'customers around', 'profiles around', 'audience map', 'weather and audience', 'camping gear near', 'customers who viewed', 'current weather', 'who viewed'],
  'aep-lab-commerce': ['commerce', 'accs', 'product catalog', 'product sku', 'inventory', 'store view', 'storefront graphql'],
  'aep-lab-commerce-optimizer': ['commerce optimizer', 'aco', 'catalog view', 'price book', 'recommendation unit', 'merchandising services'],
  'aep-lab-firefly': ['firefly', 'firefly image', 'generate image', 'text to image', 'image 5', 'generate video', 'firefly video', 'audio', 'text to speech', 'transcribe', 'caption', 'dub', 'lip sync', 'creative generation'],
  'aep-lab-creativity': ['photoshop', 'lightroom', 'indesign', 'substance', 'substance 3d', 'express variation', 'tagged template', 'illustrator', 'image trace', 'raster to svg', 'creative production', 'creative automation'],
  'aep-lab-adobe-capabilities': ['adobe api', 'api capability', 'developer console', 'scope inventory', 'suppression list', 'allowed list', 'genstudio experience'],
  'aep-lab-measurement-quality': ['assurance', 'launch', 'tags property', 'tags environment', 'measurement quality', 'status incident', 'data collection defect'],
  'aep-lab-figma': ['figma', 'figma file', 'figma frame', 'figma node', 'figma component', 'figma comment', 'design file', 'design handoff', 'design tokens'],
  'adobe-cx-coworker-gateway': ['schema', 'dataset', 'destination', 'source', 'query service', 'cja', 'analytics', 'workfront', 'authoring', 'native adobe'],
});

export function listMcpContexts({ includeAdobe = true } = {}) {
  return MCP_CONTEXTS.filter((context) => includeAdobe || context.kind !== 'adobe-hosted');
}
export function getMcpWorkflow(id) {
  return MCP_WORKFLOWS[String(id || '').trim()] || null;
}

export function recommendMcpContexts(goal) {
  const normalizedGoal = String(goal || '').trim().toLowerCase();
  const ranked = Object.entries(KEYWORDS)
    .map(([id, terms]) => ({
      id,
      matches: terms.filter((term) => normalizedGoal.includes(term)),
    }))
    .filter((candidate) => candidate.matches.length)
    .sort((a, b) => b.matches.length - a.matches.length || a.id.localeCompare(b.id));

  const platformCleanupGoal = /\b(delete|deleting|remove|cleanup|clean up)\b/.test(normalizedGoal)
    && /\b(datasets?|schemas?|tables?)\b/.test(normalizedGoal);
  if (platformCleanupGoal && !ranked.some((candidate) => candidate.id === 'aep-lab-general')) {
    ranked.push({ id: 'aep-lab-general', matches: ['dataset/schema cleanup'] });
  }
  const orchestratedDatasetGoal = /\b(orchestrated campaigns?|ajo|rel_)\b/.test(normalizedGoal)
    && /\b(datasets?|eligibility|enablement|status|jobs?)\b/.test(normalizedGoal);
  if (orchestratedDatasetGoal) {
    const index = ranked.findIndex((candidate) => candidate.id === 'aep-lab-ajo-oc-datasets');
    if (index > 0) ranked.unshift(...ranked.splice(index, 1));
  }
  const cleanupIndex = ranked.findIndex((candidate) => candidate.id === 'aep-lab-general');
  if (cleanupIndex > 0) ranked.unshift(...ranked.splice(cleanupIndex, 1));
  const recommendedIds = ranked.length ? ranked.map((candidate) => candidate.id) : ['aep-lab-general'];
  const contexts = recommendedIds.map((id) => MCP_CONTEXTS.find((context) => context.id === id)).filter(Boolean);
  const destructiveRisk = contexts.some((context) => ['aep-lab-audiences', 'aep-lab-ajo-cleanup', 'aep-lab-snowflake'].includes(context.id))
    || (ranked.find((candidate) => candidate.id === 'aep-lab-general')?.matches.length > 0);

  return {
    goal: String(goal || '').trim(),
    primary: contexts[0],
    additionalContexts: contexts.slice(1),
    matchedTerms: ranked.flatMap((candidate) => candidate.matches),
    crossContext: contexts.length > 1,
    destructiveRisk,
    suggestedPrompt: contexts.length === 1
      ? `Use the ${contexts[0].id} MCP for this task. Begin with its access/readiness check and follow its governed workflow.`
      : `Use these configured MCPs in order: ${contexts.map((context) => context.id).join(' -> ')}. Keep outputs from each step as context for the next.`,
    hostLimitation: 'This guide cannot connect, switch, or invoke another MCP server. The Coworker marketplace already installs all focused Lab contexts; use the matching integration directly because Coworker does not refresh dynamically loaded tools.',
  };
}
