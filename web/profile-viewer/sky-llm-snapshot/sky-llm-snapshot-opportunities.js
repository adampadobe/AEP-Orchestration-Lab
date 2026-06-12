/**
 * LLM Demo Opportunities — onsite technical/content cards + detail drill-down views.
 */
(function (root) {
  'use strict';

  function llmDemoUrlsApi() {
    return root.LlmDemoUrls || root.SkyLlmDemoUrls;
  }

  var ONSITE_ORDER = ['404', '503', 'recover'];
  var CONTENT_ORDER = ['llm-summaries', 'simplify'];
  var ONSITE_CONTENT_INTRO =
    'Onsite opportunities are relevant to improve your content to better be understood by LLMs and matched to user queries, particularly when the LLM accesses one of your webpages to read its content.';
  var OFFSITE_ORDER = ['reddit', 'youtube', 'wikipedia', 'cited'];

  var ONSITE_CARDS = {
    '404': {
      title: 'Agentic Traffic 404s Analysis',
      date: 'Sun, May 17, 2026',
      tag: 'Technical SEO',
      metric1: '3',
      label1: 'URLs affected',
      metric2: '5,733',
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
      date: 'Mon, Jun 1, 2026',
      tag: 'Technical SEO',
      metric1: '9',
      label1: 'URLs',
      metric2: '+5.9x',
      label2: 'Estimated Content Gain',
    },
  };

  var CONTENT_CARDS = {
    simplify: {
      title: 'Simplify Complex Content',
      date: 'Mon, Jun 1, 2024',
      tag: 'Content Opportunity',
    },
    'llm-summaries': {
      title: 'Add LLM-Friendly Summaries',
      date: 'Mon, May 4, 2024',
      tag: 'Content Opportunity',
    },
  };

  var OFFSITE_CARDS = {
    reddit: {
      title: 'Reddit Sentiment Analysis — {brand}',
      date: 'Mon, Jan 1, 2024',
      tag: 'Social Media',
    },
    youtube: {
      title: 'YouTube Sentiment Analysis — {brand} Pricing Perception',
      date: 'Mon, Jan 1, 2024',
      tag: 'Social Media',
    },
    wikipedia: {
      title: 'Wikipedia Analysis — AI-powered suggestions to optimize your Wikipedia presence',
      date: 'Mon, Jan 1, 2024',
      tag: 'Earned Content',
    },
    cited: {
      title: 'Cited Sentiment Analysis — {brand}',
      date: 'Mon, Jan 1, 2024',
      tag: 'Earned Content',
    },
  };

  var DETAIL_VIEWS = {
    '404': { kind: 'table', dynamic: '404' },
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
    reddit: { kind: 'reddit' },
    youtube: { kind: 'youtube' },
    wikipedia: { kind: 'wikipedia' },
    cited: { kind: 'cited' },
  };

  var TITLE_TO_ID = {
    'Agentic Traffic 404s Analysis': '404',
    'Agentic Traffic 503s Analysis': '503',
    'Recover Content Visibility': 'recover',
    'Simplify Complex Content': 'simplify',
    'Add LLM-Friendly Summaries': 'llm-summaries',
    'GEO content and information gain': 'simplify',
    'Information gain for GEO': 'simplify',
    'Information gain for GEO ': 'simplify',
  };

  var HASH_IDS = '404|503|recover|simplify|llm-summaries|reddit|youtube|wikipedia|cited';

  var SECTION_TITLES = [
    'Offsite Optimizations',
    'Onsite Technical Optimizations',
    'Onsite Content Optimizations',
  ];

  var state = {
    listCanvas: null,
    detailEl: null,
    onsiteHost: null,
    contentHost: null,
    offsiteHost: null,
    offsiteMount: null,
    contentMount: null,
    mainPane: null,
    delegateWired: false,
    walnutWatcher: false,
    contentObserver: false,
    contentRebuildTimer: null,
  };

  var TESTID_TO_VIEW = {
    'techgeo-4xx': '404',
    'techgeo-5xx': '503',
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

  function ensurePanePositioned(el) {
    if (!el) return;
    var pos = window.getComputedStyle(el).position;
    if (pos === 'static') el.style.position = 'relative';
  }

  /** Main scroll column to the right of the org sidebar (keeps left nav visible). */
  function findShellMainPane() {
    if (state.mainPane && state.mainPane.isConnected) return state.mainPane;

    var sidebarEl = document.querySelector('[id^="org-sidebar-section-"]');
    var oppHead = findOpportunitiesHeading();
    if (oppHead && sidebarEl) {
      var row = oppHead.parentElement;
      for (var i = 0; i < 35 && row; i++) {
        if (row.contains(sidebarEl)) {
          var children = Array.from(row.children);
          for (var c = 0; c < children.length; c++) {
            var ch = children[c];
            if (ch.contains(sidebarEl)) continue;
            if (ch.contains(oppHead)) {
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
        var shell = header.parentElement;
        if (shell) {
          var afterHeader = header.nextElementSibling;
          if (afterHeader && (!oppHead || afterHeader.contains(oppHead))) {
            state.mainPane = afterHeader;
            ensurePanePositioned(state.mainPane);
            return state.mainPane;
          }
        }
      }
    }

    state.mainPane = findOpportunitiesMain() || findListCanvas();
    ensurePanePositioned(state.mainPane);
    return state.mainPane;
  }

  function getSectionMarker(sectionTitle) {
    return findLeaf(sectionTitle);
  }

  function getNextSectionMarker(sectionTitle) {
    var idx = SECTION_TITLES.indexOf(sectionTitle);
    if (idx < 0 || idx >= SECTION_TITLES.length - 1) return null;
    return getSectionMarker(SECTION_TITLES[idx + 1]);
  }

  function nodeFollows(node, anchor) {
    if (!node || !anchor) return false;
    return !!(anchor.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function nodePrecedes(node, anchor) {
    if (!node || !anchor) return false;
    return !!(anchor.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING);
  }

  function cardInSection(card, sectionTitle) {
    var start = getSectionMarker(sectionTitle);
    if (!start || !card) return false;
    if (!nodeFollows(card, start)) return false;
    var end = getNextSectionMarker(sectionTitle);
    if (!end) return true;
    return nodePrecedes(card, end);
  }

  function cardsForSection(sectionTitle) {
    return Array.from(document.querySelectorAll('[data-testid*="OppCard"]')).filter(function (card) {
      return cardInSection(card, sectionTitle);
    });
  }

  function sharedCardsParent() {
    var cards = document.querySelectorAll('[data-testid*="OppCard"]');
    return cards.length ? cards[0].parentElement : null;
  }

  function markOffsiteCard(card) {
    if (!card) return;
    card.dataset.skyLlmOpZone = 'offsite';
    card.classList.remove('sky-llm-op-card-hidden');
  }

  function isOffsiteCard(card) {
    if (!card) return false;
    if (card.dataset.skyLlmOpZone === 'offsite') return true;
    return OFFSITE_ORDER.indexOf(resolveViewId(card)) >= 0;
  }

  function findOffsiteInsertPoint() {
    var offsite = getSectionMarker('Offsite Optimizations');
    var tech = getSectionMarker('Onsite Technical Optimizations');
    if (!tech) return null;
    var cursor = tech;
    for (var i = 0; i < 25 && cursor.parentElement; i++) {
      var parent = cursor.parentElement;
      var prev = cursor.previousElementSibling;
      if (prev && offsite && prev.contains(offsite)) {
        return { parent: parent, before: cursor };
      }
      cursor = parent;
    }
    return null;
  }

  function ensureOffsiteCardsMount() {
    if (state.offsiteMount && state.offsiteMount.isConnected) return state.offsiteMount;
    var existing = document.getElementById('skyLlmOpOffsiteCards');
    if (existing) {
      state.offsiteMount = existing;
      return existing;
    }
    var point = findOffsiteInsertPoint();
    if (!point) return null;
    var el = document.createElement('div');
    el.id = 'skyLlmOpOffsiteCards';
    el.className = 'sky-llm-op-offsite-cards';
    point.parent.insertBefore(el, point.before);
    state.offsiteMount = el;
    return el;
  }

  function mountOffsiteCard(node) {
    if (!node) return;
    markOffsiteCard(node);
    var mount = ensureOffsiteCardsMount();
    if (mount) {
      mount.appendChild(node);
      return;
    }
    var parent = sharedCardsParent();
    var firstTech = cardsForSection('Onsite Technical Optimizations')[0];
    if (parent && firstTech) {
      parent.insertBefore(node, firstTech);
    } else if (parent) {
      parent.appendChild(node);
    }
  }

  function relocateOffsiteCards() {
    var mount = ensureOffsiteCardsMount();
    if (!mount) return;
    OFFSITE_ORDER.forEach(function (id) {
      var card = findOffsiteCardGlobal(id);
      if (card && card.parentElement !== mount) {
        mount.appendChild(card);
      }
    });
    OFFSITE_ORDER.forEach(function (id) {
      var card = findOffsiteCardGlobal(id);
      if (card) mount.appendChild(card);
    });
  }

  function sectionCardsParent(sectionTitle) {
    var cards = cardsForSection(sectionTitle);
    if (cards.length) return cards[0].parentElement;
    if (sectionTitle === 'Offsite Optimizations') return sharedCardsParent();
    return null;
  }

  function findOnsiteHost() {
    if (state.onsiteHost) return state.onsiteHost;
    state.onsiteHost = sectionCardsParent('Onsite Technical Optimizations');
    return state.onsiteHost;
  }

  function findContentHost() {
    if (state.contentMount && state.contentMount.isConnected) return state.contentMount;
    if (state.contentHost) return state.contentHost;
    state.contentHost = sectionCardsParent('Onsite Content Optimizations');
    return state.contentHost;
  }

  function markContentCard(card) {
    if (!card) return;
    card.dataset.skyLlmOpZone = 'content';
    card.classList.remove('sky-llm-op-card-hidden');
  }

  function findContentInsertPointLegacy() {
    var contentMarker = getSectionMarker('Onsite Content Optimizations');
    if (!contentMarker) return null;
    var cursor = contentMarker;
    for (var i = 0; i < 25 && cursor; i++) {
      var parent = cursor.parentElement;
      if (!parent) break;
      var next = cursor.nextElementSibling;
      if (next) return { parent: parent, before: next };
      cursor = parent;
    }
    return null;
  }

  function findContentInsertPoint() {
    var content = getSectionMarker('Onsite Content Optimizations');
    var offsite = getSectionMarker('Offsite Optimizations');
    if (!content || !offsite) return findContentInsertPointLegacy();
    var cursor = offsite;
    for (var i = 0; i < 25 && cursor.parentElement; i++) {
      var parent = cursor.parentElement;
      var prev = cursor.previousElementSibling;
      if (prev && content && prev.contains(content)) {
        return { parent: parent, before: cursor };
      }
      cursor = parent;
    }
    return findContentInsertPointLegacy();
  }

  function createContentIntroEl() {
    var intro = document.createElement('p');
    intro.id = 'skyLlmOpContentIntro';
    intro.className = 'sky-llm-op-content-intro';
    intro.textContent = ONSITE_CONTENT_INTRO;
    return intro;
  }

  function hideDuplicateOnsiteContentIntro() {
    var snip = 'Onsite opportunities are relevant';
    Array.from(document.querySelectorAll('p, span, div')).forEach(function (el) {
      if (el.id === 'skyLlmOpContentIntro' || el.closest('#skyLlmOpContentIntro')) return;
      var text = (el.textContent || '').trim();
      if (text.indexOf(snip) !== 0) return;
      var block = el.closest('p') || el;
      if (block.dataset.skyLlmOpIntroMoved === '1') return;
      block.dataset.skyLlmOpIntroMoved = '1';
      block.style.display = 'none';
    });
  }

  function relocateOnsiteContentIntro() {
    hideDuplicateOnsiteContentIntro();
    var intro = document.getElementById('skyLlmOpContentIntro') || createContentIntroEl();
    var mount = document.getElementById('skyLlmOpContentCards');

    if (mount && mount.parentElement) {
      if (intro.parentElement !== mount.parentElement || intro.nextElementSibling !== mount) {
        mount.parentElement.insertBefore(intro, mount);
      }
      return intro;
    }

    var heading = getSectionMarker('Onsite Content Optimizations');
    if (heading && heading.parentElement) {
      heading.parentElement.insertBefore(intro, heading.nextElementSibling);
      return intro;
    }

    var point = findContentInsertPoint();
    if (point) point.parent.insertBefore(intro, point.before);
    return intro;
  }

  function ensureContentCardsMount() {
    if (state.contentMount && state.contentMount.isConnected) return state.contentMount;
    var existing = document.getElementById('skyLlmOpContentCards');
    if (existing) {
      state.contentMount = existing;
      relocateOnsiteContentIntro();
      return existing;
    }
    var point = findContentInsertPoint();
    var el = document.createElement('div');
    el.id = 'skyLlmOpContentCards';
    el.className = 'sky-llm-op-content-cards';
    if (point) {
      point.parent.insertBefore(el, point.before);
    } else {
      var host = sectionCardsParent('Onsite Content Optimizations') || sharedCardsParent();
      if (!host) return null;
      host.appendChild(el);
    }
    state.contentMount = el;
    relocateOnsiteContentIntro();
    return el;
  }

  function mountContentCard(node) {
    if (!node) return;
    markContentCard(node);
    var mount = ensureContentCardsMount();
    if (mount) {
      mount.appendChild(node);
      return;
    }
    var host = findContentHost() || sharedCardsParent();
    if (host) host.appendChild(node);
  }

  function resetContentCardWiring(card) {
    if (!card) return;
    card.removeAttribute('data-sky-llm-op-view-id');
    delete card.dataset.skyLlmOpViewId;
    delete card.dataset.skyLlmOpCardWired;
    delete card.dataset.skyLlmOpCardClickWired;
    delete card.dataset.skyLlmOpBtnWired;
    delete card.dataset.skyLlmOpNeutralized;
    delete card.dataset.skyLlmOpZone;
  }

  function isContentOpCardNode(card) {
    if (!card) return false;
    var title = getCardTitle(card);
    var id = resolveViewId(card);
    return (
      !!CONTENT_CARDS[id] ||
      /information gain|GEO content|Simplify Complex|LLM-Friendly/i.test(title)
    );
  }

  function findOffsiteHost() {
    if (state.offsiteHost) return state.offsiteHost;
    state.offsiteHost = sectionCardsParent('Offsite Optimizations');
    return state.offsiteHost;
  }

  function demoBrandLabel() {
    var brands = root.SkyLlmLlmDemoBrands || root.LlmDemoBrands;
    if (brands && brands.isActive && brands.isActive()) {
      if (brands.brandPickerLabel) return brands.brandPickerLabel();
      var cfg = brands.loadConfig && brands.loadConfig();
      if (cfg && cfg.brand) return cfg.brand;
    }
    return 'Sky';
  }

  function demoSiteUrl(path) {
    var urls = llmDemoUrlsApi();
    var cfg = urls && urls.getCfg && urls.getCfg();
    var base = cfg && cfg.siteUrl ? String(cfg.siteUrl).replace(/\/$/, '') : 'https://www.sky.com';
    var p = path.charAt(0) === '/' ? path : '/' + path;
    return demoUrl(base + p);
  }

  function registerDetailDeps() {
    root.__llmOppDetailDeps = {
      escapeHtml: escapeHtml,
      demoBrandLabel: demoBrandLabel,
      demoSiteUrl: demoSiteUrl,
      demoLinkCell: demoLinkCell,
    };
  }

  function detailViewsApi() {
    return root.LlmOpportunityDetailViews || root.SkyLlmOpportunityDetailViews;
  }

  function resolveTableView(view) {
    if (view.dynamic === '404') {
      var ext = detailViewsApi();
      if (ext && ext.build404View) return ext.build404View();
    }
    return view;
  }

  function suppressClickBlockers() {
    var walnut = document.getElementById('walnut-root-popin-element');
    if (walnut) {
      walnut.style.setProperty('display', 'none', 'important');
      walnut.style.setProperty('pointer-events', 'none', 'important');
      walnut.style.setProperty('visibility', 'hidden', 'important');
      walnut.style.setProperty('width', '0', 'important');
      walnut.style.setProperty('height', '0', 'important');
      if (walnut.parentNode) walnut.parentNode.removeChild(walnut);
    }
    var root = document.getElementById('root');
    if (root) root.style.pointerEvents = 'auto';
  }

  function watchWalnutRemoval() {
    if (state.walnutWatcher) return;
    state.walnutWatcher = true;
    suppressClickBlockers();
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var nodes = records[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType !== 1) continue;
          if (
            n.id === 'walnut-root-popin-element' ||
            (n.querySelector && n.querySelector('#walnut-root-popin-element'))
          ) {
            suppressClickBlockers();
            return;
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true });
  }

  function getCardTitle(card) {
    if (!card) return '';
    var titleEl = card.querySelector('[class*="CxHbm"]');
    if (titleEl) return (titleEl.textContent || '').trim();
    var leaf = Array.from(card.querySelectorAll('[data-rsp-slot="text"], div, span, h2, h3')).find(function (el) {
      if (el.childElementCount > 0) return false;
      var t = (el.textContent || '').trim();
      return t.length > 8 && TITLE_TO_ID[t];
    });
    if (leaf) return leaf.textContent.trim();
    var testid = card.getAttribute('data-testid') || '';
    if (testid.indexOf('techgeo-4xx') >= 0) return 'Agentic Traffic 404s Analysis';
    if (testid.indexOf('techgeo-5xx') >= 0) return 'Agentic Traffic 503s Analysis';
    return '';
  }

  function resolveViewId(card) {
    if (!card) return '';
    if (card.dataset.skyLlmOpViewId) return card.dataset.skyLlmOpViewId;
    var testid = card.getAttribute('data-testid') || '';
    var keys = Object.keys(TESTID_TO_VIEW);
    for (var i = 0; i < keys.length; i++) {
      if (testid.indexOf(keys[i]) >= 0) return TESTID_TO_VIEW[keys[i]];
    }
    var title = getCardTitle(card);
    if (/Reddit Sentiment/i.test(title)) return 'reddit';
    if (/YouTube Sentiment/i.test(title)) return 'youtube';
    if (/Wikipedia Analysis/i.test(title)) return 'wikipedia';
    if (/Cited Sentiment/i.test(title)) return 'cited';
    if (/information gain/i.test(title) || /^GEO content/i.test(title)) return 'simplify';
    if (/LLM-Friendly Summaries/i.test(title) || /^Add LLM/i.test(title)) return 'llm-summaries';
    if (/Simplify Complex/i.test(title)) return 'simplify';
    return TITLE_TO_ID[title] || '';
  }

  function findContentCardGlobal(id) {
    var wired = document.querySelector('[data-sky-llm-op-view-id="' + id + '"]');
    if (wired && !wired.classList.contains('sky-llm-op-card-hidden')) return wired;

    var cards = Array.from(document.querySelectorAll('[data-testid*="OppCard"]'));
    var i;
    for (i = 0; i < cards.length; i++) {
      var card = cards[i];
      var vid = card.dataset.skyLlmOpViewId || resolveViewId(card);
      if (vid === id) return card;
    }
    if (id === 'simplify') {
      return cards.find(function (c) {
        var t = getCardTitle(c);
        return /information gain/i.test(t) || /Simplify Complex/i.test(t);
      });
    }
    if (id === 'llm-summaries') {
      return cards.find(function (c) {
        var t = getCardTitle(c);
        return /LLM-Friendly Summaries/i.test(t) || /^Add LLM/i.test(t);
      });
    }
    return null;
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

  function actionButtonLabel(btn) {
    return ((btn && btn.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function isDetailsActionButton(btn) {
    if (!btn) return false;
    var t = actionButtonLabel(btn);
    var aria = ((btn.getAttribute && btn.getAttribute('aria-label')) || '').trim();
    return /\bDetails\b/i.test(t) || /\bPreview\b/i.test(t) || /^Details$/i.test(aria);
  }

  function findActionButton(card) {
    return Array.from(card.querySelectorAll('button, [role="button"], a')).find(isDetailsActionButton);
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

  function openDetailForCard(card, forcedViewId) {
    if (!card || card.classList.contains('sky-llm-op-card-hidden')) return;
    var viewId = forcedViewId || card.dataset.skyLlmOpViewId || resolveViewId(card);
    if (!viewId) return;
    showDetail(viewId);
  }

  /** Frozen React OppCards swallow clicks — replace with inert clone before wiring. */
  function neutralizeFrozenCard(card) {
    if (!card || !card.parentElement) return card;
    if (card.dataset.skyLlmOpNeutralized === '1') {
      return card;
    }
    var viewId = card.dataset.skyLlmOpViewId || resolveViewId(card);
    var clone = card.cloneNode(true);
    clone.dataset.skyLlmOpNeutralized = '1';
    clone.dataset.skyLlmOpCardWired = '';
    clone.dataset.skyLlmOpCardClickWired = '';
    clone.dataset.skyLlmOpBtnWired = '';
    card.parentElement.replaceChild(clone, card);
    if (viewId) {
      clone.dataset.skyLlmOpViewId = viewId;
      clone.setAttribute('data-sky-llm-op-view-id', viewId);
    }
    return clone;
  }

  function wireCardOpen(card, viewId) {
    if (!card || !viewId) return;
    card = neutralizeFrozenCard(card);
    card.dataset.skyLlmOpViewId = viewId;
    card.setAttribute('data-sky-llm-op-view-id', viewId);
    card.dataset.skyLlmOpCardWired = '1';
    card.classList.add('sky-llm-op-card-clickable');
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.style.pointerEvents = 'auto';
    card.style.cursor = 'pointer';
    var btn = ensureDetailsButton(card);
    if (btn && btn.dataset.skyLlmOpBtnWired !== '1') {
      btn.dataset.skyLlmOpBtnWired = '1';
      btn.style.pointerEvents = 'auto';
      if (btn.tagName === 'A') {
        btn.setAttribute('href', '#detail/' + viewId);
        btn.setAttribute('role', 'button');
      }
      btn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          openDetailForCard(card, viewId);
        },
        true,
      );
    }
    if (card.dataset.skyLlmOpCardClickWired !== '1') {
      card.dataset.skyLlmOpCardClickWired = '1';
      card.addEventListener(
        'click',
        function (e) {
          if (e.target.closest('input, textarea, select, a[href]')) return;
          var hit = e.target.closest('button, [role="button"], a');
          if (hit && !isDetailsActionButton(hit)) return;
          e.preventDefault();
          e.stopPropagation();
          openDetailForCard(card, viewId);
        },
        true,
      );
    }
  }

  function opportunityCardFromTarget(target) {
    if (!target || !target.closest) return null;
    return target.closest('[data-testid*="OppCard"], [data-sky-llm-op-view-id]');
  }

  function isOpportunityOpenClick(target) {
    var card = opportunityCardFromTarget(target);
    if (!card || card.classList.contains('sky-llm-op-card-hidden')) return false;
    if (target.closest('input, textarea, select, a[href]')) return false;
    if (target.closest('button, [role="button"]')) {
      var label = (target.closest('button, [role="button"]').textContent || '').trim();
      if (label && label !== 'Details' && label !== 'Preview') return false;
    }
    return !!resolveViewId(card);
  }

  function ensureDelegatedClicks() {
    if (state.delegateWired) return;
    state.delegateWired = true;
    var lastOpenAt = 0;
    function handleOpenIntent(e) {
      if (!isOpportunityOpenClick(e.target)) return;
      var card = opportunityCardFromTarget(e.target);
      var viewId = (card && card.dataset.skyLlmOpViewId) || resolveViewId(card);
      if (!viewId) return;
      var now = Date.now();
      if (now - lastOpenAt < 350) return;
      lastOpenAt = now;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openDetailForCard(card, viewId);
    }
    document.addEventListener('pointerdown', handleOpenIntent, true);
    document.addEventListener('click', handleOpenIntent, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('[data-testid*="OppCard"].sky-llm-op-card-clickable');
      if (!card) return;
      var viewId = card.dataset.skyLlmOpViewId || resolveViewId(card);
      if (!viewId) return;
      e.preventDefault();
      showDetail(viewId);
    });
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
    var sectionCards = cardsForSection('Onsite Technical Optimizations');
    if (!sectionCards.length) return;

    var byId = {};
    sectionCards.forEach(function (card) {
      var id = resolveViewId(card) || TITLE_TO_ID[getCardTitle(card)];
      if (id && ONSITE_CARDS[id]) byId[id] = card;
    });

    ONSITE_ORDER.forEach(function (id) {
      var card = byId[id];
      var config = ONSITE_CARDS[id];
      if (!card || !config) return;
      card = neutralizeFrozenCard(card);
      byId[id] = card;
      patchCard(card, config);
      wireCardOpen(card, id);
      card.classList.remove('sky-llm-op-card-hidden');
    });

    sectionCards.forEach(function (card) {
      if (isOffsiteCard(card)) return;
      var id = resolveViewId(card);
      if (ONSITE_CARDS[id]) return;
      if (CONTENT_CARDS[id]) return;
      if (card.dataset.skyLlmOpZone === 'content') return;
      card.classList.add('sky-llm-op-card-hidden');
    });

    reorderCards(findOnsiteHost(), ONSITE_ORDER, byId);
  }

  function patchOffsiteCard(card, config) {
    var title = config.title.replace(/\{brand\}/g, demoBrandLabel());
    patchCard(card, {
      title: title,
      date: config.date,
      tag: config.tag,
      metric1: '',
      label1: '',
      metric2: '',
      label2: '',
    }, { hideMetrics: true });
  }

  function matchOffsiteCardTitle(title, id) {
    if (!title) return false;
    if (id === 'reddit') return /Reddit Sentiment/i.test(title);
    if (id === 'youtube') return /YouTube Sentiment/i.test(title);
    if (id === 'wikipedia') return /Wikipedia Analysis/i.test(title);
    if (id === 'cited') return /Cited Sentiment/i.test(title);
    return false;
  }

  function findOffsiteCardGlobal(id) {
    return Array.from(document.querySelectorAll('[data-testid*="OppCard"]')).find(function (card) {
      return resolveViewId(card) === id || matchOffsiteCardTitle(getCardTitle(card), id);
    });
  }

  function setupOffsiteCards() {
    var host = findOffsiteHost();
    if (!host) return;

    var sectionCards = cardsForSection('Offsite Optimizations');
    var byId = {};
    var template =
      sectionCards[0] ||
      findOffsiteCardGlobal('youtube') ||
      cardsForSection('Onsite Content Optimizations')[0] ||
      document.querySelector('[data-testid*="OppCard"]');

    sectionCards.forEach(function (card) {
      OFFSITE_ORDER.forEach(function (id) {
        if (!byId[id] && matchOffsiteCardTitle(getCardTitle(card), id)) {
          byId[id] = card;
        }
      });
    });

    OFFSITE_ORDER.forEach(function (id) {
      if (byId[id]) return;
      var existing = findOffsiteCardGlobal(id);
      if (existing) {
        if (
          !isOffsiteCard(existing) ||
          !existing.parentElement ||
          existing.parentElement.id !== 'skyLlmOpOffsiteCards'
        ) {
          mountOffsiteCard(existing);
        }
        byId[id] = existing;
      }
    });

    OFFSITE_ORDER.forEach(function (id) {
      var config = OFFSITE_CARDS[id];
      if (!config) return;
      var card = byId[id];
      if (!card && template) {
        card = template.cloneNode(true);
        card.dataset.skyLlmOpCloned = '1';
        card.dataset.skyLlmOpCardWired = '';
        card.dataset.skyLlmOpViewId = '';
        mountOffsiteCard(card);
        byId[id] = card;
      }
      if (!card) return;
      patchOffsiteCard(card, config);
      wireCardOpen(card, id);
      markOffsiteCard(card);
    });

    relocateOffsiteCards();

    sectionCards.forEach(function (card) {
      if (OFFSITE_ORDER.indexOf(resolveViewId(card)) >= 0) return;
      card.classList.add('sky-llm-op-card-hidden');
    });
  }

  /** Clone from a wired offsite card — same DOM pattern that already opens Details. */
  function workingOffsiteCardTemplate() {
    var offsiteMount = document.getElementById('skyLlmOpOffsiteCards');
    if (offsiteMount) {
      var wired =
        offsiteMount.querySelector('[data-sky-llm-op-view-id="wikipedia"][data-testid*="OppCard"]') ||
        offsiteMount.querySelector('[data-sky-llm-op-view-id][data-testid*="OppCard"]');
      if (wired) return wired;
    }
    return (
      findOffsiteCardGlobal('wikipedia') ||
      findOffsiteCardGlobal('cited') ||
      document.querySelector('#skyLlmOpOffsiteCards [data-testid*="OppCard"]') ||
      document.querySelector('[data-testid*="OppCard"]')
    );
  }

  function findContentCardInMount(id) {
    var mount = document.getElementById('skyLlmOpContentCards');
    return mount ? mount.querySelector('[data-sky-llm-op-view-id="' + id + '"]') : null;
  }

  function hideNativeContentSectionCards(mount) {
    if (!mount) return;
    Array.from(document.querySelectorAll('[data-testid*="OppCard"]')).forEach(function (card) {
      if (mount.contains(card)) return;
      if (isOffsiteCard(card)) return;
      if (cardInSection(card, 'Onsite Content Optimizations') || isContentOpCardNode(card)) {
        card.classList.add('sky-llm-op-card-hidden');
        card.style.display = 'none';
      }
    });
  }

  function setupContentCards() {
    var mount = ensureContentCardsMount();
    if (!mount) return;

    relocateOnsiteContentIntro();

    var template = workingOffsiteCardTemplate();
    if (!template) return;

    mount.innerHTML = '';
    mount.style.display = '';
    mount.hidden = false;

    var byId = {};
    CONTENT_ORDER.forEach(function (id) {
      var config = CONTENT_CARDS[id];
      if (!config) return;

      var card = template.cloneNode(true);
      card.dataset.skyLlmOpCloned = '1';
      resetContentCardWiring(card);
      mount.appendChild(card);
      patchCard(card, config, { hideMetrics: true });
      wireCardOpen(card, id);
      markContentCard(card);
      byId[id] = card;
    });

    reorderCards(mount, CONTENT_ORDER, byId);
    hideNativeContentSectionCards(mount);
  }

  function scheduleEnsureContentCards() {
    if (state.contentRebuildTimer) return;
    state.contentRebuildTimer = window.setTimeout(function () {
      state.contentRebuildTimer = null;
      var mount = document.getElementById('skyLlmOpContentCards');
      var ready =
        mount &&
        mount.querySelector('[data-sky-llm-op-view-id="simplify"]') &&
        mount.querySelector('[data-sky-llm-op-view-id="llm-summaries"]');
      hideNativeContentSectionCards(mount);
      if (!ready) {
        setupContentCards();
        return;
      }
      CONTENT_ORDER.forEach(function (id) {
        var card = findContentCardInMount(id);
        if (card && card.dataset.skyLlmOpCardWired !== '1') {
          wireCardOpen(card, id);
        }
      });
    }, 200);
  }

  function demoUrl(raw) {
    var s = String(raw || '');
    var urls = llmDemoUrlsApi();
    if (urls && urls.replaceHostInUrl) {
      var cfg = urls.getCfg && urls.getCfg();
      if (cfg) return urls.replaceHostInUrl(s, cfg);
    }
    return s;
  }

  function demoLinkLabel(raw) {
    var mapped = demoUrl(raw);
    var urls = llmDemoUrlsApi();
    if (urls && urls.formatLinkDisplay) {
      return urls.formatLinkDisplay(mapped);
    }
    return mapped;
  }

  function demoLinkCell(raw) {
    var href = demoUrl(raw);
    var label = demoLinkLabel(raw);
    return (
      '<td><a href="' +
      escapeHtml(href) +
      '" rel="noopener noreferrer">' +
      escapeHtml(label) +
      '</a></td>'
    );
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
              return demoLinkCell(cell);
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
    var overview =
      '<p>AI agents can only cite content they can access. They don\'t see critical content hidden behind client-side rendering and dynamic loads.</p>' +
      '<p>The visibility gap across the affected pages below means agents miss key content such as product descriptions, user ratings, recipes, and user comments.</p>';
    var guidance =
      '<p><strong>Recommendation:</strong> Use our edge-based optimization solution to safely optimize your content for agents in a low-risk way.</p>' +
      '<ol>' +
      '<li><strong>Scan your site.</strong> We identify pages where agents miss critical content.</li>' +
      '<li><strong>Choose pages to optimize.</strong> Select URLs to deploy edge optimizations for agentic traffic only — human visitors are unaffected.</li>' +
      '<li><strong>Roll back anytime.</strong> Changes can be reversed without CMS or code updates.</li>' +
      '</ol>';

    var domainRoot = demoSiteUrl('/');
    var domainLabel = demoLinkLabel(domainRoot).replace(/\/$/, '') + '/* (All Domain URLs)';

    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>' +
      '<div class="sky-llm-op-content-op">' +
      '<div class="sky-llm-op-recover-head">' +
      '<div class="sky-llm-op-recover-head-main">' +
      '<h1 class="sky-llm-op-detail-title">Recover Content Visibility</h1>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">Technical SEO</span>' +
      '<span class="sky-llm-op-updated">Updated Mon, Jun 1, 2026</span>' +
      '</div></div>' +
      '<div class="sky-llm-op-recover-metrics sky-llm-op-recover-metrics--3">' +
      '<div class="sky-llm-op-recover-metric"><span class="sky-llm-op-recover-metric-val">9</span><span class="sky-llm-op-recover-metric-lbl">URLs</span></div>' +
      '<div class="sky-llm-op-recover-metric"><span class="sky-llm-op-recover-metric-val">+5.9x</span><span class="sky-llm-op-recover-metric-lbl">Estimated Content Gain</span></div>' +
      '<div class="sky-llm-op-recover-metric"><span class="sky-llm-op-recover-metric-val">22%</span><span class="sky-llm-op-recover-metric-lbl">Avg Content Visibility</span></div>' +
      '</div></div>' +
      buildPanelSection('Overview', overview) +
      buildPanelSection('Guidance', guidance) +
      buildPlanBlock(
        'Try our Optimize on Edge solution to safely optimize your content as suggested above.',
        'Please select suggestions to deploy',
      ) +
      '<section class="sky-llm-op-progress-block sky-llm-op-progress-block--split">' +
      '<div class="sky-llm-op-progress-main">' +
      '<p class="sky-llm-op-kicker">Optimization progress</p>' +
      '<div class="sky-llm-op-progress-bar"><div class="sky-llm-op-progress-fill" style="width:0%"></div></div>' +
      '<p class="sky-llm-op-progress-label"><strong>0</strong> of <strong>10</strong> URLs optimized</p>' +
      '</div>' +
      '<aside class="sky-llm-op-progress-cta">' +
      '<strong>Fix your site in minutes.</strong> Talk to our team for a tailored analysis of your brand.' +
      '</aside></section>' +
      '<section class="sky-llm-op-urls-block sky-llm-op-panel">' +
      '<h2 class="sky-llm-op-urls-title">URLs with suggestions</h2>' +
      '<p class="sky-llm-op-urls-desc">These URLs receive high agentic traffic, but low visibility can limit what AI actually read. Check the preview for each page to understand the gap and how to fix it.</p>' +
      '<div class="sky-llm-op-url-tabs-row">' +
      '<div class="sky-llm-op-suggest-tabs">' +
      '<span class="sky-llm-op-suggest-tab sky-llm-op-suggest-tab--active">Current suggestions</span>' +
      '<span class="sky-llm-op-suggest-tab">Fixed suggestions</span>' +
      '<span class="sky-llm-op-suggest-tab">Ignored suggestions</span>' +
      '</div>' +
      '<div class="sky-llm-op-suggest-actions">' +
      '<span class="sky-llm-op-filter">Filter by Classification: All</span>' +
      '<button type="button" class="sky-llm-op-export-btn">Export</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark as fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore suggestions</button>' +
      '</div></div>' +
      '<div class="sky-llm-op-search sky-llm-op-search--full" role="search">Search URLs</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-recover">' +
      '<thead><tr><th scope="col"></th><th scope="col">URL</th><th scope="col">Agentic Traffic (4 Weeks)</th><th scope="col">Content Visibility</th><th scope="col">Content Gain Ratio</th><th scope="col">Actions</th><th scope="col">Details</th></tr></thead>' +
      '<tbody>' +
      '<tr class="sky-llm-op-row-group">' +
      '<td><input type="checkbox" aria-label="Select URL"></td>' +
      '<td><span class="sky-llm-op-expand-cell" aria-hidden="true">▾</span> ' +
      '<a href="' +
      escapeHtml(domainRoot) +
      '" rel="noopener noreferrer">' +
      escapeHtml(domainLabel) +
      '</a></td>' +
      '<td>1,671,921</td><td>13%</td><td>5.9</td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Preview</button></td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
      '</tr>' +
      '<tr>' +
      '<td><input type="checkbox" aria-label="Select URL"></td>' +
      demoLinkCell(demoSiteUrl('/coffee')) +
      '<td>842,110</td><td>11%</td><td>5.2</td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Preview</button></td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
      '</tr>' +
      '<tr>' +
      '<td><input type="checkbox" aria-label="Select URL"></td>' +
      demoLinkCell(demoSiteUrl('/tea')) +
      '<td>829,811</td><td>15%</td><td>6.1</td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Preview</button></td>' +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
      '</tr></tbody></table></div></section></div>'
    );
  }

  function buildContentOpHead(title, updated, metric1Val, metric1Lbl, metric2Val, metric2Lbl, pillTag) {
    return (
      '<div class="sky-llm-op-recover-head">' +
      '<div class="sky-llm-op-recover-head-main">' +
      '<h1 class="sky-llm-op-detail-title">' +
      escapeHtml(title) +
      '</h1>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">' +
      escapeHtml(pillTag || 'Content Optimization') +
      '</span>' +
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

  function buildPanelSection(title, bodyHtml) {
    return (
      '<section class="sky-llm-op-panel">' +
      '<button type="button" class="sky-llm-op-panel-toggle" aria-expanded="true">' +
      '<span class="sky-llm-op-panel-title">' +
      escapeHtml(title) +
      '</span>' +
      '<span class="sky-llm-op-panel-chevron" aria-hidden="true">⌄</span>' +
      '</button>' +
      '<div class="sky-llm-op-panel-body">' +
      bodyHtml +
      '</div></section>'
    );
  }

  function buildPanels(overviewHtml, guidanceHtml) {
    return buildPanelSection('Overview', overviewHtml) + buildPanelSection('Guidance', guidanceHtml);
  }

  function isFullWidthDetailView(viewId) {
    return (
      viewId === 'simplify' ||
      viewId === 'recover' ||
      viewId === 'llm-summaries' ||
      viewId === '404' ||
      viewId === '503' ||
      viewId === 'wikipedia' ||
      viewId === 'youtube' ||
      viewId === 'cited' ||
      viewId === 'reddit'
    );
  }

  function buildContentOpProgressSplit(opts) {
    opts = opts || {};
    var optimized = opts.optimized != null ? opts.optimized : 0;
    var total = opts.total != null ? opts.total : 1;
    var note = opts.note || 'Upgrade to unlock more opportunities and optimize additional URLs.';
    return (
      '<section class="sky-llm-op-progress-block sky-llm-op-progress-block--split">' +
      '<div class="sky-llm-op-progress-main">' +
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
      '</p></div>' +
      '<aside class="sky-llm-op-progress-cta">' +
      '<strong>Fix your site in minutes.</strong> <a href="#">Talk to our team</a> for a tailored analysis of your brand.' +
      '</aside></section>'
    );
  }

  function buildContentOpUrlsSection(opts) {
    opts = opts || {};
    var sampleUrl = opts.url || demoSiteUrl('/');
    var issues = opts.issues != null ? opts.issues : '1';
    var traffic = opts.traffic != null ? opts.traffic : '12,425';
    var showActions = opts.showActions !== false;

    return (
      '<section class="sky-llm-op-urls-block sky-llm-op-panel">' +
      '<h2 class="sky-llm-op-urls-title">URLs with suggestions</h2>' +
      '<div class="sky-llm-op-url-tabs-row">' +
      '<div class="sky-llm-op-suggest-tabs">' +
      '<span class="sky-llm-op-suggest-tab sky-llm-op-suggest-tab--active">Current suggestions</span>' +
      '<span class="sky-llm-op-suggest-tab">Fixed suggestions</span>' +
      '<span class="sky-llm-op-suggest-tab">Ignored suggestions</span>' +
      '</div>' +
      '<div class="sky-llm-op-suggest-actions">' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark as fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore suggestions</button>' +
      '</div></div>' +
      '<div class="sky-llm-op-search sky-llm-op-search--full" role="search">Search URLs</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-simplify">' +
      '<thead><tr><th scope="col"></th><th scope="col"></th><th scope="col">URL</th><th scope="col">Issues</th>' +
      '<th scope="col">Agentic Traffic (4 Weeks)</th>' +
      (showActions ? '<th scope="col">Actions</th>' : '') +
      '<th scope="col">Details</th></tr></thead>' +
      '<tbody><tr>' +
      '<td><input type="checkbox" aria-label="Select URL"></td>' +
      '<td class="sky-llm-op-expand-cell" aria-hidden="true">▾</td>' +
      demoLinkCell(sampleUrl) +
      '<td>' +
      escapeHtml(issues) +
      '</td><td>' +
      escapeHtml(traffic) +
      '</td>' +
      (showActions ? '<td><button type="button" class="sky-llm-op-ghost-btn">Preview</button></td>' : '') +
      '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
      '</tr></tbody></table></div></section>'
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
      '<p><strong>Recommendation:</strong> Use our edge-based optimization solution to safely optimize your content for agents in a low-risk way. With this solution, you can apply AI-suggested improvements at the delivery layer for agentic traffic only.</p>' +
      '<p><strong>Our solution</strong></p>' +
      '<ol>' +
      '<li><strong>Bot-only delivery.</strong> We target agents only. Human visitors are not affected in any way.</li>' +
      '<li><strong>We don\'t touch your CMS.</strong> Optimizations live at the edge of your CDN. No code changes or republishing happening.</li>' +
      '<li><strong>Fast, low-risk deployment.</strong> Optimizations can take effect in minutes, not days. No developer engagement required.</li>' +
      '</ol>' +
      '<p>Optimizing your content for AI agents improves the likelihood of LLMs citing and understanding your content.</p>';

    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>' +
      '<div class="sky-llm-op-content-op">' +
      buildContentOpHead(
        'Simplify Complex Content',
        'Mon, Jun 8, 2026',
        '1',
        'URLs',
        '1',
        'Issues',
        'Content Optimization',
      ) +
      buildPanelSection('Overview', overview) +
      buildPanelSection('Guidance', guidance) +
      buildPlanBlock(
        'Review all suggested fixes below carefully before applying. You can dismiss or edit where needed.',
        'Please select suggestions to deploy',
      ) +
      buildContentOpProgressSplit({ optimized: 0, total: 1 }) +
      buildContentOpUrlsSection({ url: demoSiteUrl('/'), issues: '1', traffic: '12,425' }) +
      '</div>'
    );
  }

  function buildSummariesUrlsSection(opts) {
    opts = opts || {};
    var sampleRows = opts.rows || [
      { path: '/', suggestions: '2', traffic: '12,425', citations: '18' },
    ];
    var rows = sampleRows
      .map(function (row) {
        return (
          '<tr>' +
          '<td><input type="checkbox" aria-label="Select URL"></td>' +
          '<td class="sky-llm-op-expand-cell" aria-hidden="true">▾</td>' +
          demoLinkCell(siteUrl(row.path)) +
          '<td>' +
          escapeHtml(row.suggestions) +
          '</td><td>' +
          escapeHtml(row.traffic) +
          '</td><td>' +
          escapeHtml(row.citations) +
          '</td>' +
          '<td><button type="button" class="sky-llm-op-ghost-btn">Details</button></td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<section class="sky-llm-op-urls-block sky-llm-op-panel">' +
      '<h2 class="sky-llm-op-urls-title">URLs with suggestions</h2>' +
      '<div class="sky-llm-op-url-tabs-row">' +
      '<div class="sky-llm-op-suggest-tabs">' +
      '<span class="sky-llm-op-suggest-tab sky-llm-op-suggest-tab--active">Current suggestions</span>' +
      '<span class="sky-llm-op-suggest-tab">Fixed suggestions</span>' +
      '<span class="sky-llm-op-suggest-tab">Ignored suggestions</span>' +
      '</div>' +
      '<div class="sky-llm-op-suggest-actions">' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark as fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore suggestions</button>' +
      '</div></div>' +
      '<div class="sky-llm-op-search sky-llm-op-search--full" role="search">Search URLs</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-summaries">' +
      '<thead><tr><th scope="col"></th><th scope="col"></th><th scope="col">URL</th><th scope="col">Suggestions</th>' +
      '<th scope="col">Agentic Traffic (4 Weeks)</th><th scope="col">Citations (4 Weeks)</th><th scope="col">Details</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div></section>'
    );
  }

  function buildLlmSummariesDetailHtml() {
    var overview =
      '<p>Content summarization elements such as summary and key points improve content discoverability and user engagement.</p>' +
      '<p>AI-generated summaries help improve content discoverability and user engagement. These suggestions provide concise summaries that can be added to your pages, either as full-page summaries or section-specific summaries.</p>';
    var guidance =
      '<p><strong>Recommendation:</strong> Use our edge-based optimization solution to safely optimize your content for agents in a low-risk way. With this solution, you can apply AI-suggested improvements at the delivery layer for agentic traffic only.</p>' +
      '<p><strong>Our solution</strong></p>' +
      '<ol>' +
      '<li><strong>Bot-only delivery.</strong> We target agents only. Human visitors are not affected in any way.</li>' +
      '<li><strong>We don\'t touch your CMS.</strong> Optimizations live at the edge of your CDN. No code changes or republishing happening.</li>' +
      '<li><strong>Fast, low-risk deployment.</strong> Optimizations can take effect in minutes, not days. No developer engagement required.</li>' +
      '</ol>' +
      '<p>Optimizing your content for AI agents improves the likelihood of LLMs citing and understanding your content.</p>';

    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>' +
      '<div class="sky-llm-op-content-op">' +
      buildContentOpHead(
        'Add LLM-Friendly Summaries',
        'Mon, Jun 8, 2026',
        '1',
        'URLs',
        '2',
        'Suggestions',
        'Content Optimization',
      ) +
      buildPanelSection('Overview', overview) +
      buildPanelSection('Guidance', guidance) +
      buildPlanBlock(
        'Review all suggested fixes below carefully before applying. You can dismiss or edit where needed.',
        'Please select suggestions to deploy',
      ) +
      buildContentOpProgressSplit({ optimized: 0, total: 1 }) +
      buildSummariesUrlsSection() +
      '</div>'
    );
  }

  function buildDetailHtml(viewId) {
    var view = DETAIL_VIEWS[viewId];
    if (!view) return '';
    var ext = detailViewsApi();
    if (view.kind === 'recover') return buildRecoverDetailHtml();
    if (view.kind === 'content-op-simplify') return buildSimplifyDetailHtml();
    if (view.kind === 'content-op-summaries') return buildLlmSummariesDetailHtml();
    if (view.kind === 'reddit' && ext && ext.buildRedditDetailHtml) return ext.buildRedditDetailHtml();
    if (view.kind === 'youtube' && ext && ext.buildYoutubeDetailHtml) return ext.buildYoutubeDetailHtml();
    if (view.kind === 'wikipedia' && ext && ext.buildWikipediaDetailHtml) return ext.buildWikipediaDetailHtml();
    if (view.kind === 'cited' && ext && ext.buildCitedDetailHtml) return ext.buildCitedDetailHtml();
    if (view.kind === 'table') return buildTableDetailHtml(resolveTableView(view));
    return '';
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

  function detailMount() {
    return document.body;
  }

  function syncDetailOverlayLayout() {
    var detail = state.detailEl || document.getElementById('skyLlmOpDetail');
    var pane = findShellMainPane();
    if (!detail || !pane || detail.hidden) return;
    var rect = pane.getBoundingClientRect();
    detail.style.top = Math.round(rect.top) + 'px';
    detail.style.left = Math.round(rect.left) + 'px';
    detail.style.width = Math.round(rect.width) + 'px';
    detail.style.height = Math.round(rect.height) + 'px';
  }

  function ensureDetailRoot() {
    var mount = detailMount();
    if (state.detailEl && state.detailEl.isConnected) {
      if (state.detailEl.parentElement !== mount) {
        mount.appendChild(state.detailEl);
      }
      state.detailEl.classList.add('sky-llm-op-detail--overlay');
      return state.detailEl;
    }
    var existing = document.getElementById('skyLlmOpDetail');
    if (existing) {
      if (existing.parentElement !== mount) {
        mount.appendChild(existing);
      }
      existing.classList.add('sky-llm-op-detail--overlay');
      state.detailEl = existing;
      return existing;
    }
    var el = document.createElement('div');
    el.id = 'skyLlmOpDetail';
    el.className = 'sky-llm-op-detail sky-llm-op-detail--overlay';
    el.hidden = true;
    mount.appendChild(el);
    state.detailEl = el;
    return el;
  }

  function isRichDetailView(viewId) {
    return (
      viewId === 'recover' ||
      viewId === 'simplify' ||
      viewId === 'llm-summaries' ||
      viewId === 'reddit' ||
      viewId === 'youtube' ||
      viewId === 'wikipedia' ||
      viewId === 'cited'
    );
  }

  function listHideTargets() {
    var detail = state.detailEl || document.getElementById('skyLlmOpDetail');
    var targets = [];
    var seen = [];
    function add(el) {
      if (el && seen.indexOf(el) < 0 && (!detail || !el.contains(detail))) {
        seen.push(el);
        targets.push(el);
      }
    }
    add(findOpportunitiesMain());
    add(findListCanvas());
    add(document.getElementById('skyLlmOpOffsiteCards'));
    add(document.getElementById('skyLlmOpContentCards'));
    return targets;
  }

  function setOpportunityListsVisible(visible) {
    listHideTargets().forEach(function (host) {
      host.classList.toggle('sky-llm-op-list-hidden', !visible);
    });
    var pane = findShellMainPane();
    if (pane) pane.classList.toggle('sky-llm-op-main-scroll-lock', !visible);
    document.body.classList.remove('sky-llm-op-detail-open');
  }

  function showDetail(viewId) {
    suppressClickBlockers();
    watchWalnutRemoval();
    var detail = ensureDetailRoot();
    if (!DETAIL_VIEWS[viewId] || !detail) return;

    var fullWidth = isFullWidthDetailView(viewId);
    detail.innerHTML =
      '<div class="sky-llm-op-detail-inner' +
      (fullWidth ? ' sky-llm-op-detail-inner--full' : ' sky-llm-op-detail--recover') +
      '">' +
      buildDetailHtml(viewId) +
      '</div>';
    detail.classList.toggle('sky-llm-op-detail--full', fullWidth);
    try {
      var urls = llmDemoUrlsApi();
      if (urls && urls.patchRoot) {
        urls.patchRoot(detail, urls.getCfg());
      }
    } catch (e) {
      /* personalization patch optional */
    }
    detail.hidden = false;
    detail.removeAttribute('hidden');
    detail.classList.add('sky-llm-op-detail--overlay');
    detail.classList.remove('sky-llm-op-detail--recover');
    detail.style.display = 'flex';
    syncDetailOverlayLayout();
    setOpportunityListsVisible(false);
    var pane = findShellMainPane();
    if (pane) pane.scrollTop = 0;
    detail.scrollTop = 0;

    wireDetailPanels(detail);

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
    setOpportunityListsVisible(true);
    document.body.classList.remove('sky-llm-op-detail-open');
    if (state.detailEl) {
      state.detailEl.hidden = true;
      state.detailEl.innerHTML = '';
      state.detailEl.classList.remove('sky-llm-op-detail--recover', 'sky-llm-op-detail--full');
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

  function resetCaches() {
    state.listCanvas = null;
    state.onsiteHost = null;
    state.contentHost = null;
    state.offsiteHost = null;
    state.offsiteMount = null;
    state.mainPane = null;
  }

  function boot() {
    registerDetailDeps();
    suppressClickBlockers();
    watchWalnutRemoval();
    ensureDelegatedClicks();
    resetCaches();
    setupOffsiteCards();
    setupOnsiteCards();
    setupContentCards();
    ensureDetailRoot();
    applyHashRoute();
  }

  function resetCardWiring() {
    document.querySelectorAll('[data-testid*="OppCard"]').forEach(function (card) {
      delete card.dataset.skyLlmOpCardWired;
      delete card.dataset.skyLlmOpCardClickWired;
      delete card.dataset.skyLlmOpViewId;
      delete card.dataset.skyLlmOpZone;
      delete card.dataset.skyLlmOpNeutralized;
    });
  }

  function rewire() {
    resetCardWiring();
    boot();
  }

  window.addEventListener('hashchange', applyHashRoute);
  window.addEventListener('resize', function () {
    syncDetailOverlayLayout();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  [400, 1200, 2500, 5000].forEach(function (ms) {
    window.setTimeout(boot, ms);
  });

  if (window.MutationObserver && !state.contentObserver) {
    state.contentObserver = true;
    var contentObs = new MutationObserver(function () {
      scheduleEnsureContentCards();
    });
    contentObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  var opportunitiesApi = { boot: boot, rewire: rewire, showDetail: showDetail };
  root.LlmOpportunities = opportunitiesApi;
  root.SkyLlmOpportunities = opportunitiesApi;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
