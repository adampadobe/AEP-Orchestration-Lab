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
    name: 'AEP Lab general demo preparation',
    url: `${LAB_BASE_URL}/mcp`,
    kind: 'lab-complete',
    toolCount: 174,
    access: LAB_ACCESS,
    risk: 'mixed; individual mutations remain governed',
    capabilities: ['broad demo preparation', 'multi-step lab workflows', 'all focused Lab capabilities', 'advanced onboarding and administration'],
    useWhen: 'Use for broad work, first-run setup, infrastructure, Snowflake, administration, or existing key-based configurations.',
  },
  {
    id: 'aep-lab-demo-prep',
    name: 'AEP Lab customer demo preparation',
    url: `${LAB_BASE_URL}/mcp/demo-prep`,
    kind: 'lab-focused',
    toolCount: 21,
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
    toolCount: 21,
    access: LAB_ACCESS,
    risk: 'governed profile and event writes',
    capabilities: ['profile generation', 'profile updates', 'experience events', 'profile activity', 'Snowflake dual load and enrichment'],
    useWhen: 'Use for the complete profile lifecycle and Snowflake verification.',
  },
  {
    id: 'aep-lab-decisioning',
    name: 'AEP Lab decisioning',
    url: `${LAB_BASE_URL}/mcp/decisioning`,
    kind: 'lab-focused',
    toolCount: 9,
    access: LAB_ACCESS,
    risk: 'read-only evaluation and assessment',
    capabilities: ['Edge decision evaluation', 'decision explanation', 'decisioning catalog', 'decisioning health'],
    useWhen: 'Use for Decision Lab evaluation and catalog diagnostics.',
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
    name: 'AEP Lab Adobe Firefly generation',
    url: `${LAB_BASE_URL}/mcp/firefly`,
    kind: 'lab-focused',
    toolCount: 8,
    access: LAB_ACCESS,
    risk: 'billable non-idempotent generation; preview and exact confirmation required',
    capabilities: ['Firefly Image 5 text-to-image', 'Firefly five-second video generation', 'async job status', 'generated asset URLs', 'job cancellation'],
    useWhen: 'Use to preview, submit, monitor, or cancel governed Adobe Firefly image or video generation.',
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
  customer_demo: {
    title: 'Prepare a customer-specific demo',
    contexts: ['aep-lab-demo-prep', 'aep-lab-profiles', 'aep-lab-decisioning'],
    steps: [
      'Resolve or run one brand scrape and inspect its evidence.',
      'Auto-classify scrape images when needed, then use lab_demo_customer_switch to preview RTDB plus all five managed images and obtain one confirmation before apply.',
      'Generate test profiles and industry events, including Snowflake dual-load verification when requested.',
      'Evaluate and explain Edge decisions for the generated profile.',
    ],
  },
  profile_and_events: {
    title: 'Create and enrich a profile',
    contexts: ['aep-lab-profiles'],
    steps: ['Check access and readiness.', 'Confirm generation preferences.', 'Generate the profile.', 'Send governed industry events.', 'Verify AEP activity and optional Snowflake readback.'],
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
  platform_authoring: {
    title: 'Perform product-native Adobe authoring',
    contexts: ['adobe-cx-coworker-gateway'],
    steps: ['Connect the Adobe-hosted gateway.', 'Set organization and sandbox context.', 'Use the entitled product-native tools.', 'Return to a focused Lab context for Lab-specific orchestration if needed.'],
  },
});

const KEYWORDS = Object.freeze({
  'aep-lab-demo-prep': ['brand', 'customer', 'logo', 'hero', 'image', 'asset', 'scrape', 'website', 'rtdb', 'demo prep', 'restore customer'],
  'aep-lab-pdf-prep': ['pdf', 'html to pdf', 'document to pdf', 'docx', 'word document', 'boarding pass', 'attachment', 'pdf template', 'preview pdf'],
  'aep-lab-profiles': ['profile', 'persona', 'event', 'experience event', 'snowflake', 'dual load', 'enrich', 'seed'],
  'aep-lab-decisioning': ['decision', 'decisioning', 'offer', 'treatment', 'edge evaluate', 'catalog'],
  'aep-lab-audiences': ['audience', 'segment', 'delete audience', 'audience cleanup'],
  'aep-lab-ajo-cleanup': ['journey delete', 'campaign delete', 'journey cleanup', 'campaign cleanup', 'delete journey', 'delete campaign'],
  'aep-lab-command-centre': ['command centre', 'customer engagement', 'meeting', 'task list', 'next action'],
  'aep-lab-weather': ['weather', 'forecast', 'temperature', 'rain', 'weather map'],
  'aep-lab-commerce': ['commerce', 'accs', 'product catalog', 'product sku', 'inventory', 'store view', 'storefront graphql'],
  'aep-lab-commerce-optimizer': ['commerce optimizer', 'aco', 'catalog view', 'price book', 'recommendation unit', 'merchandising services'],
  'aep-lab-firefly': ['firefly', 'firefly image', 'generate image', 'text to image', 'image 5', 'generate video', 'firefly video', 'creative generation'],
  'aep-lab-adobe-capabilities': ['adobe api', 'api capability', 'developer console', 'scope inventory', 'suppression list', 'allowed list', 'genstudio experience'],
  'aep-lab-measurement-quality': ['assurance', 'launch', 'tags property', 'tags environment', 'measurement quality', 'status incident', 'data collection defect'],
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

  const recommendedIds = ranked.length ? ranked.map((candidate) => candidate.id) : ['aep-lab-general'];
  const contexts = recommendedIds.map((id) => MCP_CONTEXTS.find((context) => context.id === id)).filter(Boolean);
  const destructiveRisk = contexts.some((context) => context.id === 'aep-lab-audiences' || context.id === 'aep-lab-ajo-cleanup');

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
