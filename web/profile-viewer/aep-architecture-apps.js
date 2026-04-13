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
      flows: [{ id: 'flow-edge-profile', stroke: C.intra, kind: 'intra' }],
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
