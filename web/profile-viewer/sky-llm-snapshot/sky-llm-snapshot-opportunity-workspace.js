/**
 * Opportunity Workspace — Sky-fixed strategies view; LLM Demo swaps brand + focus topics.
 */
(function (root) {
  'use strict';

  var SKY_BRAND = 'Sky';
  var SKY_PLATFORM = 'ChatGPT (Free)';

  var SKY_FOCUS_AREAS = [
    { topic: 'Broadband deals & packages', visibility: 9, trend: 'down', prompts: 12 },
    { topic: 'Sky Glass & streaming setup', visibility: 14, trend: 'down', prompts: 10 },
    { topic: 'Sports & entertainment bundles', visibility: 11, trend: 'up', prompts: 8 },
    { topic: 'WiFi mesh & home connectivity', visibility: 6, trend: 'up', prompts: 9 },
    { topic: 'Account management & billing', visibility: 15, trend: 'down', prompts: 7 },
  ];

  var state = {
    mounted: false,
    rootEl: null,
    mainPane: null,
    platformId: 'chatgpt-free',
  };

  function infoIcon() {
    return (
      '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
      '<circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<path fill="currentColor" d="M9.2 8.4h1.6v5.8H9.2zm.8-7.2a1 1 0 110 2 1 1 0 010-2z"/>' +
      '</svg>'
    );
  }

  function llmDemoMode() {
    return /(?:\?|&)llmDemo=1(?:&|$)/.test(root.location.search || '');
  }

  function loadDemoConfig() {
    if (root.SkyLlmLlmDemoBrands && root.SkyLlmLlmDemoBrands.isActive()) {
      return root.SkyLlmLlmDemoBrands.loadConfig();
    }
    return null;
  }

  function getBrandLabel() {
    var cfg = loadDemoConfig();
    if (cfg && cfg.brand) return cfg.brand;
    return SKY_BRAND;
  }

  function getPlatformLabel() {
    if (root.llmSnapshotPlatform && root.llmSnapshotPlatform.getPlatformLabel) {
      return root.llmSnapshotPlatform.getPlatformLabel(state.platformId);
    }
    if (root.skyLlmSnapshotPlatform && root.skyLlmSnapshotPlatform.getPlatformLabel) {
      return root.skyLlmSnapshotPlatform.getPlatformLabel(state.platformId);
    }
    return SKY_PLATFORM;
  }

  function personalizedTopics(brand) {
    var label = String(brand || 'Your brand').trim();
    return [
      { topic: label + ' packages & pricing', visibility: 7, trend: 'down', prompts: 10 },
      { topic: 'Product setup & onboarding', visibility: 13, trend: 'down', prompts: 10 },
      { topic: 'Customer support & troubleshooting', visibility: 12, trend: 'up', prompts: 5 },
      { topic: 'Comparisons & industry context', visibility: 4, trend: 'up', prompts: 10 },
      { topic: label + ' reputation & reviews', visibility: 16, trend: 'down', prompts: 9 },
    ];
  }

  function getFocusAreas() {
    if (llmDemoMode() && loadDemoConfig()) {
      return personalizedTopics(getBrandLabel());
    }
    return SKY_FOCUS_AREAS;
  }

  function trendMarkup(area) {
    var cls = area.trend === 'up' ? 'sky-llm-ow__trend--up' : 'sky-llm-ow__trend--down';
    var arrow = area.trend === 'up' ? '↑' : '↓';
    return (
      '<span class="sky-llm-ow__visibility ' +
      cls +
      '">' +
      area.visibility +
      '% <span aria-hidden="true">' +
      arrow +
      '</span></span>'
    );
  }

  function focusRowsHtml(areas) {
    return areas
      .map(function (area) {
        return (
          '<tr>' +
          '<td>' +
          escapeHtml(area.topic) +
          '</td>' +
          '<td><span class="sky-llm-ow__strategy">Direct optimization ' +
          infoIcon() +
          '</span></td>' +
          '<td>' +
          trendMarkup(area) +
          '</td>' +
          '<td>' +
          area.prompts +
          '</td>' +
          '<td><button type="button" class="sky-llm-ow__add-btn" aria-label="Add strategy for ' +
          escapeHtml(area.topic) +
          '">+</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function kpiCard(label, value) {
    return (
      '<div class="sky-llm-ow__kpi">' +
      '<div class="sky-llm-ow__kpi-label">' +
      escapeHtml(label) +
      ' ' +
      infoIcon() +
      '</div>' +
      '<div class="sky-llm-ow__kpi-value">' +
      value +
      '</div>' +
      '</div>'
    );
  }

  function buildMarkup() {
    var brand = getBrandLabel();
    var platform = getPlatformLabel();
    var areas = getFocusAreas();

    return (
      '<div class="sky-llm-ow" id="skyLlmOwRoot">' +
      '<h1 class="sky-llm-ow__title">Opportunity Workspace</h1>' +
      '<p class="sky-llm-ow__subtitle">Build and track your own custom opportunities and optimization strategies.</p>' +
      '<div class="sky-llm-ow__filters">' +
      '<label class="sky-llm-ow__filter"><span class="sky-llm-ow__filter-label">Brand ' +
      infoIcon() +
      '</span><select class="sky-llm-ow__select" id="skyLlmOwBrand" aria-label="Brand">' +
      '<option selected>' +
      escapeHtml(brand) +
      '</option></select></label>' +
      '<label class="sky-llm-ow__filter"><span class="sky-llm-ow__filter-label">Strategy Status</span>' +
      '<select class="sky-llm-ow__select" aria-label="Strategy Status"><option selected>All</option></select></label>' +
      '<label class="sky-llm-ow__filter"><span class="sky-llm-ow__filter-label">Opportunity Status</span>' +
      '<select class="sky-llm-ow__select" aria-label="Opportunity Status"><option selected>All</option></select></label>' +
      '</div>' +
      '<div class="sky-llm-ow__kpis">' +
      kpiCard('Total Strategies', '0') +
      kpiCard('Total Opportunities', '0') +
      kpiCard('Active Opportunities', '0') +
      kpiCard('Completed Opportunities', '0') +
      kpiCard('Completed, not tracked', '0') +
      kpiCard('Completed, tracked', '0') +
      '</div>' +
      '<div class="sky-llm-ow__empty">' +
      '<h2 class="sky-llm-ow__empty-title">No strategies yet</h2>' +
      '<p class="sky-llm-ow__empty-copy">Create your first strategy to start building custom opportunities and track optimization progress for your URLs.</p>' +
      '<button type="button" class="sky-llm-ow__cta" id="skyLlmOwCreateStrategy">Create Strategy</button>' +
      '</div>' +
      '<h2 class="sky-llm-ow__focus-title">Recommended focus areas</h2>' +
      '<p class="sky-llm-ow__focus-copy">Based on ' +
      escapeHtml(platform) +
      ' brand presence data, these topics have the highest potential for visibility improvement. Click + to get started.</p>' +
      '<div class="sky-llm-ow__table-wrap">' +
      '<table class="sky-llm-ow__table">' +
      '<thead><tr><th>Topic</th><th>Strategy</th><th>Visibility</th><th>Prompts</th><th><span class="visually-hidden">Action</span></th></tr></thead>' +
      '<tbody>' +
      focusRowsHtml(areas) +
      '</tbody></table></div>' +
      '</div>'
    );
  }

  function isInsideOrgNav(el) {
    if (!el) return false;
    if (el.closest('[id^="org-sidebar-section-"]')) return true;
    if (el.closest('[id^="org-nav-item-"]')) return true;
    if (el.closest('nav')) return true;
    return false;
  }

  /** Frozen Opportunities export still titles the main column — never the sidebar nav label. */
  function findMainPageAnchor() {
    var h1 = Array.from(document.querySelectorAll('h1')).find(function (n) {
      return n.textContent.trim() === 'Opportunities' && !isInsideOrgNav(n);
    });
    if (h1) return h1;

    var desc =
      'Prioritized optimization opportunities based on provider gaps, trending topics, and performance data.';
    var nodes = document.querySelectorAll('span[data-rsp-slot="text"], div, span, p');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.childElementCount !== 0) continue;
      if (n.textContent.trim() !== desc) continue;
      if (isInsideOrgNav(n)) continue;
      return n;
    }

    var cards = document.querySelectorAll('[data-testid*="OppCard"]');
    for (var j = 0; j < cards.length; j++) {
      if (!isInsideOrgNav(cards[j])) return cards[j];
    }
    return null;
  }

  function ensurePanePositioned(el) {
    if (!el) return;
    if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
  }

  function isValidMainPane(pane, sidebarEl, pageAnchor) {
    if (!pane || !pane.isConnected) return false;
    if (isInsideOrgNav(pane)) return false;
    if (sidebarEl && pane.contains(sidebarEl)) return false;
    if (pageAnchor && !pane.contains(pageAnchor)) return false;
    return true;
  }

  /** Main scroll column to the right of the org sidebar (same detection as Opportunities). */
  function findShellMainPane() {
    var sidebarEl = document.querySelector('[id^="org-sidebar-section-"]');
    var pageAnchor = findMainPageAnchor();

    if (state.mainPane && isValidMainPane(state.mainPane, sidebarEl, pageAnchor)) {
      ensurePanePositioned(state.mainPane);
      return state.mainPane;
    }
    state.mainPane = null;

    if (pageAnchor && sidebarEl) {
      var row = pageAnchor.parentElement;
      for (var i = 0; i < 35 && row; i++) {
        if (row.contains(sidebarEl)) {
          var children = Array.from(row.children);
          for (var c = 0; c < children.length; c++) {
            var ch = children[c];
            if (ch.contains(sidebarEl)) continue;
            if (ch.contains(pageAnchor)) {
              state.mainPane = ch;
              ensurePanePositioned(state.mainPane);
              return state.mainPane;
            }
          }
        }
        row = row.parentElement;
      }
    }

    var toggle = document.getElementById('shell-left-nav-menu-toggle-button');
    if (toggle) {
      var header = toggle.closest('header');
      if (header) {
        var afterHeader = header.nextElementSibling;
        if (afterHeader && (!pageAnchor || afterHeader.contains(pageAnchor)) && !afterHeader.contains(sidebarEl)) {
          state.mainPane = afterHeader;
          ensurePanePositioned(state.mainPane);
          return state.mainPane;
        }
      }
    }

    return null;
  }

  function purgeMisplacedHosts(validPane) {
    document.querySelectorAll('#sky-llm-ow-host').forEach(function (host) {
      if (isInsideOrgNav(host) || (validPane && !validPane.contains(host))) host.remove();
    });
  }

  function restoreSidebarVisibility() {
    var sidebarEl = document.querySelector('[id^="org-sidebar-section-"]');
    if (sidebarEl) {
      var walk = sidebarEl.parentElement;
      for (var i = 0; i < 40 && walk; i++) {
        var children = Array.from(walk.children);
        if (children.some(function (ch) {
          return ch.contains(sidebarEl);
        })) {
          children.forEach(function (ch) {
            ch.style.removeProperty('display');
            ch.style.removeProperty('visibility');
            ch.style.removeProperty('opacity');
          });
          break;
        }
        walk = walk.parentElement;
      }
    }
    document.querySelectorAll('[id^="org-sidebar-section-"]').forEach(function (section) {
      section.style.removeProperty('display');
      section.style.removeProperty('visibility');
      section.style.removeProperty('opacity');
    });
  }

  function hideFrozenOpportunitiesContent(pane) {
    Array.from(pane.children).forEach(function (child) {
      if (child.id === 'sky-llm-ow-host') return;
      child.style.display = 'none';
    });
  }

  function mount() {
    restoreSidebarVisibility();
    var pane = findShellMainPane();
    if (!pane) return false;

    purgeMisplacedHosts(pane);

    var host = pane.querySelector('#sky-llm-ow-host');
    if (!host) {
      hideFrozenOpportunitiesContent(pane);
      host = document.createElement('div');
      host.id = 'sky-llm-ow-host';
      pane.appendChild(host);
    } else {
      hideFrozenOpportunitiesContent(pane);
    }

    host.innerHTML = buildMarkup();
    state.rootEl = host;
    state.mounted = true;

    var createBtn = host.querySelector('#skyLlmOwCreateStrategy');
    if (createBtn && createBtn.dataset.skyLlmOwWired !== '1') {
      createBtn.dataset.skyLlmOwWired = '1';
      createBtn.addEventListener('click', function () {
        createBtn.textContent = 'Create Strategy';
        createBtn.blur();
      });
    }

    return true;
  }

  function refresh() {
    if (!state.mounted) {
      boot();
      return;
    }
    if (state.rootEl) state.rootEl.innerHTML = buildMarkup();
  }

  function boot() {
    mount();
  }

  function onPlatformChange(e) {
    if (!e || !e.detail || !e.detail.platformId) return;
    state.platformId = e.detail.platformId;
    refresh();
  }

  root.addEventListener('sky-llm-platform-change', onPlatformChange);
  root.addEventListener('message', function (e) {
    if (!e || !e.data || e.data.type !== 'llm-demo-config') return;
    if (e.origin !== root.location.origin) return;
    refresh();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  [400, 1200, 2500].forEach(function (ms) {
    root.setTimeout(boot, ms);
  });

  root.SkyLlmOpportunityWorkspace = {
    boot: boot,
    refresh: refresh,
    mount: mount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
