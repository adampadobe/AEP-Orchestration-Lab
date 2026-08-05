/**
 * MCP servers reference — renders catalog from static data (no secrets).
 */
(function () {
  'use strict';

  /**
   * @type {Array<{
   *   id: string;
   *   section: 'adobe' | 'lab' | 'thirdParty';
   *   name: string;
   *   product: string;
   *   mcpUrl: string;
   *   summary: string;
   *   useCases: string[];
   *   configNotes: string;
   *   connectionKind?: string;
   *   toolCount?: number;
   *   caution?: boolean;
   *   docUrl?: string;
   *   docLabel?: string;
   * }>}
   */
  const MCP_SERVERS = [
    {
      id: 'aep-orchestration-lab-mcp',
      section: 'lab',
      name: 'AEP Lab — General demo preparation',
      product: 'Complete Lab MCP · 85 tools',
      mcpUrl: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp',
      summary:
        'The complete, backward-compatible Lab MCP for broad and multi-step demo preparation. Existing connections continue to work unchanged.',
      useCases: [
        'Generate and batch-seed golden test profiles',
        'Brand scrape → profiles, events, and Client Journey demo prep',
        'Send experience events and verify profile activity',
        'Check sandbox infra and onboard profile pipelines',
      ],
      configNotes:
        'Choose this for general demo work or when a workflow spans several areas. Uses X-AEP-Lab-Mcp-Key; the same sandbox key also works with every focused connection below.',
      connectionKind: 'Complete · backward compatible',
      toolCount: 85,
      docUrl:
        'https://github.com/adampadobe/AEP-Orchestration-Lab/blob/main/tools/aep-lab-profile-mcp/README.md',
      docLabel: 'AEP Orchestration Lab MCP README',
    },
    {
      id: 'aep-lab-profiles',
      section: 'lab',
      name: 'AEP Lab — Profiles',
      product: 'Focused Lab MCP · 9 tools',
      mcpUrl: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/profile',
      summary:
        'A smaller profile-only context for dependable discovery and invocation in Coworker.',
      useCases: [
        'Check profile and ingestion readiness',
        'Generate golden test profiles',
        'Look up profiles and inspect activity',
      ],
      configNotes:
        'Choose this when the task is specifically about test profiles. Reuse the same X-AEP-Lab-Mcp-Key generated below.',
      connectionKind: 'Focused',
      toolCount: 9,
      docUrl:
        'https://github.com/adampadobe/AEP-Orchestration-Lab/blob/main/tools/aep-lab-profile-mcp/README.md',
      docLabel: 'Profile tools reference',
    },
    {
      id: 'aep-lab-audiences',
      section: 'lab',
      name: 'AEP Lab — Audiences',
      product: 'Focused Lab MCP · 4 tools',
      mcpUrl: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/audiences',
      summary:
        'A governed audience audit context with an exact, confirmation-gated single-audience delete operation.',
      useCases: [
        'List and search audiences',
        'Inspect one audience before changing it',
        'Delete one exact audience after explicit confirmation',
      ],
      configNotes:
        'Choose this for audience inventory and cleanup. Destructive calls still require an exact audience id and explicit confirmation. Reuse the same sandbox key.',
      connectionKind: 'Focused · controlled delete',
      toolCount: 4,
      caution: true,
      docUrl:
        'https://github.com/adampadobe/AEP-Orchestration-Lab/blob/main/tools/aep-lab-profile-mcp/README.md',
      docLabel: 'Audience tools reference',
    },
    {
      id: 'aep-lab-decisioning',
      section: 'lab',
      name: 'AEP Lab — Decisioning',
      product: 'Focused Lab MCP · 9 tools',
      mcpUrl: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/decisioning',
      summary:
        'A smaller decisioning context for Edge evaluation, catalog inspection, diagnostics, and explanations.',
      useCases: [
        'Evaluate Edge decisions for a profile',
        'Browse decisioning catalog objects',
        'Check health and explain decision results',
      ],
      configNotes:
        'Choose this for Decision Lab and Edge decisioning work. Reuse the same X-AEP-Lab-Mcp-Key generated below.',
      connectionKind: 'Focused',
      toolCount: 9,
      docUrl:
        'https://github.com/adampadobe/AEP-Orchestration-Lab/blob/main/tools/aep-lab-profile-mcp/README.md',
      docLabel: 'Decisioning tools reference',
    },
    {
      id: 'aep',
      section: 'adobe',
      name: 'AEP / Marketing Agent',
      product: 'Adobe Experience Platform',
      mcpUrl: 'https://aep-ai-ama.adobe.io/mcp',
      summary:
        'Adobe-hosted Marketing Agent MCP for Experience Platform: org/sandbox/dataview context, task orchestration, product knowledge, audience and journey workflows (tools vary by entitlements).',
      useCases: [
        'Switch sandbox or data view from natural language',
        'Plan and approve mutating operations (audiences, journeys, campaigns)',
        'Product guidance and troubleshooting across AEP surfaces',
      ],
      configNotes:
        'Typically installed as a Cursor global/plugin server (user-aep). OAuth via Adobe Experience Cloud on first use. No Adobe secrets in repo config.',
      docUrl: 'https://experienceleague.adobe.com/docs/experience-platform.html',
      docLabel: 'Experience Platform docs',
    },
    {
      id: 'aa',
      section: 'adobe',
      name: 'Adobe Analytics',
      product: 'Adobe Analytics',
      mcpUrl: 'https://aa-mcp.adobe.io/mcp',
      summary:
        'Adobe-hosted MCP for Analytics: query metrics, explore trends, build segments, and manage components from natural language in Cursor.',
      useCases: [
        'List report suites and components',
        'Run analysis-style questions without opening Workspace',
        'Segment and calculated metric discovery',
      ],
      configNotes:
        'Cursor: streamable-http — Settings → Tools & MCP → Connect → Adobe ID. Alternate gateway: https://mcp-gateway.adobe.io/aa/mcp. Server id often user-aa.',
      docUrl: 'https://developer.adobe.com/analytics-mcp/docs/',
      docLabel: 'Analytics MCP docs',
    },
    {
      id: 'cja',
      section: 'adobe',
      name: 'Customer Journey Analytics',
      product: 'Customer Journey Analytics',
      mcpUrl: 'https://cja-mcp.adobe.io/mcp',
      summary:
        'Adobe-hosted MCP for CJA: data views, dimensions, segments, and Analysis Workspace–style workflows via agent prompts (requires CJA access and Data Mirror where applicable).',
      useCases: [
        'List data views and explore schema',
        'Build or refine segments from conversation',
        'Accelerate report and component authoring',
      ],
      configNotes:
        'Cursor: streamable-http — OAuth connect in Tools & MCP. Alternate gateway: https://mcp-gateway.adobe.io/cja/mcp. Server id often user-cja.',
      docUrl: 'https://developer.adobe.com/analytics-mcp/docs/',
      docLabel: 'Analytics & CJA MCP docs',
    },
    {
      id: 'target',
      section: 'adobe',
      name: 'Adobe Target',
      product: 'Adobe Target',
      mcpUrl: 'https://targetmcp.adobe.io/mcp',
      summary:
        'Adobe-hosted Target MCP (Public Beta): read-only tools for activities, audiences, offers, mboxes, properties, and A/B or XT reporting.',
      useCases: [
        'List active activities and audiences',
        'Pull A/B or XT performance reports in conversation',
        'Explore mboxes, environments, and properties',
      ],
      configNotes:
        'Cursor global ~/.cursor/mcp.json: "type": "streamable-http", "url": "https://targetmcp.adobe.io/mcp" — OAuth on first tool use (no static headers). Server id often user-adobe-target. Requires Target license and Observer+ role in Admin Console.',
      docUrl: 'https://experienceleague.adobe.com/docs/target/using/mcp/target-mcp-get-started.html',
      docLabel: 'Target MCP get started',
    },
    {
      id: 'aem',
      section: 'adobe',
      name: 'Adobe Experience Manager',
      product: 'AEM as a Cloud Service',
      mcpUrl: 'https://mcp.adobeaemcloud.com/adobe/mcp/content-readonly',
      summary:
        'AEM MCP HTTP endpoints for content, assets, and development operations (readonly and fuller servers). AI clients discover tools and call them with Adobe OAuth governance.',
      useCases: [
        'Search or read pages and content fragments',
        'Asset and content operations from Cursor (per server permissions)',
        'AEM development workflows with governed write tools',
      ],
      configNotes:
        'Additional endpoints under https://mcp.adobeaemcloud.com/adobe/mcp/ (e.g. /content, /cloudmanager). Authenticate with Adobe ID when prompted. Server id often user-aem.',
      docUrl: 'https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/ai-in-aem/mcp-support/using-mcp-with-aem-as-a-cloud-service.html',
      docLabel: 'AEM MCP overview',
    },
    {
      id: 'marketo',
      section: 'adobe',
      name: 'Marketo Engage',
      product: 'Adobe Marketo Engage',
      mcpUrl: 'https://marketo-mcp.adobe.io/mcp',
      summary:
        'Hosted Marketo MCP with 100+ operations across programs, smart campaigns, leads, forms, emails, snippets, and folders. Credentials supplied per request via headers (not stored by Adobe MCP server).',
      useCases: [
        'List or update programs and campaigns from the agent',
        'Lead and list operations without custom scripts',
        'Email and snippet discovery',
      ],
      configNotes:
        'Cursor global ~/.cursor/mcp.json: "type": "http", url https://marketo-mcp.adobe.io/mcp, headers X-Marketo-Client-Id, X-Marketo-Client-Secret, X-Marketo-Munchkin-Id (LaunchPoint + Admin > Munchkin; never commit). Limited availability — request access via Adobe form.',
      docUrl: 'https://experienceleague.adobe.com/docs/marketo-developer/marketo/mcp-server.html',
      docLabel: 'Marketo MCP server',
    },
    {
      id: 'rtcdp',
      section: 'adobe',
      name: 'Real-Time CDP (CDP MCP)',
      product: 'Adobe Real-Time Customer Data Platform',
      mcpUrl: 'https://rtcdp-mcp.adobe.io/mcp',
      summary:
        'Adobe-hosted Real-Time CDP MCP (Beta, read-only): inspect audiences, destinations, sources, identity namespaces, merge policies, and flow runs via natural language in MCP clients — B2C and B2B Edition (tools vary by entitlements).',
      useCases: [
        'Search audiences and preview segment membership estimates',
        'Triage destination activation flows, connectors, and flow-run failures',
        'Monitor source ingestion pipelines and diagnose batch audience evaluation jobs',
      ],
      configNotes:
        'Cursor: streamable-http — Settings → Tools & MCP → Connect → Adobe ID, url https://rtcdp-mcp.adobe.io/mcp (no static headers). OAuth browser sign-in on first tool use. Tell the assistant your imsOrgId and sandboxName each session (use search_organizations if needed). Public Beta — contact your Adobe rep for access. Also: https://experienceleague.adobe.com/docs/experience-platform/rtcdp/intro/rtcdpb2b-intro/rtcdp-mcp',
      docUrl:
        'https://experienceleague.adobe.com/docs/experience-cloud-ai/experience-cloud-ai/mcp/rtcdp-mcp',
      docLabel: 'Real-Time CDP MCP (Beta)',
    },
    {
      id: 'ajo',
      section: 'adobe',
      name: 'Adobe Journey Optimizer (AJO MCP)',
      product: 'Adobe Journey Optimizer',
      mcpUrl: 'https://ajo-mcp.adobe.io/mcp',
      summary:
        'Adobe-hosted Journey Optimizer MCP (Beta, read-only): list and inspect campaigns (status filters), fetch campaign configuration (audience, schedule, channels), and list email/SMS/push/WhatsApp channel presets — offers and sandbox context; tools vary by entitlements.',
      useCases: [
        'Audit live, draft, stopped, or completed campaigns without the AJO UI',
        'Troubleshoot campaign setup, targeting, and channel configuration from conversation',
        'Review channel surface presets and branding across sandboxes',
      ],
      configNotes:
        'Cursor: streamable-http — Settings → Tools & MCP → Connect → Adobe ID, url https://ajo-mcp.adobe.io/mcp (no static headers). OAuth browser sign-in on first tool use. Beta — contact your Adobe rep for org access; official setup also documents Claude Web/Desktop. View permissions for campaigns/offers required; all tools are read-only.',
      docUrl:
        'https://experienceleague.adobe.com/docs/journey-optimizer/using/content-management/combine/ajo-mcp.html',
      docLabel: 'AJO MCP (Beta)',
    },
    {
      id: 'context7',
      section: 'thirdParty',
      name: 'Context7',
      product: 'Upstash / library documentation',
      mcpUrl: 'https://mcp.context7.com/mcp',
      summary:
        'Up-to-date, version-specific library and framework documentation and code examples for LLM clients (resolve library ID, query docs).',
      useCases: [
        'Fetch current API docs for a package before coding',
        'Reduce hallucinated APIs in agent-generated code',
        'Compare patterns across framework versions',
      ],
      configNotes:
        'Remote: CONTEXT7_API_KEY header (from context7.com). Alternate stdio: npx -y @upstash/context7-mcp. Cursor marketplace plugin available.',
      docUrl: 'https://github.com/upstash/context7',
      docLabel: 'Context7 on GitHub',
    },
    {
      id: 'snowflake',
      section: 'thirdParty',
      name: 'Snowflake (managed MCP)',
      product: 'Snowflake Cortex',
      mcpUrl:
        'https://<account>.snowflakecomputing.com/api/v2/databases/<db>/schemas/<schema>/mcp-servers/<server_name>',
      summary:
        'Snowflake-managed MCP server in your account: Cortex Search, Cortex Analyst, SQL execution, Cortex Agents, and custom UDF/stored-procedure tools (per server definition).',
      useCases: [
        'Query or explore Snowflake data from the IDE agent',
        'Use Cortex Analyst or Search without leaving Cursor',
        'Invoke governed custom tools exposed on your MCP server',
      ],
      configNotes:
        'Per-account URL; authenticate with Programmatic Access Token (PAT) via Authorization: Bearer. Set SNOWFLAKE_MCP_SERVER_URL and SNOWFLAKE_PAT_TOKEN in env for ~/.cursor/mcp.json.',
      docUrl: 'https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp',
      docLabel: 'Snowflake MCP docs',
    },
    {
      id: 'github',
      section: 'thirdParty',
      name: 'GitHub',
      product: 'GitHub Copilot MCP',
      mcpUrl: 'https://api.githubcopilot.com/mcp/',
      summary:
        'GitHub-hosted remote MCP: repositories, issues, pull requests, code search, releases, and related workflows (toolsets configurable).',
      useCases: [
        'Review PRs and CI status from conversation',
        'Search code and issues across org repos',
        'Create branches, issues, or comments without leaving the editor',
      ],
      configNotes:
        'Authorization: Bearer <GitHub PAT> in headers. Read-only variant: …/mcp/readonly. Optional X-MCP-Toolsets header to limit tools.',
      docUrl: 'https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server',
      docLabel: 'GitHub MCP setup',
    },
    {
      id: 'postman',
      section: 'thirdParty',
      name: 'Postman',
      product: 'Postman API platform',
      mcpUrl: 'https://mcp.postman.com/minimal',
      summary:
        'Postman-hosted MCP for collections, environments, workspaces, and API specs. Modes: minimal (core ops), code (search + client codegen), full (100+ API tools).',
      useCases: [
        'Sync OpenAPI or backend code into Postman collections',
        'Update environment variables from agent prompts',
        'Generate client code and API documentation',
      ],
      configNotes:
        'Authorization: Bearer <Postman API key>. Alternate URLs: https://mcp.postman.com/code and https://mcp.postman.com/mcp (EU: mcp.eu.postman.com). Stdio: npx @postman/postman-mcp-server.',
      docUrl: 'https://learning.postman.com/docs/developer/postman-api/postman-mcp-server/overview/',
      docLabel: 'Postman MCP overview',
    },
    {
      id: 'miro',
      section: 'thirdParty',
      name: 'Miro',
      product: 'Miro boards',
      mcpUrl: 'https://mcp.miro.com/',
      summary:
        'Miro-hosted MCP: read board content from URLs you provide and use it as context for diagrams, docs, tables, and app scaffolding in Cursor.',
      useCases: [
        'Ground architecture prompts in an existing Miro board',
        'Generate diagrams or specs from workshop boards',
        'Collaboration workflows with board-linked context',
      ],
      configNotes:
        'OAuth via Miro when connecting in Cursor (Tools & MCP). Official Cursor marketplace plugin recommended. Server id often plugin-miro-miro.',
      docUrl: 'https://developers.miro.com/docs/miro-mcp',
      docLabel: 'Miro MCP docs',
    },
    {
      id: 'atlassian',
      section: 'thirdParty',
      name: 'Atlassian Rovo MCP',
      product: 'Jira, Confluence, Compass',
      mcpUrl: 'https://mcp.atlassian.com/v1/mcp/authv2',
      summary:
        'Atlassian Cloud bridge for Jira, Confluence, and Compass: search, read, and create/update work items with OAuth 2.1 (respects existing site permissions).',
      useCases: [
        'Summarize or update Jira issues from the IDE',
        'Create or edit Confluence pages from prompts',
        'Link delivery work to architecture notes in Cursor',
      ],
      configNotes:
        'OAuth on connect. Legacy SSE endpoint deprecated Jun 2026 — use authv2 URL above. Older Cursor: npx mcp-remote@latest https://mcp.atlassian.com/v1/mcp/authv2.',
      docUrl: 'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/',
      docLabel: 'Atlassian Rovo MCP',
    },
    {
      id: 'firebase',
      section: 'thirdParty',
      name: 'Firebase',
      product: 'Google Firebase',
      mcpUrl: 'N/A (stdio)',
      summary:
        'Firebase CLI experimental MCP: deploy status, project/app management, security rules, SDK config, and Firebase developer knowledge search (uses local Firebase CLI auth).',
      useCases: [
        'Deploy or check hosting/functions from the agent',
        'List Firebase projects and apps in a lab account',
        'Look up Firebase docs without leaving the editor',
      ],
      configNotes:
        'stdio only: command npx, args ["-y", "firebase-tools@latest", "experimental:mcp"]. Same auth as firebase login on your machine. This repo ships a sample in .cursor/mcp.json.',
      docUrl: 'https://firebase.google.com/docs/cli/mcp-server',
      docLabel: 'Firebase MCP (CLI)',
    },
  ];

  const SECTION_META = [
    {
      section: 'lab',
      tbodyId: 'mcpTableBodyLab',
      cardsId: 'mcpCardsLab',
      emptyId: 'mcpEmptyLab',
    },
    {
      section: 'adobe',
      tbodyId: 'mcpTableBodyAdobe',
      cardsId: 'mcpCardsAdobe',
      emptyId: 'mcpEmptyAdobe',
    },
    {
      section: 'thirdParty',
      tbodyId: 'mcpTableBodyThirdParty',
      cardsId: 'mcpCardsThirdParty',
      emptyId: 'mcpEmptyThirdParty',
    },
  ];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function useCasesHtml(items) {
    if (!items.length) return '—';
    return (
      '<ul class="mcp-use-list">' +
      items.map(function (u) {
        return '<li>' + escapeHtml(u) + '</li>';
      }).join('') +
      '</ul>'
    );
  }

  function docLinkHtml(entry) {
    if (!entry.docUrl) return '';
    return (
      '<a class="mcp-doc-link" href="' +
      escapeHtml(entry.docUrl) +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(entry.docLabel || 'Documentation') +
      '</a>'
    );
  }

  function mcpUrlHtml(entry) {
    const url = entry.mcpUrl;
    if (!url) return '—';
    if (url.indexOf('N/A') === 0) {
      return '<span class="mcp-url-na">' + escapeHtml(url) + '</span>';
    }
    if (url.indexOf('https://') === 0 && url.indexOf('<') === -1) {
      const link =
        '<a class="mcp-url-link" href="' +
        escapeHtml(url) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(url) +
        '</a>';
      if (entry.section !== 'lab') return link;
      return (
        link +
        '<div class="mcp-url-actions">' +
        '<button type="button" class="mcp-copy-action" data-mcp-copy="url" data-server-id="' +
        escapeHtml(entry.id) +
        '">Copy URL</button>' +
        '<button type="button" class="mcp-copy-action" data-mcp-copy="config" data-server-id="' +
        escapeHtml(entry.id) +
        '">Copy Coworker config</button>' +
        '</div>'
      );
    }
    return '<span class="mcp-url-plain">' + escapeHtml(url) + '</span>';
  }

  function matchesFilter(entry, query) {
    if (!query) return true;
    const hay = [
      entry.id,
      entry.section,
      entry.name,
      entry.product,
      entry.mcpUrl,
      entry.summary,
      entry.configNotes,
      entry.useCases.join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function coworkerConfig(entry) {
    const placeholder = '<paste your key — shown only at generate/rotate>';
    const config = {};
    config[entry.id] = {
      type: 'streamable-http',
      url: entry.mcpUrl,
      headers: {
        'X-AEP-Lab-Mcp-Key': placeholder,
      },
    };
    return JSON.stringify(config, null, 2);
  }

  function setCopyStatus(message) {
    const status = document.getElementById('mcpConnectionCopyStatus');
    if (!status) return;
    status.textContent = message || '';
    clearTimeout(setCopyStatus._timer);
    if (message) {
      setCopyStatus._timer = setTimeout(function () {
        status.textContent = '';
      }, 2500);
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied ? Promise.resolve() : Promise.reject(new Error('Copy failed'));
  }

  function onCatalogClick(event) {
    const button = event.target.closest('[data-mcp-copy]');
    if (!button) return;
    const entry = MCP_SERVERS.find(function (candidate) {
      return candidate.id === button.getAttribute('data-server-id');
    });
    if (!entry) return;
    const action = button.getAttribute('data-mcp-copy');
    const text = action === 'config' ? coworkerConfig(entry) : entry.mcpUrl;
    copyText(text)
      .then(function () {
        const defaultLabel = action === 'config' ? 'Copy Coworker config' : 'Copy URL';
        button.textContent = 'Copied';
        setCopyStatus(entry.name + (action === 'config' ? ' config copied — paste your generated key into the placeholder.' : ' URL copied.'));
        setTimeout(function () {
          button.textContent = defaultLabel;
        }, 1500);
      })
      .catch(function () {
        setCopyStatus('Copy failed — select and copy the endpoint manually.');
      });
  }

  function rowHtml(entry) {
    return (
      '<tr data-server-id="' +
      escapeHtml(entry.id) +
      '">' +
      '<td><span class="mcp-server-name">' +
      escapeHtml(entry.name) +
      '</span><span class="mcp-server-id">' +
      escapeHtml(entry.id) +
      '</span></td>' +
      '<td>' +
      escapeHtml(entry.product) +
      '</td>' +
      '<td class="mcp-url-cell">' +
      mcpUrlHtml(entry) +
      '</td>' +
      '<td>' +
      escapeHtml(entry.summary) +
      docLinkHtml(entry) +
      '</td>' +
      '<td>' +
      useCasesHtml(entry.useCases) +
      '</td>' +
      '<td><div class="mcp-config-notes">' +
      escapeHtml(entry.configNotes) +
      '</div></td>' +
      '</tr>'
    );
  }

  function cardHtml(entry) {
    return (
      '<article class="mcp-card" data-server-id="' +
      escapeHtml(entry.id) +
      '">' +
      '<div class="mcp-card-header">' +
      '<h4>' +
      escapeHtml(entry.name) +
      '</h4>' +
      '</div>' +
      '<dl class="mcp-card-dl">' +
      '<div><dt>Product</dt><dd>' +
      escapeHtml(entry.product) +
      '</dd></div>' +
      '<div><dt>MCP server URL</dt><dd>' +
      mcpUrlHtml(entry) +
      '</dd></div>' +
      '<div><dt>What it does</dt><dd>' +
      escapeHtml(entry.summary) +
      ' ' +
      docLinkHtml(entry) +
      '</dd></div>' +
      '<div><dt>Use cases</dt><dd>' +
      useCasesHtml(entry.useCases) +
      '</dd></div>' +
      '<div><dt>Config notes</dt><dd class="mcp-config-notes">' +
      escapeHtml(entry.configNotes) +
      '</dd></div>' +
      '</dl>' +
      '</article>'
    );
  }

  function renderSection(meta, entries) {
    const tbody = document.getElementById(meta.tbodyId);
    const cards = document.getElementById(meta.cardsId);
    const emptyEl = document.getElementById(meta.emptyId);
    if (!tbody || !cards) return;

    const hasRows = entries.length > 0;
    tbody.innerHTML = hasRows
      ? entries.map(rowHtml).join('')
      : '<tr><td colspan="6">No servers match your filter.</td></tr>';
    cards.innerHTML = hasRows
      ? entries.map(cardHtml).join('')
      : '<p class="mcp-status-text">No servers match your filter.</p>';

    if (emptyEl) {
      emptyEl.hidden = hasRows;
    }
  }

  function updateCount(filtered) {
    const countEl = document.getElementById('mcpCount');
    if (!countEl) return;

    const total = MCP_SERVERS.length;
    const shown = filtered.length;
    const labTotal = MCP_SERVERS.filter(function (e) {
      return e.section === 'lab';
    }).length;
    const adobeTotal = MCP_SERVERS.filter(function (e) {
      return e.section === 'adobe';
    }).length;
    const thirdTotal = MCP_SERVERS.filter(function (e) {
      return e.section === 'thirdParty';
    }).length;
    const labShown = filtered.filter(function (e) {
      return e.section === 'lab';
    }).length;
    const adobeShown = filtered.filter(function (e) {
      return e.section === 'adobe';
    }).length;
    const thirdShown = filtered.filter(function (e) {
      return e.section === 'thirdParty';
    }).length;

    if (shown === total) {
      countEl.textContent =
        shown +
        ' servers (Lab ' +
        labTotal +
        ', Adobe ' +
        adobeTotal +
        ', Third party ' +
        thirdTotal +
        ')';
      return;
    }

    countEl.textContent =
      shown +
      ' of ' +
      total +
      ' servers (Lab ' +
      labShown +
      '/' +
      labTotal +
      ', Adobe ' +
      adobeShown +
      '/' +
      adobeTotal +
      ', Third party ' +
      thirdShown +
      '/' +
      thirdTotal +
      ')';
  }

  function render(filtered) {
    SECTION_META.forEach(function (meta) {
      const sectionEntries = filtered.filter(function (entry) {
        return entry.section === meta.section;
      });
      renderSection(meta, sectionEntries);
    });
    updateCount(filtered);
  }

  function applyFilters() {
    const search = document.getElementById('mcpSearch');
    const q = search && search.value ? search.value.trim().toLowerCase() : '';
    const filtered = MCP_SERVERS.filter(function (entry) {
      return matchesFilter(entry, q);
    });
    render(filtered);
  }

  function init() {
    const search = document.getElementById('mcpSearch');
    if (search) search.addEventListener('input', applyFilters);
    const catalog = document.querySelector('.mcp-catalog-panel');
    if (catalog) catalog.addEventListener('click', onCatalogClick);
    applyFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
