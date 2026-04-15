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
      highlights: ['node-tags', 'node-sources', 'node-edge', 'node-streaming'],
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

  /** Order of boxes in the highlight picker (matches diagram regions left→right, top→bottom). */
  var ARCH_HIGHLIGHT_KEYS = [
    'tags',
    'sources',
    'edge',
    'creative',
    'aem',
    'aep',
    'streaming',
    'batch',
    'query',
    'intel',
    'lake',
    'pipeline',
    'profile',
    'identity',
    'seg',
    'decision',
    'jo',
    'rtcdp',
    'cja',
    'mix',
    'inbound',
    'msg',
    'paid',
    'jrpt',
    'mrpt',
  ];

  var ARCH_NODE_LABELS = {
    tags: 'Tags',
    sources: 'Sources',
    edge: 'Edge Network',
    creative: 'Creative Cloud',
    aem: 'AEM Assets',
    aep: 'Adobe Experience Platform',
    streaming: 'Streaming collection',
    batch: 'Batch collection',
    query: 'Query Service',
    intel: 'Intelligence & AI',
    lake: 'Data Lake',
    pipeline: 'Pipeline',
    profile: 'Real-Time Profile',
    identity: 'Identity Graph',
    seg: 'Segmentation',
    decision: 'Decisioning / Journeys',
    jo: 'Journey Optimizer',
    rtcdp: 'Real-Time CDP',
    cja: 'Customer Journey Analytics',
    mix: 'Mix Modeler',
    inbound: 'Inbound experiences',
    msg: 'Message Delivery',
    paid: 'Paid Media',
    jrpt: 'Journey Reporting',
    mrpt: 'Marketing performance',
  };

  var LS_STATE_HILITE_OVERRIDES = 'aepArchStateHighlightOverrides';

  /** Per-state override of which node ids are highlighted; key = state index string "0".."15". */
  var archStateHighlightOverrides = {};
  var archHighlightPickerSyncing = false;

  var idx = 0;
  var hudTitle;
  var hudMeta;
  var liveRegion;
  var stateKicker;
  var stateHeadline;
  var stateBody;
  var archViewport;
  var dotButtons = [];

  /** Full-layout undo (snapshots via AEPDiagram.undo). */
  var archUndoStack = null;
  /** Multi-select for platform nodes in Edit mode (AEPDiagram.selection). */
  var archSelection = null;

  /** True when "Edit diagram" is on — state stepping must not advance (playback paused). */
  function archIsEditMode() {
    return !!(archViewport && archViewport.classList.contains('arch-int-viewport--edit-mode'));
  }

  /** Disable prev/next/dot navigation while editing so arrow keys do not fight layout tools. */
  function archSyncPlaybackNav() {
    var blocked = archIsEditMode();
    var prev = qs('#archIntPrev');
    var next = qs('#archIntNext');
    if (prev) prev.disabled = blocked;
    if (next) next.disabled = blocked;
    dotButtons.forEach(function (b) {
      b.disabled = blocked;
    });
    if (blocked || !archSelection) return;
    archSelection.clear();
    archSelectionRefreshDom();
  }

  function archSelectionRefreshDom() {
    if (!archSelection) return;
    $all('.arch-int-svg-wrap g.arch-node').forEach(function (g) {
      if (g.classList.contains('arch-custom-box')) return;
      var id = g.id;
      if (!id || id.indexOf('node-') !== 0 || id.indexOf('node-cbox-') === 0) return;
      g.classList.toggle('arch-node--selected', archSelection.has(id));
    });
    archSelectionPanelSync();
  }

  function archSelectionPanelSync() {
    var panel = qs('#archEditSelectionPanel');
    var txt = qs('#archEditSelectionText');
    if (!panel || !txt) return;
    if (!archIsEditMode()) {
      panel.hidden = true;
      archInspectorSync();
      return;
    }
    panel.hidden = false;
    var parts = [];
    if (archSelection && archSelection.count() > 0) {
      parts.push('Nodes: ' + archSelection.toArray().join(', '));
    }
    if (archCustomBoxSelectedId) {
      var bx = archCustomBoxFind(archCustomBoxSelectedId);
      parts.push(
        'Custom: ' + (bx && bx.name ? bx.name : archCustomBoxSelectedId) + ' (node-cbox-' + archCustomBoxSelectedId + ')'
      );
    }
    if (parts.length === 0) {
      txt.textContent = 'None — click a platform node (Shift+click) or a custom box.';
    } else {
      txt.textContent = parts.join('\n');
    }
    archInspectorSync();
  }

  /** Inspector: custom box (if selected) else single platform node (Edit mode). */
  function archInspectorSync() {
    var ins = qs('#archEditInspector');
    var body = qs('#archEditInspectorBody');
    if (!ins || !body) return;
    if (!archIsEditMode()) {
      ins.hidden = true;
      return;
    }
    if (archCustomBoxSelectedId) {
      var cbox = archCustomBoxFind(archCustomBoxSelectedId);
      if (cbox) {
        var cb = archCustomBoxNormalize(cbox);
        ins.hidden = false;
        body.textContent =
          'Custom box\nName: ' +
          (cb.name || '') +
          '\nId: ' +
          cb.id +
          '\nDOM id: node-cbox-' +
          cb.id +
          '\nPosition: ' +
          Math.round(cb.x) +
          ', ' +
          Math.round(cb.y) +
          '\nSize: ' +
          Math.round(cb.w) +
          ' × ' +
          Math.round(cb.h) +
          '\n\nUse the fields below for fill, outline, and name.';
        return;
      }
    }
    if (!archSelection || archSelection.count() !== 1) {
      ins.hidden = true;
      return;
    }
    var id = archSelection.primary;
    if (!id || id.indexOf('node-') !== 0 || id.indexOf('node-cbox-') === 0) {
      ins.hidden = true;
      return;
    }
    var key = id.slice(5);
    if (!NODE_LAYOUT[key]) {
      ins.hidden = true;
      return;
    }
    ins.hidden = false;
    var human = ARCH_NODE_LABELS[key] || key;
    body.textContent =
      'Key: ' +
      key +
      '\nTitle: ' +
      human +
      '\nElement id: ' +
      id +
      '\n\nTip: turn on “Move & edit labels” to change text on the diagram.';
  }

  function archEditSelectionInit() {
    if (archSelection || !(window.AEPDiagram && window.AEPDiagram.selection)) return;
    archSelection = window.AEPDiagram.selection.create();
    archSelectionPanelSync();
  }

  /** Snapshot without `savedAt` so identical layouts dedupe in the undo stack. */
  function archSnapshotForUndo() {
    var p = archMasterSerialize();
    delete p.savedAt;
    return p;
  }

  function archUndoSnapshotsEqual(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function archUndoSyncUi() {
    var ub = qs('#archUndoBtn');
    var rb = qs('#archRedoBtn');
    if (ub) ub.disabled = !archUndoStack || !archUndoStack.canUndo();
    if (rb) rb.disabled = !archUndoStack || !archUndoStack.canRedo();
  }

  function archUndoInitOnce() {
    if (archUndoStack || !(window.AEPDiagram && window.AEPDiagram.undo)) return;
    archUndoStack = window.AEPDiagram.undo.createStack({ max: 80 });
    archUndoStack.resetWithSnapshot(archSnapshotForUndo());
    archUndoSyncUi();
  }

  /** Call after a user edit; pushes only if the layout actually changed. */
  function archUndoMaybePushSnapshot() {
    if (!archUndoStack) return;
    var s = archSnapshotForUndo();
    var cur = archUndoStack.peek();
    if (cur && archUndoSnapshotsEqual(cur, s)) return;
    archUndoStack.push(s);
    archUndoSyncUi();
  }

  function archApplyLayoutSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    archSourcesDividers = archSourcesDividersDefaultArray();
    archCustomBoxes = [];
    archMasterApply(snap);
    if (!Array.isArray(snap.sourcesDividers)) {
      archSourcesDividersLoad();
    }
    if (!Array.isArray(snap.customBoxes)) {
      archCustomBoxesLoad();
    }
    archLabelApplyAll();
    archDragApply();
    archUserLineRender();
    archSourcesSepPointerLoad();
    archSourcesDividersRenderSvg();
    archSourcesDividersRefreshPanel();
    archCustomBoxesRender();
    archDragSave();
    archLabelSave();
    archUserLinePersist();
    archSourcesDividersPersist();
    archCustomBoxesPersist();
    archStateHighlightOverridesPersist();
    try {
      localStorage.setItem(LS_MASTER, JSON.stringify(archMasterSerialize()));
    } catch (e) {}
    applyState();
  }

  function archUndoRun() {
    if (!archUndoStack) return;
    var snap = archUndoStack.undo();
    if (!snap) return;
    archApplyLayoutSnapshot(snap);
    archUndoSyncUi();
    if (archSelection) {
      archSelection.clear();
      archSelectionRefreshDom();
    }
    if (liveRegion) liveRegion.textContent = 'Undo: layout restored.';
  }

  function archRedoRun() {
    if (!archUndoStack) return;
    var snap = archUndoStack.redo();
    if (!snap) return;
    archApplyLayoutSnapshot(snap);
    archUndoSyncUi();
    if (archSelection) {
      archSelection.clear();
      archSelectionRefreshDom();
    }
    if (liveRegion) liveRegion.textContent = 'Redo: layout restored.';
  }

  function archEditSelectionOnSvgClick(e) {
    if (!archIsEditMode() || !archSelection) return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if (userLines.drawMode || customBoxDrawMode) return;
    var g = e.target.closest && e.target.closest('g.arch-node');
    if (g && g.classList.contains('arch-custom-box')) return;
    if (g && g.id && g.id.indexOf('node-') === 0 && g.id.indexOf('node-cbox-') !== 0) {
      var key = g.id.slice(5);
      if (!NODE_LAYOUT[key]) return;
      e.stopPropagation();
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      if (e.shiftKey) archSelection.toggle(g.id, true);
      else archSelection.setSingle(g.id);
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
      return;
    }
    if (!e.shiftKey) {
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      archSelection.clear();
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
    }
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** Switch diagram editor rail tab (layout | highlights | sources | file). */
  function archEditorSetPanel(panelId) {
    $all('.arch-editor-section').forEach(function (sec) {
      var match = sec.getAttribute('data-arch-panel') === panelId;
      sec.hidden = !match;
      sec.classList.toggle('is-active', match);
    });
    $all('.arch-editor-rail-btn').forEach(function (btn) {
      var match = btn.getAttribute('data-arch-panel') === panelId;
      btn.classList.toggle('is-active', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
  }

  function archHighlightsForState(stateIndex) {
    var o = archStateHighlightOverrides[stateIndex];
    if (o === undefined) o = archStateHighlightOverrides[String(stateIndex)];
    if (Array.isArray(o)) return o.slice();
    var st = STATES[stateIndex];
    return st && st.highlights ? st.highlights.slice() : [];
  }

  function archHighlightArraysEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var sa = a.slice().sort();
    var sb = b.slice().sort();
    for (var i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return false;
    }
    return true;
  }

  function archStateHighlightOverridesPersist() {
    try {
      localStorage.setItem(LS_STATE_HILITE_OVERRIDES, JSON.stringify(archStateHighlightOverrides));
    } catch (e) {}
  }

  function archStateHighlightOverridesLoad() {
    try {
      var r = localStorage.getItem(LS_STATE_HILITE_OVERRIDES);
      if (!r) {
        archStateHighlightOverrides = {};
        return;
      }
      var p = JSON.parse(r);
      archStateHighlightOverrides = p && typeof p === 'object' ? p : {};
    } catch (e2) {
      archStateHighlightOverrides = {};
    }
  }

  function archHighlightPickerInit() {
    var host = qs('#archHighlightPicker');
    if (!host || host.getAttribute('data-arch-built')) return;
    host.setAttribute('data-arch-built', '1');
    ARCH_HIGHLIGHT_KEYS.forEach(function (key) {
      if (!NODE_LAYOUT[key]) return;
      var id = 'node-' + key;
      var lab = ARCH_NODE_LABELS[key] || key;
      var wrap = document.createElement('label');
      wrap.className = 'arch-highlight-picker-item';
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.setAttribute('data-node-id', id);
      inp.addEventListener('change', archHighlightPickerOnChange);
      var span = document.createElement('span');
      span.textContent = lab;
      wrap.appendChild(inp);
      wrap.appendChild(span);
      host.appendChild(wrap);
    });
  }

  function archHighlightPickerSync() {
    var host = qs('#archHighlightPicker');
    if (!host) return;
    var nums = qs('#archHighlightStateNum');
    if (nums) nums.textContent = String(idx + 1);
    var hilites = archHighlightsForState(idx);
    archHighlightPickerSyncing = true;
    host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      var nid = cb.getAttribute('data-node-id');
      cb.checked = hilites.indexOf(nid) >= 0;
    });
    archHighlightPickerSyncing = false;
  }

  function archHighlightPickerOnChange() {
    if (archHighlightPickerSyncing) return;
    var host = qs('#archHighlightPicker');
    if (!host) return;
    var selected = [];
    host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (cb.checked) selected.push(cb.getAttribute('data-node-id'));
    });
    var def = STATES[idx] && STATES[idx].highlights ? STATES[idx].highlights : [];
    if (archHighlightArraysEqual(selected, def)) {
      delete archStateHighlightOverrides[idx];
      delete archStateHighlightOverrides[String(idx)];
    } else {
      archStateHighlightOverrides[String(idx)] = selected;
    }
    archStateHighlightOverridesPersist();
    applyState();
  }

  function archHighlightResetCurrentState() {
    delete archStateHighlightOverrides[idx];
    delete archStateHighlightOverrides[String(idx)];
    archStateHighlightOverridesPersist();
    applyState();
  }

  function archRefreshNodeHighlightClasses() {
    var hilites = archHighlightsForState(idx);
    $all('.arch-node').forEach(function (el) {
      el.classList.toggle('is-highlighted', hilites.indexOf(el.id) >= 0);
    });
  }

  function applyState() {
    var st = STATES[idx];
    if (!st) return;

    archRefreshNodeHighlightClasses();

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

    archHighlightPickerSync();
  }

  function go(delta) {
    if (archIsEditMode()) return;
    var n = idx + delta;
    if (n < 0 || n >= STATES.length) return;
    idx = n;
    applyState();
  }

  function goTo(i) {
    if (archIsEditMode()) return;
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

    var LS_ARCH_HIDE_UI = 'aepArchHideControls';
    function archApplyHideControls() {
      var hide = false;
      try {
        if (localStorage.getItem(LS_ARCH_HIDE_UI) === '1') hide = true;
      } catch (e) {}
      var tgl = qs('#archHideControlsToggle');
      if (tgl) tgl.checked = hide;
      if (archViewport) archViewport.classList.toggle('arch-int-viewport--editing-tools-hidden', hide);
      var fab = qs('#archShowControlsFab');
      if (fab) fab.hidden = !hide;
    }

    archStateHighlightOverridesLoad();
    archHighlightPickerInit();
    var archHighlightResetBtn = qs('#archHighlightResetState');
    if (archHighlightResetBtn) {
      archHighlightResetBtn.addEventListener('click', function () {
        archHighlightResetCurrentState();
      });
    }

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
      if (e.key === 'Escape' && archViewport && archViewport.classList.contains('arch-int-viewport--editing-tools-hidden')) {
        e.preventDefault();
        try {
          localStorage.setItem(LS_ARCH_HIDE_UI, '0');
        } catch (err) {}
        var hct = qs('#archHideControlsToggle');
        if (hct) hct.checked = false;
        archApplyHideControls();
        return;
      }
      if (archIsEditMode()) return;
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

    var LS_ARCH_EDIT = 'aepArchDiagramEditMode';
    var LS_ARCH_DOCK = 'aepArchEditorDockRight';

    function archEditorApplyEditMode() {
      var on = false;
      try {
        if (localStorage.getItem(LS_ARCH_EDIT) === '1') on = true;
      } catch (e) {}
      var tgl = qs('#archEditModeToggle');
      if (tgl) tgl.checked = on;
      var dock = qs('#archEditorDock');
      if (dock) dock.hidden = !on;
      if (archViewport) archViewport.classList.toggle('arch-int-viewport--edit-mode', on);
      archSyncPlaybackNav();
      archSelectionPanelSync();
    }

    function archEditorApplyDock() {
      var right = false;
      try {
        if (localStorage.getItem(LS_ARCH_DOCK) === '1') right = true;
      } catch (e) {}
      if (archViewport) archViewport.classList.toggle('arch-int-viewport--dock-right', right);
      var dk = qs('#archDockSideToggle');
      if (dk) {
        dk.textContent = right ? '⇄ Left' : '⇄ Right';
        dk.setAttribute('title', right ? 'Dock editor on the left' : 'Dock editor on the right');
      }
    }

    archEditorApplyDock();
    archEditorApplyEditMode();
    archApplyHideControls();
    archEditorSetPanel('layout');

    var editModeTgl = qs('#archEditModeToggle');
    if (editModeTgl) {
      editModeTgl.addEventListener('change', function () {
        try {
          localStorage.setItem(LS_ARCH_EDIT, editModeTgl.checked ? '1' : '0');
        } catch (e) {}
        archEditorApplyEditMode();
      });
    }

    var dockSideBtn = qs('#archDockSideToggle');
    if (dockSideBtn) {
      dockSideBtn.addEventListener('click', function () {
        var right = !archViewport.classList.contains('arch-int-viewport--dock-right');
        try {
          localStorage.setItem(LS_ARCH_DOCK, right ? '1' : '0');
        } catch (e) {}
        archEditorApplyDock();
      });
    }

    var editorRail = qs('.arch-editor-rail');
    if (editorRail) {
      editorRail.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.arch-editor-rail-btn');
        if (!btn) return;
        var pid = btn.getAttribute('data-arch-panel');
        if (pid) archEditorSetPanel(pid);
      });
    }

    var hideUiTgl = qs('#archHideControlsToggle');
    if (hideUiTgl) {
      hideUiTgl.addEventListener('change', function () {
        try {
          localStorage.setItem(LS_ARCH_HIDE_UI, hideUiTgl.checked ? '1' : '0');
        } catch (e) {}
        archApplyHideControls();
      });
    }

    var showControlsFab = qs('#archShowControlsFab');
    if (showControlsFab) {
      showControlsFab.addEventListener('click', function () {
        try {
          localStorage.setItem(LS_ARCH_HIDE_UI, '0');
        } catch (e) {}
        if (hideUiTgl) hideUiTgl.checked = false;
        archApplyHideControls();
      });
    }

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
      var wh2 = archNodeEffectiveWH(key);
      var hs = ARCH_RESIZE_HANDLE;
      var rl = L.rect[0];
      var rt = L.rect[1];
      var rw = wh2.w;
      var rh = wh2.h;
      var hw = Math.max(0, (rw - hs) / 2);
      var hh = Math.max(0, (rh - hs) / 2);
      var handlePos = [
        { k: 'nw', x: rl, y: rt },
        { k: 'ne', x: rl + rw - hs, y: rt },
        { k: 'sw', x: rl, y: rt + rh - hs },
        { k: 'se', x: rl + rw - hs, y: rt + rh - hs },
        { k: 'n', x: rl + hw, y: rt },
        { k: 's', x: rl + hw, y: rt + rh - hs },
        { k: 'w', x: rl, y: rt + hh },
        { k: 'e', x: rl + rw - hs, y: rt + hh },
      ];
      handlePos.forEach(function (sp) {
        var hEl = g.querySelector('.arch-node-resize-handle[data-arch-node-handle="' + sp.k + '"]');
        if (hEl) {
          hEl.setAttribute('x', String(sp.x));
          hEl.setAttribute('y', String(sp.y));
        }
      });
    });
    archDragRebuildFlows();
    if (userLines.lines.length) archUserLineRender();
  }

  function archEnsureResizeHandles() {
    var hs = ARCH_RESIZE_HANDLE;
    var keys = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var g = qs('#node-' + key);
      if (!g) return;
      if (g.querySelector('.arch-node-resize-handle[data-arch-node-handle]')) return;
      $all('.arch-node-resize-handle:not(.arch-node-resize-handle--cbox)', g).forEach(function (el) {
        el.parentNode.removeChild(el);
      });
      keys.forEach(function (hk) {
        var h = document.createElementNS(SVG_NS, 'rect');
        h.setAttribute('class', 'arch-node-resize-handle arch-node-resize-handle--node');
        h.setAttribute('data-arch-node-handle', hk);
        h.setAttribute('width', String(hs));
        h.setAttribute('height', String(hs));
        h.setAttribute('rx', '2');
        h.setAttribute('fill', '#ffffff');
        h.setAttribute('stroke', '#1473e6');
        h.setAttribute('stroke-width', '1.25');
        h.setAttribute('tabindex', '-1');
        h.setAttribute('aria-hidden', 'true');
        g.appendChild(h);
      });
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
  var LS_SOURCES_DIVIDERS = 'aepArchSourcesDividers';
  var LS_SOURCES_DIV_POINTER = 'aepArchSourcesDividerPointer';

  /** Horizontal rules in the Sources column (#arch-sources-seps-layer), in node-local coordinates. */
  var archSourcesDividers = [];

  /** When enabled, diagram shows draggable hit areas and handles for divider lines. */
  var archSourcesSepPointer = { enabled: false, active: null };

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

  /** Preset stroke colors for user-drawn connectors (visual swatches + tooltips). */
  var ARCH_USER_LINE_PRESETS = [
    { hex: '#308fff', label: 'Ingress — blue' },
    { hex: '#7d8a9e', label: 'Intra — gray' },
    { hex: '#e34850', label: 'Egress — red' },
    { hex: '#111827', label: 'Dark' },
    { hex: '#059669', label: 'Green' },
    { hex: '#d97706', label: 'Amber' },
    { hex: '#7c3aed', label: 'Violet' },
  ];

  function archLineStrokeNormalizeHex(h) {
    if (!h || typeof h !== 'string') return '';
    return h.trim().toLowerCase();
  }

  function archLineSwatchesApplySelection(container, hex) {
    if (!container) return;
    var norm = archLineStrokeNormalizeHex(hex);
    var buttons = $all('.arch-line-swatch', container);
    var any = false;
    buttons.forEach(function (btn) {
      var v = archLineStrokeNormalizeHex(btn.getAttribute('data-stroke') || '');
      var on = norm && v === norm;
      if (on) any = true;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (!any && buttons.length) {
      buttons.forEach(function (btn) {
        btn.setAttribute('aria-checked', 'false');
      });
    }
  }

  function archLineSwatchesGetValue(container) {
    if (!container) return ARCH_USER_LINE_PRESETS[0].hex;
    var on = qs('.arch-line-swatch[aria-checked="true"]', container);
    if (on) return on.getAttribute('data-stroke') || ARCH_USER_LINE_PRESETS[0].hex;
    var first = qs('.arch-line-swatch', container);
    return first ? first.getAttribute('data-stroke') || ARCH_USER_LINE_PRESETS[0].hex : ARCH_USER_LINE_PRESETS[0].hex;
  }

  function archLineNextStrokePreviewSet(hex) {
    var el = qs('#archUserLineNextStrokePreview');
    if (!el) return;
    var h = hex || ARCH_USER_LINE_PRESETS[0].hex;
    el.style.backgroundColor = h;
  }

  function archLineSwatchesMount(container, opts) {
    opts = opts || {};
    if (!container || container.getAttribute('data-arch-swatches') === '1') return;
    container.setAttribute('data-arch-swatches', '1');
    container.setAttribute('role', 'radiogroup');
    if (opts.ariaLabel) container.setAttribute('aria-label', opts.ariaLabel);
    ARCH_USER_LINE_PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'arch-line-swatch';
      b.setAttribute('data-stroke', p.hex);
      b.setAttribute('title', p.label);
      b.setAttribute('aria-label', p.label);
      b.setAttribute('role', 'radio');
      b.style.backgroundColor = p.hex;
      b.addEventListener('click', function () {
        archLineSwatchesApplySelection(container, p.hex);
        if (opts.onPick) opts.onPick(p.hex);
      });
      container.appendChild(b);
    });
    var initial = opts.initialHex || ARCH_USER_LINE_PRESETS[0].hex;
    archLineSwatchesApplySelection(container, initial);
  }

  /** User-drawn rectangles (world SVG coords). */
  var archCustomBoxes = [];
  var archCustomBoxSelectedId = null;
  /** When set, label size −/+ applies to this box (user clicked the SVG label). */
  var archCustomBoxLabelActiveId = null;
  var customBoxDrawMode = false;
  var customBoxDrawPending = null;
  var archCustomDrag = { active: null, start: null };
  var archCustomResize = { active: null, start: null };
  var LS_CUSTOM_BOXES = 'aepArchCustomBoxes';

  function archCustomBoxNormalize(b) {
    var o = {
      id: typeof b.id === 'string' ? b.id : 'cbox-' + Date.now(),
      x: Number(b.x) || 0,
      y: Number(b.y) || 0,
      w: Number(b.w) || 80,
      h: Number(b.h) || 48,
      fill: typeof b.fill === 'string' && b.fill ? b.fill : '#e5e7eb',
      stroke: typeof b.stroke === 'string' && b.stroke ? b.stroke : '#94a3b8',
      name: typeof b.name === 'string' ? b.name : 'New box',
    };
    var lfs = Number(b.labelFontSize);
    o.labelFontSize = isNaN(lfs) ? 8.5 : archClamp(lfs, 4, 22);
    o.w = Math.max(ARCH_MIN_NODE_W, Math.min(ARCH_MAX_NODE_W, o.w));
    o.h = Math.max(ARCH_MIN_NODE_H, Math.min(ARCH_MAX_NODE_H, o.h));
    o.x = archClamp(o.x, 0, ARCH_GUIDE_VIEW.w - o.w);
    o.y = archClamp(o.y, 0, ARCH_GUIDE_VIEW.h - o.h);
    return o;
  }

  function archCustomBoxWorldRect(box) {
    if (!box) return null;
    var b = archCustomBoxNormalize(box);
    return {
      left: b.x,
      top: b.y,
      right: b.x + b.w,
      bottom: b.y + b.h,
      w: b.w,
      h: b.h,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
    };
  }

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

  function archUserLineClosestOnWorldRectBorder(wr, px, py) {
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

  function archUserLineClosestOnNodeBorder(key, px, py) {
    var wr = archDragWorldRect(key);
    return archUserLineClosestOnWorldRectBorder(wr, px, py);
  }

  function archUserLineSnapEndpoint(px, py, targetEl) {
    var preferredNode = null;
    var preferredCbox = null;
    if (targetEl && targetEl.closest) {
      var g = targetEl.closest('g.arch-node');
      if (g && g.id && g.id.indexOf('node-') === 0) {
        var rest = g.id.slice(5);
        if (NODE_LAYOUT[rest]) preferredNode = rest;
        else if (rest.indexOf('cbox-') === 0) preferredCbox = rest;
      }
    }
    var candidates = [];
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var c = archUserLineClosestOnNodeBorder(key, px, py);
      if (c) candidates.push({ typ: 'node', key: key, c: c });
    });
    archCustomBoxes.forEach(function (box) {
      var wr = archCustomBoxWorldRect(box);
      var c = archUserLineClosestOnWorldRectBorder(wr, px, py);
      if (c) candidates.push({ typ: 'cbox', boxId: box.id, c: c });
    });
    candidates.sort(function (a, b) {
      var da = a.c.dist;
      var db = b.c.dist;
      if (Math.abs(da - db) < 3 && preferredNode) {
        if (a.typ === 'node' && a.key === preferredNode) return -1;
        if (b.typ === 'node' && b.key === preferredNode) return 1;
      }
      if (Math.abs(da - db) < 3 && preferredCbox) {
        if (a.typ === 'cbox' && a.boxId === preferredCbox) return -1;
        if (b.typ === 'cbox' && b.boxId === preferredCbox) return 1;
      }
      return da - db;
    });
    var first = candidates[0];
    if (first && first.c.dist <= USER_LINE_SNAP_PX) {
      if (first.typ === 'cbox') {
        return { kind: 'cbox', boxId: first.boxId, edge: first.c.edge, t: archClamp(first.c.t, 0, 1) };
      }
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

  function archCustomBoxEdgeToWorld(boxId, edge, t) {
    var box = null;
    for (var i = 0; i < archCustomBoxes.length; i++) {
      if (archCustomBoxes[i].id === boxId) {
        box = archCustomBoxes[i];
        break;
      }
    }
    if (!box) return null;
    var wr = archCustomBoxWorldRect(box);
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
    if (ep.kind === 'cbox') {
      return archCustomBoxEdgeToWorld(ep.boxId, ep.edge, ep.t);
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
    if (userLines.drawMode || customBoxDrawMode) return;
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
    var endedKey = archDrag.active;
    archDrag.active = null;
    archDrag.start = null;
    archDragSave();
    archUndoMaybePushSnapshot();
    if (archIsEditMode() && archSelection && endedKey) {
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      archSelection.setSingle('node-' + endedKey);
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
    }
  }

  function archResizePointerDown(e) {
    if (!archDrag.enabled || userLines.drawMode || customBoxDrawMode) return;
    if (!e.target || !e.target.classList || !e.target.classList.contains('arch-node-resize-handle')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    var g = e.target.closest('g.arch-node');
    if (!g || !g.id || g.id.indexOf('node-') !== 0) return;
    if (g.id.indexOf('node-cbox-') === 0) {
      archCustomBoxResizePointerDown(e, g);
      return;
    }
    var which = g.id.slice(5);
    if (!NODE_LAYOUT[which]) return;
    var handle = e.target.getAttribute('data-arch-node-handle');
    if (!handle) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    archResize.active = which;
    archResize.start = {
      handle: handle,
      mx: p.x,
      my: p.y,
      world0: archDragWorldRect(which),
    };
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
    var s = archResize.start;
    var dx = p.x - s.mx;
    var dy = p.y - s.my;
    var k = archResize.active;
    var L = NODE_LAYOUT[k];
    if (!L || !s.world0) return;
    var h = s.handle || 'se';
    var wr0 = s.world0;
    var wl = wr0.left;
    var wt = wr0.top;
    var ww = wr0.w;
    var wh = wr0.h;
    var nwl;
    var nwt;
    var nww;
    var nwh;
    switch (h) {
      case 'se':
        nwl = wl;
        nwt = wt;
        nww = ww + dx;
        nwh = wh + dy;
        break;
      case 'sw':
        nwl = wl + dx;
        nwt = wt;
        nww = ww - dx;
        nwh = wh + dy;
        break;
      case 'ne':
        nwl = wl;
        nwt = wt + dy;
        nww = ww + dx;
        nwh = wh - dy;
        break;
      case 'nw':
        nwl = wl + dx;
        nwt = wt + dy;
        nww = ww - dx;
        nwh = wh - dy;
        break;
      case 'n':
        nwl = wl;
        nwt = wt + dy;
        nww = ww;
        nwh = wh - dy;
        break;
      case 's':
        nwl = wl;
        nwt = wt;
        nww = ww;
        nwh = wh + dy;
        break;
      case 'w':
        nwl = wl + dx;
        nwt = wt;
        nww = ww - dx;
        nwh = wh;
        break;
      case 'e':
        nwl = wl;
        nwt = wt;
        nww = ww + dx;
        nwh = wh;
        break;
      default:
        nwl = wl;
        nwt = wt;
        nww = ww + dx;
        nwh = wh + dy;
    }
    nww = Math.max(ARCH_MIN_NODE_W, Math.min(ARCH_MAX_NODE_W, nww));
    nwh = Math.max(ARCH_MIN_NODE_H, Math.min(ARCH_MAX_NODE_H, nwh));
    nwl = archClamp(nwl, 0, ARCH_GUIDE_VIEW.w - nww);
    nwt = archClamp(nwt, 0, ARCH_GUIDE_VIEW.h - nwh);
    if (nwl + nww > ARCH_GUIDE_VIEW.w) nww = ARCH_GUIDE_VIEW.w - nwl;
    if (nwt + nwh > ARCH_GUIDE_VIEW.h) nwh = ARCH_GUIDE_VIEW.h - nwt;
    nww = Math.max(ARCH_MIN_NODE_W, nww);
    nwh = Math.max(ARCH_MIN_NODE_H, nwh);
    if (!archDrag.pos[k]) archDrag.pos[k] = { x: 0, y: 0 };
    archDrag.pos[k].x = nwl - L.base[0] - L.rect[0];
    archDrag.pos[k].y = nwt - L.base[1] - L.rect[1];
    archDrag.pos[k].w = nww;
    archDrag.pos[k].h = nwh;
    archDragApply();
  }

  function archResizePointerUpWin() {
    if (!archResize.active) return;
    var endedKey = archResize.active;
    archResize.active = null;
    archResize.start = null;
    if (archViewport) archViewport.classList.remove('arch-resizing');
    window.removeEventListener('pointermove', archResizePointerMoveWin, true);
    window.removeEventListener('pointerup', archResizePointerUpWin, true);
    window.removeEventListener('pointercancel', archResizePointerUpWin, true);
    archDragSave();
    archUndoMaybePushSnapshot();
    if (archIsEditMode() && archSelection && endedKey) {
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      archSelection.setSingle('node-' + endedKey);
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
    }
  }

  function archDragPointerDown(e) {
    if (!archDrag.enabled) return;
    if (userLines.drawMode || customBoxDrawMode) return;
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

  /** Inner bounds of `.arch-sources-shell` (node-local coords inside #node-sources). */
  var SOURCES_SHELL_L = 22;
  var SOURCES_SHELL_R = 22 + 118;
  var SOURCES_SHELL_T = 122;
  var SOURCES_SHELL_B = 122 + 200;

  /** Root SVG coords → #node-sources local coords (same space as divider x1/x2/y). */
  function archSourcesWorldToLocal(pt) {
    var src = archDrag.pos.sources || { x: 0, y: 0 };
    var bx = NODE_LAYOUT.sources.base[0] + src.x;
    var by = NODE_LAYOUT.sources.base[1] + src.y;
    return { x: pt.x - bx, y: pt.y - by };
  }

  function archSourcesSepPointerApplyViewportClass() {
    if (!archViewport) return;
    archViewport.classList.toggle('arch-sources-divider-pointer-on', archSourcesSepPointer.enabled);
  }

  function archSourcesSepPointerSetEnabled(on) {
    archSourcesSepPointer.enabled = !!on;
    try {
      localStorage.setItem(LS_SOURCES_DIV_POINTER, archSourcesSepPointer.enabled ? '1' : '0');
    } catch (e) {}
    var tgl = qs('#archSourcesDividerPointerToggle');
    if (tgl) tgl.checked = archSourcesSepPointer.enabled;
    archSourcesSepPointerApplyViewportClass();
    archSourcesDividersRenderSvg();
  }

  function archSourcesSepPointerLoad() {
    try {
      archSourcesSepPointer.enabled = localStorage.getItem(LS_SOURCES_DIV_POINTER) === '1';
    } catch (e) {
      archSourcesSepPointer.enabled = false;
    }
    var tgl = qs('#archSourcesDividerPointerToggle');
    if (tgl) tgl.checked = archSourcesSepPointer.enabled;
    archSourcesSepPointerApplyViewportClass();
  }

  function archSourcesSepPointerMoveWin(e) {
    if (!archSourcesSepPointer.active || !archDrag.svg) return;
    e.preventDefault();
    var a = archSourcesSepPointer.active;
    var d = archSourcesDividers[a.index];
    if (!d) return;
    var pWorld = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var pLocal = archSourcesWorldToLocal(pWorld);
    if (a.mode === 'move') {
      var dy = pLocal.y - a.startLocal.y;
      d.y = a.orig.y + dy;
    } else if (a.mode === 'left') {
      d.x1 = pLocal.x;
    } else if (a.mode === 'right') {
      d.x2 = pLocal.x;
    }
    archSourcesDividerClamp(d);
    archSourcesDividersPersist();
    archSourcesDividersRenderSvg();
  }

  function archSourcesSepPointerUpWin(e) {
    if (!archSourcesSepPointer.active) return;
    archSourcesSepPointer.active = null;
    if (archViewport) archViewport.classList.remove('arch-sources-sep-dragging');
    window.removeEventListener('pointermove', archSourcesSepPointerMoveWin, true);
    window.removeEventListener('pointerup', archSourcesSepPointerUpWin, true);
    window.removeEventListener('pointercancel', archSourcesSepPointerUpWin, true);
    archSourcesDividersRefreshPanel();
    archUndoMaybePushSnapshot();
  }

  function archSourcesSepPointerDownCapture(e) {
    if (!archSourcesSepPointer.enabled || !archDrag.svg) return;
    if (userLines.drawMode || customBoxDrawMode) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    var t = e.target;
    if (!t || !t.closest) return;
    var g = t.closest('.arch-sources-sep-g');
    if (!g) return;
    var idx = parseInt(g.getAttribute('data-sep-index'), 10);
    if (isNaN(idx) || !archSourcesDividers[idx]) return;
    var mode = 'move';
    if (t.classList && t.classList.contains('arch-sources-sep-handle')) {
      mode = t.getAttribute('data-end') === 'right' ? 'right' : 'left';
    } else if (!t.classList || !t.classList.contains('arch-sources-sep-hit')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var pWorld = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var pLocal = archSourcesWorldToLocal(pWorld);
    var orig = archSourcesDividers[idx];
    archSourcesSepPointer.active = {
      index: idx,
      mode: mode,
      startLocal: { x: pLocal.x, y: pLocal.y },
      orig: { x1: orig.x1, x2: orig.x2, y: orig.y },
    };
    if (archViewport) archViewport.classList.add('arch-sources-sep-dragging');
    window.addEventListener('pointermove', archSourcesSepPointerMoveWin, true);
    window.addEventListener('pointerup', archSourcesSepPointerUpWin, true);
    window.addEventListener('pointercancel', archSourcesSepPointerUpWin, true);
  }

  function archSourcesDividerClamp(d) {
    var x1 = Number(d.x1);
    var x2 = Number(d.x2);
    var y = Number(d.y);
    if (isNaN(x1)) x1 = 30;
    if (isNaN(x2)) x2 = 132;
    if (isNaN(y)) y = 166;
    d.x1 = archClamp(x1, SOURCES_SHELL_L, SOURCES_SHELL_R);
    d.x2 = archClamp(x2, SOURCES_SHELL_L, SOURCES_SHELL_R);
    if (d.x1 > d.x2) {
      var t = d.x1;
      d.x1 = d.x2;
      d.x2 = t;
    }
    d.y = archClamp(y, SOURCES_SHELL_T, SOURCES_SHELL_B);
    d.stroke = typeof d.stroke === 'string' && d.stroke ? d.stroke : '#d1d5db';
    var sw = Number(d.strokeWidth);
    d.strokeWidth = isNaN(sw) || sw <= 0 ? 0.75 : archClamp(sw, 0.25, 4);
    if (!d.id || typeof d.id !== 'string') d.id = 'sep-' + Date.now();
    return d;
  }

  function archSourcesDividersDefaultArray() {
    return [
      archSourcesDividerClamp({
        id: 'sep-default',
        x1: 30,
        x2: 132,
        y: 166,
        stroke: '#d1d5db',
        strokeWidth: 0.75,
      }),
    ];
  }

  function archSourcesDividersNormalize(arr) {
    if (!Array.isArray(arr)) return archSourcesDividersDefaultArray();
    if (arr.length === 0) return [];
    return arr.map(function (raw) {
      return archSourcesDividerClamp(Object.assign({}, raw));
    });
  }

  function archSourcesDividersLoad() {
    try {
      var r = localStorage.getItem(LS_SOURCES_DIVIDERS);
      if (r == null || r === '') {
        archSourcesDividers = archSourcesDividersDefaultArray();
        return;
      }
      var p = JSON.parse(r);
      archSourcesDividers = archSourcesDividersNormalize(p);
    } catch (e) {
      archSourcesDividers = archSourcesDividersDefaultArray();
    }
  }

  function archSourcesDividersPersist() {
    try {
      localStorage.setItem(LS_SOURCES_DIVIDERS, JSON.stringify(archSourcesDividers));
    } catch (e) {}
  }

  function archSourcesDividersRenderSvg() {
    var layer = qs('#arch-sources-seps-layer');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    archSourcesDividers.forEach(function (d, index) {
      var g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'arch-sources-sep-g');
      g.setAttribute('data-sep-index', String(index));
      g.setAttribute('data-arch-sources-sep', d.id);

      var vis = document.createElementNS(SVG_NS, 'line');
      vis.setAttribute('class', 'arch-sources-sep');
      vis.setAttribute('x1', String(d.x1));
      vis.setAttribute('y1', String(d.y));
      vis.setAttribute('x2', String(d.x2));
      vis.setAttribute('y2', String(d.y));
      vis.setAttribute('stroke', d.stroke || '#d1d5db');
      vis.setAttribute('stroke-width', String(d.strokeWidth != null ? d.strokeWidth : 0.75));
      vis.setAttribute('pointer-events', archSourcesSepPointer.enabled ? 'none' : 'auto');
      g.appendChild(vis);

      if (archSourcesSepPointer.enabled) {
        var hit = document.createElementNS(SVG_NS, 'line');
        hit.setAttribute('class', 'arch-sources-sep-hit');
        hit.setAttribute('x1', String(d.x1));
        hit.setAttribute('y1', String(d.y));
        hit.setAttribute('x2', String(d.x2));
        hit.setAttribute('y2', String(d.y));
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '14');
        hit.setAttribute('pointer-events', 'stroke');
        g.appendChild(hit);
        ['left', 'right'].forEach(function (end) {
          var cx = end === 'left' ? d.x1 : d.x2;
          var c = document.createElementNS(SVG_NS, 'circle');
          c.setAttribute('class', 'arch-sources-sep-handle');
          c.setAttribute('data-end', end);
          c.setAttribute('cx', String(cx));
          c.setAttribute('cy', String(d.y));
          c.setAttribute('r', '4');
          c.setAttribute('tabindex', '-1');
          c.setAttribute('aria-hidden', 'true');
          g.appendChild(c);
        });
      }
      layer.appendChild(g);
    });
  }

  function archSourcesDividersRefreshPanel() {
    var host = qs('#archSourcesDividersList');
    if (!host) return;
    host.innerHTML = '';
    archSourcesDividers.forEach(function (d, index) {
      var row = document.createElement('div');
      row.className = 'arch-sources-divider-row';
      row.setAttribute('data-sep-index', String(index));

      var title = document.createElement('span');
      title.className = 'arch-sources-divider-row-title';
      title.textContent = 'Line ' + (index + 1);

      function addField(label, field, val) {
        var lab = document.createElement('label');
        lab.className = 'arch-hud-label arch-sources-divider-field';
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.step = '0.5';
        inp.className = 'arch-sources-div-inp';
        inp.setAttribute('data-field', field);
        inp.value = String(val);
        lab.appendChild(document.createTextNode(label + ' '));
        lab.appendChild(inp);
        row.appendChild(lab);
      }

      row.appendChild(title);
      addField('Y', 'y', d.y);
      addField('Left', 'x1', d.x1);
      addField('Right', 'x2', d.x2);

      var dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'dashboard-btn-outline arch-sources-div-dup';
      dup.textContent = 'Duplicate';
      dup.setAttribute('data-action', 'dup');

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'dashboard-btn-outline arch-sources-div-del';
      del.textContent = 'Delete';
      del.setAttribute('data-action', 'del');

      row.appendChild(dup);
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  function archSourcesDividersOnFieldInput(e) {
    var inp = e.target;
    if (!inp || !inp.classList || !inp.classList.contains('arch-sources-div-inp')) return;
    var row = inp.closest('.arch-sources-divider-row');
    if (!row) return;
    var index = parseInt(row.getAttribute('data-sep-index'), 10);
    var field = inp.getAttribute('data-field');
    if (!archSourcesDividers[index] || !field) return;
    var v = parseFloat(inp.value);
    if (isNaN(v)) return;
    archSourcesDividers[index][field] = v;
    archSourcesDividerClamp(archSourcesDividers[index]);
    row.querySelector('[data-field="y"]').value = String(archSourcesDividers[index].y);
    row.querySelector('[data-field="x1"]').value = String(archSourcesDividers[index].x1);
    row.querySelector('[data-field="x2"]').value = String(archSourcesDividers[index].x2);
    archSourcesDividersPersist();
    archSourcesDividersRenderSvg();
  }

  function archSourcesDividersOnPanelClick(e) {
    var btn = e.target.closest && e.target.closest('button[data-action]');
    if (!btn || !e.currentTarget.contains(btn)) return;
    var row = btn.closest('.arch-sources-divider-row');
    if (!row) return;
    var idx = parseInt(row.getAttribute('data-sep-index'), 10);
    if (btn.getAttribute('data-action') === 'dup') {
      e.preventDefault();
      archSourcesDividersDuplicate(idx);
    } else if (btn.getAttribute('data-action') === 'del') {
      e.preventDefault();
      archSourcesDividersDelete(idx);
    }
  }

  function archSourcesDividersDuplicate(index) {
    var src = archSourcesDividers[index];
    if (!src) return;
    var copy = archSourcesDividerClamp({
      id: 'sep-' + Date.now(),
      x1: src.x1,
      x2: src.x2,
      y: src.y + 6,
      stroke: src.stroke,
      strokeWidth: src.strokeWidth,
    });
    archSourcesDividers.splice(index + 1, 0, copy);
    archSourcesDividersPersist();
    archSourcesDividersRenderSvg();
    archSourcesDividersRefreshPanel();
  }

  function archSourcesDividersDelete(index) {
    archSourcesDividers.splice(index, 1);
    archSourcesDividersPersist();
    archSourcesDividersRenderSvg();
    archSourcesDividersRefreshPanel();
  }

  function archSourcesDividersAdd() {
    var d = archSourcesDividerClamp({
      id: 'sep-' + Date.now(),
      x1: 30,
      x2: 132,
      y: 180,
      stroke: '#d1d5db',
      strokeWidth: 0.75,
    });
    archSourcesDividers.push(d);
    archSourcesDividersPersist();
    archSourcesDividersRenderSvg();
    archSourcesDividersRefreshPanel();
  }

  function archCustomBoxFind(id) {
    for (var i = 0; i < archCustomBoxes.length; i++) {
      if (archCustomBoxes[i].id === id) return archCustomBoxes[i];
    }
    return null;
  }

  function archCustomBoxesLoad() {
    try {
      var r = localStorage.getItem(LS_CUSTOM_BOXES);
      if (!r) {
        archCustomBoxes = [];
        return;
      }
      var p = JSON.parse(r);
      archCustomBoxes = Array.isArray(p) ? p.map(archCustomBoxNormalize) : [];
    } catch (e) {
      archCustomBoxes = [];
    }
  }

  function archCustomBoxesPersist() {
    try {
      localStorage.setItem(LS_CUSTOM_BOXES, JSON.stringify(archCustomBoxes.map(archCustomBoxNormalize)));
    } catch (e) {}
  }

  function archHighlightPickerRefreshCustomBoxes() {
    var host = qs('#archHighlightPicker');
    if (!host) return;
    host.querySelectorAll('[data-custom-cbox="1"]').forEach(function (el) {
      el.parentNode.removeChild(el);
    });
    archCustomBoxes.forEach(function (box) {
      var b = archCustomBoxNormalize(box);
      var domId = 'node-cbox-' + b.id;
      var lab = document.createElement('label');
      lab.className = 'arch-highlight-picker-item';
      lab.setAttribute('data-custom-cbox', '1');
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.setAttribute('data-node-id', domId);
      inp.addEventListener('change', archHighlightPickerOnChange);
      var span = document.createElement('span');
      span.textContent = b.name || 'Custom box';
      lab.appendChild(inp);
      lab.appendChild(span);
      host.appendChild(lab);
    });
  }

  function archCustomBoxSyncPropsHud() {
    var panel = qs('#archCustomBoxProps');
    var box = archCustomBoxSelectedId ? archCustomBoxFind(archCustomBoxSelectedId) : null;
    var nameInp = qs('#archCustomBoxNameInput');
    var fillInp = qs('#archCustomBoxFillInput');
    var strokeInp = qs('#archCustomBoxStrokeInput');
    var sm = qs('#archCustomBoxTextSmaller');
    var lg = qs('#archCustomBoxTextLarger');
    var disp = qs('#archCustomBoxFontSizeDisplay');
    if (!panel) return;
    if (!box) {
      panel.hidden = true;
      if (sm) sm.disabled = true;
      if (lg) lg.disabled = true;
      archSelectionPanelSync();
      return;
    }
    panel.hidden = false;
    if (nameInp) nameInp.value = box.name || '';
    if (fillInp) fillInp.value = box.fill || '#e5e7eb';
    if (strokeInp) strokeInp.value = box.stroke || '#94a3b8';
    var b = archCustomBoxNormalize(box);
    var labelReady = !!(archCustomBoxLabelActiveId && archCustomBoxLabelActiveId === archCustomBoxSelectedId);
    if (sm) sm.disabled = !labelReady || b.labelFontSize <= 4;
    if (lg) lg.disabled = !labelReady || b.labelFontSize >= 22;
    if (disp) disp.textContent = String(Math.round(b.labelFontSize * 10) / 10);
    archSelectionPanelSync();
  }

  function archCustomBoxDuplicateSelected() {
    if (!archCustomBoxSelectedId) return;
    var src = archCustomBoxFind(archCustomBoxSelectedId);
    if (!src) return;
    var b = archCustomBoxNormalize(src);
    var nb = archCustomBoxNormalize({
      id: 'cbox-' + Date.now(),
      x: b.x + 28,
      y: b.y + 28,
      w: b.w,
      h: b.h,
      name: (b.name || 'Box') + ' (copy)',
      fill: b.fill,
      stroke: b.stroke,
      labelFontSize: b.labelFontSize,
    });
    nb.x = archClamp(nb.x, 0, ARCH_GUIDE_VIEW.w - nb.w);
    nb.y = archClamp(nb.y, 0, ARCH_GUIDE_VIEW.h - nb.h);
    archCustomBoxes.push(nb);
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    archUserLineRender();
    archUserLineSyncPropsHud();
    var domId = 'node-cbox-' + nb.id;
    var curH = archHighlightsForState(idx).slice();
    if (curH.indexOf(domId) < 0) curH.push(domId);
    var defH = STATES[idx] && STATES[idx].highlights ? STATES[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archStateHighlightOverrides[idx];
      delete archStateHighlightOverrides[String(idx)];
    } else {
      archStateHighlightOverrides[String(idx)] = curH;
    }
    archStateHighlightOverridesPersist();
    archCustomBoxesPersist();
    archCustomBoxesRender();
    archUserLineRender();
    archUndoMaybePushSnapshot();
    if (liveRegion) liveRegion.textContent = 'Duplicated custom box.';
  }

  function archCustomBoxAdjustLabelSize(delta) {
    if (!archCustomBoxLabelActiveId || archCustomBoxLabelActiveId !== archCustomBoxSelectedId) return;
    var box = archCustomBoxFind(archCustomBoxLabelActiveId);
    if (!box) return;
    var b = archCustomBoxNormalize(box);
    var next = Math.round((b.labelFontSize + delta) * 2) / 2;
    next = archClamp(next, 4, 22);
    box.labelFontSize = next;
    archCustomBoxesPersist();
    archCustomBoxesRender();
    archUserLineRender();
  }

  function archCustomBoxDeleteSelected() {
    if (!archCustomBoxSelectedId) return;
    var sid = archCustomBoxSelectedId;
    archCustomBoxes = archCustomBoxes.filter(function (b) {
      return b.id !== sid;
    });
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    Object.keys(archStateHighlightOverrides).forEach(function (k) {
      var arr = archStateHighlightOverrides[k];
      if (!Array.isArray(arr)) return;
      var domId = 'node-cbox-' + sid;
      archStateHighlightOverrides[k] = arr.filter(function (id) {
        return id !== domId;
      });
    });
    archCustomBoxesPersist();
    archStateHighlightOverridesPersist();
    archCustomBoxesRender();
    archUserLineRender();
    archUndoMaybePushSnapshot();
  }

  function archCustomBoxesRender() {
    var layer = qs('#layer-custom-boxes');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    archCustomBoxes = archCustomBoxes.map(archCustomBoxNormalize);
    archCustomBoxes.forEach(function (raw) {
      var b = archCustomBoxNormalize(raw);
      var g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('id', 'node-cbox-' + b.id);
      g.setAttribute('class', 'arch-node arch-custom-box');
      if (archCustomBoxSelectedId === b.id) g.classList.add('arch-custom-box--selected');
      g.setAttribute('transform', 'translate(' + b.x + ',' + b.y + ')');
      var shell = document.createElementNS(SVG_NS, 'rect');
      shell.setAttribute('data-arch-shell', '1');
      shell.setAttribute('x', '0');
      shell.setAttribute('y', '0');
      shell.setAttribute('width', String(b.w));
      shell.setAttribute('height', String(b.h));
      shell.setAttribute('rx', '6');
      shell.setAttribute('fill', b.fill);
      shell.setAttribute('stroke', b.stroke);
      shell.setAttribute('stroke-width', '1.25');
      var tx = document.createElementNS(SVG_NS, 'text');
      tx.setAttribute('class', 'arch-node-label arch-custom-box-label');
      if (archCustomBoxLabelActiveId === b.id) tx.classList.add('arch-custom-box-label--active');
      tx.setAttribute('font-size', String(b.labelFontSize) + 'px');
      tx.setAttribute('dominant-baseline', 'middle');
      tx.setAttribute('x', String(b.w / 2));
      tx.setAttribute('y', String(b.h / 2));
      tx.setAttribute('text-anchor', 'middle');
      tx.textContent = b.name || 'Box';
      var hs = ARCH_RESIZE_HANDLE;
      var hw = Math.max(0, (b.w - hs) / 2);
      var hh = Math.max(0, (b.h - hs) / 2);
      var handleSpecs = [
        { k: 'nw', x: 0, y: 0 },
        { k: 'ne', x: b.w - hs, y: 0 },
        { k: 'sw', x: 0, y: b.h - hs },
        { k: 'se', x: b.w - hs, y: b.h - hs },
        { k: 'n', x: hw, y: 0 },
        { k: 's', x: hw, y: b.h - hs },
        { k: 'w', x: 0, y: hh },
        { k: 'e', x: b.w - hs, y: hh },
      ];
      g.appendChild(shell);
      g.appendChild(tx);
      handleSpecs.forEach(function (sp) {
        var hEl = document.createElementNS(SVG_NS, 'rect');
        hEl.setAttribute('class', 'arch-node-resize-handle arch-node-resize-handle--cbox');
        hEl.setAttribute('data-arch-cbox-handle', sp.k);
        hEl.setAttribute('width', String(hs));
        hEl.setAttribute('height', String(hs));
        hEl.setAttribute('rx', '2');
        hEl.setAttribute('x', String(sp.x));
        hEl.setAttribute('y', String(sp.y));
        hEl.setAttribute('fill', '#ffffff');
        hEl.setAttribute('stroke', '#1473e6');
        hEl.setAttribute('stroke-width', '1.25');
        hEl.setAttribute('tabindex', '-1');
        hEl.setAttribute('aria-hidden', 'true');
        g.appendChild(hEl);
      });
      g.addEventListener('pointerdown', archCustomBoxDragPointerDown);
      layer.appendChild(g);
    });
    archHighlightPickerRefreshCustomBoxes();
    archHighlightPickerSync();
    archRefreshNodeHighlightClasses();
    archCustomBoxSyncPropsHud();
  }

  function archCustomBoxSetDrawMode(on) {
    customBoxDrawMode = !!on;
    if (archViewport) archViewport.classList.toggle('arch-custom-box-draw', customBoxDrawMode);
    var tgl = qs('#archCustomBoxDrawToggle');
    if (tgl) tgl.checked = customBoxDrawMode;
    if (!customBoxDrawMode) {
      customBoxDrawPending = null;
      var pv = qs('#archCustomBoxPreview');
      if (pv) pv.setAttribute('opacity', '0');
      window.removeEventListener('pointermove', archCustomBoxDrawPointerMove, true);
      window.removeEventListener('pointerup', archCustomBoxDrawPointerUp, true);
    }
    if (customBoxDrawMode) {
      userLines.drawMode = false;
      var lt = qs('#archUserLineDrawToggle');
      if (lt) lt.checked = false;
      archUserLineClearPending();
      archUserLineRemoveDrawListeners();
      if (archViewport) archViewport.classList.remove('arch-user-line-draw');
    }
  }

  function archCustomBoxDrawPointerMove(e) {
    if (!customBoxDrawPending) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var x0 = customBoxDrawPending.x0;
    var y0 = customBoxDrawPending.y0;
    var x = Math.min(x0, p.x);
    var y = Math.min(y0, p.y);
    var w = Math.abs(p.x - x0);
    var h = Math.abs(p.y - y0);
    var pv = qs('#archCustomBoxPreview');
    if (pv) {
      pv.setAttribute('x', String(x));
      pv.setAttribute('y', String(y));
      pv.setAttribute('width', String(w));
      pv.setAttribute('height', String(h));
      pv.setAttribute('opacity', '0.75');
    }
  }

  function archCustomBoxDrawPointerUp(e) {
    window.removeEventListener('pointermove', archCustomBoxDrawPointerMove, true);
    window.removeEventListener('pointerup', archCustomBoxDrawPointerUp, true);
    var pv = qs('#archCustomBoxPreview');
    if (pv) pv.setAttribute('opacity', '0');
    if (!customBoxDrawPending) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var x0 = customBoxDrawPending.x0;
    var y0 = customBoxDrawPending.y0;
    customBoxDrawPending = null;
    var x = Math.min(x0, p.x);
    var y = Math.min(y0, p.y);
    var w = Math.abs(p.x - x0);
    var h = Math.abs(p.y - y0);
    if (w < ARCH_MIN_NODE_W || h < ARCH_MIN_NODE_H) return;
    x = archClamp(x, 0, ARCH_GUIDE_VIEW.w - w);
    y = archClamp(y, 0, ARCH_GUIDE_VIEW.h - h);
    var nb = archCustomBoxNormalize({
      id: 'cbox-' + Date.now(),
      x: x,
      y: y,
      w: w,
      h: h,
      name: 'New box',
    });
    archCustomBoxes.push(nb);
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    var domId = 'node-cbox-' + nb.id;
    var curH = archHighlightsForState(idx).slice();
    if (curH.indexOf(domId) < 0) curH.push(domId);
    var defH = STATES[idx] && STATES[idx].highlights ? STATES[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archStateHighlightOverrides[idx];
      delete archStateHighlightOverrides[String(idx)];
    } else {
      archStateHighlightOverrides[String(idx)] = curH;
    }
    archStateHighlightOverridesPersist();
    archCustomBoxesPersist();
    archCustomBoxesRender();
    archUserLineRender();
  }

  /** Preset custom boxes (Visio-like palette). Keys match data-arch-palette on buttons. */
  var ARCH_PALETTE_PRESETS = {
    process: { name: 'Process', w: 120, h: 56, fill: '#eff6ff', stroke: '#2563eb' },
    datastore: { name: 'Data store', w: 100, h: 72, fill: '#ecfdf5', stroke: '#059669' },
    external: { name: 'External system', w: 140, h: 48, fill: '#fef3c7', stroke: '#d97706' },
    textnote: { name: 'Text note', w: 200, h: 40, fill: '#fffefb', stroke: '#c4c9d4' },
  };

  function archPaletteAddPreset(presetKey) {
    if (!archIsEditMode() || !archDrag.svg) return;
    var preset = ARCH_PALETTE_PRESETS[presetKey];
    if (!preset) return;
    var n = archCustomBoxes.length;
    var x = 400 + (n % 6) * 32;
    var y = 200 + (n % 5) * 26;
    x = archClamp(x, 0, ARCH_GUIDE_VIEW.w - preset.w);
    y = archClamp(y, 0, ARCH_GUIDE_VIEW.h - preset.h);
    var nb = archCustomBoxNormalize({
      id: 'cbox-' + Date.now(),
      x: x,
      y: y,
      w: preset.w,
      h: preset.h,
      name: preset.name,
      fill: preset.fill,
      stroke: preset.stroke,
    });
    archCustomBoxes.push(nb);
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    archUserLineRender();
    archUserLineSyncPropsHud();
    if (archSelection) {
      archSelection.clear();
      archSelectionRefreshDom();
    }
    var domId = 'node-cbox-' + nb.id;
    var curH = archHighlightsForState(idx).slice();
    if (curH.indexOf(domId) < 0) curH.push(domId);
    var defH = STATES[idx] && STATES[idx].highlights ? STATES[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archStateHighlightOverrides[idx];
      delete archStateHighlightOverrides[String(idx)];
    } else {
      archStateHighlightOverrides[String(idx)] = curH;
    }
    archStateHighlightOverridesPersist();
    archCustomBoxesPersist();
    archCustomBoxesRender();
    archUserLineRender();
    archUndoMaybePushSnapshot();
    if (liveRegion) liveRegion.textContent = 'Added ' + preset.name + ' shape.';
  }

  function archCustomBoxDrawPointerDownCapture(e) {
    if (!customBoxDrawMode || !archDrag.svg) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.closest && e.target.closest('.arch-diagram-ui')) return;
    e.preventDefault();
    e.stopPropagation();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    customBoxDrawPending = { x0: p.x, y0: p.y };
    window.addEventListener('pointermove', archCustomBoxDrawPointerMove, true);
    window.addEventListener('pointerup', archCustomBoxDrawPointerUp, true);
  }

  function archCustomBoxDragPointerMoveWin(e) {
    if (!archCustomDrag.active || !archCustomDrag.start) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var dx = p.x - archCustomDrag.start.mx;
    var dy = p.y - archCustomDrag.start.my;
    var box = archCustomBoxFind(archCustomDrag.active);
    if (!box) return;
    var nx = archCustomDrag.start.ox + dx;
    var ny = archCustomDrag.start.oy + dy;
    var b = archCustomBoxNormalize(box);
    nx = archClamp(nx, 0, ARCH_GUIDE_VIEW.w - b.w);
    ny = archClamp(ny, 0, ARCH_GUIDE_VIEW.h - b.h);
    box.x = nx;
    box.y = ny;
    archCustomBoxesRender();
    archUserLineRender();
  }

  function archCustomBoxDragPointerUpWin() {
    if (!archCustomDrag.active) return;
    archCustomDrag.active = null;
    archCustomDrag.start = null;
    if (archViewport) archViewport.classList.remove('arch-dragging');
    window.removeEventListener('pointermove', archCustomBoxDragPointerMoveWin, true);
    window.removeEventListener('pointerup', archCustomBoxDragPointerUpWin, true);
    window.removeEventListener('pointercancel', archCustomBoxDragPointerUpWin, true);
    archCustomBoxesPersist();
    archUndoMaybePushSnapshot();
  }

  function archCustomBoxDragPointerDown(e) {
    if (userLines.drawMode || customBoxDrawMode) return;
    var g = e.currentTarget;
    if (!g.id || g.id.indexOf('node-cbox-') !== 0) return;
    var rawId = g.id.replace(/^node-cbox-/, '');
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return;
    var box = archCustomBoxFind(rawId);
    if (!box) return;

    var labelHit = e.target && e.target.closest && e.target.closest('.arch-custom-box-label');

    if (!archDrag.enabled) {
      userLines.selectedId = null;
      archUserLineRender();
      archUserLineSyncPropsHud();
      archCustomBoxSelectedId = rawId;
      archCustomBoxLabelActiveId = labelHit ? rawId : null;
      archCustomBoxesRender();
      e.stopPropagation();
      return;
    }

    if (labelHit) {
      userLines.selectedId = null;
      archUserLineRender();
      archUserLineSyncPropsHud();
      archCustomBoxSelectedId = rawId;
      archCustomBoxLabelActiveId = rawId;
      archCustomBoxesRender();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    userLines.selectedId = null;
    archUserLineRender();
    archUserLineSyncPropsHud();
    archCustomBoxSelectedId = rawId;
    archCustomBoxLabelActiveId = null;
    e.preventDefault();
    e.stopPropagation();
    archCustomDrag.active = rawId;
    archCustomDrag.start = {
      ox: box.x,
      oy: box.y,
      mx: svgClientToSvg(archDrag.svg, e.clientX, e.clientY).x,
      my: svgClientToSvg(archDrag.svg, e.clientX, e.clientY).y,
    };
    if (archViewport) archViewport.classList.add('arch-dragging');
    window.addEventListener('pointermove', archCustomBoxDragPointerMoveWin, true);
    window.addEventListener('pointerup', archCustomBoxDragPointerUpWin, true);
    window.addEventListener('pointercancel', archCustomBoxDragPointerUpWin, true);
  }

  function archCustomBoxResizePointerMoveWin(e) {
    if (!archCustomResize.active || !archCustomResize.start) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var s = archCustomResize.start;
    var dx = p.x - s.mx;
    var dy = p.y - s.my;
    var box = archCustomBoxFind(archCustomResize.active);
    if (!box || !s.handle) return;
    var ox = s.ox;
    var oy = s.oy;
    var ow = s.ow;
    var oh = s.oh;
    var nx = ox;
    var ny = oy;
    var nw = ow;
    var nh = oh;
    switch (s.handle) {
      case 'se':
        nw = ow + dx;
        nh = oh + dy;
        break;
      case 'sw':
        nx = ox + dx;
        nw = ow - dx;
        nh = oh + dy;
        break;
      case 'ne':
        ny = oy + dy;
        nw = ow + dx;
        nh = oh - dy;
        break;
      case 'nw':
        nx = ox + dx;
        ny = oy + dy;
        nw = ow - dx;
        nh = oh - dy;
        break;
      case 'n':
        ny = oy + dy;
        nh = oh - dy;
        break;
      case 's':
        nh = oh + dy;
        break;
      case 'w':
        nx = ox + dx;
        nw = ow - dx;
        break;
      case 'e':
        nw = ow + dx;
        break;
      default:
        nw = ow + dx;
        nh = oh + dy;
    }
    nw = Math.max(ARCH_MIN_NODE_W, Math.min(ARCH_MAX_NODE_W, nw));
    nh = Math.max(ARCH_MIN_NODE_H, Math.min(ARCH_MAX_NODE_H, nh));
    nx = archClamp(nx, 0, ARCH_GUIDE_VIEW.w - nw);
    ny = archClamp(ny, 0, ARCH_GUIDE_VIEW.h - nh);
    if (nx + nw > ARCH_GUIDE_VIEW.w) nw = ARCH_GUIDE_VIEW.w - nx;
    if (ny + nh > ARCH_GUIDE_VIEW.h) nh = ARCH_GUIDE_VIEW.h - ny;
    nw = Math.max(ARCH_MIN_NODE_W, nw);
    nh = Math.max(ARCH_MIN_NODE_H, nh);
    box.x = nx;
    box.y = ny;
    box.w = nw;
    box.h = nh;
    archCustomBoxesRender();
    archUserLineRender();
  }

  function archCustomBoxResizePointerUpWin() {
    if (!archCustomResize.active) return;
    archCustomResize.active = null;
    archCustomResize.start = null;
    if (archViewport) archViewport.classList.remove('arch-resizing');
    window.removeEventListener('pointermove', archCustomBoxResizePointerMoveWin, true);
    window.removeEventListener('pointerup', archCustomBoxResizePointerUpWin, true);
    window.removeEventListener('pointercancel', archCustomBoxResizePointerUpWin, true);
    archCustomBoxesPersist();
    archUndoMaybePushSnapshot();
  }

  function archCustomBoxResizePointerDown(e, g) {
    if (!archDrag.enabled || userLines.drawMode || customBoxDrawMode) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    var handle = e.target && e.target.getAttribute && e.target.getAttribute('data-arch-cbox-handle');
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    var rawId = g.id.replace(/^node-cbox-/, '');
    var box = archCustomBoxFind(rawId);
    if (!box) return;
    var b = archCustomBoxNormalize(box);
    var p0 = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    archCustomResize.active = rawId;
    archCustomResize.start = {
      handle: handle,
      mx: p0.x,
      my: p0.y,
      ox: box.x,
      oy: box.y,
      ow: b.w,
      oh: b.h,
    };
    archCustomBoxSelectedId = rawId;
    archCustomBoxLabelActiveId = null;
    if (archViewport) archViewport.classList.add('arch-resizing');
    window.addEventListener('pointermove', archCustomBoxResizePointerMoveWin, true);
    window.addEventListener('pointerup', archCustomBoxResizePointerUpWin, true);
    window.addEventListener('pointercancel', archCustomBoxResizePointerUpWin, true);
  }

  function archMasterSerialize() {
    var payload = {
      version: 8,
      savedAt: new Date().toISOString(),
      nodes: archDrag.pos,
      labels: { pos: archLabel.state.pos, content: archLabel.state.content },
      userLines: userLines.lines.map(archUserLineMigrateLegacy),
      stateHighlightOverrides: JSON.parse(JSON.stringify(archStateHighlightOverrides)),
      sourcesDividers: JSON.parse(JSON.stringify(archSourcesDividers)),
      customBoxes: JSON.parse(JSON.stringify(archCustomBoxes.map(archCustomBoxNormalize))),
    };
    if (typeof window !== 'undefined' && window.AEPDiagram && window.AEPDiagram.model && window.AEPDiagram.model.legacyToScene) {
      payload.scene = window.AEPDiagram.model.legacyToScene(payload);
    }
    return payload;
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
    if (data.stateHighlightOverrides && typeof data.stateHighlightOverrides === 'object') {
      archStateHighlightOverrides = {};
      Object.keys(data.stateHighlightOverrides).forEach(function (k) {
        var v = data.stateHighlightOverrides[k];
        if (Array.isArray(v)) archStateHighlightOverrides[k] = v.slice();
      });
    }
    if (Array.isArray(data.sourcesDividers)) {
      archSourcesDividers = archSourcesDividersNormalize(data.sourcesDividers);
    }
    if (Array.isArray(data.customBoxes)) {
      archCustomBoxes = data.customBoxes.map(archCustomBoxNormalize);
    }
  }

  function archMasterTryLoad() {
    try {
      var raw = localStorage.getItem(LS_MASTER);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (typeof window !== 'undefined' && window.AEPDiagram && window.AEPDiagram.model && window.AEPDiagram.model.migrateLayout) {
        data = window.AEPDiagram.model.migrateLayout(data);
      }
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

  function archUserLineSyncPropsHud() {
    var panel = qs('#archUserLineProps');
    var sel = archUserLineGetSelected();
    if (!panel) return;
    if (!sel) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    archEditorSetPanel('sources');
    var colorHost = qs('#archUserLineColorSwatches');
    if (colorHost) archLineSwatchesApplySelection(colorHost, sel.stroke || '#308fff');
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
    var presetHost = qs('#archUserLineStrokePresetSwatches');
    var stroke = archLineSwatchesGetValue(presetHost);
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
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    archCustomBoxesRender();
    archUserLineRender();
    archUserLinePersist();
    archUserLineSyncPropsHud();
    archUndoMaybePushSnapshot();
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
    archUndoMaybePushSnapshot();
  }

  function archUserLineOnPointerDown(e) {
    if (customBoxDrawMode) return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return;
    if (!userLines.drawMode) {
      if (e.target && e.target.classList && e.target.classList.contains('arch-user-line')) {
        userLines.selectedId = e.target.getAttribute('data-user-line-id');
        archCustomBoxSelectedId = null;
        archCustomBoxLabelActiveId = null;
        archCustomBoxesRender();
        archUserLineRender();
        archUserLineSyncPropsHud();
        e.stopPropagation();
      }
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.closest && e.target.closest('.arch-diagram-ui')) return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-user-line')) {
      userLines.selectedId = e.target.getAttribute('data-user-line-id');
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      archCustomBoxesRender();
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
    if (userLines.drawMode) archEditorSetPanel('sources');
    if (!userLines.drawMode) {
      archUserLineClearPending();
      archUserLineRemoveDrawListeners();
    }
    if (userLines.drawMode) {
      customBoxDrawMode = false;
      var ct = qs('#archCustomBoxDrawToggle');
      if (ct) ct.checked = false;
      if (archViewport) archViewport.classList.remove('arch-custom-box-draw');
      customBoxDrawPending = null;
      var pv = qs('#archCustomBoxPreview');
      if (pv) pv.setAttribute('opacity', '0');
      window.removeEventListener('pointermove', archCustomBoxDrawPointerMove, true);
      window.removeEventListener('pointerup', archCustomBoxDrawPointerUp, true);
    }
  }

  function archUserLineOnGlobalDelete(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT'))
      return;
    if (archCustomBoxSelectedId) {
      e.preventDefault();
      archCustomBoxDeleteSelected();
      return;
    }
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
      archSourcesDividersPersist();
      archCustomBoxesPersist();
      archStateHighlightOverridesPersist();
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
      localStorage.removeItem(LS_SOURCES_DIVIDERS);
      localStorage.removeItem(LS_CUSTOM_BOXES);
      localStorage.removeItem('aepArchDragTags');
      localStorage.removeItem('aepArchDragSources');
      localStorage.removeItem(LS_STATE_HILITE_OVERRIDES);
      localStorage.removeItem('aepDiagramUndoStack');
      localStorage.removeItem('aepDiagramSelection');
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
        var raw = JSON.parse(r.result);
        var EM = window.AEPDiagram && window.AEPDiagram.editorModel;
        if (!EM) {
          window.alert('Diagram editor module missing. Reload the page.');
          return;
        }
        var model = EM.fromMasterPayload(raw);
        var v = EM.validateDiagramModel(model);
        if (!v.ok) {
          window.alert('Invalid layout JSON:\n' + v.errors.slice(0, 16).join('\n'));
          return;
        }
        archApplyLayoutSnapshot(model);
        archUndoMaybePushSnapshot();
        if (archSelection) {
          archSelection.clear();
          archSelectionRefreshDom();
        }
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
    archSourcesDividers = archSourcesDividersDefaultArray();
    archCustomBoxes = [];
    if (!archMasterTryLoad()) {
      archLabelLoad();
      archDragLoad();
      archUserLineLoad();
      archSourcesDividersLoad();
      archCustomBoxesLoad();
    } else {
      try {
        var rawM = localStorage.getItem(LS_MASTER);
        var md = rawM ? JSON.parse(rawM) : {};
        if (!Array.isArray(md.sourcesDividers)) {
          archSourcesDividersLoad();
        }
        if (!Array.isArray(md.customBoxes)) {
          archCustomBoxesLoad();
        }
      } catch (e2) {
        archSourcesDividersLoad();
        archCustomBoxesLoad();
      }
    }
    archLabelApplyAll();
    archDragApply();
    archUserLineRender();
    archSourcesSepPointerLoad();
    archSourcesDividersRenderSvg();
    archSourcesDividersRefreshPanel();
    archCustomBoxesRender();
    archDragSave();
    archLabelSave();
    archUserLinePersist();
    archSourcesDividersPersist();
    archCustomBoxesPersist();

    var presetSw = qs('#archUserLineStrokePresetSwatches');
    archLineSwatchesMount(presetSw, {
      ariaLabel: 'Default stroke color for new connectors',
      initialHex: ARCH_USER_LINE_PRESETS[0].hex,
      onPick: archLineNextStrokePreviewSet,
    });
    if (presetSw) archLineNextStrokePreviewSet(archLineSwatchesGetValue(presetSw));
    var selSw = qs('#archUserLineColorSwatches');
    archLineSwatchesMount(selSw, {
      ariaLabel: 'Stroke color for the selected connector',
      initialHex: ARCH_USER_LINE_PRESETS[0].hex,
      onPick: function (hex) {
        var ln = archUserLineGetSelected();
        if (!ln) return;
        ln.stroke = hex;
        archUserLineRender();
        archUserLinePersist();
        archUndoMaybePushSnapshot();
      },
    });

    var toggle = qs('#archDragToggle');
    var labelToggle = qs('#archLabelToggle');
    var lineDrawToggle = qs('#archUserLineDrawToggle');
    var customBoxDrawToggle = qs('#archCustomBoxDrawToggle');
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
    if (customBoxDrawToggle) {
      customBoxDrawToggle.checked = false;
      customBoxDrawToggle.addEventListener('change', function () {
        archCustomBoxSetDrawMode(customBoxDrawToggle.checked);
      });
    }
    if (reset) {
      reset.addEventListener('click', function () {
        if (
          window.confirm(
            'Restore the original Adobe diagram and clear all custom layout, labels, connectors, custom boxes, and per-state highlight choices in this browser?'
          )
        ) {
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

    var cboxName = qs('#archCustomBoxNameInput');
    var cboxFill = qs('#archCustomBoxFillInput');
    var cboxStroke = qs('#archCustomBoxStrokeInput');
    var cboxDel = qs('#archCustomBoxDelete');
    function archCustomBoxApplyEditsFromHud() {
      if (!archCustomBoxSelectedId) return;
      var box = archCustomBoxFind(archCustomBoxSelectedId);
      if (!box) return;
      if (cboxName) box.name = cboxName.value || 'Box';
      if (cboxFill) box.fill = cboxFill.value;
      if (cboxStroke) box.stroke = cboxStroke.value;
      archCustomBoxesPersist();
      archCustomBoxesRender();
      archUserLineRender();
      archSelectionPanelSync();
    }
    if (cboxName) {
      cboxName.addEventListener('input', archCustomBoxApplyEditsFromHud);
      cboxName.addEventListener('change', archCustomBoxApplyEditsFromHud);
    }
    if (cboxFill) {
      cboxFill.addEventListener('input', archCustomBoxApplyEditsFromHud);
      cboxFill.addEventListener('change', archCustomBoxApplyEditsFromHud);
    }
    if (cboxStroke) {
      cboxStroke.addEventListener('input', archCustomBoxApplyEditsFromHud);
      cboxStroke.addEventListener('change', archCustomBoxApplyEditsFromHud);
    }
    if (cboxDel) {
      cboxDel.addEventListener('click', archCustomBoxDeleteSelected);
    }
    var cboxDup = qs('#archCustomBoxDuplicate');
    if (cboxDup) {
      cboxDup.addEventListener('click', archCustomBoxDuplicateSelected);
    }
    var cboxTextSm = qs('#archCustomBoxTextSmaller');
    var cboxTextLg = qs('#archCustomBoxTextLarger');
    if (cboxTextSm) {
      cboxTextSm.addEventListener('click', function () {
        archCustomBoxAdjustLabelSize(-0.5);
      });
    }
    if (cboxTextLg) {
      cboxTextLg.addEventListener('click', function () {
        archCustomBoxAdjustLabelSize(0.5);
      });
    }

    var sepList = qs('#archSourcesDividersList');
    if (sepList && !sepList.getAttribute('data-arch-ready')) {
      sepList.setAttribute('data-arch-ready', '1');
      sepList.addEventListener('input', archSourcesDividersOnFieldInput);
      sepList.addEventListener('click', archSourcesDividersOnPanelClick);
    }
    var sepAdd = qs('#archSourcesDividerAdd');
    if (sepAdd) {
      sepAdd.addEventListener('click', archSourcesDividersAdd);
    }
    var sepPtrTgl = qs('#archSourcesDividerPointerToggle');
    if (sepPtrTgl && !sepPtrTgl.getAttribute('data-arch-ready')) {
      sepPtrTgl.setAttribute('data-arch-ready', '1');
      sepPtrTgl.addEventListener('change', function () {
        archSourcesSepPointerSetEnabled(!!sepPtrTgl.checked);
      });
    }

    document.addEventListener('keydown', archUserLineOnGlobalDelete);

    archDrag.svg.addEventListener('pointerdown', archSourcesSepPointerDownCapture, true);
    archDrag.svg.addEventListener('pointerdown', archCustomBoxDrawPointerDownCapture, true);
    archDrag.svg.addEventListener('pointerdown', archLabelPointerDownCapture, true);
    archDrag.svg.addEventListener('dblclick', archLabelDblClick, true);
    archDrag.svg.addEventListener('pointerdown', archResizePointerDown, false);
    archDrag.svg.addEventListener('pointerdown', archUserLineOnPointerDown, false);

    $all('.arch-int-svg-wrap g.arch-node').forEach(function (g) {
      g.addEventListener('pointerdown', archDragPointerDown);
    });

    archEditSelectionInit();
    archUndoInitOnce();

    if (!document.documentElement.getAttribute('data-arch-undo-keys')) {
      document.documentElement.setAttribute('data-arch-undo-keys', '1');
      document.addEventListener(
        'keydown',
        function (e) {
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable))
            return;
          var mod = e.metaKey || e.ctrlKey;
          if (mod && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) archRedoRun();
            else archUndoRun();
            return;
          }
          if (e.ctrlKey && !e.metaKey && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            archRedoRun();
          }
        },
        true
      );
    }

    var undoBtn = qs('#archUndoBtn');
    var redoBtn = qs('#archRedoBtn');
    if (undoBtn && !undoBtn.getAttribute('data-arch-ready')) {
      undoBtn.setAttribute('data-arch-ready', '1');
      undoBtn.addEventListener('click', archUndoRun);
    }
    if (redoBtn && !redoBtn.getAttribute('data-arch-ready')) {
      redoBtn.setAttribute('data-arch-ready', '1');
      redoBtn.addEventListener('click', archRedoRun);
    }

    archDrag.svg.addEventListener('click', archEditSelectionOnSvgClick, false);

    var editorPanelPal = qs('#archEditorPanel');
    if (editorPanelPal && !editorPanelPal.getAttribute('data-arch-palette-ready')) {
      editorPanelPal.setAttribute('data-arch-palette-ready', '1');
      editorPanelPal.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-arch-palette]');
        if (!btn) return;
        var k = btn.getAttribute('data-arch-palette');
        if (k) archPaletteAddPreset(k);
      });
    }

    archStateHighlightOverridesPersist();
    applyState();
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
