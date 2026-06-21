/**
 * Tour loader + state playback for AEP & Apps architecture diagram.
 * Consumed by aep-architecture-apps.js (vanilla JS, no dependencies).
 */
(function (global) {
  'use strict';

  var TOUR_VERSION = 1;
  var DEFAULT_TOUR_URL = 'data/aep-architecture-tour-default.json';
  var EXPECTED_STATE_COUNT = 16;

  var FLOW_COLORS = {
    ingress: '#308fff',
    intra: '#7d8a9e',
    egress: '#e34850',
  };

  var FLOW_IDS = [
    'flow-tags-edge',
    'flow-sources-stream',
    'flow-sources-batch',
    'flow-stream-lake',
    'flow-batch-lake',
    'flow-lake-pipeline',
    'flow-pipeline-profile',
    'flow-edge-profile',
    'flow-profile-seg',
    'flow-seg-jo',
    'flow-profile-cdp',
    'flow-edge-inbound',
    'flow-jo-msg',
    'flow-cdp-paid',
    'flow-cja-jrpt',
    'flow-mix-mrpt',
  ];

  var FLOW_LABELS = {
    'flow-tags-edge': 'Tags → Edge',
    'flow-sources-stream': 'Sources → Streaming',
    'flow-sources-batch': 'Sources → Batch',
    'flow-stream-lake': 'Streaming → Lake',
    'flow-batch-lake': 'Batch → Lake',
    'flow-lake-pipeline': 'Lake → Pipeline',
    'flow-pipeline-profile': 'Pipeline → Profile',
    'flow-edge-profile': 'Edge → Profile',
    'flow-profile-seg': 'Profile → Segmentation',
    'flow-seg-jo': 'Segmentation → JO',
    'flow-profile-cdp': 'Profile → RTCDP',
    'flow-edge-inbound': 'Edge → Inbound',
    'flow-jo-msg': 'JO → Message Delivery',
    'flow-cdp-paid': 'RTCDP → Paid Media',
    'flow-cja-jrpt': 'CJA → Journey Reporting',
    'flow-mix-mrpt': 'Mix Modeler → Marketing Performance',
  };

  /** Embedded fallback — deck-aligned default (mirrors data/aep-architecture-tour-default.json). */
  var EMBEDDED_TOUR = {
    version: TOUR_VERSION,
    source: 'embedded',
    states: [
      {
        label: '1 — Platform overview',
        headline: 'Adobe Experience Platform as the centralized data foundation',
        body:
          'Adobe Experience Platform is a powerful, flexible, open, and centralized data foundation that collects, standardizes, governs, applies AI insights to, and unifies data to offer thoughtful and relevant digital customer experiences.',
        highlights: ['node-aep', 'node-edge'],
        flows: [],
      },
      {
        label: '2 — Four native apps',
        headline: 'Four applications natively built on Experience Platform',
        body:
          'Four applications are natively built on Experience Platform: Adobe Real-Time Customer Data Platform (RTCDP), Journey Optimizer (AJO), Customer Journey Analytics (CJA), and Adobe Mix Modeler.',
        highlights: ['node-jo', 'node-rtcdp', 'node-cja', 'node-mix'],
        flows: [],
      },
      {
        label: '3 — Ingestion',
        headline: 'Ingest data from almost any source',
        body:
          'Adobe Experience Platform can ingest data from almost any source needed to power a customer experience—web and mobile behavioral data, Adobe Experience Cloud applications, third-party systems, cloud-based storage or databases, enterprise data sources like CRMs, ETL tools, external data warehouses, and more. Experience Platform ingests data from sources either by streaming or batch.',
        highlights: ['node-sources', 'node-tags', 'node-streaming', 'node-batch'],
        flows: [
          { id: 'flow-sources-stream', stroke: FLOW_COLORS.ingress, kind: 'ingress' },
          { id: 'flow-sources-batch', stroke: FLOW_COLORS.ingress, kind: 'ingress' },
        ],
      },
      {
        label: '4 — Real-time streaming',
        headline: 'Real-time streaming updates the profile in context',
        body:
          'Experience Platform supports streaming data from your data sources using either an SDK or an API. That data updates the Real-Time Customer Profile in real time, which in turn can support real-time experiences and personalization.',
        highlights: ['node-sources', 'node-streaming', 'node-edge'],
        flows: [{ id: 'flow-sources-stream', stroke: FLOW_COLORS.ingress, kind: 'ingress' }],
      },
      {
        label: '5 — Batch ingestion',
        headline: 'Batch ingestion enriches the profile on a schedule',
        body:
          'You can batch upload data on a one-time or periodic basis using an API or a pre-built connector. Batch ingested data gets loaded into the Experience Platform Data Lake and enriches the Real-Time Customer Profile once daily.',
        highlights: ['node-sources', 'node-batch', 'node-lake'],
        flows: [
          { id: 'flow-sources-batch', stroke: FLOW_COLORS.ingress, kind: 'ingress' },
          { id: 'flow-batch-lake', stroke: FLOW_COLORS.intra, kind: 'intra' },
        ],
      },
      {
        label: '6 — Edge Network & Tags',
        headline: 'Edge Network and Tags simplify deployment',
        body:
          'You can stream data directly into Experience Platform or via the Edge Network, a globally distributed network of servers that minimizes latency for sending data to Experience Platform and delivering content by using a server physically close to the customer. Tags expedites and simplifies your Experience Platform deployment. It gives users a simple way to deploy and manage all the analytics, marketing, and advertising tags necessary to power relevant customer experiences.',
        highlights: ['node-tags', 'node-edge'],
        flows: [{ id: 'flow-tags-edge', stroke: FLOW_COLORS.ingress, kind: 'ingress' }],
      },
      {
        label: '7 — Streaming to profile',
        headline: 'Streaming data enriches Real-Time Customer Profile',
        body:
          'Streaming data enriches the Real-Time Customer Profile, unlocking your ability to do real-time personalization, journey orchestration, and activation at destinations.',
        highlights: ['node-streaming', 'node-pipeline', 'node-profile', 'node-edge'],
        flows: [
          { id: 'flow-sources-stream', stroke: FLOW_COLORS.ingress, kind: 'ingress' },
          { id: 'flow-edge-profile', stroke: FLOW_COLORS.intra, kind: 'intra' },
          { id: 'flow-pipeline-profile', stroke: FLOW_COLORS.intra, kind: 'intra' },
        ],
      },
      {
        label: '8 — Identity Graph',
        headline: 'Identity Graph unifies customer identities',
        body:
          "Identity Graph is a collection of a single customer's identities across your data sources—their CRM ID, email ID, support ID, and others.",
        highlights: ['node-profile', 'node-identity'],
        flows: [{ id: 'flow-pipeline-profile', stroke: FLOW_COLORS.intra, kind: 'intra' }],
      },
      {
        label: '9 — Segmentation & audiences',
        headline: 'Segmentation and Audience Composition',
        body:
          'Experience Platform provides marketer-friendly rules-based segmentation capabilities. As streaming data streams in and attaches to a profile, the rules are applied to immediately qualify or disqualify individuals for segments. In comparison, segmentation is only applied to batch data once a day.',
        highlights: ['node-seg', 'node-profile'],
        flows: [{ id: 'flow-profile-seg', stroke: FLOW_COLORS.intra, kind: 'intra' }],
      },
      {
        label: '10 — Federated Audience Composition',
        headline: 'Federated Audience Composition from data warehouses',
        body:
          'Federated Audience Composition allows you to import third-party audiences from data warehouses into Experience Platform so that you can build and enrich audiences with these third-party audiences.',
        highlights: ['node-seg', 'node-sources'],
        flows: [],
      },
      {
        label: '11 — Query Service & AI',
        headline: 'Query Service and Intelligence & AI',
        body:
          'Query Service and Intelligence and AI are additional capabilities that can offer your business value by helping you answer questions based on data in the Data Lake.',
        highlights: ['node-query', 'node-intel', 'node-lake'],
        flows: [
          { id: 'flow-stream-lake', stroke: FLOW_COLORS.intra, kind: 'intra' },
          { id: 'flow-batch-lake', stroke: FLOW_COLORS.intra, kind: 'intra' },
        ],
      },
      {
        label: '12 — Data Lake egress',
        headline: 'Export select data from the Data Lake',
        body:
          'You can take select data out of the Data Lake to any external destination that accepts information from the Data Lake—for example, to use in a third-party data visualization product like Tableau.',
        highlights: ['node-lake'],
        flows: [{ id: 'flow-lake-pipeline', stroke: FLOW_COLORS.intra, kind: 'intra' }],
      },
      {
        label: '13 — Governance & controls',
        headline: 'Alerts, Audit Logs, and Access Controls',
        body:
          'Because Experience Platform is an API-oriented system, you can set it up to provide Alerts that tell you when something went wrong or needs attention. Audit Logs will tell you who logged into Experience Platform, the actions they took, and the time they took those actions—all important for governance. Granular Access Controls allow you to restrict who has access to what so that everyone has the exact right level of access for their role.',
        highlights: ['node-lake', 'node-aep'],
        flows: [],
      },
      {
        label: '14 — Sandboxing',
        headline: 'Sandboxes for development and production',
        body:
          'A sandbox creates a complete Experience Platform environment. Sandboxing allows you to create separate development and production environments, separate environments to handle highly sensitive data, or separate environments for subsidiaries if you are a multi-business company.',
        highlights: ['node-aep'],
        flows: [],
      },
      {
        label: '15 — Application entitlements',
        headline: 'Application access to Profile and Data Lake',
        body:
          'Real-Time Customer Data Platform, Journey Optimizer, Customer Journey Analytics, and Mix Modeler are all applications natively built on Experience Platform. Each has different access to the Real-Time Customer Profile and Data Lake based on use cases solved for by each product and the entitlements of specific packages purchased.',
        highlights: ['node-jo', 'node-rtcdp', 'node-cja', 'node-mix', 'node-profile', 'node-lake'],
        flows: [
          { id: 'flow-profile-cdp', stroke: FLOW_COLORS.intra, kind: 'intra' },
          { id: 'flow-seg-jo', stroke: FLOW_COLORS.intra, kind: 'intra' },
        ],
      },
      {
        label: '16 — Journey Optimizer channels',
        headline: 'Journey Optimizer for inbound and outbound engagement',
        body:
          'Journey Optimizer uses the Real-Time Customer Profile to personalize customer engagement for inbound and outbound channels.',
        highlights: ['node-jo', 'node-inbound', 'node-msg', 'node-edge'],
        flows: [
          { id: 'flow-edge-inbound', stroke: FLOW_COLORS.egress, kind: 'egress' },
          { id: 'flow-jo-msg', stroke: FLOW_COLORS.egress, kind: 'egress' },
        ],
      },
    ],
  };

  function normalizeFlow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || '').trim();
    if (!id) return null;
    var kind = raw.kind === 'ingress' || raw.kind === 'egress' ? raw.kind : 'intra';
    var stroke = typeof raw.stroke === 'string' && raw.stroke ? raw.stroke : FLOW_COLORS[kind];
    return { id: id, stroke: stroke, kind: kind };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        label: '',
        headline: '',
        body: '',
        highlights: [],
        flows: [],
        userLineIds: [],
      };
    }
    var highlights = Array.isArray(raw.highlights)
      ? raw.highlights.filter(function (h) {
          return typeof h === 'string' && h;
        })
      : [];
    var flows = Array.isArray(raw.flows)
      ? raw.flows.map(normalizeFlow).filter(Boolean)
      : [];
    var userLineIds = Array.isArray(raw.userLineIds)
      ? raw.userLineIds.filter(function (id) {
          return typeof id === 'string' && id;
        })
      : [];
    return {
      label: String(raw.label || ''),
      headline: String(raw.headline || ''),
      body: String(raw.body || ''),
      highlights: highlights,
      flows: flows,
      userLineIds: userLineIds,
    };
  }

  function normalizeTour(raw) {
    var base = raw && typeof raw === 'object' ? raw : {};
    var states = Array.isArray(base.states) ? base.states.map(normalizeState) : EMBEDDED_TOUR.states.map(normalizeState);
    return {
      version: Number(base.version) || TOUR_VERSION,
      source: base.source ? String(base.source) : 'custom',
      states: states,
    };
  }

  function cloneTour(tour) {
    return JSON.parse(JSON.stringify(normalizeTour(tour)));
  }

  function validateTour(tour, options) {
    var opts = options || {};
    var expectCount = opts.expectedStateCount != null ? opts.expectedStateCount : EXPECTED_STATE_COUNT;
    var errors = [];
    var t = normalizeTour(tour);
    if (!Array.isArray(t.states) || t.states.length === 0) {
      errors.push('tour.states must be a non-empty array');
      return { ok: false, errors: errors, tour: t };
    }
    if (expectCount > 0 && t.states.length !== expectCount) {
      errors.push('expected ' + expectCount + ' states, got ' + t.states.length);
    }
    t.states.forEach(function (st, i) {
      if (!st.label) errors.push('state ' + i + ': missing label');
      if (!st.headline) errors.push('state ' + i + ': missing headline');
      if (!st.body) errors.push('state ' + i + ': missing body');
      if (!Array.isArray(st.highlights)) errors.push('state ' + i + ': highlights must be an array');
      if (!Array.isArray(st.flows)) errors.push('state ' + i + ': flows must be an array');
    });
    return { ok: errors.length === 0, errors: errors, tour: t };
  }

  /**
   * Fetch deck-aligned default tour JSON; falls back to embedded copy on failure.
   * @param {string} [url]
   * @returns {Promise<object>}
   */
  function loadDefaultTour(url) {
    var tourUrl = url || DEFAULT_TOUR_URL;
    return fetch(tourUrl, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        return normalizeTour(json);
      })
      .catch(function () {
        return cloneTour(EMBEDDED_TOUR);
      });
  }

  /**
   * Apply one presentation state to the DOM (highlights, flows, HUD copy).
   * @param {object} ctx
   * @param {number} stateIndex
   * @param {object} st — resolved state (highlights may already merge overrides)
   */
  function applyStateToDom(ctx, stateIndex, st) {
    if (!st || !ctx) return;

    if (typeof ctx.refreshNodeHighlights === 'function') {
      ctx.refreshNodeHighlights(st.highlights || []);
    }

    var activeIds = {};
    (st.flows || []).forEach(function (f) {
      activeIds[f.id] = f;
    });

    var isFlowHidden = typeof ctx.isFlowHidden === 'function' ? ctx.isFlowHidden : function () {
      return false;
    };
    var selectedFlowId = ctx.selectedFlowId || null;

    (ctx.flowElements || []).forEach(function (path) {
      var spec = activeIds[path.id];
      if (!spec || isFlowHidden(path.id)) {
        path.classList.remove('is-visible');
        path.classList.remove('arch-flow--selected');
        path.removeAttribute('data-flow-kind');
        path.style.stroke = '';
        return;
      }
      path.style.stroke = spec.stroke;
      path.setAttribute('data-flow-kind', spec.kind || 'intra');
      path.classList.add('is-visible');
      path.classList.toggle('arch-flow--selected', selectedFlowId === path.id);
    });

    if (ctx.userLineElements && Array.isArray(st.userLineIds)) {
      var showIds = {};
      st.userLineIds.forEach(function (id) {
        showIds[id] = true;
      });
      ctx.userLineElements.forEach(function (el) {
        var lid = el.getAttribute('data-user-line-id') || el.id || '';
        if (!st.userLineIds.length) {
          el.style.removeProperty('opacity');
          el.style.removeProperty('pointer-events');
          return;
        }
        var visible = !!showIds[lid];
        el.style.opacity = visible ? '' : '0.15';
        el.style.pointerEvents = visible ? '' : 'none';
      });
    }

    var total = ctx.totalStates != null ? ctx.totalStates : 1;
    if (ctx.hudTitle) ctx.hudTitle.textContent = st.label;
    if (ctx.hudMeta) ctx.hudMeta.textContent = 'State ' + (stateIndex + 1) + ' / ' + total;
    if (ctx.stateKicker) ctx.stateKicker.textContent = 'State ' + (stateIndex + 1) + ' of ' + total;
    if (ctx.stateHeadline) ctx.stateHeadline.textContent = st.headline || '';
    if (ctx.stateBody) ctx.stateBody.textContent = st.body || '';

    if (ctx.dotButtons) {
      ctx.dotButtons.forEach(function (btn, i) {
        btn.setAttribute('aria-current', i === stateIndex ? 'true' : 'false');
      });
    }

    if (ctx.liveRegion) {
      ctx.liveRegion.textContent =
        'State ' + (stateIndex + 1) + ' of ' + total + ': ' + (st.headline || st.label);
    }

    if (ctx.viewport) {
      ctx.viewport.classList.toggle('arch-int-viewport--intro', stateIndex === 0);
    }

    if (typeof ctx.onAfterApply === 'function') {
      ctx.onAfterApply(stateIndex, st);
    }
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.playback = {
    TOUR_VERSION: TOUR_VERSION,
    DEFAULT_TOUR_URL: DEFAULT_TOUR_URL,
    EXPECTED_STATE_COUNT: EXPECTED_STATE_COUNT,
    FLOW_COLORS: FLOW_COLORS,
    FLOW_IDS: FLOW_IDS,
    FLOW_LABELS: FLOW_LABELS,
    EMBEDDED_TOUR: EMBEDDED_TOUR,
    EMBEDDED_STATES: EMBEDDED_TOUR.states,
    normalizeFlow: normalizeFlow,
    normalizeState: normalizeState,
    normalizeTour: normalizeTour,
    cloneTour: cloneTour,
    validateTour: validateTour,
    loadDefaultTour: loadDefaultTour,
    applyStateToDom: applyStateToDom,
  };
})(typeof window !== 'undefined' ? window : this);
