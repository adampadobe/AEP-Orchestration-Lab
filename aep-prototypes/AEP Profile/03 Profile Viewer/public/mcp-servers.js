/**
 * MCP servers reference — renders catalog from static data (no secrets).
 */
(function () {
  'use strict';

  /** @typedef {'repo'|'lab'|'typical'|'documented'} McpStatusKind */

  /**
   * @type {Array<{
   *   id: string;
   *   name: string;
   *   product: string;
   *   status: McpStatusKind;
   *   summary: string;
   *   useCases: string[];
   *   configNotes: string;
   *   docUrl?: string;
   *   docLabel?: string;
   * }>}
   */
  const MCP_SERVERS = [
    {
      id: 'firebase',
      name: 'Firebase',
      product: 'Firebase / lab deploy',
      status: 'repo',
      summary:
        'Official Firebase MCP via firebase-tools. Inspect and operate Firebase projects (hosting, functions, config) from Cursor using the same CLI auth as local deploy.',
      useCases: [
        'Ask about hosting rewrites or function exports before deploy',
        'Debug Firebase project configuration from the agent',
      ],
      configNotes:
        'Committed in this repo: .cursor/mcp.json — command npx -y firebase-tools@latest experimental:mcp. Uses firebase login / ADC on your machine.',
      docUrl: 'https://cursor.com/docs/mcp',
      docLabel: 'Cursor MCP docs',
    },
    {
      id: 'aep-lab-adobe',
      name: 'AEP lab Adobe (stdio)',
      product: 'AEP Orchestration Lab',
      status: 'lab',
      summary:
        'Local stdio MCP in tools/aep-lab-adobe-mcp/: IMS auth plus platform.adobe.io proxy, sandbox list, AJO name lookups, Adobe Tags (Reactor), and Edge interact — same service modules as Cloud Functions.',
      useCases: [
        'aep_platform_request to any platform.adobe.io path (like /api/aep)',
        'List sandboxes, Tags companies/properties/rules, Edge datastreams',
        'Resolve journey, campaign, or decisioning display names',
        'Send Edge interact experience events for demos',
      ],
      configNotes:
        'Not in .cursor/mcp.json by default. Add a stdio server pointing at npm run mcp:aep-lab-adobe (or node tools/aep-lab-adobe-mcp/src/server.mjs). Env: ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES; optional ADOBE_SANDBOX_NAME. Optional gitignored tools/aep-lab-adobe-mcp/.env.mcp.',
      docUrl: 'https://github.com/adampadobe/AEP-Orchestration-Lab/blob/main/docs/AJO_CONTENT_TEMPLATE_API.md',
      docLabel: 'Lab MCP notes (AJO doc)',
    },
    {
      id: 'aep',
      name: 'AEP / Marketing Agent',
      product: 'Adobe Experience Platform',
      status: 'typical',
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
      name: 'Adobe Analytics',
      product: 'Adobe Analytics',
      status: 'typical',
      summary:
        'Adobe-hosted MCP for Analytics: query metrics, explore trends, build segments, and manage components from natural language in Cursor.',
      useCases: [
        'List report suites and components',
        'Run analysis-style questions without opening Workspace',
        'Segment and calculated metric discovery',
      ],
      configNotes:
        'Cursor: streamable-http URL https://mcp-gateway.adobe.io/aa/mcp — Settings → Tools & MCP → Connect → Adobe ID. Server id often user-aa.',
      docUrl: 'https://developer.adobe.com/analytics-mcp/docs/',
      docLabel: 'Analytics MCP docs',
    },
    {
      id: 'cja',
      name: 'Customer Journey Analytics',
      product: 'Customer Journey Analytics',
      status: 'typical',
      summary:
        'Adobe-hosted MCP for CJA: data views, dimensions, segments, and Analysis Workspace–style workflows via agent prompts (requires CJA access and Data Mirror where applicable).',
      useCases: [
        'List data views and explore schema',
        'Build or refine segments from conversation',
        'Accelerate report and component authoring',
      ],
      configNotes:
        'Cursor: streamable-http URL https://mcp-gateway.adobe.io/cja/mcp — OAuth connect in Tools & MCP. Server id often user-cja.',
      docUrl: 'https://developer.adobe.com/analytics-mcp/docs/',
      docLabel: 'Analytics & CJA MCP docs',
    },
    {
      id: 'target',
      name: 'Adobe Target',
      product: 'Adobe Target',
      status: 'typical',
      summary:
        'Adobe-hosted Target MCP (Public Beta): read-only tools for activities, audiences, offers, mboxes, properties, and A/B or XT reporting.',
      useCases: [
        'List active activities and audiences',
        'Pull A/B or XT performance reports in conversation',
        'Explore mboxes, environments, and properties',
      ],
      configNotes:
        'streamable-http https://targetmcp.adobe.io/mcp — interactive OAuth on first tool use. Requires Target license and appropriate Admin Console role.',
      docUrl: 'https://experienceleague.adobe.com/docs/target/using/mcp/target-mcp-get-started.html',
      docLabel: 'Target MCP get started',
    },
    {
      id: 'aem',
      name: 'Adobe Experience Manager',
      product: 'AEM as a Cloud Service',
      status: 'typical',
      summary:
        'AEM MCP HTTP endpoints for content, assets, and development operations (readonly and fuller servers). AI clients discover tools and call them with Adobe OAuth governance.',
      useCases: [
        'Search or read pages and content fragments',
        'Asset and content operations from Cursor (per server permissions)',
        'AEM development workflows with governed write tools',
      ],
      configNotes:
        'Add AEM MCP base URLs under https://mcp.adobeaemcloud.com/adobe/mcp/ (e.g. content-readonly). Authenticate with Adobe ID when prompted. Server id often user-aem.',
      docUrl: 'https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/ai-in-aem/mcp-support/using-mcp-with-aem-as-a-cloud-service.html',
      docLabel: 'AEM MCP overview',
    },
    {
      id: 'express-developer',
      name: 'Adobe Express Developer',
      product: 'Adobe Express add-ons',
      status: 'typical',
      summary:
        'stdio MCP package @adobe/express-developer-mcp: semantic search over add-on docs plus official TypeScript definitions to reduce hallucinations when building Express add-ons.',
      useCases: [
        'Grounded answers on add-on APIs and architecture',
        'Fetch typedefinitions for accurate completions',
        'Debug add-on code with current documentation context',
      ],
      configNotes:
        'command npx, args ["-y", "@adobe/express-developer-mcp@latest"] in global or project mcp.json. Node 18+. Replaces deprecated @adobe/express-add-on-dev-mcp.',
      docUrl: 'https://developer.adobe.com/express/add-ons/docs/guides/getting-started/local-development/mcp-server',
      docLabel: 'Express Developer MCP setup',
    },
    {
      id: 'marketo',
      name: 'Marketo Engage',
      product: 'Adobe Marketo Engage',
      status: 'documented',
      summary:
        'Hosted Marketo MCP with 100+ operations across programs, smart campaigns, leads, forms, emails, snippets, and folders. Credentials supplied per request via headers (not stored by Adobe MCP server).',
      useCases: [
        'List or update programs and campaigns from the agent',
        'Lead and list operations without custom scripts',
        'Email and snippet discovery',
      ],
      configNotes:
        'https://marketo-mcp.adobe.io/mcp — headers X-Marketo-Client-Id, X-Marketo-Client-Secret, X-Marketo-Munchkin-Id (use secrets locally, never commit).',
      docUrl: 'https://experienceleague.adobe.com/docs/marketo-developer/marketo/mcp-server.html',
      docLabel: 'Marketo MCP server',
    },
    {
      id: 'app-builder-mcp',
      name: 'Custom MCP on App Builder',
      product: 'Adobe I/O App Builder',
      status: 'documented',
      summary:
        'Pattern for hosting your own MCP server on Adobe I/O Runtime with OAuth S2S to Experience Cloud APIs — secure intermediary so IDE clients do not hold org secrets.',
      useCases: [
        'Team-specific tools over Analytics, AEM, Assets, or internal APIs',
        'Serverless MCP endpoints with Adobe-managed scaling',
      ],
      configNotes:
        'Build with @modelcontextprotocol/sdk; deploy via aio app deploy. Connect Cursor to the published web MCP URL. See Adobe App Builder AI use cases guide.',
      docUrl: 'https://developer.adobe.com/app-builder/docs/resources/ai-use-cases',
      docLabel: 'App Builder AI & MCP',
    },
  ];

  const STATUS_LABELS = {
    repo: { text: 'In this repo', className: 'mcp-badge--repo' },
    lab: { text: 'Lab package', className: 'mcp-badge--lab' },
    typical: { text: 'Typical Cursor setup', className: 'mcp-badge--typical' },
    documented: { text: 'Adobe documented', className: 'mcp-badge--docs' },
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function badgeHtml(status) {
    const meta = STATUS_LABELS[status] || STATUS_LABELS.documented;
    return '<span class="mcp-badge ' + meta.className + '">' + escapeHtml(meta.text) + '</span>';
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

  function matchesFilter(entry, query, statusFilter) {
    if (statusFilter && entry.status !== statusFilter) return false;
    if (!query) return true;
    const hay = [
      entry.id,
      entry.name,
      entry.product,
      entry.summary,
      entry.configNotes,
      entry.useCases.join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function render(entries) {
    const tbody = document.getElementById('mcpTableBody');
    const cards = document.getElementById('mcpCards');
    const countEl = document.getElementById('mcpCount');
    if (!tbody || !cards) return;

    if (countEl) {
      countEl.textContent =
        entries.length === MCP_SERVERS.length
          ? entries.length + ' servers'
          : entries.length + ' of ' + MCP_SERVERS.length + ' servers';
    }

    if (!entries.length) {
      tbody.innerHTML =
        '<tr><td colspan="6">No servers match your filter.</td></tr>';
      cards.innerHTML = '<p class="mcp-status-text">No servers match your filter.</p>';
      return;
    }

    tbody.innerHTML = entries
      .map(function (entry) {
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
          '<td>' +
          badgeHtml(entry.status) +
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
      })
      .join('');

    cards.innerHTML = entries
      .map(function (entry) {
        return (
          '<article class="mcp-card" data-server-id="' +
          escapeHtml(entry.id) +
          '">' +
          '<div class="mcp-card-header">' +
          '<h4>' +
          escapeHtml(entry.name) +
          '</h4>' +
          badgeHtml(entry.status) +
          '</div>' +
          '<dl class="mcp-card-dl">' +
          '<div><dt>Product</dt><dd>' +
          escapeHtml(entry.product) +
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
      })
      .join('');
  }

  function applyFilters() {
    const search = document.getElementById('mcpSearch');
    const status = document.getElementById('mcpStatusFilter');
    const q = search && search.value ? search.value.trim().toLowerCase() : '';
    const st = status && status.value ? status.value : '';
    const filtered = MCP_SERVERS.filter(function (entry) {
      return matchesFilter(entry, q, st);
    });
    render(filtered);
  }

  function init() {
    const search = document.getElementById('mcpSearch');
    const status = document.getElementById('mcpStatusFilter');
    if (search) search.addEventListener('input', applyFilters);
    if (status) status.addEventListener('change', applyFilters);
    applyFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
