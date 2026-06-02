/**
 * MCP servers reference — renders catalog from static data (no secrets).
 */
(function () {
  'use strict';

  /**
   * @type {Array<{
   *   id: string;
   *   section: 'adobe' | 'thirdParty';
   *   name: string;
   *   product: string;
   *   mcpUrl: string;
   *   summary: string;
   *   useCases: string[];
   *   configNotes: string;
   *   docUrl?: string;
   *   docLabel?: string;
   * }>}
   */
  const MCP_SERVERS = [
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
        'streamable-http — interactive OAuth on first tool use. Requires Target license and appropriate Admin Console role.',
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
        'Headers X-Marketo-Client-Id, X-Marketo-Client-Secret, X-Marketo-Munchkin-Id (use secrets locally, never commit).',
      docUrl: 'https://experienceleague.adobe.com/docs/marketo-developer/marketo/mcp-server.html',
      docLabel: 'Marketo MCP server',
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
      return (
        '<a class="mcp-url-link" href="' +
        escapeHtml(url) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(url) +
        '</a>'
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
    const adobeTotal = MCP_SERVERS.filter(function (e) {
      return e.section === 'adobe';
    }).length;
    const thirdTotal = total - adobeTotal;
    const adobeShown = filtered.filter(function (e) {
      return e.section === 'adobe';
    }).length;
    const thirdShown = shown - adobeShown;

    if (shown === total) {
      countEl.textContent =
        shown + ' servers (Adobe ' + adobeTotal + ', Third party ' + thirdTotal + ')';
      return;
    }

    countEl.textContent =
      shown +
      ' of ' +
      total +
      ' servers (Adobe ' +
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
    applyFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
