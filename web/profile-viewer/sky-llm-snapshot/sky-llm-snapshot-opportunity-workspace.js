/**
 * Opportunity Workspace — patch frozen snapshot (Sky via patch.js; LLM Demo personalizes brand + focus table).
 */
(function (root) {
  'use strict';

  var SKY_FOCUS_AREAS = [
    { topic: 'Broadband deals & packages', visibility: 9, trend: 'down', prompts: 12 },
    { topic: 'Sky Glass & streaming setup', visibility: 14, trend: 'down', prompts: 10 },
    { topic: 'Sports & entertainment bundles', visibility: 11, trend: 'up', prompts: 8 },
    { topic: 'WiFi mesh & home connectivity', visibility: 6, trend: 'up', prompts: 9 },
    { topic: 'Account management & billing', visibility: 15, trend: 'down', prompts: 7 },
  ];

  var state = { platformId: 'chatgpt-free' };

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
    return 'Sky';
  }

  function getPlatformLabel() {
    if (root.llmSnapshotPlatform && root.llmSnapshotPlatform.getPlatformLabel) {
      return root.llmSnapshotPlatform.getPlatformLabel(state.platformId);
    }
    if (root.skyLlmSnapshotPlatform && root.skyLlmSnapshotPlatform.getPlatformLabel) {
      return root.skyLlmSnapshotPlatform.getPlatformLabel(state.platformId);
    }
    return 'ChatGPT (Free)';
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

  function findLeafText(text) {
    var nodes = document.querySelectorAll('span[data-rsp-slot="text"], div, span, p, h1, h2');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.childElementCount === 0 && n.textContent.trim() === text) return n;
    }
    return null;
  }

  function patchFocusCopy() {
    var platform = getPlatformLabel();
    var target =
      'Based on ' +
      platform +
      ' brand presence data, these topics have the highest potential for visibility improvement. Click + to get started.';
    var nodes = document.querySelectorAll('span[data-rsp-slot="text"], div, span, p');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.childElementCount !== 0) continue;
      if (/Based on .+ brand presence data/.test(n.textContent)) {
        n.textContent = target;
        return;
      }
    }
  }

  function patchBrandSelector() {
    var brand = getBrandLabel();
    var sel = document.getElementById('org-brand-selector');
    if (sel) {
      sel.querySelectorAll('[data-rsp-slot="text"], button[aria-label]').forEach(function (el) {
        if (el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Information') return;
        if (el.childElementCount === 0 && el.textContent.trim() && el.textContent.trim() !== 'Brand') {
          el.textContent = brand;
        }
      });
    }
    document.querySelectorAll('#org-brand-selector input[type="text"]').forEach(function (input) {
      if (/frescopa|coffee|sweet maria|cropster|agtron/i.test(input.value || '')) {
        input.value = brand;
        input.setAttribute('title', brand);
      }
    });
  }

  function findFocusGrid() {
    var labeled = document.querySelector('[aria-label="Recommended strategies table"]');
    if (labeled) return labeled;
    var title = findLeafText('Recommended focus areas');
    if (!title) return null;
    var walk = title.parentElement;
    for (var i = 0; i < 24 && walk; i++) {
      var grid = walk.querySelector('[role="grid"]');
      if (grid) return grid;
      walk = walk.parentElement;
    }
    return document.querySelector('[role="grid"]');
  }

  function markFocusGridLayout(grid) {
    if (!grid) return;
    grid.classList.add('sky-llm-ow__focus-grid');
    var wrap =
      grid.closest('.K6Neosc11') ||
      grid.closest('[class*="macro-static-tbdIeb"]') ||
      grid.parentElement;
    if (wrap) wrap.classList.add('sky-llm-ow__focus-wrap');
    grid.querySelectorAll('[role="presentation"]').forEach(function (el) {
      var w = parseInt(el.style.width, 10);
      if (w > 400) {
        el.style.width = '100%';
        el.style.maxWidth = '100%';
      }
    });
  }

  function focusDataRows(grid) {
    return Array.from(grid.querySelectorAll('[role="row"][aria-rowindex]'))
      .filter(function (row) {
        var idx = parseInt(row.getAttribute('aria-rowindex'), 10);
        return idx >= 2 && row.querySelector('[role="rowheader"]');
      })
      .slice(0, 5);
  }

  function patchFocusGrid() {
    var grid = findFocusGrid();
    if (!grid) return;
    markFocusGridLayout(grid);
    var rows = focusDataRows(grid);
    if (!rows.length) return;
    var areas = getFocusAreas();
    rows.forEach(function (row, idx) {
      var area = areas[idx];
      if (!area) return;
      var topicEl = row.querySelector('[role="rowheader"] [data-rsp-slot="text"]');
      if (topicEl) topicEl.textContent = area.topic;
      var gridTexts = Array.from(row.querySelectorAll('[role="gridcell"] [data-rsp-slot="text"]'));
      if (gridTexts[1]) {
        gridTexts[1].textContent = area.visibility + '% ' + (area.trend === 'up' ? '↑' : '↓');
        gridTexts[1].className =
          'sky-llm-ow__visibility ' +
          (area.trend === 'up' ? 'sky-llm-ow__trend--up' : 'sky-llm-ow__trend--down');
      }
      if (gridTexts[2]) gridTexts[2].textContent = String(area.prompts);
    });
  }

  function findFocusTable() {
    var title = findLeafText('Recommended focus areas');
    if (!title) return null;
    var walk = title.parentElement;
    for (var i = 0; i < 20 && walk; i++) {
      var table = walk.querySelector('table');
      if (table) return table;
      walk = walk.parentElement;
    }
    return document.querySelector('table');
  }

  function trendHtml(area) {
    var up = area.trend === 'up';
    var cls = up ? 'sky-llm-ow__trend--up' : 'sky-llm-ow__trend--down';
    var arrow = up ? '↑' : '↓';
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

  function patchFocusTable() {
    patchFocusGrid();
    var table = findFocusTable();
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var areas = getFocusAreas();
    var rows = Array.from(tbody.querySelectorAll('tr'));
    areas.forEach(function (area, idx) {
      var row = rows[idx];
      if (!row) return;
      var cells = row.querySelectorAll('td');
      if (cells[0]) cells[0].textContent = area.topic;
      if (cells[2]) cells[2].innerHTML = trendHtml(area);
      if (cells[3]) cells[3].textContent = String(area.prompts);
    });
  }

  function patchKpiLabels() {
    var map = {
      'Completed, not tracked': 'Completed, not yet tracked',
      'Completed, iterated': 'Completed, tracked',
    };
    document.querySelectorAll('[data-rsp-slot="text"]').forEach(function (el) {
      if (el.childElementCount !== 0) return;
      var t = el.textContent.trim();
      if (map[t]) el.textContent = map[t];
    });
  }

  function apply() {
    patchKpiLabels();
    patchBrandSelector();
    patchFocusCopy();
    patchFocusTable();
  }

  function boot() {
    apply();
  }

  function onPlatformChange(e) {
    if (!e || !e.detail || !e.detail.platformId) return;
    state.platformId = e.detail.platformId;
    apply();
  }

  root.addEventListener('sky-llm-platform-change', onPlatformChange);
  root.addEventListener('message', function (e) {
    if (!e || !e.data || e.data.type !== 'llm-demo-config') return;
    if (e.origin !== root.location.origin) return;
    apply();
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
    refresh: apply,
    apply: apply,
  };
})(typeof window !== 'undefined' ? window : globalThis);
