/**
 * AEP & Apps architecture page — 16-state machine for highlights + visible flows + stroke colours.
 * Vanilla JS only. Flow animation via CSS stroke-dasharray + keyframes on .is-visible.
 */
(function () {
  'use strict';

  var C = {
    ingress: '#308fff',
    intra: '#7d8a9e',
    egress: '#e34850',
  };

  /**
   * Each state: label for HUD, node ids to highlight, flows { id, stroke, kind }
   * kind: 'ingress' | 'intra' | 'egress' — sets data-flow-kind for dash styling
   */
  var STATES = [
    {
      label: '1 — Platform frame',
      headline: 'Adobe Experience Platform as the centralized data foundation',
      body:
        'Collects, standardizes, governs, applies AI insights to, and unifies data to power thoughtful and relevant customer experiences.',
      highlights: ['node-aep', 'node-edge'],
      /** Intro: static overview — no flow animation (see arch-int-viewport--intro) */
      flows: [],
    },
    {
      label: '2 — Ingress: Tags & Edge',
      headline: 'Ingress from tags, SDKs, and streaming sources',
      body:
        'Experience Platform Tags and streaming collection bring first-party data into the Edge Network so it can be processed consistently with your governance policies.',
      highlights: ['node-tags', 'node-edge', 'node-streaming'],
      flows: [
        { id: 'flow-tags-edge', stroke: C.ingress, kind: 'ingress' },
        { id: 'flow-sources-stream', stroke: C.ingress, kind: 'ingress' },
      ],
    },
    {
      label: '3 — Batch collection',
      headline: 'Batch ingestion from enterprise systems and warehouses',
      body:
        'CRM, cloud apps, ETL, and data warehouses load large volumes on a schedule; batch paths land in the lake alongside streaming for a full customer picture.',
      highlights: ['node-sources', 'node-batch', 'node-lake'],
      flows: [
        { id: 'flow-sources-batch', stroke: C.ingress, kind: 'ingress' },
        { id: 'flow-batch-lake', stroke: C.intra, kind: 'intra' },
      ],
    },
    {
      label: '4 — Data Lake & governance',
      headline: 'Data Lake plus query, intelligence, and governance',
      body:
        'Raw and processed data resides in the lake; Query Service, AI/ML, and governance tools help you explore, label, and control usage across downstream applications.',
      highlights: ['node-lake', 'node-query', 'node-intel'],
      flows: [
        { id: 'flow-stream-lake', stroke: C.intra, kind: 'intra' },
        { id: 'flow-batch-lake', stroke: C.intra, kind: 'intra' },
      ],
    },
    {
      label: '5 — Pipeline bus',
      headline: 'Pipeline from lake to Real-Time Customer Profile',
      body:
        'Identity resolution and ingestion pipelines move governed data from the lake into the profile store so unified identities stay current for activation.',
      highlights: ['node-lake', 'node-pipeline', 'node-profile'],
      flows: [
        { id: 'flow-lake-pipeline', stroke: C.intra, kind: 'intra' },
        { id: 'flow-pipeline-profile', stroke: C.intra, kind: 'intra' },
      ],
    },
    {
      label: '6 — Real-Time Profile',
      headline: 'Real-Time Customer Profile at the center',
      body:
        'Edge and batch updates merge into a single profile graph with identity resolution—so decisions and journeys use the same up-to-date view of the customer.',
      highlights: ['node-profile', 'node-identity', 'node-edge'],
      flows: [
        { id: 'flow-edge-profile', stroke: C.intra, kind: 'intra' },
        { id: 'flow-pipeline-profile', stroke: C.intra, kind: 'intra' },
      ],
    },
    {
      label: '7 — Segmentation',
      headline: 'Segmentation across streaming, batch, and audiences',
      body:
        'Audiences are built on the profile using segmentation services—powering eligibility for journeys, offers, and channel destinations in near real time or on a schedule.',
      highlights: ['node-seg', 'node-profile'],
      flows: [{ id: 'flow-profile-seg', stroke: C.intra, kind: 'intra' }],
    },
    {
      label: '8 — Decisioning trio → Journey Optimizer',
      headline: 'Decision management, journeys, and Journey Optimizer',
      body:
        'Orchestration and decisioning use profile and audience context to determine the next best experience; Journey Optimizer executes messages across channels from the same stack.',
      highlights: ['node-decision', 'node-jo'],
      flows: [
        { id: 'flow-seg-jo', stroke: C.intra, kind: 'intra' },
        { id: 'flow-profile-cdp', stroke: C.intra, kind: 'intra' },
      ],
    },
    {
      label: '9 — Egress: Edge → Inbound',
      headline: 'Personalization back to digital properties',
      body:
        'Profile and decision outcomes return through the Edge Network to inbound web and app experiences—same-session relevance without shipping raw data to every channel silo.',
      highlights: ['node-edge', 'node-inbound'],
      flows: [{ id: 'flow-edge-inbound', stroke: C.egress, kind: 'egress' }],
    },
    {
      label: '10 — Egress: JO → Message Delivery',
      headline: 'Journey execution to Message Delivery',
      body:
        'Journey Optimizer hands off to message execution so email, SMS, push, and other channels deliver the chosen treatment with tracking and consent in place.',
      highlights: ['node-jo', 'node-msg'],
      flows: [{ id: 'flow-jo-msg', stroke: C.egress, kind: 'egress' }],
    },
    {
      label: '11 — Egress: CDP → Paid Media',
      headline: 'Real-Time CDP to paid media and ad platforms',
      body:
        'Audience and suppression lists sync to paid media destinations so acquisition and retargeting stay aligned with the same profile and consent you use in owned channels.',
      highlights: ['node-rtcdp', 'node-paid'],
      flows: [{ id: 'flow-cdp-paid', stroke: C.egress, kind: 'egress' }],
    },
    {
      label: '12 — Egress: CJA → Journey reporting',
      headline: 'Customer Journey Analytics to journey reporting',
      body:
        'Behavioral and journey data flows to reporting surfaces so teams can measure journeys, attribution, and channel performance on a common event foundation.',
      highlights: ['node-cja', 'node-jrpt'],
      flows: [{ id: 'flow-cja-jrpt', stroke: C.egress, kind: 'egress' }],
    },
    {
      label: '13 — Egress: Mix Modeler → Marketing performance',
      headline: 'Mix Modeler to marketing performance measurement',
      body:
        'Unified data supports marketing mix and incrementality views so budget and channel decisions reflect both digital signals and broader business outcomes.',
      highlights: ['node-mix', 'node-mrpt'],
      flows: [{ id: 'flow-mix-mrpt', stroke: C.egress, kind: 'egress' }],
    },
    {
      label: '14 — Creative & AEM',
      headline: 'Creative Cloud and AEM alongside the Edge',
      body:
        'Creative assets and web experiences connect to the same customer context—content and personalization can reflect profile-aware decisions at the edge.',
      highlights: ['node-creative', 'node-aem', 'node-edge'],
      flows: [{ id: 'flow-edge-profile', stroke: C.intra, kind: 'intra' }],
    },
    {
      label: '15 — Full ingress picture',
      headline: 'All major ingress paths together',
      body:
        'Tags, SDKs, batch, and enterprise sources feed the Edge and lake in parallel—illustrating how Experience Platform ingests the full breadth of customer data.',
      highlights: ['node-tags', 'node-sources', 'node-edge', 'node-streaming', 'node-batch'],
      flows: [
        { id: 'flow-tags-edge', stroke: C.ingress, kind: 'ingress' },
        { id: 'flow-sources-stream', stroke: C.ingress, kind: 'ingress' },
        { id: 'flow-sources-batch', stroke: C.ingress, kind: 'ingress' },
      ],
    },
    {
      label: '16 — End-to-end (all flow types)',
      headline: 'End-to-end: ingress, platform, and egress in one view',
      body:
        'A single architecture carries data from collection through profile and decisioning to inbound experiences and outbound channels—ingress, intra-platform, and egress flows together.',
      highlights: [
        'node-tags',
        'node-edge',
        'node-lake',
        'node-pipeline',
        'node-profile',
        'node-seg',
        'node-jo',
        'node-inbound',
        'node-msg',
      ],
      flows: [
        { id: 'flow-tags-edge', stroke: C.ingress, kind: 'ingress' },
        { id: 'flow-lake-pipeline', stroke: C.intra, kind: 'intra' },
        { id: 'flow-edge-inbound', stroke: C.egress, kind: 'egress' },
        { id: 'flow-jo-msg', stroke: C.egress, kind: 'egress' },
      ],
    },
  ];

  var idx = 0;
  var hudTitle;
  var hudMeta;
  var liveRegion;
  var stateKicker;
  var stateHeadline;
  var stateBody;
  var archViewport;
  var dotButtons = [];

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function applyState() {
    var st = STATES[idx];
    if (!st) return;

    $all('.arch-node').forEach(function (el) {
      el.classList.toggle('is-highlighted', st.highlights.indexOf(el.id) >= 0);
    });

    var activeIds = {};
    st.flows.forEach(function (f) {
      activeIds[f.id] = f;
    });

    $all('.arch-flow').forEach(function (path) {
      var spec = activeIds[path.id];
      if (!spec) {
        path.classList.remove('is-visible');
        path.removeAttribute('data-flow-kind');
        path.style.stroke = '';
        return;
      }
      path.style.stroke = spec.stroke;
      path.setAttribute('data-flow-kind', spec.kind || 'intra');
      path.classList.add('is-visible');
    });

    if (hudTitle) hudTitle.textContent = st.label;
    if (hudMeta) hudMeta.textContent = 'State ' + (idx + 1) + ' / ' + STATES.length;

    if (stateKicker) {
      stateKicker.textContent = 'State ' + (idx + 1) + ' of ' + STATES.length;
    }
    if (stateHeadline) stateHeadline.textContent = st.headline || '';
    if (stateBody) stateBody.textContent = st.body || '';

    dotButtons.forEach(function (btn, i) {
      btn.setAttribute('aria-current', i === idx ? 'true' : 'false');
    });

    if (liveRegion) {
      liveRegion.textContent =
        'State ' + (idx + 1) + ' of ' + STATES.length + ': ' + (st.headline || st.label);
    }

    if (archViewport) {
      archViewport.classList.toggle('arch-int-viewport--intro', idx === 0);
    }
  }

  function go(delta) {
    var n = idx + delta;
    if (n < 0 || n >= STATES.length) return;
    idx = n;
    applyState();
  }

  function goTo(i) {
    if (i < 0 || i >= STATES.length) return;
    idx = i;
    applyState();
  }

  var LS_STATE_HILITE = 'aepArchStateHighlights';

  function archStateHighlightsApply() {
    var on = true;
    try {
      if (localStorage.getItem(LS_STATE_HILITE) === '0') on = false;
    } catch (e) {}
    if (archViewport) archViewport.classList.toggle('arch-state-highlights-off', !on);
    var tgl = qs('#archStateHighlightsToggle');
    if (tgl) tgl.checked = on;
  }

  function archStateHighlightsSet(on) {
    try {
      localStorage.setItem(LS_STATE_HILITE, on ? '1' : '0');
    } catch (e) {}
    archStateHighlightsApply();
  }

  function init() {
    hudTitle = qs('#archIntHudTitle');
    hudMeta = qs('#archIntHudMeta');
    liveRegion = qs('#archIntLive');
    stateKicker = qs('#archIntStateKicker');
    stateHeadline = qs('#archIntStateHeadline');
    stateBody = qs('#archIntStateBody');
    archViewport = qs('#archIntViewport');

    qs('#archIntPrev').addEventListener('click', function () {
      go(-1);
    });
    qs('#archIntNext').addEventListener('click', function () {
      go(1);
    });

    var dots = qs('#archIntDots');
    if (dots) {
      for (var i = 0; i < STATES.length; i++) {
        (function (stateIndex) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'arch-int-dot';
          b.title = 'Go to state ' + (stateIndex + 1);
          b.addEventListener('click', function () {
            goTo(stateIndex);
          });
          dots.appendChild(b);
          dotButtons.push(b);
        })(i);
      }
    }

    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    });

    var hiliteTgl = qs('#archStateHighlightsToggle');
    if (hiliteTgl) {
      hiliteTgl.addEventListener('change', function () {
        archStateHighlightsSet(!!hiliteTgl.checked);
      });
    }
    archStateHighlightsApply();

    applyState();
  }

  /**
   * Draggable architecture nodes: base translate baked in for Tags/Sources (SVG parity).
   * User offset = archDrag.pos[key]; world rect = rect + base + offset.
   */
  var LS_NODES = 'aepArchDragNodes';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var NODE_LAYOUT = {
    tags: { base: [52, 0], rect: [43, 40, 76, 76] },
    sources: { base: [52, 0], rect: [22, 122, 118, 200] },
    edge: { base: [0, 0], rect: [260, 58, 360, 36] },
    aep: { base: [0, 0], rect: [250, 112, 700, 452] },
    streaming: { base: [0, 0], rect: [262, 200, 130, 44] },
    batch: { base: [0, 0], rect: [262, 252, 130, 44] },
    query: { base: [0, 0], rect: [262, 308, 62, 36] },
    intel: { base: [0, 0], rect: [330, 308, 62, 36] },
    lake: { base: [0, 0], rect: [262, 356, 130, 56] },
    pipeline: { base: [0, 0], rect: [442, 200, 26, 210] },
    profile: { base: [0, 0], rect: [490, 200, 168, 52] },
    identity: { base: [0, 0], rect: [502, 240, 74, 18] },
    seg: { base: [0, 0], rect: [490, 266, 168, 88] },
    decision: { base: [0, 0], rect: [682, 200, 120, 56] },
    creative: { base: [0, 0], rect: [628, 58, 104, 36] },
    aem: { base: [0, 0], rect: [628, 100, 104, 28] },
    jo: { base: [0, 0], rect: [682, 268, 120, 40] },
    rtcdp: { base: [0, 0], rect: [682, 316, 120, 36] },
    cja: { base: [0, 0], rect: [682, 360, 120, 36] },
    mix: { base: [0, 0], rect: [682, 404, 120, 32] },
    inbound: { base: [0, 0], rect: [997, 200, 140, 44] },
    msg: { base: [0, 0], rect: [997, 252, 140, 44] },
    paid: { base: [0, 0], rect: [997, 304, 140, 36] },
    jrpt: { base: [0, 0], rect: [997, 348, 140, 36] },
    mrpt: { base: [0, 0], rect: [997, 392, 140, 36] },
  };

  function archDragDefaultPos() {
    var o = {};
    Object.keys(NODE_LAYOUT).forEach(function (k) {
      o[k] = { x: 0, y: 0 };
    });
    return o;
  }

  var ARCH_MIN_NODE_W = 24;
  var ARCH_MIN_NODE_H = 20;
  var ARCH_MAX_NODE_W = 1180;
  var ARCH_MAX_NODE_H = 660;
  var ARCH_RESIZE_HANDLE = 9;

  var archDrag = {
    enabled: false,
    pos: archDragDefaultPos(),
    active: null,
    start: null,
    svg: null,
  };

  var archResize = {
    active: null,
    start: null,
  };

  function archNodeEffectiveWH(key) {
    var L = NODE_LAYOUT[key];
    if (!L) return { w: 0, h: 0 };
    var p = archDrag.pos[key] || {};
    var defW = L.rect[2];
    var defH = L.rect[3];
    var w = typeof p.w === 'number' && !isNaN(p.w) ? p.w : defW;
    var h = typeof p.h === 'number' && !isNaN(p.h) ? p.h : defH;
    w = Math.max(ARCH_MIN_NODE_W, Math.min(ARCH_MAX_NODE_W, w));
    h = Math.max(ARCH_MIN_NODE_H, Math.min(ARCH_MAX_NODE_H, h));
    return { w: w, h: h };
  }

  /** World-space rect for a node; optional posPartial overrides archDrag.pos (for tentative drag position). */
  function archDragGetWorldRect(key, posPartial) {
    var L = NODE_LAYOUT[key];
    if (!L) return null;
    var base = archDrag.pos[key] || { x: 0, y: 0 };
    var p = Object.assign({}, base);
    if (posPartial) {
      if (typeof posPartial.x === 'number') p.x = posPartial.x;
      if (typeof posPartial.y === 'number') p.y = posPartial.y;
      if (typeof posPartial.w === 'number') p.w = posPartial.w;
      if (typeof posPartial.h === 'number') p.h = posPartial.h;
    }
    var defW = L.rect[2];
    var defH = L.rect[3];
    var w = typeof p.w === 'number' && !isNaN(p.w) ? p.w : defW;
    var h = typeof p.h === 'number' && !isNaN(p.h) ? p.h : defH;
    w = Math.max(ARCH_MIN_NODE_W, Math.min(ARCH_MAX_NODE_W, w));
    h = Math.max(ARCH_MIN_NODE_H, Math.min(ARCH_MAX_NODE_H, h));
    var tx = L.base[0] + p.x;
    var ty = L.base[1] + p.y;
    var x = L.rect[0] + tx;
    var y = L.rect[1] + ty;
    return {
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      w: w,
      h: h,
      cx: x + w / 2,
      cy: y + h / 2,
    };
  }

  function archDragWorldRect(key) {
    return archDragGetWorldRect(key, null);
  }

  var ARCH_DRAG_SNAP_PX = 8;
  var ARCH_GUIDE_VIEW = { w: 1200, h: 680 };

  function archDragGuidesClear() {
    var lg = qs('#layer-drag-guides');
    if (!lg) return;
    while (lg.firstChild) lg.removeChild(lg.firstChild);
  }

  function archDragGuidesShow(guides) {
    archDragGuidesClear();
    if (!guides) return;
    var vx = guides.vx || [];
    var hy = guides.hy || [];
    if (!vx.length && !hy.length) return;
    var lg = qs('#layer-drag-guides');
    if (!lg) return;
    var W = ARCH_GUIDE_VIEW.w;
    var H = ARCH_GUIDE_VIEW.h;
    vx.forEach(function (xv) {
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(xv));
      line.setAttribute('x2', String(xv));
      line.setAttribute('y1', '0');
      line.setAttribute('y2', String(H));
      line.setAttribute('class', 'arch-drag-guide arch-drag-guide--v');
      lg.appendChild(line);
    });
    hy.forEach(function (yh) {
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('x2', String(W));
      line.setAttribute('y1', String(yh));
      line.setAttribute('y2', String(yh));
      line.setAttribute('class', 'arch-drag-guide arch-drag-guide--h');
      lg.appendChild(line);
    });
  }

  function archDragCollectAlignmentTargets(excludeKey) {
    var xs = [];
    var ys = [];
    Object.keys(NODE_LAYOUT).forEach(function (k) {
      if (k === excludeKey) return;
      var o = archDragWorldRect(k);
      if (!o) return;
      xs.push(o.left, o.cx, o.right);
      ys.push(o.top, o.cy, o.bottom);
    });
    return { xs: xs, ys: ys };
  }

  function archDragCollectVerticalGapSamples(excludeKey) {
    var seen = {};
    var keys = Object.keys(NODE_LAYOUT).filter(function (k) {
      return k !== excludeKey;
    });
    for (var i = 0; i < keys.length; i++) {
      for (var j = 0; j < keys.length; j++) {
        if (i === j) continue;
        var a = archDragWorldRect(keys[i]);
        var b = archDragWorldRect(keys[j]);
        if (!a || !b) continue;
        if (a.bottom < b.top - 2) {
          var g = b.top - a.bottom;
          if (g > 2 && g < 420) seen[String(Math.round(g * 10) / 10)] = g;
        }
      }
    }
    return Object.keys(seen).map(function (s) {
      return seen[s];
    });
  }

  function archDragCollectHorizontalGapSamples(excludeKey) {
    var seen = {};
    var keys = Object.keys(NODE_LAYOUT).filter(function (k) {
      return k !== excludeKey;
    });
    for (var i = 0; i < keys.length; i++) {
      for (var j = 0; j < keys.length; j++) {
        if (i === j) continue;
        var a = archDragWorldRect(keys[i]);
        var b = archDragWorldRect(keys[j]);
        if (!a || !b) continue;
        if (a.right < b.left - 2) {
          var g = b.left - a.right;
          if (g > 2 && g < 520) seen[String(Math.round(g * 10) / 10)] = g;
        }
      }
    }
    return Object.keys(seen).map(function (s) {
      return seen[s];
    });
  }

  function archDragFindRectAbove(wr, excludeKey) {
    var best = null;
    var bestBottom = -1e9;
    Object.keys(NODE_LAYOUT).forEach(function (k) {
      if (k === excludeKey) return;
      var r = archDragWorldRect(k);
      if (!r || r.bottom >= wr.top - 0.5) return;
      if (r.bottom > bestBottom) {
        bestBottom = r.bottom;
        best = r;
      }
    });
    return best;
  }

  function archDragFindRectLeft(wr, excludeKey) {
    var best = null;
    var bestRight = -1e9;
    Object.keys(NODE_LAYOUT).forEach(function (k) {
      if (k === excludeKey) return;
      var r = archDragWorldRect(k);
      if (!r || r.right >= wr.left - 0.5) return;
      if (r.right > bestRight) {
        bestRight = r.right;
        best = r;
      }
    });
    return best;
  }

  function archDragGuidesForRect(wr, tgt) {
    var vx = [];
    var hy = [];
    var eps = 0.85;
    tgt.xs.forEach(function (sx) {
      if (Math.abs(wr.left - sx) < eps || Math.abs(wr.cx - sx) < eps || Math.abs(wr.right - sx) < eps) {
        if (vx.indexOf(sx) < 0) vx.push(sx);
      }
    });
    tgt.ys.forEach(function (sy) {
      if (Math.abs(wr.top - sy) < eps || Math.abs(wr.cy - sy) < eps || Math.abs(wr.bottom - sy) < eps) {
        if (hy.indexOf(sy) < 0) hy.push(sy);
      }
    });
    return { vx: vx, hy: hy };
  }

  function archDragSnapBoxPosition(activeKey, ox, oy, startOw, startOh) {
    var posBase = { x: ox, y: oy };
    if (startOw != null) posBase.w = startOw;
    if (startOh != null) posBase.h = startOh;

    var wr = archDragGetWorldRect(activeKey, posBase);
    if (!wr) return { ox: ox, oy: oy, guides: { vx: [], hy: [] } };

    var tgt = archDragCollectAlignmentTargets(activeKey);

    var bestAdjX = 0;
    var bestAbsX = ARCH_DRAG_SNAP_PX + 1;
    [wr.left, wr.cx, wr.right].forEach(function (av) {
      tgt.xs.forEach(function (sx) {
        var adj = sx - av;
        if (Math.abs(adj) <= ARCH_DRAG_SNAP_PX && Math.abs(adj) < bestAbsX) {
          bestAbsX = Math.abs(adj);
          bestAdjX = adj;
        }
      });
    });
    ox += bestAdjX;
    wr = archDragGetWorldRect(activeKey, Object.assign({}, posBase, { x: ox, y: oy }));

    var bestAdjY = 0;
    var bestAbsY = ARCH_DRAG_SNAP_PX + 1;
    [wr.top, wr.cy, wr.bottom].forEach(function (av) {
      tgt.ys.forEach(function (sy) {
        var adj = sy - av;
        if (Math.abs(adj) <= ARCH_DRAG_SNAP_PX && Math.abs(adj) < bestAbsY) {
          bestAbsY = Math.abs(adj);
          bestAdjY = adj;
        }
      });
    });
    oy += bestAdjY;
    wr = archDragGetWorldRect(activeKey, Object.assign({}, posBase, { x: ox, y: oy }));

    var gapHy = [];
    var gapVx = [];

    var vGaps = archDragCollectVerticalGapSamples(activeKey);
    var above = archDragFindRectAbove(wr, activeKey);
    if (above && vGaps.length) {
      var cvg = wr.top - above.bottom;
      var bestG = null;
      var bestGd = ARCH_DRAG_SNAP_PX + 1;
      vGaps.forEach(function (g) {
        var d = Math.abs(cvg - g);
        if (d <= ARCH_DRAG_SNAP_PX && d < bestGd) {
          bestGd = d;
          bestG = g;
        }
      });
      if (bestG != null) {
        oy += bestG - cvg;
        wr = archDragGetWorldRect(activeKey, Object.assign({}, posBase, { x: ox, y: oy }));
        gapHy.push(above.bottom, wr.top);
      }
    }

    var hGaps = archDragCollectHorizontalGapSamples(activeKey);
    var leftN = archDragFindRectLeft(wr, activeKey);
    if (leftN && hGaps.length) {
      var chg = wr.left - leftN.right;
      var bestHg = null;
      var bestHd = ARCH_DRAG_SNAP_PX + 1;
      hGaps.forEach(function (g) {
        var d = Math.abs(chg - g);
        if (d <= ARCH_DRAG_SNAP_PX && d < bestHd) {
          bestHd = d;
          bestHg = g;
        }
      });
      if (bestHg != null) {
        ox += bestHg - chg;
        wr = archDragGetWorldRect(activeKey, Object.assign({}, posBase, { x: ox, y: oy }));
        gapVx.push(leftN.right, wr.left);
      }
    }

    tgt = archDragCollectAlignmentTargets(activeKey);
    var guides = archDragGuidesForRect(wr, tgt);
    gapHy.forEach(function (y) {
      if (guides.hy.indexOf(y) < 0) guides.hy.push(y);
    });
    gapVx.forEach(function (x) {
      if (guides.vx.indexOf(x) < 0) guides.vx.push(x);
    });
    return { ox: ox, oy: oy, guides: guides };
  }

  function archClamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function archFlowSet(id, d) {
    var el = qs('#' + id);
    if (el) el.setAttribute('d', d);
  }

  function archDragRebuildFlows() {
    var t = archDragWorldRect('tags');
    var s = archDragWorldRect('sources');
    var e = archDragWorldRect('edge');
    var st = archDragWorldRect('streaming');
    var b = archDragWorldRect('batch');
    var lk = archDragWorldRect('lake');
    var pi = archDragWorldRect('pipeline');
    var pr = archDragWorldRect('profile');
    var sg = archDragWorldRect('seg');
    var jo = archDragWorldRect('jo');
    var rt = archDragWorldRect('rtcdp');
    var inbound = archDragWorldRect('inbound');
    var msg = archDragWorldRect('msg');
    var paid = archDragWorldRect('paid');
    var cja = archDragWorldRect('cja');
    var jrpt = archDragWorldRect('jrpt');
    var mix = archDragWorldRect('mix');
    var mrpt = archDragWorldRect('mrpt');

    var d;
    if (t && e) {
      var yJoinTe = (t.bottom + e.top) / 2;
      d =
        'M ' +
        t.cx +
        ' ' +
        t.bottom +
        ' L ' +
        t.cx +
        ' ' +
        yJoinTe +
        ' L ' +
        e.cx +
        ' ' +
        yJoinTe +
        ' L ' +
        e.cx +
        ' ' +
        e.top;
      archFlowSet('flow-tags-edge', d);
    }

    if (s && st) {
      var sys = archClamp(st.cy, s.top + 8, s.bottom - 8);
      d =
        'M ' +
        s.right +
        ' ' +
        sys +
        ' L ' +
        (s.right + 23) +
        ' ' +
        sys +
        ' L ' +
        (s.right + 23) +
        ' ' +
        st.top +
        ' L ' +
        st.left +
        ' ' +
        st.top;
      archFlowSet('flow-sources-stream', d);
    }

    if (s && b) {
      var bys = archClamp(b.cy, s.top + 8, s.bottom - 8);
      d =
        'M ' +
        s.right +
        ' ' +
        bys +
        ' L ' +
        (s.right + 18) +
        ' ' +
        bys +
        ' L ' +
        (s.right + 18) +
        ' ' +
        b.top +
        ' L ' +
        b.left +
        ' ' +
        b.top;
      archFlowSet('flow-sources-batch', d);
    }

    if (st && lk) {
      var mxSl = st.right + 26;
      d =
        'M ' +
        st.right +
        ' ' +
        st.cy +
        ' L ' +
        mxSl +
        ' ' +
        st.cy +
        ' L ' +
        mxSl +
        ' ' +
        lk.cy +
        ' L ' +
        lk.left +
        ' ' +
        lk.cy;
      archFlowSet('flow-stream-lake', d);
    }

    if (b && lk) {
      var mxBl = b.right + 26;
      d =
        'M ' +
        b.right +
        ' ' +
        b.cy +
        ' L ' +
        mxBl +
        ' ' +
        b.cy +
        ' L ' +
        mxBl +
        ' ' +
        lk.cy +
        ' L ' +
        lk.left +
        ' ' +
        lk.cy;
      archFlowSet('flow-batch-lake', d);
    }

    if (lk && pi) {
      var yLake = lk.top + 28;
      var xLake = lk.left + Math.min(156, lk.w - 8);
      d = 'M ' + xLake + ' ' + yLake + ' L ' + pi.left + ' ' + yLake + ' L ' + pi.left + ' ' + pi.cy;
      archFlowSet('flow-lake-pipeline', d);
    }

    if (pi && pr) {
      d =
        'M ' +
        pi.right +
        ' ' +
        pi.cy +
        ' L ' +
        pr.left +
        ' ' +
        pi.cy +
        ' L ' +
        pr.left +
        ' ' +
        (pr.top + 36);
      archFlowSet('flow-pipeline-profile', d);
    }

    if (e && pr) {
      d =
        'M ' +
        e.cx +
        ' ' +
        e.bottom +
        ' L ' +
        e.cx +
        ' ' +
        pr.top +
        ' L ' +
        pr.left +
        ' ' +
        pr.top +
        ' L ' +
        pr.left +
        ' ' +
        (pr.top + 36);
      archFlowSet('flow-edge-profile', d);
    }

    if (pr && sg) {
      d = 'M ' + pr.cx + ' ' + pr.bottom + ' L ' + pr.cx + ' ' + sg.top;
      archFlowSet('flow-profile-seg', d);
    }

    if (sg && jo) {
      var ySeg = archClamp(sg.cy, sg.top + 4, sg.bottom - 4);
      d =
        'M ' +
        sg.right +
        ' ' +
        ySeg +
        ' L ' +
        jo.left +
        ' ' +
        ySeg +
        ' L ' +
        jo.left +
        ' ' +
        jo.cy;
      archFlowSet('flow-seg-jo', d);
    }

    if (pr && rt) {
      var yPr = pr.top + 26;
      d =
        'M ' +
        pr.right +
        ' ' +
        yPr +
        ' L ' +
        (pr.right + 170) +
        ' ' +
        yPr +
        ' L ' +
        (pr.right + 170) +
        ' ' +
        rt.bottom +
        ' L ' +
        rt.left +
        ' ' +
        rt.bottom;
      archFlowSet('flow-profile-cdp', d);
    }

    if (e && inbound) {
      var ex = e.right - 24;
      var ey = e.top + 6;
      d =
        'M ' +
        ex +
        ' ' +
        ey +
        ' L ' +
        (inbound.left - 46) +
        ' ' +
        ey +
        ' L ' +
        (inbound.left - 46) +
        ' ' +
        inbound.cy +
        ' L ' +
        inbound.left +
        ' ' +
        inbound.cy;
      archFlowSet('flow-edge-inbound', d);
    }

    function egressH(jn, dest) {
      var mid = (jn.right + dest.left) / 2;
      return (
        'M ' +
        jn.right +
        ' ' +
        jn.cy +
        ' L ' +
        mid +
        ' ' +
        jn.cy +
        ' L ' +
        mid +
        ' ' +
        dest.cy +
        ' L ' +
        dest.left +
        ' ' +
        dest.cy
      );
    }

    if (jo && msg) archFlowSet('flow-jo-msg', egressH(jo, msg));
    if (rt && paid) archFlowSet('flow-cdp-paid', egressH(rt, paid));
    if (cja && jrpt) archFlowSet('flow-cja-jrpt', egressH(cja, jrpt));
    if (mix && mrpt) archFlowSet('flow-mix-mrpt', egressH(mix, mrpt));
  }

  function archDragApply() {
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var g = qs('#node-' + key);
      if (!g) return;
      var L = NODE_LAYOUT[key];
      var p = archDrag.pos[key] || { x: 0, y: 0 };
      var tx = L.base[0] + p.x;
      var ty = L.base[1] + p.y;
      g.setAttribute('transform', 'translate(' + tx + ',' + ty + ')');
      var shell = g.querySelector('[data-arch-shell]');
      if (shell) {
        var wh = archNodeEffectiveWH(key);
        shell.setAttribute('width', String(wh.w));
        shell.setAttribute('height', String(wh.h));
      }
      var hEl = g.querySelector('.arch-node-resize-handle');
      if (hEl) {
        var wh2 = archNodeEffectiveWH(key);
        var hs = ARCH_RESIZE_HANDLE;
        hEl.setAttribute('x', String(L.rect[0] + wh2.w - hs));
        hEl.setAttribute('y', String(L.rect[1] + wh2.h - hs));
      }
    });
    archDragRebuildFlows();
    if (userLines.lines.length) archUserLineRender();
  }

  function archEnsureResizeHandles() {
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var g = qs('#node-' + key);
      if (!g || g.querySelector('.arch-node-resize-handle')) return;
      var h = document.createElementNS(SVG_NS, 'rect');
      h.setAttribute('class', 'arch-node-resize-handle');
      h.setAttribute('width', String(ARCH_RESIZE_HANDLE));
      h.setAttribute('height', String(ARCH_RESIZE_HANDLE));
      h.setAttribute('rx', '2');
      h.setAttribute('fill', '#ffffff');
      h.setAttribute('stroke', '#1473e6');
      h.setAttribute('stroke-width', '1.25');
      h.setAttribute('tabindex', '-1');
      h.setAttribute('aria-hidden', 'true');
      g.appendChild(h);
    });
  }

  function archDragLoad() {
    try {
      var raw = localStorage.getItem(LS_NODES);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          Object.keys(saved).forEach(function (k) {
            if (NODE_LAYOUT[k] && saved[k] && typeof saved[k].x === 'number' && typeof saved[k].y === 'number') {
              archDrag.pos[k] = { x: saved[k].x, y: saved[k].y };
              if (typeof saved[k].w === 'number') archDrag.pos[k].w = saved[k].w;
              if (typeof saved[k].h === 'number') archDrag.pos[k].h = saved[k].h;
            }
          });
        }
        return;
      }
    } catch (e) {}

    try {
      if (!localStorage.getItem(LS_NODES)) {
        var tg = JSON.parse(localStorage.getItem('aepArchDragTags') || 'null');
        var sr = JSON.parse(localStorage.getItem('aepArchDragSources') || 'null');
        if (tg && typeof tg.x === 'number') {
          archDrag.pos.tags = { x: tg.x - 52, y: tg.y || 0 };
        }
        if (sr && typeof sr.x === 'number') {
          archDrag.pos.sources = { x: sr.x - 52, y: sr.y || 0 };
        }
      }
    } catch (e2) {}
  }

  function archDragSave() {
    try {
      localStorage.setItem(LS_NODES, JSON.stringify(archDrag.pos));
    } catch (e) {}
  }

  var LS_LABELS = 'aepArchLabelEdits';
  var LS_MASTER = 'aepArchMasterLayout';
  var LS_USER_LINES = 'aepArchUserLines';

  var archLabel = {
    enabled: false,
    state: { pos: {}, content: {} },
    dragActive: null,
    dragStart: null,
    dragPending: null,
  };

  var userLines = {
    lines: [],
    drawMode: false,
    pendingStart: null,
    selectedId: null,
  };

  /** Pixels from a box edge — clicks within this distance snap to that edge (for anchored connectors). */
  var USER_LINE_SNAP_PX = 36;

  function archUserLineClosestPointOnSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 < 1e-12 ? 0 : archClamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    var x = x1 + t * dx;
    var y = y1 + t * dy;
    return { x: x, y: y, t: t, dist: Math.hypot(px - x, py - y) };
  }

  function archUserLineClosestOnNodeBorder(key, px, py) {
    var wr = archDragWorldRect(key);
    if (!wr || wr.w < 4 || wr.h < 4) return null;
    var L = wr.left;
    var R = wr.right;
    var T = wr.top;
    var B = wr.bottom;
    var cand = [];
    var n = archUserLineClosestPointOnSeg(px, py, L, T, R, T);
    cand.push({
      dist: n.dist,
      edge: 'n',
      t: R > L ? archClamp((n.x - L) / (R - L), 0, 1) : 0.5,
      x: n.x,
      y: n.y,
    });
    var s = archUserLineClosestPointOnSeg(px, py, L, B, R, B);
    cand.push({
      dist: s.dist,
      edge: 's',
      t: R > L ? archClamp((s.x - L) / (R - L), 0, 1) : 0.5,
      x: s.x,
      y: s.y,
    });
    var w = archUserLineClosestPointOnSeg(px, py, L, T, L, B);
    cand.push({
      dist: w.dist,
      edge: 'w',
      t: B > T ? archClamp((w.y - T) / (B - T), 0, 1) : 0.5,
      x: w.x,
      y: w.y,
    });
    var e = archUserLineClosestPointOnSeg(px, py, R, T, R, B);
    cand.push({
      dist: e.dist,
      edge: 'e',
      t: B > T ? archClamp((e.y - T) / (B - T), 0, 1) : 0.5,
      x: e.x,
      y: e.y,
    });
    cand.sort(function (a, b) {
      return a.dist - b.dist;
    });
    return cand[0];
  }

  function archUserLineSnapEndpoint(px, py, targetEl) {
    var preferred = null;
    if (targetEl && targetEl.closest) {
      var g = targetEl.closest('g.arch-node');
      if (g && g.id && g.id.indexOf('node-') === 0) {
        var pk = g.id.slice(5);
        if (NODE_LAYOUT[pk]) preferred = pk;
      }
    }
    var candidates = [];
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var c = archUserLineClosestOnNodeBorder(key, px, py);
      if (c) candidates.push({ key: key, c: c });
    });
    candidates.sort(function (a, b) {
      var da = a.c.dist;
      var db = b.c.dist;
      if (Math.abs(da - db) < 3 && preferred) {
        if (a.key === preferred) return -1;
        if (b.key === preferred) return 1;
      }
      return da - db;
    });
    var first = candidates[0];
    if (first && first.c.dist <= USER_LINE_SNAP_PX) {
      return { kind: 'anchor', node: first.key, edge: first.c.edge, t: archClamp(first.c.t, 0, 1) };
    }
    return { kind: 'free', x: px, y: py };
  }

  function archUserLineAnchorToWorld(nodeKey, edge, t) {
    var wr = archDragWorldRect(nodeKey);
    if (!wr) return null;
    var tt = archClamp(t, 0, 1);
    var L = wr.left;
    var R = wr.right;
    var T = wr.top;
    var B = wr.bottom;
    if (edge === 'n') return { x: L + tt * (R - L), y: T };
    if (edge === 's') return { x: L + tt * (R - L), y: B };
    if (edge === 'w') return { x: L, y: T + tt * (B - T) };
    if (edge === 'e') return { x: R, y: T + tt * (B - T) };
    return { x: (L + R) / 2, y: (T + B) / 2 };
  }

  function archUserLinePointFromEndpoint(ep) {
    if (!ep) return null;
    if (ep.kind === 'anchor') {
      var aw = archUserLineAnchorToWorld(ep.node, ep.edge, ep.t);
      return aw || null;
    }
    if (ep.kind === 'free' || (ep.x != null && ep.y != null)) return { x: ep.x, y: ep.y };
    return null;
  }

  function archUserLineMigrateLegacy(ln) {
    if (!ln) return ln;
    if (ln.from && ln.to) {
      var c = Object.assign({}, ln);
      delete c.d;
      return c;
    }
    var out = Object.assign({}, ln);
    if (out.d && typeof out.d === 'string') {
      var m = out.d.trim().match(/^M\s+([-\d.]+)\s+([-\d.]+)\s+L\s+([-\d.]+)\s+([-\d.]+)\s*$/i);
      if (m) {
        out.from = { kind: 'free', x: parseFloat(m[1]), y: parseFloat(m[2]) };
        out.to = { kind: 'free', x: parseFloat(m[3]), y: parseFloat(m[4]) };
      }
    }
    if (!out.from) out.from = { kind: 'free', x: 0, y: 0 };
    if (!out.to) out.to = { kind: 'free', x: 0, y: 0 };
    delete out.d;
    return out;
  }

  function archGetTextContent(textEl) {
    var tspans = textEl.querySelectorAll('tspan');
    if (tspans.length) {
      return Array.prototype.map.call(tspans, function (n) {
        return n.textContent;
      }).join('\n');
    }
    return (textEl.textContent || '').trim();
  }

  function archSetTextContent(textEl, raw) {
    var lines = String(raw).split(/\r?\n/);
    var tspans = textEl.querySelectorAll('tspan');
    if (tspans.length > 1) {
      lines.forEach(function (line, i) {
        if (tspans[i]) tspans[i].textContent = line;
      });
      return;
    }
    if (tspans.length === 1) {
      tspans[0].textContent = lines.join('\n');
      return;
    }
    if (lines.length > 1) {
      var ax = textEl.getAttribute('x') || '0';
      textEl.textContent = '';
      lines.forEach(function (line, i) {
        if (i === 0) {
          textEl.textContent = line;
        } else {
          var ts = document.createElementNS(SVG_NS, 'tspan');
          ts.setAttribute('x', ax);
          ts.setAttribute('dy', '1.05em');
          ts.textContent = line;
          textEl.appendChild(ts);
        }
      });
    } else {
      textEl.textContent = raw;
    }
  }

  function archLabelTransformTarget(textEl) {
    var p = textEl.parentNode;
    if (p && p.getAttribute && p.getAttribute('data-arch-label-wrap') === '1') return p;
    return textEl;
  }

  function archLabelWrapRotatedLabels() {
    $all('.arch-int-svg-wrap svg text').forEach(function (t) {
      var tr = t.getAttribute('transform') || '';
      if (tr.indexOf('rotate') === -1) return;
      if (t.parentNode && t.parentNode.getAttribute('data-arch-label-wrap') === '1') return;
      var w = document.createElementNS(SVG_NS, 'g');
      w.setAttribute('data-arch-label-wrap', '1');
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });
  }

  function archAssignTextIdsAndDefaults() {
    archLabelWrapRotatedLabels();
    var floatN = 0;
    $all('.arch-int-svg-wrap svg text').forEach(function (t) {
      if (t.getAttribute('data-arch-id')) return;
      var ownerG = t.closest('g.arch-node');
      var id;
      if (ownerG && ownerG.id) {
        var k = ownerG.id.replace(/^node-/, '');
        var list = ownerG.querySelectorAll('text');
        var idx = Array.prototype.indexOf.call(list, t);
        id = k + '-txt' + idx;
      } else {
        id = 'floating-txt' + floatN++;
      }
      t.setAttribute('data-arch-id', id);
      if (!t.getAttribute('data-arch-default')) {
        t.setAttribute('data-arch-default', archGetTextContent(t));
      }
    });
  }

  function archLabelLoad() {
    try {
      var raw = localStorage.getItem(LS_LABELS);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && s.pos) archLabel.state.pos = s.pos;
      if (s && s.content) archLabel.state.content = s.content;
    } catch (e) {}
  }

  function archLabelSave() {
    try {
      localStorage.setItem(LS_LABELS, JSON.stringify(archLabel.state));
    } catch (e) {}
  }

  function archLabelApplyAll() {
    Object.keys(archLabel.state.content).forEach(function (id) {
      var el = qs('[data-arch-id="' + id + '"]');
      if (el) archSetTextContent(el, archLabel.state.content[id]);
    });
    Object.keys(archLabel.state.pos).forEach(function (id) {
      var el = qs('[data-arch-id="' + id + '"]');
      if (!el) return;
      var p = archLabel.state.pos[id];
      if (!p || (p.x == null && p.y == null)) return;
      var tgt = archLabelTransformTarget(el);
      tgt.setAttribute('transform', 'translate(' + (p.x || 0) + ',' + (p.y || 0) + ')');
    });
  }

  function archLabelReset() {
    archLabel.state = { pos: {}, content: {} };
    archLabelSave();
    $all('.arch-int-svg-wrap svg text').forEach(function (t) {
      var def = t.getAttribute('data-arch-default');
      if (def != null) archSetTextContent(t, def);
      var tgt = archLabelTransformTarget(t);
      tgt.removeAttribute('transform');
    });
  }

  function archLabelSetEnabled(on) {
    archLabel.enabled = !!on;
    if (archViewport) archViewport.classList.toggle('arch-label-edit-on', archLabel.enabled);
    var lt = qs('#archLabelToggle');
    if (lt) lt.checked = archLabel.enabled;
  }

  function archLabelClearPendingListeners() {
    if (!archLabel.dragPending) return;
    window.removeEventListener('pointermove', archLabelPointerPendingMove, true);
    window.removeEventListener('pointerup', archLabelPointerPendingUp, true);
    archLabel.dragPending = null;
  }

  function archLabelPointerPendingMove(e) {
    if (!archLabel.dragPending) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var dx = p.x - archLabel.dragPending.sx;
    var dy = p.y - archLabel.dragPending.sy;
    if (Math.abs(dx) + Math.abs(dy) < 5) return;
    archLabel.dragActive = archLabel.dragPending.id;
    archLabel.dragStart = {
      ox: archLabel.dragPending.ox,
      oy: archLabel.dragPending.oy,
      mx: archLabel.dragPending.sx,
      my: archLabel.dragPending.sy,
    };
    archLabelClearPendingListeners();
    if (archViewport) archViewport.classList.add('arch-label-dragging');
    window.addEventListener('pointermove', archLabelPointerMoveWin, true);
    window.addEventListener('pointerup', archLabelPointerUpWin, true);
    window.addEventListener('pointercancel', archLabelPointerUpWin, true);
    archLabelPointerMoveWin(e);
  }

  function archLabelPointerPendingUp() {
    archLabelClearPendingListeners();
  }

  function archLabelOpenEditor(textEl) {
    if (!archLabel.enabled) return;
    archLabelClearPendingListeners();
    var rect = textEl.getBoundingClientRect();
    var ta = document.createElement('textarea');
    ta.value = archGetTextContent(textEl);
    ta.setAttribute('aria-label', 'Edit diagram label');
    ta.style.position = 'fixed';
    ta.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 300)) + 'px';
    ta.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - 140)) + 'px';
    ta.style.width = '280px';
    ta.style.height = '110px';
    ta.style.zIndex = '10000';
    ta.style.fontSize = '13px';
    ta.style.fontFamily = 'Inter, system-ui, sans-serif';
    document.body.appendChild(ta);
    ta.focus();
    function finish() {
      if (!ta.parentNode) return;
      var id = textEl.getAttribute('data-arch-id');
      archSetTextContent(textEl, ta.value);
      if (id) archLabel.state.content[id] = ta.value;
      archLabelSave();
      document.body.removeChild(ta);
      ta.removeEventListener('blur', onBlur);
    }
    function onBlur() {
      finish();
    }
    ta.addEventListener('blur', onBlur);
    ta.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        ta.removeEventListener('blur', onBlur);
        if (ta.parentNode) document.body.removeChild(ta);
        ev.preventDefault();
      }
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        finish();
      }
    });
  }

  function archLabelPointerMoveWin(e) {
    if (!archLabel.dragActive || !archLabel.dragStart) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var dx = p.x - archLabel.dragStart.mx;
    var dy = p.y - archLabel.dragStart.my;
    var ox = archLabel.dragStart.ox + dx;
    var oy = archLabel.dragStart.oy + dy;
    archLabel.state.pos[archLabel.dragActive] = { x: ox, y: oy };
    var el = qs('[data-arch-id="' + archLabel.dragActive + '"]');
    if (el) {
      var tgt = archLabelTransformTarget(el);
      tgt.setAttribute('transform', 'translate(' + ox + ',' + oy + ')');
    }
  }

  function archLabelPointerUpWin() {
    if (!archLabel.dragActive) return;
    if (archViewport) archViewport.classList.remove('arch-label-dragging');
    window.removeEventListener('pointermove', archLabelPointerMoveWin, true);
    window.removeEventListener('pointerup', archLabelPointerUpWin, true);
    window.removeEventListener('pointercancel', archLabelPointerUpWin, true);
    archLabel.dragActive = null;
    archLabel.dragStart = null;
    archLabelSave();
  }

  function archLabelPointerDownCapture(e) {
    if (e.target && e.target.closest && e.target.closest('.arch-node-resize-handle')) return;
    if (userLines.drawMode) return;
    if (!archLabel.enabled) return;
    var te = e.target.closest('text');
    if (!te || !te.getAttribute('data-arch-id')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    var id = te.getAttribute('data-arch-id');
    var cur = archLabel.state.pos[id] || { x: 0, y: 0 };
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    archLabel.dragPending = { id: id, ox: cur.x, oy: cur.y, sx: p.x, sy: p.y };
    window.addEventListener('pointermove', archLabelPointerPendingMove, true);
    window.addEventListener('pointerup', archLabelPointerPendingUp, true);
  }

  function archLabelDblClick(e) {
    if (!archLabel.enabled) return;
    var te = e.target.closest('text');
    if (!te || !te.getAttribute('data-arch-id')) return;
    e.preventDefault();
    e.stopPropagation();
    archLabelClearPendingListeners();
    archLabelOpenEditor(te);
  }

  function svgClientToSvg(svg, clientX, clientY) {
    var pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    return pt.matrixTransform(ctm.inverse());
  }

  function archDragSetEnabled(on) {
    archDrag.enabled = !!on;
    if (!archDrag.enabled) archDragGuidesClear();
    if (archViewport) archViewport.classList.toggle('arch-drag-on', archDrag.enabled);
    var tgl = qs('#archDragToggle');
    if (tgl) tgl.checked = archDrag.enabled;
  }

  function archDragPointerMoveWin(e) {
    if (!archDrag.active || !archDrag.start) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var dx = p.x - archDrag.start.mx;
    var dy = p.y - archDrag.start.my;
    var rawOx = archDrag.start.ox + dx;
    var rawOy = archDrag.start.oy + dy;
    var snapped = archDragSnapBoxPosition(archDrag.active, rawOx, rawOy, archDrag.start.ow, archDrag.start.oh);
    var next = {
      x: snapped.ox,
      y: snapped.oy,
    };
    if (archDrag.start.ow != null) next.w = archDrag.start.ow;
    if (archDrag.start.oh != null) next.h = archDrag.start.oh;
    archDrag.pos[archDrag.active] = next;
    archDragGuidesShow(snapped.guides);
    archDragApply();
  }

  function archDragPointerUpWin() {
    if (!archDrag.active) return;
    archDragGuidesClear();
    if (archViewport) archViewport.classList.remove('arch-dragging');
    window.removeEventListener('pointermove', archDragPointerMoveWin, true);
    window.removeEventListener('pointerup', archDragPointerUpWin, true);
    window.removeEventListener('pointercancel', archDragPointerUpWin, true);
    archDrag.active = null;
    archDrag.start = null;
    archDragSave();
  }

  function archResizePointerDown(e) {
    if (!archDrag.enabled || userLines.drawMode) return;
    if (!e.target || !e.target.classList || !e.target.classList.contains('arch-node-resize-handle')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    var g = e.target.closest('g.arch-node');
    if (!g || !g.id || g.id.indexOf('node-') !== 0) return;
    var which = g.id.slice(5);
    if (!NODE_LAYOUT[which]) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var eff = archNodeEffectiveWH(which);
    archResize.active = which;
    archResize.start = { mx: p.x, my: p.y, ow: eff.w, oh: eff.h };
    if (!archDrag.pos[which]) archDrag.pos[which] = { x: 0, y: 0 };
    if (archViewport) archViewport.classList.add('arch-resizing');
    window.addEventListener('pointermove', archResizePointerMoveWin, true);
    window.addEventListener('pointerup', archResizePointerUpWin, true);
    window.addEventListener('pointercancel', archResizePointerUpWin, true);
  }

  function archResizePointerMoveWin(e) {
    if (!archResize.active || !archResize.start) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var dx = p.x - archResize.start.mx;
    var dy = p.y - archResize.start.my;
    var k = archResize.active;
    var newW = archResize.start.ow + dx;
    var newH = archResize.start.oh + dy;
    newW = Math.max(ARCH_MIN_NODE_W, Math.min(ARCH_MAX_NODE_W, newW));
    newH = Math.max(ARCH_MIN_NODE_H, Math.min(ARCH_MAX_NODE_H, newH));
    if (!archDrag.pos[k]) archDrag.pos[k] = { x: 0, y: 0 };
    archDrag.pos[k].w = newW;
    archDrag.pos[k].h = newH;
    archDragApply();
  }

  function archResizePointerUpWin() {
    if (!archResize.active) return;
    archResize.active = null;
    archResize.start = null;
    if (archViewport) archViewport.classList.remove('arch-resizing');
    window.removeEventListener('pointermove', archResizePointerMoveWin, true);
    window.removeEventListener('pointerup', archResizePointerUpWin, true);
    window.removeEventListener('pointercancel', archResizePointerUpWin, true);
    archDragSave();
  }

  function archDragPointerDown(e) {
    if (!archDrag.enabled) return;
    if (userLines.drawMode) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return;
    if (e.target && e.target.closest && e.target.closest('text')) return;
    var g = e.currentTarget;
    if (!g || !g.id || g.id.indexOf('node-') !== 0) return;
    var which = g.id.slice(5);
    if (!NODE_LAYOUT[which]) return;
    e.preventDefault();
    e.stopPropagation();
    if (!archDrag.pos[which]) archDrag.pos[which] = { x: 0, y: 0 };
    var cur = archDrag.pos[which];
    archDrag.active = which;
    archDrag.start = {
      ox: cur.x,
      oy: cur.y,
      ow: cur.w,
      oh: cur.h,
    };
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    archDrag.start.mx = p.x;
    archDrag.start.my = p.y;
    if (archViewport) archViewport.classList.add('arch-dragging');
    window.addEventListener('pointermove', archDragPointerMoveWin, true);
    window.addEventListener('pointerup', archDragPointerUpWin, true);
    window.addEventListener('pointercancel', archDragPointerUpWin, true);
  }

  function archUserLineLoad() {
    try {
      var r = localStorage.getItem(LS_USER_LINES);
      if (!r) return;
      var a = JSON.parse(r);
      if (Array.isArray(a)) userLines.lines = a.map(archUserLineMigrateLegacy);
    } catch (e) {}
  }

  function archUserLinePersist() {
    try {
      localStorage.setItem(LS_USER_LINES, JSON.stringify(userLines.lines.map(archUserLineMigrateLegacy)));
    } catch (e) {}
  }

  function archMasterSerialize() {
    return {
      version: 4,
      savedAt: new Date().toISOString(),
      nodes: archDrag.pos,
      labels: { pos: archLabel.state.pos, content: archLabel.state.content },
      userLines: userLines.lines.map(archUserLineMigrateLegacy),
    };
  }

  function archMasterApply(data) {
    if (!data || typeof data !== 'object') return;
    if (!archLabel.state.pos) archLabel.state.pos = {};
    if (!archLabel.state.content) archLabel.state.content = {};
    if (data.nodes && typeof data.nodes === 'object') {
      archDrag.pos = archDragDefaultPos();
      Object.keys(data.nodes).forEach(function (k) {
        var nk = data.nodes[k];
        if (NODE_LAYOUT[k] && nk && typeof nk.x === 'number') {
          archDrag.pos[k] = { x: nk.x, y: nk.y || 0 };
          if (typeof nk.w === 'number') archDrag.pos[k].w = nk.w;
          if (typeof nk.h === 'number') archDrag.pos[k].h = nk.h;
        }
      });
    }
    if (data.labels) {
      if (data.labels.pos) archLabel.state.pos = data.labels.pos;
      if (data.labels.content) archLabel.state.content = data.labels.content;
    }
    if (Array.isArray(data.userLines)) userLines.lines = data.userLines.map(archUserLineMigrateLegacy);
  }

  function archMasterTryLoad() {
    try {
      var raw = localStorage.getItem(LS_MASTER);
      if (!raw) return false;
      var data = JSON.parse(raw);
      archMasterApply(data);
      return true;
    } catch (e) {
      return false;
    }
  }

  function archUserLineRender() {
    var g = qs('#layer-user-lines');
    if (!g) return;
    userLines.lines = userLines.lines.map(archUserLineMigrateLegacy);
    while (g.firstChild) g.removeChild(g.firstChild);
    userLines.lines.forEach(function (ln) {
      var pt1 = archUserLinePointFromEndpoint(ln.from);
      var pt2 = archUserLinePointFromEndpoint(ln.to);
      if (!pt1 || !pt2) return;
      var d = 'M ' + pt1.x + ' ' + pt1.y + ' L ' + pt2.x + ' ' + pt2.y;
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke', ln.stroke || '#308fff');
      p.setAttribute('stroke-width', ln.strokeWidth != null ? String(ln.strokeWidth) : '2.2');
      p.setAttribute('fill', 'none');
      p.setAttribute('data-user-line-id', ln.id);
      p.setAttribute(
        'class',
        'arch-user-line' + (userLines.selectedId === ln.id ? ' arch-user-line--selected' : '')
      );
      p.setAttribute('marker-end', 'url(#archUserArrowEnd)');
      if (ln.bidirectional) p.setAttribute('marker-start', 'url(#archUserArrowStart)');
      g.appendChild(p);
    });
  }

  function archUserLineGetSelected() {
    if (!userLines.selectedId) return null;
    for (var i = 0; i < userLines.lines.length; i++) {
      if (userLines.lines[i].id === userLines.selectedId) return userLines.lines[i];
    }
    return null;
  }

  function archUserLineStrokeOptionsHtml() {
    return (
      '<option value="#308fff">Ingress (blue)</option>' +
      '<option value="#7d8a9e">Intra (gray)</option>' +
      '<option value="#e34850">Egress (red)</option>' +
      '<option value="#111827">Dark</option>' +
      '<option value="#059669">Green</option>' +
      '<option value="#d97706">Amber</option>' +
      '<option value="#7c3aed">Violet</option>'
    );
  }

  function archUserLineSyncPropsHud() {
    var panel = qs('#archUserLineProps');
    var sel = archUserLineGetSelected();
    if (!panel) return;
    if (!sel) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    var colorSel = qs('#archUserLineColorSel');
    if (colorSel) colorSel.value = sel.stroke || '#308fff';
    var bi = qs('#archUserLineBidir');
    if (bi) bi.checked = !!sel.bidirectional;
  }

  function archUserLineRemoveDrawListeners() {
    window.removeEventListener('pointermove', archUserLineOnPointerMovePreview, true);
    window.removeEventListener('keydown', archUserLineOnKeyEscDraw, true);
  }

  function archUserLineOnPointerMovePreview(e) {
    if (!userLines.pendingStart || !userLines.pendingStart.ep) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var pv = qs('#archUserLinePreview');
    if (pv) {
      var p1 = archUserLinePointFromEndpoint(userLines.pendingStart.ep);
      var ep2 = archUserLineSnapEndpoint(p.x, p.y, e.target);
      var p2 = archUserLinePointFromEndpoint(ep2);
      if (!p1 || !p2) return;
      pv.setAttribute('x1', p1.x);
      pv.setAttribute('y1', p1.y);
      pv.setAttribute('x2', p2.x);
      pv.setAttribute('y2', p2.y);
      pv.setAttribute('opacity', '0.85');
    }
  }

  function archUserLineOnKeyEscDraw(e) {
    if (e.key === 'Escape') {
      archUserLineClearPending();
      archUserLineRemoveDrawListeners();
    }
  }

  function archUserLineClearPending() {
    userLines.pendingStart = null;
    var pv = qs('#archUserLinePreview');
    if (pv) pv.setAttribute('opacity', '0');
    if (archViewport) archViewport.classList.remove('arch-user-line-draw-pending');
  }

  function archUserLineAdd(ep1, ep2) {
    var preset = qs('#archUserLineStrokePreset');
    var stroke = (preset && preset.value) || '#308fff';
    var id = 'ul-' + Date.now();
    userLines.lines.push({
      id: id,
      from: ep1,
      to: ep2,
      stroke: stroke,
      strokeWidth: 2.2,
      bidirectional: false,
    });
    userLines.selectedId = id;
    archUserLineRender();
    archUserLinePersist();
    archUserLineSyncPropsHud();
  }

  function archUserLineDeleteSelected() {
    if (!userLines.selectedId) return;
    userLines.lines = userLines.lines.filter(function (x) {
      return x.id !== userLines.selectedId;
    });
    userLines.selectedId = null;
    archUserLineRender();
    archUserLinePersist();
    archUserLineSyncPropsHud();
  }

  function archUserLineOnPointerDown(e) {
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return;
    if (!userLines.drawMode) {
      if (e.target && e.target.classList && e.target.classList.contains('arch-user-line')) {
        userLines.selectedId = e.target.getAttribute('data-user-line-id');
        archUserLineRender();
        archUserLineSyncPropsHud();
        e.stopPropagation();
      }
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.closest && e.target.closest('.arch-int-hud')) return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-user-line')) {
      userLines.selectedId = e.target.getAttribute('data-user-line-id');
      archUserLineRender();
      archUserLineSyncPropsHud();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    if (!userLines.pendingStart) {
      userLines.pendingStart = { ep: archUserLineSnapEndpoint(p.x, p.y, e.target) };
      if (archViewport) archViewport.classList.add('arch-user-line-draw-pending');
      window.addEventListener('pointermove', archUserLineOnPointerMovePreview, true);
      window.addEventListener('keydown', archUserLineOnKeyEscDraw, true);
    } else {
      archUserLineAdd(userLines.pendingStart.ep, archUserLineSnapEndpoint(p.x, p.y, e.target));
      archUserLineClearPending();
      archUserLineRemoveDrawListeners();
    }
  }

  function archUserLineSetDrawMode(on) {
    userLines.drawMode = !!on;
    if (archViewport) archViewport.classList.toggle('arch-user-line-draw', userLines.drawMode);
    var tgl = qs('#archUserLineDrawToggle');
    if (tgl) tgl.checked = userLines.drawMode;
    if (!userLines.drawMode) {
      archUserLineClearPending();
      archUserLineRemoveDrawListeners();
    }
  }

  function archUserLineOnGlobalDelete(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT'))
      return;
    if (userLines.selectedId) {
      e.preventDefault();
      archUserLineDeleteSelected();
    }
  }

  function archMasterSave() {
    var payload = archMasterSerialize();
    try {
      localStorage.setItem(LS_MASTER, JSON.stringify(payload));
      archDragSave();
      archLabelSave();
      archUserLinePersist();
    } catch (err) {}
    if (liveRegion) {
      liveRegion.textContent = 'Master layout saved for this browser.';
    }
  }

  function archFactoryReset() {
    try {
      localStorage.removeItem(LS_MASTER);
      localStorage.removeItem(LS_NODES);
      localStorage.removeItem(LS_LABELS);
      localStorage.removeItem(LS_USER_LINES);
      localStorage.removeItem('aepArchDragTags');
      localStorage.removeItem('aepArchDragSources');
    } catch (e) {}
    window.location.reload();
  }

  function archMasterDownload() {
    var blob = new Blob([JSON.stringify(archMasterSerialize(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aep-architecture-master-layout.json';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function archMasterImportFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        archMasterApply(data);
        archLabelApplyAll();
        archDragApply();
        archUserLineRender();
        archDragSave();
        archLabelSave();
        archUserLinePersist();
        localStorage.setItem(LS_MASTER, JSON.stringify(data));
        if (liveRegion) liveRegion.textContent = 'Imported master layout applied.';
      } catch (err) {
        window.alert('Could not import: invalid JSON.');
      }
    };
    r.readAsText(file);
  }

  function initArchDrag() {
    archDrag.svg = qs('.arch-int-svg-wrap svg');
    if (!archDrag.svg) return;

    archAssignTextIdsAndDefaults();
    archEnsureResizeHandles();
    if (!archMasterTryLoad()) {
      archLabelLoad();
      archDragLoad();
      archUserLineLoad();
    }
    archLabelApplyAll();
    archDragApply();
    archUserLineRender();
    archDragSave();
    archLabelSave();
    archUserLinePersist();

    var colorSel = qs('#archUserLineColorSel');
    if (colorSel && !colorSel.getAttribute('data-arch-ready')) {
      colorSel.innerHTML = archUserLineStrokeOptionsHtml();
      colorSel.setAttribute('data-arch-ready', '1');
    }

    var toggle = qs('#archDragToggle');
    var labelToggle = qs('#archLabelToggle');
    var lineDrawToggle = qs('#archUserLineDrawToggle');
    var reset = qs('#archDragReset');
    var masterSave = qs('#archMasterSave');
    var masterDl = qs('#archMasterDownload');
    var masterImport = qs('#archMasterImport');
    var lineDel = qs('#archUserLineDelete');
    var lineBi = qs('#archUserLineBidir');

    if (toggle) {
      toggle.checked = false;
      toggle.addEventListener('change', function () {
        archDragSetEnabled(toggle.checked);
      });
    }
    if (labelToggle) {
      labelToggle.checked = false;
      labelToggle.addEventListener('change', function () {
        archLabelSetEnabled(labelToggle.checked);
      });
    }
    if (lineDrawToggle) {
      lineDrawToggle.checked = false;
      lineDrawToggle.addEventListener('change', function () {
        archUserLineSetDrawMode(lineDrawToggle.checked);
      });
    }
    if (reset) {
      reset.addEventListener('click', function () {
        if (window.confirm('Restore the original Adobe diagram and clear all custom layout, labels, and connectors in this browser?')) {
          archFactoryReset();
        }
      });
    }
    if (masterSave) {
      masterSave.addEventListener('click', function () {
        archMasterSave();
      });
    }
    if (masterDl) {
      masterDl.addEventListener('click', archMasterDownload);
    }
    if (masterImport) {
      masterImport.addEventListener('change', function () {
        var f = masterImport.files && masterImport.files[0];
        if (f) archMasterImportFile(f);
        masterImport.value = '';
      });
    }
    if (colorSel) {
      colorSel.addEventListener('change', function () {
        var ln = archUserLineGetSelected();
        if (!ln) return;
        ln.stroke = colorSel.value;
        archUserLineRender();
        archUserLinePersist();
      });
    }
    if (lineBi) {
      lineBi.addEventListener('change', function () {
        var ln = archUserLineGetSelected();
        if (!ln) return;
        ln.bidirectional = lineBi.checked;
        archUserLineRender();
        archUserLinePersist();
      });
    }
    if (lineDel) {
      lineDel.addEventListener('click', archUserLineDeleteSelected);
    }

    document.addEventListener('keydown', archUserLineOnGlobalDelete);

    archDrag.svg.addEventListener('pointerdown', archLabelPointerDownCapture, true);
    archDrag.svg.addEventListener('dblclick', archLabelDblClick, true);
    archDrag.svg.addEventListener('pointerdown', archResizePointerDown, false);
    archDrag.svg.addEventListener('pointerdown', archUserLineOnPointerDown, false);

    $all('.arch-int-svg-wrap g.arch-node').forEach(function (g) {
      g.addEventListener('pointerdown', archDragPointerDown);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArchDrag);
  } else {
    initArchDrag();
  }
})();
