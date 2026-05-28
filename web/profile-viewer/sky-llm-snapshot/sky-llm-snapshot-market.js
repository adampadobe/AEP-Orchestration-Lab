/**
 * Market Tracking brand filter (Brand Presence) + KPI trend labels (all snapshot pages).
 */
(function () {
  'use strict';

  var DEFAULT_SELECTED = ['Sky', 'BT', 'TalkTalk', 'Virgin Media'];
  var ALL_BRANDS = ['Sky', 'Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+'];
  var MAX_BRANDS = 5;

  /** Legacy export labels still present in some snapshots */
  var LEGACY_LABEL = {
    Adobe: 'Sky',
    Automattic: 'BT',
    Contentful: 'TalkTalk',
    Global: 'Netflix',
    Webflow: 'Netflix',
    Wix: 'TalkTalk',
    WKND: 'Virgin Media',
    AEM: 'Disney+',
    'Drupal Association': 'Disney+',
    Shopify: 'Disney+',
  };

  var TRENDS_BASE = {
    'chatgpt-free': {
      visibility: { dir: 'down', pct: 14 },
      mentions: { dir: 'down', pct: 13 },
      citations: { dir: 'flat', pct: 0 },
      agentic: { dir: 'up', pct: 14 },
      referral: { dir: 'flat', pct: 0 },
    },
    gemini: {
      visibility: { dir: 'down', pct: 10 },
      mentions: { dir: 'down', pct: 8 },
      citations: { dir: 'up', pct: 5 },
      agentic: { dir: 'up', pct: 11 },
      referral: { dir: 'up', pct: 18 },
    },
    'google-ai-mode': {
      visibility: { dir: 'down', pct: 12 },
      mentions: { dir: 'down', pct: 11 },
      citations: { dir: 'flat', pct: 0 },
      agentic: { dir: 'up', pct: 9 },
      referral: { dir: 'up', pct: 6 },
    },
    copilot: {
      visibility: { dir: 'down', pct: 16 },
      mentions: { dir: 'down', pct: 15 },
      citations: { dir: 'flat', pct: 0 },
      agentic: { dir: 'down', pct: 5 },
      referral: { dir: 'up', pct: 3 },
    },
    'chatgpt-paid': {
      visibility: { dir: 'up', pct: 6 },
      mentions: { dir: 'up', pct: 4 },
      citations: { dir: 'up', pct: 8 },
      agentic: { dir: 'up', pct: 7 },
      referral: { dir: 'up', pct: 5 },
    },
    perplexity: {
      visibility: { dir: 'down', pct: 9 },
      mentions: { dir: 'down', pct: 10 },
      citations: { dir: 'up', pct: 12 },
      agentic: { dir: 'up', pct: 8 },
      referral: { dir: 'up', pct: 22 },
    },
    'google-overview': {
      visibility: { dir: 'down', pct: 11 },
      mentions: { dir: 'down', pct: 9 },
      citations: { dir: 'flat', pct: 0 },
      agentic: { dir: 'up', pct: 6 },
      referral: { dir: 'up', pct: 4 },
    },
  };

  var RANGE_TREND = { '4w': 1, '2w': 0.92, '1w': 0.85, custom: 1 };

  var marketState = {
    ready: false,
    selected: [],
    linesByBrand: {},
    tagRows: {},
    tagContainer: null,
    picker: null,
  };

  var trendState = { nodes: {} };

  function normalizeBrandName(raw) {
    var t = (raw || '').trim();
    return LEGACY_LABEL[t] || t;
  }

  function findSectionRoot(title) {
    var heads = Array.from(document.querySelectorAll('div, span, h2, h3')).filter(function (n) {
      return n.textContent.trim() === title && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 12 && root; i++) {
      if (root.querySelector('svg.recharts-surface[role="application"]')) return root;
      root = root.parentElement;
    }
    return root;
  }

  function findChartBlock(title) {
    var heads = Array.from(document.querySelectorAll('div, span, h2, h3')).filter(function (n) {
      return n.textContent.trim() === title && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var walk = heads[0].parentElement;
    for (var i = 0; i < 14 && walk; i++) {
      var svgs = walk.querySelectorAll('svg.recharts-surface[role="application"]');
      for (var s = 0; s < svgs.length; s++) {
        var svg = svgs[s];
        if (svg.querySelector('g.recharts-line, g.recharts-layer line, path.recharts-curve')) {
          return { root: walk, svg: svg };
        }
      }
      walk = walk.parentElement;
    }
    return null;
  }

  function clampChartOverflow(svg) {
    if (!svg) return;
    var node = svg.parentElement;
    for (var i = 0; i < 6 && node; i++) {
      if (node.classList && node.classList.contains('recharts-wrapper')) {
        node.classList.add('sky-llm-chart-overflow');
        break;
      }
      node = node.parentElement;
    }
  }

  function cacheChartLines(chartTitle, key) {
    var block = findChartBlock(chartTitle);
    if (!block) return;
    clampChartOverflow(block.svg);

    var legendItems = Array.from(block.svg.querySelectorAll('.recharts-legend-item'));
    var lineGroups = Array.from(block.svg.querySelectorAll('g.recharts-line'));

    legendItems.forEach(function (legendEl, idx) {
      var textEl = legendEl.querySelector('.recharts-legend-item-text');
      var name = normalizeBrandName(textEl && textEl.textContent);
      if (!name) return;
      var group = lineGroups[idx];
      if (!group) return;

      if (!marketState.linesByBrand[name]) marketState.linesByBrand[name] = {};
      if (!marketState.linesByBrand[name][key]) marketState.linesByBrand[name][key] = [];
      marketState.linesByBrand[name][key].push({ group: group, legendEl: legendEl });
    });
  }

  function readTagRows() {
    marketState.tagRows = {};
    marketState.selected = [];
    var root = findSectionRoot('Market Tracking');
    if (!root) return;
    marketState.tagContainer =
      root.querySelector('[role="grid"]') ||
      root.querySelector('[class*="tag"]') ||
      root.querySelector('div[data-rac]');

    var rows = Array.from(root.querySelectorAll('[role="row"]')).filter(function (row) {
      return row.querySelector('button[aria-label="Remove"]');
    });

    rows.forEach(function (row) {
      var span = row.querySelector('span[data-rsp-slot="text"]');
      var name = normalizeBrandName((span && span.textContent) || row.getAttribute('aria-label') || '');
      if (!name) return;
      if (name === 'Netflix') {
        name = 'Virgin Media';
        if (span) span.textContent = 'Virgin Media';
        row.setAttribute('aria-label', 'Virgin Media');
      }
      if (marketState.selected.indexOf(name) >= 0) {
        row.parentElement && row.parentElement.removeChild(row);
        return;
      }
      marketState.selected.push(name);
      marketState.tagRows[name] = row;
      wireRemoveButton(row, name);
    });
  }

  function wireRemoveButton(row, name) {
    var removeBtn = row.querySelector('button[aria-label="Remove"]');
    if (!removeBtn || removeBtn.dataset.skyLlmRemoveWired === '1') return;
    removeBtn.dataset.skyLlmRemoveWired = '1';
    removeBtn.addEventListener(
      'click',
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeBrand(name);
      },
      true,
    );
  }

  function ensureDefaultTags() {
    readTagRows();
    if (marketState.selected.length) return;

    var template = null;
    var root = findSectionRoot('Market Tracking');
    if (root) {
      template = root.querySelector('[role="row"]');
    }
    if (!template || !template.parentElement) {
      marketState.selected = DEFAULT_SELECTED.slice();
      return;
    }

    DEFAULT_SELECTED.forEach(function (name) {
      var row = template.cloneNode(true);
      row.removeAttribute('id');
      row.querySelectorAll('[id]').forEach(function (el) {
        el.removeAttribute('id');
      });
      var span = row.querySelector('span[data-rsp-slot="text"]');
      if (span) span.textContent = name;
      row.setAttribute('aria-label', name);
      row.setAttribute('data-key', name);
      template.parentElement.appendChild(row);
      marketState.tagRows[name] = row;
      wireRemoveButton(row, name);
    });
    marketState.selected = DEFAULT_SELECTED.slice();
  }

  function setLineVisible(name, visible) {
    var charts = marketState.linesByBrand[name];
    if (!charts) return;
    Object.keys(charts).forEach(function (key) {
      charts[key].forEach(function (item) {
        if (item.group) item.group.style.display = visible ? '' : 'none';
        if (item.legendEl) item.legendEl.style.display = visible ? '' : 'none';
      });
    });
  }

  function applyBrandVisibility() {
    if (!Object.keys(marketState.linesByBrand).length) return;

    ALL_BRANDS.forEach(function (name) {
      var show = marketState.selected.indexOf(name) >= 0;
      if (name === 'Netflix' && marketState.selected.indexOf('Virgin Media') >= 0) show = false;
      setLineVisible(name, show);
    });
  }

  function removeBrand(name) {
    if (marketState.selected.indexOf(name) < 0) return;
    marketState.selected = marketState.selected.filter(function (b) {
      return b !== name;
    });
    var row = marketState.tagRows[name];
    if (row && row.parentElement) row.parentElement.removeChild(row);
    delete marketState.tagRows[name];
    setLineVisible(name, false);
    if (marketState.picker) marketState.picker.renderMenu();
  }

  function addBrand(name) {
    if (marketState.selected.indexOf(name) >= 0) return;
    if (marketState.selected.length >= MAX_BRANDS) return;

    var template =
      marketState.tagRows[Object.keys(marketState.tagRows)[0]] ||
      (findSectionRoot('Market Tracking') && findSectionRoot('Market Tracking').querySelector('[role="row"]'));
    if (!template || !template.parentElement) return;

    var row = template.cloneNode(true);
    row.removeAttribute('id');
    row.querySelectorAll('[id]').forEach(function (el) {
      el.removeAttribute('id');
    });
    var span = row.querySelector('span[data-rsp-slot="text"]');
    if (span) span.textContent = name;
    row.setAttribute('aria-label', name);
    row.setAttribute('data-key', name);
    template.parentElement.appendChild(row);
    marketState.tagRows[name] = row;
    wireRemoveButton(row, name);
    marketState.selected.push(name);
    setLineVisible(name, true);
    if (name === 'Virgin Media') setLineVisible('Netflix', false);
    if (marketState.picker) marketState.picker.renderMenu();
  }

  function availableBrands() {
    return ALL_BRANDS.filter(function (b) {
      return marketState.selected.indexOf(b) < 0;
    });
  }

  function findSelectOthersCombobox() {
    var root = findSectionRoot('Market Tracking');
    if (!root) return null;
    var combos = Array.from(root.querySelectorAll('[role="combobox"]'));
    return (
      combos.find(function (el) {
        var label = (el.getAttribute('aria-label') || '').toLowerCase();
        return label.indexOf('select') >= 0;
      }) || combos[0] || null
    );
  }

  function buildSelectOthersPicker() {
    var combobox = findSelectOthersCombobox();
    if (!combobox) return;
    var shell = combobox.parentElement;
    if (!shell || shell.querySelector('.sky-llm-select-others-host')) return;

    shell.classList.add('sky-llm-select-others-shell');
    combobox.setAttribute('tabindex', '-1');
    Array.from(shell.querySelectorAll('button')).forEach(function (btn) {
      if (btn.getAttribute('aria-label') === 'Show suggestions') btn.style.display = 'none';
    });

    var host = document.createElement('div');
    host.className = 'sky-llm-select-others-host sky-llm-date-host';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sky-llm-date-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Select others');
    trigger.innerHTML =
      '<span>Select others</span><span class="sky-llm-date-trigger-chevron" aria-hidden="true">▼</span>';

    var menu = document.createElement('ul');
    menu.className = 'sky-llm-date-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function renderMenu() {
      menu.innerHTML = '';
      var avail = availableBrands();
      if (!avail.length) {
        var empty = document.createElement('li');
        empty.className = 'sky-llm-select-others-empty';
        empty.textContent = 'Maximum of 5 brands reached. Remove some to add more.';
        menu.appendChild(empty);
        return;
      }
      avail.forEach(function (name) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sky-llm-date-option';
        btn.setAttribute('role', 'option');
        btn.textContent = name;
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          addBrand(name);
          closeMenu();
        });
        li.appendChild(btn);
        menu.appendChild(li);
      });
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) {
        renderMenu();
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      } else {
        closeMenu();
      }
    });

    host.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    host.appendChild(trigger);
    host.appendChild(menu);
    shell.insertBefore(host, combobox);

    marketState.picker = { renderMenu: renderMenu, closeMenu: closeMenu };

    document.addEventListener('click', function () {
      if (!menu.hidden) closeMenu();
    });
  }

  function initMarketTracking() {
    if (!findSectionRoot('Market Tracking')) return;

    marketState.linesByBrand = {};
    cacheChartLines('Brand Mentions', 'mentions');
    cacheChartLines('Brand Citations', 'citations');

    ensureDefaultTags();
    if (!marketState.selected.length) {
      marketState.selected = DEFAULT_SELECTED.slice();
    }

    buildSelectOthersPicker();
    applyBrandVisibility();
    marketState.ready = true;
  }

  function findTrendNode(metricLabel) {
    var labelNodes = Array.from(document.querySelectorAll('div, span, p')).filter(function (n) {
      return n.childElementCount === 0 && n.textContent.trim() === metricLabel;
    });
    for (var i = 0; i < labelNodes.length; i++) {
      var walk = labelNodes[i].parentElement;
      for (var d = 0; d < 8 && walk; d++) {
        var candidates = walk.querySelectorAll('div, span, p');
        for (var c = 0; c < candidates.length; c++) {
          var el = candidates[c];
          if (el.childElementCount > 0) continue;
          var t = el.textContent.trim();
          if (/vs last week/i.test(t)) return el;
        }
        walk = walk.parentElement;
      }
    }
    return null;
  }

  function cacheTrendNodes() {
    trendState.nodes = {
      visibility: findTrendNode('Visibility Score'),
      mentions: findTrendNode('Brand Mentions'),
      citations: findTrendNode('Citations'),
      agentic: findTrendNode('Agentic Interactions'),
      referral: findTrendNode('Total Referral Traffic from LLMs'),
    };
  }

  function formatTrend(trend) {
    if (!trend) return '→ 0 % vs last week';
    if (trend.dir === 'down') return '▼ ' + trend.pct + ' % down vs last week';
    if (trend.dir === 'up') return '▲ ' + trend.pct + ' % up vs last week';
    return '→ ' + trend.pct + ' % vs last week';
  }

  function getTrends(platformId, rangeId) {
    var base = TRENDS_BASE[platformId] || TRENDS_BASE['chatgpt-free'];
    var f = RANGE_TREND[rangeId] || 1;
    var out = {};
    Object.keys(base).forEach(function (key) {
      var t = base[key];
      var pct = Math.max(0, Math.round(t.pct * f + (t.dir === 'up' ? 1 : 0)));
      out[key] = { dir: t.dir, pct: pct };
    });
    return out;
  }

  function applyTrends(platformId, rangeId) {
    cacheTrendNodes();
    var trends = getTrends(platformId, rangeId);
    Object.keys(trends).forEach(function (key) {
      if (trendState.nodes[key]) trendState.nodes[key].textContent = formatTrend(trends[key]);
    });
  }

  window.skyLlmSnapshotMarket = {
    initMarketTracking: initMarketTracking,
    applyTrends: applyTrends,
  };

  function boot() {
    cacheTrendNodes();
    if (findSectionRoot('Market Tracking')) initMarketTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.setTimeout(boot, 1200);
})();
