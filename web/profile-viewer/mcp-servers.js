/**
 * MCP servers reference — renders catalog from static data (no secrets).
 */
(function () {
  'use strict';

  /**
   * @type {Array<{
   *   id: string;
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
    if (url.indexOf('https://') === 0) {
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
      })
      .join('');
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
