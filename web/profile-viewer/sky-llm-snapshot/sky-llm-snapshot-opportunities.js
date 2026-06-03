/**
 * Opportunities — onsite technical/content cards + detail drill-down views.
 */
(function () {
  'use strict';

  var ONSITE_ORDER = ['404', '503', 'recover'];
  var CONTENT_ORDER = ['simplify', 'llm-summaries'];

  var ONSITE_CARDS = {
    '404': {
      title: 'Agentic Traffic 404s Analysis',
      date: 'Sun, May 17, 2026',
      tag: 'Technical SEO',
      metric1: '2',
      label1: 'URLs affected',
      metric2: '2',
      label2: 'Total hits lost',
    },
    '503': {
      title: 'Agentic Traffic 503s Analysis',
      date: 'Sun, May 17, 2026',
      tag: 'Technical SEO',
      metric1: '1',
      label1: 'URLs affected',
      metric2: '2',
      label2: 'Total hits lost',
    },
    recover: {
      title: 'Recover Content Visibility',
      date: 'Mon, May 11, 2026',
      tag: 'Technical SEO',
      metric1: '1',
      label1: 'URLs affected',
      metric2: '+1.1x',
      label2: 'Estimated Content Gain',
    },
  };

  var CONTENT_CARDS = {
    simplify: {
      title: 'Simplify Complex Content',
      date: 'Mon, May 18, 2026',
      tag: 'Content Opportunity',
    },
    'llm-summaries': {
      title: 'Add LLM-Friendly Summaries',
      date: 'Mon, May 4, 2026',
      tag: 'Content Opportunity',
    },
  };

  var DETAIL_VIEWS = {
    '404': {
      kind: 'table',
      title: 'Agentic Traffic 404s Analysis',
      subtitle: 'Analysis of 404 errors detected by AI agents crawling your site',
      kpi1Label: 'Total URLs',
      kpi1Value: '2',
      kpi2Label: 'Total Hits',
      kpi2Value: '2',
      summary:
        'Found 2 URLs returning 404 errors with 2 total hits from AI agents, representing significant lost traffic potential.',
      sectionTitle: '404 Errors Details',
      tableHeaders: ['Url', 'Total', 'Week 19, 2024', 'Week 20, 2024'],
      rows: [
        ['https://sky.com/content/status', '1', '1', '—'],
        ['https://sky.com/content/status', '1', '—', '1'],
      ],
    },
    '503': {
      kind: 'table',
      title: 'Agentic Traffic 503s Analysis',
      subtitle: 'Analysis of 503 errors detected by AI agents crawling your site',
      kpi1Label: 'Total URLs',
      kpi1Value: '1',
      kpi2Label: 'Total Hits',
      kpi2Value: '2',
      summary:
        'Found 1 URL returning 503 errors with 2 total hits from AI agents, indicating intermittent availability issues.',
      sectionTitle: '503 Errors Details',
      tableHeaders: ['Url', 'Total', 'Week 19, 2024', 'Week 20, 2024'],
      rows: [['https://sky.com/help/server-status', '1', '1', '1']],
    },
    recover: { kind: 'recover' },
    simplify: { kind: 'content-op-simplify' },
    'llm-summaries': { kind: 'content-op-summaries' },
  };

  var TITLE_TO_ID = {
    'Agentic Traffic 404s Analysis': '404',
    'Agentic Traffic 503s Analysis': '503',
    'Recover Content Visibility': 'recover',
    'Simplify Complex Content': 'simplify',
    'Add LLM-Friendly Summaries': 'llm-summaries',
    'Information gain for GEO': 'simplify',
    'Information gain for GEO ': 'simplify',
  };

  var HASH_IDS = '404|503|recover|simplify|llm-summaries';

  var state = {
    listCanvas: null,
    detailEl: null,
    onsiteHost: null,
    contentHost: null,
    contentTemplate: null,
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function findLeaf(title) {
    return Array.from(document.querySelectorAll('div, span, h1, h2, h3')).find(function (n) {
      return n.childElementCount === 0 && n.textContent.trim() === title;
    });
  }

  function findOpportunitiesHeading() {
    var h1 = Array.from(document.querySelectorAll('h1')).find(function (n) {
      return n.textContent.trim() === 'Opportunities';
    });
    if (h1) return h1;
    return findLeaf('Opportunities');
  }

  function findListCanvas() {
    if (state.listCanvas) return state.listCanvas;
    var head = findOpportunitiesHeading();
    if (!head) return null;
    var walk = head.parentElement;
    for (var i = 0; i < 18 && walk; i++) {
      if (walk.querySelector('[data-testid*="OppCard"]')) {
        state.listCanvas = walk;
        return walk;
      }
      walk = walk.parentElement;
    }
    return null;
  }

  function findOpportunitiesMain() {
    var head = findOpportunitiesHeading();
    if (!head) return findListCanvas();
    var walk = head.parentElement;
    for (var i = 0; i < 24 && walk; i++) {
      if (walk.contains(head) && walk.querySelector('[data-testid*="OppCard"]')) {
        return walk;
      }
      walk = walk.parentElement;
    }
    return findListCanvas();
  }

  function findSectionHost(sectionTitle) {
    var head = findLeaf(sectionTitle);
    if (!head) return null;
    var walk = head.parentElement;
    for (var i = 0; i < 14 && walk; i++) {
      if (walk.querySelector('[data-testid*="OppCard"]')) {
        return walk;
      }
      walk = walk.parentElement;
    }
    return head.parentElement;
  }

  function findOnsiteHost() {
    if (state.onsiteHost) return state.onsiteHost;
    state.onsiteHost = findSectionHost('Onsite Technical Optimizations');
    return state.onsiteHost;
  }

  function findContentHost() {
    if (state.contentHost) return state.contentHost;
    state.contentHost = findSectionHost('Onsite Content Optimizations');
    return state.contentHost;
  }

  function getCardTitle(card) {
    var titleEl = card.querySelector('[class*="CxHbm"]');
    if (titleEl) return titleEl.textContent.trim();
    return '';
  }

  function unblurCard(card) {
    if (!card) return;
    card.classList.add('sky-llm-op-card-clear');
    card.querySelectorAll('div[style]').forEach(function (el) {
      var s = el.getAttribute('style') || '';
      if (s.indexOf('blur') !== -1) {
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      }
    });
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
  }

  function setMetricBlock(block, value, label) {
    if (!block) return;
    var spans = block.querySelectorAll('[data-rsp-slot="text"]');
    if (spans[0]) spans[0].textContent = value;
    if (spans[1]) spans[1].textContent = label;
  }

  function patchTag(card, tagText) {
    if (!tagText) return;
    Array.from(card.querySelectorAll('span[data-rsp-slot="text"], div[data-rsp-slot="text"]')).forEach(
      function (el) {
        var t = el.textContent.trim();
        if (t === 'Technical GEO' || t === 'Technical SEO' || t === 'Content Opportunity') {
          el.textContent = tagText;
        }
      },
    );
  }

  function patchCard(card, config, options) {
    options = options || {};
    var titleEl = card.querySelector('[class*="CxHbm"]');
    if (titleEl) titleEl.textContent = config.title;

    Array.from(card.querySelectorAll('span[data-rsp-slot="text"]')).forEach(function (span) {
      if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(span.textContent.trim())) {
        span.textContent = config.date;
      }
    });

    patchTag(card, config.tag);

    var metricBlocks = card.querySelectorAll('[class*="kUNW0"]');
    if (options.hideMetrics) {
      metricBlocks.forEach(function (block) {
        block.style.display = 'none';
      });
    } else if (metricBlocks.length >= 2) {
      setMetricBlock(metricBlocks[0], config.metric1, config.label1);
      setMetricBlock(metricBlocks[1], config.metric2, config.label2);
    }

    unblurCard(card);
  }

  function findActionButton(card) {
    return Array.from(card.querySelectorAll('button, [role="button"]')).find(function (btn) {
      var t = btn.textContent.trim();
      return t === 'Details' || t === 'Preview';
    });
  }

  function ensureDetailsButton(card) {
    var btn = findActionButton(card);
    if (!btn) return null;
    Array.from(btn.querySelectorAll('[data-rsp-slot="text"], span')).forEach(function (el) {
      if (el.childElementCount === 0 && el.textContent.trim() === 'Preview') {
        el.textContent = 'Details';
      }
    });
    if (btn.childElementCount === 0 && btn.textContent.trim() === 'Preview') {
      btn.textContent = 'Details';
    }
    return btn;
  }

  function wireCardOpen(card, viewId) {
    if (!card || card.dataset.skyLlmOpCardWired === '1') return;
    card.dataset.skyLlmOpCardWired = '1';
    card.classList.add('sky-llm-op-card-clickable');
    var actionBtn = ensureDetailsButton(card);
    function openDetail(e) {
      e.preventDefault();
      e.stopPropagation();
      showDetail(viewId);
    }
    card.addEventListener('click', openDetail, false);
    if (actionBtn && actionBtn.dataset.skyLlmOpBtnWired !== '1') {
      actionBtn.dataset.skyLlmOpBtnWired = '1';
      actionBtn.addEventListener('click', openDetail, false);
    }
  }

  function reorderCards(host, order, byId) {
    if (!host) return;
    order.forEach(function (id) {
      var card = byId[id];
      if (card && card.parentElement === host) {
        host.appendChild(card);
      }
    });
  }

  function setupOnsiteCards() {
    var cards = Array.from(document.querySelectorAll('[data-testid*="OppCard"]'));
    if (!cards.length) return;

    var byId = {};
    cards.forEach(function (card) {
      var title = getCardTitle(card);
      var id = TITLE_TO_ID[title];
      if (id && ONSITE_CARDS[id]) byId[id] = card;
    });

    ONSITE_ORDER.forEach(function (id) {
      var card = byId[id];
      var config = ONSITE_CARDS[id];
      if (!card || !config) return;
      patchCard(card, config);
      wireCardOpen(card, id);
    });

    cards.forEach(function (card) {
      var title = getCardTitle(card);
      var id = TITLE_TO_ID[title];
      if (ONSITE_CARDS[id] || CONTENT_CARDS[id]) return;
      if (title.indexOf('Information gain') === 0) return;
      card.classList.add('sky-llm-op-card-hidden');
    });

    reorderCards(findOnsiteHost(), ONSITE_ORDER, byId);
  }

  function ensureContentCards() {
    var host = findContentHost();
    if (!host) return {};

    var cards = Array.from(host.querySelectorAll('[data-testid*="OppCard"]'));
    var byId = {};
    var template = cards[0];

    cards.forEach(function (card) {
      var title = getCardTitle(card);
      var id = TITLE_TO_ID[title];
      if (id && CONTENT_CARDS[id]) byId[id] = card;
    });

    if (!byId.simplify && template) {
      byId.simplify = template;
      patchCard(byId.simplify, CONTENT_CARDS.simplify, { hideMetrics: true });
      wireCardOpen(byId.simplify, 'simplify');
    }

    if (!byId['llm-summaries'] && byId.simplify) {
      var clone = byId.simplify.cloneNode(true);
      clone.dataset.skyLlmOpCloned = '1';
      clone.dataset.skyLlmOpCardWired = '';
      host.appendChild(clone);
      byId['llm-summaries'] = clone;
      patchCard(clone, CONTENT_CARDS['llm-summaries'], { hideMetrics: true });
      wireCardOpen(clone, 'llm-summaries');
    }

    CONTENT_ORDER.forEach(function (id) {
      var card = byId[id];
      var config = CONTENT_CARDS[id];
      if (!card || !config) return;
      patchCard(card, config, { hideMetrics: true });
      wireCardOpen(card, id);
      card.classList.remove('sky-llm-op-card-hidden');
    });

    Array.from(host.querySelectorAll('[data-testid*="OppCard"]')).forEach(function (card) {
      var title = getCardTitle(card);
      var id = TITLE_TO_ID[title];
      if (!CONTENT_CARDS[id]) {
        card.classList.add('sky-llm-op-card-hidden');
      }
    });

    reorderCards(host, CONTENT_ORDER, byId);
    return byId;
  }

  function buildTableDetailHtml(view) {
    var headers = view.tableHeaders
      .map(function (h) {
        return '<th>' + escapeHtml(h) + '</th>';
      })
      .join('');
    var rows = view.rows
      .map(function (row) {
        var cells = row
          .map(function (cell, idx) {
            if (idx === 0 && /^https?:\/\//.test(cell)) {
              return (
                '<td><a href="' +
                escapeHtml(cell) +
                '" rel="noopener noreferrer">' +
                escapeHtml(cell) +
                '</a></td>'
              );
            }
            return '<td>' + escapeHtml(cell) + '</td>';
          })
          .join('');
        return '<tr>' + cells + '</tr>';
      })
      .join('');

    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>' +
      '<h1 class="sky-llm-op-detail-title">' +
      escapeHtml(view.title) +
      '</h1>' +
      '<p class="sky-llm-op-detail-subtitle">' +
      escapeHtml(view.subtitle) +
      '</p>' +
      '<div class="sky-llm-op-kpi-row">' +
      '<div class="sky-llm-op-kpi-card"><span class="sky-llm-op-kpi-label">' +
      escapeHtml(view.kpi1Label) +
      '</span><span class="sky-llm-op-kpi-value">' +
      escapeHtml(view.kpi1Value) +
      '</span></div>' +
      '<div class="sky-llm-op-kpi-card"><span class="sky-llm-op-kpi-label">' +
      escapeHtml(view.kpi2Label) +
      '</span><span class="sky-llm-op-kpi-value">' +
      escapeHtml(view.kpi2Value) +
      '</span></div>' +
      '</div>' +
      '<p class="sky-llm-op-summary">' +
      escapeHtml(view.summary) +
      '</p>' +
      '<div class="sky-llm-op-section-head">' +
      '<h2 class="sky-llm-op-section-title">' +
      escapeHtml(view.sectionTitle) +
      '</h2>' +
      '<button type="button" class="sky-llm-op-export-btn" aria-label="Export">Export</button>' +
      '</div>' +
      '<div class="sky-llm-op-filters">' +
      '<span class="sky-llm-op-filter">User Agents (all)</span>' +
      '<span class="sky-llm-op-filter">Country Codes (all)</span>' +
      '<span class="sky-llm-op-filter">Categories (all)</span>' +
      '<button type="button" class="sky-llm-op-apply-btn" disabled>Apply Filters</button>' +
      '</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table"><thead><tr>' +
      headers +
      '</tr></thead><tbody>' +
      rows +
      '</tbody></table></div>'
    );
  }

  function buildRecoverDetailHtml() {
    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>' +
      '<div class="sky-llm-op-recover-head">' +
      '<div class="sky-llm-op-recover-head-main">' +
      '<h1 class="sky-llm-op-detail-title">Recover Content Visibility</h1>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">Technical SEO</span>' +
      '<span class="sky-llm-op-updated">Updated Mon, May 13, 2024</span>' +
      '</div>' +
      '</div>' +
      '<div class="sky-llm-op-recover-metrics">' +
      '<div class="sky-llm-op-recover-metric"><span class="sky-llm-op-recover-metric-val">1</span><span class="sky-llm-op-recover-metric-lbl">URLs</span></div>' +
      '<div class="sky-llm-op-recover-metric"><span class="sky-llm-op-recover-metric-val">+1.1x</span><span class="sky-llm-op-recover-metric-lbl">Estimated Content Gain</span></div>' +
      '</div>' +
      '</div>' +
      '<section class="sky-llm-op-panel">' +
      '<button type="button" class="sky-llm-op-panel-toggle" aria-expanded="true">Overview</button>' +
      '<div class="sky-llm-op-panel-body">' +
      '<p>Let\'s unlock your website\'s LLM citation potential.</p>' +
      '<p>AI agents can only cite content they can access. They don\'t see critical content hidden behind client-side rendering and dynamic loads.</p>' +
      '<p>The visibility gap (LLM generated summary) across the affected pages below: they are missing out on key content such as product descriptions, user ratings, recipes and user comments.</p>' +
      '</div></section>' +
      '<section class="sky-llm-op-panel">' +
      '<button type="button" class="sky-llm-op-panel-toggle" aria-expanded="true">Guidance</button>' +
      '<div class="sky-llm-op-panel-body">' +
      '<p><strong>Recommendation:</strong> Use our edge-based optimization solution to safely optimize your content for agents in a low-risk way. With this solution, you can apply AI-suggested improvements at the delivery layer for agentic traffic only.</p>' +
      '<ol>' +
      '<li><strong>Bot-only delivery:</strong> We target agents only. Human visitors are not affected in any way.</li>' +
      '<li><strong>We don\'t touch your CMS:</strong> Optimizations live at the edge of your CDN. No code changes or republishing happening.</li>' +
      '<li><strong>Fast, low-risk deployment:</strong> Optimizations can take effect in minutes, not days. No developer engagement required.</li>' +
      '</ol>' +
      '<p>Optimizing your content for AI agents improves the likelihood of LLMs citing and understanding your content.</p>' +
      '</div></section>' +
      '<section class="sky-llm-op-panel sky-llm-op-plan">' +
      '<div class="sky-llm-op-plan-row">' +
      '<div><h2 class="sky-llm-op-section-title">Opportunity plan</h2>' +
      '<p class="sky-llm-op-plan-text">Try our Optimize on Edge solution to safely optimize your content as suggested above.</p></div>' +
      '<div class="sky-llm-op-plan-action">' +
      '<button type="button" class="sky-llm-op-deploy-btn" disabled>Deploy optimizations</button>' +
      '<span class="sky-llm-op-plan-hint">choose at least 1 page to deploy</span>' +
      '</div></div></section>' +
      '<section class="sky-llm-op-progress-block">' +
      '<p class="sky-llm-op-kicker">Optimization progress</p>' +
      '<div class="sky-llm-op-progress-bar"><div class="sky-llm-op-progress-fill" style="width:0%"></div></div>' +
      '<p class="sky-llm-op-progress-label"><strong>0</strong> of <strong>1</strong> URLs optimized</p>' +
      '<p class="sky-llm-op-progress-note">Upgrade to unlock more opportunities and optimize additional URLs.</p>' +
      '</section>' +
      '<section class="sky-llm-op-urls-block">' +
      '<div class="sky-llm-op-section-head">' +
      '<div><h2 class="sky-llm-op-section-title">URLs with suggestions</h2>' +
      '<p class="sky-llm-op-urls-desc">These URLs receive high agentic traffic, but low visibility can limit what AI actually read. Check the preview for each page to understand the gap and how to fix it.</p></div>' +
      '<div class="sky-llm-op-urls-tools">' +
      '<span class="sky-llm-op-filter">Filter by Classification: All</span>' +
      '<button type="button" class="sky-llm-op-export-btn">Export</button>' +
      '</div></div>' +
      '<div class="sky-llm-op-toolbar">' +
      '<span class="sky-llm-op-filter">Current Suggestions</span>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark as Fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore Suggestions</button>' +
      '</div>' +
      '<div class="sky-llm-op-search">Search URLs</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-recover">' +
      '<thead><tr><th></th><th>URL</th><th>Agentic Traffic (4 Weeks)</th><th>Content Visibility</th><th>Content Gain Ratio</th><th>Actions</th><th>Details</th></tr></thead>' +
      '<tbody><tr>' +
      '<td><input type="checkbox" aria-label="Select URL"></td>' +
      '<td><a href="https://sky.com/tv/sky-glass" rel="noopener noreferrer">https://sky.com/tv/sky-glass</a></td>' +
      '<td>—</td><td>91%</td><td>1.1</td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Preview</button></td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
      '</tr></tbody></table></div></section>'
    );
  }

  function buildContentOpHead(title, updated, metric1Val, metric1Lbl, metric2Val, metric2Lbl) {
    return (
      '<div class="sky-llm-op-recover-head">' +
      '<div class="sky-llm-op-recover-head-main">' +
      '<h1 class="sky-llm-op-detail-title">' +
      escapeHtml(title) +
      '</h1>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">Content Optimization</span>' +
      '<span class="sky-llm-op-updated">Updated ' +
      escapeHtml(updated) +
      '</span></div></div>' +
      '<div class="sky-llm-op-recover-metrics">' +
      '<div class="sky-llm-op-recover-metric"><span class="sky-llm-op-recover-metric-val">' +
      escapeHtml(metric1Val) +
      '</span><span class="sky-llm-op-recover-metric-lbl">' +
      escapeHtml(metric1Lbl) +
      '</span></div>' +
      '<div class="sky-llm-op-recover-metric"><span class="sky-llm-op-recover-metric-val">' +
      escapeHtml(metric2Val) +
      '</span><span class="sky-llm-op-recover-metric-lbl">' +
      escapeHtml(metric2Lbl) +
      '</span></div></div></div>'
    );
  }

  function buildPanels(overviewHtml, guidanceHtml) {
    return (
      '<section class="sky-llm-op-panel">' +
      '<button type="button" class="sky-llm-op-panel-toggle" aria-expanded="true">Overview</button>' +
      '<div class="sky-llm-op-panel-body">' +
      overviewHtml +
      '</div></section>' +
      '<section class="sky-llm-op-panel">' +
      '<button type="button" class="sky-llm-op-panel-toggle" aria-expanded="true">Guidance</button>' +
      '<div class="sky-llm-op-panel-body">' +
      guidanceHtml +
      '</div></section>'
    );
  }

  function buildProgressBlock(optimized, total, note) {
    return (
      '<section class="sky-llm-op-progress-block">' +
      '<p class="sky-llm-op-kicker">Optimization progress</p>' +
      '<div class="sky-llm-op-progress-bar"><div class="sky-llm-op-progress-fill" style="width:' +
      (total ? Math.round((optimized / total) * 100) : 0) +
      '%"></div></div>' +
      '<p class="sky-llm-op-progress-label"><strong>' +
      escapeHtml(String(optimized)) +
      '</strong> of <strong>' +
      escapeHtml(String(total)) +
      '</strong> URLs optimized</p>' +
      '<p class="sky-llm-op-progress-note">' +
      escapeHtml(note) +
      '</p></section>'
    );
  }

  function buildPlanBlock(planText, deployHint) {
    return (
      '<section class="sky-llm-op-panel sky-llm-op-plan">' +
      '<div class="sky-llm-op-plan-row">' +
      '<div><h2 class="sky-llm-op-section-title">Opportunity plan</h2>' +
      '<p class="sky-llm-op-plan-text">' +
      escapeHtml(planText) +
      '</p></div>' +
      '<div class="sky-llm-op-plan-action">' +
      '<button type="button" class="sky-llm-op-deploy-btn" disabled>Deploy optimizations</button>' +
      '<span class="sky-llm-op-plan-hint">' +
      escapeHtml(deployHint) +
      '</span></div></div></section>'
    );
  }

  function buildSimplifyDetailHtml() {
    var overview =
      '<p>Poor readability makes content difficult for users to understand. Content with low readability scores may drive away visitors and reduce engagement metrics.</p>' +
      '<p>Readability scores measure how easy your content is to understand. Higher Flesch Reading Ease scores (60+) indicate easier-to-read content, which improves user engagement and SEO performance. These AI-generated suggestions help simplify complex text while maintaining meaning and context.</p>';
    var guidance =
      '<p>Recommendations use our edge-based optimization solution to safely optimize your content for agents in a low-risk way. With this solution, you can apply AI-suggested improvements at the delivery layer for agentic traffic only.</p>' +
      '<ol>' +
      '<li><strong>Bot-only delivery:</strong> We target agents only. Human visitors are not affected in any way.</li>' +
      '<li><strong>We don\'t touch your CMS:</strong> Optimizations live at the edge of your CDN. No code changes or republishing required.</li>' +
      '<li><strong>Fast, low-risk deployment:</strong> Optimizations can take effect in minutes, not days. No developer engagement required.</li>' +
      '</ol>' +
      '<p>Optimizing your content for AI agents improves the likelihood of LLMs citing and understanding your content.</p>';

    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>' +
      buildContentOpHead('Simplify Complex Content', 'Mon, May 18, 2024', '1', 'URLs', '1', 'Issues') +
      buildPanels(overview, guidance) +
      buildProgressBlock(
        0,
        10,
        'Upgrade to unlock more opportunities and optimize additional URLs.',
      ) +
      buildPlanBlock(
        'Review all suggested fixes below carefully before applying. You can dismiss or edit where needed.',
        'Please select suggestions to deploy',
      ) +
      '<section class="sky-llm-op-urls-block">' +
      '<div class="sky-llm-op-section-head"><h2 class="sky-llm-op-section-title">URLs with suggestions</h2></div>' +
      '<div class="sky-llm-op-toolbar">' +
      '<span class="sky-llm-op-filter">Current Suggestions</span>' +
      '<div class="sky-llm-op-search sky-llm-op-search-inline">Search URLs</div>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark as Fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore Suggestions</button>' +
      '</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-simplify">' +
      '<thead><tr><th></th><th>URL</th><th>Issues</th><th>Agentic Traffic (4 Weeks)</th><th>Details</th></tr></thead>' +
      '<tbody><tr>' +
      '<td><input type="checkbox" aria-label="Select URL"></td>' +
      '<td><a href="https://sky.com/tv/sky-glass/packages" rel="noopener noreferrer">https://sky.com/tv/sky-glass/packages</a></td>' +
      '<td>1</td><td>N/A</td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
      '</tr></tbody></table></div></section>'
    );
  }

  function buildLlmSummariesDetailHtml() {
    var urls = [
      { url: 'https://sky.com/tv/sky-glass', suggestions: '2' },
      { url: 'https://sky.com/tv/sky-stream', suggestions: '1' },
      { url: 'https://sky.com/broadband/deals', suggestions: '3' },
      { url: 'https://sky.com/broadband/full-fibre', suggestions: '1' },
      { url: 'https://sky.com/tv/sports', suggestions: '2' },
      { url: 'https://sky.com/tv/cinema', suggestions: '1' },
      { url: 'https://sky.com/shop/tv', suggestions: '3' },
      { url: 'https://sky.com/help/home', suggestions: '1' },
      { url: 'https://sky.com/help/broadband', suggestions: '2' },
      { url: 'https://sky.com/magazine/entertainment', suggestions: '1' },
      { url: 'https://sky.com/magazine/sport', suggestions: '2' },
      { url: 'https://sky.com/tv/ultimate-tv', suggestions: '3' },
      { url: 'https://sky.com/tv/netflix', suggestions: '1' },
    ];

    var rows = urls
      .map(function (row) {
        return (
          '<tr>' +
          '<td><input type="checkbox" aria-label="Select URL"></td>' +
          '<td class="sky-llm-op-expand-cell" aria-hidden="true">▸</td>' +
          '<td><a href="' +
          escapeHtml(row.url) +
          '" rel="noopener noreferrer">' +
          escapeHtml(row.url) +
          '</a></td>' +
          '<td>' +
          escapeHtml(row.suggestions) +
          '</td>' +
          '<td>No</td><td>0</td>' +
          '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
          '</tr>'
        );
      })
      .join('');

    var overview =
      '<p>Content summarization elements such as summary and key points improve content discoverability and user engagement. AI-generated summaries help improve content discoverability and user engagement.</p>' +
      '<p>These suggestions provide concise summaries that can be added to your pages, either as full page summaries or section-specific summaries.</p>';
    var guidance =
      '<p><strong>Recommendation:</strong> Use an edge-based optimization solution to safely optimize your content for agents in a low-risk way. With this solution, you can apply AI-suggested improvements at the delivery layer for agentic traffic only.</p>' +
      '<p><strong>Our solution</strong></p>' +
      '<ol>' +
      '<li><strong>Bot-only delivery:</strong> We target agents only. Human visitors are not affected in any way.</li>' +
      '<li><strong>We don\'t touch your CMS:</strong> Optimizations live at the edge of your CDN. No code changes or republishing happening.</li>' +
      '<li><strong>Fast, low-risk deployment:</strong> Optimizations can take effect in minutes, not days. No developer engagement required.</li>' +
      '</ol>' +
      '<p>Optimizing your content for AI agents improves the likelihood of LLMs citing and understanding your content.</p>';

    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>' +
      buildContentOpHead('Add LLM-Friendly Summaries', 'Mon, May 6, 2024', '13', 'URLs', '25', 'Suggestions') +
      buildPanels(overview, guidance) +
      buildProgressBlock(
        0,
        13,
        'Upgrade to unlock more opportunities and prioritize additional URLs.',
      ) +
      buildPlanBlock(
        'Review all suggestions from below carefully before applying. You can dismiss or edit where needed.',
        'Please select suggestions to deploy',
      ) +
      '<section class="sky-llm-op-urls-block">' +
      '<div class="sky-llm-op-section-head"><h2 class="sky-llm-op-section-title">URLs with suggestions</h2></div>' +
      '<div class="sky-llm-op-toolbar">' +
      '<span class="sky-llm-op-filter">Current Suggestions</span>' +
      '<div class="sky-llm-op-search sky-llm-op-search-inline">Search URLs</div>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark as Fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore Suggestions</button>' +
      '</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-summaries">' +
      '<thead><tr><th></th><th></th><th>URL</th><th>Suggestions</th><th>Agentic Traffic (4 Weeks)</th><th>Citations (4 Weeks)</th><th>Details</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div></section>'
    );
  }

  function buildDetailHtml(viewId) {
    var view = DETAIL_VIEWS[viewId];
    if (!view) return '';
    if (view.kind === 'recover') return buildRecoverDetailHtml();
    if (view.kind === 'content-op-simplify') return buildSimplifyDetailHtml();
    if (view.kind === 'content-op-summaries') return buildLlmSummariesDetailHtml();
    return buildTableDetailHtml(view);
  }

  function wireDetailPanels(root) {
    root.querySelectorAll('.sky-llm-op-panel-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        var body = btn.nextElementSibling;
        if (body) body.hidden = expanded;
      });
    });
  }

  function ensureDetailRoot() {
    if (state.detailEl) return state.detailEl;
    var canvas = findOpportunitiesMain() || findListCanvas();
    if (!canvas || !canvas.parentElement) return null;
    var el = document.createElement('div');
    el.id = 'skyLlmOpDetail';
    el.className = 'sky-llm-op-detail';
    el.hidden = true;
    canvas.parentElement.appendChild(el);
    state.detailEl = el;
    return el;
  }

  function isRichDetailView(viewId) {
    return viewId === 'recover' || viewId === 'simplify' || viewId === 'llm-summaries';
  }

  function showDetail(viewId) {
    var canvas = findOpportunitiesMain() || findListCanvas();
    var detail = ensureDetailRoot();
    if (!DETAIL_VIEWS[viewId] || !canvas || !detail) return;

    detail.innerHTML = buildDetailHtml(viewId);
    if (global.SkyLlmDemoUrls && global.SkyLlmDemoUrls.patchRoot) {
      global.SkyLlmDemoUrls.patchRoot(detail, global.SkyLlmDemoUrls.getCfg());
    }
    detail.hidden = false;
    detail.classList.toggle('sky-llm-op-detail--recover', isRichDetailView(viewId));
    canvas.classList.add('sky-llm-op-list-hidden');

    if (isRichDetailView(viewId)) wireDetailPanels(detail);

    var back = document.getElementById('skyLlmOpBack');
    if (back) {
      back.addEventListener('click', function (e) {
        e.preventDefault();
        hideDetail();
      });
    }

    if (location.hash !== '#detail/' + viewId) {
      location.hash = 'detail/' + viewId;
    }
    window.scrollTo(0, 0);
  }

  function hideDetail() {
    var canvas = findOpportunitiesMain() || findListCanvas();
    if (canvas) canvas.classList.remove('sky-llm-op-list-hidden');
    if (state.detailEl) {
      state.detailEl.hidden = true;
      state.detailEl.innerHTML = '';
      state.detailEl.classList.remove('sky-llm-op-detail--recover');
    }
    if (location.hash.indexOf('#detail/') === 0) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function applyHashRoute() {
    var re = new RegExp('^#detail\\/(' + HASH_IDS + ')$');
    var match = (location.hash || '').match(re);
    if (match) showDetail(match[1]);
    else hideDetail();
  }

  function boot() {
    setupOnsiteCards();
    ensureContentCards();
    ensureDetailRoot();
    applyHashRoute();
  }

  function resetCardWiring() {
    document.querySelectorAll('[data-testid*="OppCard"]').forEach(function (card) {
      delete card.dataset.skyLlmOpCardWired;
    });
  }

  function rewire() {
    resetCardWiring();
    boot();
  }

  window.addEventListener('hashchange', applyHashRoute);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  [400, 1200, 2500].forEach(function (ms) {
    window.setTimeout(boot, ms);
  });

  global.SkyLlmOpportunities = { boot: boot, rewire: rewire, showDetail: showDetail };
})();
