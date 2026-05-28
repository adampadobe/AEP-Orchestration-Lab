/**
 * Market Tracking brand filter (Brand Presence) + KPI trend labels (all snapshot pages).
 */
(function () {
  'use strict';

  var UK_BRANDS = ['Sky', 'Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+'];
  var MAX_BRANDS = 5;

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
    legendByBrand: {},
    tagRows: {},
    tagContainer: null,
    pickerHost: null,
  };

  var trendState = { nodes: {} };

  function findSectionRoot(title) {
    var heads = Array.from(document.querySelectorAll('div, span, h2, h3')).filter(function (n) {
      return n.textContent.trim() === title && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 10 && root; i++) {
      if (root.querySelector('svg.recharts-surface')) return root;
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
    for (var i = 0; i < 12 && walk; i++) {
      var svg = walk.querySelector('svg.recharts-surface[role="application"]');
      if (svg) return { root: walk, svg: svg };
      walk = walk.parentElement;
    }
    return null;
  }

  function clampChartOverflow(svg) {
    if (!svg) return;
    var node = svg.parentElement;
    for (var i = 0; i < 10 && node; i++) {
      node.classList.add('sky-llm-chart-overflow');
      node = node.parentElement;
    }
    svg.style.overflow = 'hidden';
  }

  function brandFromLegend(text) {
    var t = (text || '').trim();
    if (t === 'Wix' || t === 'Webflow') return 'TalkTalk';
    if (t === 'Adobe') return 'Sky';
    if (t === 'Automattic') return 'BT';
    if (t === 'Contentful') return 'TalkTalk';
    return t;
  }

  function cacheChartLines(chartTitle, key) {
    var block = findChartBlock(chartTitle);
    if (!block) return;
    clampChartOverflow(block.svg);
    var legends = Array.from(block.svg.querySelectorAll('.recharts-legend-item-text')).map(function (el) {
      return brandFromLegend(el.textContent);
    });
    var lineGroups = Array.from(block.svg.querySelectorAll('g.recharts-line'));
    lineGroups.forEach(function (g, idx) {
      var name = legends[idx];
      if (!name) return;
      if (!marketState.linesByBrand[name]) marketState.linesByBrand[name] = {};
      var path = g.querySelector('path');
      if (path) marketState.linesByBrand[name][key] = { group: g, path: path, legendEl: block.svg.querySelectorAll('.recharts-legend-item')[idx] };
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
    var rows = Array.from(root.querySelectorAll('[role="row"][data-allows-removing="true"], [role="row"][aria-selected="true"]'));
    if (!rows.length) {
      rows = Array.from(root.querySelectorAll('[role="row"]')).filter(function (row) {
        return row.querySelector('button[aria-label="Remove"]');
      });
    }
    rows.forEach(function (row) {
      var span = row.querySelector('span[data-rsp-slot="text"]');
      var name = brandFromLegend((span && span.textContent) || row.getAttribute('aria-label') || '');
      if (!name) return;
      if (marketState.selected.indexOf(name) >= 0) {
        row.remove();
        return;
      }
      marketState.selected.push(name);
      marketState.tagRows[name] = row;
      var removeBtn = row.querySelector('button[aria-label="Remove"]');
      if (removeBtn && removeBtn.dataset.skyLlmRemoveWired !== '1') {
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
    });
  }

  function setLineVisible(name, visible) {
    var entry = marketState.linesByBrand[name];
    if (!entry) return;
    Object.keys(entry).forEach(function (key) {
      var item = entry[key];
      if (item.group) item.group.style.display = visible ? '' : 'none';
      if (item.legendEl) item.legendEl.style.display = visible ? '' : 'none';
    });
  }

  function applyBrandVisibility() {
    UK_BRANDS.forEach(function (name) {
      setLineVisible(name, marketState.selected.indexOf(name) >= 0);
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
    renderPickerMenu();
  }

  function addBrand(name) {
    if (marketState.selected.indexOf(name) >= 0) return;
    if (marketState.selected.length >= MAX_BRANDS) return;
    marketState.selected.push(name);
    var template = Object.keys(marketState.tagRows).length
      ? marketState.tagRows[Object.keys(marketState.tagRows)[0]]
      : null;
    if (template && template.parentElement) {
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
      var removeBtn = row.querySelector('button[aria-label="Remove"]');
      if (removeBtn) {
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
    }
    setLineVisible(name, true);
    renderPickerMenu();
  }

  function availableBrands() {
    return UK_BRANDS.filter(function (b) {
      return marketState.selected.indexOf(b) < 0;
    });
  }

  function findSelectOthersCombobox() {
    var root = findSectionRoot('Market Tracking');
    if (!root) return null;
    return Array.from(root.querySelectorAll('[role="combobox"]')).find(function (el) {
      var label = (el.getAttribute('aria-label') || '').toLowerCase();
      var near = el.closest('div');
      var text = near ? near.textContent : '';
      return label.indexOf('select') >= 0 || text.indexOf('Select others') >= 0;
    });
  }

  function renderPickerMenu() {
    if (!marketState.pickerMenu) return;
    marketState.pickerMenu.innerHTML = '';
    var avail = availableBrands();
    if (!avail.length) {
      var empty = document.createElement('li');
      empty.textContent = 'Maximum of 5 brands reached';
      empty.style.padding = '0.5rem 0.75rem';
      empty.style.color = '#6e6e6e';
      marketState.pickerMenu.appendChild(empty);
      return;
    }
    avail.forEach(function (name) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sky-llm-date-option';
      btn.textContent = name;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        addBrand(name);
        marketState.pickerMenu.hidden = true;
        marketState.pickerTrigger.setAttribute('aria-expanded', 'false');
      });
      li.appendChild(btn);
      marketState.pickerMenu.appendChild(li);
    });
  }

  function buildSelectOthersPicker() {
    var combobox = findSelectOthersCombobox();
    if (!combobox || combobox.parentElement.querySelector('.sky-llm-select-others-host')) return;
    var shell = combobox.parentElement;
    shell.classList.add('sky-llm-platform-shell');
    combobox.setAttribute('tabindex', '-1');
    Array.from(shell.querySelectorAll('button')).forEach(function (btn) {
      if (btn.getAttribute('aria-label') === 'Show suggestions') btn.style.display = 'none';
    });

    var host = document.createElement('div');
    host.className = 'sky-llm-select-others-host sky-llm-date-host';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sky-llm-date-trigger';
    trigger.innerHTML =
      '<span>Select others…</span><span class="sky-llm-date-trigger-chevron" aria-hidden="true">▼</span>';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    var menu = document.createElement('ul');
    menu.className = 'sky-llm-date-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      renderPickerMenu();
      menu.hidden = !menu.hidden;
      trigger.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });

    host.appendChild(trigger);
    host.appendChild(menu);
    shell.insertBefore(host, combobox);
    marketState.pickerHost = host;
    marketState.pickerTrigger = trigger;
    marketState.pickerMenu = menu;
    renderPickerMenu();
  }

  function initMarketTracking() {
    if (!findSectionRoot('Market Tracking')) return;
    marketState.linesByBrand = {};
    cacheChartLines('Brand Mentions', 'mentions');
    cacheChartLines('Brand Citations', 'citations');
    readTagRows();
    if (!marketState.selected.length) {
      marketState.selected = ['Sky', 'Virgin Media', 'BT', 'TalkTalk', 'Netflix'].slice(0, MAX_BRANDS);
    }
    applyBrandVisibility();
    buildSelectOthersPicker();
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
  window.setTimeout(boot, 900);
})();
