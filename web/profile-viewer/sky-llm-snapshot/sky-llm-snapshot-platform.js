/**
 * LLM Demo snapshot — Platform & Date Range pickers, chart updates, animations, tooltips.
 */
(function (root) {
  'use strict';

  function llmDemoBrands() {
    return root.LlmDemoBrands || root.SkyLlmLlmDemoBrands;
  }

  var PLATFORMS = [
    { id: 'chatgpt-free', name: 'ChatGPT (Free)', share: '49 % global market share', icon: 'openai' },
    { id: 'gemini', name: 'Gemini', share: '19 % global market share', icon: 'gemini' },
    { id: 'google-ai-mode', name: 'Google AI Mode', share: '17 % global market share', icon: 'google' },
    { id: 'copilot', name: 'Microsoft Copilot', share: '3 % global market share', icon: 'microsoft' },
    { id: 'chatgpt-paid', name: 'ChatGPT (Paid)', share: '2 % global market share', icon: 'openai' },
    { id: 'perplexity', name: 'Perplexity', share: '2 % global market share', icon: 'perplexity' },
    { id: 'google-overview', name: 'Google AI Overview', share: '1 % global market share', icon: 'google' },
  ];

  var RANGE_SCALE = { '4w': 1, '2w': 0.88, '1w': 0.76, custom: 1 };

  function startOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, days) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + days);
    return x;
  }

  function formatAdobeDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /** Adobe-style range subtitle, e.g. "Apr 27 - May 28, 2026". */
  function formatRangeLabel(start, end) {
    if (start.getFullYear() !== end.getFullYear()) {
      return (
        formatAdobeDate(start) +
        ', ' +
        start.getFullYear() +
        ' - ' +
        formatAdobeDate(end) +
        ', ' +
        end.getFullYear()
      );
    }
    return formatAdobeDate(start) + ' - ' + formatAdobeDate(end) + ', ' + end.getFullYear();
  }

  /** Sentiment x-axis label, e.g. "May 10, 2026". */
  function formatSentimentAxisDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Rolling windows ending today (inclusive). Recomputed on each read. */
  function getDateRanges() {
    var today = startOfDay(new Date());
    return [
      {
        id: '4w',
        name: 'Last 4 Weeks',
        start: addDays(today, -27),
        end: today,
        range: formatRangeLabel(addDays(today, -27), today),
      },
      {
        id: '2w',
        name: 'Last 2 Weeks',
        start: addDays(today, -13),
        end: today,
        range: formatRangeLabel(addDays(today, -13), today),
      },
      {
        id: '1w',
        name: 'Last Week',
        start: addDays(today, -6),
        end: today,
        range: formatRangeLabel(addDays(today, -6), today),
      },
      {
        id: 'custom',
        name: 'Custom Weeks',
        start: addDays(today, -27),
        end: today,
        range: 'Select specific weeks to analyze',
      },
    ];
  }

  function getSelectedDateRange() {
    var ranges = getDateRanges();
    return (
      ranges.find(function (d) {
        return d.id === state.dateRangeId;
      }) || ranges[0]
    );
  }

  /** Three axis labels spread across the active date window. */
  function getSentimentAxisDates(rangeId) {
    var dr =
      getDateRanges().find(function (d) {
        return d.id === rangeId;
      }) || getDateRanges()[0];
    if (rangeId === 'custom') {
      dr = getDateRanges()[0];
    }
    var spanDays = Math.max(0, Math.round((dr.end - dr.start) / 86400000));
    var count = 3;
    var labels = [];
    for (var i = 0; i < count; i++) {
      var offset = count === 1 ? spanDays : Math.round((spanDays * i) / (count - 1));
      labels.push(formatSentimentAxisDate(addDays(dr.start, offset)));
    }
    return labels;
  }

  var METRICS_BASE = {
    'chatgpt-free': { visibility: 36, mentions: 24, citations: 0, agentic: 215, referral: 0 },
    gemini: { visibility: 41, mentions: 31, citations: 2, agentic: 188, referral: 12 },
    'google-ai-mode': { visibility: 38, mentions: 27, citations: 1, agentic: 201, referral: 8 },
    copilot: { visibility: 29, mentions: 18, citations: 0, agentic: 142, referral: 4 },
    'chatgpt-paid': { visibility: 44, mentions: 35, citations: 3, agentic: 198, referral: 6 },
    perplexity: { visibility: 33, mentions: 22, citations: 4, agentic: 156, referral: 19 },
    'google-overview': { visibility: 37, mentions: 26, citations: 1, agentic: 175, referral: 5 },
  };

  var MARKET_BASE = {
    'chatgpt-free': [
      { name: 'Sky', mentions: 118, citations: 38 },
      { name: 'Virgin Media', mentions: 98, citations: 28 },
      { name: 'BT', mentions: 86, citations: 24 },
      { name: 'TalkTalk', mentions: 52, citations: 18 },
      { name: 'Netflix', mentions: 64, citations: 22 },
    ],
    gemini: [
      { name: 'Sky', mentions: 124, citations: 32 },
      { name: 'Virgin Media', mentions: 102, citations: 26 },
      { name: 'BT', mentions: 88, citations: 22 },
      { name: 'Disney+', mentions: 72, citations: 20 },
      { name: 'TalkTalk', mentions: 48, citations: 16 },
    ],
    'google-ai-mode': [
      { name: 'Sky', mentions: 120, citations: 34 },
      { name: 'Virgin Media', mentions: 100, citations: 27 },
      { name: 'BT', mentions: 90, citations: 23 },
      { name: 'Netflix', mentions: 68, citations: 21 },
      { name: 'TalkTalk', mentions: 54, citations: 17 },
    ],
    copilot: [
      { name: 'Sky', mentions: 108, citations: 30 },
      { name: 'BT', mentions: 92, citations: 28 },
      { name: 'Virgin Media', mentions: 88, citations: 25 },
      { name: 'TalkTalk', mentions: 44, citations: 14 },
      { name: 'Netflix', mentions: 58, citations: 19 },
    ],
    'chatgpt-paid': [
      { name: 'Sky', mentions: 132, citations: 28 },
      { name: 'Virgin Media', mentions: 110, citations: 24 },
      { name: 'BT', mentions: 96, citations: 20 },
      { name: 'Netflix', mentions: 78, citations: 22 },
      { name: 'Disney+', mentions: 70, citations: 18 },
    ],
    perplexity: [
      { name: 'Sky', mentions: 112, citations: 36 },
      { name: 'Virgin Media', mentions: 94, citations: 27 },
      { name: 'BT', mentions: 80, citations: 22 },
      { name: 'TalkTalk', mentions: 50, citations: 16 },
      { name: 'Netflix', mentions: 62, citations: 20 },
    ],
    'google-overview': [
      { name: 'Sky', mentions: 116, citations: 35 },
      { name: 'Virgin Media', mentions: 98, citations: 26 },
      { name: 'BT', mentions: 86, citations: 23 },
      { name: 'Netflix', mentions: 66, citations: 21 },
      { name: 'TalkTalk', mentions: 52, citations: 18 },
    ],
  };

  var SENTIMENT_BASE = {
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

  var TRAFFIC_LINES = {
    agentic: {
      '4w': 'M80,141.92C206,109.28,332,76.64,458,76.64C584,76.64,710,132.96,836,132.96C962,132.96,1088,129.12,1214,125.28',
      '2w': 'M80,152.4C206,124.28,332,98.64,458,98.64C584,98.64,710,142.96,836,142.96C962,142.96,1088,139.12,1214,135.28',
      '1w': 'M80,162.1C206,138.28,332,112.64,458,112.64C584,112.64,710,152.96,836,152.96C962,152.96,1088,149.12,1214,145.28',
      custom: 'M80,141.92C206,109.28,332,76.64,458,76.64C584,76.64,710,132.96,836,132.96C962,132.96,1088,129.12,1214,125.28',
    },
    referral: {
      '4w': 'M80,188C206,188,332,188,458,188C584,188,710,188,836,188C962,188,1088,188,1214,188',
      '2w': 'M80,182C206,180,332,178,458,176C584,174,710,172,836,170C962,168,1088,166,1214,164',
      '1w': 'M80,176C206,172,332,168,458,164C584,160,710,156,836,152C962,148,1088,144,1214,140',
      custom: 'M80,188C206,188,332,188,458,188C584,188,710,188,836,188C962,188,1088,188,1214,188',
    },
  };

  var SENTIMENT_BASE_Y = 186;
  var SENTIMENT_TOP_Y = 20;
  var SENTIMENT_BAR_W = 40;
  var MARKET_MENTION_MAX = 980;
  var MARKET_CITE_MAX = 160;
  var ANIM_MS = 720;
  var OVERVIEW_AGENTIC_MULT = 137000;
  var OVERVIEW_REFERRAL_BASE = 200000;
  var OVERVIEW_REFERRAL_MULT = 90000;

  var METRIC_LABELS = {
    visibility: ['Visibility Score'],
    mentions: ['Brand Mentions'],
    citations: ['Citations'],
    agentic: ['Agentic Interactions', 'Agentic interactions', 'Agentic Traffic'],
    referral: ['Total Referral Traffic from LLMs', 'Referral Traffic'],
  };

  var DEFAULT_CATEGORIES = [
    { id: 'all', name: 'All Categories' },
    { id: 'tv', name: 'TV' },
    { id: 'broadband', name: 'Broadband' },
    { id: 'sports', name: 'Sports' },
  ];

  var DEFAULT_MARKETS = [
    { id: 'all', name: 'All Markets' },
    { id: 'uk', name: 'United Kingdom' },
    { id: 'ie', name: 'Ireland' },
    { id: 'us', name: 'United States' },
  ];

  var PROMPTS_ORIGIN_OPTIONS = [
    { id: 'all', name: 'All origins' },
    { id: 'ai', name: 'AI' },
  ];

  var PROMPTS_BRANDING_OPTIONS = [
    { id: 'all', name: 'All' },
    { id: 'branded', name: 'Branded' },
    { id: 'non-branded', name: 'Non Branded' },
  ];

  var CLAIMS_SORT_OPTIONS = [
    { id: 'priority-desc', name: 'Priority (Descending)' },
    { id: 'priority-asc', name: 'Priority (Ascending)' },
    { id: 'frequency', name: 'Frequency' },
    { id: 'risk', name: 'Risk Score' },
    { id: 'date', name: 'Date' },
  ];

  var CLAIMS_FILTER_OPTIONS = {
    marketerAttention: [
      { id: 'all', name: 'All' },
      { id: 'high', name: 'High' },
      { id: 'medium', name: 'Medium' },
      { id: 'low', name: 'Low' },
      { id: 'none', name: 'None' },
    ],
    sentiment: [
      { id: 'all', name: 'All' },
      { id: 'positive', name: 'Positive' },
      { id: 'neutral', name: 'Neutral' },
      { id: 'negative', name: 'Negative' },
      { id: 'mixed', name: 'Mixed' },
    ],
    brandRelevance: [
      { id: 'all', name: 'All' },
      { id: 'high', name: 'High' },
      { id: 'medium', name: 'Medium' },
      { id: 'low', name: 'Low' },
    ],
    category: [
      { id: 'all', name: 'All' },
      { id: 'product', name: 'Product & Service' },
      { id: 'pricing', name: 'Pricing & Value' },
      { id: 'sustainability', name: 'Sustainability' },
      { id: 'support', name: 'Customer Support' },
      { id: 'technology', name: 'Technology & AI' },
    ],
    claimType: [
      { id: 'all', name: 'All' },
      { id: 'factual', name: 'Factual' },
      { id: 'opinion', name: 'Opinion' },
      { id: 'comparative', name: 'Comparative' },
      { id: 'regulatory', name: 'Regulatory' },
    ],
    frequency: [
      { id: 'all', name: 'All' },
      { id: 'high', name: 'High' },
      { id: 'medium', name: 'Medium' },
      { id: 'low', name: 'Low' },
    ],
    citations: [
      { id: 'all', name: 'All' },
      { id: 'with', name: 'With citations' },
      { id: 'without', name: 'Without citations' },
    ],
    opportunities: [
      { id: 'all', name: 'All' },
      { id: 'identified', name: 'Identified' },
      { id: 'in-progress', name: 'In progress' },
      { id: 'resolved', name: 'Resolved' },
      { id: 'none', name: 'None' },
    ],
  };

  var state = {
    platformId: 'chatgpt-free',
    dateRangeId: '4w',
    siteId: 'sky.com',
    categoryId: 'all',
    marketId: 'all',
    topicIds: [],
    promptsOriginId: 'all',
    promptsBrandingId: 'all',
    claimsSortId: 'priority-desc',
    claimsMarketerAttentionId: 'all',
    claimsSentimentId: 'all',
    claimsBrandRelevanceId: 'all',
    claimsCategoryId: 'all',
    claimsClaimTypeId: 'all',
    claimsFrequencyId: 'all',
    claimsCitationsId: 'all',
    claimsOpportunitiesId: 'all',
    metricNodes: {},
    marketRows: [],
    sentimentColumns: [],
    sentimentDates: [],
    sentimentDateEls: [],
    trafficLines: { agentic: null, referral: null },
    bpLines: [],
    pageKind: 'overview',
    tooltip: null,
    animToken: 0,
    ready: false,
    reactListboxesHidden: false,
    outsidePickerCloseWired: false,
    platformSelectionWired: false,
    walnutWatcher: false,
    platformWatchTimer: null,
    lastComboboxPlatform: '',
    metricsReapplyTimer: null,
    kpiObserver: null,
    kpiObserverMuted: false,
    kpiObserverPending: false,
  };

  var OVERVIEW_KPI_SPECS = [
    { key: 'visibility', labels: ['visibility score'] },
    { key: 'mentions', labels: ['brand mentions'] },
    { key: 'citations', labels: ['citations'] },
    { key: 'agentic', labels: ['agentic interactions', 'agentic traffic'] },
    { key: 'referral', labels: ['total referral traffic from llms', 'referral traffic'] },
  ];

  function getPageKind() {
    if (document.getElementById('agentic-traffic-dashboard')) return 'agentic-traffic';
    var heading = document.getElementById('dashboard-layout-heading');
    if (heading && /referral traffic/i.test((heading.textContent || '').trim())) return 'referral-traffic';
    if (findSectionRoot('Market Tracking')) return 'brand-presence';
    if (findSectionRoot('Risk by Theme')) return 'brand-claims';
    return 'overview';
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function scaleInt(n, factor) {
    return Math.max(0, Math.round(n * factor));
  }

  function formatMetricNumber(n) {
    return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function isMetricValueText(text) {
    var t = (text || '').trim();
    if (!t || /vs last week/i.test(t)) return false;
    return /^[\d,]+(?:\.\d+)?%?$/.test(t);
  }

  function getMetrics(platformId, rangeId) {
    var b = METRICS_BASE[platformId] || METRICS_BASE['chatgpt-free'];
    var f = RANGE_SCALE[rangeId] || 1;
    if (state.pageKind === 'brand-presence') {
      return {
        visibility: formatMetricNumber(scaleInt(b.visibility, f)) + '%',
        mentions: formatMetricNumber(scaleInt(b.mentions, f * 1.1)),
        citations: formatMetricNumber(scaleInt(b.citations, f * 0.9)),
        agentic: formatMetricNumber(scaleInt(b.agentic, f)),
        referral: formatMetricNumber(scaleInt(b.referral, f * 1.15)),
      };
    }
    return {
      visibility: formatMetricNumber(scaleInt(b.visibility, f)) + '%',
      mentions: formatMetricNumber(scaleInt(b.mentions, f * 1.1)),
      citations: formatMetricNumber(scaleInt(b.citations, f * 0.9)),
      agentic: formatMetricNumber(scaleInt(b.agentic * OVERVIEW_AGENTIC_MULT, f)),
      referral: formatMetricNumber(
        scaleInt(b.referral * OVERVIEW_REFERRAL_MULT + OVERVIEW_REFERRAL_BASE, f * 1.15),
      ),
    };
  }

  function mapMarketBrandLabel(name) {
    var brands = llmDemoBrands();
    if (brands && brands.isActive()) {
      return brands.skyToDisplay(name);
    }
    return name;
  }

  function getMarketRows(platformId, rangeId) {
    var base = MARKET_BASE[platformId] || MARKET_BASE['chatgpt-free'];
    var f = RANGE_SCALE[rangeId] || 1;
    return base.map(function (row) {
      return {
        name: mapMarketBrandLabel(row.name),
        mentions: scaleInt(row.mentions, f),
        citations: scaleInt(row.citations, f),
      };
    });
  }

  function getSentiment(platformId, rangeId) {
    var base = SENTIMENT_BASE[platformId] || SENTIMENT_BASE['chatgpt-free'];
    var f = RANGE_SCALE[rangeId] || 1;
    return base.map(function (col, idx) {
      var bump = idx === 0 ? 2 : idx === 1 ? 0 : -2;
      var pos = Math.min(55, Math.max(8, Math.round(col.pos * f + bump)));
      var neg = Math.min(20, Math.max(0, Math.round(col.neg * f)));
      var neu = Math.max(0, 100 - pos - neg);
      return { pos: pos, neu: neu, neg: neg };
    });
  }

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

  function findCombobox(labelPart) {
    var needle = String(labelPart || '').toLowerCase();
    return Array.from(document.querySelectorAll('input[role="combobox"], [role="combobox"]')).find(function (el) {
      return (el.getAttribute('aria-label') || '').toLowerCase().indexOf(needle) >= 0;
    });
  }

  function findTopicTrigger() {
    var spans = Array.from(document.querySelectorAll('span')).filter(function (el) {
      return /^All Topics \(\d+\)$/.test((el.textContent || '').trim());
    });
    if (spans.length) {
      var btn = spans[0].closest('button[aria-haspopup="listbox"]');
      if (btn) return btn;
    }
    return Array.from(document.querySelectorAll('button[aria-haspopup="listbox"]')).find(function (btn) {
      return (btn.textContent || '').indexOf('All Topics') >= 0;
    });
  }

  function findControlShell(control) {
    return findPickerShell(control);
  }

  function suppressUiBlockers() {
    var walnut = document.getElementById('walnut-root-popin-element');
    if (walnut) {
      walnut.style.setProperty('display', 'none', 'important');
      walnut.style.setProperty('pointer-events', 'none', 'important');
      walnut.style.setProperty('visibility', 'hidden', 'important');
      walnut.style.setProperty('width', '0', 'important');
      walnut.style.setProperty('height', '0', 'important');
      if (walnut.parentNode) walnut.parentNode.removeChild(walnut);
    }
  }

  function platformIdFromLabel(text) {
    var t = String(text || '').trim();
    var i;
    for (i = 0; i < PLATFORMS.length; i++) {
      if (t === PLATFORMS[i].name || t.indexOf(PLATFORMS[i].name) === 0) return PLATFORMS[i].id;
    }
    return null;
  }

  function getCategoryOptions() {
    var brands = llmDemoBrands();
    if (brands && brands.getOverviewCategories) return brands.getOverviewCategories();
    return DEFAULT_CATEGORIES;
  }

  function getMarketOptions() {
    var brands = llmDemoBrands();
    if (brands && brands.getOverviewMarkets) return brands.getOverviewMarkets();
    return DEFAULT_MARKETS;
  }

  function getSiteOptions() {
    var brands = llmDemoBrands();
    var host = brands && brands.getOverviewSiteHost ? brands.getOverviewSiteHost() : 'sky.com';
    return [{ id: host, name: host }];
  }

  function getBrandOptions() {
    var brands = llmDemoBrands();
    var label = 'Sky TV and broadband';
    if (brands && brands.brandPickerLabel) {
      var picked = brands.brandPickerLabel();
      if (picked) label = picked;
    }
    return [{ id: 'brand', name: label }];
  }

  function getTopicOptions() {
    var brands = llmDemoBrands();
    if (brands && brands.getBrandPresenceTopics) return brands.getBrandPresenceTopics();
    return [
      { id: 'broadband', name: 'Broadband deals & packages' },
      { id: 'sky-glass', name: 'Sky Glass & streaming setup' },
      { id: 'sports', name: 'Sports & entertainment bundles' },
      { id: 'wifi', name: 'WiFi mesh & home connectivity' },
      { id: 'account', name: 'Account management & billing' },
      { id: 'tv-packages', name: 'TV packages & pricing' },
      { id: 'mobile', name: 'Mobile & SIM deals' },
      { id: 'bundles', name: 'Bundles & value offers' },
      { id: 'support', name: 'Customer support & troubleshooting' },
      { id: 'comparisons', name: 'Competitor comparisons' },
      { id: 'industry', name: 'Industry news & regulation' },
    ];
  }

  function topicTriggerLabel(appliedIds) {
    var options = getTopicOptions();
    var count = options.length;
    if (!appliedIds || !appliedIds.length) return 'All Topics (' + count + ')';
    if (appliedIds.length === 1) {
      var one = options.find(function (o) {
        return o.id === appliedIds[0];
      });
      return one ? one.name : '1 topic';
    }
    return appliedIds.length + ' topics';
  }

  function syncFilterStateFromBrands() {
    var sites = getSiteOptions();
    if (sites.length) state.siteId = sites[0].id;
    if (!getCategoryOptions().some(function (c) { return c.id === state.categoryId; })) {
      state.categoryId = 'all';
    }
    if (!getMarketOptions().some(function (m) { return m.id === state.marketId; })) {
      state.marketId = 'all';
    }
    var topicOptions = getTopicOptions();
    state.topicIds = (state.topicIds || []).filter(function (id) {
      return topicOptions.some(function (o) {
        return o.id === id;
      });
    });
  }

  function closeAllPickerMenus() {
    document
      .querySelectorAll('.sky-llm-platform-menu, .sky-llm-date-menu, .sky-llm-filter-menu')
      .forEach(function (m) {
        m.hidden = true;
      });
    document
      .querySelectorAll('.sky-llm-platform-trigger, .sky-llm-date-trigger, .sky-llm-filter-trigger')
      .forEach(function (btn) {
        btn.setAttribute('aria-expanded', 'false');
      });
    document.querySelectorAll('.sky-llm-filter-host.is-open').forEach(function (host) {
      host.classList.remove('is-open');
      if (host.__skyRenderTrigger) host.__skyRenderTrigger(false);
    });
    document.querySelectorAll('[role="listbox"]').forEach(function (el) {
      if (
        el.classList.contains('sky-llm-platform-menu') ||
        el.classList.contains('sky-llm-date-menu') ||
        el.classList.contains('sky-llm-filter-menu')
      ) {
        return;
      }
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
  }

  function scheduleMetricsReapply() {
    if (state.metricsReapplyTimer) window.clearTimeout(state.metricsReapplyTimer);
    var pass = 0;
    function tick() {
      applyMetrics(state.platformId, state.dateRangeId);
      pass += 1;
      if (pass < 4) state.metricsReapplyTimer = window.setTimeout(tick, pass === 1 ? 80 : 220);
    }
    tick();
  }

  function syncPlatformTriggerLabel() {
    var p = PLATFORMS.find(function (x) {
      return x.id === state.platformId;
    });
    if (!p) return;
    var input = findCombobox('platform');
    if (input) input.value = p.name;
    document.querySelectorAll('.sky-llm-platform-trigger > span:first-child').forEach(function (el) {
      el.textContent = p.name;
    });
    document.querySelectorAll('.sky-llm-platform-option').forEach(function (btn) {
      var id = btn.getAttribute('data-sky-platform-id');
      var selected = id === state.platformId;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function refreshDashboardCaches() {
    state.metricNodes = {};
    if (state.pageKind !== 'brand-presence') {
      state.marketRows = [];
      cacheMarketRows();
    }
  }

  function readActivePlatformLabel() {
    var trigger = document.querySelector('.sky-llm-platform-trigger > span:first-child');
    if (trigger) {
      var fromTrigger = String(trigger.textContent || '').trim();
      if (fromTrigger) return fromTrigger;
    }
    var input = findCombobox('platform');
    return input ? String(input.value || '').trim() : '';
  }

  function notifyPlatformChange() {
    try {
      document.dispatchEvent(
        new CustomEvent('sky-llm-platform-change', {
          detail: { platformId: state.platformId, dateRangeId: state.dateRangeId },
        }),
      );
    } catch (e) {
      /* IE / old WebView */
    }
  }

  function applyPlatformFromCombobox() {
    var label = readActivePlatformLabel();
    if (!label) return false;
    if (label === state.lastComboboxPlatform) return false;
    state.lastComboboxPlatform = label;
    var id = platformIdFromLabel(label);
    if (!id || id === state.platformId) return false;
    state.platformId = id;
    syncPlatformTriggerLabel();
    closeAllPickerMenus();
    refreshDashboardCaches();
    applyDashboard({ animate: true });
    scheduleMetricsReapply();
    notifyPlatformChange();
    return true;
  }

  function watchNativePlatformSelection() {
    if (state.platformWatchTimer) return;
    var input = findCombobox('platform');
    if (input) {
      state.lastComboboxPlatform = String(input.value || '').trim();
      input.addEventListener('change', applyPlatformFromCombobox);
      input.addEventListener('input', applyPlatformFromCombobox);
    }
    state.platformWatchTimer = window.setInterval(applyPlatformFromCombobox, 350);
  }

  function setPlatformId(id, opts) {
    if (!id) {
      closeAllPickerMenus();
      return;
    }
    if (id === state.platformId) {
      closeAllPickerMenus();
      refreshDashboardCaches();
      applyDashboard({ animate: !(opts && opts.animate === false) });
      scheduleMetricsReapply();
      notifyPlatformChange();
      return;
    }
    state.platformId = id;
    var p = PLATFORMS.find(function (x) {
      return x.id === id;
    });
    if (p) state.lastComboboxPlatform = p.name;
    syncPlatformTriggerLabel();
    closeAllPickerMenus();
    refreshDashboardCaches();
    applyDashboard({ animate: !(opts && opts.animate === false) });
    scheduleMetricsReapply();
    notifyPlatformChange();
  }

  function wirePlatformSelection() {
    if (state.platformSelectionWired) return;
    state.platformSelectionWired = true;
    document.addEventListener(
      'click',
      function (e) {
        var hostOpt = e.target.closest('[data-sky-platform-id]');
        if (hostOpt) {
          e.preventDefault();
          e.stopPropagation();
          setPlatformId(hostOpt.getAttribute('data-sky-platform-id'), { animate: true });
          return;
        }
        var reactOpt = e.target.closest('[role="option"]');
        if (!reactOpt) return;
        var listbox = reactOpt.closest('[role="listbox"]');
        if (
          !listbox ||
          listbox.classList.contains('sky-llm-platform-menu') ||
          listbox.classList.contains('sky-llm-filter-menu')
        ) {
          return;
        }
        var id = platformIdFromLabel(reactOpt.textContent);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        setPlatformId(id, { animate: true });
      },
      true,
    );
  }

  function watchWalnutRemoval() {
    if (state.walnutWatcher) return;
    state.walnutWatcher = true;
    suppressUiBlockers();
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
            suppressUiBlockers();
            return;
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true });
  }

  function hideReactListboxes() {
    if (state.reactListboxesHidden) return;
    state.reactListboxesHidden = true;
    document.querySelectorAll('[role="listbox"]').forEach(function (el) {
      if (
        el.classList.contains('sky-llm-platform-menu') ||
        el.classList.contains('sky-llm-date-menu') ||
        el.classList.contains('sky-llm-filter-menu')
      ) {
        return;
      }
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
    });
  }

  function findPickerShell(control) {
    if (!control) return null;

    if (control.getAttribute('aria-haspopup') === 'listbox' && control.getAttribute('role') !== 'combobox') {
      var multiselect = control.closest('.multiselect-as-select');
      if (multiselect) return multiselect;
      var btnEl = control.parentElement;
      for (var t = 0; t < 10 && btnEl; t++) {
        var listBtns = btnEl.querySelectorAll('button[aria-haspopup="listbox"]');
        var comboInputs = btnEl.querySelectorAll('input[role="combobox"]');
        if (listBtns.length === 1 && listBtns[0] === control && comboInputs.length === 0) {
          return btnEl;
        }
        btnEl = btnEl.parentElement;
      }
      return control.parentElement;
    }

    var el = control;
    for (var i = 0; i < 12 && el; i++) {
      if (
        el.querySelector &&
        el.querySelector('input[role="combobox"]') &&
        el.querySelector('button[aria-haspopup="listbox"], button[aria-label="Show suggestions"]')
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return control.parentElement;
  }

  function removePicker(shell, hostClass, shellClass, control) {
    if (!shell) return;
    Array.from(shell.querySelectorAll('.' + hostClass)).forEach(function (host) {
      if (control && host.__skyControl !== control) return;
      host.remove();
    });
    if (!shell.querySelector('.' + hostClass)) shell.classList.remove(shellClass);
  }

  function findExistingPickerHost(shell, hostClass, control, triggerClass) {
    return Array.from(shell.querySelectorAll('.' + hostClass)).find(function (host) {
      return host.__skyControl === control && (!triggerClass || host.querySelector('.' + triggerClass));
    });
  }

  function findMetricValueInCard(root, labelEl) {
    var candidates = [];
    root.querySelectorAll('div, span, p').forEach(function (el) {
      if (el === labelEl || el.childElementCount > 0) return;
      if (!isMetricValueText(el.textContent)) return;
      if (el.closest('button')) return;
      candidates.push(el);
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      var aLen = (a.textContent || '').replace(/[^\d]/g, '').length;
      var bLen = (b.textContent || '').replace(/[^\d]/g, '').length;
      return bLen - aLen;
    });
    return candidates[0];
  }

  function normalizeMetricLabel(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function findOverviewKpiRoot() {
    var anchor =
      document.querySelector('.sky-llm-platform-host') || findCombobox('platform') || findCombobox('brand selector');
    var el = anchor;
    for (var i = 0; i < 16 && el; i++) {
      var blob = el.textContent || '';
      if (blob.indexOf('Visibility Score') >= 0 && blob.indexOf('Brand Mentions') >= 0) return el;
      el = el.parentElement;
    }
    return null;
  }

  function findMetricValueNodeOne(labelText, scopeRoot) {
    var target = normalizeMetricLabel(labelText);
    var pool = scopeRoot ? scopeRoot.querySelectorAll('div, span, p, h2, h3') : document.querySelectorAll('div, span, p, h2, h3');
    var labelNodes = Array.from(pool).filter(function (n) {
      return n.childElementCount === 0 && normalizeMetricLabel(n.textContent) === target;
    });
    for (var i = 0; i < labelNodes.length; i++) {
      var walk = labelNodes[i].parentElement;
      for (var d = 0; d < 10 && walk; d++) {
        var value = findMetricValueInCard(walk, labelNodes[i]);
        if (value) return value;
        walk = walk.parentElement;
      }
    }
    return null;
  }

  function findMetricValueNode(labelTexts) {
    var labels = Array.isArray(labelTexts) ? labelTexts : [labelTexts];
    var scopes = [];
    if (state.pageKind === 'overview') {
      var kpiRoot = findOverviewKpiRoot();
      if (kpiRoot) scopes.push(kpiRoot);
    }
    scopes.push(null);
    for (var s = 0; s < scopes.length; s++) {
      for (var i = 0; i < labels.length; i++) {
        var node = findMetricValueNodeOne(labels[i], scopes[s]);
        if (node) return node;
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

  function findSectionRootAny(titles) {
    for (var i = 0; i < titles.length; i++) {
      var root = findSectionRoot(titles[i]);
      if (root) return root;
    }
    return null;
  }

  function findMarketChartSvg() {
    var root = findSectionRootAny(['Market Comparison', 'Market Tracking']);
    if (!root) return null;
    var svgs = root.querySelectorAll('svg.recharts-surface');
    return svgs.length ? svgs[svgs.length - 1] : null;
  }

  function findSentimentChartSvg() {
    var root = findSectionRootAny(['Sentiment Distribution', 'Sentiment Analysis']);
    if (!root) return null;
    var svgs = root.querySelectorAll('svg.recharts-surface');
    for (var i = svgs.length - 1; i >= 0; i--) {
      if (svgs[i].querySelectorAll('path[fill="#047857"], path[fill="#4B5563"]').length >= 2) return svgs[i];
    }
    return svgs.length ? svgs[svgs.length - 1] : null;
  }

  function findTrafficChartSvg() {
    var root = findSectionRoot('Traffic Trend');
    if (!root) return null;
    var svgs = root.querySelectorAll('svg.recharts-surface[role="application"]');
    return svgs.length ? svgs[0] : root.querySelector('svg.recharts-surface');
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

  function runAnim(token, duration, step, done) {
    var start = performance.now();
    function frame(now) {
      if (token !== state.animToken) return;
      var p = Math.min(1, (now - start) / duration);
      step(easeOutCubic(p));
      if (p < 1) requestAnimationFrame(frame);
      else if (done) done();
    }
    requestAnimationFrame(frame);
  }

  function animateLinePath(path, targetD, duration, token) {
    if (!path) return;
    path.setAttribute('d', targetD);
    var len = path.getTotalLength();
    path.style.transition = 'none';
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
    runAnim(token, duration, function (t) {
      path.style.strokeDashoffset = String(len * (1 - t));
    });
  }

  function ensureTooltip() {
    if (state.tooltip) return state.tooltip;
    var el = document.createElement('div');
    el.className = 'sky-llm-chart-tooltip';
    el.hidden = true;
    document.body.appendChild(el);
    state.tooltip = el;
    return el;
  }

  function showTooltip(html, clientX, clientY) {
    var tip = ensureTooltip();
    tip.innerHTML = html;
    tip.hidden = false;
    var pad = 14;
    var rect = tip.getBoundingClientRect();
    var left = clientX + pad;
    var top = clientY + pad;
    if (left + rect.width > window.innerWidth - 8) left = clientX - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = clientY - rect.height - pad;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (state.tooltip) state.tooltip.hidden = true;
  }

  function marketTooltipHtml(row) {
    var total = row.mentions + row.citations;
    return (
      '<div class="sky-llm-chart-tooltip-title">' +
      row.name +
      '</div>' +
      '<div class="sky-llm-chart-tooltip-row"><span class="sky-llm-chart-tooltip-dot sky-llm-chart-tooltip-dot--mentions"></span>Mentions: ' +
      row.mentions +
      '</div>' +
      '<div class="sky-llm-chart-tooltip-row"><span class="sky-llm-chart-tooltip-dot sky-llm-chart-tooltip-dot--citations"></span>Citations: ' +
      row.citations +
      '</div>' +
      '<div class="sky-llm-chart-tooltip-total">Total: ' +
      total +
      '</div>'
    );
  }

  function sentimentTooltipHtml(dateLabel, col) {
    return (
      '<div class="sky-llm-chart-tooltip-title">' +
      dateLabel +
      '</div>' +
      '<div class="sky-llm-chart-tooltip-row"><span class="sky-llm-chart-tooltip-dot sky-llm-chart-tooltip-dot--positive"></span>Positive: ' +
      col.pos +
      ' %</div>' +
      '<div class="sky-llm-chart-tooltip-row"><span class="sky-llm-chart-tooltip-dot sky-llm-chart-tooltip-dot--neutral"></span>Neutral: ' +
      col.neu +
      ' %</div>' +
      '<div class="sky-llm-chart-tooltip-row"><span class="sky-llm-chart-tooltip-dot sky-llm-chart-tooltip-dot--negative"></span>Negative: ' +
      col.neg +
      ' %</div>'
    );
  }

  function findOverviewMetricNodesBySequence() {
    var root = findOverviewKpiRoot();
    if (!root) return null;
    var textEls = Array.from(root.querySelectorAll('[data-rsp-slot="text"]')).filter(function (el) {
      return el.childElementCount === 0;
    });
    var nodes = {};
    var specIdx = 0;
    var i;
    for (i = 0; i < textEls.length && specIdx < OVERVIEW_KPI_SPECS.length; i++) {
      var txt = normalizeMetricLabel(textEls[i].textContent);
      var spec = OVERVIEW_KPI_SPECS[specIdx];
      if (spec.labels.indexOf(txt) < 0) continue;
      var j;
      for (j = i + 1; j < textEls.length; j++) {
        if (isMetricValueText(textEls[j].textContent)) {
          nodes[spec.key] = textEls[j];
          specIdx += 1;
          i = j;
          break;
        }
      }
    }
    return Object.keys(nodes).length >= 4 ? nodes : null;
  }

  function cacheMetricNodes() {
    var keys = Object.keys(METRIC_LABELS);
    var next = {};
    if (state.pageKind === 'overview') {
      var seq = findOverviewMetricNodesBySequence();
      if (seq) {
        state.metricNodes = seq;
        return;
      }
    }
    keys.forEach(function (key) {
      next[key] =
        document.querySelector('[data-sky-metric="' + key + '"]') || findMetricValueNode(METRIC_LABELS[key]);
    });
    state.metricNodes = next;
  }

  function watchOverviewKpiMutations() {
    if (state.pageKind !== 'overview' || state.kpiObserver) return;
    var root = findOverviewKpiRoot();
    if (!root || !window.MutationObserver) return;
    state.kpiObserver = new MutationObserver(function () {
      if (state.kpiObserverMuted) return;
      if (state.kpiObserverPending) return;
      state.kpiObserverPending = true;
      window.requestAnimationFrame(function () {
        state.kpiObserverPending = false;
        if (state.kpiObserverMuted) return;
        scheduleMetricsReapply();
      });
    });
    state.kpiObserver.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function cacheMarketRows() {
    state.marketRows = [];
    var svg = findMarketChartSvg();
    if (!svg) return;

    var paths = Array.from(svg.querySelectorAll('path')).filter(function (p) {
      return (p.getAttribute('d') || '').indexOf(' h ') >= 0;
    });
    var mentionPaths = paths
      .filter(function (p) {
        return p.getAttribute('fill') === '#3B82F6';
      })
      .sort(function (a, b) {
        return pathBarY(a.getAttribute('d')) - pathBarY(b.getAttribute('d'));
      });
    var citePaths = paths
      .filter(function (p) {
        return p.getAttribute('fill') === '#F97316';
      })
      .sort(function (a, b) {
        return pathBarY(a.getAttribute('d')) - pathBarY(b.getAttribute('d'));
      });

    var labels = Array.from(svg.querySelectorAll('text'))
      .filter(function (t) {
        var txt = (t.textContent || '').trim();
        if (!txt || txt.length > 40 || /^\d+$/.test(txt) || txt.indexOf('%') >= 0) return false;
        var low = txt.toLowerCase();
        if (low === 'mentions' || low === 'citations') return false;
        return true;
      })
      .sort(function (a, b) {
        return Number(a.getAttribute('y') || 0) - Number(b.getAttribute('y') || 0);
      });

    var totals = Array.from(svg.querySelectorAll('text'))
      .filter(function (t) {
        return /^\d+$/.test((t.textContent || '').trim());
      })
      .sort(function (a, b) {
        return Number(a.getAttribute('y') || 0) - Number(b.getAttribute('y') || 0);
      });

    mentionPaths.forEach(function (mentionPath, idx) {
      var row = {
        mentionPath: mentionPath,
        citePath: citePaths[idx] || null,
        labelEl: labels[idx] || null,
        totalEl: totals[idx] || null,
        y: pathBarY(mentionPath.getAttribute('d')),
        hitRect: null,
        data: null,
      };
      if (!svg.querySelector('.sky-llm-market-hit[data-row="' + idx + '"]')) {
        var hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('class', 'sky-llm-market-hit');
        hit.setAttribute('data-row', String(idx));
        hit.setAttribute('x', '80');
        hit.setAttribute('y', String(row.y - 6));
        hit.setAttribute('width', '1120');
        hit.setAttribute('height', '40');
        hit.setAttribute('fill', 'transparent');
        hit.addEventListener('mouseenter', function (e) {
          if (row.data) showTooltip(marketTooltipHtml(row.data), e.clientX, e.clientY);
        });
        hit.addEventListener('mousemove', function (e) {
          if (row.data && state.tooltip && !state.tooltip.hidden) {
            showTooltip(marketTooltipHtml(row.data), e.clientX, e.clientY);
          }
        });
        hit.addEventListener('mouseleave', hideTooltip);
        svg.appendChild(hit);
        row.hitRect = hit;
      }
      state.marketRows.push(row);
    });
  }

  function cacheSentimentColumns() {
    state.sentimentColumns = [];
    state.sentimentDates = [];
    var svg = findSentimentChartSvg();
    if (!svg) return;

    var dateTexts = Array.from(svg.querySelectorAll('text'))
      .filter(function (t) {
        var txt = (t.textContent || '').trim();
        return /\b\d{1,2},\s*\d{4}\b/.test(txt) || /\b[A-Za-z]{3}\s+\d{1,2},\s*\d{4}\b/.test(txt);
      })
      .sort(function (a, b) {
        return Number(a.getAttribute('x') || 0) - Number(b.getAttribute('x') || 0);
      });
    state.sentimentDateEls = dateTexts;
    state.sentimentDates = dateTexts.map(function (t) {
      return t.textContent.trim();
    });

    var byX = {};
    Array.from(svg.querySelectorAll('path')).forEach(function (p) {
      var d = p.getAttribute('d') || '';
      if (d.indexOf('L') < 0) return;
      var fill = p.getAttribute('fill');
      if (fill !== '#047857' && fill !== '#4B5563' && fill !== '#B91C1C') return;
      var x = String(pathBarX(d));
      if (!byX[x]) byX[x] = { x: Number(x), pos: null, neu: null, neg: null, hitRect: null, data: null };
      if (fill === '#047857') byX[x].pos = p;
      else if (fill === '#4B5563') byX[x].neu = p;
      else byX[x].neg = p;
    });

    state.sentimentColumns = Object.keys(byX)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (key, idx) {
        var col = byX[key];
        if (!svg.querySelector('.sky-llm-sentiment-hit[data-col="' + idx + '"]')) {
          var hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          hit.setAttribute('class', 'sky-llm-sentiment-hit');
          hit.setAttribute('data-col', String(idx));
          hit.setAttribute('x', String(col.x - 8));
          hit.setAttribute('y', String(SENTIMENT_TOP_Y));
          hit.setAttribute('width', String(SENTIMENT_BAR_W + 16));
          hit.setAttribute('height', String(SENTIMENT_BASE_Y - SENTIMENT_TOP_Y));
          hit.setAttribute('fill', 'transparent');
          hit.addEventListener('mouseenter', function (e) {
            if (col.data) {
              var label = state.sentimentDates[idx] || 'Week';
              showTooltip(sentimentTooltipHtml(label, col.data), e.clientX, e.clientY);
            }
          });
          hit.addEventListener('mousemove', function (e) {
            if (col.data && state.tooltip && !state.tooltip.hidden) {
              var label = state.sentimentDates[idx] || 'Week';
              showTooltip(sentimentTooltipHtml(label, col.data), e.clientX, e.clientY);
            }
          });
          hit.addEventListener('mouseleave', hideTooltip);
          svg.appendChild(hit);
          col.hitRect = hit;
        }
        return col;
      });
  }

  function cacheTrafficLines() {
    var svg = findTrafficChartSvg();
    if (!svg) return;
    var paths = Array.from(svg.querySelectorAll('path[stroke]')).filter(function (p) {
      var d = p.getAttribute('d') || '';
      return d.indexOf('M80,') === 0 && d.length > 40;
    });
    state.trafficLines.agentic = paths[0] || null;
    state.trafficLines.referral = paths[1] || null;
  }

  function markMarketChartOverflow() {
    var root = findSectionRoot('Market Tracking');
    if (!root) return;
    root.querySelectorAll('.recharts-wrapper, .recharts-responsive-container').forEach(function (node) {
      node.classList.add('sky-llm-chart-overflow');
    });
  }

  function reapplyMarketLineFilter() {
    if (window.skyLlmSnapshotMarket && window.skyLlmSnapshotMarket.ensureLinesVisible) {
      window.skyLlmSnapshotMarket.ensureLinesVisible();
    }
    if (window.skyLlmSnapshotMarket && window.skyLlmSnapshotMarket.applyBrandVisibility) {
      window.skyLlmSnapshotMarket.applyBrandVisibility();
    }
  }

  /** Market Tracking uses frozen SVG lines — never dash-animate them. */
  function animateBrandPresenceLines() {
    markMarketChartOverflow();
    reapplyMarketLineFilter();
  }

  function applyBrandPresenceDashboard(opts) {
    var animate = opts && opts.animate;
    var platformId = state.platformId;
    var rangeId = state.dateRangeId;
    var sentiment = getSentiment(platformId, rangeId);

    applyMetrics(platformId, rangeId);
    updateSentimentAxisLabels(rangeId);

    if (animate) {
      state.animToken += 1;
      var token = state.animToken;
      if (state.sentimentColumns.length) {
        runAnim(token, ANIM_MS, function (t) {
          paintSentiment(sentiment, t);
        });
      }
    } else {
      paintSentiment(sentiment, 1);
    }
    animateBrandPresenceLines();
  }

  function applyMetrics(platformId, rangeId) {
    cacheMetricNodes();
    var m = getMetrics(platformId, rangeId);
    state.kpiObserverMuted = true;
    try {
      Object.keys(m).forEach(function (key) {
        var node = state.metricNodes[key];
        if (!node) return;
        if (node.textContent !== m[key]) node.textContent = m[key];
        node.setAttribute('data-sky-metric', key);
      });
    } finally {
      state.kpiObserverMuted = false;
    }
    if (window.skyLlmSnapshotMarket && window.skyLlmSnapshotMarket.applyTrends) {
      window.skyLlmSnapshotMarket.applyTrends(platformId, rangeId);
    }
  }

  function marketWidths(rows) {
    var maxM = 1;
    rows.forEach(function (r) {
      if (r.mentions > maxM) maxM = r.mentions;
    });
    return rows.map(function (row) {
      return {
        row: row,
        mentionW: (row.mentions / maxM) * MARKET_MENTION_MAX,
        citeW: (row.citations / Math.max(row.mentions, 1)) * MARKET_CITE_MAX * 0.45 + row.citations * 1.2,
      };
    });
  }

  function paintMarket(rows, progress) {
    var sized = marketWidths(rows);
    var p = typeof progress === 'number' ? progress : 1;
    sized.forEach(function (item, idx) {
      var cached = state.marketRows[idx];
      if (!cached || !cached.mentionPath) return;
      var y = cached.y;
      var mw = item.mentionW * p;
      var cw = item.citeW * p;
      cached.mentionPath.setAttribute('d', makeMarketPath(83, y, mw));
      if (cached.citePath) cached.citePath.setAttribute('d', makeMarketPath(83 + mw, y, cw));
      if (cached.labelEl) {
        var labelName = item.row.name;
        var prevLabel = (cached.labelEl.textContent || '').trim();
        if (/^⭐/.test(prevLabel)) labelName = '⭐ ' + labelName;
        cached.labelEl.textContent = labelName;
      }
      if (cached.totalEl) cached.totalEl.textContent = String(Math.round((item.row.mentions + item.row.citations) * p));
      cached.data = item.row;
    });
  }

  function paintSentiment(cols, progress) {
    var totalH = SENTIMENT_BASE_Y - SENTIMENT_TOP_Y;
    var p = typeof progress === 'number' ? progress : 1;
    cols.forEach(function (seg, idx) {
      var column = state.sentimentColumns[idx];
      if (!column) return;
      var x = column.x;
      var posH = (seg.pos / 100) * totalH * p;
      var neuH = (seg.neu / 100) * totalH * p;
      var negH = (seg.neg / 100) * totalH * p;
      var posTop = SENTIMENT_BASE_Y - posH;
      var neuTop = posTop - neuH;
      if (column.pos) column.pos.setAttribute('d', makeStackPath(x, posTop, SENTIMENT_BASE_Y));
      if (column.neu) column.neu.setAttribute('d', makeStackPath(x, neuTop, posTop));
      if (column.neg) {
        if (negH > 0.5) column.neg.setAttribute('d', makeStackPath(x, SENTIMENT_TOP_Y, neuTop));
        else column.neg.setAttribute('d', makeStackPath(x, SENTIMENT_TOP_Y, SENTIMENT_TOP_Y));
      }
      column.data = seg;
    });
  }

  function updateSentimentAxisLabels(rangeId) {
    var labels = getSentimentAxisDates(rangeId);
    state.sentimentDateEls.forEach(function (el, i) {
      if (el && labels[i]) el.textContent = labels[i];
    });
    state.sentimentDates = labels;
  }

  function applyTraffic(rangeId, animate) {
    var agenticD = TRAFFIC_LINES.agentic[rangeId] || TRAFFIC_LINES.agentic['4w'];
    var referralD = TRAFFIC_LINES.referral[rangeId] || TRAFFIC_LINES.referral['4w'];
    var token = state.animToken;
    if (state.trafficLines.agentic) {
      if (animate) animateLinePath(state.trafficLines.agentic, agenticD, ANIM_MS + 120, token);
      else {
        state.trafficLines.agentic.setAttribute('d', agenticD);
        state.trafficLines.agentic.style.strokeDasharray = '';
        state.trafficLines.agentic.style.strokeDashoffset = '';
      }
    }
    if (state.trafficLines.referral) {
      if (animate) {
        window.setTimeout(function () {
          animateLinePath(state.trafficLines.referral, referralD, ANIM_MS + 120, token);
        }, 80);
      } else {
        state.trafficLines.referral.setAttribute('d', referralD);
        state.trafficLines.referral.style.strokeDasharray = '';
        state.trafficLines.referral.style.strokeDashoffset = '';
      }
    }
  }

  function applyDashboard(opts) {
    if (state.pageKind === 'brand-claims') return;
    if (state.pageKind === 'brand-presence') {
      applyBrandPresenceDashboard(opts);
      return;
    }

    var animate = opts && opts.animate;
    var platformId = state.platformId;
    var rangeId = state.dateRangeId;
    var market = getMarketRows(platformId, rangeId);
    var sentiment = getSentiment(platformId, rangeId);

    applyMetrics(platformId, rangeId);
    updateSentimentAxisLabels(rangeId);

    if (animate) {
      state.animToken += 1;
      var token = state.animToken;
      runAnim(token, ANIM_MS, function (t) {
        paintMarket(market, t);
        paintSentiment(sentiment, t);
      });
      applyTraffic(rangeId, true);
    } else {
      paintMarket(market, 1);
      paintSentiment(sentiment, 1);
      applyTraffic(rangeId, false);
    }
  }

  function buildFilterPicker(combobox, config) {
    var shell = findPickerShell(combobox);
    if (!shell) return null;

    var existing = findExistingPickerHost(shell, config.hostClass, combobox, config.triggerClass);
    if (existing) {
      return { shell: shell, host: existing, closeMenu: existing.__skyCloseMenu };
    }

    removePicker(shell, config.hostClass, config.shellClass, combobox);

    shell.classList.add(config.shellClass);
    combobox.setAttribute('tabindex', '-1');
    combobox.setAttribute('aria-hidden', 'true');

    var host = document.createElement('div');
    host.className = config.hostClass;
    host.__skyControl = combobox;

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = config.triggerClass;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', config.ariaLabel);

    var menu = document.createElement('ul');
    menu.className = config.menuClass;
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    var menuOpen = false;

    function renderTrigger() {
      trigger.innerHTML = config.renderTrigger(menuOpen);
    }

    host.__skyRenderTrigger = renderTrigger;

    function closeMenu() {
      menuOpen = false;
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      combobox.setAttribute('aria-expanded', 'false');
      if (config.accentWhenOpen) host.classList.remove('is-open');
      renderTrigger();
    }

    function selectOption(opt, e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      config.onSelect(opt, combobox);
      renderTrigger();
      closeMenu();
      closeAllPickerMenus();
    }

    function openMenu() {
      closeAllPickerMenus();
      menuOpen = true;
      if (config.accentWhenOpen) host.classList.add('is-open');
      renderTrigger();
      state.reactListboxesHidden = false;
      hideReactListboxes();
      menu.innerHTML = '';
      if (config.renderMenuHeader) {
        menu.appendChild(config.renderMenuHeader());
      }
      config.options().forEach(function (opt) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = config.optionClass + (config.isSelected(opt) ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', config.isSelected(opt) ? 'true' : 'false');
        btn.innerHTML = config.renderOption(opt);
        if (config.getOptionId) btn.setAttribute('data-sky-platform-id', config.getOptionId(opt));
        btn.addEventListener('mousedown', selectOption.bind(null, opt), true);
        btn.addEventListener('click', selectOption.bind(null, opt), true);
        li.appendChild(btn);
        menu.appendChild(li);
      });
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      hideReactListboxes();
      if (menu.hidden) openMenu();
      else closeMenu();
    }, true);
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, true);

    if (!state.outsidePickerCloseWired) {
      state.outsidePickerCloseWired = true;
      document.addEventListener(
        'mousedown',
        function (e) {
          if (e.target.closest('.sky-llm-platform-host, .sky-llm-date-host, .sky-llm-filter-host')) return;
          closeAllPickerMenus();
        },
        true,
      );
    }

    host.appendChild(trigger);
    host.appendChild(menu);
    shell.insertBefore(host, combobox);
    renderTrigger();
    host.__skyCloseMenu = closeMenu;

    return { shell: shell, host: host, closeMenu: closeMenu };
  }

  function buildPlatformPicker() {
    var combobox = findCombobox('platform');
    if (!combobox) return;
    buildFilterPicker(combobox, {
      shellClass: 'sky-llm-platform-shell',
      hostClass: 'sky-llm-platform-host',
      triggerClass: 'sky-llm-platform-trigger',
      menuClass: 'sky-llm-platform-menu',
      optionClass: 'sky-llm-platform-option',
      ariaLabel: 'Platform',
      options: function () {
        return PLATFORMS;
      },
      isSelected: function (p) {
        return p.id === state.platformId;
      },
      renderTrigger: function () {
        var p = PLATFORMS.find(function (x) {
          return x.id === state.platformId;
        });
        var chevron = arguments[0] ? '▲' : '▼';
        return (
          '<span>' +
          (p ? p.name : 'ChatGPT (Free)') +
          '</span><span class="sky-llm-platform-trigger-chevron" aria-hidden="true">' +
          chevron +
          '</span>'
        );
      },
      renderOption: function (p) {
        return (
          '<span class="sky-llm-platform-check" aria-hidden="true">✓</span>' +
          iconSvg(p.icon) +
          '<span class="sky-llm-platform-copy"><strong>' +
          p.name +
          '</strong><span>' +
          p.share +
          '</span></span>'
        );
      },
      getOptionId: function (p) {
        return p.id;
      },
      onSelect: function (p) {
        setPlatformId(p.id, { animate: true });
      },
    });
  }

  function buildDatePicker() {
    var combobox = findCombobox('date range');
    if (!combobox) return;
    buildFilterPicker(combobox, {
      shellClass: 'sky-llm-date-shell',
      hostClass: 'sky-llm-date-host',
      triggerClass: 'sky-llm-date-trigger',
      menuClass: 'sky-llm-date-menu',
      optionClass: 'sky-llm-date-option',
      ariaLabel: 'Date Range',
      options: function () {
        return getDateRanges();
      },
      isSelected: function (d) {
        return d.id === state.dateRangeId;
      },
      renderTrigger: function () {
        var d = getSelectedDateRange();
        var chevron = arguments[0] ? '▲' : '▼';
        return (
          '<span>' +
          (d ? d.name : 'Last 4 Weeks') +
          '</span><span class="sky-llm-date-trigger-chevron" aria-hidden="true">' +
          chevron +
          '</span>'
        );
      },
      renderOption: function (d) {
        return (
          '<span class="sky-llm-date-check" aria-hidden="true">✓</span>' +
          '<span class="sky-llm-date-copy"><strong>' +
          d.name +
          '</strong><span>' +
          d.range +
          '</span></span>'
        );
      },
      onSelect: function (d, input) {
        state.dateRangeId = d.id;
        if (input) input.value = d.name;
        applyDashboard({ animate: true });
        notifyPlatformChange();
      },
    });
  }

  function buildListFilterPicker(labelPart, config) {
    var combobox = findCombobox(labelPart);
    if (!combobox) return;
    buildFilterPicker(
      combobox,
      Object.assign(
        {
          shellClass: 'sky-llm-filter-shell',
          hostClass: 'sky-llm-filter-host',
          triggerClass: 'sky-llm-filter-trigger',
          menuClass: 'sky-llm-filter-menu',
          optionClass: 'sky-llm-filter-option',
        },
        config,
      ),
    );
  }

  function selectedListOption(options, id) {
    return (
      options.find(function (o) {
        return o.id === id;
      }) || options[0]
    );
  }

  function listPickerTriggerHtml(label, isOpen) {
    var chevron = isOpen ? '▲' : '▼';
    return (
      '<span>' +
      label +
      '</span><span class="sky-llm-filter-trigger-chevron" aria-hidden="true">' +
      chevron +
      '</span>'
    );
  }

  function listPickerOptionHtml(opt) {
    return (
      '<span class="sky-llm-filter-check" aria-hidden="true">✓</span>' +
      '<span class="sky-llm-filter-copy">' +
      opt.name +
      '</span>'
    );
  }

  function filterOptionsBySearch(options, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return options;
    return options.filter(function (o) {
      return String(o.name || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  function stagedSearchHeader(placeholder) {
    return function () {
      var li = document.createElement('li');
      li.className = 'sky-llm-filter-menu-search-wrap';
      li.innerHTML =
        '<label class="sky-llm-filter-menu-search-field" role="search">' +
        '<span class="sky-llm-filter-menu-search-icon" aria-hidden="true"></span>' +
        '<input type="search" class="sky-llm-filter-menu-search-input" placeholder="' +
        String(placeholder || 'Search') +
        '" autocomplete="off" spellcheck="false" />' +
        '</label>';
      return li;
    };
  }

  function buildStagedFilterPicker(control, config) {
    var shell = findPickerShell(control);
    if (!shell) return null;

    var existing = findExistingPickerHost(shell, config.hostClass, control);
    if (existing && existing.__skyStagedPicker) {
      if (existing.__skyRenderTrigger) existing.__skyRenderTrigger(false);
      return existing;
    }

    removePicker(shell, config.hostClass, config.shellClass, control);

    shell.classList.add(config.shellClass);
    control.setAttribute('tabindex', '-1');
    control.setAttribute('aria-hidden', 'true');

    var host = document.createElement('div');
    host.className = config.hostClass;
    host.__skyStagedPicker = true;
    host.__skyControl = control;

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = config.triggerClass;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', config.ariaLabel);

    var menu = document.createElement('ul');
    menu.className = config.menuClass + ' sky-llm-filter-menu--staged';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    var menuOpen = false;
    var pending = null;
    var searchQuery = '';

    function clonePending() {
      if (config.mode === 'multi') {
        var applied = config.getApplied();
        return applied && applied.length ? applied.slice() : [];
      }
      return config.getApplied();
    }

    function pendingEqualsApplied() {
      if (config.mode === 'multi') {
        var applied = config.getApplied() || [];
        var next = pending || [];
        if (applied.length !== next.length) return false;
        return applied.every(function (id) {
          return next.indexOf(id) >= 0;
        });
      }
      return pending === config.getApplied();
    }

    function renderTrigger() {
      trigger.innerHTML = config.renderTrigger(menuOpen);
    }

    host.__skyRenderTrigger = renderTrigger;

    function closeMenu() {
      menuOpen = false;
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      control.setAttribute('aria-expanded', 'false');
      host.classList.remove('is-open');
      renderTrigger();
    }

    function commitPending() {
      config.setApplied(pending);
      if (config.onApply) config.onApply(pending, control);
      renderTrigger();
      closeMenu();
      closeAllPickerMenus();
    }

    function clearPending() {
      pending = config.mode === 'multi' ? [] : config.defaultId || 'all';
      renderMenu();
    }

    function toggleMultiOption(opt) {
      var ids = pending ? pending.slice() : [];
      var idx = ids.indexOf(opt.id);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(opt.id);
      pending = ids;
      renderMenu();
    }

    function selectSingleOption(opt) {
      pending = opt.id;
      renderMenu();
    }

    function renderMenu() {
      menu.innerHTML = '';
      if (config.renderMenuHeader) {
        menu.appendChild(config.renderMenuHeader());
      }

      var searchWrap = menu.querySelector('.sky-llm-filter-menu-search-wrap');
      if (searchWrap) {
        var input = searchWrap.querySelector('.sky-llm-filter-menu-search-input');
        if (input && !input.__skyWired) {
          input.__skyWired = true;
          input.addEventListener('input', function (e) {
            e.stopPropagation();
            searchQuery = input.value || '';
            renderMenu();
          });
          input.addEventListener('mousedown', function (e) {
            e.stopPropagation();
          });
          input.addEventListener('click', function (e) {
            e.stopPropagation();
          });
        }
        if (input) input.value = searchQuery;
      }

      var listWrap = document.createElement('li');
      listWrap.className = 'sky-llm-filter-menu-options-wrap';
      var list = document.createElement('ul');
      list.className = 'sky-llm-filter-menu-options';

      filterOptionsBySearch(config.options(), searchQuery).forEach(function (opt) {
        var li = document.createElement('li');
        var selected =
          config.mode === 'multi'
            ? pending && pending.indexOf(opt.id) >= 0
            : pending === opt.id;

        if (config.mode === 'multi') {
          var row = document.createElement('label');
          row.className = 'sky-llm-filter-checkbox-row' + (selected ? ' is-selected' : '');
          row.innerHTML =
            '<input type="checkbox" class="sky-llm-filter-checkbox"' +
            (selected ? ' checked' : '') +
            ' />' +
            '<span class="sky-llm-filter-copy">' +
            opt.name +
            '</span>';
          row.querySelector('input').addEventListener('change', function (e) {
            e.stopPropagation();
            toggleMultiOption(opt);
          });
          row.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
          });
          li.appendChild(row);
        } else {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = config.optionClass + (selected ? ' is-selected' : '');
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-selected', selected ? 'true' : 'false');
          btn.innerHTML = listPickerOptionHtml(opt);
          btn.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            selectSingleOption(opt);
          });
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
          });
          li.appendChild(btn);
        }
        list.appendChild(li);
      });

      listWrap.appendChild(list);
      menu.appendChild(listWrap);

      var footer = document.createElement('li');
      footer.className = 'sky-llm-filter-menu-footer';
      var applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'sky-llm-filter-apply';
      applyBtn.textContent = 'Apply';
      applyBtn.disabled = pendingEqualsApplied();
      applyBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!applyBtn.disabled) commitPending();
      });
      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'sky-llm-filter-clear';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearPending();
      });
      footer.appendChild(applyBtn);
      footer.appendChild(clearBtn);
      menu.appendChild(footer);
    }

    function openMenu() {
      closeAllPickerMenus();
      menuOpen = true;
      pending = clonePending();
      searchQuery = '';
      renderTrigger();
      state.reactListboxesHidden = false;
      hideReactListboxes();
      renderMenu();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      hideReactListboxes();
      if (menu.hidden) openMenu();
      else closeMenu();
    }, true);
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, true);

    if (!state.outsidePickerCloseWired) {
      state.outsidePickerCloseWired = true;
      document.addEventListener(
        'mousedown',
        function (e) {
          if (e.target.closest('.sky-llm-platform-host, .sky-llm-date-host, .sky-llm-filter-host')) return;
          closeAllPickerMenus();
        },
        true,
      );
    }

    host.appendChild(trigger);
    host.appendChild(menu);
    shell.insertBefore(host, control);
    renderTrigger();
    host.__skyCloseMenu = closeMenu;

    return host;
  }

  function hideNativeFilterChrome() {
    document
      .querySelectorAll('.sky-llm-platform-shell, .sky-llm-date-shell, .sky-llm-filter-shell, .sky-llm-select-others-shell')
      .forEach(function (shell) {
        shell.style.setProperty('background', 'transparent', 'important');
        shell.style.setProperty('border', 'none', 'important');
        shell.style.setProperty('box-shadow', 'none', 'important');
        var row = shell.parentElement;
        for (var i = 0; i < 3 && row; i++) {
          if (!row.querySelector('.sky-llm-platform-host, .sky-llm-date-host, .sky-llm-filter-host')) break;
          row.style.setProperty('background', 'transparent', 'important');
          row.style.setProperty('border', 'none', 'important');
          row.style.setProperty('box-shadow', 'none', 'important');
          row = row.parentElement;
        }
      });
  }

  function pageUsesFilterPickers() {
    var kind = getPageKind();
    return kind === 'overview' || kind === 'brand-presence' || kind === 'brand-claims';
  }

  function stagedPickerDefaults() {
    return {
      shellClass: 'sky-llm-filter-shell',
      hostClass: 'sky-llm-filter-host',
      triggerClass: 'sky-llm-filter-trigger',
      menuClass: 'sky-llm-filter-menu',
      optionClass: 'sky-llm-filter-option',
    };
  }

  function buildTopicPicker() {
    var control = findTopicTrigger();
    if (!control) return;
    buildStagedFilterPicker(
      control,
      Object.assign(stagedPickerDefaults(), {
        ariaLabel: 'Topic',
        mode: 'multi',
        options: getTopicOptions,
        getApplied: function () {
          return state.topicIds || [];
        },
        setApplied: function (val) {
          state.topicIds = val || [];
        },
        onApply: function (val, btn) {
          var span = btn && btn.querySelector('span[data-placeholder]');
          if (span) span.textContent = topicTriggerLabel(val);
        },
        renderTrigger: function (isOpen) {
          var label = topicTriggerLabel(state.topicIds);
          if (isOpen) label = 'Topic: ' + label;
          return listPickerTriggerHtml(label, isOpen);
        },
        renderMenuHeader: stagedSearchHeader('Search Topic'),
      }),
    );
  }

  function buildPromptsOriginPicker() {
    var control = findCombobox('prompts origin');
    if (!control) return;
    buildStagedFilterPicker(
      control,
      Object.assign(stagedPickerDefaults(), {
        ariaLabel: 'Prompts Origin',
        mode: 'single',
        defaultId: 'all',
        options: function () {
          return PROMPTS_ORIGIN_OPTIONS;
        },
        getApplied: function () {
          return state.promptsOriginId;
        },
        setApplied: function (val) {
          state.promptsOriginId = val || 'all';
        },
        onApply: function (val, input) {
          var sel = selectedListOption(PROMPTS_ORIGIN_OPTIONS, val);
          if (input && sel) input.value = sel.name;
        },
        renderTrigger: function (isOpen) {
          var sel = selectedListOption(PROMPTS_ORIGIN_OPTIONS, state.promptsOriginId);
          var label = sel ? sel.name : 'All origins';
          if (isOpen) label = 'Prompts Origin: ' + label;
          return listPickerTriggerHtml(label, isOpen);
        },
        renderMenuHeader: stagedSearchHeader('Search Prompts Origin'),
      }),
    );
  }

  function buildPromptBrandingPicker() {
    var control = findCombobox('prompt branding');
    if (!control) return;
    buildStagedFilterPicker(
      control,
      Object.assign(stagedPickerDefaults(), {
        ariaLabel: 'Prompt Branding',
        mode: 'single',
        defaultId: 'all',
        options: function () {
          return PROMPTS_BRANDING_OPTIONS;
        },
        getApplied: function () {
          return state.promptsBrandingId;
        },
        setApplied: function (val) {
          state.promptsBrandingId = val || 'all';
        },
        onApply: function (val, input) {
          var sel = selectedListOption(PROMPTS_BRANDING_OPTIONS, val);
          if (input && sel) input.value = sel.name;
        },
        renderTrigger: function (isOpen) {
          var sel = selectedListOption(PROMPTS_BRANDING_OPTIONS, state.promptsBrandingId);
          var label = sel ? sel.name : 'All';
          if (isOpen) label = 'Prompt Branding: ' + label;
          return listPickerTriggerHtml(label, isOpen);
        },
        renderMenuHeader: stagedSearchHeader('Search Prompt Branding'),
      }),
    );
  }

  function buildClaimsListPicker(labelPart, stateKey, options) {
    buildListFilterPicker(labelPart, {
      ariaLabel: labelPart,
      options: function () {
        return options;
      },
      isSelected: function (o) {
        return o.id === state[stateKey];
      },
      renderTrigger: function (isOpen) {
        var sel = selectedListOption(options, state[stateKey]);
        return listPickerTriggerHtml(sel ? sel.name : options[0].name, isOpen);
      },
      renderOption: listPickerOptionHtml,
      getOptionId: function (o) {
        return o.id;
      },
      onSelect: function (o, input) {
        state[stateKey] = o.id;
        if (input) input.value = o.name;
      },
    });
  }

  function buildBrandClaimsPickers() {
    buildBrandPicker();
    buildClaimsListPicker('sort by', 'claimsSortId', CLAIMS_SORT_OPTIONS);
    buildClaimsListPicker('marketer attention', 'claimsMarketerAttentionId', CLAIMS_FILTER_OPTIONS.marketerAttention);
    buildClaimsListPicker('sentiment', 'claimsSentimentId', CLAIMS_FILTER_OPTIONS.sentiment);
    buildClaimsListPicker('brand relevance', 'claimsBrandRelevanceId', CLAIMS_FILTER_OPTIONS.brandRelevance);
    buildClaimsListPicker('category', 'claimsCategoryId', CLAIMS_FILTER_OPTIONS.category);
    buildClaimsListPicker('claim type', 'claimsClaimTypeId', CLAIMS_FILTER_OPTIONS.claimType);
    buildClaimsListPicker('frequency', 'claimsFrequencyId', CLAIMS_FILTER_OPTIONS.frequency);
    buildClaimsListPicker('citations', 'claimsCitationsId', CLAIMS_FILTER_OPTIONS.citations);
    buildClaimsListPicker('opportunities', 'claimsOpportunitiesId', CLAIMS_FILTER_OPTIONS.opportunities);
  }

  function buildBrandPicker() {
    buildListFilterPicker('brand selector', {
      ariaLabel: 'Brand',
      options: getBrandOptions,
      isSelected: function () {
        return true;
      },
      renderTrigger: function (isOpen) {
        var sel = getBrandOptions()[0];
        return listPickerTriggerHtml(sel ? sel.name : 'Sky TV and broadband', isOpen);
      },
      renderOption: listPickerOptionHtml,
      getOptionId: function () {
        return 'brand';
      },
      onSelect: function (o, input) {
        if (input) input.value = o.name;
      },
    });
  }

  function buildSitePicker() {
    buildListFilterPicker('site selector', {
      ariaLabel: 'Site',
      options: getSiteOptions,
      isSelected: function (o) {
        return o.id === state.siteId;
      },
      renderTrigger: function (isOpen) {
        var sel = selectedListOption(getSiteOptions(), state.siteId);
        return listPickerTriggerHtml(sel ? sel.name : 'sky.com', isOpen);
      },
      renderOption: listPickerOptionHtml,
      getOptionId: function (o) {
        return o.id;
      },
      onSelect: function (o, input) {
        state.siteId = o.id;
        if (input) input.value = o.name;
      },
    });
  }

  function buildCategoryPicker() {
    buildListFilterPicker('category', {
      ariaLabel: 'Category',
      accentWhenOpen: true,
      options: getCategoryOptions,
      isSelected: function (o) {
        return o.id === state.categoryId;
      },
      renderTrigger: function (isOpen) {
        var sel = selectedListOption(getCategoryOptions(), state.categoryId);
        var label = isOpen ? 'Category: ' + (sel ? sel.name : 'All Categories') : sel ? sel.name : 'All Categories';
        return listPickerTriggerHtml(label, isOpen);
      },
      renderOption: listPickerOptionHtml,
      getOptionId: function (o) {
        return o.id;
      },
      onSelect: function (o, input) {
        state.categoryId = o.id;
        if (input) input.value = o.name;
      },
      renderMenuHeader: function () {
        var li = document.createElement('li');
        li.className = 'sky-llm-filter-menu-search-wrap';
        li.innerHTML =
          '<div class="sky-llm-filter-menu-search" role="search">Search Category</div>';
        return li;
      },
    });
  }

  function buildMarketPicker() {
    buildListFilterPicker('market', {
      ariaLabel: 'Market',
      options: getMarketOptions,
      isSelected: function (o) {
        return o.id === state.marketId;
      },
      renderTrigger: function (isOpen) {
        var sel = selectedListOption(getMarketOptions(), state.marketId);
        return listPickerTriggerHtml(sel ? sel.name : 'All Markets', isOpen);
      },
      renderOption: listPickerOptionHtml,
      getOptionId: function (o) {
        return o.id;
      },
      onSelect: function (o, input) {
        state.marketId = o.id;
        if (input) input.value = o.name;
      },
    });
  }

  function ensurePickers() {
    suppressUiBlockers();
    watchWalnutRemoval();
    state.reactListboxesHidden = false;
    hideReactListboxes();
    syncFilterStateFromBrands();
    buildPlatformPicker();
    buildDatePicker();
    var kind = getPageKind();
    if (pageUsesFilterPickers()) {
      if (kind === 'brand-claims') {
        buildBrandClaimsPickers();
      } else {
        buildSitePicker();
        buildCategoryPicker();
        buildMarketPicker();
      }
    }
    if (kind === 'overview') {
      buildBrandPicker();
    }
    if (kind === 'brand-presence') {
      buildTopicPicker();
      buildPromptsOriginPicker();
      buildPromptBrandingPicker();
    }
    hideNativeFilterChrome();
    syncPlatformTriggerLabel();
    if (getPageKind() === 'overview' && window.skyLlmSnapshotMarket && window.skyLlmSnapshotMarket.ensureLinesVisible) {
      window.skyLlmSnapshotMarket.ensureLinesVisible();
    }
  }

  function init() {
    if (getPageKind() === 'agentic-traffic' || getPageKind() === 'referral-traffic') return;
    if (state.ready && document.querySelector('.sky-llm-platform-host, .sky-llm-filter-host')) {
      state.pageKind = getPageKind();
      ensurePickers();
      watchNativePlatformSelection();
      refreshDashboardCaches();
      applyDashboard({ animate: false });
      return;
    }
    state.pageKind = getPageKind();
    cacheMetricNodes();
    cacheSentimentColumns();
    if (state.pageKind === 'brand-presence') {
      markMarketChartOverflow();
    } else {
      cacheMarketRows();
      cacheTrafficLines();
    }
    ensurePickers();
    ensureTooltip();
    watchNativePlatformSelection();
    applyDashboard({ animate: state.pageKind !== 'brand-presence' && !state.ready });
    state.ready = true;
    notifyPlatformChange();
    watchOverviewKpiMutations();
    if (window.skyLlmSnapshotMarket && window.skyLlmSnapshotMarket.initMarketTracking) {
      window.setTimeout(function () {
        window.skyLlmSnapshotMarket.initMarketTracking();
      }, 100);
      window.setTimeout(reapplyMarketLineFilter, 950);
      window.setTimeout(reapplyMarketLineFilter, 1900);
    }
  }

  document.addEventListener('click', hideTooltip);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideTooltip();
  });

  wirePlatformSelection();
  watchWalnutRemoval();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.setTimeout(init, 800);
  [150, 600, 1500, 3000].forEach(function (ms) {
    window.setTimeout(function () {
      if (!/overview\.html|brand-presence\.html|brand-claims\.html/i.test(location.pathname || '')) return;
      ensurePickers();
      if (state.ready) applyDashboard({ animate: false });
    }, ms);
  });

  var platformApi = {
    isReady: function () {
      return state.ready;
    },
    ensurePickers: ensurePickers,
    getDashboardMetrics: function () {
      return getMetrics(state.platformId, state.dateRangeId);
    },
    getPlatformId: function () {
      return state.platformId;
    },
    refresh: function () {
      if (!state.ready) return;
      state.metricNodes = {};
      refreshDashboardCaches();
      applyDashboard({ animate: false });
      scheduleMetricsReapply();
      var brands = llmDemoBrands();
      if (brands && brands.patchMarketComparisonLabels) {
        brands.patchMarketComparisonLabels();
      }
    },
  };
  root.llmSnapshotPlatform = platformApi;
  root.skyLlmSnapshotPlatform = platformApi;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
