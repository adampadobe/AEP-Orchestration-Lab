const LAB_BASE_URL = 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app';

export const MCP_CONTEXTS = Object.freeze([
  {
    id: 'aep-lab-guide',
    name: 'AEP Lab MCP guide',
    url: `${LAB_BASE_URL}/mcp/guide`,
    kind: 'lab-focused',
    toolCount: 4,
    access: 'X-AEP-Lab-Mcp-Key',
    risk: 'read-only',
    capabilities: ['mcp discovery', 'context recommendation', 'cross-context workflow planning'],
    useWhen: 'Start here when the best Lab or Adobe MCP context is unclear.',
  },
  {
    id: 'aep-lab-general',
    name: 'AEP Lab general demo preparation',
    url: `${LAB_BASE_URL}/mcp`,
    kind: 'lab-complete',
    toolCount: 111,
    access: 'X-AEP-Lab-Mcp-Key',
    risk: 'mixed; individual mutations remain governed',
    capabilities: ['broad demo preparation', 'multi-step lab workflows', 'all focused Lab capabilities'],
    useWhen: 'Use for broad work that spans several Lab domains or for existing configurations.',
  },
  {
    id: 'aep-lab-demo-prep',
    name: 'AEP Lab customer demo preparation',
    url: `${LAB_BASE_URL}/mcp/demo-prep`,
    kind: 'lab-focused',
    toolCount: 19,
    access: 'X-AEP-Lab-Mcp-Key',
    risk: 'preview and explicit confirmation before writes',
    capabilities: ['brand scrape', 'customer research', 'stable hosted demo images', 'RTDB demo configuration', 'customer restore'],
    useWhen: 'Use for repeatable customer research, brand assets, and customer configuration swaps.',
  },
  {
    id: 'aep-lab-pdf-prep',
    name: 'AEP Lab PDF preparation',
    url: `${LAB_BASE_URL}/mcp/pdf`,
    kind: 'lab-focused',
    toolCount: 14,
    access: 'X-AEP-Lab-Mcp-Key',
    risk: 'private generation and storage; confirmation before publish or archive',
    capabilities: ['HTML preview', 'HTML to PDF', 'document to PDF', 'DOCX data extraction', 'stored PDF inventory', 'server template publishing'],
    useWhen: 'Use to upload, preview, generate, store, retrieve, or publish PDFs and PDF templates.',
  },
  {
    id: 'aep-lab-profiles',
    name: 'AEP Lab profiles and events',
    url: `${LAB_BASE_URL}/mcp/profile`,
    kind: 'lab-focused',
    toolCount: 20,
    access: 'X-AEP-Lab-Mcp-Key',
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
    access: 'X-AEP-Lab-Mcp-Key',
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
    access: 'X-AEP-Lab-Mcp-Key',
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
    access: 'X-AEP-Lab-Mcp-Key',
    risk: 'controlled delete; lifecycle audit and exact confirmation required',
    capabilities: ['AJO journey inventory', 'AJO campaign inventory', 'journey audit and deletion', 'campaign audit and deletion'],
    useWhen: 'Use for governed AJO journey and campaign cleanup.',
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
      'Preview stable hosted assets and RTDB customer changes; obtain confirmation before each apply.',
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
    hostLimitation: 'This guide recommends contexts but cannot connect, switch, or invoke another MCP server on behalf of the Coworker host. Configure each recommended server first.',
  };
}
