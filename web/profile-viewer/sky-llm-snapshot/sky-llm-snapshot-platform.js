/**
 * Functional Platform picker + light metric updates on frozen overview snapshot.
 */
(function () {
  'use strict';

  var PLATFORMS = [
    { id: 'chatgpt-free', name: 'ChatGPT (Free)', share: '49 % global market share', icon: 'openai' },
    { id: 'gemini', name: 'Gemini', share: '19 % global market share', icon: 'gemini' },
    { id: 'google-ai-mode', name: 'Google AI Mode', share: '17 % global market share', icon: 'google' },
    { id: 'copilot', name: 'Microsoft Copilot', share: '3 % global market share', icon: 'microsoft' },
    { id: 'chatgpt-paid', name: 'ChatGPT (Paid)', share: '2 % global market share', icon: 'openai' },
    { id: 'perplexity', name: 'Perplexity', share: '2 % global market share', icon: 'perplexity' },
    { id: 'google-overview', name: 'Google AI Overview', share: '1 % global market share', icon: 'google' },
  ];

  var METRICS = {
    'chatgpt-free': { visibility: '36%', mentions: '24', citations: '0', agentic: '215', referral: '0' },
    gemini: { visibility: '41%', mentions: '31', citations: '2', agentic: '188', referral: '12' },
    'google-ai-mode': { visibility: '38%', mentions: '27', citations: '1', agentic: '201', referral: '8' },
    copilot: { visibility: '29%', mentions: '18', citations: '0', agentic: '142', referral: '4' },
    'chatgpt-paid': { visibility: '44%', mentions: '35', citations: '3', agentic: '198', referral: '6' },
    perplexity: { visibility: '33%', mentions: '22', citations: '4', agentic: '156', referral: '19' },
    'google-overview': { visibility: '37%', mentions: '26', citations: '1', agentic: '175', referral: '5' },
  };

  var MARKET = {
    'chatgpt-free': [
      { name: 'Sky', cite: 72, mention: 18 },
      { name: 'Virgin Media', cite: 65, mention: 22 },
      { name: 'BT', cite: 58, mention: 28 },
      { name: 'TalkTalk', cite: 42, mention: 30 },
      { name: 'Netflix', cite: 48, mention: 24 },
    ],
    gemini: [
      { name: 'Sky', cite: 78, mention: 15 },
      { name: 'Virgin Media', cite: 68, mention: 20 },
      { name: 'BT', cite: 60, mention: 26 },
      { name: 'Disney+', cite: 52, mention: 22 },
      { name: 'TalkTalk', cite: 40, mention: 32 },
    ],
    'google-ai-mode': [
      { name: 'Sky', cite: 74, mention: 17 },
      { name: 'Virgin Media', cite: 66, mention: 21 },
      { name: 'BT', cite: 62, mention: 24 },
      { name: 'Netflix', cite: 50, mention: 26 },
      { name: 'TalkTalk', cite: 44, mention: 28 },
    ],
    copilot: [
      { name: 'Sky', cite: 68, mention: 19 },
      { name: 'BT', cite: 61, mention: 27 },
      { name: 'Virgin Media', cite: 59, mention: 23 },
      { name: 'TalkTalk', cite: 38, mention: 34 },
      { name: 'Netflix', cite: 45, mention: 28 },
    ],
    'chatgpt-paid': [
      { name: 'Sky', cite: 80, mention: 14 },
      { name: 'Virgin Media', cite: 70, mention: 18 },
      { name: 'BT', cite: 64, mention: 22 },
      { name: 'Netflix', cite: 58, mention: 20 },
      { name: 'Disney+', cite: 52, mention: 24 },
    ],
    perplexity: [
      { name: 'Sky', cite: 71, mention: 16 },
      { name: 'Virgin Media', cite: 64, mention: 22 },
      { name: 'BT', cite: 55, mention: 28 },
      { name: 'TalkTalk', cite: 41, mention: 31 },
      { name: 'Netflix', cite: 47, mention: 27 },
    ],
    'google-overview': [
      { name: 'Sky', cite: 73, mention: 18 },
      { name: 'Virgin Media', cite: 67, mention: 21 },
      { name: 'BT', cite: 60, mention: 25 },
      { name: 'Netflix', cite: 48, mention: 27 },
      { name: 'TalkTalk', cite: 43, mention: 29 },
    ],
  };

  var state = { platformId: 'chatgpt-free', metricNodes: {}, marketRows: [] };

  function iconSvg(type) {
    if (type === 'openai') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 00-5.2 11.6L4 18l4.4-2.8A7 7 0 1012 2z"/></svg>';
    }
    if (type === 'gemini') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M12 2l2.4 6.8L22 12l-7.6 3.2L12 22l-2.4-6.8L2 12l7.6-3.2L12 2z"/></svg>';
    }
    if (type === 'google') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#4285f4"/><text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="700">G</text></svg>';
    }
    if (type === 'microsoft') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" fill="#f25022"/><rect x="13" y="3" width="8" height="8" fill="#7fba00"/><rect x="3" y="13" width="8" height="8" fill="#00a4ef"/><rect x="13" y="13" width="8" height="8" fill="#ffb900"/></svg>';
    }
    if (type === 'perplexity') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#20808d"/><path fill="#fff" d="M8 7h3v10H8zm5 0h3v10h-3z"/></svg>';
    }
    return '';
  }

  function findPlatformCombobox() {
    return Array.from(document.querySelectorAll('[role="combobox"]')).find(function (el) {
      var label = (el.getAttribute('aria-label') || '').toLowerCase();
      return label.indexOf('platform') >= 0;
    });
  }

  function findLabelledField(combobox) {
    var node = combobox;
    for (var i = 0; i < 8 && node; i++) {
      if (node.querySelector && node.querySelector('label')) return node;
      node = node.parentElement;
    }
    return combobox.parentElement;
  }

  function findMetricValueNode(labelText) {
    var labelNodes = Array.from(document.querySelectorAll('div, span, p, h2, h3')).filter(function (n) {
      return n.childElementCount === 0 && n.textContent.trim() === labelText;
    });
    for (var i = 0; i < labelNodes.length; i++) {
      var walk = labelNodes[i].parentElement;
      for (var d = 0; d < 6 && walk; d++) {
        var candidates = walk.querySelectorAll('div, span, p');
        for (var c = 0; c < candidates.length; c++) {
          var el = candidates[c];
          if (el.childElementCount > 0) continue;
          var t = el.textContent.trim();
          if (/^\d{1,3}%?$/.test(t) && el !== labelNodes[i]) {
            return el;
          }
        }
        walk = walk.parentElement;
      }
    }
    return null;
  }

  function cacheMetricNodes() {
    state.metricNodes = {
      visibility: findMetricValueNode('Visibility Score'),
      mentions: findMetricValueNode('Brand Mentions'),
      citations: findMetricValueNode('Citations'),
      agentic: findMetricValueNode('Agentic Interactions'),
      referral: findMetricValueNode('Total Referral Traffic from LLMs'),
    };
  }

  function findMarketChartRoot() {
    var heads = Array.from(document.querySelectorAll('div, span, h2, h3')).filter(function (n) {
      return n.textContent.trim() === 'Market Comparison' && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].closest('div');
    for (var i = 0; i < 6 && root; i++) {
      if (root.querySelector('svg.recharts-surface')) return root;
      root = root.parentElement;
    }
    return null;
  }

  function cacheMarketRows() {
    state.marketRows = [];
    var root = findMarketChartRoot();
    if (!root) return;
    var svg = root.querySelector('svg.recharts-surface');
    if (!svg) return;

    var labels = Array.from(svg.querySelectorAll('text')).filter(function (t) {
      var txt = (t.textContent || '').trim();
      return txt && txt.length < 24 && !/^\d+%?$/.test(txt) && txt !== 'Market Comparison';
    });

    labels.forEach(function (labelEl) {
      var name = labelEl.textContent.trim();
      var y = Number(labelEl.getAttribute('y')) || 0;
      var bars = Array.from(svg.querySelectorAll('rect')).filter(function (r) {
        var ry = Number(r.getAttribute('y')) || 0;
        var h = Number(r.getAttribute('height')) || 0;
        return Math.abs(ry - y) < 18 || Math.abs(ry + h - y) < 18;
      });
      if (bars.length >= 2) {
        state.marketRows.push({ name: name, labelEl: labelEl, citeBar: bars[0], mentionBar: bars[1] });
      } else if (bars.length === 1) {
        state.marketRows.push({ name: name, labelEl: labelEl, citeBar: bars[0], mentionBar: null });
      }
    });
  }

  function applyMetrics(platformId) {
    var m = METRICS[platformId] || METRICS['chatgpt-free'];
    var map = {
      visibility: m.visibility,
      mentions: m.mentions,
      citations: m.citations,
      agentic: m.agentic,
      referral: m.referral,
    };
    Object.keys(map).forEach(function (key) {
      var node = state.metricNodes[key];
      if (node) node.textContent = map[key];
    });
  }

  function applyMarket(platformId) {
    var rows = MARKET[platformId] || MARKET['chatgpt-free'];
    var root = findMarketChartRoot();
    if (!root) return;
    var svg = root.querySelector('svg.recharts-surface');
    if (!svg) return;

    var hBars = Array.from(svg.querySelectorAll('rect')).filter(function (r) {
      return Number(r.getAttribute('width') || 0) > Number(r.getAttribute('height') || 0) * 2;
    });
    hBars.sort(function (a, b) {
      return Number(a.getAttribute('y') || 0) - Number(b.getAttribute('y') || 0);
    });

    var labelTexts = Array.from(svg.querySelectorAll('text')).filter(function (t) {
      var txt = (t.textContent || '').trim();
      return txt && !/^\d/.test(txt) && txt.length < 20;
    });
    labelTexts.sort(function (a, b) {
      return Number(a.getAttribute('y') || 0) - Number(b.getAttribute('y') || 0);
    });

    rows.forEach(function (row, idx) {
      if (labelTexts[idx]) labelTexts[idx].textContent = row.name;
      var citeBar = hBars[idx * 2];
      var mentionBar = hBars[idx * 2 + 1];
      var baseX = citeBar ? Number(citeBar.getAttribute('x') || 80) : 80;
      var maxW = 280;
      if (citeBar) {
        citeBar.setAttribute('width', String(Math.round((row.cite / 100) * maxW)));
        citeBar.setAttribute('x', String(baseX));
      }
      if (mentionBar) {
        var citeW = citeBar ? Number(citeBar.getAttribute('width') || 0) : 0;
        mentionBar.setAttribute('x', String(baseX + citeW));
        mentionBar.setAttribute('width', String(Math.round((row.mention / 100) * maxW * 0.35)));
      }
    });
  }

  function applyPlatform(platformId) {
    state.platformId = platformId;
    applyMetrics(platformId);
    applyMarket(platformId);
  }

  function buildPicker(combobox) {
    var field = findLabelledField(combobox);
    if (!field || field.querySelector('.sky-llm-platform-host')) return;

    combobox.classList.add('sky-llm-platform-native');
    combobox.setAttribute('tabindex', '-1');

    var host = document.createElement('div');
    host.className = 'sky-llm-platform-host';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sky-llm-platform-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    var menu = document.createElement('ul');
    menu.className = 'sky-llm-platform-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    function renderTrigger() {
      var p = PLATFORMS.find(function (x) {
        return x.id === state.platformId;
      });
      trigger.innerHTML =
        '<span>' +
        (p ? p.name : 'ChatGPT (Free)') +
        '</span><span class="sky-llm-platform-trigger-chevron" aria-hidden="true">▼</span>';
    }

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      menu.innerHTML = '';
      PLATFORMS.forEach(function (p) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sky-llm-platform-option' + (p.id === state.platformId ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        btn.innerHTML =
          '<span class="sky-llm-platform-check" aria-hidden="true">✓</span>' +
          iconSvg(p.icon) +
          '<span class="sky-llm-platform-copy"><strong>' +
          p.name +
          '</strong><span>' +
          p.share +
          '</span></span>';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          applyPlatform(p.id);
          renderTrigger();
          closeMenu();
        });
        li.appendChild(btn);
        menu.appendChild(li);
      });
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    host.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    document.addEventListener('click', function () {
      closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    host.appendChild(trigger);
    host.appendChild(menu);
    field.insertBefore(host, combobox);
    renderTrigger();
  }

  function init() {
    cacheMetricNodes();
    cacheMarketRows();
    var combobox = findPlatformCombobox();
    if (combobox) buildPicker(combobox);
    applyPlatform(state.platformId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.setTimeout(init, 800);
})();
