/**
 * Opportunities — three onsite cards + detail drill-down views.
 */
(function () {
  'use strict';

  var ONSITE_ORDER = ['404', '503', 'recover'];

  var ONSITE_CARDS = {
    '404': {
      title: 'Agentic Traffic 404s Analysis',
      date: 'Sun, May 17, 2026',
      metric1: '2',
      label1: 'URLs affected',
      metric2: '2',
      label2: 'Total hits lost',
    },
    '503': {
      title: 'Agentic Traffic 503s Analysis',
      date: 'Sun, May 17, 2026',
      metric1: '1',
      label1: 'URLs affected',
      metric2: '2',
      label2: 'Total hits lost',
    },
    recover: {
      title: 'Recover Content Visibility',
      date: 'Mon, May 11, 2026',
      metric1: '1',
      label1: 'URLs affected',
      metric2: '+1.1x',
      label2: 'Estimated Content Gain',
    },
  };

  var DETAIL_VIEWS = {
    '404': {
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
      rows: [
        ['https://sky.com/help/server-status', '1', '1', '1'],
      ],
    },
    recover: {
      title: 'Recover Content Visibility',
      subtitle: 'Content visibility recovery opportunity based on agent crawl gaps',
      kpi1Label: 'URLs affected',
      kpi1Value: '1',
      kpi2Label: 'Estimated Content Gain',
      kpi2Value: '+1.1x',
      summary:
        'One URL shows recoverable visibility potential. Addressing content gaps could improve LLM discovery by an estimated 1.1×.',
      sectionTitle: 'Content Visibility Details',
      tableHeaders: ['Url', 'Issue', 'Priority', 'Estimated gain'],
      rows: [
        ['https://sky.com/tv/sky-glass', 'Low agent citation rate', 'High', '+1.1x'],
      ],
    },
  };

  var TITLE_TO_ID = {
    'Agentic Traffic 404s Analysis': '404',
    'Agentic Traffic 503s Analysis': '503',
    'Recover Content Visibility': 'recover',
  };

  var state = {
    listCanvas: null,
    detailEl: null,
    onsiteHost: null,
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

  function findOnsiteHost() {
    if (state.onsiteHost) return state.onsiteHost;
    var head = findLeaf('Onsite Technical Optimizations');
    if (!head) return null;
    var walk = head.parentElement;
    for (var i = 0; i < 12 && walk; i++) {
      if (walk.querySelector('[data-testid*="OppCard"]')) {
        state.onsiteHost = walk;
        return walk;
      }
      walk = walk.parentElement;
    }
    return head.parentElement;
  }

  function getCardTitle(card) {
    var titleEl = card.querySelector('[class*="CxHbm"]');
    if (titleEl) return titleEl.textContent.trim();
    return '';
  }

  function setMetricBlock(block, value, label) {
    if (!block) return;
    var spans = block.querySelectorAll('[data-rsp-slot="text"]');
    if (spans[0]) spans[0].textContent = value;
    if (spans[1]) spans[1].textContent = label;
  }

  function patchCard(card, config) {
    var titleEl = card.querySelector('[class*="CxHbm"]');
    if (titleEl) titleEl.textContent = config.title;

    Array.from(card.querySelectorAll('span[data-rsp-slot="text"]')).forEach(function (span) {
      if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(span.textContent.trim())) {
        span.textContent = config.date;
      }
    });

    var metricBlocks = card.querySelectorAll('[class*="kUNW0"]');
    if (metricBlocks.length >= 2) {
      setMetricBlock(metricBlocks[0], config.metric1, config.label1);
      setMetricBlock(metricBlocks[1], config.metric2, config.label2);
    }

    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
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

  function wireDetailsButton(card, viewId) {
    var btn = ensureDetailsButton(card);
    if (!btn || btn.dataset.skyLlmOpDetailWired === '1') return;
    btn.dataset.skyLlmOpDetailWired = '1';
    btn.addEventListener(
      'click',
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        showDetail(viewId);
      },
      true,
    );
  }

  function setupOnsiteCards() {
    var cards = Array.from(document.querySelectorAll('[data-testid*="OppCard"]'));
    if (!cards.length) return;

    var byId = {};
    cards.forEach(function (card) {
      var title = getCardTitle(card);
      var id = TITLE_TO_ID[title];
      if (id) byId[id] = card;
    });

    ONSITE_ORDER.forEach(function (id) {
      var card = byId[id];
      var config = ONSITE_CARDS[id];
      if (!card || !config) return;
      patchCard(card, config);
      wireDetailsButton(card, id);
    });

    cards.forEach(function (card) {
      var title = getCardTitle(card);
      var id = TITLE_TO_ID[title];
      if (!id) {
        card.classList.add('sky-llm-op-card-hidden');
        return;
      }
    });

    var host = findOnsiteHost();
    if (host) {
      ONSITE_ORDER.forEach(function (id) {
        var card = byId[id];
        if (card && card.parentElement === host) {
          host.appendChild(card);
        }
      });
    }
  }

  function buildDetailHtml(view) {
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
              return '<td><a href="' + escapeHtml(cell) + '" rel="noopener noreferrer">' + escapeHtml(cell) + '</a></td>';
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

  function showDetail(viewId) {
    var view = DETAIL_VIEWS[viewId];
    var canvas = findOpportunitiesMain();
    var detail = ensureDetailRoot();
    if (!view || !canvas || !detail) return;

    detail.innerHTML = buildDetailHtml(view);
    detail.hidden = false;
    canvas.classList.add('sky-llm-op-list-hidden');

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
    }
    if (location.hash.indexOf('#detail/') === 0) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function applyHashRoute() {
    var match = (location.hash || '').match(/^#detail\/(404|503|recover)$/);
    if (match) showDetail(match[1]);
    else hideDetail();
  }

  function boot() {
    setupOnsiteCards();
    ensureDetailRoot();
    applyHashRoute();
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
})();
