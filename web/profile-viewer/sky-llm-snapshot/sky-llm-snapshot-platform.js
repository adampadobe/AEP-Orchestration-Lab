/**
 * Functional Platform picker + metric / chart updates on frozen overview snapshot.
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

  /** Stacked sentiment per date column: positive / neutral / negative (sum 100). */
  var SENTIMENT = {
    'chatgpt-free': [
      { pos: 33, neu: 67, neg: 0 },
      { pos: 26, neu: 70, neg: 4 },
      { pos: 15, neu: 85, neg: 0 },
    ],
    gemini: [
      { pos: 38, neu: 58, neg: 4 },
      { pos: 32, neu: 62, neg: 6 },
      { pos: 22, neu: 72, neg: 6 },
    ],
    'google-ai-mode': [
      { pos: 35, neu: 63, neg: 2 },
      { pos: 28, neu: 68, neg: 4 },
      { pos: 18, neu: 78, neg: 4 },
    ],
    copilot: [
      { pos: 28, neu: 68, neg: 4 },
      { pos: 22, neu: 72, neg: 6 },
      { pos: 14, neu: 80, neg: 6 },
    ],
    'chatgpt-paid': [
      { pos: 40, neu: 55, neg: 5 },
      { pos: 34, neu: 60, neg: 6 },
      { pos: 24, neu: 70, neg: 6 },
    ],
    perplexity: [
      { pos: 30, neu: 65, neg: 5 },
      { pos: 24, neu: 70, neg: 6 },
      { pos: 16, neu: 78, neg: 6 },
    ],
    'google-overview': [
      { pos: 34, neu: 62, neg: 4 },
      { pos: 27, neu: 67, neg: 6 },
      { pos: 17, neu: 79, neg: 4 },
    ],
  };

  var SENTIMENT_BASE_Y = 186;
  var SENTIMENT_TOP_Y = 20;
  var SENTIMENT_BAR_W = 40;
  var MARKET_CITE_MAX = 980;
  var MARKET_MENTION_MAX = 155;

  var state = {
    platformId: 'chatgpt-free',
    metricNodes: {},
    marketRows: [],
    sentimentColumns: [],
  };

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

  function findSectionRoot(title) {
    var heads = Array.from(document.querySelectorAll('div, span, h2, h3')).filter(function (n) {
      return n.textContent.trim() === title && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 8 && root; i++) {
      if (root.querySelector('svg.recharts-surface')) return root;
      root = root.parentElement;
    }
    return null;
  }

  function findMarketChartSvg() {
    var root = findSectionRoot('Market Comparison');
    if (!root) return null;
    var svgs = root.querySelectorAll('svg.recharts-surface');
    return svgs.length ? svgs[svgs.length - 1] : null;
  }

  function findSentimentChartSvg() {
    var root = findSectionRoot('Sentiment Distribution');
    if (!root) return null;
    var svgs = root.querySelectorAll('svg.recharts-surface');
    for (var i = svgs.length - 1; i >= 0; i--) {
      var barPaths = svgs[i].querySelectorAll('path[fill="#047857"], path[fill="#4B5563"]');
      if (barPaths.length >= 2) return svgs[i];
    }
    return svgs.length ? svgs[svgs.length - 1] : null;
  }

  function pathBarY(d) {
    var m = (d || '').match(/M\s*[\d.]+\s*,\s*([\d.]+)/);
    return m ? Number(m[1]) : 0;
  }

  function pathBarX(d) {
    var m = (d || '').match(/M\s*([\d.]+)\s*,/);
    return m ? Number(m[1]) : 0;
  }

  function makeStackPath(x, yTop, yBottom) {
    var x2 = x + SENTIMENT_BAR_W;
    return 'M' + x + ',' + yTop + 'L ' + x2 + ',' + yTop + 'L ' + x2 + ',' + yBottom + 'L ' + x + ',' + yBottom + 'Z';
  }

  function makeMarketPath(x, y, width) {
    var w = Math.max(0, width);
    return 'M ' + x + ',' + y + ' h ' + w + ' v 32 h -' + w + ' Z';
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

  function cacheMarketRows() {
    state.marketRows = [];
    var svg = findMarketChartSvg();
    if (!svg) return;

    var paths = Array.from(svg.querySelectorAll('path')).filter(function (p) {
      return (p.getAttribute('d') || '').indexOf(' h ') >= 0;
    });
    var citePaths = paths
      .filter(function (p) {
        return p.getAttribute('fill') === '#3B82F6';
      })
      .sort(function (a, b) {
        return pathBarY(a.getAttribute('d')) - pathBarY(b.getAttribute('d'));
      });
    var mentionPaths = paths
      .filter(function (p) {
        return p.getAttribute('fill') === '#F97316';
      })
      .sort(function (a, b) {
        return pathBarY(a.getAttribute('d')) - pathBarY(b.getAttribute('d'));
      });

    var labels = Array.from(svg.querySelectorAll('text'))
      .filter(function (t) {
        var txt = (t.textContent || '').trim();
        return txt && txt.length < 28 && !/^\d/.test(txt) && txt.indexOf('%') < 0;
      })
      .sort(function (a, b) {
        return Number(a.getAttribute('y') || 0) - Number(b.getAttribute('y') || 0);
      });

    citePaths.forEach(function (citePath, idx) {
      state.marketRows.push({
        citePath: citePath,
        mentionPath: mentionPaths[idx] || null,
        labelEl: labels[idx] || null,
        y: pathBarY(citePath.getAttribute('d')),
      });
    });
  }

  function cacheSentimentColumns() {
    state.sentimentColumns = [];
    var svg = findSentimentChartSvg();
    if (!svg) return;

    var byX = {};
    Array.from(svg.querySelectorAll('path')).forEach(function (p) {
      var d = p.getAttribute('d') || '';
      if (d.indexOf('L') < 0) return;
      var fill = p.getAttribute('fill');
      if (fill !== '#047857' && fill !== '#4B5563' && fill !== '#B91C1C') return;
      var x = String(pathBarX(d));
      if (!byX[x]) byX[x] = { x: Number(x), pos: null, neu: null, neg: null };
      if (fill === '#047857') byX[x].pos = p;
      else if (fill === '#4B5563') byX[x].neu = p;
      else byX[x].neg = p;
    });

    state.sentimentColumns = Object.keys(byX)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (key) {
        return byX[key];
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
    rows.forEach(function (row, idx) {
      var cached = state.marketRows[idx];
      if (!cached || !cached.citePath) return;
      var y = cached.y;
      var citeW = (row.cite / 100) * MARKET_CITE_MAX;
      var mentionW = (row.mention / 100) * MARKET_MENTION_MAX;
      cached.citePath.setAttribute('d', makeMarketPath(83, y, citeW));
      if (cached.mentionPath) {
        cached.mentionPath.setAttribute('d', makeMarketPath(83 + citeW, y, mentionW));
      }
      if (cached.labelEl) {
        cached.labelEl.textContent = row.name.replace(/⭐\s*/g, '').trim();
      }
    });
  }

  function applySentiment(platformId) {
    var cols = SENTIMENT[platformId] || SENTIMENT['chatgpt-free'];
    var totalH = SENTIMENT_BASE_Y - SENTIMENT_TOP_Y;

    cols.forEach(function (seg, idx) {
      var column = state.sentimentColumns[idx];
      if (!column) return;
      var x = column.x;
      var posH = (seg.pos / 100) * totalH;
      var neuH = (seg.neu / 100) * totalH;
      var negH = (seg.neg / 100) * totalH;
      var posTop = SENTIMENT_BASE_Y - posH;
      var neuTop = posTop - neuH;
      var negTop = SENTIMENT_TOP_Y;

      if (column.pos) {
        column.pos.setAttribute('d', makeStackPath(x, posTop, SENTIMENT_BASE_Y));
      }
      if (column.neu) {
        column.neu.setAttribute('d', makeStackPath(x, neuTop, posTop));
      }
      if (column.neg) {
        if (negH > 0.5) {
          column.neg.setAttribute('d', makeStackPath(x, negTop, neuTop));
        } else {
          column.neg.setAttribute('d', makeStackPath(x, negTop, negTop));
        }
      }
    });
  }

  function applyPlatform(platformId) {
    state.platformId = platformId;
    applyMetrics(platformId);
    applyMarket(platformId);
    applySentiment(platformId);
  }

  function buildPicker(combobox) {
    var shell = combobox.parentElement;
    if (!shell || shell.querySelector('.sky-llm-platform-host')) return;

    shell.classList.add('sky-llm-platform-shell');
    combobox.setAttribute('tabindex', '-1');

    var host = document.createElement('div');
    host.className = 'sky-llm-platform-host';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sky-llm-platform-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Platform');

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
    shell.insertBefore(host, combobox);
    renderTrigger();
  }

  function init() {
    cacheMetricNodes();
    cacheMarketRows();
    cacheSentimentColumns();
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
