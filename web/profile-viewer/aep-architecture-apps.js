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

    applyState();
  }

  /**
   * Draggable architecture nodes: base translate baked in for Tags/Sources (SVG parity).
   * User offset = archDrag.pos[key]; world rect = rect + base + offset.
   */
  var LS_NODES = 'aepArchDragNodes';

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

  var archDrag = {
    enabled: false,
    pos: archDragDefaultPos(),
    active: null,
    start: null,
    svg: null,
  };

  function archDragWorldRect(key) {
    var L = NODE_LAYOUT[key];
    if (!L) return null;
    var p = archDrag.pos[key];
    if (!p) p = { x: 0, y: 0 };
    var tx = L.base[0] + p.x;
    var ty = L.base[1] + p.y;
    var x = L.rect[0] + tx;
    var y = L.rect[1] + ty;
    var w = L.rect[2];
    var h = L.rect[3];
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
    });
    archDragRebuildFlows();
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

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var LS_LABELS = 'aepArchLabelEdits';

  var archLabel = {
    enabled: false,
    state: { pos: {}, content: {} },
    dragActive: null,
    dragStart: null,
    dragPending: null,
  };

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
    archDrag.pos[archDrag.active] = {
      x: archDrag.start.ox + dx,
      y: archDrag.start.oy + dy,
    };
    archDragApply();
  }

  function archDragPointerUpWin() {
    if (!archDrag.active) return;
    if (archViewport) archViewport.classList.remove('arch-dragging');
    window.removeEventListener('pointermove', archDragPointerMoveWin, true);
    window.removeEventListener('pointerup', archDragPointerUpWin, true);
    window.removeEventListener('pointercancel', archDragPointerUpWin, true);
    archDrag.active = null;
    archDrag.start = null;
    archDragSave();
  }

  function archDragPointerDown(e) {
    if (!archDrag.enabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.closest && e.target.closest('text')) return;
    var g = e.currentTarget;
    if (!g || !g.id || g.id.indexOf('node-') !== 0) return;
    var which = g.id.slice(5);
    if (!NODE_LAYOUT[which]) return;
    e.preventDefault();
    e.stopPropagation();
    if (!archDrag.pos[which]) archDrag.pos[which] = { x: 0, y: 0 };
    archDrag.active = which;
    archDrag.start = {
      ox: archDrag.pos[which].x,
      oy: archDrag.pos[which].y,
    };
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    archDrag.start.mx = p.x;
    archDrag.start.my = p.y;
    if (archViewport) archViewport.classList.add('arch-dragging');
    window.addEventListener('pointermove', archDragPointerMoveWin, true);
    window.addEventListener('pointerup', archDragPointerUpWin, true);
    window.addEventListener('pointercancel', archDragPointerUpWin, true);
  }

  function initArchDrag() {
    archDrag.svg = qs('.arch-int-svg-wrap svg');
    if (!archDrag.svg) return;

    archAssignTextIdsAndDefaults();
    archLabelLoad();
    archLabelApplyAll();
    archDragLoad();
    archDragApply();

    var toggle = qs('#archDragToggle');
    var labelToggle = qs('#archLabelToggle');
    var reset = qs('#archDragReset');
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
    if (reset) {
      reset.addEventListener('click', function () {
        archDrag.pos = archDragDefaultPos();
        archLabelReset();
        archDragApply();
        archDragSave();
      });
    }

    archDrag.svg.addEventListener('pointerdown', archLabelPointerDownCapture, true);
    archDrag.svg.addEventListener('dblclick', archLabelDblClick, true);

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
