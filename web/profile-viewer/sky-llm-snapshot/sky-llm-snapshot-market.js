/**
 * Market Tracking brand filter (Brand Presence) + KPI trend labels (all snapshot pages).
 */
(function () {
  'use strict';

  var DEFAULT_SELECTED = ['Sky', 'BT', 'TalkTalk', 'Virgin Media'];
  var ALL_BRANDS = ['Sky', 'Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+'];
  var CHART_BRAND_ORDER = ['Sky', 'BT', 'TalkTalk', 'Virgin Media', 'Netflix', 'Disney+'];
  var KNOWN_BRANDS = { Sky: 1, 'Virgin Media': 1, BT: 1, TalkTalk: 1, Netflix: 1, 'Disney+': 1 };
  var MAX_BRANDS = 5;
  var LINE_GROUP_SEL = 'g.recharts-line, g.recharts-layer.recharts-line';
  var HIDDEN_LINE_CLASS = 'sky-llm-market-line-hidden';
  var HIDDEN_LEGEND_CLASS = 'sky-llm-market-legend-hidden';
  var STROKE_BY_BRAND = {
    Sky: '#d946ef',
    BT: '#f97316',
    TalkTalk: '#a855f7',
    'Virgin Media': '#e11d48',
    Netflix: '#6366f1',
    'Disney+': '#8b5cf6',
  };

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
    entries: [],
    tagRows: {},
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
    var head = Array.from(document.querySelectorAll('div, span, h2, h3')).find(function (n) {
      return n.textContent.trim() === title && n.childElementCount === 0;
    });
    if (!head) return null;

    var stopTitles = { 'Brand Mentions': 1, 'Brand Citations': 1, 'Market Tracking': 1 };
    var node = head;
    for (var step = 0; step < 100 && node; step++) {
      if (node !== head && node.querySelectorAll) {
        var svgs = node.querySelectorAll('svg.recharts-surface[role="application"]');
        for (var s = 0; s < svgs.length; s++) {
          var svg = svgs[s];
          var lineGroups = svg.querySelectorAll(LINE_GROUP_SEL);
          if (lineGroups.length >= 4 && svg.querySelector(LINE_GROUP_SEL + ' path[stroke]')) {
            return { root: node, svg: svg };
          }
        }
      }
      if (node.nextElementSibling) {
        var sibText = (node.nextElementSibling.textContent || '').trim();
        if (step > 2 && stopTitles[sibText] && sibText !== title) break;
        node = node.nextElementSibling;
      } else if (node.firstElementChild && node !== head) {
        node = node.firstElementChild;
      } else {
        node = node.parentElement;
      }
    }

    var walk = head.parentElement;
    for (var i = 0; i < 20 && walk; i++) {
      var fallbackSvgs = walk.querySelectorAll('svg.recharts-surface[role="application"]');
      for (var f = 0; f < fallbackSvgs.length; f++) {
        var fb = fallbackSvgs[f];
        if (fb.querySelectorAll(LINE_GROUP_SEL).length >= 4) {
          return { root: walk, svg: fb };
        }
      }
      walk = walk.parentElement;
    }
    return null;
  }

  function brandFromPath(path) {
    var raw = path.getAttribute('name') || path.getAttribute('data-name') || '';
    return normalizeBrandName(raw);
  }

  function unlockMarketPath(path) {
    if (!path) return;
    var group = path.closest(LINE_GROUP_SEL);
    var brand = brandFromPath(path);
    var stroke = STROKE_BY_BRAND[brand];

    path.removeAttribute('stroke-dasharray');
    path.removeAttribute('stroke-dashoffset');
    path.style.strokeDasharray = 'none';
    path.style.strokeDashoffset = '0';
    path.style.removeProperty('display');
    path.style.removeProperty('visibility');
    path.style.opacity = '1';
    path.removeAttribute('stroke-opacity');
    path.classList.remove(HIDDEN_LINE_CLASS);
    if (stroke) path.setAttribute('stroke', stroke);

    if (group) {
      group.style.removeProperty('display');
      group.style.removeProperty('visibility');
      group.style.opacity = '1';
      group.classList.remove(HIDDEN_LINE_CLASS);
    }
  }

  function ensureLinesVisible() {
    var root = findSectionRoot('Market Tracking');
    var scope = root || document;
    scope.querySelectorAll('path.recharts-curve, path.recharts-line-curve').forEach(unlockMarketPath);
  }

  function markChartCard(block) {
    if (!block || !block.root) return;
    block.root.classList.add('sky-llm-market-chart-card');
    var node = block.svg;
    for (var i = 0; i < 10 && node; i++) {
      if (
        node.classList &&
        (node.classList.contains('recharts-wrapper') ||
          node.classList.contains('recharts-responsive-container'))
      ) {
        node.classList.add('sky-llm-chart-overflow');
      }
      node = node.parentElement;
    }
  }

  function isKnownBrand(name) {
    return !!KNOWN_BRANDS[normalizeBrandName(name)];
  }

  function resetLineGraphics(entry) {
    if (!entry) return;
    if (entry.group) {
      entry.group.classList.remove(HIDDEN_LINE_CLASS);
      entry.group.style.removeProperty('display');
      entry.group.style.removeProperty('visibility');
      entry.group.style.removeProperty('opacity');
    }
    if (entry.path) {
      entry.path.classList.remove(HIDDEN_LINE_CLASS);
      entry.path.style.removeProperty('display');
      entry.path.style.removeProperty('visibility');
      entry.path.style.removeProperty('opacity');
      unlockMarketPath(entry.path);
      if (entry.pathD) entry.path.setAttribute('d', entry.pathD);
    }
    if (entry.legendEl) {
      entry.legendEl.classList.remove(HIDDEN_LEGEND_CLASS);
      entry.legendEl.style.removeProperty('display');
      entry.legendEl.style.removeProperty('visibility');
      entry.legendEl.style.removeProperty('opacity');
    }
  }

  function cacheChartLines(chartTitle, chartKey) {
    var block = findChartBlock(chartTitle);
    if (!block) return;
    markChartCard(block);

    var legendItems = Array.from(block.svg.querySelectorAll('.recharts-legend-item'));
    var lineGroups = Array.from(block.svg.querySelectorAll(LINE_GROUP_SEL));

    lineGroups.forEach(function (group, idx) {
      var legendEl = legendItems[idx] || null;
      var textEl = legendEl && legendEl.querySelector('.recharts-legend-item-text');
      var path =
        group.querySelector('path.recharts-line-curve') ||
        group.querySelector('path.recharts-curve') ||
        group.querySelector('path[stroke]') ||
        group.querySelector('path');
      var name = normalizeBrandName(textEl && textEl.textContent);
      if (!isKnownBrand(name) && path) name = brandFromPath(path);
      if (!isKnownBrand(name)) name = CHART_BRAND_ORDER[idx] || '__extra_' + chartKey + '_' + idx;
      var pathD = path ? path.getAttribute('d') : '';

      marketState.entries.push({
        name: name,
        chartKey: chartKey,
        group: group,
        legendEl: legendEl,
        path: path,
        pathD: pathD,
        idx: idx,
      });
    });
  }

  function showAllLines() {
    marketState.entries.forEach(resetLineGraphics);
  }

  function readTagRows() {
    marketState.tagRows = {};
    marketState.selected = [];
    var root = findSectionRoot('Market Tracking');
    if (!root) return;

    var rows = Array.from(root.querySelectorAll('[role="row"]')).filter(function (row) {
      return row.querySelector('button[aria-label="Remove"]');
    });

    rows.forEach(function (row) {
      var span = row.querySelector('span[data-rsp-slot="text"]');
      var name = normalizeBrandName((span && span.textContent) || row.getAttribute('aria-label') || '');
      if (!name || name.indexOf('__') === 0) return;
      if (marketState.selected.indexOf(name) >= 0) {
        if (row.parentElement) row.parentElement.removeChild(row);
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
    var root = findSectionRoot('Market Tracking');
    if (!root) return;

    var template = root.querySelector('[role="row"]');
    var host = template && template.parentElement;
    if (!template || !host) {
      marketState.selected = DEFAULT_SELECTED.slice();
      return;
    }

    Array.from(host.querySelectorAll('[role="row"]')).forEach(function (row) {
      if (row.querySelector('button[aria-label="Remove"]')) host.removeChild(row);
    });
    marketState.tagRows = {};
    marketState.selected = [];

    DEFAULT_SELECTED.forEach(function (name) {
      var row = template.cloneNode(true);
      row.removeAttribute('id');
      row.querySelectorAll('[id]').forEach(function (el) {
        el.removeAttribute('id');
      });
      var span = row.querySelector('span[data-rsp-slot="text"]');
      if (span) span.textContent = name;
      row.setAttribute('aria-label', name);
      host.appendChild(row);
      marketState.tagRows[name] = row;
      marketState.selected.push(name);
      wireRemoveButton(row, name);
    });
  }

  function isSelected(name) {
    return marketState.selected.indexOf(name) >= 0;
  }

  function setEntryVisible(entry, visible) {
    if (!entry) return;
    if (visible) {
      resetLineGraphics(entry);
      return;
    }
    if (entry.path) {
      entry.path.classList.add(HIDDEN_LINE_CLASS);
      entry.path.setAttribute('stroke-opacity', '0');
    }
    if (entry.legendEl) entry.legendEl.classList.add(HIDDEN_LEGEND_CLASS);
  }

  /** Keep all market lines visible — hiding paths caused flicker/disappear on frozen SVG. */
  function applyBrandVisibility() {
    ensureLinesVisible();
  }

  function removeBrand(name) {
    var row = marketState.tagRows[name];
    if (row && row.parentElement) row.parentElement.removeChild(row);
    delete marketState.tagRows[name];
    marketState.selected = marketState.selected.filter(function (b) {
      return b !== name;
    });
    applyBrandVisibility();
    if (marketState.picker) marketState.picker.renderMenu();
  }

  function addBrand(name) {
    if (isSelected(name) || marketState.selected.length >= MAX_BRANDS) return;

    var template =
      marketState.tagRows[Object.keys(marketState.tagRows)[0]] ||
      (findSectionRoot('Market Tracking') &&
        findSectionRoot('Market Tracking').querySelector('[role="row"]'));
    if (!template || !template.parentElement) return;

    var row = template.cloneNode(true);
    row.removeAttribute('id');
    row.querySelectorAll('[id]').forEach(function (el) {
      el.removeAttribute('id');
    });
    var span = row.querySelector('span[data-rsp-slot="text"]');
    if (span) span.textContent = name;
    row.setAttribute('aria-label', name);
    template.parentElement.appendChild(row);
    marketState.tagRows[name] = row;
    wireRemoveButton(row, name);
    marketState.selected.push(name);
    applyBrandVisibility();
    if (marketState.picker) marketState.picker.renderMenu();
  }

  function availableBrands() {
    return ALL_BRANDS.filter(function (b) {
      return !isSelected(b);
    });
  }

  function findSelectOthersCombobox() {
    var root = findSectionRoot('Market Tracking');
    if (!root) return null;
    var combos = Array.from(root.querySelectorAll('[role="combobox"]'));
    return (
      combos.find(function (el) {
        return (el.getAttribute('aria-label') || '').toLowerCase().indexOf('select') >= 0;
      }) ||
      combos[0] ||
      null
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
      avail.forEach(function (brand) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sky-llm-date-option';
        btn.setAttribute('role', 'option');
        btn.textContent = brand;
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          addBrand(brand);
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

    marketState.entries = [];
    cacheChartLines('Brand Mentions', 'mentions');
    cacheChartLines('Brand Citations', 'citations');

    ensureDefaultTags();
    if (!marketState.selected.length) {
      marketState.selected = DEFAULT_SELECTED.slice();
    }

    buildSelectOthersPicker();
    ensureLinesVisible();
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
          if (/vs last week/i.test(el.textContent)) return el;
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
    applyBrandVisibility: applyBrandVisibility,
    ensureLinesVisible: ensureLinesVisible,
    showAllLines: showAllLines,
    applyTrends: applyTrends,
    isLineVisible: function (path) {
      if (!path) return true;
      var group = path.closest && path.closest('g.recharts-line, g.recharts-layer.recharts-line');
      if (!group) return true;
      return !group.classList.contains(HIDDEN_LINE_CLASS);
    },
    resetAllMarketLines: showAllLines,
  };

  function boot() {
    cacheTrendNodes();
    ensureLinesVisible();
    if (findSectionRoot('Market Tracking')) initMarketTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.setTimeout(boot, 1200);
  window.setTimeout(function () {
    if (!marketState.ready) initMarketTracking();
    ensureLinesVisible();
  }, 1800);
})();
