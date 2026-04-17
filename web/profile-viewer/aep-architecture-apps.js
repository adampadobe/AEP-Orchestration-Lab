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

  /** When a diagram object is selected, turn on Move (and Labels when the object has editable text). */
  function archEditorApplyModesForCurrentSelection() {
    if (!archIsEditMode()) return;
    if (archGetActiveTool() !== 'select') return;
    var hasPlatform = archSelection && archSelection.count() > 0;
    var hasCbox = !!archCustomBoxSelectedId;
    var lineOnly = !!(userLines && userLines.selectedId) && !hasPlatform && !hasCbox;
    if (lineOnly) return;
    if (!hasPlatform && !hasCbox) return;

    archDragSetEnabled(true);

    if (hasPlatform) {
      archLabelSetEnabled(true);
      return;
    }

    var cbox = archCustomBoxFind(archCustomBoxSelectedId);
    var cb = cbox ? archCustomBoxNormalize(cbox) : null;
    archLabelSetEnabled(!archCustomBoxIsIconAsset(cb));
  }

  function archSelectionPanelSync() {
    archEditorApplyModesForCurrentSelection();
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
        var insExtra = '';
        if (cb.kind === 'productLogo' && cb.logoDescription) {
          insExtra = '\nDescription (hover): ' + cb.logoDescription;
        } else if (cb.kind === 'spectrumIcon' && cb.iconFile) {
          insExtra = '\nSpectrum file: ' + cb.iconFile;
        }
        body.textContent =
          'Custom box\nName: ' +
          (cb.name || '') +
          insExtra +
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
          '\n\nUse the floating Tools bar on the diagram for fill, outline, and name.';
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
      '\n\nDrag to move, corners to resize, double-click text to edit.';
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
    archSourcesDividersMigrateToUserLines();
    archUserLineRender();
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
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      archSelection.clear();
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
    }
  }

  /**
   * Double-click (Edit mode) selects a platform node, custom box, or connector.
   * archSelectionPanelSync enables Move / Labels via archEditorApplyModesForCurrentSelection.
   */
  function archDiagramDblClickSelect(e) {
    if (!archIsEditMode()) return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if (userLines.drawMode || customBoxDrawMode) return;
    if (e.target && e.target.closest && e.target.closest('.arch-diagram-ui')) return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle--cbox')) return;

    var ul = e.target.closest && e.target.closest('.arch-user-line, .arch-user-line-hit');
    if (ul && ul.getAttribute) {
      var lid = ul.getAttribute('data-user-line-id');
      if (lid) {
        userLines.selectedId = lid;
        userLines.selectedHandleIdx = null;
        archCustomBoxSelectedId = null;
        archCustomBoxLabelActiveId = null;
        if (archSelection) archSelection.clear();
        archCustomBoxesRender();
        archUserLineRender();
        archUserLineSyncPropsHud();
        archSelectionRefreshDom();
        if (liveRegion) liveRegion.textContent = 'Connector selected — Delete or Backspace removes it.';
        return;
      }
    }

    var g = e.target.closest && e.target.closest('g.arch-node');
    if (!g || !g.id || g.id.indexOf('node-') !== 0) return;

    if (g.classList.contains('arch-custom-box')) {
      var rawId = g.id.replace(/^node-cbox-/, '');
      if (!rawId) return;
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      archCustomBoxSelectedId = rawId;
      archCustomBoxLabelActiveId = null;
      if (archSelection) archSelection.clear();
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
      if (liveRegion) liveRegion.textContent = 'Shape selected — drag to move, handles to resize, Delete to remove.';
      return;
    }

    var key = g.id.slice(5);
    if (!NODE_LAYOUT[key]) return;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    if (e.shiftKey && archSelection) archSelection.toggle(g.id, true);
    else if (archSelection) archSelection.setSingle(g.id);
    archCustomBoxesRender();
    archUserLineRender();
    archUserLineSyncPropsHud();
    archSelectionRefreshDom();
    if (liveRegion) liveRegion.textContent = 'Tile selected — drag to move, corners to resize.';
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** Active diagram editor rail tab (layout | highlights | sources | spectrum-icons | file). */
  var archEditorActivePanelId = 'layout';

  /** Diagram edit tool: `lines` (sources), `select` (layout), or `none` (no active edit tool). Mirrors rail — use archSetActiveTool to switch. */
  var LS_ARCH_ACTIVE_TOOL = 'aepArchActiveTool';

  function archGetActiveTool() {
    if (archEditorActivePanelId === 'sources') return 'lines';
    if (archEditorActivePanelId === 'layout') return 'select';
    return 'none';
  }

  /** Switch to Lines tool (sources panel) or Select / canvas tools (any other panel). */
  function archSetActiveTool(tool) {
    if (tool === 'lines') {
      archEditorSetPanel('sources');
    } else {
      archEditorSetPanel('layout');
    }
  }

  /**
   * Icons / logos rail leaves the edit tool as `none`, so drag + resize are off.
   * After placing or pasting a custom box, switch to Tools (select) so Move and handles work immediately.
   */
  function archActivateCanvasAdjustAfterCustomBoxPlace() {
    if (!archIsEditMode()) return;
    archSetActiveTool('select');
    archSelectionPanelSync();
  }

  /** Hide left Lines dock chrome while Lines tab is active — connectors are edited from the floating bar. */
  function archEditorSyncLinesDockChrome() {
    var sec = qs('#archEditorSectionSources');
    if (!sec) return;
    var hideChrome = !!(archIsEditMode() && archEditorActivePanelId === 'sources');
    sec.classList.toggle('arch-editor-section--lines-float-active', hideChrome);
  }

  /** Floating Canvas Tools bar (shapes + selected custom box) — opens from rail Tools tab. */
  var archToolsFloatOpen = false;

  function archToolsFloatSyncLineOffsetClass() {
    if (!archViewport) return;
    var lineBar = qs('#archLineFloatBar');
    var lineVis = !!(lineBar && !lineBar.hidden && archIsEditMode());
    archViewport.classList.toggle('arch-int-viewport--tools-float-line-offset', lineVis);
  }

  function archToolsFloatSyncPosition() {
    archToolsFloatSyncLineOffsetClass();
  }

  function archToolsFloatSetOpen(on) {
    archToolsFloatOpen = !!on;
    var bar = qs('#archToolsFloatBar');
    if (bar) bar.hidden = !archToolsFloatOpen;
    if (archToolsFloatOpen) archToolsFloatSyncPosition();
    if (archViewport) archViewport.classList.toggle('arch-int-viewport--tools-float-open', archToolsFloatOpen);
  }

  function archToolsFloatToggle() {
    archToolsFloatSetOpen(!archToolsFloatOpen);
  }

  function archEditorClearNodeAndBoxSelection() {
    if (archSelection) archSelection.clear();
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    archSelectionRefreshDom();
    archCustomBoxesRender();
  }

  /** Switch diagram editor rail tab (layout | highlights | sources | spectrum-icons | file | none). */
  function archEditorSetPanel(panelId) {
    var prev = archEditorActivePanelId;
    var valid = ['layout', 'highlights', 'sources', 'spectrum-icons', 'file'];
    archEditorActivePanelId = valid.indexOf(panelId) >= 0 ? panelId : null;
    try {
      localStorage.setItem(LS_ARCH_ACTIVE_TOOL, archGetActiveTool());
    } catch (e) {}
    var editorPanel = qs('#archEditorPanel');
    if (editorPanel) {
      /* Tools + Lines: floating bars only; no empty side column (same as layout rail). */
      editorPanel.classList.toggle(
        'arch-editor-panel--layout-float-only',
        archEditorActivePanelId === 'layout' || archEditorActivePanelId === 'sources'
      );
    }
    $all('.arch-editor-section').forEach(function (sec) {
      var match = !!archEditorActivePanelId && sec.getAttribute('data-arch-panel') === archEditorActivePanelId;
      sec.hidden = !match;
      sec.classList.toggle('is-active', match);
    });
    $all('.arch-editor-rail-btn').forEach(function (btn) {
      var match = !!archEditorActivePanelId && btn.getAttribute('data-arch-panel') === archEditorActivePanelId;
      btn.classList.toggle('is-active', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
    if (archEditorActivePanelId === 'spectrum-icons') {
      archSpectrumIconsPanelInit();
      archArchitectureLogosPanelInit();
    }
    archUserLineSyncDrawModeFromEditor();
    var selectToolOn = !!(archIsEditMode() && archGetActiveTool() === 'select');
    archDragSetEnabled(selectToolOn);
    archLabelSetEnabled(selectToolOn);
    if (archGetActiveTool() !== 'select') archEditorClearNodeAndBoxSelection();
    archEditorSyncLinesDockChrome();
    if (archEditorActivePanelId !== 'layout') {
      archToolsFloatSetOpen(false);
    } else if (prev !== 'layout') {
      archToolsFloatSetOpen(true);
    }
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
    var mainPresentationEl = qs('main.dashboard-main.app-page');

    function archIsPresentationFullscreen() {
      return !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
    }

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
      if (e.key === 'Escape' && archIsPresentationFullscreen()) {
        return;
      }
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
    var archEditModeWasOn = false;

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
      if (on && !archEditModeWasOn) {
        archEditorSetPanel(null);
      }
      var selectToolOn = !!(on && archGetActiveTool() === 'select');
      archDragSetEnabled(selectToolOn);
      archLabelSetEnabled(selectToolOn);
      if (!on) archToolsFloatSetOpen(false);
      archUserLineSyncDrawModeFromEditor();
      archEditorSyncLinesDockChrome();
      archSyncPlaybackNav();
      archSelectionPanelSync();
      archLineFloatUpdateVisibility();
      /** Re-sync connector handles: they only exist in edit mode; without a render they stay in the DOM when edit is turned off. */
      archUserLineRender();
      if (!on) archEditorClearNodeAndBoxSelection();
      archEditModeWasOn = on;
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
    archEditorSetPanel(null);

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
        if (!pid) return;
        var prev = archEditorActivePanelId;
        if (pid === prev) {
          archEditorSetPanel(null);
          archToolsFloatSetOpen(false);
          return;
        }
        archEditorSetPanel(pid);
        if (pid === 'layout') archToolsFloatSetOpen(true);
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

    var archPresentationFsBtn = qs('#archPresentationFullscreenBtn');
    function archPresentationFsSync() {
      var on = archIsPresentationFullscreen();
      if (mainPresentationEl) mainPresentationEl.classList.toggle('arch-main--presentation-fs', on);
      if (archPresentationFsBtn) {
        archPresentationFsBtn.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
        archPresentationFsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        archPresentationFsBtn.setAttribute(
          'title',
          on
            ? 'Leave fullscreen (or press Esc).'
            : 'Fill the screen with the diagram (hides site menu and page title). Press Esc to exit.'
        );
      }
    }
    function archEnterPresentationFs() {
      var el = mainPresentationEl;
      if (!el) return;
      var req =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;
      if (!req) return;
      var p = req.call(el);
      if (p && typeof p.catch === 'function') {
        p.catch(function () {});
      }
    }
    function archExitPresentationFs() {
      if (!archIsPresentationFullscreen()) return;
      var ex =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.webkitCancelFullScreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen;
      if (!ex) return;
      var p = ex.call(document);
      if (p && typeof p.catch === 'function') {
        p.catch(function () {});
      }
    }
    if (archPresentationFsBtn && mainPresentationEl) {
      archPresentationFsBtn.setAttribute('type', 'button');
      archPresentationFsBtn.setAttribute('aria-pressed', 'false');
      archPresentationFsBtn.addEventListener('click', function () {
        if (archIsPresentationFullscreen()) archExitPresentationFs();
        else archEnterPresentationFs();
      });
    }
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, archPresentationFsSync);
    });
    archPresentationFsSync();

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
    archUserLineSyncSourcesDividerLocals();
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
  /** Session + localStorage defaults for the Lines floating toolbar (new-line defaults). */
  var LS_LINE_TOOLBAR_DEFAULTS = 'aepArchLineToolbarDefaults';

  /** Legacy horizontal rules loaded from layout JSON; consumed into `userLines` at runtime (see archSourcesDividersMigrateToUserLines). */
  var archSourcesDividers = [];

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
    /** Selected vertex index on the active connector (0 .. n-1), or null. */
    selectedHandleIdx: null,
  };

  /** Dragging connector vertex handles (Edit mode). */
  var archUserLineEditDrag = {
    active: false,
    handleIndex: -1,
    lineId: '',
    pointerId: null,
    el: null,
  };

  /** Floating line toolbar defaults (also persisted under LS_LINE_TOOLBAR_DEFAULTS). */
  var lineDefaults = {
    strokeColorHex: '#308FFF',
    strokeWidth: 2,
    lineTool: 'arrow',
  };
  var freehandSession = null;
  /** Stroke width presets (px) — matches weight popover. */
  var ARCH_LINE_FLOAT_W_PRESETS = [1, 2, 3, 5, 8];

  /** Legacy swatch mount (e.g. dynamic panels): single default chip only — float bar uses Colour button + popover. */
  var ARCH_USER_LINE_PRESETS = [{ hex: '#308fff', label: 'Stroke' }];

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

  /** Parse #RGB or #RRGGBB → uppercase #RRGGBB; invalid → null. */
  function archLineHexParseStrict(str) {
    if (str == null || typeof str !== 'string') return null;
    var s = str.trim();
    if (!s) return null;
    if (s[0] !== '#') s = '#' + s;
    var body = s.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(body)) {
      return ('#' + body[0] + body[0] + body[1] + body[1] + body[2] + body[2]).toUpperCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(body)) {
      return ('#' + body.toUpperCase());
    }
    return null;
  }

  /** Fallback normalizer for legacy callers — returns valid #RRGGBB uppercase. */
  function archLineFloatNormalizeHex(h) {
    var p = archLineHexParseStrict(String(h || ''));
    return p || '#308FFF';
  }

  function archLineFloatGetHex() {
    return archLineFloatNormalizeHex(lineDefaults.strokeColorHex);
  }

  function archLineHexLuminance(hex7) {
    if (!hex7 || hex7.length !== 7 || hex7[0] !== '#') return 0;
    var r = parseInt(hex7.slice(1, 3), 16) / 255;
    var g = parseInt(hex7.slice(3, 5), 16) / 255;
    var b = parseInt(hex7.slice(5, 7), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function archLineDefaultsLoad() {
    try {
      var raw = localStorage.getItem(LS_LINE_TOOLBAR_DEFAULTS);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      if (typeof o.strokeColorHex === 'string') {
        var c = archLineHexParseStrict(o.strokeColorHex);
        if (c) lineDefaults.strokeColorHex = c;
      }
      if (o.strokeWidth != null) {
        var sw = archLineFloatNearestPresetW(Number(o.strokeWidth));
        lineDefaults.strokeWidth = sw;
      }
      if (typeof o.lineTool === 'string' && o.lineTool) lineDefaults.lineTool = o.lineTool;
      if (lineDefaults.lineTool === 'divider') {
        lineDefaults.lineTool = 'arrow';
        archLineDefaultsSave();
      }
    } catch (e) {}
  }

  function archLineDefaultsSave() {
    try {
      localStorage.setItem(
        LS_LINE_TOOLBAR_DEFAULTS,
        JSON.stringify({
          strokeColorHex: lineDefaults.strokeColorHex,
          strokeWidth: lineDefaults.strokeWidth,
          lineTool: lineDefaults.lineTool,
        })
      );
    } catch (e) {}
  }

  function archLineFloatNearestPresetW(w) {
    var x = Number(w);
    if (isNaN(x) || x <= 0) return 2;
    var best = ARCH_LINE_FLOAT_W_PRESETS[0];
    var bd = Infinity;
    for (var wi = 0; wi < ARCH_LINE_FLOAT_W_PRESETS.length; wi++) {
      var p = ARCH_LINE_FLOAT_W_PRESETS[wi];
      var d = Math.abs(p - x);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  function archLineFloatGetStrokeW() {
    var w = Number(lineDefaults.strokeWidth);
    if (isNaN(w) || w <= 0) return 2;
    return archClamp(archLineFloatNearestPresetW(w), 1, 8);
  }

  function archLineFloatGetTool() {
    return lineDefaults.lineTool || 'arrow';
  }

  function archLineFloatSetTool(t) {
    lineDefaults.lineTool = t || 'arrow';
    if (lineDefaults.lineTool === 'junction') {
      archUserLineClearPending();
      archUserLineRemoveDrawListeners();
      if (archViewport) archViewport.classList.remove('arch-user-line-draw-pending');
    }
    archLineDefaultsSave();
    var bar = qs('#archLineFloatBar');
    if (bar) {
      $all('.arch-line-float-tool', bar).forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-arch-line-tool') === lineDefaults.lineTool);
      });
    }
  }

  function archLineFloatSetW(w) {
    lineDefaults.strokeWidth = archLineFloatNearestPresetW(w);
    archLineDefaultsSave();
    var bar = qs('#archLineFloatBar');
    var label = qs('#archLineFloatWLabel');
    var tbar = qs('#archLineFloatWTriggerBar');
    if (label) label.textContent = lineDefaults.strokeWidth + 'px';
    if (tbar) {
      var vis = Math.min(8, Math.max(1, lineDefaults.strokeWidth));
      tbar.style.height = vis + 'px';
    }
    if (bar) {
      $all('.arch-line-float-w-option', bar).forEach(function (b) {
        var bw = parseFloat(b.getAttribute('data-arch-line-w'), 10);
        var on = bw === lineDefaults.strokeWidth;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
  }

  function archLineFloatWeightMenuClose() {
    var menu = qs('#archLineFloatWMenu');
    var tr = qs('#archLineFloatWTrigger');
    if (menu) menu.hidden = true;
    if (tr) tr.setAttribute('aria-expanded', 'false');
  }

  function archLineFloatWeightMenuOpen() {
    archLineFloatColorPopoverClose();
    var menu = qs('#archLineFloatWMenu');
    var tr = qs('#archLineFloatWTrigger');
    if (menu) menu.hidden = false;
    if (tr) tr.setAttribute('aria-expanded', 'true');
  }

  function archLineFloatWeightMenuToggle() {
    var menu = qs('#archLineFloatWMenu');
    if (!menu) return;
    if (menu.hidden) archLineFloatWeightMenuOpen();
    else archLineFloatWeightMenuClose();
  }

  function archLineFloatWeightMenuDocDown(e) {
    var wrap = qs('#archLineFloatWWrap');
    var menu = qs('#archLineFloatWMenu');
    if (!wrap || !menu || menu.hidden) return;
    if (wrap.contains(e.target)) return;
    archLineFloatWeightMenuClose();
  }

  function archLineFloatWeightMenuEscape(e) {
    if (e.key !== 'Escape') return;
    var cpop = qs('#archLineFloatColorPopover');
    if (cpop && !cpop.hidden) {
      archLineFloatColorPopoverClose();
      e.preventDefault();
      return;
    }
    var menu = qs('#archLineFloatWMenu');
    if (menu && !menu.hidden) archLineFloatWeightMenuClose();
  }

  function archLineFloatColorPopoverClose() {
    var pop = qs('#archLineFloatColorPopover');
    var btn = qs('#archLineFloatColorBtn');
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    var err = qs('#archLineFloatColorHexErr');
    if (err) err.hidden = true;
  }

  function archLineFloatColorPopoverOpen() {
    var pop = qs('#archLineFloatColorPopover');
    var btn = qs('#archLineFloatColorBtn');
    if (!pop || !btn) return;
    archLineFloatWeightMenuClose();
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    archLineFloatSyncColorPopoverInputs();
  }

  function archLineFloatColorPopoverToggle() {
    var pop = qs('#archLineFloatColorPopover');
    if (!pop) return;
    if (pop.hidden) archLineFloatColorPopoverOpen();
    else archLineFloatColorPopoverClose();
  }

  function archLineFloatSyncColorPopoverInputs() {
    var hx = archLineFloatGetHex();
    var pick = qs('#archLineFloatColorPicker');
    var txt = qs('#archLineFloatColorHexInput');
    if (pick) {
      try {
        pick.value = hx.toLowerCase();
      } catch (e1) {}
    }
    if (txt && document.activeElement !== txt) txt.value = hx;
    var err = qs('#archLineFloatColorHexErr');
    if (err && document.activeElement !== txt) err.hidden = true;
  }

  function archLineFloatSyncColorButtonUi() {
    var btn = qs('#archLineFloatColorBtn');
    if (!btn) return;
    var hx = archLineFloatGetHex();
    btn.style.backgroundColor = hx;
    btn.setAttribute('data-current-hex', hx);
    btn.classList.toggle('arch-line-float-color-btn--light', archLineHexLuminance(hx) > 0.92);
    btn.classList.remove('arch-line-float-color-btn--mixed');
  }

  function archLineFloatFloatMenusDocDown(e) {
    archLineFloatWeightMenuDocDown(e);
    var cwrap = qs('#archLineFloatColorWrap');
    var cpop = qs('#archLineFloatColorPopover');
    if (!cwrap || !cpop || cpop.hidden) return;
    if (cwrap.contains(e.target)) return;
    archLineFloatColorPopoverClose();
  }

  function archLineFloatSetHex(hex) {
    var n = archLineHexParseStrict(String(hex || ''));
    if (!n) n = '#308FFF';
    lineDefaults.strokeColorHex = n;
    archLineDefaultsSave();
    var bar = qs('#archLineFloatBar');
    if (bar) {
      try {
        bar.style.setProperty('--arch-line-float-stroke', n);
      } catch (e3) {}
    }
    archLineFloatSyncColorButtonUi();
    archLineFloatSyncColorPopoverInputs();
  }

  function archLineFloatSyncFromLine(ln) {
    if (!ln) return;
    archLineFloatSetHex(ln.stroke || '#308fff');
    archLineFloatSetW(ln.strokeWidth != null ? ln.strokeWidth : 2);
    if (archLineFloatGetTool() === 'junction') return;
    if (archUserLineIsFreehandLine(ln)) archLineFloatSetTool('freehand');
    else if (ln.dashStyle === 'dotted') archLineFloatSetTool('dotted');
    else {
      var la = archUserLineGetLineArrows(ln);
      if (la === 'both') archLineFloatSetTool('doubleArrow');
      else if (la === 'none') archLineFloatSetTool('plain');
      else archLineFloatSetTool('arrow');
    }
  }

  function archLineFloatApplySelectedFromBar() {
    var ln = archUserLineGetSelected();
    if (!ln) return;
    ln.stroke = archLineFloatGetHex();
    ln.strokeWidth = archLineFloatGetStrokeW();
    if (archUserLineIsFreehandLine(ln)) {
      archUserLineRender();
      archUserLinePersist();
      archUndoMaybePushSnapshot();
      return;
    }
    var t = lineDefaults.lineTool;
    if (t === 'junction') {
      archUserLineRender();
      archUserLinePersist();
      archUndoMaybePushSnapshot();
      return;
    }
    if (t !== 'divider' && t !== 'freehand') {
      if (t === 'dotted') ln.dashStyle = 'dotted';
      else ln.dashStyle = 'solid';
      if (t === 'doubleArrow') ln.lineArrows = 'both';
      else if (t === 'plain') ln.lineArrows = 'none';
      else if (t === 'arrow' || t === 'dotted') ln.lineArrows = 'end';
      ln.bidirectional = ln.lineArrows === 'both';
    }
    archUserLineRender();
    archUserLinePersist();
    archUndoMaybePushSnapshot();
  }

  function archLineFloatUpdateVisibility() {
    var bar = qs('#archLineFloatBar');
    if (!bar) return;
    /** Floating bar when Edit mode + Lines tool (sources rail) + line draw; visibility uses #archLineFloatBar[hidden] + CSS. */
    var show = archIsEditMode() && userLines.drawMode;
    bar.hidden = !show;
    var del = qs('#archLineFloatDelete');
    if (del) del.disabled = !show || !userLines.selectedId;
    if (!show) {
      archLineFloatWeightMenuClose();
      archLineFloatColorPopoverClose();
      freehandSession = null;
      var pv = qs('#archUserLineFreehandPreview');
      if (pv) {
        pv.setAttribute('d', '');
        pv.setAttribute('opacity', '0');
      }
    }
    archToolsFloatSyncLineOffsetClass();
  }

  function archUserFreehandPointerMove(e) {
    if (!freehandSession || !archDrag.svg) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var pts = freehandSession.points;
    var last = pts[pts.length - 1];
    var dx = p.x - last[0];
    var dy = p.y - last[1];
    if (dx * dx + dy * dy < 16) return;
    pts.push([p.x, p.y]);
    var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      d += ' L ' + pts[i][0] + ' ' + pts[i][1];
    }
    var pv = qs('#archUserLineFreehandPreview');
    if (pv) {
      pv.setAttribute('d', d);
      pv.setAttribute('stroke', archLineFloatGetHex());
      pv.setAttribute('stroke-width', String(archLineFloatGetStrokeW()));
      pv.setAttribute('opacity', '0.9');
    }
  }

  function archUserFreehandPointerUp() {
    window.removeEventListener('pointermove', archUserFreehandPointerMove, true);
    window.removeEventListener('pointerup', archUserFreehandPointerUp, true);
    window.removeEventListener('pointercancel', archUserFreehandPointerUp, true);
    if (!freehandSession) return;
    var pts = freehandSession.points;
    freehandSession = null;
    var pv = qs('#archUserLineFreehandPreview');
    if (pv) {
      pv.setAttribute('d', '');
      pv.setAttribute('opacity', '0');
    }
    if (pts.length < 2) return;
    var id = 'ul-' + Date.now();
    userLines.lines.push({
      id: id,
      points: pts,
      stroke: archLineFloatGetHex(),
      strokeWidth: archLineFloatGetStrokeW(),
      dashStyle: 'solid',
      bidirectional: false,
    });
    userLines.selectedId = id;
    userLines.selectedHandleIdx = null;
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    archCustomBoxesRender();
    archUserLineRender();
    archUserLinePersist();
    archUserLineSyncPropsHud();
    archUndoMaybePushSnapshot();
  }

  function archUserFreehandPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!archDrag.svg) return;
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    freehandSession = { points: [[p.x, p.y]] };
    e.preventDefault();
    window.addEventListener('pointermove', archUserFreehandPointerMove, true);
    window.addEventListener('pointerup', archUserFreehandPointerUp, true);
    window.addEventListener('pointercancel', archUserFreehandPointerUp, true);
  }

  function archLineFloatInit() {
    var bar = qs('#archLineFloatBar');
    if (!bar || bar.getAttribute('data-arch-float-init') === '1') return;
    bar.setAttribute('data-arch-float-init', '1');
    archLineDefaultsLoad();
    archLineFloatSetTool(lineDefaults.lineTool);
    archLineFloatSetW(lineDefaults.strokeWidth);
    archLineFloatSetHex(lineDefaults.strokeColorHex);
    bar.addEventListener('click', function (e) {
      var tbtn = e.target.closest && e.target.closest('.arch-line-float-tool[data-arch-line-tool]');
      if (tbtn) {
        var nt = tbtn.getAttribute('data-arch-line-tool');
        archLineFloatSetTool(nt);
        if (userLines.selectedId && nt !== 'junction') {
          var ln0 = archUserLineGetSelected();
          archLineFloatApplySelectedFromBar();
          if (ln0) archLineFloatSyncFromLine(ln0);
        }
        return;
      }
      var wopt = e.target.closest && e.target.closest('.arch-line-float-w-option[data-arch-line-w]');
      if (wopt) {
        e.stopPropagation();
        archLineFloatSetW(parseFloat(wopt.getAttribute('data-arch-line-w'), 10));
        archLineFloatWeightMenuClose();
        if (userLines.selectedId) archLineFloatApplySelectedFromBar();
        return;
      }
    });
    var cBtn = qs('#archLineFloatColorBtn');
    if (cBtn && !cBtn.getAttribute('data-arch-cbtn')) {
      cBtn.setAttribute('data-arch-cbtn', '1');
      cBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        archLineFloatColorPopoverToggle();
      });
    }
    var wTrig = qs('#archLineFloatWTrigger');
    if (wTrig && !wTrig.getAttribute('data-arch-w-trig')) {
      wTrig.setAttribute('data-arch-w-trig', '1');
      wTrig.addEventListener('click', function (e) {
        e.stopPropagation();
        archLineFloatWeightMenuToggle();
      });
    }
    if (!bar.getAttribute('data-arch-w-doc')) {
      bar.setAttribute('data-arch-w-doc', '1');
      document.addEventListener('pointerdown', archLineFloatFloatMenusDocDown, true);
      window.addEventListener('keydown', archLineFloatWeightMenuEscape);
    }
    var pickInp = qs('#archLineFloatColorPicker');
    if (pickInp) {
      pickInp.addEventListener('input', function () {
        archLineFloatSetHex(pickInp.value);
        if (userLines.selectedId) archLineFloatApplySelectedFromBar();
      });
    }
    var hexTxt = qs('#archLineFloatColorHexInput');
    if (hexTxt) {
      function hexTextApply() {
        var v = hexTxt.value.trim();
        var err = qs('#archLineFloatColorHexErr');
        if (!v) {
          if (err) err.hidden = true;
          return;
        }
        var p = archLineHexParseStrict(v);
        if (p) {
          if (err) err.hidden = true;
          archLineFloatSetHex(p);
          if (userLines.selectedId) archLineFloatApplySelectedFromBar();
        } else {
          if (err) err.hidden = v.length < 4;
        }
      }
      hexTxt.addEventListener('input', hexTextApply);
      hexTxt.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          hexTextApply();
        }
      });
      hexTxt.addEventListener('blur', function () {
        var v = hexTxt.value.trim();
        var p = archLineHexParseStrict(v);
        var err = qs('#archLineFloatColorHexErr');
        if (!v) {
          archLineFloatSyncColorPopoverInputs();
          if (err) err.hidden = true;
          return;
        }
        if (p) {
          archLineFloatSetHex(p);
          if (userLines.selectedId) archLineFloatApplySelectedFromBar();
          if (err) err.hidden = true;
        } else {
          archLineFloatSyncColorPopoverInputs();
          if (err) err.hidden = false;
        }
      });
    }
    var u = qs('#archLineFloatUndo');
    if (u) {
      u.addEventListener('click', function () {
        archUndoRun();
      });
    }
    var del = qs('#archLineFloatDelete');
    if (del) {
      del.addEventListener('click', function () {
        archUserLineDeleteSelected();
      });
    }
    var cl = qs('#archLineFloatClose');
    if (cl) {
      cl.addEventListener('click', function () {
        archSetActiveTool('select');
      });
    }
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

  /** In-memory clipboard for Edit mode copy/paste (custom boxes + connectors). */
  var archDiagramClipboard = null;

  /** Vendored Apache-2.0 SVGs from @adobe/spectrum-css-workflow-icons (see npm run vendor:spectrum-icons). */
  var ARCH_SPECTRUM_ICON_PREFIX = 'vendor/spectrum-workflow-icons/';
  var archSpectrumIconsDataPromise = null;

  function archCustomBoxIsIconAsset(box) {
    if (!box) return false;
    var n = archCustomBoxNormalize(box);
    return (
      (n.kind === 'spectrumIcon' && n.iconFile) || (n.kind === 'productLogo' && n.logoFile)
    );
  }

  function archSpectrumIconsPanelInit() {
    var grid = qs('#archSpectrumIconGrid');
    var status = qs('#archSpectrumIconStatus');
    if (!grid || grid.getAttribute('data-arch-built') === '1') return;
    if (!archSpectrumIconsDataPromise) {
      archSpectrumIconsDataPromise = fetch('data/spectrum-workflow-icons.json').then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
    }
    archSpectrumIconsDataPromise
      .then(function (data) {
        if (!grid.parentNode) return;
        if (!data || !Array.isArray(data.icons)) return;
        grid.textContent = '';
        var base = ARCH_SPECTRUM_ICON_PREFIX;
        data.icons.forEach(function (item) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'arch-spectrum-icons-tile arch-diagram-ui';
          btn.setAttribute('role', 'option');
          btn.setAttribute('data-arch-spectrum-file', item.file);
          btn.setAttribute('data-arch-spectrum-label', item.label || item.file);
          btn.title = item.label || item.file;
          var wrap = document.createElement('span');
          wrap.className = 'arch-spectrum-icons-tile-img-wrap';
          var im = document.createElement('img');
          im.src = base + item.file;
          im.alt = '';
          im.loading = 'lazy';
          im.width = 20;
          im.height = 20;
          wrap.appendChild(im);
          var cap = document.createElement('span');
          cap.className = 'arch-spectrum-icons-tile-cap';
          cap.textContent = item.label || item.file;
          btn.appendChild(wrap);
          btn.appendChild(cap);
          grid.appendChild(btn);
        });
        grid.setAttribute('data-arch-built', '1');
        var qinp = qs('#archSpectrumIconSearch');
        archSpectrumIconsApplyFilter(qinp ? qinp.value : '');
        if (status) status.textContent = data.icons.length + ' icons — use search to filter.';
      })
      .catch(function () {
        if (status) {
          status.textContent =
            'Could not load icon list. From the repo run npm run vendor:spectrum-icons, then redeploy.';
        }
      });
  }

  function archSpectrumIconsApplyFilter(q) {
    var grid = qs('#archSpectrumIconGrid');
    if (!grid || grid.getAttribute('data-arch-built') !== '1') return;
    var needle = (q || '').trim().toLowerCase();
    var tiles = grid.querySelectorAll('.arch-spectrum-icons-tile');
    var n = 0;
    for (var i = 0; i < tiles.length; i++) {
      var btn = tiles[i];
      var lab =
        (btn.getAttribute('data-arch-spectrum-label') || '') + ' ' + (btn.getAttribute('data-arch-spectrum-file') || '');
      var show = !needle || lab.toLowerCase().indexOf(needle) >= 0;
      btn.hidden = !show;
      if (show) n++;
    }
    var status = qs('#archSpectrumIconStatus');
    if (status) status.textContent = n + ' shown' + (needle ? ' (filtered)' : '') + '.';
  }

  /** Core Adobe marks + Express pack → Adobe Logos section (paths match architecture-logos.json). */
  var ARCH_ADOBE_LOGO_FILES = [
    'images/adobe-experience-platform-logo-tags.png',
    'images/adobe-logo-spectrum-site.svg',
    'images/adobe-brand-mark.png',
    'images/creative-cloud-app-icon.png',
  ];

  /** Phase 1: optional `tags` on each catalog entry — filter chips per grid (see architecture-logos.json). */
  var ARCH_LOGO_TAG_CHIPS_ADOBE = [
    { id: '', label: 'All' },
    { id: 'adobe-catalog', label: 'Catalog' },
    { id: 'experience-cloud', label: 'Experience Cloud' },
    { id: 'adobe-core', label: 'Core marks' },
  ];

  var ARCH_LOGO_TAG_CHIPS_OTHER = [
    { id: '', label: 'All' },
    { id: 'data-collection', label: 'Data collection' },
    { id: 'profile-audiences', label: 'Profile & audiences' },
    { id: 'journeys', label: 'Journeys' },
    { id: 'diagram-reference', label: 'Diagram assets' },
    { id: 'presentation-icons', label: 'Presentation & UI icons' },
    { id: 'ecosystem-data', label: 'Ecosystem · data' },
    { id: 'ecosystem-analytics', label: 'Ecosystem · analytics' },
    { id: 'ecosystem-activation', label: 'Ecosystem · activation' },
    { id: 'partner', label: 'Partner' },
  ];

  function archArchitectureLogoIsAdobeSection(item) {
    var f = (item && item.file) || '';
    if (f.indexOf('corporate-express-product-logos') >= 0) return true;
    return ARCH_ADOBE_LOGO_FILES.indexOf(f) >= 0;
  }

  /** Populate one logo grid from catalog items (shared tile markup). */
  function archRenderArchitectureLogoTiles(grid, items) {
    if (!grid) return;
    grid.textContent = '';
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'arch-spectrum-icons-tile arch-diagram-ui arch-architecture-logo-tile';
      btn.setAttribute('role', 'option');
      btn.setAttribute('data-arch-logo-file', item.file);
      btn.setAttribute('data-arch-logo-label', item.label || item.file);
      btn.setAttribute('data-arch-logo-desc', item.description || '');
      var tagList = Array.isArray(item.tags) ? item.tags.filter(function (t) { return t; }) : [];
      btn.setAttribute('data-arch-logo-tags', tagList.join(' '));
      var hover = (item.label || '') + (item.description ? ' — ' + item.description : '');
      btn.title = hover || item.file;
      var wrap = document.createElement('span');
      wrap.className = 'arch-spectrum-icons-tile-img-wrap';
      var im = document.createElement('img');
      im.src = item.file;
      im.alt = '';
      im.loading = 'lazy';
      im.width = 32;
      im.height = 32;
      wrap.appendChild(im);
      var cap = document.createElement('span');
      cap.className = 'arch-spectrum-icons-tile-cap';
      cap.textContent = item.label || item.file;
      btn.appendChild(wrap);
      btn.appendChild(cap);
      grid.appendChild(btn);
    });
  }

  function archArchitectureLogosPanelInit() {
    var gridAdobe = qs('#archAdobeLogoGrid');
    var gridOther = qs('#archArchitectureLogoGrid');
    var stAdobe = qs('#archAdobeLogoStatus');
    var stOther = qs('#archArchitectureLogoStatus');
    if (!gridAdobe || !gridOther) return;
    /* Fresh fetch each time (avoids stale CDN/browser cache after JSON updates). */
    fetch('data/architecture-logos.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (data) {
        if (!gridOther.parentNode) return;
        if (!data || !Array.isArray(data.logos)) return;
        var adobe = [];
        var other = [];
        data.logos.forEach(function (item) {
          if (archArchitectureLogoIsAdobeSection(item)) adobe.push(item);
          else other.push(item);
        });
        adobe.sort(function (a, b) {
          var fa = (a && a.file) || '';
          var fb = (b && b.file) || '';
          var ia = ARCH_ADOBE_LOGO_FILES.indexOf(fa);
          var ib = ARCH_ADOBE_LOGO_FILES.indexOf(fb);
          if (ia >= 0 && ib >= 0) return ia - ib;
          if (ia >= 0) return -1;
          if (ib >= 0) return 1;
          var na = parseInt((fa.match(/image(\d+)\.png/i) || [])[1] || '0', 10);
          var nb = parseInt((fb.match(/image(\d+)\.png/i) || [])[1] || '0', 10);
          return na - nb;
        });
        archRenderArchitectureLogoTiles(gridAdobe, adobe);
        archRenderArchitectureLogoTiles(gridOther, other);
        gridAdobe.setAttribute('data-arch-built', '1');
        gridOther.setAttribute('data-arch-built', '1');
        gridAdobe.setAttribute('data-arch-active-tag', '');
        gridOther.setAttribute('data-arch-active-tag', '');
        var qA = qs('#archAdobeLogoSearch');
        var qO = qs('#archArchitectureLogoSearch');
        archArchitectureLogoTagBarInit(qs('#archAdobeLogoTagRow'), gridAdobe, stAdobe, qA, ARCH_LOGO_TAG_CHIPS_ADOBE);
        archArchitectureLogoTagBarInit(qs('#archOtherLogoTagRow'), gridOther, stOther, qO, ARCH_LOGO_TAG_CHIPS_OTHER);
        archArchitectureLogosApplyFilter(gridAdobe, stAdobe, qA ? qA.value : '');
        archArchitectureLogosApplyFilter(gridOther, stOther, qO ? qO.value : '');
      })
      .catch(function () {
        var msg = 'Could not load architecture logo list. Ensure data/architecture-logos.json is deployed.';
        if (stAdobe) stAdobe.textContent = msg;
        if (stOther) stOther.textContent = msg;
      });
  }

  function archArchitectureLogoTagBarInit(container, grid, statusEl, searchInput, defs) {
    if (!container || !grid || !Array.isArray(defs)) return;
    container.textContent = '';
    grid.setAttribute('data-arch-active-tag', '');
    defs.forEach(function (def, idx) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'arch-logo-tag-chip arch-diagram-ui';
      chip.setAttribute('data-arch-tag-id', def.id);
      chip.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      chip.setAttribute('aria-label', 'Filter: ' + (def.label || 'All'));
      chip.textContent = def.label || 'All';
      chip.addEventListener('click', function () {
        var id = def.id || '';
        grid.setAttribute('data-arch-active-tag', id);
        container.querySelectorAll('.arch-logo-tag-chip').forEach(function (c) {
          c.setAttribute('aria-pressed', c.getAttribute('data-arch-tag-id') === id ? 'true' : 'false');
        });
        archArchitectureLogosApplyFilter(grid, statusEl, searchInput ? searchInput.value : '');
      });
      container.appendChild(chip);
    });
  }

  function archArchitectureLogosApplyFilter(grid, statusEl, q) {
    if (!grid || grid.getAttribute('data-arch-built') !== '1') return;
    var needle = (q || '').trim().toLowerCase();
    var activeTag = (grid.getAttribute('data-arch-active-tag') || '').trim();
    var tiles = grid.querySelectorAll('.arch-architecture-logo-tile');
    var n = 0;
    for (var i = 0; i < tiles.length; i++) {
      var btn = tiles[i];
      var lab =
        (btn.getAttribute('data-arch-logo-label') || '') +
        ' ' +
        (btn.getAttribute('data-arch-logo-file') || '') +
        ' ' +
        (btn.getAttribute('data-arch-logo-desc') || '');
      var tagsStr = btn.getAttribute('data-arch-logo-tags') || '';
      var tagOk =
        !activeTag ||
        (tagsStr &&
          tagsStr.split(/\s+/).filter(function (t) {
            return t;
          }).indexOf(activeTag) >= 0);
      var textOk = !needle || lab.toLowerCase().indexOf(needle) >= 0;
      var show = tagOk && textOk;
      btn.hidden = !show;
      if (show) n++;
    }
    var filtered = !!(activeTag || needle);
    if (statusEl) statusEl.textContent = n + ' shown' + (filtered ? ' (filtered)' : '') + '.';
  }

  function archProductLogoPlace(file, label, description) {
    if (!archIsEditMode() || !archDrag.svg) return;
    if (!file) return;
    var n = archCustomBoxes.length;
    var defaultSize = 48;
    var x = 380 + (n % 10) * 24;
    var y = 180 + (n % 8) * 24;
    x = archClamp(x, 0, ARCH_GUIDE_VIEW.w - defaultSize);
    y = archClamp(y, 0, ARCH_GUIDE_VIEW.h - defaultSize);
    var nb = archCustomBoxNormalize({
      id: 'cbox-' + Date.now(),
      x: x,
      y: y,
      w: defaultSize,
      h: defaultSize,
      name: label || file.replace(/^.*\//, ''),
      kind: 'productLogo',
      logoFile: file,
      logoDescription: description || '',
      fill: 'none',
      stroke: 'transparent',
    });
    archCustomBoxes.push(nb);
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
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
    archActivateCanvasAdjustAfterCustomBoxPlace();
    if (liveRegion) liveRegion.textContent = 'Added logo: ' + (label || file) + '.';
  }

  function archSpectrumIconPlace(file, label) {
    if (!archIsEditMode() || !archDrag.svg) return;
    if (!file) return;
    var n = archCustomBoxes.length;
    var defaultSize = 40;
    var x = 360 + (n % 10) * 24;
    var y = 160 + (n % 8) * 24;
    x = archClamp(x, 0, ARCH_GUIDE_VIEW.w - defaultSize);
    y = archClamp(y, 0, ARCH_GUIDE_VIEW.h - defaultSize);
    var nb = archCustomBoxNormalize({
      id: 'cbox-' + Date.now(),
      x: x,
      y: y,
      w: defaultSize,
      h: defaultSize,
      name: label || file.replace(/\.svg$/i, ''),
      kind: 'spectrumIcon',
      iconFile: file,
      fill: 'none',
      stroke: 'transparent',
    });
    archCustomBoxes.push(nb);
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
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
    archActivateCanvasAdjustAfterCustomBoxPlace();
    if (liveRegion) liveRegion.textContent = 'Added Spectrum icon: ' + (label || file) + '.';
  }

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
    o.kind = null;
    o.iconFile = '';
    o.logoFile = '';
    o.logoDescription =
      typeof b.logoDescription === 'string' && b.logoDescription.trim() ? b.logoDescription.trim() : '';
    if (b && b.kind === 'spectrumIcon' && typeof b.iconFile === 'string' && b.iconFile) {
      o.kind = 'spectrumIcon';
      o.iconFile = b.iconFile;
    } else if (b && b.kind === 'productLogo' && typeof b.logoFile === 'string' && b.logoFile) {
      o.kind = 'productLogo';
      o.logoFile = b.logoFile;
    }
    if (o.kind === 'spectrumIcon' && !o.iconFile) o.kind = null;
    if (o.kind === 'productLogo' && !o.logoFile) o.kind = null;
    if (o.kind === 'spectrumIcon' || o.kind === 'productLogo') {
      o.fill = typeof b.fill === 'string' && b.fill ? b.fill : 'none';
      o.stroke = typeof b.stroke === 'string' && b.stroke ? b.stroke : 'transparent';
    }
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

  /** Min half-width (px) for invisible stroke hit-testing along connector paths. */
  var USER_LINE_HIT_STROKE_MIN = 12;

  /** Max distance (SVG user units) from click to segment for double-click insert. */
  var USER_LINE_INSERT_MAX_DIST = 14;

  /** Min distance (px) from an insert point to existing segment endpoints — avoids duplicate vertices. */
  var USER_LINE_INSERT_MIN_FROM_VERTEX = 6;

  /** Interior bend drag: 45° snap from previous vertex when Shift held; Alt uses next vertex as origin. */
  var ARCH_BEND_SNAP_RAD = Math.PI / 4;

  function archUserLineClosestPointOnSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 < 1e-12 ? 0 : archClamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    var x = x1 + t * dx;
    var y = y1 + t * dy;
    return { x: x, y: y, t: t, dist: Math.hypot(px - x, py - y) };
  }

  /** Freehand sketch paths: `points` only, no anchor endpoints. */
  function archUserLineIsFreehandLine(ln) {
    return !!(ln && ln.points && ln.points.length >= 2 && !ln.from && !ln.to);
  }

  /** Anchored two-click connectors (with optional bend vertex). */
  function archUserLineIsConnector(ln) {
    return !!(ln && ln.from && ln.to);
  }

  /** Normalize a stored point to `{ x, y }` (connector / paste). */
  function archUserLinePointXY(pt) {
    if (!pt) return { x: 0, y: 0 };
    if (typeof pt.x === 'number' && typeof pt.y === 'number') return { x: pt.x, y: pt.y };
    if (Array.isArray(pt) && pt.length >= 2) return { x: Number(pt[0]) || 0, y: Number(pt[1]) || 0 };
    return { x: 0, y: 0 };
  }

  /**
   * Snap (x,y) so the ray from (ox,oy) keeps length r but angle snaps to stepRad multiples.
   * When disableSnap, returns the raw target.
   */
  function archSnapRadialFromOrigin(ox, oy, tx, ty, stepRad, disableSnap) {
    var dx = tx - ox;
    var dy = ty - oy;
    var r = Math.hypot(dx, dy);
    if (r < 0.5) return { x: ox, y: oy };
    if (disableSnap) return { x: tx, y: ty };
    var ang = Math.atan2(dy, dx);
    var snapped = Math.round(ang / stepRad) * stepRad;
    return { x: ox + r * Math.cos(snapped), y: oy + r * Math.sin(snapped) };
  }

  /** Keep first/last polyline vertices aligned with anchored endpoints (world space). */
  function archUserLineConnectorSyncEndpoints(ln) {
    if (!archUserLineIsConnector(ln) || !ln.points || ln.points.length < 2) return;
    var p0 = archUserLinePointFromEndpoint(ln.from);
    var pN = archUserLinePointFromEndpoint(ln.to);
    if (!p0 || !pN) return;
    ln.points[0] = { x: p0.x, y: p0.y };
    ln.points[ln.points.length - 1] = { x: pN.x, y: pN.y };
  }

  /** Double-click: insert a vertex on the nearest segment; returns new index or -1. */
  function archUserLineInsertBendNear(ln, wx, wy) {
    if (!archUserLineIsConnector(ln)) return -1;
    archUserLineConnectorSyncEndpoints(ln);
    var pts = ln.points;
    if (!pts || pts.length < 2) return -1;
    var bestI = -1;
    var bestD = Infinity;
    var bestProj = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = archUserLinePointXY(pts[i]);
      var b = archUserLinePointXY(pts[i + 1]);
      var c = archUserLineClosestPointOnSeg(wx, wy, a.x, a.y, b.x, b.y);
      if (c.dist < bestD) {
        bestD = c.dist;
        bestI = i;
        bestProj = { x: c.x, y: c.y };
      }
    }
    if (bestI < 0 || !bestProj || bestD > USER_LINE_INSERT_MAX_DIST) return -1;
    var aIns = archUserLinePointXY(pts[bestI]);
    var bIns = archUserLinePointXY(pts[bestI + 1]);
    var dFromA = Math.hypot(bestProj.x - aIns.x, bestProj.y - aIns.y);
    var dFromB = Math.hypot(bestProj.x - bIns.x, bestProj.y - bIns.y);
    if (dFromA < USER_LINE_INSERT_MIN_FROM_VERTEX || dFromB < USER_LINE_INSERT_MIN_FROM_VERTEX) return -1;
    pts.splice(bestI + 1, 0, { x: bestProj.x, y: bestProj.y });
    return bestI + 1;
  }

  /** Inserts a bend on `ln` at clientX/clientY; updates selection handle and persists. Returns true if inserted. */
  function archUserLineTryInsertBendAtClient(ln, clientX, clientY) {
    if (!ln || !archUserLineIsConnector(ln) || !archDrag.svg) return false;
    var p = svgClientToSvg(archDrag.svg, clientX, clientY);
    var ni = archUserLineInsertBendNear(ln, p.x, p.y);
    if (ni < 0) {
      archUserLineRender();
      return false;
    }
    if (ln.sourcesDividerLocal) delete ln.sourcesDividerLocal;
    userLines.selectedHandleIdx = ni;
    archUserLinePersist();
    archUndoMaybePushSnapshot();
    archUserLineRender();
    if (liveRegion) {
      liveRegion.textContent = 'Corner point added — drag to bend (hold Shift for 45° snaps).';
    }
    return true;
  }

  function archUserLinePathDFromLine(ln) {
    if (archUserLineIsFreehandLine(ln)) {
      var pts = ln.points;
      var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
      for (var pi = 1; pi < pts.length; pi++) {
        d += ' L ' + pts[pi][0] + ' ' + pts[pi][1];
      }
      return { d: d, kind: 'freehand' };
    }
    if (archUserLineIsConnector(ln)) {
      archUserLineConnectorSyncEndpoints(ln);
      var pp = ln.points;
      if (!pp || pp.length < 2) return null;
      var p0 = archUserLinePointXY(pp[0]);
      var d2 = 'M ' + p0.x + ' ' + p0.y;
      for (var pj = 1; pj < pp.length; pj++) {
        var pjxy = archUserLinePointXY(pp[pj]);
        d2 += ' L ' + pjxy.x + ' ' + pjxy.y;
      }
      return { d: d2, kind: 'connector' };
    }
    return null;
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

  /**
   * Straight connectors only: `none` | `end` | `both`. Polylines return null.
   * Legacy lines without `lineArrows` infer from `bidirectional`.
   */
  function archUserLineGetLineArrows(ln) {
    if (!ln) return 'end';
    if (archUserLineIsFreehandLine(ln)) return null;
    var la = ln.lineArrows;
    if (la === 'none' || la === 'end' || la === 'both') return la;
    return ln.bidirectional ? 'both' : 'end';
  }

  function archSourcesDividerLocalPreserveInto(fromLn, toLn) {
    if (!fromLn || !toLn || !fromLn.sourcesDividerLocal || typeof fromLn.sourcesDividerLocal !== 'object') return;
    var loc = fromLn.sourcesDividerLocal;
    toLn.sourcesDividerLocal = {
      x1: Number(loc.x1),
      x2: Number(loc.x2),
      y: Number(loc.y),
    };
  }

  function archUserLineMigrateLegacy(ln) {
    if (!ln) return ln;
    if (ln.points && Array.isArray(ln.points) && ln.points.length >= 2 && !ln.from && !ln.to) {
      var poly = Object.assign({}, ln);
      poly.points = ln.points.map(function (pt) {
        return [Number(pt && pt[0]) || 0, Number(pt && pt[1]) || 0];
      });
      if (!poly.dashStyle) poly.dashStyle = 'solid';
      delete poly.d;
      return poly;
    }
    if (ln.from && ln.to) {
      var c = Object.assign({}, ln);
      delete c.d;
      delete c.bend;
      if (!c.dashStyle) c.dashStyle = 'solid';
      if (c.lineArrows !== 'none' && c.lineArrows !== 'end' && c.lineArrows !== 'both') {
        c.lineArrows = c.bidirectional ? 'both' : 'end';
      }
      c.bidirectional = c.lineArrows === 'both';
      var a = archUserLinePointFromEndpoint(c.from);
      var b = archUserLinePointFromEndpoint(c.to);
      if (c.points && Array.isArray(c.points) && c.points.length >= 2) {
        c.points = c.points.map(archUserLinePointXY);
        archUserLineConnectorSyncEndpoints(c);
        if (c.points.length > 2) {
          delete c.sourcesDividerLocal;
        } else {
          archSourcesDividerLocalPreserveInto(ln, c);
        }
        return c;
      }
      if (a && b) {
        if (ln.bend && typeof ln.bend.x === 'number' && typeof ln.bend.y === 'number') {
          c.points = [{ x: a.x, y: a.y }, { x: ln.bend.x, y: ln.bend.y }, { x: b.x, y: b.y }];
        } else {
          c.points = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
        }
      } else {
        c.points = [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ];
      }
      if (c.points.length > 2) {
        delete c.sourcesDividerLocal;
      } else {
        archSourcesDividerLocalPreserveInto(ln, c);
      }
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
    if (!out.dashStyle) out.dashStyle = 'solid';
    if (out.lineArrows !== 'none' && out.lineArrows !== 'end' && out.lineArrows !== 'both') {
      out.lineArrows = out.bidirectional ? 'both' : 'end';
    }
    out.bidirectional = out.lineArrows === 'both';
    delete out.bend;
    if (out.from && out.to) {
      var ax = archUserLinePointFromEndpoint(out.from);
      var bx = archUserLinePointFromEndpoint(out.to);
      if (ax && bx) {
        out.points = [{ x: ax.x, y: ax.y }, { x: bx.x, y: bx.y }];
      } else {
        out.points = [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ];
      }
    }
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

  /** Root SVG coords → #node-sources local coords (same space as legacy divider x1/x2/y). */
  function archSourcesWorldToLocal(pt) {
    var src = archDrag.pos.sources || { x: 0, y: 0 };
    var bx = NODE_LAYOUT.sources.base[0] + src.x;
    var by = NODE_LAYOUT.sources.base[1] + src.y;
    return { x: pt.x - bx, y: pt.y - by };
  }

  /** #node-sources local coords → root SVG (inverse of archSourcesWorldToLocal). */
  function archSourcesLocalToWorld(lx, ly) {
    var src = archDrag.pos.sources || { x: 0, y: 0 };
    var bx = NODE_LAYOUT.sources.base[0] + src.x;
    var by = NODE_LAYOUT.sources.base[1] + src.y;
    return { x: lx + bx, y: ly + by };
  }

  /** Legacy `sourcesDividers` entries become normal connectors; keeps `sourcesDividerLocal` so lines track the Sources tile. */
  function archSourcesDividersMigrateToUserLines() {
    if (!archSourcesDividers || archSourcesDividers.length === 0) return;
    var taken = {};
    userLines.lines.forEach(function (ln) {
      if (ln && typeof ln.id === 'string' && ln.id.indexOf('ul-mig-') === 0) {
        taken[ln.id] = true;
      }
    });
    archSourcesDividers.forEach(function (d) {
      if (!d || !d.id) return;
      var sid = 'ul-mig-' + String(d.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      if (taken[sid]) return;
      var w1 = archSourcesLocalToWorld(d.x1, d.y);
      var w2 = archSourcesLocalToWorld(d.x2, d.y);
      var sw = Number(d.strokeWidth);
      var lineW = isNaN(sw) || sw <= 0 ? 1 : archClamp(Math.max(1, Math.round(sw * 2)), 1, 4);
      userLines.lines.push({
        id: sid,
        sourcesDividerLocal: { x1: d.x1, x2: d.x2, y: d.y },
        from: { kind: 'free', x: w1.x, y: w1.y },
        to: { kind: 'free', x: w2.x, y: w2.y },
        points: [{ x: w1.x, y: w1.y }, { x: w2.x, y: w2.y }],
        stroke: typeof d.stroke === 'string' && d.stroke ? d.stroke : '#d1d5db',
        strokeWidth: lineW,
        lineArrows: 'none',
        bidirectional: false,
        dashStyle: 'solid',
      });
    });
    archSourcesDividers = [];
    var layer = qs('#arch-sources-seps-layer');
    if (layer) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }
  }

  /** Recompute world endpoints for connectors still tied to legacy Sources-column geometry (when the Sources node moves). */
  function archUserLineSyncSourcesDividerLocals() {
    userLines.lines.forEach(function (ln) {
      if (!ln || !ln.sourcesDividerLocal || typeof ln.sourcesDividerLocal !== 'object') return;
      if (!archUserLineIsConnector(ln) || !ln.points || ln.points.length !== 2) {
        delete ln.sourcesDividerLocal;
        return;
      }
      var loc = ln.sourcesDividerLocal;
      var x1 = Number(loc.x1);
      var x2 = Number(loc.x2);
      var y = Number(loc.y);
      if (isNaN(x1) || isNaN(x2) || isNaN(y)) return;
      var w1 = archSourcesLocalToWorld(x1, y);
      var w2 = archSourcesLocalToWorld(x2, y);
      ln.from = { kind: 'free', x: w1.x, y: w1.y };
      ln.to = { kind: 'free', x: w2.x, y: w2.y };
      archUserLineConnectorSyncEndpoints(ln);
    });
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
      var cfClear = qs('#archCustomBoxNormalColorFields');
      var lfClear = qs('#archCustomBoxNormalLabelFields');
      if (cfClear) cfClear.hidden = false;
      if (lfClear) lfClear.hidden = false;
      archSelectionPanelSync();
      return;
    }
    panel.hidden = false;
    if (nameInp) nameInp.value = box.name || '';
    if (fillInp) fillInp.value = box.fill || '#e5e7eb';
    if (strokeInp) strokeInp.value = box.stroke || '#94a3b8';
    var b = archCustomBoxNormalize(box);
    var isIcon = archCustomBoxIsIconAsset(b);
    var colorFields = qs('#archCustomBoxNormalColorFields');
    var labelFields = qs('#archCustomBoxNormalLabelFields');
    if (colorFields) colorFields.hidden = !!isIcon;
    if (labelFields) labelFields.hidden = !!isIcon;
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
      kind: b.kind,
      iconFile: b.iconFile,
      logoFile: b.logoFile,
      logoDescription: b.logoDescription,
    });
    nb.x = archClamp(nb.x, 0, ARCH_GUIDE_VIEW.w - nb.w);
    nb.y = archClamp(nb.y, 0, ARCH_GUIDE_VIEW.h - nb.h);
    archCustomBoxes.push(nb);
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
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
    archActivateCanvasAdjustAfterCustomBoxPlace();
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
      var isSpectrum = b.kind === 'spectrumIcon' && b.iconFile;
      var isProductLogo = b.kind === 'productLogo' && b.logoFile;
      var isIconAsset = isSpectrum || isProductLogo;
      var gClass =
        'arch-node arch-custom-box' +
        (isIconAsset ? ' arch-custom-box--icon-asset' : '') +
        (isSpectrum ? ' arch-custom-box--spectrum-icon' : '') +
        (isProductLogo ? ' arch-custom-box--product-logo' : '');
      g.setAttribute('class', gClass);
      if (archCustomBoxSelectedId === b.id) g.classList.add('arch-custom-box--selected');
      g.setAttribute('transform', 'translate(' + b.x + ',' + b.y + ')');
      var shell = document.createElementNS(SVG_NS, 'rect');
      shell.setAttribute('data-arch-shell', '1');
      shell.setAttribute('x', '0');
      shell.setAttribute('y', '0');
      shell.setAttribute('width', String(b.w));
      shell.setAttribute('height', String(b.h));
      shell.setAttribute('rx', isIconAsset ? '4' : '6');
      shell.setAttribute('fill', isIconAsset ? 'none' : b.fill);
      shell.setAttribute('stroke', isIconAsset ? 'transparent' : b.stroke);
      shell.setAttribute('stroke-width', isIconAsset ? '0' : '1.25');
      var tx = null;
      if (!isIconAsset) {
        tx = document.createElementNS(SVG_NS, 'text');
        tx.setAttribute('class', 'arch-node-label arch-custom-box-label');
        if (archCustomBoxLabelActiveId === b.id) tx.classList.add('arch-custom-box-label--active');
        tx.setAttribute('font-size', String(b.labelFontSize) + 'px');
        tx.setAttribute('dominant-baseline', 'middle');
        tx.setAttribute('x', String(b.w / 2));
        tx.setAttribute('y', String(b.h / 2));
        tx.setAttribute('text-anchor', 'middle');
        tx.textContent = b.name || 'Box';
      }
      var svgTitle = document.createElementNS(SVG_NS, 'title');
      var titleText = b.name || 'Box';
      if (isSpectrum) titleText = b.name || b.iconFile;
      else if (isProductLogo) {
        titleText =
          (b.logoDescription ? (b.name || '') + ' — ' + b.logoDescription : b.name || '') || b.logoFile;
      }
      svgTitle.textContent = titleText;
      g.appendChild(svgTitle);
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
      if (isIconAsset) {
        var imgEl = document.createElementNS(SVG_NS, 'image');
        imgEl.setAttribute('class', 'arch-custom-box-spectrum-img');
        var href = isSpectrum ? ARCH_SPECTRUM_ICON_PREFIX + b.iconFile : b.logoFile;
        imgEl.setAttribute('href', href);
        imgEl.setAttribute('x', '0');
        imgEl.setAttribute('y', '0');
        imgEl.setAttribute('width', String(b.w));
        imgEl.setAttribute('height', String(b.h));
        imgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        g.appendChild(imgEl);
      } else {
        g.appendChild(tx);
      }
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
    archUserLineSyncDrawModeFromEditor();
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
    userLines.selectedHandleIdx = null;
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
    archToolsFloatSetOpen(true);
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
      userLines.selectedHandleIdx = null;
      archCustomBoxSelectedId = rawId;
      archCustomBoxLabelActiveId = labelHit ? rawId : null;
      archUserLineRender();
      archUserLineSyncPropsHud();
      archCustomBoxesRender();
      e.stopPropagation();
      return;
    }

    if (labelHit) {
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      archCustomBoxSelectedId = rawId;
      archCustomBoxLabelActiveId = rawId;
      archUserLineRender();
      archUserLineSyncPropsHud();
      archCustomBoxesRender();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archCustomBoxSelectedId = rawId;
    archCustomBoxLabelActiveId = null;
    archUserLineRender();
    archUserLineSyncPropsHud();
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
      version: 9,
      savedAt: new Date().toISOString(),
      nodes: archDrag.pos,
      labels: { pos: archLabel.state.pos, content: archLabel.state.content },
      userLines: userLines.lines.map(archUserLineMigrateLegacy),
      stateHighlightOverrides: JSON.parse(JSON.stringify(archStateHighlightOverrides)),
      sourcesDividers: [],
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

  function archUserLineHandlesRefresh() {
    var hg = qs('#layer-user-line-handles');
    if (!hg) return;
    while (hg.firstChild) hg.removeChild(hg.firstChild);
    if (!archIsEditMode()) return;
    var ln = archUserLineGetSelected();
    if (!ln || !archUserLineIsConnector(ln)) return;
    archUserLineConnectorSyncEndpoints(ln);
    var pp = ln.points;
    if (!pp || pp.length < 2) return;
    var lid = ln.id;
    var n = pp.length;
    if (userLines.selectedHandleIdx != null && (userLines.selectedHandleIdx < 0 || userLines.selectedHandleIdx >= n)) {
      userLines.selectedHandleIdx = null;
    }
    var selIdx = userLines.selectedHandleIdx;
    for (var hi = 0; hi < n; hi++) {
      var xy = archUserLinePointXY(pp[hi]);
      var role = hi === 0 ? 'from' : hi === n - 1 ? 'to' : 'bend';
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(xy.x));
      c.setAttribute('cy', String(xy.y));
      c.setAttribute('r', '6');
      c.setAttribute(
        'class',
        'arch-user-line-handle arch-user-line-handle--' +
          role +
          (selIdx != null && selIdx === hi ? ' is-active' : '')
      );
      c.setAttribute('data-arch-handle', role);
      c.setAttribute('data-handle-index', String(hi));
      c.setAttribute('data-user-line-id', lid);
      c.setAttribute('pointer-events', 'all');
      hg.appendChild(c);
    }
  }

  function archUserLineRender() {
    var g = qs('#layer-user-lines');
    if (!g) return;
    userLines.lines = userLines.lines.map(archUserLineMigrateLegacy);
    while (g.firstChild) g.removeChild(g.firstChild);
    userLines.lines.forEach(function (ln) {
      var meta = archUserLinePathDFromLine(ln);
      if (!meta) return;
      var d = meta.d;
      var isFree = meta.kind === 'freehand';
      var isConn = meta.kind === 'connector';
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke', ln.stroke || '#308fff');
      var baseW = ln.strokeWidth != null ? ln.strokeWidth : 2;
      var sw = userLines.selectedId === ln.id ? baseW + 1 : baseW;
      p.setAttribute('stroke-width', String(sw));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      if (ln.dashStyle === 'dotted') {
        p.setAttribute('stroke-dasharray', '5 4');
      }
      p.setAttribute('data-user-line-id', ln.id);
      p.setAttribute(
        'class',
        'arch-user-line' +
          (isFree ? ' arch-user-line--poly' : '') +
          (isConn ? ' arch-user-line--connector' : '') +
          (userLines.selectedId === ln.id ? ' arch-user-line--selected' : '')
      );
      if (isConn) {
        var la = archUserLineGetLineArrows(ln);
        if (la === 'end' || la === 'both') {
          p.setAttribute('marker-end', 'url(#archUserArrowEnd)');
        }
        if (la === 'both') {
          p.setAttribute('marker-start', 'url(#archUserArrowStart)');
        }
      }
      g.appendChild(p);
      var hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', String(Math.max(USER_LINE_HIT_STROKE_MIN, Number(sw) + 8)));
      hit.setAttribute('fill', 'none');
      hit.setAttribute('pointer-events', 'stroke');
      hit.setAttribute('data-user-line-id', ln.id);
      hit.setAttribute('class', 'arch-user-line-hit');
      g.appendChild(hit);
    });
    archUserLineHandlesRefresh();
  }

  function archUserLineFindById(id) {
    for (var i = 0; i < userLines.lines.length; i++) {
      if (userLines.lines[i].id === id) return userLines.lines[i];
    }
    return null;
  }

  function archUserLineHandlePointerMove(e) {
    if (!archUserLineEditDrag.active || !archDrag.svg) return;
    var ln = archUserLineFindById(archUserLineEditDrag.lineId);
    if (!ln || !archUserLineIsConnector(ln)) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var tgt = document.elementFromPoint(e.clientX, e.clientY);
    var idx = archUserLineEditDrag.handleIndex;
    if (idx < 0) return;
    archUserLineConnectorSyncEndpoints(ln);
    var pts = ln.points;
    if (!pts || pts.length < 2) return;
    var last = pts.length - 1;
    if (idx === 0) {
      ln.from = archUserLineSnapEndpoint(p.x, p.y, tgt);
      archUserLineConnectorSyncEndpoints(ln);
    } else if (idx === last) {
      ln.to = archUserLineSnapEndpoint(p.x, p.y, tgt);
      archUserLineConnectorSyncEndpoints(ln);
    } else {
      var prev = archUserLinePointXY(pts[idx - 1]);
      var next = archUserLinePointXY(pts[idx + 1]);
      var useNext = !!e.altKey;
      var origin = useNext ? next : prev;
      var disableSnap = !e.shiftKey;
      var nb = archSnapRadialFromOrigin(origin.x, origin.y, p.x, p.y, ARCH_BEND_SNAP_RAD, disableSnap);
      pts[idx] = { x: nb.x, y: nb.y };
    }
    archUserLineRender();
  }

  function archUserLineHandlePointerUp(e) {
    if (!archUserLineEditDrag.active) return;
    var doneLineId = archUserLineEditDrag.lineId;
    archUserLineEditDrag.active = false;
    window.removeEventListener('pointermove', archUserLineHandlePointerMove, true);
    window.removeEventListener('pointerup', archUserLineHandlePointerUp, true);
    window.removeEventListener('pointercancel', archUserLineHandlePointerUp, true);
    var el = archUserLineEditDrag.el;
    var pid = archUserLineEditDrag.pointerId;
    archUserLineEditDrag.el = null;
    archUserLineEditDrag.pointerId = null;
    archUserLineEditDrag.handleIndex = -1;
    archUserLineEditDrag.lineId = '';
    var lnDone = doneLineId ? archUserLineFindById(doneLineId) : null;
    if (lnDone && lnDone.sourcesDividerLocal) {
      delete lnDone.sourcesDividerLocal;
    }
    if (el && pid != null && el.releasePointerCapture) {
      try {
        el.releasePointerCapture(pid);
      } catch (err) {}
    }
    archUserLinePersist();
    archUndoMaybePushSnapshot();
    archUserLineRender();
  }

  function archUserLineHandlePointerDown(e) {
    if (!archIsEditMode()) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('arch-user-line-handle')) return;
    var hix = t.getAttribute('data-handle-index');
    var lid = t.getAttribute('data-user-line-id');
    if (hix == null || !lid) return;
    var hi = parseInt(hix, 10);
    if (isNaN(hi)) return;
    var ln = archUserLineFindById(lid);
    if (!ln || !archUserLineIsConnector(ln)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    userLines.selectedHandleIdx = hi;
    archUserLineEditDrag.active = true;
    archUserLineEditDrag.handleIndex = hi;
    archUserLineEditDrag.lineId = lid;
    archUserLineEditDrag.pointerId = e.pointerId;
    archUserLineEditDrag.el = t;
    if (t.setPointerCapture) {
      try {
        t.setPointerCapture(e.pointerId);
      } catch (err2) {}
    }
    window.addEventListener('pointermove', archUserLineHandlePointerMove, true);
    window.addEventListener('pointerup', archUserLineHandlePointerUp, true);
    window.addEventListener('pointercancel', archUserLineHandlePointerUp, true);
  }

  function archUserLineGetSelected() {
    if (!userLines.selectedId) return null;
    for (var i = 0; i < userLines.lines.length; i++) {
      if (userLines.lines[i].id === userLines.selectedId) return userLines.lines[i];
    }
    return null;
  }

  function archUserLineSyncPropsHud() {
    var sel = archUserLineGetSelected();
    archLineFloatUpdateVisibility();
    if (sel) {
      archEditorSetPanel('sources');
      archLineFloatSyncFromLine(sel);
    }
    archEditorApplyModesForCurrentSelection();
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
      pv.setAttribute('stroke', archLineFloatGetHex());
      pv.setAttribute('stroke-width', String(archLineFloatGetStrokeW()));
      if (archLineFloatGetTool() === 'dotted') {
        pv.setAttribute('stroke-dasharray', '5 4');
      } else {
        pv.removeAttribute('stroke-dasharray');
      }
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
    if (pv) {
      pv.setAttribute('opacity', '0');
      pv.removeAttribute('stroke-dasharray');
    }
    if (archViewport) archViewport.classList.remove('arch-user-line-draw-pending');
  }

  /** Deep-clone a connector endpoint and offset free points (for paste). */
  function archUserLineEndpointPasteOffset(ep, dx, dy) {
    if (!ep) return ep;
    var o = JSON.parse(JSON.stringify(ep));
    if (o.kind === 'free') {
      o.x = (Number(o.x) || 0) + dx;
      o.y = (Number(o.y) || 0) + dy;
    }
    return o;
  }

  function archDiagramCopySelection() {
    if (!archIsEditMode()) return;
    if (archCustomBoxSelectedId) {
      var box = archCustomBoxFind(archCustomBoxSelectedId);
      if (!box) return;
      var b = archCustomBoxNormalize(box);
      archDiagramClipboard = { kind: 'cbox', box: JSON.parse(JSON.stringify(b)) };
      delete archDiagramClipboard.box.id;
      if (liveRegion) liveRegion.textContent = 'Copied shape — Ctrl+V or ⌘V to paste.';
      return;
    }
    if (userLines.selectedId) {
      var ln = archUserLineGetSelected();
      if (!ln) return;
      archDiagramClipboard = { kind: 'line', line: JSON.parse(JSON.stringify(ln)) };
      delete archDiagramClipboard.line.id;
      if (liveRegion) liveRegion.textContent = 'Copied connector — Ctrl+V or ⌘V to paste.';
      return;
    }
    if (liveRegion) liveRegion.textContent = 'Select a custom shape or connector to copy.';
  }

  function archDiagramPasteClipboard() {
    if (!archIsEditMode()) return;
    if (!archDiagramClipboard) {
      if (liveRegion) liveRegion.textContent = 'Nothing to paste — copy a custom shape or connector first.';
      return;
    }
    if (archDiagramClipboard.kind === 'cbox') {
      var raw = archDiagramClipboard.box;
      var b = archCustomBoxNormalize(raw);
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
        kind: b.kind,
        iconFile: b.iconFile,
        logoFile: b.logoFile,
        logoDescription: b.logoDescription,
      });
      nb.x = archClamp(nb.x, 0, ARCH_GUIDE_VIEW.w - nb.w);
      nb.y = archClamp(nb.y, 0, ARCH_GUIDE_VIEW.h - nb.h);
      archCustomBoxes.push(nb);
      archCustomBoxSelectedId = nb.id;
      archCustomBoxLabelActiveId = null;
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      if (archSelection) archSelection.clear();
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
      archActivateCanvasAdjustAfterCustomBoxPlace();
      if (liveRegion) liveRegion.textContent = 'Pasted shape.';
      return;
    }
    if (archDiagramClipboard.kind === 'line') {
      var L = archDiagramClipboard.line;
      var dx = 20;
      var dy = 20;
      var id = 'ul-' + Date.now();
      if (L.points && Array.isArray(L.points) && L.points.length >= 2 && !L.from && !L.to) {
        var pts = L.points.map(function (pt) {
          return [(Number(pt && pt[0]) || 0) + dx, (Number(pt && pt[1]) || 0) + dy];
        });
        userLines.lines.push({
          id: id,
          points: pts,
          stroke: typeof L.stroke === 'string' && L.stroke ? L.stroke : '#308fff',
          strokeWidth: typeof L.strokeWidth === 'number' && !isNaN(L.strokeWidth) ? L.strokeWidth : 2,
          dashStyle: L.dashStyle === 'dotted' ? 'dotted' : 'solid',
          bidirectional: false,
        });
      } else {
        var lar =
          L.lineArrows === 'none' || L.lineArrows === 'end' || L.lineArrows === 'both'
            ? L.lineArrows
            : L.bidirectional
              ? 'both'
              : 'end';
        var fEp = archUserLineEndpointPasteOffset(L.from, dx, dy);
        var tEp = archUserLineEndpointPasteOffset(L.to, dx, dy);
        var pA = archUserLinePointFromEndpoint(fEp);
        var pB = archUserLinePointFromEndpoint(tEp);
        var ptsPaste = null;
        if (L.points && Array.isArray(L.points) && L.points.length >= 2 && L.from && L.to) {
          ptsPaste = L.points.map(function (pt) {
            var o = archUserLinePointXY(pt);
            return { x: o.x + dx, y: o.y + dy };
          });
        } else if (L.bend && typeof L.bend.x === 'number' && typeof L.bend.y === 'number' && pA && pB) {
          ptsPaste = [
            { x: pA.x, y: pA.y },
            { x: L.bend.x + dx, y: L.bend.y + dy },
            { x: pB.x, y: pB.y },
          ];
        } else if (pA && pB) {
          ptsPaste = [{ x: pA.x, y: pA.y }, { x: pB.x, y: pB.y }];
        } else {
          ptsPaste = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ];
        }
        userLines.lines.push({
          id: id,
          from: fEp,
          to: tEp,
          points: ptsPaste,
          stroke: typeof L.stroke === 'string' && L.stroke ? L.stroke : '#308fff',
          strokeWidth: typeof L.strokeWidth === 'number' && !isNaN(L.strokeWidth) ? L.strokeWidth : 2,
          lineArrows: lar,
          bidirectional: lar === 'both',
          dashStyle: L.dashStyle === 'dotted' ? 'dotted' : 'solid',
        });
      }
      userLines.selectedId = id;
      userLines.selectedHandleIdx = null;
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      if (archSelection) archSelection.clear();
      archCustomBoxesRender();
      archUserLineRender();
      archUserLinePersist();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
      archUndoMaybePushSnapshot();
      if (liveRegion) liveRegion.textContent = 'Pasted connector.';
    }
  }

  function archUserLineAdd(ep1, ep2) {
    var tool = archLineFloatGetTool();
    var dashStyle = tool === 'dotted' ? 'dotted' : 'solid';
    var lineArrows = 'end';
    if (tool === 'doubleArrow') lineArrows = 'both';
    else if (tool === 'plain') lineArrows = 'none';
    else if (tool === 'arrow' || tool === 'dotted') lineArrows = 'end';
    var id = 'ul-' + Date.now();
    var wp1 = archUserLinePointFromEndpoint(ep1);
    var wp2 = archUserLinePointFromEndpoint(ep2);
    var ptsNew =
      wp1 && wp2
        ? [{ x: wp1.x, y: wp1.y }, { x: wp2.x, y: wp2.y }]
        : [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ];
    userLines.lines.push({
      id: id,
      from: ep1,
      to: ep2,
      points: ptsNew,
      stroke: archLineFloatGetHex(),
      strokeWidth: archLineFloatGetStrokeW(),
      lineArrows: lineArrows,
      bidirectional: lineArrows === 'both',
      dashStyle: dashStyle,
    });
    userLines.selectedId = id;
    userLines.selectedHandleIdx = null;
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
    userLines.selectedHandleIdx = null;
    archUserLineRender();
    archUserLinePersist();
    archUserLineSyncPropsHud();
    archUndoMaybePushSnapshot();
  }

  function archUserLineOnPointerDown(e) {
    if (customBoxDrawMode) return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return;
    var lineHit =
      e.target &&
      e.target.closest &&
      e.target.closest('.arch-user-line, .arch-user-line-hit');
    if (!userLines.drawMode) {
      if (lineHit) {
        var lidPick = lineHit.getAttribute('data-user-line-id');
        userLines.selectedHandleIdx = null;
        userLines.selectedId = lidPick;
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
    var floatTool = archLineFloatGetTool();
    if (floatTool === 'junction' && !lineHit) {
      return;
    }
    if (lineHit) {
      var lidPickDm = lineHit.getAttribute('data-user-line-id');
      userLines.selectedHandleIdx = null;
      userLines.selectedId = lidPickDm;
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      if (floatTool === 'junction') {
        var lnJ = archUserLineFindById(lidPickDm);
        if (lnJ) archUserLineTryInsertBendAtClient(lnJ, e.clientX, e.clientY);
      }
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var tool = archLineFloatGetTool();
    if (tool === 'freehand') {
      archUserFreehandPointerDown(e);
      return;
    }
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

  /** Apply line-draw mode (floating bar, two-click tools). Prefer archUserLineSyncDrawModeFromEditor for rail-driven state. */
  function archUserLineApplyDrawState(on) {
    on = !!on;
    if (on) {
      if (customBoxDrawMode) {
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
    if (userLines.drawMode === on) {
      archLineFloatUpdateVisibility();
      return;
    }
    userLines.drawMode = on;
    if (archViewport) archViewport.classList.toggle('arch-user-line-draw', on);
    if (!on) {
      archUserLineClearPending();
      archUserLineRemoveDrawListeners();
    }
    archLineFloatUpdateVisibility();
  }

  function archUserLineSyncDrawModeFromEditor() {
    var on = !!(archIsEditMode() && archGetActiveTool() === 'lines' && !customBoxDrawMode);
    archUserLineApplyDrawState(on);
  }

  function archUserLineOnGlobalDelete(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (
      e.target &&
      (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' ||
        e.target.isContentEditable ||
        (e.target.closest && e.target.closest('[contenteditable="true"]')))
    )
      return;
    if (archCustomBoxSelectedId) {
      e.preventDefault();
      archCustomBoxDeleteSelected();
      return;
    }
    if (userLines.selectedId) {
      var lnDel = archUserLineGetSelected();
      if (
        lnDel &&
        archUserLineIsConnector(lnDel) &&
        lnDel.points &&
        lnDel.points.length > 2 &&
        userLines.selectedHandleIdx != null
      ) {
        var k = userLines.selectedHandleIdx;
        if (k > 0 && k < lnDel.points.length - 1) {
          e.preventDefault();
          lnDel.points.splice(k, 1);
          userLines.selectedHandleIdx = null;
          archUserLineConnectorSyncEndpoints(lnDel);
          archUserLineRender();
          archUserLinePersist();
          archUserLineSyncPropsHud();
          archUndoMaybePushSnapshot();
          if (liveRegion) liveRegion.textContent = 'Removed bend point from connector.';
          return;
        }
      }
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
      localStorage.removeItem('aepArchSourcesDividerPointer');
      localStorage.removeItem(LS_CUSTOM_BOXES);
      localStorage.removeItem('aepArchDragTags');
      localStorage.removeItem('aepArchDragSources');
      localStorage.removeItem(LS_STATE_HILITE_OVERRIDES);
      localStorage.removeItem('aepDiagramUndoStack');
      localStorage.removeItem('aepDiagramSelection');
      localStorage.removeItem(LS_LINE_TOOLBAR_DEFAULTS);
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
    archSourcesDividersMigrateToUserLines();
    archUserLineRender();
    archCustomBoxesRender();
    archDragSave();
    archLabelSave();
    archUserLinePersist();
    archSourcesDividersPersist();
    archCustomBoxesPersist();

    archLineFloatInit();
    archLineFloatUpdateVisibility();

    var reset = qs('#archDragReset');
    var masterSave = qs('#archMasterSave');
    var masterDl = qs('#archMasterDownload');
    var masterImport = qs('#archMasterImport');
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

    document.addEventListener('keydown', archUserLineOnGlobalDelete);

    if (!document.documentElement.getAttribute('data-arch-lines-esc')) {
      document.documentElement.setAttribute('data-arch-lines-esc', '1');
      document.addEventListener(
        'keydown',
        function (e) {
          if (e.key !== 'Escape') return;
          if (!archIsEditMode()) return;
          if (archToolsFloatOpen) {
            if (e.target && e.target.closest && e.target.closest('#archToolsFloatBar')) return;
            archToolsFloatSetOpen(false);
            e.preventDefault();
            return;
          }
          if (archGetActiveTool() !== 'lines') return;
          var cpop = qs('#archLineFloatColorPopover');
          if (cpop && !cpop.hidden) {
            archLineFloatColorPopoverClose();
            e.preventDefault();
            return;
          }
          if (
            e.target &&
            (e.target.tagName === 'INPUT' ||
              e.target.tagName === 'TEXTAREA' ||
              e.target.tagName === 'SELECT' ||
              e.target.isContentEditable ||
              (e.target.closest && e.target.closest('[contenteditable="true"]')))
          )
            return;
          var menu = qs('#archLineFloatWMenu');
          if (menu && !menu.hidden) {
            archLineFloatWeightMenuClose();
            e.preventDefault();
            return;
          }
          e.preventDefault();
          archSetActiveTool('select');
        },
        true
      );
    }

    archDrag.svg.addEventListener('pointerdown', archUserLineHandlePointerDown, true);
    archDrag.svg.addEventListener('pointerdown', archCustomBoxDrawPointerDownCapture, true);
    archDrag.svg.addEventListener('pointerdown', archLabelPointerDownCapture, true);
    archDrag.svg.addEventListener('dblclick', archDiagramDblClickSelect, true);
    archDrag.svg.addEventListener('dblclick', archLabelDblClick, true);
    archDrag.svg.addEventListener('pointerdown', archResizePointerDown, false);
    archDrag.svg.addEventListener('pointerdown', archUserLineOnPointerDown, false);

    $all('.arch-int-svg-wrap g.arch-node').forEach(function (g) {
      g.addEventListener('pointerdown', archDragPointerDown);
    });

    archUserLineSyncDrawModeFromEditor();
    archEditorSyncLinesDockChrome();

    archEditSelectionInit();
    archUndoInitOnce();

    if (!document.documentElement.getAttribute('data-arch-undo-keys')) {
      document.documentElement.setAttribute('data-arch-undo-keys', '1');
      document.addEventListener(
        'keydown',
        function (e) {
          if (
            e.target &&
            (e.target.tagName === 'INPUT' ||
              e.target.tagName === 'TEXTAREA' ||
              e.target.isContentEditable ||
              (e.target.closest && e.target.closest('[contenteditable="true"]')))
          )
            return;
          var mod = e.metaKey || e.ctrlKey;
          if (mod && (e.key.toLowerCase() === 'z' || e.code === 'KeyZ')) {
            e.preventDefault();
            if (e.shiftKey) archRedoRun();
            else archUndoRun();
            return;
          }
          if (e.ctrlKey && !e.metaKey && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            archRedoRun();
            return;
          }
          if (mod && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            archDiagramCopySelection();
            return;
          }
          if (mod && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            archDiagramPasteClipboard();
            return;
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

    var toolsFloatPal = qs('#archToolsFloatBar');
    if (toolsFloatPal && !toolsFloatPal.getAttribute('data-arch-palette-ready')) {
      toolsFloatPal.setAttribute('data-arch-palette-ready', '1');
      toolsFloatPal.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-arch-palette]');
        if (!btn) return;
        var k = btn.getAttribute('data-arch-palette');
        if (k) archPaletteAddPreset(k);
      });
    }

    var tfClose = qs('#archToolsFloatClose');
    if (tfClose && !tfClose.getAttribute('data-arch-tf-close')) {
      tfClose.setAttribute('data-arch-tf-close', '1');
      tfClose.addEventListener('click', function () {
        archToolsFloatSetOpen(false);
      });
    }

    if (!document.documentElement.getAttribute('data-arch-tools-float-dismiss')) {
      document.documentElement.setAttribute('data-arch-tools-float-dismiss', '1');
      document.addEventListener(
        'pointerdown',
        function (e) {
          if (!archToolsFloatOpen || !archIsEditMode()) return;
          if (e.target && e.target.closest && e.target.closest('#archToolsFloatBar')) return;
          if (e.target && e.target.closest && e.target.closest('.arch-editor-rail')) return;
          archToolsFloatSetOpen(false);
        },
        false
      );
    }

    var spectGrid = qs('#archSpectrumIconGrid');
    if (spectGrid && !spectGrid.getAttribute('data-arch-click-ready')) {
      spectGrid.setAttribute('data-arch-click-ready', '1');
      spectGrid.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.arch-spectrum-icons-tile');
        if (!btn || btn.hidden) return;
        var f = btn.getAttribute('data-arch-spectrum-file');
        var lab = btn.getAttribute('data-arch-spectrum-label');
        if (f) archSpectrumIconPlace(f, lab);
      });
    }
    var spectSearch = qs('#archSpectrumIconSearch');
    if (spectSearch && !spectSearch.getAttribute('data-arch-ready')) {
      spectSearch.setAttribute('data-arch-ready', '1');
      spectSearch.addEventListener('input', function () {
        archSpectrumIconsApplyFilter(spectSearch.value);
      });
    }

    var logoSection = qs('#archEditorSectionSpectrumIcons');
    if (logoSection && !logoSection.getAttribute('data-arch-logo-click-ready')) {
      logoSection.setAttribute('data-arch-logo-click-ready', '1');
      logoSection.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.arch-architecture-logo-tile');
        if (!btn || btn.hidden) return;
        var f = btn.getAttribute('data-arch-logo-file');
        var lab = btn.getAttribute('data-arch-logo-label');
        var desc = btn.getAttribute('data-arch-logo-desc') || '';
        if (f) archProductLogoPlace(f, lab, desc);
      });
    }
    var adobeLogoSearch = qs('#archAdobeLogoSearch');
    if (adobeLogoSearch && !adobeLogoSearch.getAttribute('data-arch-ready')) {
      adobeLogoSearch.setAttribute('data-arch-ready', '1');
      adobeLogoSearch.addEventListener('input', function () {
        archArchitectureLogosApplyFilter(qs('#archAdobeLogoGrid'), qs('#archAdobeLogoStatus'), adobeLogoSearch.value);
      });
    }
    var logoSearch = qs('#archArchitectureLogoSearch');
    if (logoSearch && !logoSearch.getAttribute('data-arch-ready')) {
      logoSearch.setAttribute('data-arch-ready', '1');
      logoSearch.addEventListener('input', function () {
        archArchitectureLogosApplyFilter(qs('#archArchitectureLogoGrid'), qs('#archArchitectureLogoStatus'), logoSearch.value);
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
