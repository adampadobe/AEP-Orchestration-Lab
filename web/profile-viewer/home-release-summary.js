/**
 * Experience Cloud release summary panel for home-new.html.
 * Reads GET /api/release-notes/summary when deployed; falls back to bundled sample data.
 */
(function attachHomeReleaseSummary(global) {
  'use strict';

  var API_PATH = '/api/release-notes/summary';
  var PRODUCT_ORDER = [
    'cdp',
    'ajo',
    'cja',
    'campaign',
    'brandConcierge',
    'brandVisibility',
    'target',
  ];
  var COMPACT_LIMIT = 8;

  var SAMPLE_DATA = {
    period: 'June 2026',
    fetchedAt: '2026-06-19T14:32:00.000Z',
    sourceUrl: 'https://experienceleague.adobe.com/en/docs/release-notes/experience-cloud/current',
    products: {
      cdp: {
        id: 'cdp',
        name: 'Real-Time CDP',
        shortName: 'CDP',
        releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/experience-platform/release-notes/latest',
        highlights: [
          { title: 'When to Activate', body: 'Control which profile change types trigger destination exports.', badge: 'Beta' },
          { title: 'Azure Private Link', body: 'Route exports to Azure Blob, ADLS Gen2, and Event Hubs over private IPs.', badge: 'GA' },
          { title: 'Persistent Split', body: 'Persistent vs random percentage splits in Audience Composition.', badge: 'GA' },
          { title: 'LAVA Source', body: 'Ingest loyalty and engagement data into Real-Time Customer Profile.', badge: 'GA' },
          { title: 'Schema Inventory Enhancements', body: 'Metadata columns, filtering, tags, folders, and inline management actions.', badge: 'GA' },
          { title: 'Google Ad Manager 360', body: 'Destination moved from beta to generally available.', badge: 'GA' },
          { title: 'Export Arrays as Enrichment', body: 'Export array fields to cloud storage as separate JSON or Parquet columns.', badge: 'Beta' },
          { title: 'Auto-Disable Failed Dataflows', body: 'Sources failing continuously for 30 days are automatically disabled.', badge: 'GA' },
        ],
        sections: [
          {
            title: 'Destinations & Activation',
            items: [
              { title: 'When to Activate', body: 'Control which profile change types trigger exports: attribute changes, audience qualifications, identity changes.', badge: 'Beta' },
              { title: 'Azure Private Link', body: 'Route exports to Azure Blob, ADLS Gen2, and Event Hubs over private IPs.', badge: 'GA' },
              { title: 'Google Ad Manager 360', body: 'Destination moved from beta to GA.', badge: 'GA' },
            ],
          },
          {
            title: 'Data, Profiles & Operations',
            items: [
              { title: 'Persistent Split', body: 'Choose persistent or random percentage splits in Audience Composition.', badge: 'GA' },
              { title: 'LAVA Source', body: 'Ingest loyalty and engagement data from LAVA into Real-Time Customer Profile.', badge: 'GA' },
              { title: 'Schema Inventory Enhancements', body: 'Metadata columns, enhanced filtering, tags, folders, and inline management.', badge: 'GA' },
            ],
          },
        ],
      },
      ajo: {
        id: 'ajo',
        name: 'Journey Optimizer',
        shortName: 'AJO',
        releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/journey-optimizer/using/release-notes/release-notes',
        highlights: [
          { title: 'Journey Fragments', body: 'Reusable node sets insertable across any journey.', badge: 'GA' },
          { title: '200 Live Journey Limit', body: 'Doubled from 100; rolling out June 18, 2026.', badge: 'GA' },
          { title: 'AEP Datasets in Decisioning', body: 'Leverage AEP datasets in offer capping rules.', badge: 'Beta' },
          { title: 'Estimated Clicks Metric', body: 'Filters bot and NHI traffic for genuine engagement reporting.', badge: 'GA' },
          { title: 'AI Assistant for Expressions', body: 'Describe logic in plain language to auto-generate journey expressions.', badge: 'Beta' },
          { title: 'Certificate-Based Custom Auth', body: 'JWT client assertion via Adobe-managed cert for enterprise APIs.', badge: 'GA' },
          { title: 'Webhook Support for API Campaigns', body: 'Configure webhook URL for real-time per-message status updates.', badge: 'GA' },
          { title: 'LINE Channel', body: 'Multiple formats, real-time previews, grouped messages up to five.', badge: 'Soon' },
        ],
        sections: [
          {
            title: 'Journeys & Decisioning',
            items: [
              { title: 'Journey Fragments', body: 'Reusable eligibility checks, routing logic, and welcome sequences across journeys.', badge: 'GA' },
              { title: 'AEP Datasets in Decisioning', body: 'Leverage AEP datasets in offer capping rules.', badge: 'Beta' },
              { title: 'AEM Content Fragments in Decisioning', body: 'Map AEM fragments to decision items in decision policies.', badge: 'GA' },
            ],
          },
          {
            title: 'Content & Channels',
            items: [
              { title: 'Automated Technical Validation', body: 'Checks for unsupported HTML/CSS, Outlook issues, and Gmail size thresholds.', badge: 'GA' },
              { title: 'Estimated Clicks Metric', body: 'Genuine engagement view across Journeys, Campaigns, and Channel reports.', badge: 'GA' },
            ],
          },
        ],
      },
      cja: {
        id: 'cja',
        name: 'Customer Journey Analytics',
        shortName: 'CJA',
        releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/analytics-platform/using/releases/release-notes',
        highlights: [
          { title: 'Journey Canvas Enhancements', body: 'Exclude nodes; create segments and audiences from fallout data.', badge: 'GA' },
          { title: 'Mobile App Support', body: 'Content Analytics for iOS and Android image assets.', badge: 'GA' },
          { title: 'Analytics MCP Servers', body: 'Connect MCP clients to CJA for agentic workflows.', badge: 'GA' },
          { title: 'Data Mirror', body: 'Model-based schemas and CDC for Snowflake, Databricks, and BigQuery.', badge: 'Beta' },
          { title: 'Analyze AEP Audiences in CJA', body: 'Ingest audience membership from AEP Profile datasets.', badge: 'GA' },
          { title: 'Bulk Project Migration', body: 'Migrate up to 20 Adobe Analytics projects to CJA at once.', badge: 'GA' },
          { title: 'Real-Time Reporting', body: 'Data and visualizations update in real time within Analysis Workspace.', badge: 'GA' },
          { title: 'Attribution IQ', body: 'Improved drag-and-drop, redesigned tooltips, and click-to-analyze menu.', badge: 'GA' },
        ],
        sections: [
          {
            title: 'Analysis Workspace',
            items: [
              { title: 'Journey Canvas Enhancements', body: 'Exclude nodes; use fallout data to create segments, trends, audiences, and breakdowns.', badge: 'GA' },
              { title: 'Attribution IQ', body: 'Improved drag-and-drop and redesigned tooltips for touchpoint analysis.', badge: 'GA' },
            ],
          },
          {
            title: 'Data & Migration',
            items: [
              { title: 'Analyze AEP Audiences in CJA', body: 'Ingest audience membership data from AEP Profile datasets.', badge: 'GA' },
              { title: 'Bulk Project Migration', body: 'Migrate up to 20 AA projects to CJA at once.', badge: 'GA' },
            ],
          },
        ],
      },
      campaign: {
        id: 'campaign',
        name: 'Adobe Campaign',
        shortName: 'Campaign',
        releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/campaign/campaign-v8/releases/release-notes',
        highlights: [
          { title: 'Multilingual Delivery', body: 'Multiple languages and CSV bulk upload for variants in Web UI.', badge: 'GA' },
          { title: 'Profile Enrichment', body: 'Link Campaign DB fields to transactional messages for personalization.', badge: 'GA' },
          { title: 'Debian 13 + PostgreSQL 17', body: 'Infrastructure modernization in build 8.9.2 (May 2026).', badge: 'Infra' },
          { title: 'Campaign Classic v7.4.3', body: 'Security updates and mandatory Client Console upgrade.', badge: 'Fix' },
          { title: 'Content Experiments / A/B', body: 'Test subject lines, sender names, and email body variants.', badge: 'GA' },
          { title: 'AEM Live & Language Copies', body: 'Access AEM copies directly in Campaign with real-time content refresh.', badge: 'GA' },
          { title: 'Snowflake & Databricks OAuth2', body: 'Modern OAuth2 authentication for federated data access.', badge: 'GA' },
          { title: 'Campaign Standard 26.2', body: 'IMS login reliability and dynamic reporting robustness improvements.', badge: 'Fix' },
        ],
        sections: [
          {
            title: 'Campaign v8 Web UI',
            items: [
              { title: 'Multilingual Delivery', body: 'Multiple languages, CSV bulk upload, and rich push notification support.', badge: 'GA' },
              { title: 'Content Experiments / A/B Testing', body: 'Test subject lines, sender names, and email body variants.', badge: 'GA' },
            ],
          },
          {
            title: 'Classic v7 & Standard',
            items: [
              { title: 'Campaign Classic v7.4.3', body: 'Latest GA build with security fixes; Client Console upgrade mandatory.', badge: 'Fix' },
              { title: 'Campaign Standard 26.2', body: 'IMS login reliability and dynamic reporting improvements.', badge: 'Fix' },
            ],
          },
        ],
      },
      brandConcierge: {
        id: 'brandConcierge',
        name: 'Brand Concierge',
        shortName: 'Concierge',
        releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/brand-concierge/using/release-notes',
        highlights: [
          { title: 'Real-Time CDP Integration', body: 'Connect Brand Concierge with Real-Time CDP for profile-aware conversations.', badge: 'GA' },
          { title: 'Self-Serve Tuning Enhancement', body: 'Fine-tune concierge responses without engineering support.', badge: 'GA' },
          { title: 'Context-Aware Product Recommendation', body: 'Recommend products using live session and profile context.', badge: 'GA' },
          { title: 'Side-by-Side Comparison', body: 'Compare product options within the concierge experience.', badge: 'GA' },
          { title: 'Support Agent', body: 'Troubleshooting and how-to guidance surfaced in chat.', badge: 'GA' },
          { title: 'CX Enterprise Coworker', body: 'Agentic workflows for audiences and campaigns with built-in governance.', badge: 'New' },
          { title: 'Agentic AI Capability Catalog', body: 'Discover agentic AI jobs available in licensed CX Enterprise apps.', badge: 'New' },
          { title: 'AI Monitoring Dashboards', body: 'Track adoption, conversations, feedback, and AI credit consumption.', badge: 'GA' },
        ],
        sections: [
          {
            title: 'Product & Integrations',
            items: [
              { title: 'Real-Time CDP Integration', body: 'Brand Concierge integration with Real-Time CDP for unified personalization.', badge: 'GA' },
              { title: 'Self-Serve Tuning Enhancement', body: 'Operators can tune concierge behaviour without code changes.', badge: 'GA' },
              { title: 'Context-Aware Product Recommendation', body: 'Recommendations informed by session context and profile signals.', badge: 'GA' },
            ],
          },
          {
            title: 'Agentic AI',
            items: [
              { title: 'CX Enterprise Coworker', body: 'Automates end-to-end CX workflows with governance in hours.', badge: 'New' },
              { title: 'AI Monitoring', body: 'Dashboards for agentic AI usage, feedback, and AI credits.', badge: 'GA' },
            ],
          },
        ],
      },
      brandVisibility: {
        id: 'brandVisibility',
        name: 'Brand Visibility',
        shortName: 'Visibility',
        releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/llm-optimizer/using/release-notes',
        highlights: [
          { title: 'Google Analytics Integration', body: 'Connect GA data to measure brand presence in AI surfaces.', badge: 'GA' },
          { title: 'Brand Presence Enhancements', body: 'Richer visibility scoring across generative answer engines.', badge: 'GA' },
          { title: 'Opportunities CSV Export', body: 'Export opportunity findings for offline analysis and reporting.', badge: 'GA' },
          { title: 'LLM Answer Tracking', body: 'Monitor how models cite and summarise your brand over time.', badge: 'Beta' },
          { title: 'Competitive Benchmarks', body: 'Compare share of voice against key competitors in AI responses.', badge: 'Beta' },
          { title: 'Prompt Library Templates', body: 'Starter prompts aligned to vertical use cases and journeys.', badge: 'GA' },
          { title: 'Scheduled Reports', body: 'Email digest of visibility shifts and new opportunities.', badge: 'GA' },
          { title: 'API Access', body: 'Programmatic read access for dashboards and internal tooling.', badge: 'Beta' },
        ],
        sections: [
          {
            title: 'Measurement & Insights',
            items: [
              { title: 'Google Analytics Integration', body: 'Import web analytics to enrich brand visibility scoring.', badge: 'GA' },
              { title: 'Brand Presence Enhancements', body: 'Expanded scoring dimensions for generative search and assistants.', badge: 'GA' },
              { title: 'Opportunities CSV Export', body: 'Export opportunity lists for sharing with SEO and content teams.', badge: 'GA' },
            ],
          },
          {
            title: 'Operations',
            items: [
              { title: 'Scheduled Reports', body: 'Automated email summaries of visibility changes.', badge: 'GA' },
              { title: 'API Access', body: 'REST endpoints for internal reporting integrations.', badge: 'Beta' },
            ],
          },
        ],
      },
      target: {
        id: 'target',
        name: 'Adobe Target',
        shortName: 'Target',
        releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/target/using/release-notes/release-notes',
        highlights: [
          { title: 'Activity Overview URL Fix', body: 'Incomplete activity URL on Activity Overview resolved.', badge: 'Fix' },
          { title: 'Localized Activity Reports', body: 'Date formats in Activity reports now respect locale settings.', badge: 'Fix' },
          { title: 'Form-based Activity Save', body: 'GB18030 characters in Location no longer block save.', badge: 'Fix' },
          { title: 'Audience Calendar Localization', body: 'Create Audience flow calendar now fully localized.', badge: 'Fix' },
          { title: 'Personalization at Scale', body: 'Improved activity QA workflows for enterprise rollouts.', badge: 'GA' },
          { title: 'Recommendations Diagnostics', body: 'Clearer health signals for catalog and algorithm issues.', badge: 'GA' },
          { title: 'AEP Audience Activation', body: 'Tighter handoff from Real-Time CDP segments to Target activities.', badge: 'GA' },
          { title: 'Admin Role Controls', body: 'Granular permissions for activity publish and archive.', badge: 'GA' },
        ],
        sections: [
          {
            title: 'Activities & Reporting',
            items: [
              { title: 'Activity Overview URL Fix', body: 'Resolves incomplete URLs shown on the Activity Overview screen.', badge: 'Fix' },
              { title: 'Localized Activity Reports', body: 'Unlocalized date formats in Activity reports corrected.', badge: 'Fix' },
            ],
          },
          {
            title: 'Audiences & Integrations',
            items: [
              { title: 'Audience Calendar Localization', body: 'Calendar control localized in the Create Audience flow.', badge: 'Fix' },
              { title: 'AEP Audience Activation', body: 'Activate Real-Time CDP audiences directly in Target activities.', badge: 'GA' },
            ],
          },
        ],
      },
    },
  };

  var state = {
    activeProduct: 'cdp',
    data: null,
    loading: false,
    error: '',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function badgeClass(badge) {
    var map = {
      GA: 'positive',
      Beta: 'notice',
      LA: 'info',
      New: 'info',
      Soon: 'notice',
      Fix: 'neutral',
      Infra: 'neutral',
    };
    return 'home-release-status-badge--' + (map[badge] || 'info');
  }

  function formatFetched(iso) {
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_e) {
      return '—';
    }
  }

  function totalItems(product) {
    return (product.sections || []).reduce(function (n, sec) {
      return n + (sec.items ? sec.items.length : 0);
    }, 0);
  }

  function getProduct(id) {
    return state.data && state.data.products && state.data.products[id];
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderTabs() {
    var tabsEl = document.getElementById('homeReleaseTabs');
    if (!tabsEl || !state.data) return;
    tabsEl.innerHTML = PRODUCT_ORDER.map(function (id) {
      var p = state.data.products[id];
      if (!p) return '';
      var count = totalItems(p);
      var selected = id === state.activeProduct;
      return (
        '<button type="button" class="home-release-sp-tab" role="tab" aria-selected="' +
        (selected ? 'true' : 'false') +
        '" data-product="' +
        esc(id) +
        '">' +
        esc(p.shortName) +
        '<span class="home-release-sp-tab-count">' +
        count +
        '</span></button>'
      );
    }).join('');

    tabsEl.querySelectorAll('.home-release-sp-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeProduct = btn.getAttribute('data-product');
        renderTabs();
        renderCompact();
      });
    });
  }

  function renderCompact() {
    var gridEl = document.getElementById('homeReleaseGrid');
    var footEl = document.getElementById('homeReleaseFootNote');
    if (!gridEl || !state.data) return;
    var p = getProduct(state.activeProduct);
    if (!p) return;

    var items = (p.highlights || []).slice(0, COMPACT_LIMIT);
    gridEl.innerHTML = items
      .map(function (item) {
        return (
          '<article class="home-release-sp-card">' +
          '<div class="home-release-sp-card__head">' +
          '<h4 class="home-release-sp-card__title">' +
          esc(item.title) +
          '</h4>' +
          (item.badge
            ? '<span class="home-release-status-badge ' +
              badgeClass(item.badge) +
              '">' +
              esc(item.badge) +
              '</span>'
            : '') +
          '</div>' +
          '<p class="home-release-sp-card__body">' +
          esc(item.body) +
          '</p>' +
          '</article>'
        );
      })
      .join('');

    var total = totalItems(p);
    if (footEl) {
      footEl.textContent =
        'Showing ' +
        Math.min(COMPACT_LIMIT, (p.highlights || []).length) +
        ' of ' +
        total +
        ' items · ' +
        p.name;
    }
  }

  function renderDrawer() {
    var p = getProduct(state.activeProduct);
    if (!p) return;
    var drawerTitle = document.getElementById('homeReleaseDrawerTitle');
    var sectionsEl = document.getElementById('homeReleaseDrawerSections');
    if (drawerTitle) {
      drawerTitle.innerHTML =
        esc(p.name) +
        ' — <span class="home-release-drawer__title-accent">' +
        esc(state.data.period || '') +
        '</span>';
    }
    setText('homeReleaseDrawerDesc', 'Sourced from Experience League');
    if (!sectionsEl) return;
    sectionsEl.innerHTML = (p.sections || [])
      .map(function (sec) {
        return (
          '<section class="home-release-section">' +
          '<h3 class="home-release-section__title">' +
          esc(sec.title) +
          '</h3>' +
          '<div class="home-release-card-grid">' +
          sec.items
            .map(function (item) {
              return (
                '<article class="home-release-sp-card">' +
                '<div class="home-release-sp-card__head">' +
                '<h4 class="home-release-sp-card__title">' +
                esc(item.title) +
                '</h4>' +
                (item.badge
                  ? '<span class="home-release-status-badge ' +
                    badgeClass(item.badge) +
                    '">' +
                    esc(item.badge) +
                    '</span>'
                  : '') +
                '</div>' +
                '<p class="home-release-sp-card__body">' +
                esc(item.body) +
                '</p>' +
                '</article>'
              );
            })
            .join('') +
          '</div></section>'
        );
      })
      .join('');
  }

  function openDrawer() {
    renderDrawer();
    var drawer = document.getElementById('homeReleaseDrawer');
    var backdrop = document.getElementById('homeReleaseBackdrop');
    if (drawer) {
      drawer.classList.add('home-release-drawer--open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    var drawer = document.getElementById('homeReleaseDrawer');
    var backdrop = document.getElementById('homeReleaseBackdrop');
    if (drawer) {
      drawer.classList.remove('home-release-drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function showLoading() {
    var body = document.getElementById('homeReleasePanelBody');
    if (body) {
      body.innerHTML =
        '<div class="home-release-state" role="status">' +
        '<div class="home-release-state__ring" aria-hidden="true"></div>' +
        'Fetching latest from Experience League…</div>';
    }
  }

  function showError(msg) {
    var alertEl = document.getElementById('homeReleaseAlert');
    if (alertEl) {
      alertEl.hidden = false;
      alertEl.innerHTML =
        '<strong>Could not refresh release notes</strong>' + esc(msg);
    }
  }

  function hideError() {
    var alertEl = document.getElementById('homeReleaseAlert');
    if (alertEl) {
      alertEl.hidden = true;
      alertEl.innerHTML = '';
    }
  }

  function restoreBodyShell() {
    var body = document.getElementById('homeReleasePanelBody');
    if (!body) return;
    body.innerHTML =
      '<div class="home-release-card-grid" id="homeReleaseGrid" aria-live="polite"></div>';
  }

  function renderMeta() {
    if (!state.data) return;
    var periodEl = document.getElementById('homeReleasePeriod');
    if (periodEl) periodEl.textContent = state.data.period || '—';
    var tsEl = document.getElementById('homeReleaseTimestamp');
    if (tsEl) {
      tsEl.textContent = state.data.fetchedAt
        ? 'Updated ' + formatFetched(state.data.fetchedAt)
        : '';
    }
  }

  function renderAll() {
    hideError();
    restoreBodyShell();
    renderMeta();
    renderTabs();
    renderCompact();
  }

  function applyData(data) {
    state.data = data;
    renderAll();
  }

  function fetchSummary(forceRefresh) {
    if (state.loading) return;
    state.loading = true;
    hideError();
    var btn = document.getElementById('homeReleaseRefresh');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
    }
    showLoading();

    var url = API_PATH + (forceRefresh ? '?refresh=1' : '');
    fetch(url, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.products) throw new Error('Invalid response');
        applyData(payload);
      })
      .catch(function () {
        applyData(SAMPLE_DATA);
        if (forceRefresh) {
          showError(
            'API not available yet — showing bundled June 2026 sample data.'
          );
        }
      })
      .finally(function () {
        state.loading = false;
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('is-loading');
        }
      });
  }

  function init() {
    var root = document.getElementById('homeReleasePanel');
    if (!root || root.getAttribute('data-home-release-init') === '1') return;
    root.setAttribute('data-home-release-init', '1');

    applyData(SAMPLE_DATA);

    var refreshBtn = document.getElementById('homeReleaseRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        fetchSummary(true);
      });
    }

    ['homeReleaseExpand', 'homeReleaseExpandFoot'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', openDrawer);
    });

    var closeBtn = document.getElementById('homeReleaseDrawerClose');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    var backdrop = document.getElementById('homeReleaseBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  function boot() {
    if (document.getElementById('homeReleasePanel')) {
      init();
      return;
    }
    window.addEventListener('aep-deferred-dashboard-mounted', init, { once: true });
  }

  global.HomeReleaseSummary = { init: init, fetchSummary: fetchSummary, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
