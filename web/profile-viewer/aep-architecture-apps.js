/**
 * AEP & Apps architecture page — 16-state machine for highlights + visible flows + stroke colours.
 * Vanilla JS only. Flow animation via CSS stroke-dasharray + keyframes on .is-visible.
 */
(function () {
  'use strict';

  var PB = window.AEPDiagram && window.AEPDiagram.playback;
  var C = PB ? PB.FLOW_COLORS : { ingress: '#308fff', intra: '#7d8a9e', egress: '#e34850' };
  /** Tour editor module (diagram/tour-editor.js) — installed in init() after DOM helpers exist. */
  var TE = null;
  var ARCH_NODE_LABELS =
    window.AEPDiagram && window.AEPDiagram.tourEditor
      ? window.AEPDiagram.tourEditor.ARCH_NODE_LABELS
      : {};

  var idx = 0;
  var hudTitle;
  var hudMeta;
  var liveRegion;
  var stateKicker;
  var stateHeadline;
  var stateBody;
  var archViewport;
  /** @deprecated — use TE.getDotButtons() after init */
  var dotButtons = [];

  function archInstallTourEditor() {
    if (TE || !(window.AEPDiagram && window.AEPDiagram.tourEditor)) return;
    TE = window.AEPDiagram.tourEditor.install({
      qs: qs,
      $all: $all,
      playback: PB,
      getIdx: function () { return idx; },
      setIdx: function (v) { idx = v; },
      applyState: applyState,
      getNodeLayout: function () { return NODE_LAYOUT; },
      getUserLines: function () { return userLines.lines; },
      getViewport: function () { return archViewport; },
      syncPlaybackNav: archSyncPlaybackNav,
    });
  }

  function archHiliteOverrides() {
    return TE ? TE.getHighlightOverrides() : {};
  }

  function archHighlightsForState(stateIndex) {
    return TE ? TE.highlightsForState(stateIndex) : [];
  }

  function archStateHighlightOverridesPersist() {
    if (TE) TE.highlightOverridesPersist();
  }

  function archStateHighlightOverridesLoad() {
    if (TE) TE.highlightOverridesLoad();
  }

  function archHighlightResetCurrentState() {
    if (TE) TE.highlightResetCurrentState();
  }

  function archGetStates() {
    return TE ? TE.getStates() : [];
  }

  function archGetTour() {
    return TE ? TE.getTour() : { version: 1, states: [] };
  }

  /** Full-layout undo (snapshots via AEPDiagram.undo). */
  var archUndoStack = null;
  /** Multi-select for platform nodes in Edit mode (AEPDiagram.selection). */
  var archSelection = null;
  /** Unified multi-select member refs: cbox:id, label:id, node:key (Edit mode). */
  var archEditMulti = null;
  /** Object groups persisted in master layout v14+. */
  var archDiagramGroups = [];
  /** Batch move state when dragging grouped / multi-selected objects. */
  var archMoveBatch = null;
  /** Right-click context menu element (Edit mode). */
  var archContextMenuEl = null;
  /** Selected decorative background plate id (data-arch-bg), Edit mode only. */
  var archBgSelectedId = null;

  var ARCH_BG_LABELS = {
    'profile-strip': 'Profile & decisioning strip',
    'aep-platform': 'AEP platform shell',
  };

  function archBgClearSelection() {
    archBgSelectedId = null;
    archBgRefreshDom();
    archInspectorSync();
  }

  function archBgRefreshDom() {
    $all('.arch-bg-plate[data-arch-bg]').forEach(function (g) {
      var id = g.getAttribute('data-arch-bg');
      g.classList.toggle('arch-bg-plate--selected', !!(id && archBgSelectedId === id));
    });
  }

  function archLabelClearSelection() {
    archLabelSelectedId = null;
    $all('.arch-int-svg-wrap svg text[data-arch-id]').forEach(function (el) {
      el.classList.remove('arch-label-text--selected');
    });
  }

  function archLabelSelect(id, textEl) {
    archLabelClearSelection();
    archLabelSelectedId = id;
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archFlowClearSelection();
    archBgClearSelection();
    if (archSelection) archSelection.clear();
    if (textEl) textEl.classList.add('arch-label-text--selected');
    archCustomBoxesRender();
    archUserLineRender();
    archUserLineSyncPropsHud();
    archSelectionRefreshDom();
  }

  function archBgSelect(id) {
    if (!id || archHiddenBackgroundsHas(id)) return;
    archBgSelectedId = id;
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    archLabelClearSelection();
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archFlowClearSelection();
    if (archSelection) archSelection.clear();
    archCustomBoxesRender();
    archUserLineRender();
    archUserLineSyncPropsHud();
    archSelectionRefreshDom();
    archBgRefreshDom();
    if (liveRegion) {
      liveRegion.textContent =
        'Background selected — press Delete to remove from this proposal.';
    }
  }

  /** True when "Edit diagram" is on — state stepping must not advance (playback paused). */
  function archIsEditMode() {
    return !!(archViewport && archViewport.classList.contains('arch-int-viewport--edit-mode'));
  }

  var LS_ARCH_EDIT = 'aepArchDiagramEditMode';
  /** Set from init() — applies Edit diagram toggle + dock chrome. */
  var archEditorApplyEditModeHook = null;

  function archIsPresentationFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function archSetEditMode(on) {
    try {
      localStorage.setItem(LS_ARCH_EDIT, on ? '1' : '0');
    } catch (e) {}
    var emt = qs('#archEditModeToggle');
    if (emt) emt.checked = !!on;
    if (archEditorApplyEditModeHook) archEditorApplyEditModeHook();
  }

  /** Enter Edit diagram + Select (Tools) before routing a double-click to object handlers. */
  function archDblClickEnterEditForObject() {
    if (!archIsEditMode()) {
      archSetEditMode(true);
    }
    if (archGetActiveTool() !== 'select') {
      archSetActiveTool('select');
      archToolsFloatSetOpen(true);
    }
  }

  /** True when double-click hit an editable diagram object (not empty canvas). */
  function archDblClickHasEditableTarget(e) {
    if (e.target && e.target.closest && e.target.closest('.arch-diagram-ui')) return false;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return false;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle--cbox')) return false;

    if (archDrag && archDrag.svg) {
      var sp0 = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
      if (archFlowPickNearestVisible(sp0.x, sp0.y, FLOW_PICK_NEAR_LABEL_MAX_DIST)) return true;
      if (archFlowLabelAtSvgPoint(sp0.x, sp0.y)) return true;
    }

    var flowId = archFlowIdFromTarget(e.target);
    if (flowId) {
      var t = document.getElementById(flowId);
      if (t && t.classList.contains('is-visible') && !archHiddenFlowsHas(t.id)) return true;
    }

    var ul = e.target.closest && e.target.closest('.arch-user-line, .arch-user-line-hit');
    if (ul && ul.getAttribute && ul.getAttribute('data-user-line-id')) return true;

    var bgPlate = e.target.closest && e.target.closest('.arch-bg-plate[data-arch-bg]');
    if (bgPlate) {
      var bgId = bgPlate.getAttribute('data-arch-bg');
      if (bgId && !archHiddenBackgroundsHas(bgId)) return true;
    }

    var g = e.target.closest && e.target.closest('g.arch-node');
    if (g && g.id && g.id.indexOf('node-') === 0) {
      if (g.classList.contains('arch-custom-box')) return true;
      if (NODE_LAYOUT[g.id.slice(5)]) return true;
    }

    var te = e.target.closest && e.target.closest('text');
    if (te && te.getAttribute('data-arch-id')) return true;

    return false;
  }

  /**
   * Double-click any diagram object to enter contextual edit: enables Edit diagram when off,
   * switches to Select tool, then routes to the object-type handler (resize, text, line bar, etc.).
   * No-op in presentation fullscreen or on empty canvas.
   */
  function archDblClickEdit(e) {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if (archIsPresentationFullscreen()) return;
    if (userLines.drawMode || customBoxDrawMode) return;
    if (!archDblClickHasEditableTarget(e)) return;

    archDblClickEnterEditForObject();

    var cboxLabel = e.target.closest && e.target.closest('.arch-custom-box-label');
    if (cboxLabel) {
      var cg = cboxLabel.closest('g.arch-custom-box');
      if (cg) {
        var cboxRawId = cg.id.replace(/^node-cbox-/, '');
        if (cboxRawId) {
          archCustomBoxSelectedId = cboxRawId;
          archCustomBoxLabelActiveId = cboxRawId;
          archCustomBoxesRender();
          archSelectionRefreshDom();
          archLabelOpenEditor(cboxLabel, { force: true, kind: 'cbox', boxId: cboxRawId });
        }
      }
      return;
    }

    var handled = archDiagramDblClickSelect(e);

    if (handled) return;
    var te = e.target.closest && e.target.closest('text[data-arch-id]');
    if (te) archLabelDblClick(e);
  }

  /** Prev/Next/dot nav stays enabled in Edit mode so you can step through states while editing. */
  function archSyncPlaybackNav() {
    var prev = qs('#archIntPrev');
    var next = qs('#archIntNext');
    if (prev) prev.disabled = false;
    if (next) next.disabled = false;
    var dots = TE ? TE.getDotButtons() : dotButtons;
    dots.forEach(function (b) { b.disabled = false; });
  }

  function archSelectionRefreshDom() {
    if (!archSelection) return;
    $all('.arch-int-svg-wrap g.arch-node').forEach(function (g) {
      if (g.classList.contains('arch-custom-box')) return;
      var id = g.id;
      if (!id || id.indexOf('node-') !== 0 || id.indexOf('node-cbox-') === 0) return;
      g.classList.toggle('arch-node--selected', archSelection.has(id));
    });
    $all('.arch-int-svg-wrap svg text[data-arch-id]').forEach(function (el) {
      var lid = el.getAttribute('data-arch-id');
      var sel =
        !!(lid && (archLabelSelectedId === lid || archEditMultiHas(archMemberRef('label', lid))));
      el.classList.toggle('arch-label-text--selected', sel);
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
    if (!hasPlatform && !hasCbox && !archLabelSelectedId) return;

    archDragSetEnabled(true);

    if (archLabelSelectedId) {
      archLabelSetEnabled(true);
      return;
    }

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
    archLayerOrderSyncUi();
    archContainerAlignSyncUi();
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
    if (archBgSelectedId) {
      ins.hidden = false;
      body.textContent =
        'Background plate\n' +
        (ARCH_BG_LABELS[archBgSelectedId] || archBgSelectedId) +
        '\nId: ' +
        archBgSelectedId +
        '\n\nPress Delete to remove from this proposal. Use layer buttons ([ / ]) to send backward or bring forward.';
      return;
    }
    if (archLabelSelectedId) {
      ins.hidden = false;
      body.textContent =
        'Diagram label\nId: ' +
        archLabelSelectedId +
        '\n\nClick to edit inline. ⌘C / Ctrl+C to copy, ⌘V to paste duplicate (+20px). Delete removes pasted labels or resets text on built-in labels.';
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
          '\n\nUse the floating Tools bar on the diagram for fill, outline, name, align-inside, and layer order ([ / ]).';
        return;
      }
    }
    if (!archSelection || archSelection.count() !== 1) {
      if (!archBgSelectedId) ins.hidden = true;
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
      '\n\nDrag to move, corners to resize, click text to edit inline. Align contents inside: Tools bar Align buttons. Layer order: [ / ] or toolbar buttons.';
  }

  function archEditSelectionInit() {
    if (archSelection || !(window.AEPDiagram && window.AEPDiagram.selection)) return;
    archSelection = window.AEPDiagram.selection.create();
    if (!archEditMulti) {
      archEditMulti = { ids: new Set(), primary: null };
    }
    archSelectionPanelSync();
  }

  function archGroupsApi() {
    return window.AEPDiagram && window.AEPDiagram.groups ? window.AEPDiagram.groups : null;
  }

  function archMemberRef(kind, id) {
    var G = archGroupsApi();
    return G ? G.makeMemberRef(kind, id) : kind + ':' + id;
  }

  function archEditMultiToArray() {
    if (!archEditMulti || !archEditMulti.ids) return [];
    return Array.from(archEditMulti.ids);
  }

  function archEditMultiHas(ref) {
    return !!(archEditMulti && archEditMulti.ids && archEditMulti.ids.has(ref));
  }

  function archEditMultiClear() {
    if (!archEditMulti) return;
    archEditMulti.ids.clear();
    archEditMulti.primary = null;
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    archLabelClearSelection();
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archFlowClearSelection();
    archBgClearSelection();
    if (archSelection) archSelection.clear();
  }

  function archEditMultiSyncLegacy() {
    if (!archEditMulti) return;
    var refs = archEditMultiToArray();
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archFlowClearSelection();
    archBgClearSelection();
    if (archSelection) archSelection.clear();
    $all('.arch-int-svg-wrap svg text[data-arch-id]').forEach(function (el) {
      el.classList.remove('arch-label-text--selected');
    });
    archLabelSelectedId = null;

    if (!refs.length) {
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
      return;
    }

    var nodeDomIds = [];
    refs.forEach(function (ref) {
      var G = archGroupsApi();
      var p = G ? G.parseMemberRef(ref) : null;
      if (p && p.kind === 'node') nodeDomIds.push('node-' + p.id);
    });
    if (nodeDomIds.length && archSelection) {
      archSelection.setMany(nodeDomIds, nodeDomIds[0]);
    }

    var primary = archEditMulti.primary || refs[0];
    var Gp = archGroupsApi();
    var pp = Gp ? Gp.parseMemberRef(primary) : null;
    if (pp) {
      if (pp.kind === 'cbox') archCustomBoxSelectedId = pp.id;
      else if (pp.kind === 'label') {
        archLabelSelectedId = pp.id;
        var te = qs('[data-arch-id="' + pp.id + '"]');
        if (te) te.classList.add('arch-label-text--selected');
      }
    }

    archCustomBoxesRender();
    archUserLineRender();
    archUserLineSyncPropsHud();
    archSelectionRefreshDom();
  }

  function archEditMultiSetMany(refs, primaryRef) {
    if (!archEditMulti) archEditMulti = { ids: new Set(), primary: null };
    archEditMulti.ids.clear();
    (refs || []).forEach(function (r) {
      if (r) archEditMulti.ids.add(String(r));
    });
    archEditMulti.primary = primaryRef != null ? String(primaryRef) : refs && refs[0] ? String(refs[0]) : null;
    archEditMultiSyncLegacy();
  }

  function archEditMultiToggle(ref, multi) {
    if (!ref) return;
    if (!archEditMulti) archEditMulti = { ids: new Set(), primary: null };
    var sid = String(ref);
    if (!multi) {
      archEditMultiSetMany([sid], sid);
      return;
    }
    if (archEditMulti.ids.has(sid)) {
      archEditMulti.ids.delete(sid);
      if (archEditMulti.primary === sid) {
        archEditMulti.primary = archEditMulti.ids.size ? Array.from(archEditMulti.ids)[0] : null;
      }
    } else {
      archEditMulti.ids.add(sid);
      archEditMulti.primary = sid;
    }
    archEditMultiSyncLegacy();
  }

  function archEditMultiGetMoveRefs(pickedRef) {
    var G = archGroupsApi();
    var refs = archEditMultiToArray();
    if (!refs.length && pickedRef) refs = [pickedRef];
    else if (pickedRef && refs.length && !archEditMultiHas(pickedRef)) refs = [pickedRef];
    if (G && typeof G.expandWithGroupMembers === 'function') {
      return G.expandWithGroupMembers(refs, archDiagramGroups);
    }
    return refs;
  }

  function archMemberRefGetPosition(ref) {
    var G = archGroupsApi();
    var p = G ? G.parseMemberRef(ref) : null;
    if (!p) return null;
    if (p.kind === 'cbox') {
      var box = archCustomBoxFind(p.id);
      if (!box) return null;
      return { kind: 'cbox', id: p.id, x: box.x || 0, y: box.y || 0 };
    }
    if (p.kind === 'label') {
      var lp = archLabel.state.pos[p.id] || { x: 0, y: 0 };
      return { kind: 'label', id: p.id, x: lp.x || 0, y: lp.y || 0 };
    }
    if (p.kind === 'node' && NODE_LAYOUT[p.id]) {
      var np = archDrag.pos[p.id] || { x: 0, y: 0 };
      return { kind: 'node', id: p.id, x: np.x || 0, y: np.y || 0 };
    }
    return null;
  }

  function archMoveBatchBegin(pickedRef) {
    var refs = archEditMultiGetMoveRefs(pickedRef);
    var starts = {};
    refs.forEach(function (ref) {
      var pos = archMemberRefGetPosition(ref);
      if (pos) starts[ref] = pos;
    });
    archMoveBatch = { refs: refs, starts: starts };
  }

  function archMoveBatchApplyDelta(dx, dy, snapExclude) {
    if (!archMoveBatch || !archMoveBatch.starts) return;
    var firstRef = archMoveBatch.refs[0];
    var firstStart = firstRef ? archMoveBatch.starts[firstRef] : null;
    if (!firstStart) return;
    var snapDx = dx;
    var snapDy = dy;
    if (firstStart.kind === 'cbox') {
      var box0 = archCustomBoxFind(firstStart.id);
      if (box0) {
        var b0 = archCustomBoxNormalize(box0);
        var twr = {
          left: firstStart.x + dx,
          top: firstStart.y + dy,
          right: firstStart.x + dx + b0.w,
          bottom: firstStart.y + dy + b0.h,
          w: b0.w,
          h: b0.h,
          cx: firstStart.x + dx + b0.w / 2,
          cy: firstStart.y + dy + b0.h / 2,
        };
        var snapped = archSnapWorldRect(twr, snapExclude || { kind: 'cbox', id: firstStart.id });
        snapDx = snapped.left - firstStart.x;
        snapDy = snapped.top - firstStart.y;
        archDragGuidesShow(snapped.guides);
      }
    } else if (firstStart.kind === 'node') {
      var wr = archDragGetWorldRect(firstStart.id, { x: firstStart.x + dx, y: firstStart.y + dy });
      var snappedN = archSnapWorldRect(wr, snapExclude || { kind: 'node', id: firstStart.id });
      snapDx = snappedN.left - (wr.left - dx);
      snapDy = snappedN.top - (wr.top - dy);
      archDragGuidesShow(snappedN.guides);
    }

    archMoveBatch.refs.forEach(function (ref) {
      var s = archMoveBatch.starts[ref];
      if (!s) return;
      var nx = s.x + snapDx;
      var ny = s.y + snapDy;
      if (s.kind === 'cbox') {
        var box = archCustomBoxFind(s.id);
        if (!box) return;
        var bn = archCustomBoxNormalize(box);
        nx = archClamp(nx, 0, ARCH_GUIDE_VIEW.w - bn.w);
        ny = archClamp(ny, 0, ARCH_GUIDE_VIEW.h - bn.h);
        box.x = nx;
        box.y = ny;
      } else if (s.kind === 'label') {
        archLabel.state.pos[s.id] = { x: nx, y: ny };
        var el = qs('[data-arch-id="' + s.id + '"]');
        if (el) {
          var tgt = archLabelTransformTarget(el);
          tgt.setAttribute('transform', 'translate(' + nx + ',' + ny + ')');
        }
      } else if (s.kind === 'node') {
        if (!archDrag.pos[s.id]) archDrag.pos[s.id] = { x: 0, y: 0 };
        archDrag.pos[s.id].x = nx;
        archDrag.pos[s.id].y = ny;
      }
    });
    archDragApply();
    archCustomBoxesRender();
    archUserLineRender();
  }

  function archMoveBatchEnd() {
    archMoveBatch = null;
    archDragGuidesClear();
  }

  function archDiagramGroupsPersist() {
    try {
      var raw = localStorage.getItem(LS_MASTER);
      var data = raw ? JSON.parse(raw) : archMasterSerialize();
      var G = archGroupsApi();
      data.groups = G ? G.normalizeGroups(archDiagramGroups) : archDiagramGroups.slice();
      data.version = 14;
      localStorage.setItem(LS_MASTER, JSON.stringify(data));
    } catch (e) {}
  }

  function archDiagramGroupSelection() {
    if (!archIsEditMode()) return;
    var G = archGroupsApi();
    if (!G) return;
    var refs = archEditMultiToArray().filter(G.isGroupableRef);
    if (refs.length < 2) {
      if (liveRegion) liveRegion.textContent = 'Select two or more shapes, labels, or tiles to group.';
      return;
    }
    if (G.anyMemberInGroup(refs, archDiagramGroups)) {
      if (liveRegion) liveRegion.textContent = 'Ungroup first — a selected object is already in a group.';
      return;
    }
    var grp = G.createGroup(refs, archDiagramGroups);
    if (!grp) return;
    archDiagramGroupsPersist();
    archUndoMaybePushSnapshot();
    if (liveRegion) liveRegion.textContent = 'Grouped ' + refs.length + ' objects — drag any member to move together.';
  }

  function archDiagramUngroupSelection() {
    if (!archIsEditMode()) return;
    var G = archGroupsApi();
    if (!G) return;
    var refs = archEditMultiToArray();
    if (!refs.length) {
      if (liveRegion) liveRegion.textContent = 'Select a grouped object to ungroup.';
      return;
    }
    var grp = G.findGroupForMember(refs[0], archDiagramGroups);
    if (!grp) {
      if (liveRegion) liveRegion.textContent = 'Selection is not part of a group.';
      return;
    }
    G.dissolveGroup(grp.id, archDiagramGroups);
    archDiagramGroupsPersist();
    archUndoMaybePushSnapshot();
    if (liveRegion) liveRegion.textContent = 'Ungrouped — objects keep their positions.';
  }

  function archDiagramCanGroupSelection() {
    var G = archGroupsApi();
    if (!G || !archIsEditMode()) return false;
    var refs = archEditMultiToArray().filter(G.isGroupableRef);
    return refs.length >= 2 && !G.anyMemberInGroup(refs, archDiagramGroups);
  }

  function archDiagramCanUngroupSelection() {
    var G = archGroupsApi();
    if (!G || !archIsEditMode()) return false;
    var refs = archEditMultiToArray();
    return !!(refs.length && G.findGroupForMember(refs[0], archDiagramGroups));
  }

  function archContextMenuEnsure() {
    if (archContextMenuEl) return archContextMenuEl;
    var el = document.createElement('div');
    el.id = 'archDiagramContextMenu';
    el.className = 'arch-diagram-context-menu arch-diagram-ui';
    el.hidden = true;
    el.setAttribute('role', 'menu');
    document.body.appendChild(el);
    archContextMenuEl = el;
    return el;
  }

  function archContextMenuClose() {
    if (archContextMenuEl) archContextMenuEl.hidden = true;
  }

  function archContextMenuBuildModel() {
    var hasSel = !!(
      archEditMultiToArray().length ||
      archCustomBoxSelectedId ||
      userLines.selectedId ||
      archLabelSelectedId ||
      (archSelection && archSelection.count() > 0)
    );
    var canText =
      !!archLabelSelectedId ||
      !!(archCustomBoxSelectedId && archCustomBoxLabelActiveId === archCustomBoxSelectedId);
    var canLayer = archLayerOrderCanAdjust();
    return [
      { id: 'cut', label: 'Cut', shortcut: '⌘X', disabled: !hasSel, action: archDiagramCutSelection },
      { id: 'copy', label: 'Copy', shortcut: '⌘C', disabled: !hasSel, action: archDiagramCopySelection },
      { id: 'paste', label: 'Paste', shortcut: '⌘V', disabled: !archDiagramClipboard, action: archDiagramPasteClipboard },
      { id: 'duplicate', label: 'Duplicate', shortcut: '⌘D', disabled: !hasSel, action: archDiagramDuplicateSelection },
      { id: 'sep1', separator: true },
      { id: 'group', label: 'Group', shortcut: '⌘G', disabled: !archDiagramCanGroupSelection(), action: archDiagramGroupSelection },
      { id: 'ungroup', label: 'Ungroup', shortcut: '⌘⇧G', disabled: !archDiagramCanUngroupSelection(), action: archDiagramUngroupSelection },
      { id: 'sep2', separator: true },
      { id: 'front', label: 'Bring to Front', shortcut: '⌘]', disabled: !canLayer, action: function () { archLayerOrderToExtreme(true); } },
      { id: 'back', label: 'Send to Back', shortcut: '⌘[', disabled: !canLayer, action: function () { archLayerOrderToExtreme(false); } },
      { id: 'sep3', separator: true },
      { id: 'editText', label: 'Edit Text', disabled: !canText, action: archContextMenuEditText },
      { id: 'delete', label: 'Delete', shortcut: '⌫', disabled: !hasSel, action: archContextMenuDelete },
    ];
  }

  function archContextMenuEditText() {
    if (archLabelSelectedId) {
      var te = qs('[data-arch-id="' + archLabelSelectedId + '"]');
      if (te) archLabelOpenEditor(te, { force: true });
      return;
    }
    if (archCustomBoxSelectedId && archCustomBoxLabelActiveId === archCustomBoxSelectedId) {
      var g = qs('#node-cbox-' + archCustomBoxSelectedId);
      var tx = g && g.querySelector('.arch-custom-box-label');
      if (tx) archLabelOpenEditor(tx, { force: true, kind: 'cbox', boxId: archCustomBoxSelectedId });
    }
  }

  function archContextMenuDelete() {
    var ev = { preventDefault: function () {}, key: 'Delete' };
    archUserLineOnGlobalDelete(ev);
  }

  function archContextMenuShow(clientX, clientY) {
    if (!archIsEditMode()) return;
    var menu = archContextMenuEnsure();
    var items = archContextMenuBuildModel();
    menu.textContent = '';
    items.forEach(function (item) {
      if (item.separator) {
        var sep = document.createElement('div');
        sep.className = 'arch-diagram-context-menu__sep';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'arch-diagram-context-menu__item';
      btn.setAttribute('role', 'menuitem');
      btn.disabled = !!item.disabled;
      var lab = document.createElement('span');
      lab.className = 'arch-diagram-context-menu__label';
      lab.textContent = item.label;
      btn.appendChild(lab);
      if (item.shortcut) {
        var sc = document.createElement('span');
        sc.className = 'arch-diagram-context-menu__shortcut';
        sc.textContent = item.shortcut;
        btn.appendChild(sc);
      }
      if (!item.disabled && typeof item.action === 'function') {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          archContextMenuClose();
          item.action();
        });
      }
      menu.appendChild(btn);
    });
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    var left = Math.min(clientX, window.innerWidth - mw - 8);
    var top = Math.min(clientY, window.innerHeight - mh - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  }

  function archContextMenuInit() {
    if (document.documentElement.getAttribute('data-arch-ctx-menu')) return;
    document.documentElement.setAttribute('data-arch-ctx-menu', '1');
    document.addEventListener(
      'pointerdown',
      function (e) {
        if (!archContextMenuEl || archContextMenuEl.hidden) return;
        if (e.target && e.target.closest && e.target.closest('#archDiagramContextMenu')) return;
        archContextMenuClose();
      },
      true
    );
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'Escape') archContextMenuClose();
      },
      true
    );
  }

  function archDiagramContextMenuOnCanvas(e) {
    if (!archIsEditMode()) return;
    if (userLines.drawMode || customBoxDrawMode) return;
    if (e.target && e.target.closest && e.target.closest('.arch-diagram-ui')) return;
    e.preventDefault();
    e.stopPropagation();
    archContextMenuShow(e.clientX, e.clientY);
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
      archCustomBoxes = archCustomBoxesDefaultArray();
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
    var bgPlate = e.target.closest && e.target.closest('.arch-bg-plate[data-arch-bg]');
    if (bgPlate) {
      var bgId = bgPlate.getAttribute('data-arch-bg');
      if (bgId && !archHiddenBackgroundsHas(bgId)) {
        e.stopPropagation();
        archBgSelect(bgId);
        return;
      }
    }
    if (g && g.id && g.id.indexOf('node-') === 0 && g.id.indexOf('node-cbox-') !== 0) {
      var key = g.id.slice(5);
      if (!NODE_LAYOUT[key]) return;
      e.stopPropagation();
      archBgClearSelection();
      archLabelClearSelection();
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      if (e.shiftKey) archEditMultiToggle(archMemberRef('node', key), true);
      else archEditMultiSetMany([archMemberRef('node', key)], archMemberRef('node', key));
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
      return;
    }
    if (!e.shiftKey) {
      archDiagramDeselectAll();
      archLabelCloseInlineEditor(true);
      return;
    }
  }

  function archFlowClearSelection() {
    if (!archSelectedFlowId) return;
    var prev = document.getElementById(archSelectedFlowId);
    if (prev) prev.classList.remove('arch-flow--selected');
    archSelectedFlowId = null;
    archFlowSelectedHandleIdx = null;
    archFlowFloatSetJunction(false);
    archEditLineHandlesRefresh();
    archLineFloatUpdateVisibility();
  }

  function archFlowSelect(id) {
    archFlowClearSelection();
    var el = id && document.getElementById(id);
    if (!el || !el.classList.contains('arch-flow') || archHiddenFlowsHas(id)) return;
    archSelectedFlowId = id;
    archFlowSelectedHandleIdx = null;
    el.classList.add('arch-flow--selected');
    // Clear other selections so Delete unambiguously targets the flow.
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    archLabelClearSelection();
    archBgClearSelection();
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    if (archSelection) archSelection.clear();
    archCustomBoxesRender();
    archUserLineRender();
    archUserLineSyncPropsHud();
    archSelectionRefreshDom();
    archEditLineHandlesRefresh();
    archLineFloatUpdateVisibility();
    archLayerOrderSyncUi();
    if (liveRegion) {
      liveRegion.textContent =
        'Built-in flow selected — drag handles to bend, Corner tool to add bends, Reset to restore auto-route.';
    }
  }

  function archFlowDeleteSelected() {
    if (!archSelectedFlowId) return;
    var id = archSelectedFlowId;
    archFlowClearOverride(id);
    archHiddenFlowsAdd(id);
    archFlowClearSelection();
    var el = document.getElementById(id);
    if (el) {
      el.classList.remove('is-visible');
      el.classList.remove('arch-flow--selected');
      el.removeAttribute('data-flow-kind');
      el.style.stroke = '';
    }
    if (liveRegion) liveRegion.textContent = 'Flow line removed from this proposal.';
    try { archUndoMaybePushSnapshot && archUndoMaybePushSnapshot(); } catch (e) {}
  }

  function archDiagramFlowClick(e) {
    if (!archIsEditMode()) return;
    if (archGetActiveTool() !== 'select') return;
    if (e.target && e.target.closest && e.target.closest('.arch-diagram-ui')) return;
    var flowId = archFlowIdFromTarget(e.target);
    if (!flowId) return;
    var t = document.getElementById(flowId);
    if (!t || !t.classList.contains('arch-flow')) return;
    if (archHiddenFlowsHas(t.id)) return;
    if (!t.classList.contains('is-visible')) return;
    e.stopPropagation();
    if (archFlowFloatJunctionMode) {
      archFlowSelect(t.id);
      archFlowTryInsertBendAtClient(t.id, e.clientX, e.clientY);
      return;
    }
    archFlowSelect(t.id);
  }

  /**
   * Double-click selects a platform node, custom box, or connector (caller enables Edit mode).
   * archSelectionPanelSync enables Move / Labels via archEditorApplyModesForCurrentSelection.
   * @returns {boolean} true when the event was handled (label/flow/box/node/line/bg).
   */
  function archDiagramDblClickSelect(e) {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return false;
    if (userLines.drawMode || customBoxDrawMode) return false;
    if (e.target && e.target.closest && e.target.closest('.arch-diagram-ui')) return false;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return false;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle--cbox')) return false;

    if (archDrag && archDrag.svg) {
      var sp0 = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
      var nearFlowId = archFlowPickNearestVisible(sp0.x, sp0.y, FLOW_PICK_NEAR_LABEL_MAX_DIST);
      if (nearFlowId) {
        e.preventDefault();
        e.stopPropagation();
        archFlowSelect(nearFlowId);
        return true;
      }
      var flowLbl = archFlowLabelAtSvgPoint(sp0.x, sp0.y);
      if (flowLbl) {
        e.preventDefault();
        e.stopPropagation();
        var lid = flowLbl.getAttribute('data-arch-id');
        archLabelSelect(lid, flowLbl);
        archLabelOpenEditor(flowLbl, { force: true });
        return true;
      }
    }

    var flowId = archFlowIdFromTarget(e.target);
    var flowEl = flowId ? document.getElementById(flowId) : null;
    if (flowEl && flowEl.classList.contains('is-visible') && !archHiddenFlowsHas(flowEl.id)) {
      e.preventDefault();
      e.stopPropagation();
      archFlowSelect(flowEl.id);
      return true;
    }

    var ul = e.target.closest && e.target.closest('.arch-user-line, .arch-user-line-hit');
    if (ul && ul.getAttribute) {
      var lid = ul.getAttribute('data-user-line-id');
      if (lid) {
        userLines.selectedId = lid;
        userLines.selectedHandleIdx = null;
        archFlowClearSelection();
        archBgClearSelection();
        archLabelClearSelection();
        archCustomBoxSelectedId = null;
        archCustomBoxLabelActiveId = null;
        if (archSelection) archSelection.clear();
        archCustomBoxesRender();
        archUserLineRender();
        archUserLineSyncPropsHud();
        archSelectionRefreshDom();
        if (liveRegion) liveRegion.textContent = 'Connector selected — drag to move, handles to adjust path.';
        return true;
      }
    }

    var bgPlate = e.target.closest && e.target.closest('.arch-bg-plate[data-arch-bg]');
    if (bgPlate) {
      var bgId = bgPlate.getAttribute('data-arch-bg');
      if (bgId && !archHiddenBackgroundsHas(bgId)) {
        e.preventDefault();
        e.stopPropagation();
        archBgSelect(bgId);
        return true;
      }
    }

    var g = e.target.closest && e.target.closest('g.arch-node');
    if (!g || !g.id || g.id.indexOf('node-') !== 0) return false;

    if (g.classList.contains('arch-custom-box')) {
      var rawId = g.id.replace(/^node-cbox-/, '');
      if (!rawId) return false;
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      archLabelClearSelection();
      archBgClearSelection();
      archEditMultiSetMany([archMemberRef('cbox', rawId)], archMemberRef('cbox', rawId));
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      archSelectionRefreshDom();
      if (liveRegion) liveRegion.textContent = 'Shape selected — drag to move, handles to resize, Delete to remove.';
      return true;
    }

    var key = g.id.slice(5);
    if (!NODE_LAYOUT[key]) return false;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    archLabelClearSelection();
    archBgClearSelection();
    if (e.shiftKey) archEditMultiToggle(archMemberRef('node', key), true);
    else archEditMultiSetMany([archMemberRef('node', key)], archMemberRef('node', key));
    archCustomBoxesRender();
    archUserLineRender();
    archUserLineSyncPropsHud();
    archSelectionRefreshDom();
    if (liveRegion) liveRegion.textContent = 'Tile selected — drag to move, corners to resize.';
    return true;
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
    archViewport.classList.remove('arch-int-viewport--flow-float-open');
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
    archLabelClearSelection();
    archBgClearSelection();
    archSelectionRefreshDom();
    archCustomBoxesRender();
  }

  /** Switch diagram editor rail tab (layout | highlights | sources | spectrum-icons | file | assist | none). */
  function archEditorSetPanel(panelId) {
    var prev = archEditorActivePanelId;
    var valid = ['layout', 'highlights', 'sources', 'spectrum-icons', 'file', 'assist'];
    archEditorActivePanelId = valid.indexOf(panelId) >= 0 ? panelId : null;
    if (prev === 'spectrum-icons' && archEditorActivePanelId !== 'spectrum-icons') {
      archLogoLibraryEditModeSet(false);
    }
    try {
      localStorage.setItem(LS_ARCH_ACTIVE_TOOL, archGetActiveTool());
    } catch (e) {}
    var editorPanel = qs('#archEditorPanel');
    if (editorPanel) {
      /* Hide side column for Tools + Lines (floating UI on canvas), and when no rail tab is selected — avoids empty white strip. */
      editorPanel.classList.toggle(
        'arch-editor-panel--layout-float-only',
        !archEditorActivePanelId ||
          archEditorActivePanelId === 'layout' ||
          archEditorActivePanelId === 'sources'
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
      archCustomLogoMetadataEditorClose();
      archSpectrumIconsPanelInit();
      archArchitectureLogosPanelInit();
      archCustomLogoUploadFormInit();
    }
    archUserLineSyncDrawModeFromEditor();
    var selectToolOn = !!(archIsEditMode() && archGetActiveTool() === 'select');
    archDragSetEnabled(selectToolOn);
    archLabelSetEnabled(false);
    if (archGetActiveTool() !== 'select') archEditorClearNodeAndBoxSelection();
    archEditorSyncLinesDockChrome();
    if (archEditorActivePanelId !== 'layout') {
      archToolsFloatSetOpen(false);
    } else if (prev !== 'layout') {
      archToolsFloatSetOpen(true);
    }
  }

  function archBuildApplyCtx() {
    var states = TE ? TE.getStates() : [];
    var dots = TE ? TE.getDotButtons() : [];
    return {
      viewport: archViewport,
      hudTitle: hudTitle,
      hudMeta: hudMeta,
      stateKicker: stateKicker,
      stateHeadline: stateHeadline,
      stateBody: stateBody,
      dotButtons: dots,
      liveRegion: liveRegion,
      totalStates: states.length,
      selectedFlowId: archSelectedFlowId,
      flowElements: $all('.arch-flow'),
      userLineElements: $all('#layer-user-lines .arch-user-line'),
      isEditMode: archIsEditMode(),
      isFlowHidden: archHiddenFlowsHas,
      refreshNodeHighlights: function (hilites) {
        $all('.arch-node').forEach(function (el) {
          el.classList.toggle('is-highlighted', hilites.indexOf(el.id) >= 0);
        });
        var aepBg = qs('#arch-bg-aep-platform');
        if (aepBg) aepBg.classList.toggle('is-highlighted', hilites.indexOf('node-aep') >= 0);
      },
      onAfterApply: function () {
        if (TE) {
          TE.highlightPickerSync();
          TE.editorSync();
        }
        archFlowHandlesRefresh();
        archLineFloatUpdateVisibility();
      },
    };
  }

  function archRefreshNodeHighlightClasses() {
    var hilites = TE ? TE.highlightsForState(idx) : [];
    $all('.arch-node').forEach(function (el) {
      el.classList.toggle('is-highlighted', hilites.indexOf(el.id) >= 0);
    });
    var aepBg = qs('#arch-bg-aep-platform');
    if (aepBg) aepBg.classList.toggle('is-highlighted', hilites.indexOf('node-aep') >= 0);
  }

  function applyState() {
    var st = TE ? TE.resolvedState(idx) : null;
    if (!st) return;
    if (PB && PB.applyStateToDom) {
      PB.applyStateToDom(archBuildApplyCtx(), idx, st);
      return;
    }
    archRefreshNodeHighlightClasses();
    var activeIds = {};
    (st.flows || []).forEach(function (f) {
      activeIds[f.id] = f;
    });
    $all('.arch-flow').forEach(function (path) {
      var spec = activeIds[path.id];
      var hidden = archHiddenFlowsHas(path.id);
      if (archIsEditMode()) {
        if (hidden) {
          path.classList.remove('is-visible');
          path.classList.remove('arch-flow--selected');
          path.classList.remove('arch-flow--edit-dim');
          path.removeAttribute('data-flow-kind');
          path.style.stroke = '';
          return;
        }
        path.classList.add('is-visible');
        path.classList.toggle('arch-flow--edit-dim', !spec);
        path.classList.toggle('arch-flow--selected', archSelectedFlowId === path.id);
        if (spec) {
          path.style.stroke = spec.stroke;
          path.setAttribute('data-flow-kind', spec.kind || 'intra');
        } else {
          path.style.stroke = 'var(--dash-muted, #94a3b8)';
          path.setAttribute('data-flow-kind', 'intra');
        }
        return;
      }
      if (!spec || hidden) {
        path.classList.remove('is-visible');
        path.classList.remove('arch-flow--selected');
        path.classList.remove('arch-flow--edit-dim');
        path.removeAttribute('data-flow-kind');
        path.style.stroke = '';
        return;
      }
      path.style.stroke = spec.stroke;
      path.setAttribute('data-flow-kind', spec.kind || 'intra');
      path.classList.add('is-visible');
      path.classList.remove('arch-flow--edit-dim');
      path.classList.toggle('arch-flow--selected', archSelectedFlowId === path.id);
    });
    archFlowHitsEnsureAll();
    if (archIsEditMode()) {
      archFlowHandlesRefresh();
      archLineFloatUpdateVisibility();
    }
    var statesLen = TE ? TE.getStates().length : 1;
    if (hudTitle) hudTitle.textContent = st.label;
    if (hudMeta) hudMeta.textContent = 'Slide ' + (idx + 1) + ' / ' + statesLen;
    if (stateKicker) stateKicker.textContent = 'Slide ' + (idx + 1) + ' of ' + statesLen;
    if (stateHeadline) stateHeadline.textContent = st.headline || '';
    if (stateBody) stateBody.textContent = st.body || '';
    var dots = TE ? TE.getDotButtons() : [];
    dots.forEach(function (btn, i) {
      btn.setAttribute('aria-current', i === idx ? 'true' : 'false');
    });
    if (liveRegion) {
      liveRegion.textContent = 'Slide ' + (idx + 1) + ' of ' + statesLen + ': ' + (st.headline || st.label);
    }
    if (archViewport) archViewport.classList.toggle('arch-int-viewport--intro', idx === 0);
    if (TE) {
      TE.highlightPickerSync();
      TE.editorSync();
    }
  }

  function go(delta) {
    if (TE) TE.playStop();
    var states = TE ? TE.getStates() : [];
    var n = idx + delta;
    if (n < 0 || n >= states.length) return;
    idx = n;
    applyState();
  }

  function goTo(i) {
    if (TE) TE.goTo(i);
    else {
      idx = i;
      applyState();
    }
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
    archInstallTourEditor();

    var mainPresentationEl = qs('main.dashboard-main.app-page');
    try {
      if (localStorage.getItem('aepArchHideControls') === '1') {
        localStorage.setItem(LS_ARCH_EDIT, '0');
      }
      localStorage.removeItem('aepArchHideControls');
    } catch (e) {}

    archStateHighlightOverridesLoad();
    archHiddenFlowsLoad();
    archHiddenNodesLoad();
    archHiddenBackgroundsLoad();
    archLayerOrderLoad();
    archFlowOverridesLoad();
    if (TE) TE.highlightPickerInit();
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

    if (TE) {
      TE.playInitControls();
      TE.initEditor();
    }

    function archBootstrapAfterTourLoad() {
      if (TE) TE.rebuildDots();
      applyState();
    }

    var tourBoot = TE ? TE.initFromDefault() : Promise.resolve();
    if (tourBoot && typeof tourBoot.then === 'function') {
      tourBoot.then(archBootstrapAfterTourLoad).catch(archBootstrapAfterTourLoad);
    } else {
      archBootstrapAfterTourLoad();
    }

    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      if (e.key === 'Escape' && archIsPresentationFullscreen()) {
        return;
      }
      if (e.key === 'Escape' && archViewport && archViewport.classList.contains('arch-int-viewport--editing-tools-hidden')) {
        e.preventDefault();
        try {
          localStorage.setItem(LS_ARCH_EDIT, '1');
        } catch (err) {}
        var emt = qs('#archEditModeToggle');
        if (emt) emt.checked = true;
        archEditorApplyEditMode();
        return;
      }
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
      if (archViewport) {
        archViewport.classList.toggle('arch-int-viewport--edit-mode', on);
        archViewport.classList.toggle('arch-int-viewport--editing-tools-hidden', !on);
      }
      var fab = qs('#archShowControlsFab');
      if (fab) fab.hidden = !!on;
      if (on && !archEditModeWasOn) {
        archEditorSetPanel(null);
      }
      var selectToolOn = !!(on && archGetActiveTool() === 'select');
      archDragSetEnabled(selectToolOn);
      archLabelSetEnabled(false);
      if (!on) archToolsFloatSetOpen(false);
      archUserLineSyncDrawModeFromEditor();
      archEditorSyncLinesDockChrome();
      archSyncPlaybackNav();
      archSelectionPanelSync();
      archLineFloatUpdateVisibility();
      archFlowFloatUpdateVisibility();
      /** Re-sync connector handles: they only exist in edit mode; without a render they stay in the DOM when edit is turned off. */
      archUserLineRender();
      if (!on) {
        archEditorClearNodeAndBoxSelection();
        archFlowClearSelection();
      }
      archEditModeWasOn = on;
    }
    archEditorApplyEditModeHook = archEditorApplyEditMode;

    var LS_ARCH_DOCK = 'aepArchEditorDockRight';

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

    var showControlsFab = qs('#archShowControlsFab');
    if (showControlsFab) {
      showControlsFab.addEventListener('click', function () {
        try {
          localStorage.setItem(LS_ARCH_EDIT, '1');
        } catch (e) {}
        var emt = qs('#archEditModeToggle');
        if (emt) emt.checked = true;
        archEditorApplyEditMode();
      });
    }

    var archPresentationFsBtn = qs('#archPresentationFullscreenBtn');
    function archPresentationFsSync() {
      var on = archIsPresentationFullscreen();
      if (mainPresentationEl) mainPresentationEl.classList.toggle('arch-main--presentation-fs', on);
      if (archPresentationFsBtn) {
        var fsEnter =
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
          '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
          '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
          '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
          '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75Z"/>' +
          '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
          '</svg>';
        var fsExit =
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
          '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
          '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
          '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
          '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75Z"/>' +
          '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
          '</svg>';
        archPresentationFsBtn.innerHTML = on ? fsExit : fsEnter;
        archPresentationFsBtn.classList.add('aep-fullscreen-btn');
        archPresentationFsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        archPresentationFsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
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

  /** exclude: null | node key string | { kind: 'node'|'cbox'|'label', id: string } */
  function archDragNormalizeExclude(exclude) {
    if (!exclude) return null;
    if (typeof exclude === 'string') return { kind: 'node', id: exclude };
    return exclude;
  }

  function archDragExcludeMatch(exclude, kind, id) {
    var ex = archDragNormalizeExclude(exclude);
    return !!(ex && ex.kind === kind && String(ex.id) === String(id));
  }

  /** World-space bbox for a diagram label (includes translate offset). */
  function archLabelWorldRect(labelId) {
    if (!labelId || !archDrag.svg) return null;
    var el = qs('[data-arch-id="' + labelId + '"]');
    if (!el) return null;
    try {
      var bb = el.getBBox();
      if (!bb.width && !bb.height) return null;
      var pt = archDrag.svg.createSVGPoint();
      var ctm = el.getCTM();
      if (!ctm) return null;
      var corners = [
        [bb.x, bb.y],
        [bb.x + bb.width, bb.y],
        [bb.x, bb.y + bb.height],
        [bb.x + bb.width, bb.y + bb.height],
      ];
      var xs = [];
      var ys = [];
      corners.forEach(function (c) {
        pt.x = c[0];
        pt.y = c[1];
        var w = pt.matrixTransform(ctm);
        xs.push(w.x);
        ys.push(w.y);
      });
      var left = Math.min.apply(null, xs);
      var right = Math.max.apply(null, xs);
      var top = Math.min.apply(null, ys);
      var bottom = Math.max.apply(null, ys);
      return {
        left: left,
        top: top,
        right: right,
        bottom: bottom,
        w: right - left,
        h: bottom - top,
        cx: (left + right) / 2,
        cy: (top + bottom) / 2,
      };
    } catch (err) {
      return null;
    }
  }

  function archDragForEachWorldRect(exclude, fn) {
    Object.keys(NODE_LAYOUT).forEach(function (k) {
      if (archDragExcludeMatch(exclude, 'node', k)) return;
      fn(archDragWorldRect(k));
    });
    archCustomBoxes.forEach(function (box) {
      if (archDragExcludeMatch(exclude, 'cbox', box.id)) return;
      fn(archCustomBoxWorldRect(box));
    });
    $all('.arch-int-svg-wrap svg [data-arch-id]').forEach(function (el) {
      var id = el.getAttribute('data-arch-id');
      if (!id || archDragExcludeMatch(exclude, 'label', id)) return;
      fn(archLabelWorldRect(id));
    });
  }

  function archDragCollectAlignmentTargets(exclude) {
    var xs = [];
    var ys = [];
    archDragForEachWorldRect(exclude, function (o) {
      if (!o) return;
      xs.push(o.left, o.cx, o.right);
      ys.push(o.top, o.cy, o.bottom);
    });
    return { xs: xs, ys: ys };
  }

  function archDragCollectVerticalGapSamples(exclude) {
    var seen = {};
    var rects = [];
    archDragForEachWorldRect(exclude, function (r) {
      if (r) rects.push(r);
    });
    for (var i = 0; i < rects.length; i++) {
      for (var j = 0; j < rects.length; j++) {
        if (i === j) continue;
        var a = rects[i];
        var b = rects[j];
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

  function archDragCollectHorizontalGapSamples(exclude) {
    var seen = {};
    var rects = [];
    archDragForEachWorldRect(exclude, function (r) {
      if (r) rects.push(r);
    });
    for (var i = 0; i < rects.length; i++) {
      for (var j = 0; j < rects.length; j++) {
        if (i === j) continue;
        var a = rects[i];
        var b = rects[j];
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

  function archDragFindRectAbove(wr, exclude) {
    var best = null;
    var bestBottom = -1e9;
    archDragForEachWorldRect(exclude, function (r) {
      if (!r || r.bottom >= wr.top - 0.5) return;
      if (r.bottom > bestBottom) {
        bestBottom = r.bottom;
        best = r;
      }
    });
    return best;
  }

  function archDragFindRectLeft(wr, exclude) {
    var best = null;
    var bestRight = -1e9;
    archDragForEachWorldRect(exclude, function (r) {
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

  /** Snap a world-space rect to alignment targets; returns snapped left/top + guide lines. */
  function archSnapWorldRect(wr, exclude) {
    if (!wr) return { left: 0, top: 0, guides: { vx: [], hy: [] } };
    var left = wr.left;
    var top = wr.top;
    var w = wr.w;
    var h = wr.h;

    function wrAt(l, t) {
      return {
        left: l,
        top: t,
        right: l + w,
        bottom: t + h,
        w: w,
        h: h,
        cx: l + w / 2,
        cy: t + h / 2,
      };
    }

    var cur = wrAt(left, top);
    var tgt = archDragCollectAlignmentTargets(exclude);

    var bestAdjX = 0;
    var bestAbsX = ARCH_DRAG_SNAP_PX + 1;
    [cur.left, cur.cx, cur.right].forEach(function (av) {
      tgt.xs.forEach(function (sx) {
        var adj = sx - av;
        if (Math.abs(adj) <= ARCH_DRAG_SNAP_PX && Math.abs(adj) < bestAbsX) {
          bestAbsX = Math.abs(adj);
          bestAdjX = adj;
        }
      });
    });
    left += bestAdjX;
    cur = wrAt(left, top);

    var bestAdjY = 0;
    var bestAbsY = ARCH_DRAG_SNAP_PX + 1;
    [cur.top, cur.cy, cur.bottom].forEach(function (av) {
      tgt.ys.forEach(function (sy) {
        var adj = sy - av;
        if (Math.abs(adj) <= ARCH_DRAG_SNAP_PX && Math.abs(adj) < bestAbsY) {
          bestAbsY = Math.abs(adj);
          bestAdjY = adj;
        }
      });
    });
    top += bestAdjY;
    cur = wrAt(left, top);

    var gapHy = [];
    var gapVx = [];

    var vGaps = archDragCollectVerticalGapSamples(exclude);
    var above = archDragFindRectAbove(cur, exclude);
    if (above && vGaps.length) {
      var cvg = cur.top - above.bottom;
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
        top += bestG - cvg;
        cur = wrAt(left, top);
        gapHy.push(above.bottom, cur.top);
      }
    }

    var hGaps = archDragCollectHorizontalGapSamples(exclude);
    var leftN = archDragFindRectLeft(cur, exclude);
    if (leftN && hGaps.length) {
      var chg = cur.left - leftN.right;
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
        left += bestHg - chg;
        cur = wrAt(left, top);
        gapVx.push(leftN.right, cur.left);
      }
    }

    tgt = archDragCollectAlignmentTargets(exclude);
    var guides = archDragGuidesForRect(cur, tgt);
    gapHy.forEach(function (y) {
      if (guides.hy.indexOf(y) < 0) guides.hy.push(y);
    });
    gapVx.forEach(function (x) {
      if (guides.vx.indexOf(x) < 0) guides.vx.push(x);
    });
    return { left: left, top: top, guides: guides };
  }

  function archDragSnapBoxPosition(activeKey, ox, oy, startOw, startOh) {
    var posBase = { x: ox, y: oy };
    if (startOw != null) posBase.w = startOw;
    if (startOh != null) posBase.h = startOh;

    var wr = archDragGetWorldRect(activeKey, posBase);
    if (!wr) return { ox: ox, oy: oy, guides: { vx: [], hy: [] } };

    var snapped = archSnapWorldRect(wr, activeKey);
    var L = NODE_LAYOUT[activeKey];
    return {
      ox: snapped.left - L.base[0] - L.rect[0],
      oy: snapped.top - L.base[1] - L.rect[1],
      guides: snapped.guides,
    };
  }

  var ARCH_CONTAINER_ALIGN_PAD = 8;

  function archContainerGetSelected() {
    if (archCustomBoxSelectedId) {
      return { kind: 'cbox', id: archCustomBoxSelectedId };
    }
    if (archSelection && archSelection.count() === 1) {
      var pid = archSelection.primary;
      if (pid && pid.indexOf('node-') === 0 && pid.indexOf('node-cbox-') !== 0) {
        var key = pid.slice(5);
        if (NODE_LAYOUT[key]) return { kind: 'node', id: key };
      }
    }
    return null;
  }

  function archContainerWorldRect(sel) {
    if (!sel) return null;
    if (sel.kind === 'node') return archDragWorldRect(sel.id);
    if (sel.kind === 'cbox') return archCustomBoxWorldRect(archCustomBoxFind(sel.id));
    return null;
  }

  function archRectCenterInside(inner, outer) {
    if (!inner || !outer) return false;
    return inner.cx >= outer.left && inner.cx <= outer.right && inner.cy >= outer.top && inner.cy <= outer.bottom;
  }

  function archContainerFindChildrenInside(parentWR, parentSel) {
    var children = [];
    var seen = {};
    function pushChild(ch) {
      if (!ch || !ch.wr || seen[ch.key]) return;
      seen[ch.key] = true;
      children.push(ch);
    }
    if (parentSel.kind === 'node') {
      var g = qs('#node-' + parentSel.id);
      if (g) {
        g.querySelectorAll('[data-arch-id]').forEach(function (el) {
          var id = el.getAttribute('data-arch-id');
          if (!id) return;
          var wr = archLabelWorldRect(id);
          if (wr && archRectCenterInside(wr, parentWR)) {
            pushChild({ kind: 'label', id: id, wr: wr, key: 'label:' + id });
          }
        });
      }
    }
    $all('.arch-int-svg-wrap svg [data-arch-id]').forEach(function (el) {
      var id = el.getAttribute('data-arch-id');
      if (!id) return;
      if (parentSel.kind === 'node' && el.closest('#node-' + parentSel.id)) return;
      var wr = archLabelWorldRect(id);
      if (wr && archRectCenterInside(wr, parentWR)) {
        pushChild({ kind: 'label', id: id, wr: wr, key: 'label:' + id });
      }
    });
    archCustomBoxes.forEach(function (box) {
      if (parentSel.kind === 'cbox' && box.id === parentSel.id) return;
      var wr = archCustomBoxWorldRect(box);
      if (wr && archRectCenterInside(wr, parentWR)) {
        pushChild({ kind: 'cbox', id: box.id, wr: wr, key: 'cbox:' + box.id });
      }
    });
    return children;
  }

  function archContainerAlignSyncUi() {
    var seg = qs('#archContainerAlignSeg');
    if (!seg) return;
    var sel = archContainerGetSelected();
    var show = !!(sel && archIsEditMode() && archGetActiveTool() === 'select');
    seg.hidden = !show;
    if (!show) return;
    var parentWR = archContainerWorldRect(sel);
    var kids = parentWR ? archContainerFindChildrenInside(parentWR, sel) : [];
    $all('.arch-container-align-btn', seg).forEach(function (btn) {
      btn.disabled = kids.length === 0;
    });
  }

  function archContainerAlignInside(mode) {
    var sel = archContainerGetSelected();
    if (!sel) return;
    var parentWR = archContainerWorldRect(sel);
    if (!parentWR) return;
    var children = archContainerFindChildrenInside(parentWR, sel);
    if (!children.length) return;
    var pad = ARCH_CONTAINER_ALIGN_PAD;
    var inner = {
      left: parentWR.left + pad,
      top: parentWR.top + pad,
      right: parentWR.right - pad,
      bottom: parentWR.bottom - pad,
      cx: parentWR.cx,
      cy: parentWR.cy,
    };
    var union = {
      left: Infinity,
      top: Infinity,
      right: -Infinity,
      bottom: -Infinity,
    };
    children.forEach(function (ch) {
      union.left = Math.min(union.left, ch.wr.left);
      union.top = Math.min(union.top, ch.wr.top);
      union.right = Math.max(union.right, ch.wr.right);
      union.bottom = Math.max(union.bottom, ch.wr.bottom);
    });
    union.cx = (union.left + union.right) / 2;
    union.cy = (union.top + union.bottom) / 2;
    var dx = 0;
    var dy = 0;
    if (mode === 'left') dx = inner.left - union.left;
    else if (mode === 'center') dx = inner.cx - union.cx;
    else if (mode === 'right') dx = inner.right - union.right;
    else if (mode === 'top') dy = inner.top - union.top;
    else if (mode === 'middle') dy = inner.cy - union.cy;
    else if (mode === 'bottom') dy = inner.bottom - union.bottom;
    else return;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    children.forEach(function (ch) {
      if (ch.kind === 'label') {
        var cur = archLabel.state.pos[ch.id] || { x: 0, y: 0 };
        archLabel.state.pos[ch.id] = { x: (cur.x || 0) + dx, y: (cur.y || 0) + dy };
      } else if (ch.kind === 'cbox') {
        var box = archCustomBoxFind(ch.id);
        if (box) {
          box.x += dx;
          box.y += dy;
        }
      }
    });
    archLabelApplyAll();
    archCustomBoxesRender();
    archDragRebuildFlows();
    archUserLineRender();
    archLabelSave();
    archCustomBoxesPersist();
    archDragSave();
    archUndoMaybePushSnapshot();
    archContainerAlignSyncUi();
    if (liveRegion) {
      liveRegion.textContent = 'Aligned ' + children.length + ' object(s) inside the selected box.';
    }
  }

  function archClamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function archFlowSet(id, d) {
    if (id && archFlowOverrides && archFlowOverrides[id]) return;
    var el = qs('#' + id);
    if (el) el.setAttribute('d', d);
    archFlowSyncHit(id);
  }

  function archFlowGetHitEl(flowId) {
    if (!flowId) return null;
    var layer = qs('#layer-flows');
    if (!layer) return null;
    return layer.querySelector('.arch-flow-hit[data-arch-flow-hit-for="' + flowId + '"]');
  }

  function archFlowSyncHit(flowId) {
    if (!flowId) return;
    var el = document.getElementById(flowId);
    if (!el || !el.classList.contains('arch-flow')) return;
    var layer = qs('#layer-flows');
    if (!layer) return;
    var hit = archFlowGetHitEl(flowId);
    if (!hit) {
      hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('class', 'arch-flow-hit');
      hit.setAttribute('data-arch-flow-hit-for', flowId);
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-linecap', 'round');
      hit.setAttribute('stroke-linejoin', 'round');
      if (el.nextSibling) layer.insertBefore(hit, el.nextSibling);
      else layer.appendChild(hit);
    }
    var d = el.getAttribute('d') || '';
    hit.setAttribute('d', d);
    var sw = parseFloat(el.getAttribute('stroke-width') || '2.2', 10);
    if (!isFinite(sw)) sw = 2.2;
    hit.setAttribute('stroke-width', String(Math.max(FLOW_HIT_STROKE_MIN, sw + 10)));
    hit.classList.toggle('is-visible', el.classList.contains('is-visible'));
    hit.classList.toggle('arch-flow--edit-dim', el.classList.contains('arch-flow--edit-dim'));
  }

  function archFlowHitsEnsureAll() {
    var layer = qs('#layer-flows');
    if (!layer) return;
    $all('.arch-flow', layer).forEach(function (p) {
      if (p.id) archFlowSyncHit(p.id);
    });
  }

  function archFlowIdFromTarget(t) {
    if (!t || !t.classList) return null;
    if (t.classList.contains('arch-flow') && t.id) return t.id;
    if (t.classList.contains('arch-flow-hit')) {
      return t.getAttribute('data-arch-flow-hit-for') || null;
    }
    var flowEl = t.closest && t.closest('.arch-flow');
    return flowEl && flowEl.id ? flowEl.id : null;
  }

  function archFlowDistanceToPath(flowId, sx, sy) {
    var pts = archFlowGetPoints(flowId);
    if (!pts || pts.length < 2) return Infinity;
    var minD = Infinity;
    for (var i = 1; i < pts.length; i++) {
      var c = archUserLineClosestPointOnSeg(sx, sy, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      if (c.dist < minD) minD = c.dist;
    }
    return minD;
  }

  function archFlowPickNearestVisible(sx, sy, maxDist) {
    var layer = qs('#layer-flows');
    if (!layer) return null;
    var bestId = null;
    var bestD = maxDist != null ? maxDist : FLOW_PICK_NEAR_LABEL_MAX_DIST;
    $all('.arch-flow', layer).forEach(function (p) {
      if (!p.id || archHiddenFlowsHas(p.id) || !p.classList.contains('is-visible')) return;
      var d = archFlowDistanceToPath(p.id, sx, sy);
      if (d < bestD) {
        bestD = d;
        bestId = p.id;
      }
    });
    return bestId;
  }

  function archFlowLabelAtSvgPoint(sx, sy) {
    var best = null;
    $all('.arch-flow-label[data-arch-id]').forEach(function (t) {
      var id = t.getAttribute('data-arch-id');
      if (!id) return;
      var wr = archLabelWorldRect(id);
      if (!wr) return;
      var pad = 2;
      if (sx < wr.left - pad || sx > wr.right + pad || sy < wr.top - pad || sy > wr.bottom + pad) return;
      best = t;
    });
    return best;
  }

  function archDragRebuildFlows() {
    var t = archDragWorldRect('tags');
    var s = archDragWorldRect('sources');
    var e = archDragWorldRect('edge');
    var st = archDragWorldRect('streaming');
    var b = archDragWorldRect('batch');
    var q = archDragWorldRect('query');
    var intel = archDragWorldRect('intel');
    var lk = archDragWorldRect('lake');
    var pi = archDragWorldRect('pipeline');
    var pr = archDragWorldRect('profile');
    var sg = archDragWorldRect('seg');
    var dec = archDragWorldRect('decision');
    var cr = archDragWorldRect('creative');
    var aem = archDragWorldRect('aem');
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

    if (s && e) {
      var sdkY = archClamp(s.top + 35, s.top + 8, s.bottom - 8);
      var xJoinSdk = e.left - 18;
      d =
        'M ' +
        s.right +
        ' ' +
        sdkY +
        ' L ' +
        xJoinSdk +
        ' ' +
        sdkY +
        ' L ' +
        xJoinSdk +
        ' ' +
        e.bottom +
        ' L ' +
        e.cx +
        ' ' +
        e.bottom +
        ' L ' +
        e.cx +
        ' ' +
        e.top;
      archFlowSet('flow-sdk-edge', d);
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

    if (q && lk) {
      d = 'M ' + q.cx + ' ' + q.bottom + ' L ' + q.cx + ' ' + lk.top;
      archFlowSet('flow-query-lake', d);
      d = 'M ' + (q.cx + 12) + ' ' + lk.top + ' L ' + (q.cx + 12) + ' ' + q.bottom;
      archFlowSet('flow-lake-query', d);
    }

    if (intel && lk) {
      d = 'M ' + intel.cx + ' ' + intel.bottom + ' L ' + intel.cx + ' ' + lk.top;
      archFlowSet('flow-intel-lake', d);
      d = 'M ' + (intel.cx - 12) + ' ' + lk.top + ' L ' + (intel.cx - 12) + ' ' + intel.bottom;
      archFlowSet('flow-lake-intel', d);
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

    if (e && pr) {
      var xBack = pr.left + 14;
      d =
        'M ' +
        xBack +
        ' ' +
        pr.top +
        ' L ' +
        (e.cx - 28) +
        ' ' +
        pr.top +
        ' L ' +
        (e.cx - 28) +
        ' ' +
        e.bottom +
        ' L ' +
        e.cx +
        ' ' +
        e.bottom;
      archFlowSet('flow-profile-edge-back', d);
    }

    if (pr && sg) {
      d = 'M ' + pr.cx + ' ' + pr.bottom + ' L ' + pr.cx + ' ' + sg.top;
      archFlowSet('flow-profile-seg', d);
      d = 'M ' + (pr.cx - 16) + ' ' + sg.top + ' L ' + (pr.cx - 16) + ' ' + pr.bottom;
      archFlowSet('flow-seg-profile-back', d);
    }

    if (pr && dec) {
      var yLookup = pr.top + 26;
      d =
        'M ' +
        pr.right +
        ' ' +
        yLookup +
        ' L ' +
        dec.left +
        ' ' +
        yLookup;
      archFlowSet('flow-profile-decision', d);
    }

    if (sg && dec) {
      var yAct = sg.top + 22;
      d =
        'M ' +
        sg.right +
        ' ' +
        yAct +
        ' L ' +
        dec.left +
        ' ' +
        yAct;
      archFlowSet('flow-seg-decision', d);
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

    if (cr && aem) {
      d = 'M ' + cr.cx + ' ' + cr.bottom + ' L ' + aem.cx + ' ' + aem.top;
      archFlowSet('flow-creative-aem', d);
    }

    if (e && aem) {
      d =
        'M ' +
        (e.right - 8) +
        ' ' +
        e.bottom +
        ' L ' +
        (e.right - 8) +
        ' ' +
        (aem.cy - 6) +
        ' L ' +
        aem.left +
        ' ' +
        aem.cy;
      archFlowSet('flow-edge-aem', d);
    }

    if (aem && dec) {
      d =
        'M ' +
        aem.right +
        ' ' +
        aem.cy +
        ' L ' +
        dec.left +
        ' ' +
        (dec.top + 18);
      archFlowSet('flow-aem-decision', d);
    }

    if (lk) {
      var govBox = archCustomBoxFind('gov-audit');
      var govRect = govBox ? archCustomBoxWorldRect(govBox) : null;
      var govX = govRect ? govRect.cx : lk.left + 12;
      var govY = govRect ? govRect.cy : lk.bottom + 126;
      d = 'M ' + (lk.left + 12) + ' ' + lk.bottom + ' L ' + govX + ' ' + govY;
      archFlowSet('flow-lake-gov', d);
    }

    if (lk && cja) {
      var yRawCja = lk.top + 28;
      d =
        'M ' +
        lk.right +
        ' ' +
        yRawCja +
        ' L ' +
        cja.left +
        ' ' +
        cja.cy;
      archFlowSet('flow-lake-cja', d);
    }

    if (lk && mix) {
      var yRawMix = lk.top + 44;
      d =
        'M ' +
        lk.right +
        ' ' +
        yRawMix +
        ' L ' +
        mix.left +
        ' ' +
        mix.cy;
      archFlowSet('flow-lake-mix', d);
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
    archFlowApplyOverrides();
  }

  function archDragApply() {
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var g = qs('#node-' + key);
      if (!g) return;
      var L = NODE_LAYOUT[key];
      var p = archDrag.pos[key] || { x: 0, y: 0 };
      var tx = L.base[0] + p.x;
      var ty = L.base[1] + p.y;
      var nodeAngle = p.angle || 0;
      var wh0 = archNodeEffectiveWH(key);
      var nodePivotX = L.rect[0] + wh0.w / 2;
      var nodePivotY = L.rect[1] + wh0.h / 2;
      var nodeTfm = nodeAngle
        ? 'translate(' + (tx + nodePivotX) + ',' + (ty + nodePivotY) + ') rotate(' + nodeAngle + ') translate(' + (-nodePivotX) + ',' + (-nodePivotY) + ')'
        : 'translate(' + tx + ',' + ty + ')';
      g.setAttribute('transform', nodeTfm);
      var shell = g.querySelector('[data-arch-shell], [data-arch-hit]');
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
    archAepBgPlateSync();
  }

  function archEnsureResizeHandles() {
    var hs = ARCH_RESIZE_HANDLE;
    var keys = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var g = qs('#node-' + key);
      if (!g) return;
      if (!g.querySelector('.arch-node-resize-handle[data-arch-node-handle]')) {
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
      }
      if (!g.querySelector('.arch-rotate-handle[data-arch-node-rotate]')) {
        var wh = archNodeEffectiveWH(key);
        var L2 = NODE_LAYOUT[key];
        var rh = archMakeRotateHandle(L2.rect[0] + wh.w / 2, L2.rect[1] + 10, { archNodeRotate: key }, null);
        rh.addEventListener('pointerdown', archNodeRotatePointerDown);
        g.appendChild(rh);
      }
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
              if (typeof saved[k].angle === 'number') archDrag.pos[k].angle = saved[k].angle;
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
  /** Base flow lines (the animated dashed connectors in #layer-flows) hidden per sandbox/proposal. */
  var LS_HIDDEN_FLOWS = 'aepArchHiddenFlows';
  var LS_FLOW_OVERRIDES = 'aepArchFlowOverrides';
  var archHiddenFlows = {};
  var archSelectedFlowId = null;
  /** Manual path overrides for built-in `.arch-flow` connectors (skip auto-reroute when set). */
  var archFlowOverrides = {};
  var archFlowSelectedHandleIdx = null;
  var archFlowEditDrag = {
    active: false,
    flowId: '',
    handleIndex: -1,
    pointerId: null,
    el: null,
  };
  var archFlowFloatJunctionMode = false;

  function archHiddenFlowsLoad() {
    try {
      var raw = localStorage.getItem(LS_HIDDEN_FLOWS);
      var p = raw ? JSON.parse(raw) : null;
      archHiddenFlows = p && typeof p === 'object' ? p : {};
    } catch (e) { archHiddenFlows = {}; }
  }
  function archHiddenFlowsPersist() {
    try { localStorage.setItem(LS_HIDDEN_FLOWS, JSON.stringify(archHiddenFlows)); } catch (e) {}
  }
  function archHiddenFlowsHas(id) { return !!(id && archHiddenFlows[id]); }
  function archHiddenFlowsAdd(id) { if (id) { archHiddenFlows[id] = 1; archHiddenFlowsPersist(); } }

  function archFlowOverridesLoad() {
    try {
      var raw = localStorage.getItem(LS_FLOW_OVERRIDES);
      var p = raw ? JSON.parse(raw) : null;
      archFlowOverrides = p && typeof p === 'object' ? p : {};
    } catch (e) {
      archFlowOverrides = {};
    }
  }

  function archFlowOverridesPersist() {
    try {
      localStorage.setItem(LS_FLOW_OVERRIDES, JSON.stringify(archFlowOverrides));
    } catch (e) {}
  }

  function archFlowHasOverride(id) {
    return !!(id && archFlowOverrides && archFlowOverrides[id]);
  }

  function archFlowParseD(d) {
    if (!d || typeof d !== 'string') return [];
    var pts = [];
    var parts = d.trim().split(/\s+/);
    var i = 0;
    while (i < parts.length) {
      var cmd = parts[i];
      if (cmd === 'M' || cmd === 'L') {
        var x = parseFloat(parts[i + 1], 10);
        var y = parseFloat(parts[i + 2], 10);
        if (isFinite(x) && isFinite(y)) pts.push({ x: x, y: y });
        i += 3;
      } else if (cmd === 'Z' || cmd === 'z') {
        i += 1;
      } else {
        var x2 = parseFloat(cmd, 10);
        var y2 = parseFloat(parts[i + 1], 10);
        if (isFinite(x2) && isFinite(y2)) {
          pts.push({ x: x2, y: y2 });
          i += 2;
        } else {
          i += 1;
        }
      }
    }
    return pts;
  }

  function archFlowPointsToD(pts) {
    if (!pts || !pts.length) return '';
    var d = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (var pi = 1; pi < pts.length; pi++) {
      d += ' L ' + pts[pi].x + ' ' + pts[pi].y;
    }
    return d;
  }

  function archFlowGetPoints(flowId) {
    var o = archFlowOverrides[flowId];
    if (o && Array.isArray(o.points) && o.points.length >= 2) {
      return o.points.map(function (p) {
        return { x: Number(p.x) || 0, y: Number(p.y) || 0 };
      });
    }
    if (o && typeof o.d === 'string' && o.d) return archFlowParseD(o.d);
    var el = document.getElementById(flowId);
    return el ? archFlowParseD(el.getAttribute('d') || '') : [];
  }

  function archFlowApplyOverrideToDom(flowId) {
    if (!flowId || archHiddenFlowsHas(flowId)) return;
    var el = document.getElementById(flowId);
    if (!el) return;
    var pts = archFlowGetPoints(flowId);
    if (pts.length >= 2) el.setAttribute('d', archFlowPointsToD(pts));
    archFlowSyncHit(flowId);
  }

  function archFlowApplyOverrides() {
    Object.keys(archFlowOverrides || {}).forEach(function (fid) {
      archFlowApplyOverrideToDom(fid);
    });
  }

  function archFlowSaveOverridePoints(flowId, pts) {
    if (!flowId || !pts || pts.length < 2) return;
    archFlowOverrides[flowId] = {
      points: pts.map(function (p) {
        return { x: Number(p.x) || 0, y: Number(p.y) || 0 };
      }),
    };
    archFlowApplyOverrideToDom(flowId);
    archFlowOverridesPersist();
  }

  function archFlowClearOverride(flowId) {
    if (!flowId || !archFlowOverrides[flowId]) return;
    delete archFlowOverrides[flowId];
    archFlowOverridesPersist();
  }

  function archFlowResetSelectedToAuto() {
    if (!archSelectedFlowId) return;
    var id = archSelectedFlowId;
    archFlowClearOverride(id);
    archFlowSelectedHandleIdx = null;
    archDragRebuildFlows();
    archFlowHandlesRefresh();
    archUndoMaybePushSnapshot();
    if (liveRegion) liveRegion.textContent = 'Flow reset to auto-route.';
  }

  function archFlowInsertBendNear(flowId, px, py) {
    var pts = archFlowGetPoints(flowId);
    if (pts.length < 2) return -1;
    var bestI = -1;
    var bestD = USER_LINE_INSERT_MAX_DIST + 1;
    var bestProj = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i];
      var b = pts[i + 1];
      var proj = archUserLineClosestPointOnSeg(px, py, a.x, a.y, b.x, b.y);
      if (proj.dist < bestD) {
        bestD = proj.dist;
        bestI = i;
        bestProj = proj;
      }
    }
    if (bestI < 0 || !bestProj || bestD > USER_LINE_INSERT_MAX_DIST) return -1;
    var aIns = pts[bestI];
    var bIns = pts[bestI + 1];
    var dFromA = Math.hypot(bestProj.x - aIns.x, bestProj.y - aIns.y);
    var dFromB = Math.hypot(bestProj.x - bIns.x, bestProj.y - bIns.y);
    if (dFromA < USER_LINE_INSERT_MIN_FROM_VERTEX || dFromB < USER_LINE_INSERT_MIN_FROM_VERTEX) return -1;
    pts.splice(bestI + 1, 0, { x: bestProj.x, y: bestProj.y });
    archFlowSaveOverridePoints(flowId, pts);
    return bestI + 1;
  }

  function archFlowTryInsertBendAtClient(flowId, clientX, clientY) {
    if (!flowId || !archDrag.svg) return false;
    var p = svgClientToSvg(archDrag.svg, clientX, clientY);
    var ni = archFlowInsertBendNear(flowId, p.x, p.y);
    if (ni < 0) {
      archFlowHandlesRefresh();
      return false;
    }
    archFlowSelectedHandleIdx = ni;
    archFlowHandlesRefresh();
    archUndoMaybePushSnapshot();
    if (liveRegion) {
      liveRegion.textContent = 'Corner point added — drag to bend (hold Shift for 45° snaps).';
    }
    return true;
  }

  function archFlowHandlesRefresh() {
    var hg = qs('#layer-flow-handles');
    if (!hg) return;
    while (hg.firstChild) hg.removeChild(hg.firstChild);
    if (!archIsEditMode() || !archSelectedFlowId || archHiddenFlowsHas(archSelectedFlowId)) return;
    var pts = archFlowGetPoints(archSelectedFlowId);
    if (pts.length < 2) return;
    var fid = archSelectedFlowId;
    var n = pts.length;
    if (archFlowSelectedHandleIdx != null && (archFlowSelectedHandleIdx < 0 || archFlowSelectedHandleIdx >= n)) {
      archFlowSelectedHandleIdx = null;
    }
    var selIdx = archFlowSelectedHandleIdx;
    for (var hi = 0; hi < n; hi++) {
      var role = hi === 0 ? 'from' : hi === n - 1 ? 'to' : 'bend';
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(pts[hi].x));
      c.setAttribute('cy', String(pts[hi].y));
      c.setAttribute('r', '6');
      c.setAttribute(
        'class',
        'arch-flow-handle arch-user-line-handle arch-user-line-handle--' +
          role +
          (selIdx != null && selIdx === hi ? ' is-active' : '')
      );
      c.setAttribute('data-arch-flow-handle', role);
      c.setAttribute('data-flow-handle-index', String(hi));
      c.setAttribute('data-flow-id', fid);
      c.setAttribute('pointer-events', 'all');
      hg.appendChild(c);
    }
  }

  function archFlowHandlePointerMove(e) {
    if (!archFlowEditDrag.active || !archDrag.svg) return;
    var flowId = archFlowEditDrag.flowId;
    if (!flowId) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var idx = archFlowEditDrag.handleIndex;
    var pts = archFlowGetPoints(flowId);
    if (!pts || pts.length < 2 || idx < 0 || idx >= pts.length) return;
    if (idx === 0 || idx === pts.length - 1) {
      var tgt = document.elementFromPoint(e.clientX, e.clientY);
      var epSnap = archUserLineSnapEndpoint(p.x, p.y, tgt);
      var ptSnap = archUserLinePointFromEndpoint(epSnap);
      if (ptSnap) pts[idx] = { x: ptSnap.x, y: ptSnap.y };
    } else {
      var prev = pts[idx - 1];
      var next = pts[idx + 1];
      var useNext = !!e.altKey;
      var origin = useNext ? next : prev;
      var disableSnap = !e.shiftKey;
      var nb = archSnapRadialFromOrigin(origin.x, origin.y, p.x, p.y, ARCH_BEND_SNAP_RAD, disableSnap);
      pts[idx] = { x: nb.x, y: nb.y };
    }
    archFlowSaveOverridePoints(flowId, pts);
    archFlowHandlesRefresh();
  }

  function archFlowHandlePointerUp() {
    if (!archFlowEditDrag.active) return;
    var doneId = archFlowEditDrag.flowId;
    archFlowEditDrag.active = false;
    window.removeEventListener('pointermove', archFlowHandlePointerMove, true);
    window.removeEventListener('pointerup', archFlowHandlePointerUp, true);
    window.removeEventListener('pointercancel', archFlowHandlePointerUp, true);
    var el = archFlowEditDrag.el;
    var pid = archFlowEditDrag.pointerId;
    archFlowEditDrag.el = null;
    archFlowEditDrag.pointerId = null;
    archFlowEditDrag.handleIndex = -1;
    archFlowEditDrag.flowId = '';
    if (el && pid != null && el.releasePointerCapture) {
      try {
        el.releasePointerCapture(pid);
      } catch (err) {}
    }
    if (doneId) {
      archFlowOverridesPersist();
      archUndoMaybePushSnapshot();
      archFlowHandlesRefresh();
    }
    archBoxAnchorHintsClear();
  }

  function archFlowHandlePointerDown(e) {
    if (!archIsEditMode()) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('arch-flow-handle')) return;
    var hix = t.getAttribute('data-flow-handle-index');
    var fid = t.getAttribute('data-flow-id');
    if (hix == null || !fid) return;
    var hi = parseInt(hix, 10);
    if (isNaN(hi)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    archFlowSelect(fid);
    archFlowSelectedHandleIdx = hi;
    archFlowEditDrag.active = true;
    archFlowEditDrag.handleIndex = hi;
    archFlowEditDrag.flowId = fid;
    archFlowEditDrag.pointerId = e.pointerId;
    archFlowEditDrag.el = t;
    if (t.setPointerCapture) {
      try {
        t.setPointerCapture(e.pointerId);
      } catch (err2) {}
    }
    window.addEventListener('pointermove', archFlowHandlePointerMove, true);
    window.addEventListener('pointerup', archFlowHandlePointerUp, true);
    window.addEventListener('pointercancel', archFlowHandlePointerUp, true);
  }

  /** Drag entire connector path (built-in flow or user line) — like moving a box. */
  var archConnectorBodyDrag = {
    active: false,
    kind: '',
    id: '',
    startMx: 0,
    startMy: 0,
    startPoints: null,
    pointerId: null,
    el: null,
  };

  function archConnectorBodyDragPointsFor(kind, id) {
    if (kind === 'flow') {
      return archFlowGetPoints(id).map(function (p) {
        return { x: p.x, y: p.y };
      });
    }
    if (kind === 'user') {
      var ln = archUserLineFindById(id);
      if (!ln || !ln.points || ln.points.length < 2) return [];
      if (archUserLineIsConnector(ln)) archUserLineConnectorSyncEndpoints(ln);
      return ln.points.map(function (pt) {
        var o = archUserLinePointXY(pt);
        return { x: o.x, y: o.y };
      });
    }
    return [];
  }

  function archConnectorBodyDragApply(kind, id, pts) {
    if (!pts || pts.length < 2) return;
    if (kind === 'flow') {
      archFlowSaveOverridePoints(id, pts);
      archFlowHandlesRefresh();
      return;
    }
    if (kind === 'user') {
      var ln = archUserLineFindById(id);
      if (!ln) return;
      if (archUserLineIsConnector(ln)) {
        ln.points = pts.map(function (p) {
          return { x: p.x, y: p.y };
        });
        ln.from = { kind: 'free', x: pts[0].x, y: pts[0].y };
        ln.to = { kind: 'free', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
        if (ln.sourcesDividerLocal) delete ln.sourcesDividerLocal;
      } else if (archUserLineIsFreehandLine(ln)) {
        ln.points = pts.map(function (p) {
          return [p.x, p.y];
        });
      }
      archUserLineRender();
    }
  }

  function archConnectorBodyDragMove(e) {
    if (!archConnectorBodyDrag.active || !archDrag.svg || !archConnectorBodyDrag.startPoints) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var dx = p.x - archConnectorBodyDrag.startMx;
    var dy = p.y - archConnectorBodyDrag.startMy;
    var next = archConnectorBodyDrag.startPoints.map(function (pt) {
      return { x: pt.x + dx, y: pt.y + dy };
    });
    archConnectorBodyDragApply(archConnectorBodyDrag.kind, archConnectorBodyDrag.id, next);
  }

  function archConnectorBodyDragEnd() {
    if (!archConnectorBodyDrag.active) return;
    var did = archConnectorBodyDrag.id;
    var kind = archConnectorBodyDrag.kind;
    archConnectorBodyDrag.active = false;
    window.removeEventListener('pointermove', archConnectorBodyDragMove, true);
    window.removeEventListener('pointerup', archConnectorBodyDragEnd, true);
    window.removeEventListener('pointercancel', archConnectorBodyDragEnd, true);
    var el = archConnectorBodyDrag.el;
    var pid = archConnectorBodyDrag.pointerId;
    archConnectorBodyDrag.el = null;
    archConnectorBodyDrag.pointerId = null;
    archConnectorBodyDrag.startPoints = null;
    archConnectorBodyDrag.id = '';
    archConnectorBodyDrag.kind = '';
    if (el && pid != null && el.releasePointerCapture) {
      try {
        el.releasePointerCapture(pid);
      } catch (err) {}
    }
    if (did) {
      if (kind === 'user') archUserLinePersist();
      else archFlowOverridesPersist();
      archUndoMaybePushSnapshot();
    }
  }

  function archConnectorBodyDragBegin(kind, id, e) {
    if (!archIsEditMode() || !id) return false;
    if (archFlowFloatJunctionMode && kind === 'flow') return false;
    var pts = archConnectorBodyDragPointsFor(kind, id);
    if (pts.length < 2) return false;
    var p0 = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    archConnectorBodyDrag.active = true;
    archConnectorBodyDrag.kind = kind;
    archConnectorBodyDrag.id = id;
    archConnectorBodyDrag.startMx = p0.x;
    archConnectorBodyDrag.startMy = p0.y;
    archConnectorBodyDrag.startPoints = pts;
    archConnectorBodyDrag.pointerId = e.pointerId;
    archConnectorBodyDrag.el = e.target;
    if (e.target && e.target.setPointerCapture) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (err2) {}
    }
    window.addEventListener('pointermove', archConnectorBodyDragMove, true);
    window.addEventListener('pointerup', archConnectorBodyDragEnd, true);
    window.addEventListener('pointercancel', archConnectorBodyDragEnd, true);
    return true;
  }

  function archDiagramFlowPointerDown(e) {
    if (!archIsEditMode() || archGetActiveTool() !== 'select') return;
    if (userLines.drawMode || customBoxDrawMode) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    var flowId = archFlowIdFromTarget(e.target);
    if (!flowId) return;
    var t = document.getElementById(flowId);
    if (!t || !t.classList || !t.classList.contains('arch-flow')) return;
    if (archHiddenFlowsHas(t.id) || !t.classList.contains('is-visible')) return;
    if (archFlowFloatJunctionMode) return;
    e.preventDefault();
    e.stopPropagation();
    archFlowSelect(t.id);
    archConnectorBodyDragBegin('flow', t.id, e);
  }

  function archConnectorFloatHasFlowSelection() {
    return !!(archIsEditMode() && archSelectedFlowId && archGetActiveTool() === 'select');
  }

  function archConnectorFloatHasUserSelection() {
    return !!(archIsEditMode() && userLines.selectedId);
  }

  function archFlowFloatUpdateVisibility() {
    archLineFloatUpdateVisibility();
  }

  function archFlowFloatSetJunction(on) {
    archFlowFloatJunctionMode = !!on;
    archLineFloatUpdateVisibility();
  }

  function archFlowFloatInit() {
    /* Flow bar merged into #archLineFloatBar — reset wired in archLineFloatInit. */
  }

  /** Base nodes (arch-draggable groups with id node-<key>) hidden per sandbox/proposal. */
  var LS_HIDDEN_NODES = 'aepArchHiddenNodes';
  var archHiddenNodes = {};

  function archHiddenNodesLoad() {
    try {
      var raw = localStorage.getItem(LS_HIDDEN_NODES);
      var p = raw ? JSON.parse(raw) : null;
      archHiddenNodes = p && typeof p === 'object' ? p : {};
    } catch (e) { archHiddenNodes = {}; }
  }
  function archHiddenNodesPersist() {
    try { localStorage.setItem(LS_HIDDEN_NODES, JSON.stringify(archHiddenNodes)); } catch (e) {}
  }
  function archHiddenNodesHas(key) { return !!(key && archHiddenNodes[key]); }
  function archHiddenNodesAdd(key) { if (key) { archHiddenNodes[key] = 1; archHiddenNodesPersist(); } }

  /** Apply display: none to all hidden base nodes. Called after init + after state changes. */
  function archHiddenNodesApply() {
    $all('g.arch-node.arch-draggable').forEach(function (g) {
      if (!g.id || g.id.indexOf('node-') !== 0 || g.id.indexOf('node-cbox-') === 0) return;
      var key = g.id.slice(5);
      if (archHiddenNodesHas(key)) g.style.display = 'none';
      else g.style.display = '';
    });
  }

  /** Decorative SVG background plates hidden per sandbox/proposal. */
  var LS_HIDDEN_BACKGROUNDS = 'aepArchHiddenBackgrounds';
  var archHiddenBackgrounds = {};

  function archHiddenBackgroundsLoad() {
    try {
      var raw = localStorage.getItem(LS_HIDDEN_BACKGROUNDS);
      var p = raw ? JSON.parse(raw) : null;
      archHiddenBackgrounds = p && typeof p === 'object' ? p : {};
    } catch (e) {
      archHiddenBackgrounds = {};
    }
  }
  function archHiddenBackgroundsPersist() {
    try {
      localStorage.setItem(LS_HIDDEN_BACKGROUNDS, JSON.stringify(archHiddenBackgrounds));
    } catch (e) {}
  }
  function archHiddenBackgroundsHas(key) {
    return !!(key && archHiddenBackgrounds[key]);
  }
  function archHiddenBackgroundsAdd(key) {
    if (key) {
      archHiddenBackgrounds[key] = 1;
      archHiddenBackgroundsPersist();
    }
  }

  function archBackgroundsApply() {
    $all('.arch-bg-plate[data-arch-bg]').forEach(function (g) {
      var id = g.getAttribute('data-arch-bg');
      if (!id) return;
      g.style.display = archHiddenBackgroundsHas(id) ? 'none' : '';
    });
    if (archBgSelectedId && archHiddenBackgroundsHas(archBgSelectedId)) archBgClearSelection();
    archBgRefreshDom();
    archLayerOrderApply();
    archLayerOrderSyncUi();
  }

  function archAepBgPlateSync() {
    if (!NODE_LAYOUT.aep) return;
    var L = NODE_LAYOUT.aep;
    var p = archDrag.pos.aep || { x: 0, y: 0 };
    var wh = archNodeEffectiveWH('aep');
    var shell = qs('#arch-bg-aep-platform [data-arch-bg-shell]');
    if (!shell) return;
    shell.setAttribute('x', String(L.rect[0] + p.x));
    shell.setAttribute('y', String(L.rect[1] + p.y));
    shell.setAttribute('width', String(wh.w));
    shell.setAttribute('height', String(wh.h));
  }

  /** Canvas z-order: bottom-to-top stack keys persisted in master layout v13 `layerOrder`. */
  var LS_LAYER_ORDER = 'aepArchLayerOrder';
  var archLayerOrder = null;
  var ARCH_LAYER_ORDER_STATIC = ['bg:profile-strip', 'bg:aep-platform', 'layer:flows', 'layer:flow-labels'];
  var ARCH_LAYER_ORDER_NODE_KEYS = [
    'edge', 'aep', 'tags', 'sources', 'streaming', 'batch', 'query', 'intel', 'lake', 'pipeline',
    'profile', 'identity', 'seg', 'decision', 'creative', 'aem', 'jo', 'rtcdp', 'cja', 'mix',
    'inbound', 'msg', 'paid', 'jrpt', 'mrpt',
  ];

  function archLayerOrderKeyBg(id) {
    return 'bg:' + id;
  }
  function archLayerOrderKeyNode(key) {
    return 'node:' + key;
  }
  function archLayerOrderKeyCbox(id) {
    return 'cbox:' + id;
  }
  function archLayerOrderKeyUl(id) {
    return 'ul:' + id;
  }
  function archLayerOrderKeyFlow(id) {
    return 'flow:' + id;
  }

  function archLayerOrderLoad() {
    try {
      var raw = localStorage.getItem(LS_LAYER_ORDER);
      if (!raw) {
        archLayerOrder = null;
        archFlowPathOrder = null;
        return;
      }
      var p = JSON.parse(raw);
      if (Array.isArray(p)) {
        archLayerOrder = p;
        archFlowPathOrder = null;
        return;
      }
      if (p && typeof p === 'object') {
        archLayerOrder = Array.isArray(p.layerOrder) ? p.layerOrder : null;
        archFlowPathOrder = Array.isArray(p.flowPathOrder) ? p.flowPathOrder : null;
        return;
      }
      archLayerOrder = null;
      archFlowPathOrder = null;
    } catch (e) {
      archLayerOrder = null;
      archFlowPathOrder = null;
    }
  }

  function archLayerOrderPersist() {
    try {
      if (Array.isArray(archLayerOrder)) {
        localStorage.setItem(
          LS_LAYER_ORDER,
          JSON.stringify({
            layerOrder: archLayerOrder,
            flowPathOrder: archFlowPathOrderFromDom(),
          })
        );
      }
    } catch (e) {}
  }

  function archLayerOrderBuildDefault() {
    var order = ARCH_LAYER_ORDER_STATIC.slice();
    ARCH_LAYER_ORDER_NODE_KEYS.forEach(function (k) {
      if (NODE_LAYOUT[k]) order.push(archLayerOrderKeyNode(k));
    });
    archCustomBoxes.forEach(function (b) {
      if (b && b.id) order.push(archLayerOrderKeyCbox(b.id));
    });
    userLines.lines.forEach(function (ln) {
      if (ln && ln.id) order.push(archLayerOrderKeyUl(ln.id));
    });
    return order;
  }

  function archLayerOrderKnownKeys() {
    var known = archLayerOrderBuildDefault();
    if (Array.isArray(archFlowPathOrder) && archFlowPathOrder.length) {
      archFlowPathOrder.forEach(function (fid) {
        var fk = archLayerOrderKeyFlow(fid);
        if (known.indexOf(fk) < 0) known.push(fk);
      });
    }
    return known;
  }

  function archLayerOrderEnsure() {
    var def = archLayerOrderKnownKeys();
    if (!Array.isArray(archLayerOrder)) archLayerOrder = def.slice();
    var next = [];
    archLayerOrder.forEach(function (k) {
      if (typeof k === 'string' && def.indexOf(k) >= 0 && next.indexOf(k) < 0) next.push(k);
    });
    def.forEach(function (k) {
      if (next.indexOf(k) < 0) next.push(k);
    });
    archLayerOrder = next;
  }

  function archLayerOrderResolveEl(key) {
    if (!key || typeof key !== 'string') return null;
    if (key.indexOf('bg:') === 0) {
      return qs('.arch-bg-plate[data-arch-bg="' + key.slice(3) + '"]');
    }
    if (key === 'layer:flows') return qs('#layer-flows');
    if (key === 'layer:flow-labels') return qs('#layer-flow-labels');
    if (key.indexOf('node:') === 0) return qs('#node-' + key.slice(5));
    if (key.indexOf('cbox:') === 0) return qs('#node-cbox-' + key.slice(5));
    if (key.indexOf('ul:') === 0) return qs('#ul-' + key.slice(3));
    if (key.indexOf('flow:') === 0) return qs('#' + key.slice(5));
    return null;
  }

  function archLayerOrderIsStackableKey(key) {
    if (!key) return false;
    if (key.indexOf('bg:') === 0) return !archHiddenBackgroundsHas(key.slice(3));
    return !!archLayerOrderResolveEl(key);
  }

  var archFlowPathOrder = null;

  function archFlowPathOrderFromDom() {
    var layer = qs('#layer-flows');
    if (!layer) return [];
    var ids = [];
    $all('.arch-flow', layer).forEach(function (p) {
      if (p.id) ids.push(p.id);
    });
    return ids;
  }

  function archFlowPathOrderApply() {
    var layer = qs('#layer-flows');
    if (!layer || !Array.isArray(archFlowPathOrder) || !archFlowPathOrder.length) return;
    var map = {};
    $all('.arch-flow', layer).forEach(function (p) {
      if (p.id) map[p.id] = p;
    });
    archFlowPathOrder.forEach(function (fid) {
      var el = map[fid];
      if (el) layer.appendChild(el);
      delete map[fid];
    });
    Object.keys(map).forEach(function (fid) {
      layer.appendChild(map[fid]);
    });
  }

  function archLayerOrderApply() {
    archLayerOrderEnsure();
    var svg = archDrag && archDrag.svg;
    var anchor = qs('#archLayerOrderAnchor');
    if (!svg || !anchor) return;
    var items = [];
    archLayerOrder.forEach(function (key) {
      if (!archLayerOrderIsStackableKey(key)) return;
      var el = archLayerOrderResolveEl(key);
      if (el) items.push({ key: key, el: el });
    });
    items.forEach(function (item) {
      if (item.el.parentNode) item.el.parentNode.removeChild(item.el);
    });
    items.forEach(function (item) {
      svg.insertBefore(item.el, anchor);
    });
    archFlowPathOrderApply();
  }

  function archLayerOrderRegisterKey(key, afterKey) {
    if (!key) return;
    archLayerOrderEnsure();
    var i = archLayerOrder.indexOf(key);
    if (i >= 0) archLayerOrder.splice(i, 1);
    if (afterKey) {
      var j = archLayerOrder.indexOf(afterKey);
      if (j >= 0) archLayerOrder.splice(j + 1, 0, key);
      else archLayerOrder.push(key);
    } else {
      archLayerOrder.push(key);
    }
    archLayerOrderPersist();
  }

  function archLayerOrderUnregisterKey(key) {
    if (!key || !Array.isArray(archLayerOrder)) return;
    var i = archLayerOrder.indexOf(key);
    if (i >= 0) {
      archLayerOrder.splice(i, 1);
      archLayerOrderPersist();
    }
  }

  function archLayerOrderSelectionKey() {
    if (archBgSelectedId) return archLayerOrderKeyBg(archBgSelectedId);
    if (archCustomBoxSelectedId) return archLayerOrderKeyCbox(archCustomBoxSelectedId);
    if (userLines.selectedId) return archLayerOrderKeyUl(userLines.selectedId);
    if (archSelectedFlowId) return archLayerOrderKeyFlow(archSelectedFlowId);
    if (archSelection && archSelection.count() === 1) {
      var id = archSelection.primary;
      if (id && id.indexOf('node-') === 0 && id.indexOf('node-cbox-') !== 0) {
        return archLayerOrderKeyNode(id.slice(5));
      }
    }
    return null;
  }

  function archLayerOrderCanAdjust() {
    return !!(archIsEditMode() && archLayerOrderSelectionKey());
  }

  function archLayerOrderSyncUi() {
    var show = archLayerOrderCanAdjust();
    $all('.arch-layer-order-seg').forEach(function (seg) {
      seg.hidden = !show;
    });
    var key = archLayerOrderSelectionKey();
    if (!show || !key) return;
    var atBack = false;
    var atFront = false;
    if (key.indexOf('flow:') === 0) {
      var layer = qs('#layer-flows');
      var paths = [];
      if (layer) $all('.arch-flow', layer).forEach(function (p) { paths.push(p); });
      var fi = -1;
      for (var pi = 0; pi < paths.length; pi++) {
        if (paths[pi].id === key.slice(5)) {
          fi = pi;
          break;
        }
      }
      atBack = fi <= 0;
      atFront = fi < 0 || fi >= paths.length - 1;
    } else {
      archLayerOrderEnsure();
      var i = archLayerOrder.indexOf(key);
      atBack = i <= 0;
      atFront = i < 0 || i >= archLayerOrder.length - 1;
    }
    $all('.arch-layer-order-btn').forEach(function (btn) {
      var cmd = btn.getAttribute('data-arch-layer-cmd');
      if (cmd === 'back' || cmd === 'down') btn.disabled = atBack;
      else if (cmd === 'front' || cmd === 'up') btn.disabled = atFront;
    });
  }

  function archFlowOrderMove(delta) {
    var fid = archSelectedFlowId;
    var layer = qs('#layer-flows');
    if (!fid || !layer) return;
    var paths = [];
    $all('.arch-flow', layer).forEach(function (p) {
      paths.push(p);
    });
    var i = -1;
    for (var pi = 0; pi < paths.length; pi++) {
      if (paths[pi].id === fid) {
        i = pi;
        break;
      }
    }
    if (i < 0) return;
    var j = i + delta;
    if (j < 0 || j >= paths.length) return;
    archUndoMaybePushSnapshot();
    var tmp = paths[i];
    paths[i] = paths[j];
    paths[j] = tmp;
    paths.forEach(function (p) {
      layer.appendChild(p);
      var hit = archFlowGetHitEl(p.id);
      if (hit) layer.appendChild(hit);
    });
    archFlowPathOrder = archFlowPathOrderFromDom();
    archLayerOrderPersist();
    archLayerOrderSyncUi();
    if (liveRegion) {
      liveRegion.textContent = delta > 0 ? 'Flow brought forward.' : 'Flow sent backward.';
    }
  }

  function archFlowOrderToExtreme(toFront) {
    var fid = archSelectedFlowId;
    var layer = qs('#layer-flows');
    if (!fid || !layer) return;
    var el = qs('#' + fid);
    if (!el || !el.classList.contains('arch-flow')) return;
    archUndoMaybePushSnapshot();
    if (toFront) layer.appendChild(el);
    else {
      var first = layer.querySelector('.arch-flow');
      if (first) layer.insertBefore(el, first);
      else layer.appendChild(el);
    }
    archFlowPathOrder = archFlowPathOrderFromDom();
    archLayerOrderPersist();
    archLayerOrderSyncUi();
    if (liveRegion) {
      liveRegion.textContent = toFront ? 'Flow brought to front.' : 'Flow sent to back.';
    }
  }

  function archLayerOrderMove(delta) {
    var key = archLayerOrderSelectionKey();
    if (!key) return;
    if (key.indexOf('flow:') === 0) {
      archFlowOrderMove(delta);
      return;
    }
    archLayerOrderEnsure();
    var i = archLayerOrder.indexOf(key);
    if (i < 0) {
      archLayerOrderRegisterKey(key);
      i = archLayerOrder.indexOf(key);
    }
    var j = i + delta;
    if (j < 0 || j >= archLayerOrder.length) return;
    archUndoMaybePushSnapshot();
    var tmp = archLayerOrder[i];
    archLayerOrder[i] = archLayerOrder[j];
    archLayerOrder[j] = tmp;
    archLayerOrderPersist();
    archLayerOrderApply();
    archLayerOrderSyncUi();
    if (liveRegion) {
      liveRegion.textContent = delta > 0 ? 'Brought forward.' : 'Sent backward.';
    }
  }

  function archLayerOrderToExtreme(toFront) {
    var key = archLayerOrderSelectionKey();
    if (!key) return;
    if (key.indexOf('flow:') === 0) {
      archFlowOrderToExtreme(toFront);
      return;
    }
    archLayerOrderEnsure();
    var i = archLayerOrder.indexOf(key);
    if (i < 0) {
      archLayerOrderRegisterKey(key);
      i = archLayerOrder.indexOf(key);
    }
    archUndoMaybePushSnapshot();
    archLayerOrder.splice(i, 1);
    if (toFront) archLayerOrder.push(key);
    else archLayerOrder.unshift(key);
    archLayerOrderPersist();
    archLayerOrderApply();
    archLayerOrderSyncUi();
    if (liveRegion) {
      liveRegion.textContent = toFront ? 'Brought to front.' : 'Sent to back.';
    }
  }

  function archLayerOrderHandleCmd(cmd) {
    if (!archLayerOrderCanAdjust()) return;
    if (cmd === 'up') archLayerOrderMove(1);
    else if (cmd === 'down') archLayerOrderMove(-1);
    else if (cmd === 'front') archLayerOrderToExtreme(true);
    else if (cmd === 'back') archLayerOrderToExtreme(false);
  }

  function archLayerOrderInit() {
    if (document.documentElement.getAttribute('data-arch-layer-order')) return;
    document.documentElement.setAttribute('data-arch-layer-order', '1');
    $all('.arch-layer-order-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        archLayerOrderHandleCmd(btn.getAttribute('data-arch-layer-cmd'));
      });
    });
  }

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
    if (lineDefaults.lineTool !== 'junction') archFlowFloatJunctionMode = false;
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

  function archLineFloatSyncFromFlow() {
    var fid = archSelectedFlowId;
    if (!fid) return;
    var el = document.getElementById(fid);
    if (!el) return;
    var stroke = el.style.stroke || '';
    if (!stroke || stroke.indexOf('var(') >= 0) {
      try {
        stroke = window.getComputedStyle(el).stroke || '#308fff';
      } catch (e0) {
        stroke = '#308fff';
      }
    }
    if (stroke && stroke.indexOf('rgb') === 0) {
      var m = stroke.match(/\d+/g);
      if (m && m.length >= 3) {
        stroke =
          '#' +
          ('0' + parseInt(m[0], 10).toString(16)).slice(-2) +
          ('0' + parseInt(m[1], 10).toString(16)).slice(-2) +
          ('0' + parseInt(m[2], 10).toString(16)).slice(-2);
      }
    }
    archLineFloatSetHex(stroke || '#308fff');
    var sw = parseFloat(el.getAttribute('stroke-width') || el.style.strokeWidth, 10);
    if (isNaN(sw) || sw <= 0) sw = 2.2;
    archLineFloatSetW(sw);
  }

  function archLineFloatApplySelectedFromBar() {
    if (archConnectorFloatHasFlowSelection()) {
      var fel = archSelectedFlowId && document.getElementById(archSelectedFlowId);
      if (fel) {
        fel.style.stroke = archLineFloatGetHex();
        fel.setAttribute('stroke-width', String(archLineFloatGetStrokeW()));
      }
      archUndoMaybePushSnapshot();
      return;
    }
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
    var legacyFlowBar = qs('#archFlowFloatBar');
    if (legacyFlowBar) legacyFlowBar.hidden = true;
    if (!bar) return;
    var hasFlowSel = archConnectorFloatHasFlowSelection();
    var hasUserSel = archConnectorFloatHasUserSelection();
    var drawMode = userLines.drawMode;
    /** One bar: draw mode, user connector selected, or built-in flow selected. */
    var show = archIsEditMode() && (drawMode || hasUserSel || hasFlowSel);
    bar.hidden = !show;

    var del = qs('#archLineFloatDelete');
    if (del) del.disabled = !hasUserSel && !hasFlowSel;

    var flowExtras = qs('#archLineFloatFlowExtras');
    if (flowExtras) flowExtras.hidden = !hasFlowSel;

    var resetBtn = qs('#archLineFloatFlowReset');
    if (resetBtn) resetBtn.disabled = !hasFlowSel || !archFlowHasOverride(archSelectedFlowId);

    var toolsSeg = qs('.arch-line-float-tools', bar);
    if (toolsSeg) toolsSeg.setAttribute('data-arch-flow-selected', hasFlowSel ? '1' : '0');

    var showDrawOnly = drawMode && !hasFlowSel && !hasUserSel;
    $all('[data-arch-line-draw-only]', bar).forEach(function (el) {
      el.hidden = !showDrawOnly;
    });

    var juncBtn = qs('#archLineFloatJunction', bar);
    if (juncBtn) {
      juncBtn.classList.toggle('is-active', archLineFloatGetTool() === 'junction' || !!archFlowFloatJunctionMode);
    }

    if (hasUserSel) {
      var selLn = archUserLineGetSelected();
      if (selLn) archLineFloatSyncFromLine(selLn);
    } else if (hasFlowSel) {
      archLineFloatSyncFromFlow();
    }

    if (!show) {
      archLineFloatWeightMenuClose();
      archLineFloatColorPopoverClose();
      freehandSession = null;
      archBoxAnchorHintsClear();
      var pv = qs('#archUserLinePreview');
      if (pv) {
        pv.setAttribute('opacity', '0');
        pv.removeAttribute('stroke-dasharray');
      }
      var fhpv = qs('#archUserLineFreehandPreview');
      if (fhpv) {
        fhpv.setAttribute('d', '');
        fhpv.setAttribute('opacity', '0');
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
        if (nt === 'junction' && archConnectorFloatHasFlowSelection()) {
          archFlowFloatSetJunction(!archFlowFloatJunctionMode);
          return;
        }
        archLineFloatSetTool(nt);
        if (userLines.selectedId && nt !== 'junction') {
          var ln0 = archUserLineGetSelected();
          archLineFloatApplySelectedFromBar();
          if (ln0) archLineFloatSyncFromLine(ln0);
        }
        return;
      }
      var rbtn = e.target.closest && e.target.closest('#archLineFloatFlowReset');
      if (rbtn) {
        archFlowResetSelectedToAuto();
        return;
      }
      var wopt = e.target.closest && e.target.closest('.arch-line-float-w-option[data-arch-line-w]');
      if (wopt) {
        e.stopPropagation();
        archLineFloatSetW(parseFloat(wopt.getAttribute('data-arch-line-w'), 10));
        archLineFloatWeightMenuClose();
        if (archConnectorFloatHasUserSelection() || archConnectorFloatHasFlowSelection()) {
          archLineFloatApplySelectedFromBar();
        }
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
        if (archConnectorFloatHasUserSelection() || archConnectorFloatHasFlowSelection()) {
          archLineFloatApplySelectedFromBar();
        }
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
          if (archConnectorFloatHasUserSelection() || archConnectorFloatHasFlowSelection()) {
            archLineFloatApplySelectedFromBar();
          }
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
          if (archConnectorFloatHasUserSelection() || archConnectorFloatHasFlowSelection()) {
            archLineFloatApplySelectedFromBar();
          }
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
        if (archConnectorFloatHasFlowSelection()) archFlowDeleteSelected();
        else archUserLineDeleteSelected();
      });
    }
    var cl = qs('#archLineFloatClose');
    if (cl) {
      cl.addEventListener('click', function () {
        if (archConnectorFloatHasFlowSelection()) {
          archFlowClearSelection();
          archFlowFloatSetJunction(false);
        } else {
          archSetActiveTool('select');
        }
        archLineFloatUpdateVisibility();
      });
    }
  }

  /** User-drawn rectangles (world SVG coords). */
  var archCustomBoxes = [];
  var archCustomBoxSelectedId = null;
  /** When set, label size −/+ applies to this box (user clicked the SVG label). */
  var archCustomBoxLabelActiveId = null;
  /** Selected diagram text (`data-arch-id`), Edit mode. */
  var archLabelSelectedId = null;
  /** Active inline label editor textarea (if any). */
  var archLabelInlineEditorEl = null;
  var ARCH_DIAGRAM_PASTE_OFFSET = 20;
  var customBoxDrawMode = false;
  var customBoxDrawPending = null;
  var archCustomDrag = { active: null, start: null };
  var archCustomRotate = { active: null, start: null };
  var archCustomResize = { active: null, start: null };
  var LS_CUSTOM_BOXES = 'aepArchCustomBoxes';

  var ARCH_ROTATE_CW_PATH = 'm18.27051,3.72896c-.39209-.12061-.81494.10059-.93701.49658l-.53143,1.73016c-1.43658-2.33026-3.99622-3.82538-6.80206-3.82538C5.58887,2.13033,2,5.7192,2,10.13033s3.58887,8,8,8c2.66162,0,5.1416-1.31836,6.6333-3.52686.23193-.34326.1416-.80957-.20166-1.0415-.34375-.23145-.80957-.14062-1.0415.20166-1.2124,1.79492-3.22754,2.8667-5.39014,2.8667-3.58398,0-6.5-2.91602-6.5-6.5s2.91602-6.5,6.5-6.5c2.20074,0,4.21191,1.13434,5.3999,2.91516l-1.54736-.47522c-.39258-.11914-.81543.1001-.93701.49658-.12158.396.10059.81543.49658.93701l3.37988,1.03809c.07324.02246.14746.0332.2207.0332.32031,0,.61719-.20703.71631-.52979l1.03809-3.37939c.12158-.396-.10059-.81543-.49658-.93701Z';

  function archMakeRotateHandle(cx, cy, dataset, evtKey) {
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'arch-rotate-handle');
    g.setAttribute('transform', 'translate(' + cx + ',' + cy + ')');
    if (dataset) {
      Object.keys(dataset).forEach(function (k) { g.dataset[k] = dataset[k]; });
    }
    var circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', '#ffffff');
    circle.setAttribute('stroke', '#1473e6');
    circle.setAttribute('stroke-width', '1.25');
    g.appendChild(circle);
    var icon = document.createElementNS(SVG_NS, 'path');
    icon.setAttribute('d', ARCH_ROTATE_CW_PATH);
    icon.setAttribute('fill', '#1473e6');
    icon.setAttribute('transform', 'translate(-6,-6) scale(0.6)');
    icon.setAttribute('pointer-events', 'none');
    g.appendChild(icon);
    return g;
  }

  /** In-memory clipboard for Edit mode copy/paste (custom boxes + connectors). */
  var archDiagramClipboard = null;

  /** Vendored Apache-2.0 SVGs from @adobe/spectrum-css-workflow-icons (see npm run vendor:spectrum-icons). */
  var ARCH_SPECTRUM_ICON_PREFIX = 'vendor/spectrum-workflow-icons/';
  var archSpectrumIconsDataPromise = null;
  var archSpectrumIconsRemoteCache = null;

  function archCustomBoxIsIconAsset(box) {
    if (!box) return false;
    var n = archCustomBoxNormalize(box);
    return (
      (n.kind === 'spectrumIcon' && n.iconFile) || (n.kind === 'productLogo' && n.logoFile)
    );
  }

  function archSpectrumIconsRenderFromData(data) {
    var grid = qs('#archSpectrumIconGrid');
    var status = qs('#archSpectrumIconStatus');
    if (!grid || !data || !Array.isArray(data.icons)) return;
    archSpectrumIconsRemoteCache = data;
    grid.textContent = '';
    var base = ARCH_SPECTRUM_ICON_PREFIX;
    var hiddenSp = archSpectrumHiddenFromPickerMap();
    var built = 0;
    data.icons.forEach(function (item) {
      if (!item || !item.file) return;
      if (hiddenSp[item.file]) return;
      built++;
      var lab = item.label || item.file;
      var btn = document.createElement('div');
      btn.className =
        'arch-spectrum-icons-tile arch-diagram-ui arch-architecture-logo-tile arch-spectrum-icons-tile--picker';
      btn.setAttribute('role', 'option');
      btn.tabIndex = 0;
      btn.setAttribute('data-arch-spectrum-file', item.file);
      btn.setAttribute('data-arch-spectrum-label', lab);
      var wrap = document.createElement('span');
      wrap.className = 'arch-spectrum-icons-tile-img-wrap';
      var im = document.createElement('img');
      im.src = base + item.file;
      im.alt = '';
      im.loading = 'lazy';
      im.width = 20;
      im.height = 20;
      im.setAttribute('draggable', 'false');
      wrap.appendChild(im);
      var cap = document.createElement('span');
      cap.className = 'arch-spectrum-icons-tile-cap';
      cap.textContent = lab;
      var tileActions = document.createElement('span');
      tileActions.className = 'arch-architecture-logo-tile-actions';
      tileActions.setAttribute('role', 'group');
      tileActions.setAttribute('aria-label', 'Icon actions');
      var remSp = archLogoTileCreateIosRemoveButton(
        'Delete',
        'Delete from picker (this browser)',
        function () {
          archLogoConfirmShow({
            title: 'Delete this logo?',
            message: '',
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            archSpectrumHideFromPicker(item.file, lab);
            archCustomLogoRefreshLists();
            archSpectrumIconsRefreshMerged();
            if (liveRegion) liveRegion.textContent = 'Icon removed from picker.';
          });
        }
      );
      tileActions.appendChild(remSp);
      btn.appendChild(wrap);
      btn.appendChild(cap);
      btn.appendChild(tileActions);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (archLogoLibraryEditModeIsOn()) {
          if (e.target.closest && e.target.closest('.arch-architecture-logo-tile-actions')) return;
          return;
        }
        var f = btn.getAttribute('data-arch-spectrum-file');
        var l = btn.getAttribute('data-arch-spectrum-label');
        if (f) archSpectrumIconPlace(f, l);
      });
      archLogoTileKeyboardActivate(btn);
      grid.appendChild(btn);
    });
    grid.setAttribute('data-arch-built', '1');
    var qinp = qs('#archSpectrumIconSearch');
    archSpectrumIconsApplyFilter(qinp ? qinp.value : '');
    if (status) status.textContent = built + ' icons — use search to filter.';
  }

  function archSpectrumIconsRefreshMerged() {
    if (!archSpectrumIconsRemoteCache || !Array.isArray(archSpectrumIconsRemoteCache.icons)) {
      archSpectrumIconsPanelInit();
      return;
    }
    archSpectrumIconsRenderFromData(archSpectrumIconsRemoteCache);
  }

  function archSpectrumIconsPanelInit() {
    var grid = qs('#archSpectrumIconGrid');
    var status = qs('#archSpectrumIconStatus');
    if (!grid) return;
    if (archSpectrumIconsRemoteCache && Array.isArray(archSpectrumIconsRemoteCache.icons)) {
      archSpectrumIconsRenderFromData(archSpectrumIconsRemoteCache);
      return;
    }
    if (!archSpectrumIconsDataPromise) {
      archSpectrumIconsDataPromise = fetch('data/spectrum-workflow-icons.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
    }
    archSpectrumIconsDataPromise
      .then(function (data) {
        if (!grid.parentNode) return;
        if (!data || !Array.isArray(data.icons)) return;
        archSpectrumIconsRenderFromData(data);
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

  /** Accordion groups for Adobe logos — first matching tag wins (order matters). */
  var ARCH_ADOBE_MENU_GROUPS = [
    { id: 'core', label: 'Core Adobe marks', matchAny: ['adobe-core'] },
    { id: 'exp', label: 'Experience Cloud', matchAny: ['experience-cloud'] },
    { id: 'catalog', label: 'Creative Cloud catalog', matchAny: ['adobe-catalog'] },
    { id: 'other', label: 'Other', matchAny: [] },
  ];

  /** Accordion groups for product / ecosystem logos — first matching tag wins. */
  var ARCH_OTHER_MENU_GROUPS = [
    { id: 'eco-data', label: 'Data warehouse & infrastructure', matchAny: ['ecosystem-data'] },
    { id: 'eco-analytics', label: 'Analytics', matchAny: ['ecosystem-analytics'] },
    { id: 'eco-activation', label: 'Activation & channels', matchAny: ['ecosystem-activation'] },
    { id: 'data-coll', label: 'Data collection', matchAny: ['data-collection'] },
    { id: 'profile', label: 'Profile & audiences', matchAny: ['profile-audiences'] },
    { id: 'journey', label: 'Journeys', matchAny: ['journeys'] },
    { id: 'diagram', label: 'Diagram assets', matchAny: ['diagram-reference'] },
    { id: 'pres', label: 'Presentation & UI icons', matchAny: ['presentation-icons'] },
    { id: 'partner', label: 'Partner', matchAny: ['partner'] },
    { id: 'other', label: 'Other', matchAny: [] },
  ];

  /** Browser-local renames for the hard-coded menu group labels above. Keyed by "<panel>:<groupId>". */
  var ARCH_MENU_GROUP_LABEL_OVERRIDES_KEY = 'aepArchMenuGroupLabelOverrides';

  function archMenuGroupLabelOverridesLoad() {
    try {
      var raw = localStorage.getItem(ARCH_MENU_GROUP_LABEL_OVERRIDES_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function archMenuGroupLabelOverridesPersist(map) {
    try {
      localStorage.setItem(ARCH_MENU_GROUP_LABEL_OVERRIDES_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function archMenuGroupResolvedLabel(panel, group) {
    if (!group) return '';
    var map = archMenuGroupLabelOverridesLoad();
    var key = (panel === 'adobe' ? 'adobe' : 'other') + ':' + group.id;
    var v = map[key];
    return typeof v === 'string' && v.trim() ? v : group.label;
  }

  var ARCH_CUSTOM_LOGOS_KEY = 'aepArchCustomLogoLibrary';
  /** Browser-local overrides for bundled `architecture-logos.json` entries (label, description, optional image). */
  var ARCH_CATALOG_LOGO_OVERRIDES_KEY = 'aepArchCatalogLogoOverrides';
  /** Rough cap for data URL length in localStorage (base64 expands size). */
  var ARCH_CUSTOM_LOGO_MAX_DATA_URL_CHARS = 2000000;
  /** Delay before placing a custom logo so double-click can open the editor. */
  var ARCH_CUSTOM_LOGO_PLACE_DELAY_MS = 320;
  /** Tile that anchored the open logo edit popover (for positioning + highlight). */
  var archLogoEditAnchorEl = null;
  /** Pending removals are purged after this grace period (browser-local only). */
  var ARCH_CUSTOM_LOGO_DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
  var archArchitectureLogosRemoteCache = null;
  var archCustomLogoDragId = null;

  function archCatalogLogoOverridesMap() {
    try {
      var raw = localStorage.getItem(ARCH_CATALOG_LOGO_OVERRIDES_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && o.byFile && typeof o.byFile === 'object' ? Object.assign({}, o.byFile) : {};
    } catch (e) {
      return {};
    }
  }

  function archCatalogLogoOverridesPersist(map) {
    try {
      localStorage.setItem(ARCH_CATALOG_LOGO_OVERRIDES_KEY, JSON.stringify({ version: 1, byFile: map }));
    } catch (e) {}
  }

  /** Catalog paths hidden from the Adobe / Product pickers (this browser). Repo JSON unchanged until the team edits it. */
  var ARCH_CATALOG_LOGO_HIDDEN_FROM_PICKER_KEY = 'aepArchCatalogLogoHiddenFromPicker';

  function archCatalogHiddenFromPickerMap() {
    try {
      var raw = localStorage.getItem(ARCH_CATALOG_LOGO_HIDDEN_FROM_PICKER_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && o.byFile && typeof o.byFile === 'object' ? o.byFile : {};
    } catch (e) {
      return {};
    }
  }

  function archCatalogHiddenFromPickerPersist(map) {
    try {
      localStorage.setItem(ARCH_CATALOG_LOGO_HIDDEN_FROM_PICKER_KEY, JSON.stringify({ version: 1, byFile: map }));
    } catch (e) {}
  }

  function archCatalogHideFromPicker(fileKey, label) {
    if (!fileKey) return;
    var m = archCatalogHiddenFromPickerMap();
    m[String(fileKey)] = { queuedAt: Date.now(), label: label || String(fileKey) };
    archCatalogHiddenFromPickerPersist(m);
  }

  function archCatalogUnhideFromPicker(fileKey) {
    if (!fileKey) return;
    var m = archCatalogHiddenFromPickerMap();
    delete m[String(fileKey)];
    archCatalogHiddenFromPickerPersist(m);
  }

  var ARCH_SPECTRUM_ICONS_HIDDEN_KEY = 'aepArchSpectrumWorkflowIconsHiddenFromPicker';

  function archSpectrumHiddenFromPickerMap() {
    try {
      var raw = localStorage.getItem(ARCH_SPECTRUM_ICONS_HIDDEN_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && o.byFile && typeof o.byFile === 'object' ? o.byFile : {};
    } catch (e) {
      return {};
    }
  }

  function archSpectrumHiddenFromPickerPersist(map) {
    try {
      localStorage.setItem(ARCH_SPECTRUM_ICONS_HIDDEN_KEY, JSON.stringify({ version: 1, byFile: map }));
    } catch (e) {}
  }

  function archSpectrumHideFromPicker(fileKey, label) {
    if (!fileKey) return;
    var m = archSpectrumHiddenFromPickerMap();
    m[String(fileKey)] = { queuedAt: Date.now(), label: label || String(fileKey) };
    archSpectrumHiddenFromPickerPersist(m);
  }

  function archSpectrumUnhideFromPicker(fileKey) {
    if (!fileKey) return;
    var m = archSpectrumHiddenFromPickerMap();
    delete m[String(fileKey)];
    archSpectrumHiddenFromPickerPersist(m);
  }

  function archPickerHiddenExportDownload() {
    var cat = archCatalogHiddenFromPickerMap();
    var sp = archSpectrumHiddenFromPickerMap();
    var removeFromArchitectureLogosJson = Object.keys(cat).sort();
    var removeFromSpectrumWorkflowIconsJson = Object.keys(sp).sort();
    var payload = {
      note:
        'Paths to remove in the repo (team merges manually). Queued in this browser only.',
      removeFromArchitectureLogosJson: removeFromArchitectureLogosJson,
      removeFromSpectrumWorkflowIconsJson: removeFromSpectrumWorkflowIconsJson,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'icons-and-logos-removal-queue.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    try {
      URL.revokeObjectURL(a.href);
    } catch (e) {}
  }

  function archCatalogLogoFindRaw(fileKey) {
    var c = archArchitectureLogosRemoteCache;
    if (!c || !Array.isArray(c.logos)) return null;
    for (var i = 0; i < c.logos.length; i++) {
      if (c.logos[i] && c.logos[i].file === fileKey) return c.logos[i];
    }
    return null;
  }

  /** Merge bundled catalog row with browser-local overrides. Keeps `file` as catalog path for sorting; uses `displayFile` for image href when replaced. */
  function archCatalogLogoItemMergedFrom(raw, catOvMap) {
    if (!raw || !raw.file) return raw;
    var ov = catOvMap[raw.file];
    if (!ov) return raw;
    var out = Object.assign({}, raw);
    out._archCatalogSourceFile = raw.file;
    if ('label' in ov && ov.label != null) out.label = String(ov.label);
    if ('description' in ov && ov.description != null) out.description = String(ov.description);
    if (ov.fileDataUrl) out.displayFile = ov.fileDataUrl;
    if ('panel' in ov) out._overridePanel = ov.panel;
    if ('groupId' in ov) out._overrideGroupId = ov.groupId;
    return out;
  }

  function archCatalogLogoOverrideRedundant(raw, next) {
    var sl = (next.label != null ? String(next.label) : '').trim();
    var sd = (next.description != null ? String(next.description) : '').trim();
    var rl = (raw && raw.label != null ? String(raw.label) : '').trim();
    var rd = (raw && raw.description != null ? String(raw.description) : '').trim();
    if (sl !== rl || sd !== rd || next.fileDataUrl) return false;
    var rawPanel = archArchitectureLogoIsAdobeSection(raw) ? 'adobe' : 'other';
    var rawGroupId = archCatalogLogoInferGroupId(raw, rawPanel);
    if ('panel' in next && next.panel !== rawPanel) return false;
    if ('groupId' in next && next.groupId !== rawGroupId) return false;
    return true;
  }

  function archCatalogLogoInferPanel(raw) {
    return archArchitectureLogoIsAdobeSection(raw) ? 'adobe' : 'other';
  }

  function archCatalogLogoInferGroupId(raw, panel) {
    var groups = panel === 'adobe' ? ARCH_ADOBE_MENU_GROUPS : ARCH_OTHER_MENU_GROUPS;
    var tags = Array.isArray(raw.tags) ? raw.tags : [];
    for (var gi = 0; gi < groups.length - 1; gi++) {
      var m = groups[gi].matchAny || [];
      for (var j = 0; j < m.length; j++) {
        if (tags.indexOf(m[j]) >= 0) return groups[gi].id;
      }
    }
    return 'other';
  }

  function archCustomLogoLibraryLoad() {
    try {
      var raw = localStorage.getItem(ARCH_CUSTOM_LOGOS_KEY);
      if (!raw) return [];
      var o = JSON.parse(raw);
      return Array.isArray(o.items) ? o.items : [];
    } catch (e) {
      return [];
    }
  }

  function archCustomLogoMigrateLibrary() {
    var items = archCustomLogoLibraryLoad();
    var next = items.map(function (e, i) {
      var o = Object.assign({}, e);
      if (typeof o.order !== 'number') o.order = Date.now() + i;
      return o;
    });
    var changed = items.some(function (e, i) {
      return !e || typeof e.order !== 'number';
    });
    if (changed) {
      try {
        archCustomLogoLibrarySave(next);
      } catch (err) {}
    }
  }

  function archCustomLogoPurgeExpired() {
    var now = Date.now();
    var grace = ARCH_CUSTOM_LOGO_DELETE_GRACE_MS;
    var items = archCustomLogoLibraryLoad();
    var next = items.filter(function (e) {
      if (!e || !e.deletedAt) return true;
      return now - e.deletedAt < grace;
    });
    if (next.length !== items.length) {
      try {
        archCustomLogoLibrarySave(next);
      } catch (err) {}
    }
  }

  function archCustomLogoLibrarySave(items) {
    localStorage.setItem(ARCH_CUSTOM_LOGOS_KEY, JSON.stringify({ version: 1, items: items }));
  }

  function archCustomLogoGroupIdToTags(panel, groupId) {
    var groups = panel === 'adobe' ? ARCH_ADOBE_MENU_GROUPS : ARCH_OTHER_MENU_GROUPS;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === groupId) return (groups[i].matchAny || []).slice();
    }
    return [];
  }

  function archCustomLogoEntryToCatalogItem(entry) {
    return {
      file: entry.fileDataUrl,
      label: entry.label || 'Uploaded logo',
      description: typeof entry.description === 'string' ? entry.description : '',
      tags: archCustomLogoGroupIdToTags(entry.panel, entry.groupId),
      _archCustomId: entry.id,
      _sortOrder: typeof entry.order === 'number' ? entry.order : 0,
    };
  }

  function archMergeCustomLogosIntoPanels(adobe, other) {
    archCustomLogoLibraryLoad().forEach(function (e) {
      if (!e || !e.fileDataUrl || !e.id) return;
      if (e.deletedAt) return;
      var item = archCustomLogoEntryToCatalogItem(e);
      if (e.panel === 'adobe') adobe.push(item);
      else other.push(item);
    });
  }

  function archFinalizeLogoBucketsCustomOrder(buckets) {
    buckets.forEach(function (bucket) {
      var head = [];
      var tail = [];
      bucket.forEach(function (it) {
        if (it && it._archCustomId) tail.push(it);
        else head.push(it);
      });
      tail.sort(function (a, b) {
        return (a._sortOrder || 0) - (b._sortOrder || 0);
      });
      bucket.length = 0;
      head.forEach(function (x) {
        bucket.push(x);
      });
      tail.forEach(function (x) {
        bucket.push(x);
      });
    });
  }

  function archCustomLogoNextOrderForGroup(panel, groupId) {
    var max = 0;
    archCustomLogoLibraryLoad().forEach(function (e) {
      if (!e || e.deletedAt) return;
      if (e.panel !== panel || String(e.groupId) !== String(groupId)) return;
      if (typeof e.order === 'number' && e.order > max) max = e.order;
    });
    return max + 1000;
  }

  function archCustomLogoMoveToGroup(id, panel, groupId) {
    var ord = archCustomLogoNextOrderForGroup(panel, groupId);
    var items = archCustomLogoLibraryLoad().map(function (e) {
      if (e.id !== id) return e;
      return Object.assign({}, e, {
        panel: panel,
        groupId: groupId,
        order: ord,
      });
    });
    archCustomLogoLibrarySave(items);
  }

  function archCustomLogoDropOnTile(dragId, targetId) {
    if (dragId === targetId) return;
    var items = archCustomLogoLibraryLoad();
    var dragE;
    var tgtE;
    items.forEach(function (e) {
      if (e.id === dragId) dragE = e;
      if (e.id === targetId) tgtE = e;
    });
    if (!dragE || !tgtE || dragE.deletedAt || tgtE.deletedAt) return;
    var panel = tgtE.panel;
    var gid = tgtE.groupId;
    var updated = items.map(function (e) {
      if (e.id !== dragId) return e;
      return Object.assign({}, e, { panel: panel, groupId: gid });
    });
    var inGroup = updated.filter(function (e) {
      return !e.deletedAt && e.panel === panel && String(e.groupId) === String(gid);
    });
    inGroup.sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    var ids = inGroup.map(function (g) {
      return g.id;
    });
    ids = ids.filter(function (id) {
      return id !== dragId;
    });
    var ti = ids.indexOf(targetId);
    if (ti < 0) return;
    ids.splice(ti, 0, dragId);
    var idToOrder = {};
    ids.forEach(function (id, idx) {
      idToOrder[id] = 1000 * (idx + 1);
    });
    var next = updated.map(function (e) {
      if (idToOrder[e.id] != null) {
        return Object.assign({}, e, {
          order: idToOrder[e.id],
          panel: panel,
          groupId: gid,
        });
      }
      return e;
    });
    archCustomLogoLibrarySave(next);
  }

  function archCustomLogoQueueDeletion(id) {
    var sid = id == null ? '' : String(id);
    if (!sid) return;
    var items = archCustomLogoLibraryLoad().map(function (e) {
      if (!e || String(e.id) !== sid) return e;
      return Object.assign({}, e, { deletedAt: Date.now() });
    });
    try {
      archCustomLogoLibrarySave(items);
    } catch (err) {
      if (liveRegion) liveRegion.textContent = 'Could not queue removal — storage may be full.';
    }
  }

  function archCustomLogoRestore(id) {
    var items = archCustomLogoLibraryLoad().map(function (e) {
      if (e.id !== id) return e;
      var o = Object.assign({}, e);
      delete o.deletedAt;
      return o;
    });
    archCustomLogoLibrarySave(items);
  }

  function archCustomLogoDeleteForever(id) {
    var items = archCustomLogoLibraryLoad().filter(function (x) {
      return x.id !== id;
    });
    archCustomLogoLibrarySave(items);
  }

  function archPartitionLogoItemsIntoGroups(items, groupDefs) {
    var buckets = groupDefs.map(function () {
      return [];
    });
    var last = groupDefs.length - 1;
    items.forEach(function (item) {
      if (item._overrideGroupId) {
        for (var oi = 0; oi < groupDefs.length; oi++) {
          if (groupDefs[oi].id === item._overrideGroupId) {
            buckets[oi].push(item);
            return;
          }
        }
      }
      var tags = Array.isArray(item.tags) ? item.tags : [];
      var placed = false;
      for (var gi = 0; gi < last; gi++) {
        var m = groupDefs[gi].matchAny || [];
        for (var j = 0; j < m.length; j++) {
          if (tags.indexOf(m[j]) >= 0) {
            buckets[gi].push(item);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) buckets[last].push(item);
    });
    return buckets;
  }

  /** Build nested `<details>` sections with sub-grids (empty groups omitted). */
  function archRenderArchitectureLogoMenu(mount, buckets, groupDefs, panelKey) {
    if (!mount) return;
    var pk =
      panelKey ||
      (mount.getAttribute && mount.getAttribute('data-arch-logo-panel')) ||
      'other';
    mount.textContent = '';
    for (var i = 0; i < groupDefs.length; i++) {
      var list = buckets[i];
      if (!list.length) continue;
      var det = document.createElement('details');
      det.className = 'arch-logo-menu-group arch-diagram-ui';
      det.setAttribute('data-arch-drop-panel', pk);
      det.setAttribute('data-arch-drop-group-id', groupDefs[i].id);
      det.open = false;
      var sum = document.createElement('summary');
      sum.className = 'arch-logo-menu-summary arch-diagram-ui';
      var lab = document.createElement('span');
      lab.className = 'arch-logo-menu-summary-label';
      lab.textContent = archMenuGroupResolvedLabel(pk, groupDefs[i]);
      var cnt = document.createElement('span');
      cnt.className = 'arch-logo-menu-count';
      cnt.setAttribute('data-arch-base-count', String(list.length));
      cnt.textContent = String(list.length);
      sum.appendChild(lab);
      sum.appendChild(cnt);
      var renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'arch-logo-menu-rename-btn arch-diagram-ui';
      renameBtn.setAttribute('data-arch-menu-rename', pk + ':' + groupDefs[i].id);
      renameBtn.setAttribute('aria-label', 'Rename submenu');
      renameBtn.title = 'Rename submenu (this browser)';
      renameBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      sum.appendChild(renameBtn);
      var inner = document.createElement('div');
      inner.className = 'arch-spectrum-icons-grid arch-architecture-logo-grid arch-logo-menu-subgrid';
      inner.setAttribute('role', 'group');
      archRenderArchitectureLogoTiles(inner, list);
      det.appendChild(sum);
      det.appendChild(inner);
      mount.appendChild(det);
    }
  }

  function archArchitectureLogoIsAdobeSection(item) {
    var f = (item && item.file) || '';
    if (f.indexOf('corporate-express-product-logos') >= 0) return true;
    return ARCH_ADOBE_LOGO_FILES.indexOf(f) >= 0;
  }

  function archLogoLibraryEditModeIsOn() {
    var sec = qs('#archEditorSectionSpectrumIcons');
    return !!(sec && sec.getAttribute('data-arch-logo-edit-mode') === '1');
  }

  function archLogoLibraryEditModeSet(on) {
    var sec = qs('#archEditorSectionSpectrumIcons');
    var toggle = qs('#archLogoLibraryEditToggle');
    if (!sec) return;
    sec.setAttribute('data-arch-logo-edit-mode', on ? '1' : '0');
    if (toggle) {
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      toggle.textContent = on ? 'Done' : 'Edit logos';
    }
    if (!on) archCustomLogoMetadataEditorClose();
  }

  /** Div tiles need explicit Enter/Space to mirror former &lt;button&gt; activation. */
  function archLogoTileKeyboardActivate(tile) {
    tile.addEventListener('keydown', function (e) {
      if (e.target !== tile) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (archLogoLibraryEditModeIsOn()) return;
      e.preventDefault();
      tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
  }

  function archLogoEditSetAnchor(el) {
    if (archLogoEditAnchorEl && archLogoEditAnchorEl !== el) {
      archLogoEditAnchorEl.classList.remove('arch-architecture-logo-tile--popover-open');
    }
    archLogoEditAnchorEl = el || null;
    if (el) el.classList.add('arch-architecture-logo-tile--popover-open');
  }

  function archLogoEditPopoverPosition() {
    var ov = qs('#archCustomLogoEditOverlay');
    var dlg = ov && ov.querySelector('.arch-custom-logo-edit-dialog');
    if (!ov || ov.hidden || !dlg) return;
    ov.classList.remove('arch-custom-logo-edit-overlay--anchored');
    dlg.style.left = '';
    dlg.style.top = '';
  }

  function archLogoEditPopoverOpenDone() {
    requestAnimationFrame(function () {
      archLogoEditPopoverPosition();
      requestAnimationFrame(archLogoEditPopoverPosition);
    });
  }

  var archLogoConfirmBusy = false;

  /** In-app confirm — avoids native `confirm()` (“site says …”), which reads as a broken page. */
  function archLogoConfirmShow(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = qs('#archLogoConfirmOverlay');
      var titleEl = qs('#archLogoConfirmTitle');
      var msgEl = qs('#archLogoConfirmMessage');
      var cancelBtn = qs('#archLogoConfirmCancel');
      var actionBtn = qs('#archLogoConfirmAction');
      if (!overlay || !titleEl || !msgEl || !cancelBtn || !actionBtn) {
        resolve(false);
        return;
      }
      if (archLogoConfirmBusy) {
        resolve(false);
        return;
      }
      archLogoConfirmBusy = true;
      var prevFocus = document.activeElement;
      var dlg = qs('#archLogoConfirmDialog');
      titleEl.textContent = opts.title || 'Confirm';
      var msgText = (opts.message != null ? String(opts.message) : '').trim();
      msgEl.textContent = msgText;
      if (msgText) {
        msgEl.hidden = false;
        if (dlg) dlg.setAttribute('aria-describedby', 'archLogoConfirmMessage');
      } else {
        msgEl.hidden = true;
        if (dlg) dlg.removeAttribute('aria-describedby');
      }
      cancelBtn.textContent = opts.cancelLabel != null ? opts.cancelLabel : 'Cancel';
      var danger = !!opts.danger;
      actionBtn.textContent = opts.confirmLabel || 'OK';
      actionBtn.className =
        'arch-diagram-ui ' +
        (danger ? 'dashboard-btn-outline arch-logo-confirm-btn--danger' : 'dashboard-btn-primary');

      function onDlgStop(e) {
        e.stopPropagation();
      }

      function cleanup(ok) {
        archLogoConfirmBusy = false;
        overlay.hidden = true;
        cancelBtn.removeEventListener('click', onCancel);
        actionBtn.removeEventListener('click', onOk);
        overlay.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        if (dlg) {
          dlg.removeEventListener('click', onDlgStop);
          dlg.removeEventListener('pointerdown', onDlgStop);
        }
        if (prevFocus && typeof prevFocus.focus === 'function') {
          try {
            prevFocus.focus();
          } catch (e) {}
        }
        resolve(!!ok);
      }
      function onCancel() {
        cleanup(false);
      }
      function onOk() {
        cleanup(true);
      }
      function onBackdrop(e) {
        if (e.target === overlay) cleanup(false);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        }
      }
      cancelBtn.addEventListener('click', onCancel);
      actionBtn.addEventListener('click', onOk);
      overlay.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
      if (dlg) {
        dlg.addEventListener('click', onDlgStop);
        dlg.addEventListener('pointerdown', onDlgStop);
      }
      overlay.hidden = false;
      requestAnimationFrame(function () {
        try {
          cancelBtn.focus();
        } catch (e) {}
      });
    });
  }

  function archLogoTileCreateIosEditButton(onActivate) {
    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'arch-architecture-logo-tile-ios-btn arch-architecture-logo-tile-ios-btn--edit arch-diagram-ui';
    editBtn.setAttribute('aria-label', 'Edit');
    editBtn.title = 'Edit label, description, or image';
    editBtn.setAttribute('draggable', 'false');
    editBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    editBtn.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      onActivate();
    });
    return editBtn;
  }

  function archLogoTileCreateIosRemoveButton(ariaLabel, title, onActivate) {
    var remBtn = document.createElement('button');
    remBtn.type = 'button';
    remBtn.className = 'arch-architecture-logo-tile-ios-btn arch-architecture-logo-tile-ios-btn--remove arch-diagram-ui';
    remBtn.setAttribute('aria-label', ariaLabel || 'Remove');
    remBtn.title = title || 'Remove';
    remBtn.setAttribute('draggable', 'false');
    remBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#dc2626"/><path fill="#fff" d="M8 11h8v2H8z"/></svg>';
    remBtn.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    remBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      onActivate();
    });
    return remBtn;
  }

  /** Populate one logo grid from catalog items (shared tile markup). */
  function archRenderArchitectureLogoTiles(grid, items) {
    if (!grid) return;
    grid.textContent = '';
    items.forEach(function (item) {
      /* Must be a div: inner pencil is a <button>; nested buttons are invalid and break hover/DOM. */
      var btn = document.createElement('div');
      btn.className = 'arch-spectrum-icons-tile arch-diagram-ui arch-architecture-logo-tile';
      btn.setAttribute('role', 'option');
      btn.tabIndex = 0;
      var effHref = item.displayFile || item.file;
      btn.setAttribute('data-arch-logo-file', effHref);
      btn.setAttribute('data-arch-logo-label', item.label || item.file);
      btn.setAttribute('data-arch-logo-desc', item.description || '');
      var tagList = Array.isArray(item.tags) ? item.tags.filter(function (t) { return t; }) : [];
      btn.setAttribute('data-arch-logo-tags', tagList.join(' '));
      var hover = (item.label || '') + (item.description ? ' — ' + item.description : '');
      var wrap = document.createElement('span');
      wrap.className = 'arch-spectrum-icons-tile-img-wrap';
      var im = document.createElement('img');
      im.src = effHref;
      im.alt = '';
      im.loading = 'lazy';
      im.width = 32;
      im.height = 32;
      wrap.appendChild(im);
      var cap = document.createElement('span');
      cap.className = 'arch-spectrum-icons-tile-cap';
      cap.textContent = item.label || item.file;
      var tileActions = null;
      if (item._archCustomId) {
        btn.setAttribute('data-arch-custom-logo-id', item._archCustomId);
        btn.setAttribute('draggable', 'true');
        btn.classList.add('arch-architecture-logo-tile--custom');
        tileActions = document.createElement('span');
        tileActions.className = 'arch-architecture-logo-tile-actions';
        tileActions.setAttribute('role', 'group');
        tileActions.setAttribute('aria-label', 'Logo actions');
        var remCust = archLogoTileCreateIosRemoveButton(
          'Delete',
          'Delete from your library (7-day grace to undo)',
          function () {
            archLogoConfirmShow({
              title: 'Delete this logo?',
              message: '',
              confirmLabel: 'Yes',
              cancelLabel: 'No',
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              archCustomLogoQueueDeletion(item._archCustomId);
              archCustomLogoRefreshLists();
              archArchitectureLogosRefreshMerged();
              if (liveRegion) liveRegion.textContent = 'Queued logo for removal.';
            });
          }
        );
        var editBtn = archLogoTileCreateIosEditButton(function () {
          if (btn._archLogoPlaceTimer) {
            clearTimeout(btn._archLogoPlaceTimer);
            btn._archLogoPlaceTimer = null;
          }
          archLogoEditSetAnchor(btn);
          archCustomLogoMetadataEditorOpen(item._archCustomId);
        });
        tileActions.appendChild(remCust);
        tileActions.appendChild(editBtn);
        btn.addEventListener('dragstart', function (e) {
          try {
            e.dataTransfer.setData('text/plain', item._archCustomId);
            e.dataTransfer.effectAllowed = 'move';
          } catch (err) {}
          archCustomLogoDragId = item._archCustomId;
          btn.classList.add('arch-architecture-logo-tile--dragging');
        });
        btn.addEventListener('dragend', function () {
          archCustomLogoDragId = null;
          btn.classList.remove('arch-architecture-logo-tile--dragging');
        });
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          if (archLogoLibraryEditModeIsOn()) {
            if (e.target.closest && e.target.closest('.arch-architecture-logo-tile-actions')) return;
            return;
          }
          if (btn._archLogoPlaceTimer) clearTimeout(btn._archLogoPlaceTimer);
          btn._archLogoPlaceTimer = setTimeout(function () {
            btn._archLogoPlaceTimer = null;
            var f = btn.getAttribute('data-arch-logo-file');
            var lab = btn.getAttribute('data-arch-logo-label');
            var desc = btn.getAttribute('data-arch-logo-desc') || '';
            if (f) archProductLogoPlace(f, lab, desc);
          }, ARCH_CUSTOM_LOGO_PLACE_DELAY_MS);
        });
      } else {
        var catKey = item.file;
        btn.setAttribute('data-arch-catalog-source-file', catKey);
        tileActions = document.createElement('span');
        tileActions.className = 'arch-architecture-logo-tile-actions';
        tileActions.setAttribute('role', 'group');
        tileActions.setAttribute('aria-label', 'Catalog logo actions');
        var remCat = archLogoTileCreateIosRemoveButton(
          'Delete',
          'Delete your saved version for this logo (this browser)',
          function () {
            archLogoConfirmShow({
              title: 'Delete this logo?',
              message: '',
              confirmLabel: 'Yes',
              cancelLabel: 'No',
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              var map = archCatalogLogoOverridesMap();
              delete map[catKey];
              archCatalogLogoOverridesPersist(map);
              archCatalogHideFromPicker(catKey, (item && item.label) || '');
              archCustomLogoRefreshLists();
              archArchitectureLogosRefreshMerged();
              if (liveRegion) liveRegion.textContent = 'Logo removed from picker. Restore under Removed from picker, or export JSON for a repo update.';
            });
          }
        );
        var catEditBtn = archLogoTileCreateIosEditButton(function () {
          archLogoEditSetAnchor(btn);
          archCatalogLogoMetadataEditorOpen(catKey);
        });
        tileActions.appendChild(remCat);
        tileActions.appendChild(catEditBtn);
      }
      btn.appendChild(wrap);
      btn.appendChild(cap);
      if (tileActions) btn.appendChild(tileActions);
      archLogoTileKeyboardActivate(btn);
      grid.appendChild(btn);
    });
  }

  function archArchitectureLogosRenderFromRemoteData(data) {
    var gridAdobe = qs('#archAdobeLogoMenuMount');
    var gridOther = qs('#archArchitectureLogoMenuMount');
    var stAdobe = qs('#archAdobeLogoStatus');
    var stOther = qs('#archArchitectureLogoStatus');
    if (!gridAdobe || !gridOther || !data || !Array.isArray(data.logos)) return;
    archCustomLogoPurgeExpired();
    archCustomLogoMigrateLibrary();
    var prevATag = gridAdobe.getAttribute('data-arch-built') === '1' ? gridAdobe.getAttribute('data-arch-active-tag') || '' : '';
    var prevOTag = gridOther.getAttribute('data-arch-built') === '1' ? gridOther.getAttribute('data-arch-active-tag') || '' : '';
    var qA = qs('#archAdobeLogoSearch');
    var qO = qs('#archArchitectureLogoSearch');
    var adobe = [];
    var other = [];
    var catOv = archCatalogLogoOverridesMap();
    var hiddenPick = archCatalogHiddenFromPickerMap();
    data.logos.forEach(function (rawItem) {
      if (!rawItem || !rawItem.file) return;
      if (hiddenPick[rawItem.file]) return;
      var item = archCatalogLogoItemMergedFrom(rawItem, catOv);
      var inAdobe = '_overridePanel' in item ? item._overridePanel === 'adobe' : archArchitectureLogoIsAdobeSection(item);
      if (inAdobe) adobe.push(item);
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
    archMergeCustomLogosIntoPanels(adobe, other);
    var bucketsAdobe = archPartitionLogoItemsIntoGroups(adobe, ARCH_ADOBE_MENU_GROUPS);
    var bucketsOther = archPartitionLogoItemsIntoGroups(other, ARCH_OTHER_MENU_GROUPS);
    archFinalizeLogoBucketsCustomOrder(bucketsAdobe);
    archFinalizeLogoBucketsCustomOrder(bucketsOther);
    archRenderArchitectureLogoMenu(gridAdobe, bucketsAdobe, ARCH_ADOBE_MENU_GROUPS, 'adobe');
    archRenderArchitectureLogoMenu(gridOther, bucketsOther, ARCH_OTHER_MENU_GROUPS, 'other');
    gridAdobe.setAttribute('data-arch-built', '1');
    gridOther.setAttribute('data-arch-built', '1');
    gridAdobe.setAttribute('data-arch-active-tag', '');
    gridOther.setAttribute('data-arch-active-tag', '');
    archArchitectureLogoTagBarInit(qs('#archAdobeLogoTagRow'), gridAdobe, stAdobe, qA, ARCH_LOGO_TAG_CHIPS_ADOBE);
    archArchitectureLogoTagBarInit(qs('#archOtherLogoTagRow'), gridOther, stOther, qO, ARCH_LOGO_TAG_CHIPS_OTHER);
    archArchitectureLogoTagBarActivate(qs('#archAdobeLogoTagRow'), gridAdobe, prevATag);
    archArchitectureLogoTagBarActivate(qs('#archOtherLogoTagRow'), gridOther, prevOTag);
    archArchitectureLogosApplyFilter(gridAdobe, stAdobe, qA ? qA.value : '');
    archArchitectureLogosApplyFilter(gridOther, stOther, qO ? qO.value : '');
  }

  function archArchitectureLogosRefreshMerged() {
    if (!archArchitectureLogosRemoteCache || !Array.isArray(archArchitectureLogosRemoteCache.logos)) {
      archArchitectureLogosPanelInit();
      return;
    }
    archArchitectureLogosRenderFromRemoteData(archArchitectureLogosRemoteCache);
  }

  function archArchitectureLogosPanelInit() {
    var gridAdobe = qs('#archAdobeLogoMenuMount');
    var gridOther = qs('#archArchitectureLogoMenuMount');
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
        archArchitectureLogosRemoteCache = data;
        archArchitectureLogosRenderFromRemoteData(data);
      })
      .catch(function () {
        archArchitectureLogosRemoteCache = null;
        var msg = 'Could not load architecture logo list. Ensure data/architecture-logos.json is deployed.';
        if (stAdobe) stAdobe.textContent = msg;
        if (stOther) stOther.textContent = msg;
      });
  }

  function archArchitectureLogoTagBarActivate(container, grid, tagId) {
    if (!container || !grid) return;
    var id = (tagId || '').trim();
    if (!id) return;
    var ok = false;
    container.querySelectorAll('.arch-logo-tag-chip').forEach(function (c) {
      if (c.getAttribute('data-arch-tag-id') === id) ok = true;
    });
    if (!ok) return;
    grid.setAttribute('data-arch-active-tag', id);
    container.querySelectorAll('.arch-logo-tag-chip').forEach(function (c) {
      c.setAttribute('aria-pressed', c.getAttribute('data-arch-tag-id') === id ? 'true' : 'false');
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
      var fileHay =
        btn.getAttribute('data-arch-catalog-source-file') || btn.getAttribute('data-arch-logo-file') || '';
      var lab =
        (btn.getAttribute('data-arch-logo-label') || '') +
        ' ' +
        fileHay +
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
    var groups = grid.querySelectorAll('.arch-logo-menu-group');
    for (var g = 0; g < groups.length; g++) {
      var det = groups[g];
      var gtiles = det.querySelectorAll('.arch-architecture-logo-tile');
      var vis = 0;
      var total = gtiles.length;
      for (var t = 0; t < gtiles.length; t++) {
        if (!gtiles[t].hidden) vis++;
      }
      det.hidden = total > 0 && vis === 0;
      var countEl = det.querySelector('.arch-logo-menu-count');
      if (countEl && total > 0) {
        countEl.textContent = filtered ? vis + '/' + total : String(total);
      }
    }
    if (statusEl) statusEl.textContent = n + ' shown' + (filtered ? ' (filtered)' : '') + '.';
  }

  function archCustomLogoEnsurePanelSelectOptions(sel) {
    if (!sel || sel.options.length) return;
    [
      { v: 'other', t: 'Product & diagram logos' },
      { v: 'adobe', t: 'Adobe Logos' },
    ].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.t;
      sel.appendChild(opt);
    });
  }

  function archCustomLogoPopulateGroupSelectEl(selEl, panel) {
    if (!selEl) return;
    var groups = panel === 'adobe' ? ARCH_ADOBE_MENU_GROUPS : ARCH_OTHER_MENU_GROUPS;
    selEl.textContent = '';
    groups.forEach(function (g) {
      var opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = archMenuGroupResolvedLabel(panel, g);
      selEl.appendChild(opt);
    });
  }

  function archCustomLogoPopulateGroupSelect(panel) {
    archCustomLogoPopulateGroupSelectEl(qs('#archCustomLogoGroup'), panel);
  }

  var archCustomLogoEditingId = null;
  var archCustomLogoEditingCatalogFile = null;

  function archCatalogLogoEditUiMode(mode) {
    var title = qs('#archCustomLogoEditTitle');
    var hint = qs('#archCustomLogoEditHint');
    var panelRow = qs('#archCustomLogoEditPanelRow');
    var replaceRow = qs('#archCatalogLogoEditReplaceRow');
    var fi = qs('#archCatalogLogoEditReplaceFile');
    var delBtn = qs('#archLogoEditDelete');
    if (mode === 'catalog') {
      if (title) title.textContent = 'Edit catalog logo';
      if (hint) {
        hint.textContent =
          'Adjust label, description, or section. Optionally replace the bundled image — stored only in this browser. Use the trash control to remove local overrides.';
      }
      if (panelRow) panelRow.hidden = false;
      if (replaceRow) replaceRow.hidden = false;
      if (delBtn) {
        delBtn.hidden = false;
        delBtn.setAttribute('aria-label', 'Remove local overrides for this logo');
        delBtn.title = 'Remove local overrides (restores bundled logo)';
      }
    } else {
      if (title) title.textContent = 'Edit uploaded logo';
      if (hint) {
        hint.textContent =
          'Change label, description, or which submenu this appears under. Logos already on the canvas keep their old label until you edit the box on the canvas.';
      }
      if (panelRow) panelRow.hidden = false;
      if (replaceRow) replaceRow.hidden = false;
      if (fi) fi.value = '';
      if (delBtn) {
        delBtn.hidden = false;
        delBtn.setAttribute('aria-label', 'Queue removal from menus');
        delBtn.title = 'Remove from library (7-day grace before permanent delete)';
      }
    }
  }

  function archCatalogLogoMetadataEditorOpen(catalogFileKey) {
    if (!catalogFileKey) return;
    var raw = archCatalogLogoFindRaw(catalogFileKey);
    if (!raw) return;
    archCustomLogoEditingCatalogFile = catalogFileKey;
    archCustomLogoEditingId = null;
    var ov = qs('#archCustomLogoEditOverlay');
    var lab = qs('#archCustomLogoEditLabel');
    var desc = qs('#archCustomLogoEditDesc');
    var fi = qs('#archCatalogLogoEditReplaceFile');
    var ps = qs('#archCustomLogoEditPanel');
    var gs = qs('#archCustomLogoEditGroup');
    if (!ov || !lab || !desc) return;
    archCatalogLogoEditUiMode('catalog');
    if (fi) fi.value = '';
    var ovMap = archCatalogLogoOverridesMap();
    var st = ovMap[catalogFileKey] || {};
    lab.value = 'label' in st ? String(st.label) : raw.label || '';
    desc.value = 'description' in st ? String(st.description) : raw.description || '';
    if (ps && gs) {
      archCustomLogoEnsurePanelSelectOptions(ps);
      var currentPanel = 'panel' in st ? st.panel : archCatalogLogoInferPanel(raw);
      ps.value = currentPanel === 'adobe' ? 'adobe' : 'other';
      archCustomLogoPopulateGroupSelectEl(gs, ps.value);
      var currentGroupId = 'groupId' in st ? st.groupId : archCatalogLogoInferGroupId(raw, ps.value);
      var hasG = false;
      for (var oi = 0; oi < gs.options.length; oi++) {
        if (gs.options[oi].value === currentGroupId) { hasG = true; break; }
      }
      gs.value = hasG ? currentGroupId : (gs.options[0] ? gs.options[0].value : '');
    }
    ov.hidden = false;
    lab.focus();
    lab.select();
    archLogoEditPopoverOpenDone();
  }

  function archCustomLogoMetadataEditorClose() {
    var ov = qs('#archCustomLogoEditOverlay');
    var dlg = qs('.arch-custom-logo-edit-dialog');
    if (ov) {
      ov.hidden = true;
      ov.classList.remove('arch-custom-logo-edit-overlay--anchored');
    }
    if (dlg) {
      dlg.style.left = '';
      dlg.style.top = '';
    }
    archLogoEditSetAnchor(null);
    archCustomLogoEditingId = null;
    archCustomLogoEditingCatalogFile = null;
    var fi = qs('#archCatalogLogoEditReplaceFile');
    if (fi) fi.value = '';
    archCatalogLogoEditUiMode('custom');
  }

  function archCustomLogoMetadataEditorOpen(id) {
    var items = archCustomLogoLibraryLoad();
    var entry = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        entry = items[i];
        break;
      }
    }
    if (!entry) return;
    if (entry.deletedAt) return;
    archCustomLogoEditingId = id;
    archCustomLogoEditingCatalogFile = null;
    var ov = qs('#archCustomLogoEditOverlay');
    var lab = qs('#archCustomLogoEditLabel');
    var desc = qs('#archCustomLogoEditDesc');
    var ps = qs('#archCustomLogoEditPanel');
    var gs = qs('#archCustomLogoEditGroup');
    if (!ov || !lab || !desc || !ps || !gs) return;
    archCatalogLogoEditUiMode('custom');
    var fi = qs('#archCatalogLogoEditReplaceFile');
    if (fi) fi.value = '';
    archCustomLogoEnsurePanelSelectOptions(ps);
    lab.value = entry.label || '';
    desc.value = typeof entry.description === 'string' ? entry.description : '';
    ps.value = entry.panel === 'adobe' ? 'adobe' : 'other';
    archCustomLogoPopulateGroupSelectEl(gs, ps.value === 'adobe' ? 'adobe' : 'other');
    var gid = entry.groupId;
    if (gid) {
      var hasG = false;
      for (var oi = 0; oi < gs.options.length; oi++) {
        if (gs.options[oi].value === gid) {
          hasG = true;
          break;
        }
      }
      gs.value = hasG ? gid : gs.options[0] ? gs.options[0].value : '';
    } else if (gs.options[0]) gs.value = gs.options[0].value;
    ov.hidden = false;
    lab.focus();
    lab.select();
    archLogoEditPopoverOpenDone();
  }

  function archCustomLogoMetadataEditorSave() {
    if (archCustomLogoEditingCatalogFile) {
      var key = archCustomLogoEditingCatalogFile;
      var raw = archCatalogLogoFindRaw(key);
      if (!raw) return;
      var labIn = qs('#archCustomLogoEditLabel');
      var descIn = qs('#archCustomLogoEditDesc');
      var fi = qs('#archCatalogLogoEditReplaceFile');
      var label = (labIn && labIn.value && labIn.value.trim()) || '';
      if (!label) return;
      var desc = (descIn && descIn.value && descIn.value.trim()) || '';
      var file = fi && fi.files && fi.files[0];
      if (file && file.size > ARCH_CUSTOM_LOGO_MAX_DATA_URL_CHARS * 0.75) {
        if (liveRegion) liveRegion.textContent = 'File too large to store locally.';
        return;
      }
      var psEl = qs('#archCustomLogoEditPanel');
      var gsEl = qs('#archCustomLogoEditGroup');
      var prevMap = archCatalogLogoOverridesMap();
      var prev = prevMap[key] || {};
      function finishCatalogOverride(dataUrl) {
        var next = { label: label, description: desc };
        if (dataUrl) next.fileDataUrl = dataUrl;
        else if (prev.fileDataUrl) next.fileDataUrl = prev.fileDataUrl;
        if (psEl) next.panel = psEl.value === 'adobe' ? 'adobe' : 'other';
        if (gsEl && gsEl.value) next.groupId = gsEl.value;
        if (archCatalogLogoOverrideRedundant(raw, next)) {
          delete prevMap[key];
        } else {
          prevMap[key] = next;
        }
        archCatalogLogoOverridesPersist(prevMap);
        archCustomLogoMetadataEditorClose();
        archArchitectureLogosRefreshMerged();
        if (liveRegion) liveRegion.textContent = 'Saved catalog logo override for this browser.';
      }
      if (file) {
        var reader = new FileReader();
        reader.onload = function () {
          var s = reader.result;
          if (typeof s === 'string' && s.length > ARCH_CUSTOM_LOGO_MAX_DATA_URL_CHARS) {
            if (liveRegion) liveRegion.textContent = 'Image data too large for local storage.';
            return;
          }
          finishCatalogOverride(s);
        };
        reader.onerror = function () {
          if (liveRegion) liveRegion.textContent = 'Could not read image file.';
        };
        reader.readAsDataURL(file);
      } else {
        finishCatalogOverride(null);
      }
      return;
    }
    if (!archCustomLogoEditingId) return;
    var labIn = qs('#archCustomLogoEditLabel');
    var descIn = qs('#archCustomLogoEditDesc');
    var ps = qs('#archCustomLogoEditPanel');
    var gs = qs('#archCustomLogoEditGroup');
    var fiCustom = qs('#archCatalogLogoEditReplaceFile');
    var label = (labIn && labIn.value && labIn.value.trim()) || '';
    if (!label) return;
    var fileCustom = fiCustom && fiCustom.files && fiCustom.files[0];
    if (fileCustom && fileCustom.size > ARCH_CUSTOM_LOGO_MAX_DATA_URL_CHARS * 0.75) {
      if (liveRegion) liveRegion.textContent = 'File too large to store locally.';
      return;
    }
    var editingId = archCustomLogoEditingId;
    function finishCustomUpdate(dataUrl) {
      var items = archCustomLogoLibraryLoad();
      var next = items.map(function (e) {
        if (e.id !== editingId) return e;
        var merged = Object.assign({}, e, {
          label: label,
          description: (descIn && descIn.value && descIn.value.trim()) || '',
          panel: ps && ps.value === 'adobe' ? 'adobe' : 'other',
          groupId: gs ? gs.value : e.groupId,
        });
        if (dataUrl) merged.fileDataUrl = dataUrl;
        return merged;
      });
      try {
        archCustomLogoLibrarySave(next);
      } catch (err) {
        return;
      }
      archCustomLogoMetadataEditorClose();
      archCustomLogoRefreshLists();
      archArchitectureLogosRefreshMerged();
    }
    if (fileCustom) {
      var readerC = new FileReader();
      readerC.onload = function () {
        var s = readerC.result;
        if (typeof s === 'string' && s.length > ARCH_CUSTOM_LOGO_MAX_DATA_URL_CHARS) {
          if (liveRegion) liveRegion.textContent = 'Image data too large for local storage.';
          return;
        }
        finishCustomUpdate(s);
      };
      readerC.onerror = function () {
        if (liveRegion) liveRegion.textContent = 'Could not read image file.';
      };
      readerC.readAsDataURL(fileCustom);
    } else {
      finishCustomUpdate(null);
    }
  }

  function archCustomLogoEditDialogInit() {
    var ov = qs('#archCustomLogoEditOverlay');
    if (!ov || ov.getAttribute('data-arch-custom-logo-edit') === '1') return;
    ov.setAttribute('data-arch-custom-logo-edit', '1');
    var dlg = ov.querySelector('.arch-custom-logo-edit-dialog');
    ov.addEventListener('click', function (e) {
      if (e.target === ov) archCustomLogoMetadataEditorClose();
    });
    if (dlg) {
      dlg.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
    var cancel = qs('#archCustomLogoEditCancel');
    var save = qs('#archCustomLogoEditSave');
    var delBtn = qs('#archLogoEditDelete');
    var ps = qs('#archCustomLogoEditPanel');
    if (cancel) cancel.addEventListener('click', archCustomLogoMetadataEditorClose);
    if (save) save.addEventListener('click', archCustomLogoMetadataEditorSave);
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        if (archCustomLogoEditingCatalogFile) {
          var map = archCatalogLogoOverridesMap();
          delete map[archCustomLogoEditingCatalogFile];
          archCatalogLogoOverridesPersist(map);
          archCustomLogoMetadataEditorClose();
          archArchitectureLogosRefreshMerged();
          if (liveRegion) liveRegion.textContent = 'Removed local overrides for this catalog logo.';
          return;
        }
        if (archCustomLogoEditingId) {
          archCustomLogoQueueDeletion(archCustomLogoEditingId);
          archCustomLogoMetadataEditorClose();
          archCustomLogoRefreshLists();
          archArchitectureLogosRefreshMerged();
          if (liveRegion) liveRegion.textContent = 'Queued logo for removal (7-day grace).';
        }
      });
    }
    window.addEventListener('resize', function () {
      var ovl = qs('#archCustomLogoEditOverlay');
      if (ovl && !ovl.hidden) archLogoEditPopoverPosition();
    });
    if (ps) {
      ps.addEventListener('change', function () {
        archCustomLogoPopulateGroupSelectEl(qs('#archCustomLogoEditGroup'), ps.value === 'adobe' ? 'adobe' : 'other');
      });
    }
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Escape') return;
        if (!ov || ov.hidden) return;
        e.preventDefault();
        archCustomLogoMetadataEditorClose();
      },
      true
    );
  }

  function archSpectrumHiddenListRender() {
    var ul = qs('#archSpectrumHiddenList');
    var empty = qs('#archSpectrumHiddenEmpty');
    if (!ul) return;
    ul.textContent = '';
    var m = archSpectrumHiddenFromPickerMap();
    var keys = Object.keys(m);
    if (empty) empty.hidden = keys.length > 0;
    keys.sort();
    keys.forEach(function (fileKey) {
      var meta = m[fileKey] || {};
      var li = document.createElement('li');
      li.className = 'arch-custom-logo-list-item';
      var span = document.createElement('span');
      span.className = 'arch-custom-logo-list-label';
      span.textContent = (meta.label || fileKey) + ' — ' + fileKey;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-btn-outline arch-spectrum-unhide-btn';
      btn.setAttribute('data-arch-spectrum-unhide', encodeURIComponent(fileKey));
      btn.setAttribute('aria-label', 'Show Spectrum icon in picker again');
      btn.textContent = 'Restore';
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function archPickerHiddenExportUpdateBtn() {
    var exp = qs('#archPickerHiddenExportBtn');
    if (!exp) return;
    var c = Object.keys(archCatalogHiddenFromPickerMap()).length;
    var s = Object.keys(archSpectrumHiddenFromPickerMap()).length;
    exp.disabled = c === 0 && s === 0;
  }

  function archCatalogHiddenListRender() {
    var ul = qs('#archCatalogHiddenList');
    var empty = qs('#archCatalogHiddenEmpty');
    if (!ul) return;
    ul.textContent = '';
    var m = archCatalogHiddenFromPickerMap();
    var keys = Object.keys(m);
    if (empty) empty.hidden = keys.length > 0;
    keys.sort();
    keys.forEach(function (fileKey) {
      var meta = m[fileKey] || {};
      var li = document.createElement('li');
      li.className = 'arch-custom-logo-list-item';
      var span = document.createElement('span');
      span.className = 'arch-custom-logo-list-label';
      span.textContent = meta.label || fileKey;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-btn-outline arch-catalog-unhide-btn';
      btn.setAttribute('data-arch-catalog-unhide', encodeURIComponent(fileKey));
      btn.setAttribute('aria-label', 'Show logo in picker again');
      btn.textContent = 'Restore';
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function archCustomLogoRefreshLists() {
    archCustomLogoListRender();
    archCustomLogoPendingListRender();
    archCatalogHiddenListRender();
    archSpectrumHiddenListRender();
    archPickerHiddenExportUpdateBtn();
  }

  function archCustomLogoListRender() {
    var ul = qs('#archCustomLogoList');
    if (!ul) return;
    ul.textContent = '';
    archCustomLogoLibraryLoad().forEach(function (e) {
      if (!e || !e.id || e.deletedAt) return;
      var li = document.createElement('li');
      li.className = 'arch-custom-logo-list-item';
      var span = document.createElement('span');
      span.className = 'arch-custom-logo-list-label';
      span.textContent = e.label || e.id;
      var editRow = document.createElement('button');
      editRow.type = 'button';
      editRow.className = 'dashboard-btn-outline arch-custom-logo-row-edit';
      editRow.setAttribute('data-arch-custom-logo-edit', e.id);
      editRow.setAttribute('aria-label', 'Edit ' + (e.label || 'logo'));
      editRow.textContent = 'Edit';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-btn-outline arch-custom-logo-remove';
      btn.setAttribute('data-arch-custom-logo-queue-delete', e.id);
      btn.setAttribute('aria-label', 'Queue removal for ' + (e.label || 'logo') + ' (7-day grace)');
      btn.textContent = 'Remove';
      li.appendChild(span);
      li.appendChild(editRow);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function archCustomLogoPendingListRender() {
    var ul = qs('#archCustomLogoPendingList');
    var empty = qs('#archCustomLogoPendingEmpty');
    if (!ul) return;
    ul.textContent = '';
    var now = Date.now();
    var grace = ARCH_CUSTOM_LOGO_DELETE_GRACE_MS;
    var pending = archCustomLogoLibraryLoad().filter(function (e) {
      return e && e.id && e.deletedAt && now - e.deletedAt < grace;
    });
    if (empty) empty.hidden = pending.length > 0;
    pending.forEach(function (e) {
      var left = Math.max(0, grace - (now - e.deletedAt));
      var days = Math.ceil(left / (24 * 60 * 60 * 1000));
      var li = document.createElement('li');
      li.className = 'arch-custom-logo-list-item arch-custom-logo-list-item--pending';
      var span = document.createElement('span');
      span.className = 'arch-custom-logo-list-label';
      span.textContent = (e.label || e.id) + ' — ' + days + ' day' + (days === 1 ? '' : 's') + ' left';
      var restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'dashboard-btn-outline arch-custom-logo-restore';
      restore.setAttribute('data-arch-custom-logo-restore', e.id);
      restore.setAttribute('aria-label', 'Restore ' + (e.label || 'logo'));
      restore.textContent = 'Restore';
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'dashboard-btn-outline arch-custom-logo-purge-now';
      del.setAttribute('data-arch-custom-logo-purge-now', e.id);
      del.setAttribute('aria-label', 'Delete ' + (e.label || 'logo') + ' permanently');
      del.textContent = 'Delete now';
      li.appendChild(span);
      li.appendChild(restore);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function archCustomLogoAddFromForm() {
    var status = qs('#archCustomLogoFormStatus');
    var fileInput = qs('#archCustomLogoFile');
    var labelIn = qs('#archCustomLogoLabel');
    var descIn = qs('#archCustomLogoDesc');
    var panel = qs('#archCustomLogoPanel');
    var groupSel = qs('#archCustomLogoGroup');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      if (status) status.textContent = 'Choose an image file.';
      return;
    }
    var label = (labelIn && labelIn.value && labelIn.value.trim()) || '';
    if (!label) {
      if (status) status.textContent = 'Enter a label.';
      return;
    }
    if (!panel || !groupSel) return;
    var fr = new FileReader();
    fr.onload = function () {
      var dataUrl = fr.result;
      if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
        if (status) status.textContent = 'Could not read image.';
        return;
      }
      if (dataUrl.length > ARCH_CUSTOM_LOGO_MAX_DATA_URL_CHARS) {
        if (status) status.textContent = 'Image is too large for browser storage (try a file under about 1 MB).';
        return;
      }
      var items = archCustomLogoLibraryLoad();
      var pv = panel.value === 'adobe' ? 'adobe' : 'other';
      var gid = groupSel.value;
      items.push({
        id: 'ucl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        fileDataUrl: dataUrl,
        label: label,
        description: (descIn && descIn.value && descIn.value.trim()) || '',
        panel: pv,
        groupId: gid,
        order: archCustomLogoNextOrderForGroup(pv, gid),
      });
      try {
        archCustomLogoLibrarySave(items);
      } catch (err) {
        if (status) status.textContent = 'Could not save (storage may be full). Remove an upload or use a smaller image.';
        return;
      }
      if (status) status.textContent = 'Added “' + label + '”.';
      fileInput.value = '';
      if (labelIn) labelIn.value = '';
      if (descIn) descIn.value = '';
      archCustomLogoRefreshLists();
      archArchitectureLogosRefreshMerged();
    };
    fr.onerror = function () {
      if (status) status.textContent = 'Failed to read file.';
    };
    fr.readAsDataURL(fileInput.files[0]);
  }

  function archCustomLogoUploadDropZoneInit() {
    var dz = qs('#archCustomLogoDropZone');
    var fi = qs('#archCustomLogoFile');
    var br = qs('#archCustomLogoBrowse');
    if (!dz || !fi || dz.getAttribute('data-arch-upload-dz') === '1') return;
    dz.setAttribute('data-arch-upload-dz', '1');
    if (br) {
      br.addEventListener('click', function (e) {
        e.preventDefault();
        fi.click();
      });
    }
    fi.addEventListener('change', function () {
      var st = qs('#archCustomLogoFormStatus');
      if (fi.files && fi.files[0] && st) {
        st.textContent = 'File selected — add a label and click Add to library.';
      }
    });
    dz.addEventListener('dragover', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      if (e.dataTransfer.types.indexOf('Files') < 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      dz.classList.add('arch-custom-logo-drop-zone--active');
    });
    dz.addEventListener('dragleave', function (e) {
      if (dz.contains(e.relatedTarget)) return;
      dz.classList.remove('arch-custom-logo-drop-zone--active');
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.remove('arch-custom-logo-drop-zone--active');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f || (f.type && f.type.indexOf('image/') !== 0)) {
        var stBad = qs('#archCustomLogoFormStatus');
        if (stBad) stBad.textContent = 'Drop a single image file (PNG, SVG, JPEG, …).';
        return;
      }
      try {
        var dt = new DataTransfer();
        dt.items.add(f);
        fi.files = dt.files;
      } catch (err) {
        return;
      }
      var st = qs('#archCustomLogoFormStatus');
      if (st) st.textContent = 'File attached — add a label and click Add to library.';
    });
  }

  function archCustomLogoDragDropInit() {
    var sec = qs('#archEditorSectionSpectrumIcons');
    if (!sec || sec.getAttribute('data-arch-custom-dnd') === '1') return;
    sec.setAttribute('data-arch-custom-dnd', '1');
    sec.addEventListener('dragover', function (e) {
      if (!archCustomLogoDragId) return;
      var group = e.target.closest && e.target.closest('.arch-logo-menu-group');
      var tile = e.target.closest && e.target.closest('.arch-architecture-logo-tile[data-arch-custom-logo-id]');
      if (group || tile) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
      document.querySelectorAll('.arch-logo-menu-group--dnd-hover').forEach(function (el) {
        el.classList.remove('arch-logo-menu-group--dnd-hover');
      });
      if (group) group.classList.add('arch-logo-menu-group--dnd-hover');
    });
    sec.addEventListener(
      'drop',
      function (e) {
        var dragId = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || archCustomLogoDragId || '';
        dragId = (dragId || '').trim();
        if (!dragId) return;
        var tile = e.target.closest && e.target.closest('.arch-architecture-logo-tile[data-arch-custom-logo-id]');
        if (tile) {
          e.preventDefault();
          var tid = tile.getAttribute('data-arch-custom-logo-id');
          if (tid && tid !== dragId) {
            archCustomLogoDropOnTile(dragId, tid);
            archArchitectureLogosRefreshMerged();
          }
          return;
        }
        var anyTile = e.target.closest && e.target.closest('.arch-architecture-logo-tile');
        if (anyTile && !anyTile.getAttribute('data-arch-custom-logo-id')) {
          return;
        }
        var group = e.target.closest && e.target.closest('.arch-logo-menu-group');
        if (group) {
          e.preventDefault();
          var panel = group.getAttribute('data-arch-drop-panel');
          var gid = group.getAttribute('data-arch-drop-group-id');
          if (panel && gid) {
            archCustomLogoMoveToGroup(dragId, panel, gid);
            archArchitectureLogosRefreshMerged();
          }
        }
      },
      false
    );
    sec.addEventListener('dragend', function () {
      document.querySelectorAll('.arch-logo-menu-group--dnd-hover').forEach(function (el) {
        el.classList.remove('arch-logo-menu-group--dnd-hover');
      });
      archCustomLogoDragId = null;
    });
  }

  function archLogoLibraryEditBarInit() {
    var sec = qs('#archEditorSectionSpectrumIcons');
    var toggle = qs('#archLogoLibraryEditToggle');
    if (!sec || !toggle || sec.getAttribute('data-arch-logo-edit-bar') === '1') return;
    sec.setAttribute('data-arch-logo-edit-bar', '1');
    archLogoLibraryEditModeSet(false);
    toggle.addEventListener('click', function () {
      archLogoLibraryEditModeSet(!archLogoLibraryEditModeIsOn());
    });
    sec.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-arch-menu-rename]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (!archLogoLibraryEditModeIsOn()) return;
      var key = btn.getAttribute('data-arch-menu-rename') || '';
      var parts = key.split(':');
      if (parts.length !== 2) return;
      var panel = parts[0];
      var groupId = parts[1];
      var defs = panel === 'adobe' ? ARCH_ADOBE_MENU_GROUPS : ARCH_OTHER_MENU_GROUPS;
      var def = null;
      for (var i = 0; i < defs.length; i++) { if (defs[i].id === groupId) { def = defs[i]; break; } }
      if (!def) return;
      var current = archMenuGroupResolvedLabel(panel, def);
      var next = window.prompt('Rename submenu (leave blank to restore default)', current);
      if (next === null) return;
      var map = archMenuGroupLabelOverridesLoad();
      var mapKey = panel + ':' + groupId;
      var trimmed = String(next).trim();
      if (!trimmed || trimmed === def.label) delete map[mapKey];
      else map[mapKey] = trimmed;
      archMenuGroupLabelOverridesPersist(map);
      archArchitectureLogosRefreshMerged();
      if (liveRegion) liveRegion.textContent = 'Submenu renamed (this browser).';
    });
  }

  function archCustomLogoUploadFormInit() {
    var root = qs('#archCustomLogoUploadDetails');
    if (!root || root.getAttribute('data-arch-custom-logo-form') === '1') return;
    root.setAttribute('data-arch-custom-logo-form', '1');
    archCustomLogoEditDialogInit();
    archLogoLibraryEditBarInit();
    archCustomLogoDragDropInit();
    archCustomLogoUploadDropZoneInit();
    var panelSel = qs('#archCustomLogoPanel');
    archCustomLogoEnsurePanelSelectOptions(panelSel);
    archCustomLogoPopulateGroupSelect(panelSel && panelSel.value === 'adobe' ? 'adobe' : 'other');
    if (panelSel) {
      panelSel.addEventListener('change', function () {
        archCustomLogoPopulateGroupSelect(panelSel.value === 'adobe' ? 'adobe' : 'other');
      });
    }
    var addBtn = qs('#archCustomLogoAdd');
    if (addBtn) addBtn.addEventListener('click', archCustomLogoAddFromForm);
    var list = qs('#archCustomLogoList');
    if (list) {
      list.addEventListener('click', function (e) {
        var editB = e.target.closest && e.target.closest('[data-arch-custom-logo-edit]');
        if (editB) {
          e.preventDefault();
          var eid = editB.getAttribute('data-arch-custom-logo-edit');
          if (eid) {
            archLogoEditSetAnchor(null);
            archCustomLogoMetadataEditorOpen(eid);
          }
          return;
        }
        var btn = e.target.closest && e.target.closest('[data-arch-custom-logo-queue-delete]');
        if (!btn) return;
        e.preventDefault();
        var id = btn.getAttribute('data-arch-custom-logo-queue-delete');
        if (id) {
          archCustomLogoQueueDeletion(id);
          archCustomLogoRefreshLists();
          archArchitectureLogosRefreshMerged();
        }
      });
    }
    var pend = qs('#archCustomLogoPendingList');
    if (pend) {
      pend.addEventListener('click', function (e) {
        var rs = e.target.closest && e.target.closest('[data-arch-custom-logo-restore]');
        var dn = e.target.closest && e.target.closest('[data-arch-custom-logo-purge-now]');
        if (rs) {
          e.preventDefault();
          var rid = rs.getAttribute('data-arch-custom-logo-restore');
          if (rid) {
            archCustomLogoRestore(rid);
            archCustomLogoRefreshLists();
            archArchitectureLogosRefreshMerged();
          }
          return;
        }
        if (dn) {
          e.preventDefault();
          var pid = dn.getAttribute('data-arch-custom-logo-purge-now');
          if (pid) {
            archCustomLogoDeleteForever(pid);
            archCustomLogoRefreshLists();
            archArchitectureLogosRefreshMerged();
          }
        }
      });
    }
    var catHid = qs('#archCatalogHiddenList');
    if (catHid && !catHid.getAttribute('data-arch-cat-hid')) {
      catHid.setAttribute('data-arch-cat-hid', '1');
      catHid.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-arch-catalog-unhide]');
        if (!b) return;
        e.preventDefault();
        var enc = b.getAttribute('data-arch-catalog-unhide');
        if (!enc) return;
        try {
          var fileKey = decodeURIComponent(enc);
          archCatalogUnhideFromPicker(fileKey);
          archCustomLogoRefreshLists();
          archArchitectureLogosRefreshMerged();
          if (liveRegion) liveRegion.textContent = 'Logo shown in picker again.';
        } catch (err) {}
      });
    }
    var catEx = qs('#archPickerHiddenExportBtn');
    if (catEx && !catEx.getAttribute('data-arch-picker-exp')) {
      catEx.setAttribute('data-arch-picker-exp', '1');
      catEx.addEventListener('click', function (e) {
        e.preventDefault();
        archPickerHiddenExportDownload();
      });
    }
    var spHid = qs('#archSpectrumHiddenList');
    if (spHid && !spHid.getAttribute('data-arch-sp-hid')) {
      spHid.setAttribute('data-arch-sp-hid', '1');
      spHid.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-arch-spectrum-unhide]');
        if (!b) return;
        e.preventDefault();
        var enc = b.getAttribute('data-arch-spectrum-unhide');
        if (!enc) return;
        try {
          var fileKey = decodeURIComponent(enc);
          archSpectrumUnhideFromPicker(fileKey);
          archCustomLogoRefreshLists();
          archSpectrumIconsRefreshMerged();
          if (liveRegion) liveRegion.textContent = 'Spectrum icon shown in picker again.';
        } catch (err) {}
      });
    }
    archCustomLogoRefreshLists();
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
    var defH = archGetStates()[idx] && archGetStates()[idx].highlights ? archGetStates()[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archHiliteOverrides()[idx];
      delete archHiliteOverrides()[String(idx)];
    } else {
      archHiliteOverrides()[String(idx)] = curH;
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
    var defH = archGetStates()[idx] && archGetStates()[idx].highlights ? archGetStates()[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archHiliteOverrides()[idx];
      delete archHiliteOverrides()[String(idx)];
    } else {
      archHiliteOverrides()[String(idx)] = curH;
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
    var rawAngle = Number(b.angle);
    o.angle = isNaN(rawAngle) ? 0 : rawAngle;
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

  /** Max distance (SVG user units) to snap connector endpoints to box anchor points. */
  var ARCH_BOX_ANCHOR_SNAP_PX = 12;

  /** Legacy edge snap — kept for hint radius when listing nearby boxes. */
  var USER_LINE_SNAP_PX = 36;

  /** Eight compass anchors on each box (corners + edge midpoints). */
  var ARCH_BOX_ANCHOR_IDS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

  /** Active snap target while dragging/drawing — `{ typ, key, anchor }` or null. */
  var archBoxAnchorSnapActive = null;

  function archBoxAnchorPointFromRect(wr, anchorId) {
    if (!wr || !anchorId) return null;
    var L = wr.left;
    var R = wr.right;
    var T = wr.top;
    var B = wr.bottom;
    var cx = wr.cx != null ? wr.cx : (L + R) / 2;
    var cy = wr.cy != null ? wr.cy : (T + B) / 2;
    switch (anchorId) {
      case 'n':
        return { x: cx, y: T };
      case 'ne':
        return { x: R, y: T };
      case 'e':
        return { x: R, y: cy };
      case 'se':
        return { x: R, y: B };
      case 's':
        return { x: cx, y: B };
      case 'sw':
        return { x: L, y: B };
      case 'w':
        return { x: L, y: cy };
      case 'nw':
        return { x: L, y: T };
      default:
        return null;
    }
  }

  /** Returns eight `{ anchor, x, y }` entries for a world rect. */
  function archBoxAnchorPoints(wr) {
    var out = [];
    for (var ai = 0; ai < ARCH_BOX_ANCHOR_IDS.length; ai++) {
      var aid = ARCH_BOX_ANCHOR_IDS[ai];
      var pt = archBoxAnchorPointFromRect(wr, aid);
      if (pt) out.push({ anchor: aid, x: pt.x, y: pt.y });
    }
    return out;
  }

  function archBoxAnchorPointWorld(typ, id, anchorId) {
    if (!typ || !id || !anchorId) return null;
    var wr = null;
    if (typ === 'node') wr = archDragWorldRect(id);
    else if (typ === 'cbox') {
      var box = archCustomBoxFind(id);
      if (box) wr = archCustomBoxWorldRect(box);
    }
    if (!wr) return null;
    return archBoxAnchorPointFromRect(wr, anchorId);
  }

  function archBoxAnchorNearest(px, py, preferredTyp, preferredId) {
    var candidates = [];
    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var wr = archDragWorldRect(key);
      if (!wr) return;
      archBoxAnchorPoints(wr).forEach(function (ap) {
        candidates.push({
          typ: 'node',
          key: key,
          anchor: ap.anchor,
          x: ap.x,
          y: ap.y,
          dist: Math.hypot(px - ap.x, py - ap.y),
        });
      });
    });
    archCustomBoxes.forEach(function (box) {
      var wr2 = archCustomBoxWorldRect(box);
      archBoxAnchorPoints(wr2).forEach(function (ap) {
        candidates.push({
          typ: 'cbox',
          key: box.id,
          anchor: ap.anchor,
          x: ap.x,
          y: ap.y,
          dist: Math.hypot(px - ap.x, py - ap.y),
        });
      });
    });
    candidates.sort(function (a, b) {
      if (Math.abs(a.dist - b.dist) < 2 && preferredTyp && preferredId) {
        if (a.typ === preferredTyp && a.key === preferredId) return -1;
        if (b.typ === preferredTyp && b.key === preferredId) return 1;
      }
      return a.dist - b.dist;
    });
    var best = candidates[0];
    if (!best || best.dist > ARCH_BOX_ANCHOR_SNAP_PX) return null;
    return best;
  }

  function archBoxAnchorEndpointFromSnap(snap) {
    if (!snap) return { kind: 'free', x: 0, y: 0 };
    if (snap.typ === 'cbox') {
      return { kind: 'cbox', boxId: snap.key, anchor: snap.anchor };
    }
    return { kind: 'anchor', node: snap.key, anchor: snap.anchor };
  }

  function archBoxAnchorHintsClear() {
    archBoxAnchorSnapActive = null;
    var layer = qs('#layer-box-anchor-hints');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
  }

  function archBoxAnchorHintsRefresh(px, py, activeSnap, targetEl) {
    var layer = qs('#layer-box-anchor-hints');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (px == null || py == null) return;

    var preferredTyp = null;
    var preferredId = null;
    if (targetEl && targetEl.closest) {
      var g = targetEl.closest('g.arch-node');
      if (g && g.id && g.id.indexOf('node-') === 0) {
        var rest = g.id.slice(5);
        if (NODE_LAYOUT[rest]) {
          preferredTyp = 'node';
          preferredId = rest;
        } else if (rest.indexOf('cbox-') === 0) {
          preferredTyp = 'cbox';
          preferredId = rest;
        }
      }
    }

    var showBoxes = {};
    function maybeShowBox(typ, key, wr) {
      var bk = typ + ':' + key;
      if (showBoxes[bk]) return;
      var near = false;
      archBoxAnchorPoints(wr).forEach(function (ap) {
        if (Math.hypot(px - ap.x, py - ap.y) <= USER_LINE_SNAP_PX) near = true;
      });
      if (!near) return;
      showBoxes[bk] = true;
      archBoxAnchorPoints(wr).forEach(function (ap) {
        var c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', String(ap.x));
        c.setAttribute('cy', String(ap.y));
        c.setAttribute('r', '4');
        c.setAttribute('class', 'arch-box-anchor-hint');
        if (
          activeSnap &&
          activeSnap.typ === typ &&
          activeSnap.key === key &&
          activeSnap.anchor === ap.anchor
        ) {
          c.classList.add('is-active');
        }
        layer.appendChild(c);
      });
    }

    Object.keys(NODE_LAYOUT).forEach(function (key) {
      var wr = archDragWorldRect(key);
      if (wr) maybeShowBox('node', key, wr);
    });
    archCustomBoxes.forEach(function (box) {
      var wr2 = archCustomBoxWorldRect(box);
      if (wr2) maybeShowBox('cbox', box.id, wr2);
    });

    if (preferredTyp && preferredId && !showBoxes[preferredTyp + ':' + preferredId]) {
      var wrP =
        preferredTyp === 'node'
          ? archDragWorldRect(preferredId)
          : archCustomBoxWorldRect(archCustomBoxFind(preferredId));
      if (wrP) maybeShowBox(preferredTyp, preferredId, wrP);
    }
  }

  /** Min half-width (px) for invisible stroke hit-testing along connector paths. */
  var USER_LINE_HIT_STROKE_MIN = 12;

  /** Min half-width (px) for built-in `.arch-flow` connector hit paths. */
  var FLOW_HIT_STROKE_MIN = 14;

  /** Prefer connector pick over flow label when click is within this distance (SVG units). */
  var FLOW_PICK_NEAR_LABEL_MAX_DIST = 12;

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

  function archUserLineLegacyEdgeToAnchor(edge, t) {
    var tt = archClamp(t, 0, 1);
    if (edge === 'n') return tt <= 0.25 ? 'nw' : tt >= 0.75 ? 'ne' : 'n';
    if (edge === 's') return tt <= 0.25 ? 'sw' : tt >= 0.75 ? 'se' : 's';
    if (edge === 'w') return tt <= 0.25 ? 'nw' : tt >= 0.75 ? 'sw' : 'w';
    if (edge === 'e') return tt <= 0.25 ? 'ne' : tt >= 0.75 ? 'se' : 'e';
    return 'n';
  }

  function archUserLineSnapEndpoint(px, py, targetEl) {
    var preferredTyp = null;
    var preferredId = null;
    if (targetEl && targetEl.closest) {
      var g = targetEl.closest('g.arch-node');
      if (g && g.id && g.id.indexOf('node-') === 0) {
        var rest = g.id.slice(5);
        if (NODE_LAYOUT[rest]) {
          preferredTyp = 'node';
          preferredId = rest;
        } else if (rest.indexOf('cbox-') === 0) {
          preferredTyp = 'cbox';
          preferredId = rest;
        }
      }
    }
    var snap = archBoxAnchorNearest(px, py, preferredTyp, preferredId);
    archBoxAnchorSnapActive = snap;
    archBoxAnchorHintsRefresh(px, py, snap, targetEl);
    if (snap) return archBoxAnchorEndpointFromSnap(snap);
    return { kind: 'free', x: px, y: py };
  }

  function archUserLineAnchorToWorld(nodeKey, edge, t, anchorId) {
    if (anchorId) {
      return archBoxAnchorPointWorld('node', nodeKey, anchorId);
    }
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

  function archCustomBoxEdgeToWorld(boxId, edge, t, anchorId) {
    if (anchorId) {
      return archBoxAnchorPointWorld('cbox', boxId, anchorId);
    }
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
      if (ep.anchor) {
        var aw2 = archUserLineAnchorToWorld(ep.node, ep.edge, ep.t, ep.anchor);
        return aw2 || null;
      }
      var aid =
        ep.edge != null && ep.t != null ? archUserLineLegacyEdgeToAnchor(ep.edge, ep.t) : ep.anchor;
      if (aid) {
        var aw3 = archUserLineAnchorToWorld(ep.node, ep.edge, ep.t, aid);
        if (aw3) return aw3;
      }
      var aw = archUserLineAnchorToWorld(ep.node, ep.edge, ep.t);
      return aw || null;
    }
    if (ep.kind === 'cbox') {
      if (ep.anchor) {
        return archCustomBoxEdgeToWorld(ep.boxId, ep.edge, ep.t, ep.anchor);
      }
      var caid =
        ep.edge != null && ep.t != null ? archUserLineLegacyEdgeToAnchor(ep.edge, ep.t) : ep.anchor;
      if (caid) {
        var cw = archCustomBoxEdgeToWorld(ep.boxId, ep.edge, ep.t, caid);
        if (cw) return cw;
      }
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
      worldRect: archLabelWorldRect(archLabel.dragPending.id),
    };
    archMoveBatchBegin(archMemberRef('label', archLabel.dragPending.id));
    archLabelClearPendingListeners();
    if (archViewport) archViewport.classList.add('arch-label-dragging');
    if (archViewport) archViewport.classList.add('arch-dragging');
    window.addEventListener('pointermove', archLabelPointerMoveWin, true);
    window.addEventListener('pointerup', archLabelPointerUpWin, true);
    window.addEventListener('pointercancel', archLabelPointerUpWin, true);
    archLabelPointerMoveWin(e);
  }

  function archLabelPointerPendingUp() {
    if (
      archLabel.dragPending &&
      !archLabel.dragActive &&
      archIsEditMode() &&
      archGetActiveTool() === 'select'
    ) {
      var id = archLabel.dragPending.id;
      var te = qs('[data-arch-id="' + id + '"]');
      if (te && !archLabelIsFlowLabel(te)) {
        archLabelSelect(id, te);
        archLabelOpenEditor(te, { force: true });
      } else if (te && archLabelIsFlowLabel(te)) {
        archLabelSelect(id, te);
      }
    }
    archLabelClearPendingListeners();
  }

  function archLabelCanInteract(te) {
    if (!archIsEditMode() || archGetActiveTool() !== 'select') return false;
    if (te && te.classList && te.classList.contains('arch-flow-label')) {
      var id = te.getAttribute('data-arch-id');
      return !!(id && archLabelSelectedId === id);
    }
    return archLabel.enabled;
  }

  function archLabelIsFlowLabel(te) {
    return !!(te && te.classList && te.classList.contains('arch-flow-label'));
  }

  function archLabelCloseInlineEditor(save) {
    if (!archLabelInlineEditorEl) return;
    var ta = archLabelInlineEditorEl;
    if (typeof ta._archFinish === 'function') ta._archFinish(!!save);
    else if (ta.parentNode) ta.parentNode.removeChild(ta);
    archLabelInlineEditorEl = null;
  }

  function archLabelEnsureFloatingLayer() {
    var layer = qs('#layer-floating-labels');
    if (layer) return layer;
    layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('id', 'layer-floating-labels');
    layer.setAttribute('class', 'arch-floating-labels-layer');
    layer.setAttribute('pointer-events', 'all');
    var ref = qs('#layer-custom-boxes');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(layer, ref.nextSibling);
    else if (archDrag && archDrag.svg) archDrag.svg.appendChild(layer);
    return layer;
  }

  function archLabelIsDynamicFloating(id) {
    return !!(id && String(id).indexOf('floating-txt-') === 0);
  }

  function archLabelCopyPayloadForId(labelId) {
    if (!labelId) return null;
    var el = qs('[data-arch-id="' + labelId + '"]');
    if (!el) return null;
    var wr = archLabelWorldRect(labelId);
    var pos = archLabel.state.pos[labelId] || { x: 0, y: 0 };
    return {
      content: archGetTextContent(el),
      pos: wr ? { x: wr.left, y: wr.top } : { x: pos.x || 0, y: pos.y || 0 },
      fontSize: el.getAttribute('font-size') || null,
      className: el.getAttribute('class') || 'arch-floating-label',
    };
  }

  function archLabelCreateFloating(id, x, y, content, fontSize, className) {
    var layer = archLabelEnsureFloatingLayer();
    if (!layer) return null;
    var t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('data-arch-id', id);
    t.setAttribute('data-arch-default', content || '');
    t.setAttribute('class', className || 'arch-floating-label');
    if (fontSize) t.setAttribute('font-size', fontSize);
    t.setAttribute('x', '0');
    t.setAttribute('y', '0');
    archSetTextContent(t, content || '');
    var wrap = document.createElementNS(SVG_NS, 'g');
    wrap.setAttribute('data-arch-label-wrap', '1');
    wrap.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    wrap.appendChild(t);
    layer.appendChild(wrap);
    archLabel.state.pos[id] = { x: x, y: y };
    archLabel.state.content[id] = content || '';
    return t;
  }

  function archLabelRemoveFloating(id) {
    if (!archLabelIsDynamicFloating(id)) return false;
    var el = qs('[data-arch-id="' + id + '"]');
    if (!el) return false;
    var wrap = archLabelTransformTarget(el);
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    delete archLabel.state.pos[id];
    delete archLabel.state.content[id];
    return true;
  }

  function archLabelOpenEditor(textEl, opts) {
    opts = opts || {};
    if (!textEl) return;
    if (!opts.force && !archLabelCanInteract()) return;
    if (
      opts.force &&
      archIsEditMode() &&
      archGetActiveTool() !== 'select'
    ) {
      return;
    }
    archLabelClearPendingListeners();
    archLabelCloseInlineEditor(true);

    var rect = textEl.getBoundingClientRect();
    var ta = document.createElement('textarea');
    ta.className = 'arch-label-inline-editor arch-diagram-ui';
    ta.setAttribute('data-arch-inline-label-editor', '1');
    ta.setAttribute('aria-label', 'Edit diagram label');
    if (opts.kind === 'cbox' && opts.boxId) {
      var box0 = archCustomBoxFind(opts.boxId);
      ta.value = box0 ? box0.name || '' : '';
    } else {
      ta.value = archGetTextContent(textEl);
    }
    var prevValue = ta.value;
    var w = Math.max(120, Math.min(420, rect.width + 28));
    var h = Math.max(36, Math.min(180, rect.height + 20));
    ta.style.position = 'fixed';
    ta.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8)) + 'px';
    ta.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - h - 8)) + 'px';
    ta.style.width = w + 'px';
    ta.style.height = h + 'px';
    ta.style.zIndex = '10000';
    document.body.appendChild(ta);
    archLabelInlineEditorEl = ta;
    ta.focus();
    ta.select();

    function finish(save) {
      if (!ta.parentNode) return;
      var next = ta.value;
      if (save) {
        if (opts.kind === 'cbox' && opts.boxId) {
          var box = archCustomBoxFind(opts.boxId);
          if (box) {
            box.name = next || 'Box';
            archCustomBoxesPersist();
            archCustomBoxesRender();
            archUserLineRender();
            archCustomBoxSyncPropsHud();
          }
        } else {
          archSetTextContent(textEl, next);
          var id = textEl.getAttribute('data-arch-id');
          if (id) archLabel.state.content[id] = next;
          archLabelSave();
        }
        if (next !== prevValue) archUndoMaybePushSnapshot();
      }
      document.body.removeChild(ta);
      ta.removeEventListener('blur', onBlur);
      if (archLabelInlineEditorEl === ta) archLabelInlineEditorEl = null;
    }
    ta._archFinish = finish;

    function onBlur() {
      finish(true);
    }
    ta.addEventListener('blur', onBlur);
    ta.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        ta.removeEventListener('blur', onBlur);
        finish(false);
        ev.preventDefault();
      }
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        ta.removeEventListener('blur', onBlur);
        finish(true);
      }
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        ta.removeEventListener('blur', onBlur);
        finish(true);
      }
    });
  }

  function archLabelPointerMoveWin(e) {
    if (!archLabel.dragActive || !archLabel.dragStart) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var dx = p.x - archLabel.dragStart.mx;
    var dy = p.y - archLabel.dragStart.my;
    if (archMoveBatch && archMoveBatch.refs && archMoveBatch.refs.length > 1) {
      archMoveBatchApplyDelta(dx, dy, { kind: 'label', id: archLabel.dragActive });
      return;
    }
    var rawOx = archLabel.dragStart.ox + dx;
    var rawOy = archLabel.dragStart.oy + dy;
    var ox = rawOx;
    var oy = rawOy;
    var startWR = archLabel.dragStart.worldRect;
    if (startWR) {
      var ddx = rawOx - archLabel.dragStart.ox;
      var ddy = rawOy - archLabel.dragStart.oy;
      var twr = {
        left: startWR.left + ddx,
        top: startWR.top + ddy,
        right: startWR.right + ddx,
        bottom: startWR.bottom + ddy,
        w: startWR.w,
        h: startWR.h,
        cx: startWR.cx + ddx,
        cy: startWR.cy + ddy,
      };
      var snapped = archSnapWorldRect(twr, { kind: 'label', id: archLabel.dragActive });
      ox = archLabel.dragStart.ox + (snapped.left - startWR.left);
      oy = archLabel.dragStart.oy + (snapped.top - startWR.top);
      archDragGuidesShow(snapped.guides);
    }
    archLabel.state.pos[archLabel.dragActive] = { x: ox, y: oy };
    var el = qs('[data-arch-id="' + archLabel.dragActive + '"]');
    if (el) {
      var tgt = archLabelTransformTarget(el);
      tgt.setAttribute('transform', 'translate(' + ox + ',' + oy + ')');
    }
  }

  function archLabelPointerUpWin() {
    if (!archLabel.dragActive) return;
    archDragGuidesClear();
    archMoveBatchEnd();
    if (archViewport) archViewport.classList.remove('arch-label-dragging');
    if (archViewport) archViewport.classList.remove('arch-dragging');
    window.removeEventListener('pointermove', archLabelPointerMoveWin, true);
    window.removeEventListener('pointerup', archLabelPointerUpWin, true);
    window.removeEventListener('pointercancel', archLabelPointerUpWin, true);
    archLabel.dragActive = null;
    archLabel.dragStart = null;
    archLabelSave();
    archUndoMaybePushSnapshot();
  }

  function archLabelPointerDownCapture(e) {
    if (e.target && e.target.closest && e.target.closest('.arch-node-resize-handle')) return;
    if (userLines.drawMode || customBoxDrawMode) return;
    var te = e.target.closest('text');
    if (!te || !te.getAttribute('data-arch-id')) return;
    if (archLabelIsFlowLabel(te)) {
      if (!archLabelCanInteract(te)) {
        if (archDrag && archDrag.svg) {
          var spNear = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
          if (archFlowPickNearestVisible(spNear.x, spNear.y, FLOW_PICK_NEAR_LABEL_MAX_DIST)) return;
        }
        return;
      }
    } else if (!archLabelCanInteract(te)) {
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    var id = te.getAttribute('data-arch-id');
    if (e.shiftKey && archIsEditMode() && archGetActiveTool() === 'select') {
      archEditMultiToggle(archMemberRef('label', id), true);
      return;
    }
    archLabelSelect(id, te);
    var cur = archLabel.state.pos[id] || { x: 0, y: 0 };
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    archLabel.dragPending = { id: id, ox: cur.x, oy: cur.y, sx: p.x, sy: p.y };
    window.addEventListener('pointermove', archLabelPointerPendingMove, true);
    window.addEventListener('pointerup', archLabelPointerPendingUp, true);
  }

  function archLabelDblClick(e) {
    var te = e.target.closest('text');
    if (!te || !te.getAttribute('data-arch-id')) return;
    if (!archIsEditMode()) return;
    if (archLabelIsFlowLabel(te) && archDrag && archDrag.svg) {
      var spDbl = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
      if (archFlowPickNearestVisible(spDbl.x, spDbl.y, FLOW_PICK_NEAR_LABEL_MAX_DIST)) return;
    }
    if (!archLabelCanInteract(te) && !archLabelIsFlowLabel(te)) {
      archLabelSetEnabled(true);
    }
    e.preventDefault();
    e.stopPropagation();
    archLabelClearPendingListeners();
    var id = te.getAttribute('data-arch-id');
    archLabelSelect(id, te);
    archLabelOpenEditor(te, { force: true });
  }

  function svgClientToSvg(svg, clientX, clientY) {
    var pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    return pt.matrixTransform(ctm.inverse());
  }

  var ARCH_CANVAS_ZOOM_KEY = 'aepArchCanvasZoom';
  var ARCH_CANVAS_ZOOM_MIN = 50;
  var ARCH_CANVAS_ZOOM_MAX = 200;
  var ARCH_CANVAS_ZOOM_STEP = 10;
  var ARCH_CANVAS_ZOOM_DEFAULT = 100;
  var archCanvasZoomPct = ARCH_CANVAS_ZOOM_DEFAULT;

  function archCanvasZoomClamp(pct) {
    return Math.max(ARCH_CANVAS_ZOOM_MIN, Math.min(ARCH_CANVAS_ZOOM_MAX, pct));
  }

  function archCanvasZoomReadStored() {
    var raw = null;
    try {
      raw = sessionStorage.getItem(ARCH_CANVAS_ZOOM_KEY);
      if (raw == null) raw = localStorage.getItem(ARCH_CANVAS_ZOOM_KEY);
    } catch (e) { /* ignore */ }
    var n = parseInt(raw, 10);
    if (!isFinite(n)) return ARCH_CANVAS_ZOOM_DEFAULT;
    return archCanvasZoomClamp(n);
  }

  function archCanvasZoomPersist(pct) {
    var s = String(pct);
    try { sessionStorage.setItem(ARCH_CANVAS_ZOOM_KEY, s); } catch (e1) { /* ignore */ }
    try { localStorage.setItem(ARCH_CANVAS_ZOOM_KEY, s); } catch (e2) { /* ignore */ }
  }

  function archCanvasZoomSyncUi(pct) {
    var slider = qs('#archCanvasZoomSlider');
    var label = qs('#archCanvasZoomPct');
    if (slider) {
      slider.value = String(pct);
      slider.setAttribute('aria-valuenow', String(pct));
    }
    if (label) label.textContent = pct + '%';
  }

  function archCanvasZoomApply(pct, opts) {
    var wrap = qs('#archIntCanvasWrap');
    var scrollEl = qs('#archIntSvgWrap');
    if (!wrap) return;
    var next = archCanvasZoomClamp(Math.round(pct));
    var prev = archCanvasZoomPct;
    var options = opts || {};
    var anchorX = options.anchorX;
    var anchorY = options.anchorY;
    if (scrollEl && anchorX != null && anchorY != null && prev > 0 && next !== prev) {
      var rect = scrollEl.getBoundingClientRect();
      var localX = anchorX - rect.left + scrollEl.scrollLeft;
      var localY = anchorY - rect.top + scrollEl.scrollTop;
      var ratio = next / prev;
      archCanvasZoomPct = next;
      wrap.style.transform = 'scale(' + (next / 100) + ')';
      scrollEl.scrollLeft = localX * ratio - (anchorX - rect.left);
      scrollEl.scrollTop = localY * ratio - (anchorY - rect.top);
    } else {
      archCanvasZoomPct = next;
      wrap.style.transform = 'scale(' + (next / 100) + ')';
    }
    archCanvasZoomSyncUi(next);
    archCanvasZoomPersist(next);
  }

  function archCanvasZoomStep(delta) {
    archCanvasZoomApply(archCanvasZoomPct + delta);
  }

  function archCanvasZoomReset() {
    archCanvasZoomApply(ARCH_CANVAS_ZOOM_DEFAULT);
  }

  function initArchCanvasZoom() {
    var wrap = qs('#archIntCanvasWrap');
    var scrollEl = qs('#archIntSvgWrap');
    if (!wrap) return;

    archCanvasZoomApply(archCanvasZoomReadStored());

    var outBtn = qs('#archCanvasZoomOut');
    var inBtn = qs('#archCanvasZoomIn');
    var slider = qs('#archCanvasZoomSlider');
    var pctBtn = qs('#archCanvasZoomPct');

    if (outBtn) {
      outBtn.addEventListener('click', function () {
        archCanvasZoomStep(-ARCH_CANVAS_ZOOM_STEP);
      });
    }
    if (inBtn) {
      inBtn.addEventListener('click', function () {
        archCanvasZoomStep(ARCH_CANVAS_ZOOM_STEP);
      });
    }
    if (slider) {
      slider.addEventListener('input', function () {
        archCanvasZoomApply(parseInt(slider.value, 10) || ARCH_CANVAS_ZOOM_DEFAULT);
      });
    }
    if (pctBtn) {
      pctBtn.addEventListener('click', archCanvasZoomReset);
      pctBtn.addEventListener('dblclick', function (e) {
        e.preventDefault();
        archCanvasZoomReset();
      });
    }

    if (scrollEl) {
      scrollEl.addEventListener(
        'wheel',
        function (e) {
          if (!(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          var delta = e.deltaY < 0 ? ARCH_CANVAS_ZOOM_STEP : -ARCH_CANVAS_ZOOM_STEP;
          archCanvasZoomApply(archCanvasZoomPct + delta, {
            anchorX: e.clientX,
            anchorY: e.clientY,
          });
        },
        { passive: false }
      );
    }

    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== '0' && e.key !== ')') return;
      var tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.target && e.target.isContentEditable) return;
      e.preventDefault();
      archCanvasZoomReset();
    });
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
    if (archMoveBatch && archMoveBatch.refs && archMoveBatch.refs.length > 1) {
      archMoveBatchApplyDelta(dx, dy, { kind: 'node', id: archDrag.active });
      return;
    }
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
    archMoveBatchEnd();
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

  function archNodeRotatePointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    var key = e.currentTarget.dataset.archNodeRotate;
    if (!key || !NODE_LAYOUT[key]) return;
    var L = NODE_LAYOUT[key];
    var p = archDrag.pos[key] || { x: 0, y: 0 };
    var wh = archNodeEffectiveWH(key);
    var worldCx = L.base[0] + p.x + L.rect[0] + wh.w / 2;
    var worldCy = L.base[1] + p.y + L.rect[1] + wh.h / 2;
    archCustomRotate.active = '__node__' + key;
    archCustomRotate.start = { svgCx: worldCx, svgCy: worldCy, startAngle: p.angle || 0 };
    window.addEventListener('pointermove', archNodeRotatePointerMoveWin, true);
    window.addEventListener('pointerup', archNodeRotatePointerUpWin, true);
    window.addEventListener('pointercancel', archNodeRotatePointerUpWin, true);
  }

  function archNodeRotatePointerMoveWin(e) {
    if (!archCustomRotate.active) return;
    e.preventDefault();
    var key = archCustomRotate.active.replace(/^__node__/, '');
    var s = archCustomRotate.start;
    var p2 = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var rawAngle = Math.atan2(p2.y - s.svgCy, p2.x - s.svgCx) * 180 / Math.PI + 90;
    var snapped = rawAngle;
    var snapPoints = [0, 45, 90, 135, 180, 225, 270, 315, 360, -45, -90, -135, -180];
    for (var si = 0; si < snapPoints.length; si++) {
      if (Math.abs(rawAngle - snapPoints[si]) < 5) { snapped = snapPoints[si]; break; }
    }
    if (!archDrag.pos[key]) archDrag.pos[key] = { x: 0, y: 0 };
    archDrag.pos[key].angle = snapped;
    archDragApply();
  }

  function archNodeRotatePointerUpWin() {
    if (!archCustomRotate.active) return;
    archCustomRotate.active = null;
    archCustomRotate.start = null;
    window.removeEventListener('pointermove', archNodeRotatePointerMoveWin, true);
    window.removeEventListener('pointerup', archNodeRotatePointerUpWin, true);
    window.removeEventListener('pointercancel', archNodeRotatePointerUpWin, true);
    archDragSave();
    archUndoMaybePushSnapshot();
  }

  function archDragPointerDown(e) {
    if (!archDrag.enabled) return;
    if (userLines.drawMode || customBoxDrawMode) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target && e.target.classList && e.target.classList.contains('arch-node-resize-handle')) return;
    if (e.target && e.target.closest && e.target.closest('[data-arch-node-rotate]')) return;
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
    archMoveBatchBegin(archMemberRef('node', which));
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

  /** Default governance pills + Gateway labels (reference deck). */
  function archCustomBoxesDefaultArray() {
    function pill(id, name, x, y) {
      return {
        id: id,
        x: x,
        y: y,
        w: 78,
        h: 20,
        name: name,
        fill: '#e5e7eb',
        stroke: '#9ca3af',
        labelFontSize: 6.5,
      };
    }
    return [
      pill('gov-audit', 'Audit Logs', 272, 528),
      pill('gov-alerts', 'Alerts', 356, 528),
      pill('gov-access', 'Access Controls', 272, 552),
      pill('gov-sandbox', 'Sandboxing', 356, 552),
      {
        id: 'gateway-side',
        x: 234,
        y: 318,
        w: 96,
        h: 14,
        name: 'Gateway / Adobe I/O',
        fill: 'transparent',
        stroke: 'transparent',
        labelFontSize: 6,
        angle: -90,
      },
      {
        id: 'gateway-bottom',
        x: 520,
        y: 556,
        w: 160,
        h: 14,
        name: 'Gateway / Adobe I/O',
        fill: 'transparent',
        stroke: 'transparent',
        labelFontSize: 6,
      },
    ];
  }

  function archCustomBoxesLoad() {
    try {
      var r = localStorage.getItem(LS_CUSTOM_BOXES);
      if (!r) {
        archCustomBoxes = archCustomBoxesDefaultArray();
        return;
      }
      var p = JSON.parse(r);
      archCustomBoxes = Array.isArray(p) ? p.map(archCustomBoxNormalize) : archCustomBoxesDefaultArray();
    } catch (e) {
      archCustomBoxes = archCustomBoxesDefaultArray();
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
      inp.addEventListener('change', function () {
        if (TE) TE.highlightPickerApplyFromDom();
      });
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
    archLayerOrderRegisterKey(archLayerOrderKeyCbox(nb.id), archLayerOrderKeyCbox(b.id));
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archUserLineRender();
    archUserLineSyncPropsHud();
    var domId = 'node-cbox-' + nb.id;
    var curH = archHighlightsForState(idx).slice();
    if (curH.indexOf(domId) < 0) curH.push(domId);
    var defH = archGetStates()[idx] && archGetStates()[idx].highlights ? archGetStates()[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archHiliteOverrides()[idx];
      delete archHiliteOverrides()[String(idx)];
    } else {
      archHiliteOverrides()[String(idx)] = curH;
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
    archLayerOrderUnregisterKey(archLayerOrderKeyCbox(sid));
    archCustomBoxSelectedId = null;
    archCustomBoxLabelActiveId = null;
    Object.keys(archHiliteOverrides()).forEach(function (k) {
      var arr = archHiliteOverrides()[k];
      if (!Array.isArray(arr)) return;
      var domId = 'node-cbox-' + sid;
      archHiliteOverrides()[k] = arr.filter(function (id) {
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
      if (archCustomBoxSelectedId === b.id || archEditMultiHas(archMemberRef('cbox', b.id))) {
        g.classList.add('arch-custom-box--selected');
      }
      var cx = b.w / 2;
      var cy = b.h / 2;
      var tfm = b.angle
        ? 'translate(' + (b.x + cx) + ',' + (b.y + cy) + ') rotate(' + b.angle + ') translate(' + (-cx) + ',' + (-cy) + ')'
        : 'translate(' + b.x + ',' + b.y + ')';
      g.setAttribute('transform', tfm);
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
      var rotHandle = archMakeRotateHandle(b.w / 2, 10, { archRotateHandle: '1' }, null);
      rotHandle.addEventListener('pointerdown', archCboxRotatePointerDown);
      g.appendChild(rotHandle);
      g.addEventListener('pointerdown', archCustomBoxDragPointerDown);
      layer.appendChild(g);
    });
    archHighlightPickerRefreshCustomBoxes();
    if (TE) TE.highlightPickerSync();
    archRefreshNodeHighlightClasses();
    archCustomBoxSyncPropsHud();
    archLayerOrderApply();
    archLayerOrderSyncUi();
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
    var defH = archGetStates()[idx] && archGetStates()[idx].highlights ? archGetStates()[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archHiliteOverrides()[idx];
      delete archHiliteOverrides()[String(idx)];
    } else {
      archHiliteOverrides()[String(idx)] = curH;
    }
    archStateHighlightOverridesPersist();
    archCustomBoxesPersist();
    archCustomBoxesRender();
    archUserLineRender();
  }

  /** Add custom box from AI assist action payload. */
  function archAssistAddCustomBox(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var nb = archCustomBoxNormalize(Object.assign({ id: 'cbox-' + Date.now() }, raw));
    archCustomBoxes.push(nb);
    archCustomBoxSelectedId = nb.id;
    archCustomBoxLabelActiveId = null;
    archCustomBoxesRender();
    archUndoMaybePushSnapshot();
    applyState();
    return nb;
  }

  /** Add connector from AI assist action payload. */
  function archAssistAddUserLine(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = 'ul-ai-' + Date.now();
    var from = raw.from;
    var to = raw.to;
    if (!from || !to) return null;
    var pts = Array.isArray(raw.points) && raw.points.length >= 2
      ? raw.points.map(function (p) {
          return { x: Number(p.x) || 0, y: Number(p.y) || 0 };
        })
      : [{ x: Number(from.x) || 0, y: Number(from.y) || 0 }, { x: Number(to.x) || 0, y: Number(to.y) || 0 }];
    var lar = raw.lineArrows === 'none' || raw.lineArrows === 'end' || raw.lineArrows === 'both'
      ? raw.lineArrows
      : 'end';
    userLines.lines.push({
      id: id,
      from: { kind: 'free', x: pts[0].x, y: pts[0].y },
      to: { kind: 'free', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y },
      points: pts,
      stroke: typeof raw.stroke === 'string' ? raw.stroke : '#308fff',
      strokeWidth: typeof raw.strokeWidth === 'number' ? raw.strokeWidth : 2,
      lineArrows: lar,
      bidirectional: lar === 'both',
      dashStyle: raw.dashStyle === 'dotted' ? 'dotted' : 'solid',
    });
    userLines.selectedId = id;
    archUserLineRender();
    archUserLinePersist();
    archUndoMaybePushSnapshot();
    return id;
  }

  function archAssistLayoutSummary() {
    var boxes = archCustomBoxes.map(function (b) {
      return {
        name: b.name,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        logoFile: b.logoFile || '',
        kind: b.kind || '',
      };
    });
    var offsets = {};
    Object.keys(archDrag.pos || {}).forEach(function (k) {
      var p = archDrag.pos[k];
      if (!p || (p.x === 0 && p.y === 0 && p.w == null && p.h == null)) return;
      offsets[k] = { x: p.x, y: p.y };
      if (typeof p.w === 'number') offsets[k].w = p.w;
      if (typeof p.h === 'number') offsets[k].h = p.h;
    });
    return {
      customBoxCount: archCustomBoxes.length,
      customBoxes: boxes.slice(0, 40),
      userLineCount: userLines.lines.length,
      nodeOffsets: offsets,
    };
  }

  function archAssistInstallOnce() {
    if (!(window.AEPDiagram && window.AEPDiagram.archAssist)) return;
    window.AEPDiagram.archAssist.install({
      qs: qs,
      getIdx: function () { return idx; },
      getTour: archGetTour,
      getLayoutSummary: archAssistLayoutSummary,
      applyState: applyState,
      tourEditor: TE,
      playback: PB,
      addCustomBox: archAssistAddCustomBox,
      addUserLine: archAssistAddUserLine,
      undoMaybePush: archUndoMaybePushSnapshot,
      saveProposalAs: typeof archProposalsHandleSaveAs === 'function' ? archProposalsHandleSaveAs : null,
      isEditMode: archIsEditMode,
    }).init();
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
    var defH = archGetStates()[idx] && archGetStates()[idx].highlights ? archGetStates()[idx].highlights : [];
    if (archHighlightArraysEqual(curH, defH)) {
      delete archHiliteOverrides()[idx];
      delete archHiliteOverrides()[String(idx)];
    } else {
      archHiliteOverrides()[String(idx)] = curH;
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
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) archCustomDrag.start.moved = true;
    if (archMoveBatch && archMoveBatch.refs && archMoveBatch.refs.length) {
      archMoveBatchApplyDelta(dx, dy, { kind: 'cbox', id: archCustomDrag.active });
      return;
    }
    var box = archCustomBoxFind(archCustomDrag.active);
    if (!box) return;
    var nx = archCustomDrag.start.ox + dx;
    var ny = archCustomDrag.start.oy + dy;
    var b = archCustomBoxNormalize(box);
    var twr = {
      left: nx,
      top: ny,
      right: nx + b.w,
      bottom: ny + b.h,
      w: b.w,
      h: b.h,
      cx: nx + b.w / 2,
      cy: ny + b.h / 2,
    };
    var snapped = archSnapWorldRect(twr, { kind: 'cbox', id: box.id });
    nx = snapped.left;
    ny = snapped.top;
    nx = archClamp(nx, 0, ARCH_GUIDE_VIEW.w - b.w);
    ny = archClamp(ny, 0, ARCH_GUIDE_VIEW.h - b.h);
    box.x = nx;
    box.y = ny;
    archDragGuidesShow(snapped.guides);
    archCustomBoxesRender();
    archDragRebuildFlows();
    archUserLineRender();
  }

  function archCustomBoxDragPointerUpWin() {
    if (!archCustomDrag.active) return;
    var boxId = archCustomDrag.active;
    var start = archCustomDrag.start;
    var moved = !!(start && start.moved);
    var labelHit = !!(start && start.labelHit);
    archDragGuidesClear();
    archMoveBatchEnd();
    archCustomDrag.active = null;
    archCustomDrag.start = null;
    if (archViewport) archViewport.classList.remove('arch-dragging');
    window.removeEventListener('pointermove', archCustomBoxDragPointerMoveWin, true);
    window.removeEventListener('pointerup', archCustomBoxDragPointerUpWin, true);
    window.removeEventListener('pointercancel', archCustomBoxDragPointerUpWin, true);
    if (
      labelHit &&
      !moved &&
      archIsEditMode() &&
      archGetActiveTool() === 'select'
    ) {
      var g = qs('#node-cbox-' + boxId);
      var tx = g && g.querySelector('.arch-custom-box-label');
      if (tx) archLabelOpenEditor(tx, { force: true, kind: 'cbox', boxId: boxId });
      return;
    }
    archCustomBoxesPersist();
    archLabelSave();
    if (moved) archUndoMaybePushSnapshot();
  }

  function archCboxRotatePointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    var g = e.currentTarget.parentNode;
    if (!g || !g.id || g.id.indexOf('node-cbox-') !== 0) return;
    var rawId = g.id.replace(/^node-cbox-/, '');
    var box = archCustomBoxFind(rawId);
    if (!box) return;
    var b = archCustomBoxNormalize(box);
    archCustomRotate.active = rawId;
    archCustomRotate.start = {
      svgCx: b.x + b.w / 2,
      svgCy: b.y + b.h / 2,
      startAngle: b.angle || 0,
    };
    window.addEventListener('pointermove', archCboxRotatePointerMoveWin, true);
    window.addEventListener('pointerup', archCboxRotatePointerUpWin, true);
    window.addEventListener('pointercancel', archCboxRotatePointerUpWin, true);
  }

  function archCboxRotatePointerMoveWin(e) {
    if (!archCustomRotate.active || !archCustomRotate.start) return;
    e.preventDefault();
    var p = svgClientToSvg(archDrag.svg, e.clientX, e.clientY);
    var s = archCustomRotate.start;
    var rawAngle = Math.atan2(p.y - s.svgCy, p.x - s.svgCx) * 180 / Math.PI + 90;
    var snapped = rawAngle;
    var snapPoints = [0, 45, 90, 135, 180, 225, 270, 315, 360, -45, -90, -135, -180];
    for (var si = 0; si < snapPoints.length; si++) {
      if (Math.abs(rawAngle - snapPoints[si]) < 5) { snapped = snapPoints[si]; break; }
    }
    var box = archCustomBoxFind(archCustomRotate.active);
    if (!box) return;
    box.angle = snapped;
    archCustomBoxesRender();
  }

  function archCboxRotatePointerUpWin() {
    if (!archCustomRotate.active) return;
    archCustomRotate.active = null;
    archCustomRotate.start = null;
    window.removeEventListener('pointermove', archCboxRotatePointerMoveWin, true);
    window.removeEventListener('pointerup', archCboxRotatePointerUpWin, true);
    window.removeEventListener('pointercancel', archCboxRotatePointerUpWin, true);
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
    if (e.target && e.target.closest && e.target.closest('[data-arch-rotate-handle]')) return;
    var box = archCustomBoxFind(rawId);
    if (!box) return;

    var labelHit = e.target && e.target.closest && e.target.closest('.arch-custom-box-label');

    if (e.shiftKey && archIsEditMode() && archGetActiveTool() === 'select' && !labelHit) {
      archEditMultiToggle(archMemberRef('cbox', rawId), true);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!archDrag.enabled) {
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      archFlowClearSelection();
      archLabelClearSelection();
      archCustomBoxSelectedId = rawId;
      archCustomBoxLabelActiveId = labelHit ? rawId : null;
      archUserLineRender();
      archUserLineSyncPropsHud();
      archCustomBoxesRender();
      e.stopPropagation();
      if (labelHit && archIsEditMode() && archGetActiveTool() === 'select') {
        var tx0 = g.querySelector('.arch-custom-box-label');
        if (tx0) archLabelOpenEditor(tx0, { force: true, kind: 'cbox', boxId: rawId });
      }
      return;
    }

    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archFlowClearSelection();
    archLabelClearSelection();
    if (!e.shiftKey) archEditMultiSetMany([archMemberRef('cbox', rawId)], archMemberRef('cbox', rawId));
    else if (!archEditMultiHas(archMemberRef('cbox', rawId))) archEditMultiToggle(archMemberRef('cbox', rawId), true);
    archCustomBoxSelectedId = rawId;
    archCustomBoxLabelActiveId = labelHit ? rawId : null;
    archUserLineRender();
    archUserLineSyncPropsHud();
    e.preventDefault();
    e.stopPropagation();
    archMoveBatchBegin(archMemberRef('cbox', rawId));
    archCustomDrag.active = rawId;
    archCustomDrag.start = {
      ox: box.x,
      oy: box.y,
      mx: svgClientToSvg(archDrag.svg, e.clientX, e.clientY).x,
      my: svgClientToSvg(archDrag.svg, e.clientX, e.clientY).y,
      worldRect: archCustomBoxWorldRect(box),
      labelHit: !!labelHit,
      moved: false,
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
    archLayerOrderEnsure();
    var payload = {
      version: 14,
      savedAt: new Date().toISOString(),
      nodes: archDrag.pos,
      labels: { pos: archLabel.state.pos, content: archLabel.state.content },
      userLines: userLines.lines.map(archUserLineMigrateLegacy),
      stateHighlightOverrides: JSON.parse(JSON.stringify(archHiliteOverrides())),
      tour: PB ? PB.cloneTour(archGetTour()) : JSON.parse(JSON.stringify(archGetTour())),
      sourcesDividers: [],
      customBoxes: JSON.parse(JSON.stringify(archCustomBoxes.map(archCustomBoxNormalize))),
      hiddenFlows: JSON.parse(JSON.stringify(archHiddenFlows || {})),
      hiddenNodes: JSON.parse(JSON.stringify(archHiddenNodes || {})),
      hiddenBackgrounds: JSON.parse(JSON.stringify(archHiddenBackgrounds || {})),
      flowOverrides: JSON.parse(JSON.stringify(archFlowOverrides || {})),
      layerOrder: archLayerOrder.slice(),
      flowPathOrder: archFlowPathOrderFromDom(),
      groups: (function () {
        var G = archGroupsApi();
        return G ? G.normalizeGroups(archDiagramGroups) : archDiagramGroups.slice();
      })(),
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
      if (TE) {
        var hiliteO = {};
        Object.keys(data.stateHighlightOverrides).forEach(function (k) {
          var v = data.stateHighlightOverrides[k];
          if (Array.isArray(v)) hiliteO[k] = v.slice();
        });
        TE.setHighlightOverrides(hiliteO);
      }
    }
    if (data.tour && typeof data.tour === 'object') {
      if (TE) {
        TE.applyStatesFromTour(data.tour);
        TE.persist();
      }
    }
    if (Array.isArray(data.sourcesDividers)) {
      archSourcesDividers = archSourcesDividersNormalize(data.sourcesDividers);
    }
    if (Array.isArray(data.customBoxes)) {
      archCustomBoxes = data.customBoxes.map(archCustomBoxNormalize);
    }
    if (data.hiddenFlows && typeof data.hiddenFlows === 'object') {
      archHiddenFlows = JSON.parse(JSON.stringify(data.hiddenFlows));
    } else {
      archHiddenFlows = {};
    }
    if (data.hiddenNodes && typeof data.hiddenNodes === 'object') {
      archHiddenNodes = JSON.parse(JSON.stringify(data.hiddenNodes));
    } else {
      archHiddenNodes = {};
    }
    if (data.hiddenBackgrounds && typeof data.hiddenBackgrounds === 'object') {
      archHiddenBackgrounds = JSON.parse(JSON.stringify(data.hiddenBackgrounds));
    } else {
      archHiddenBackgrounds = {};
    }
    if (data.flowOverrides && typeof data.flowOverrides === 'object') {
      archFlowOverrides = JSON.parse(JSON.stringify(data.flowOverrides));
    } else {
      archFlowOverrides = {};
    }
    if (Array.isArray(data.layerOrder)) {
      archLayerOrder = data.layerOrder.filter(function (k) {
        return typeof k === 'string';
      });
    } else {
      archLayerOrder = null;
    }
    if (Array.isArray(data.flowPathOrder)) {
      archFlowPathOrder = data.flowPathOrder.filter(function (k) {
        return typeof k === 'string';
      });
    } else {
      archFlowPathOrder = null;
    }
    if (Array.isArray(data.groups)) {
      var Gg = archGroupsApi();
      archDiagramGroups = Gg ? Gg.normalizeGroups(data.groups) : data.groups.slice();
    } else {
      archDiagramGroups = [];
    }
    archLayerOrderPersist();
    archHiddenFlowsPersist();
    archHiddenNodesPersist();
    archHiddenBackgroundsPersist();
    archFlowOverridesPersist();
    archHiddenNodesApply();
    archBackgroundsApply();
    archLayerOrderApply();
    archLayerOrderSyncUi();
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

  function archEditLineHandlesRefresh() {
    archUserLineHandlesRefresh();
    archFlowHandlesRefresh();
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
      var grp = document.createElementNS(SVG_NS, 'g');
      grp.setAttribute('id', 'ul-' + ln.id);
      grp.setAttribute('class', 'arch-user-line-group');
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
      } else {
        p.removeAttribute('stroke-dasharray');
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
        } else {
          p.removeAttribute('marker-end');
        }
        if (la === 'both') {
          p.setAttribute('marker-start', 'url(#archUserArrowStart)');
        } else {
          p.removeAttribute('marker-start');
        }
      }
      grp.appendChild(p);
      var hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', String(Math.max(USER_LINE_HIT_STROKE_MIN, Number(sw) + 8)));
      hit.setAttribute('fill', 'none');
      hit.setAttribute('pointer-events', 'stroke');
      hit.setAttribute('data-user-line-id', ln.id);
      hit.setAttribute('class', 'arch-user-line-hit');
      grp.appendChild(hit);
      g.appendChild(grp);
    });
    archEditLineHandlesRefresh();
    if (TE) TE.userLinePickerRefresh();
    applyState();
    archLayerOrderApply();
    archLayerOrderSyncUi();
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
    archBoxAnchorHintsClear();
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
      if (userLines.drawMode) archEditorSetPanel('sources');
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
    archBoxAnchorHintsClear();
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

  function archMemberRefExportPayload(ref) {
    var G = archGroupsApi();
    var p = G ? G.parseMemberRef(ref) : null;
    if (!p) return null;
    if (p.kind === 'cbox') {
      var box = archCustomBoxFind(p.id);
      if (!box) return null;
      var b = archCustomBoxNormalize(box);
      var cp = JSON.parse(JSON.stringify(b));
      delete cp.id;
      return { refKind: 'cbox', sourceRef: ref, data: cp };
    }
    if (p.kind === 'label') {
      var payload = archLabelCopyPayloadForId(p.id);
      if (!payload) return null;
      return { refKind: 'label', sourceRef: ref, data: payload };
    }
    if (p.kind === 'node' && NODE_LAYOUT[p.id]) {
      var np = archDrag.pos[p.id] || { x: 0, y: 0 };
      return {
        refKind: 'node',
        sourceRef: ref,
        data: { key: p.id, x: np.x || 0, y: np.y || 0, w: np.w, h: np.h, angle: np.angle },
      };
    }
    return null;
  }

  function archDiagramCopySelection() {
    if (!archIsEditMode()) return;
    var G = archGroupsApi();
    var multiRefs = archEditMultiToArray().filter(function (r) {
      return G && G.isGroupableRef(r);
    });
    if (multiRefs.length > 1) {
      var items = multiRefs.map(archMemberRefExportPayload).filter(Boolean);
      if (!items.length) return;
      var grp = G.findGroupForMember(multiRefs[0], archDiagramGroups);
      var groupMeta = null;
      if (grp && multiRefs.length === grp.members.length) {
        var allSame = grp.members.every(function (m) {
          return multiRefs.indexOf(m) >= 0;
        });
        if (allSame) groupMeta = { members: grp.members.slice() };
      }
      archDiagramClipboard = { kind: 'multi', items: items, group: groupMeta };
      if (liveRegion) liveRegion.textContent = 'Copied ' + items.length + ' objects — ⌘V to paste.';
      return;
    }
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
    if (archLabelSelectedId) {
      var payload = archLabelCopyPayloadForId(archLabelSelectedId);
      if (!payload) return;
      archDiagramClipboard = { kind: 'label', label: payload };
      if (liveRegion) liveRegion.textContent = 'Copied label — Ctrl+V or ⌘V to paste.';
      return;
    }
    if (liveRegion) liveRegion.textContent = 'Select a custom shape, label, or connector to copy.';
  }

  function archDiagramPasteClipboard() {
    if (!archIsEditMode()) return;
    if (!archDiagramClipboard) {
      if (liveRegion) liveRegion.textContent = 'Nothing to paste — copy a shape, label, or connector first.';
      return;
    }
    if (archDiagramClipboard.kind === 'multi' && Array.isArray(archDiagramClipboard.items)) {
      var off = ARCH_DIAGRAM_PASTE_OFFSET;
      var idMap = {};
      var pastedRefs = [];
      archDiagramClipboard.items.forEach(function (item) {
        if (!item || !item.refKind) return;
        if (item.refKind === 'cbox' && item.data) {
          var b = archCustomBoxNormalize(item.data);
          var nb = archCustomBoxNormalize({
            id: 'cbox-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            x: b.x + off,
            y: b.y + off,
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
            angle: b.angle,
          });
          nb.x = archClamp(nb.x, 0, ARCH_GUIDE_VIEW.w - nb.w);
          nb.y = archClamp(nb.y, 0, ARCH_GUIDE_VIEW.h - nb.h);
          archCustomBoxes.push(nb);
          var newRef = archMemberRef('cbox', nb.id);
          if (item.sourceRef) idMap[item.sourceRef] = newRef;
          pastedRefs.push(newRef);
          archLayerOrderRegisterKey(archLayerOrderKeyCbox(nb.id));
        } else if (item.refKind === 'label' && item.data) {
          var Lb = item.data;
          var newLabelId = 'floating-txt-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
          archLabelCreateFloating(
            newLabelId,
            (Number(Lb.pos && Lb.pos.x) || 0) + off,
            (Number(Lb.pos && Lb.pos.y) || 0) + off,
            Lb.content || '',
            Lb.fontSize,
            Lb.className
          );
          var lref = archMemberRef('label', newLabelId);
          if (item.sourceRef) idMap[item.sourceRef] = lref;
          pastedRefs.push(lref);
        } else if (item.refKind === 'node' && item.data && NODE_LAYOUT[item.data.key]) {
          var nk = item.data;
          if (!archDrag.pos[nk.key]) archDrag.pos[nk.key] = { x: 0, y: 0 };
          archDrag.pos[nk.key].x = (nk.x || 0) + off;
          archDrag.pos[nk.key].y = (nk.y || 0) + off;
          if (typeof nk.w === 'number') archDrag.pos[nk.key].w = nk.w;
          if (typeof nk.h === 'number') archDrag.pos[nk.key].h = nk.h;
          if (typeof nk.angle === 'number') archDrag.pos[nk.key].angle = nk.angle;
          var nref = archMemberRef('node', nk.key);
          if (item.sourceRef) idMap[item.sourceRef] = nref;
          pastedRefs.push(nref);
        }
      });
      if (archDiagramClipboard.group && archDiagramClipboard.group.members) {
        var Gp = archGroupsApi();
        var newMembers = archDiagramClipboard.group.members
          .map(function (m) {
            return idMap[m] || m;
          })
          .filter(function (m) {
            return Gp && Gp.isGroupableRef(m);
          });
        if (Gp && newMembers.length >= 2) Gp.createGroup(newMembers, archDiagramGroups);
      }
      archLabelSave();
      archCustomBoxesPersist();
      archDragSave();
      archDiagramGroupsPersist();
      archDragApply();
      archCustomBoxesRender();
      archUserLineRender();
      if (pastedRefs.length) archEditMultiSetMany(pastedRefs, pastedRefs[0]);
      archUndoMaybePushSnapshot();
      if (liveRegion) liveRegion.textContent = 'Pasted ' + pastedRefs.length + ' objects.';
      return;
    }
    if (archDiagramClipboard.kind === 'label') {
      var Lb = archDiagramClipboard.label;
      if (!Lb) return;
      var off = ARCH_DIAGRAM_PASTE_OFFSET;
      var newLabelId = 'floating-txt-' + Date.now();
      var teNew = archLabelCreateFloating(
        newLabelId,
        (Number(Lb.pos && Lb.pos.x) || 0) + off,
        (Number(Lb.pos && Lb.pos.y) || 0) + off,
        Lb.content || '',
        Lb.fontSize,
        Lb.className
      );
      archLabelSave();
      archCustomBoxSelectedId = null;
      archCustomBoxLabelActiveId = null;
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      if (archSelection) archSelection.clear();
      archCustomBoxesRender();
      archUserLineRender();
      archUserLineSyncPropsHud();
      if (teNew) archLabelSelect(newLabelId, teNew);
      archUndoMaybePushSnapshot();
      if (liveRegion) liveRegion.textContent = 'Pasted label.';
      return;
    }
    if (archDiagramClipboard.kind === 'cbox') {
      var raw = archDiagramClipboard.box;
      var b = archCustomBoxNormalize(raw);
      var pasteOff = ARCH_DIAGRAM_PASTE_OFFSET;
      var nb = archCustomBoxNormalize({
        id: 'cbox-' + Date.now(),
        x: b.x + pasteOff,
        y: b.y + pasteOff,
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
      archLabelClearSelection();
      userLines.selectedId = null;
      userLines.selectedHandleIdx = null;
      if (archSelection) archSelection.clear();
      var domId = 'node-cbox-' + nb.id;
      var curH = archHighlightsForState(idx).slice();
      if (curH.indexOf(domId) < 0) curH.push(domId);
      var defH = archGetStates()[idx] && archGetStates()[idx].highlights ? archGetStates()[idx].highlights : [];
      if (archHighlightArraysEqual(curH, defH)) {
        delete archHiliteOverrides()[idx];
        delete archHiliteOverrides()[String(idx)];
      } else {
        archHiliteOverrides()[String(idx)] = curH;
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

  function archDiagramCutSelection() {
    if (!archIsEditMode()) return;
    if (!archCustomBoxSelectedId && !userLines.selectedId && !archLabelSelectedId) {
      if (liveRegion) liveRegion.textContent = 'Select a shape, label, or connector to cut.';
      return;
    }
    archDiagramCopySelection();
    if (archLabelSelectedId) {
      var cutId = archLabelSelectedId;
      if (archLabelRemoveFloating(cutId)) {
        archLabelClearSelection();
        archLabelSave();
        archUndoMaybePushSnapshot();
        if (liveRegion) liveRegion.textContent = 'Cut label.';
        return;
      }
      var el = qs('[data-arch-id="' + cutId + '"]');
      if (el) {
        var def = el.getAttribute('data-arch-default');
        archSetTextContent(el, def != null ? def : '');
        delete archLabel.state.content[cutId];
        archLabelSave();
        archLabelClearSelection();
        archUndoMaybePushSnapshot();
        if (liveRegion) liveRegion.textContent = 'Cut label text reset.';
      }
      return;
    }
    if (archCustomBoxSelectedId) { archCustomBoxDeleteSelected(); return; }
    if (userLines.selectedId) { archUserLineDeleteSelected(); return; }
  }

  function archDiagramDuplicateSelection() {
    if (!archIsEditMode()) return;
    if (archEditMultiToArray().length > 1) {
      var prevM = archDiagramClipboard;
      archDiagramCopySelection();
      archDiagramPasteClipboard();
      archDiagramClipboard = prevM;
      return;
    }
    if (!archCustomBoxSelectedId && !userLines.selectedId && !archLabelSelectedId) {
      if (liveRegion) liveRegion.textContent = 'Select a shape, label, or connector to duplicate.';
      return;
    }
    var prev = archDiagramClipboard;
    archDiagramCopySelection();
    archDiagramPasteClipboard();
    archDiagramClipboard = prev;
  }

  function archDiagramSelectAllBaseNodes() {
    if (!archIsEditMode() || !archSelection) return;
    var ids = [];
    $all('.arch-int-svg-wrap g.arch-node.arch-draggable').forEach(function (g) {
      if (!g.id || g.id.indexOf('node-') !== 0 || g.id.indexOf('node-cbox-') === 0) return;
      var key = g.id.slice(5);
      if (NODE_LAYOUT[key] && !archHiddenNodesHas(key)) ids.push(g.id);
    });
    if (!ids.length) return;
    archCustomBoxSelectedId = null;
    userLines.selectedId = null;
    userLines.selectedHandleIdx = null;
    archFlowClearSelection();
    archSelection.setMany(ids, ids[0]);
    archCustomBoxesRender();
    archUserLineRender();
    archSelectionRefreshDom();
    if (liveRegion) liveRegion.textContent = 'Selected ' + ids.length + ' nodes.';
  }

  function archDiagramDeselectAll() {
    archEditMultiClear();
    archCustomBoxesRender();
    archUserLineRender();
    archUserLineSyncPropsHud();
    archSelectionRefreshDom();
  }

  function archDiagramNudgeSelection(dx, dy) {
    if (!archIsEditMode()) return false;
    var moved = false;
    var G = archGroupsApi();
    var multiRefs = archEditMultiToArray();
    if (multiRefs.length > 1) {
      multiRefs = G ? G.expandWithGroupMembers(multiRefs, archDiagramGroups) : multiRefs;
      multiRefs.forEach(function (ref) {
        var pos = archMemberRefGetPosition(ref);
        if (!pos) return;
        if (pos.kind === 'cbox') {
          var box = archCustomBoxFind(pos.id);
          if (!box) return;
          box.x = archClamp((box.x || 0) + dx, 0, ARCH_GUIDE_VIEW.w - (box.w || 0));
          box.y = archClamp((box.y || 0) + dy, 0, ARCH_GUIDE_VIEW.h - (box.h || 0));
          moved = true;
        } else if (pos.kind === 'label') {
          var lcur = archLabel.state.pos[pos.id] || { x: 0, y: 0 };
          archLabel.state.pos[pos.id] = { x: (lcur.x || 0) + dx, y: (lcur.y || 0) + dy };
          moved = true;
        } else if (pos.kind === 'node') {
          var p = archDrag.pos[pos.id] || (archDrag.pos[pos.id] = { x: 0, y: 0 });
          p.x = (p.x || 0) + dx;
          p.y = (p.y || 0) + dy;
          moved = true;
        }
      });
      if (moved) {
        archCustomBoxesPersist();
        archLabelSave();
        archDragApply();
        archDragSave();
        archCustomBoxesRender();
        archLabelApplyAll();
      }
      if (moved) try { archUndoMaybePushSnapshot && archUndoMaybePushSnapshot(); } catch (errN) {}
      return moved;
    }

    if (archCustomBoxSelectedId) {
      var box = archCustomBoxFind(archCustomBoxSelectedId);
      if (box) {
        box.x = archClamp((box.x || 0) + dx, 0, ARCH_GUIDE_VIEW.w - (box.w || 0));
        box.y = archClamp((box.y || 0) + dy, 0, ARCH_GUIDE_VIEW.h - (box.h || 0));
        archCustomBoxesPersist();
        archCustomBoxesRender();
        moved = true;
      }
    }

    if (userLines.selectedId) {
      var ln = archUserLineGetSelected();
      if (ln && Array.isArray(ln.points)) {
        if (archUserLineIsConnector(ln)) {
          archUserLineConnectorSyncEndpoints(ln);
          ln.points = ln.points.map(function (pt) {
            var o = archUserLinePointXY(pt);
            return { x: o.x + dx, y: o.y + dy };
          });
          var p0 = archUserLinePointXY(ln.points[0]);
          var pN = archUserLinePointXY(ln.points[ln.points.length - 1]);
          ln.from = { kind: 'free', x: p0.x, y: p0.y };
          ln.to = { kind: 'free', x: pN.x, y: pN.y };
          if (ln.sourcesDividerLocal) delete ln.sourcesDividerLocal;
        } else if (archUserLineIsFreehandLine(ln)) {
          ln.points = ln.points.map(function (pt) {
            return [(Number(pt && pt[0]) || 0) + dx, (Number(pt && pt[1]) || 0) + dy];
          });
        }
        archUserLinePersist();
        archUserLineRender();
        moved = true;
      }
    }

    if (archSelectedFlowId) {
      var fpts = archFlowGetPoints(archSelectedFlowId);
      if (fpts.length >= 2) {
        fpts = fpts.map(function (p) {
          return { x: (p.x || 0) + dx, y: (p.y || 0) + dy };
        });
        archFlowSaveOverridePoints(archSelectedFlowId, fpts);
        archFlowHandlesRefresh();
        moved = true;
      }
    }

    if (archSelection && archSelection.count() > 0) {
      var ids = [];
      try { ids = archSelection.toArray ? archSelection.toArray() : []; } catch (e) {}
      var changed = 0;
      ids.forEach(function (sid) {
        if (!sid || sid.indexOf('node-') !== 0 || sid.indexOf('node-cbox-') === 0) return;
        var key = sid.slice(5);
        if (!NODE_LAYOUT[key]) return;
        var p = archDrag.pos[key] || (archDrag.pos[key] = { x: 0, y: 0 });
        p.x = (p.x || 0) + dx;
        p.y = (p.y || 0) + dy;
        changed++;
      });
      if (changed) {
        archDragApply();
        archDragSave();
        moved = true;
      }
    }

    if (archLabelSelectedId) {
      var lcur = archLabel.state.pos[archLabelSelectedId] || { x: 0, y: 0 };
      archLabel.state.pos[archLabelSelectedId] = {
        x: (lcur.x || 0) + dx,
        y: (lcur.y || 0) + dy,
      };
      archLabelApplyAll();
      archLabelSave();
      moved = true;
    }

    if (moved) try { archUndoMaybePushSnapshot && archUndoMaybePushSnapshot(); } catch (err) {}
    return moved;
  }

  function archDiagramToggleEditMode() {
    archSetEditMode(!archIsEditMode());
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
    var delId = userLines.selectedId;
    userLines.lines = userLines.lines.filter(function (x) {
      return x.id !== delId;
    });
    archLayerOrderUnregisterKey(archLayerOrderKeyUl(delId));
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
      if (lineHit && archGetActiveTool() === 'select') {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        var lidPick = lineHit.getAttribute('data-user-line-id');
        userLines.selectedHandleIdx = null;
        userLines.selectedId = lidPick;
        archFlowClearSelection();
        archCustomBoxSelectedId = null;
        archCustomBoxLabelActiveId = null;
        if (archSelection) archSelection.clear();
        archCustomBoxesRender();
        archUserLineRender();
        archUserLineSyncPropsHud();
        archSelectionRefreshDom();
        e.preventDefault();
        e.stopPropagation();
        archConnectorBodyDragBegin('user', lidPick, e);
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
    if (archSelectedFlowId) {
      if (
        archFlowSelectedHandleIdx != null &&
        archFlowSelectedHandleIdx > 0
      ) {
        var fpts = archFlowGetPoints(archSelectedFlowId);
        var fk = archFlowSelectedHandleIdx;
        if (fpts.length > 2 && fk > 0 && fk < fpts.length - 1) {
          e.preventDefault();
          fpts.splice(fk, 1);
          archFlowSaveOverridePoints(archSelectedFlowId, fpts);
          archFlowSelectedHandleIdx = null;
          archFlowHandlesRefresh();
          archUndoMaybePushSnapshot();
          if (liveRegion) liveRegion.textContent = 'Removed bend point from built-in flow.';
          return;
        }
      }
      e.preventDefault();
      archFlowDeleteSelected();
      return;
    }
    if (archBgSelectedId) {
      e.preventDefault();
      archHiddenBackgroundsAdd(archBgSelectedId);
      archBgClearSelection();
      archBackgroundsApply();
      if (liveRegion) liveRegion.textContent = 'Background removed from this proposal.';
      try { archUndoMaybePushSnapshot && archUndoMaybePushSnapshot(); } catch (errBg) {}
      return;
    }
    if (archSelection && archSelection.count() > 0) {
      var ids = [];
      try { ids = archSelection.toArray ? archSelection.toArray() : []; } catch (err) {}
      if (!ids.length && archSelection.primary) ids = [archSelection.primary];
      var baseKeys = [];
      for (var si = 0; si < ids.length; si++) {
        var sid = ids[si];
        if (sid && sid.indexOf('node-') === 0 && sid.indexOf('node-cbox-') !== 0) {
          var skey = sid.slice(5);
          if (NODE_LAYOUT[skey]) baseKeys.push(skey);
        }
      }
      if (baseKeys.length) {
        e.preventDefault();
        for (var bi = 0; bi < baseKeys.length; bi++) archHiddenNodesAdd(baseKeys[bi]);
        archSelection.clear();
        archHiddenNodesApply();
        archSelectionRefreshDom();
        if (liveRegion) liveRegion.textContent = 'Node removed from this proposal.';
        try { archUndoMaybePushSnapshot && archUndoMaybePushSnapshot(); } catch (err2) {}
        return;
      }
    }
    if (archLabelSelectedId) {
      e.preventDefault();
      var delLabelId = archLabelSelectedId;
      if (archLabelRemoveFloating(delLabelId)) {
        archLabelClearSelection();
        archLabelSave();
        archUndoMaybePushSnapshot();
        if (liveRegion) liveRegion.textContent = 'Label removed.';
        return;
      }
      var delEl = qs('[data-arch-id="' + delLabelId + '"]');
      if (delEl) {
        var defTxt = delEl.getAttribute('data-arch-default');
        archSetTextContent(delEl, defTxt != null ? defTxt : '');
        delete archLabel.state.content[delLabelId];
        var tgtDel = archLabelTransformTarget(delEl);
        tgtDel.removeAttribute('transform');
        delete archLabel.state.pos[delLabelId];
        archLabelSave();
        archLabelClearSelection();
        archUndoMaybePushSnapshot();
        if (liveRegion) liveRegion.textContent = 'Label text reset.';
      }
      return;
    }
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
      localStorage.removeItem('aepArchStateHighlightOverrides');
      localStorage.removeItem('aepDiagramUndoStack');
      localStorage.removeItem('aepDiagramSelection');
      localStorage.removeItem(LS_LINE_TOOLBAR_DEFAULTS);
      localStorage.removeItem(LS_HIDDEN_FLOWS);
      localStorage.removeItem(LS_HIDDEN_NODES);
      localStorage.removeItem(LS_HIDDEN_BACKGROUNDS);
      localStorage.removeItem(LS_LAYER_ORDER);
      localStorage.removeItem(LS_FLOW_OVERRIDES);
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

  /** Phase 4: portable vendor + connector summary for external tooling (see data/diagram-interop.json). */
  function archStackSummaryDownload() {
    var I = window.AEPDiagram && window.AEPDiagram.interop;
    if (!I || typeof I.exportStackSummaryFromPayload !== 'function') {
      window.alert('Interop module missing. Reload the page.');
      return;
    }
    var snap = archMasterSerialize();
    function downloadSummary(summary) {
      var blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'aep-architecture-stack-summary.json';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }
    var base = I.exportStackSummaryFromPayload(snap);
    if (typeof I.buildCatalogTagMapFromLogos !== 'function' || typeof I.enrichStackSummaryWithCatalogTags !== 'function') {
      downloadSummary(base);
      if (liveRegion) liveRegion.textContent = 'Stack summary (interop JSON) downloaded.';
      return;
    }
    fetch('data/architecture-logos.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (cat) {
        var tagMap = I.buildCatalogTagMapFromLogos(cat && cat.logos);
        var summary = I.exportStackSummaryFromPayload(archMasterSerialize());
        I.enrichStackSummaryWithCatalogTags(summary, tagMap);
        downloadSummary(summary);
        if (liveRegion) {
          liveRegion.textContent = 'Stack summary downloaded (catalog tags added when paths match the logo catalog).';
        }
      })
      .catch(function () {
        downloadSummary(base);
        if (liveRegion) {
          liveRegion.textContent =
            'Stack summary downloaded (catalog tags skipped — logo catalog unavailable).';
        }
      });
  }

  /** Import vendor/icon entries from a stack summary JSON (connectors not restored). */
  function archApplyStackSummaryVendors(data) {
    var vendors = data && Array.isArray(data.vendors) ? data.vendors : [];
    var baseIdx = archCustomBoxes.length;
    vendors.forEach(function (v, i) {
      if (!v || typeof v.assetPath !== 'string' || !v.assetPath) return;
      if (v.kind !== 'productLogo' && v.kind !== 'spectrumIcon') return;
      var defW = v.kind === 'spectrumIcon' ? 40 : 48;
      var defH = v.kind === 'spectrumIcon' ? 40 : 48;
      var w =
        typeof v.w === 'number' && isFinite(v.w) ? v.w : defW;
      var h =
        typeof v.h === 'number' && isFinite(v.h) ? v.h : defH;
      w = Math.max(ARCH_MIN_NODE_W, Math.min(ARCH_MAX_NODE_W, w));
      h = Math.max(ARCH_MIN_NODE_H, Math.min(ARCH_MAX_NODE_H, h));
      var x =
        typeof v.x === 'number' && isFinite(v.x)
          ? v.x
          : 380 + ((baseIdx + i) % 10) * 24;
      var y =
        typeof v.y === 'number' && isFinite(v.y)
          ? v.y
          : 180 + ((baseIdx + i) % 8) * 24;
      x = archClamp(x, 0, ARCH_GUIDE_VIEW.w - w);
      y = archClamp(y, 0, ARCH_GUIDE_VIEW.h - h);
      var bid = typeof v.boxId === 'string' && v.boxId && !archCustomBoxFind(v.boxId) ? v.boxId : null;
      var id =
        bid || 'cbox-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 9);
      var nb;
      if (v.kind === 'spectrumIcon') {
        nb = archCustomBoxNormalize({
          id: id,
          x: x,
          y: y,
          w: w,
          h: h,
          name: v.name || v.caption || 'Icon',
          kind: 'spectrumIcon',
          iconFile: v.assetPath,
          fill: 'none',
          stroke: 'transparent',
        });
      } else {
        nb = archCustomBoxNormalize({
          id: id,
          x: x,
          y: y,
          w: w,
          h: h,
          name: v.name || v.caption || 'Logo',
          kind: 'productLogo',
          logoFile: v.assetPath,
          logoDescription: typeof v.caption === 'string' ? v.caption : '',
          fill: 'none',
          stroke: 'transparent',
        });
      }
      archCustomBoxes.push(nb);
      var domId = 'node-cbox-' + nb.id;
      var curH = archHighlightsForState(idx).slice();
      if (curH.indexOf(domId) < 0) curH.push(domId);
      var defHil = archGetStates()[idx] && archGetStates()[idx].highlights ? archGetStates()[idx].highlights : [];
      if (archHighlightArraysEqual(curH, defHil)) {
        delete archHiliteOverrides()[idx];
        delete archHiliteOverrides()[String(idx)];
      } else {
        archHiliteOverrides()[String(idx)] = curH;
      }
    });
    archStateHighlightOverridesPersist();
    archCustomBoxesPersist();
    archCustomBoxesRender();
    archUserLineRender();
    archSelectionPanelSync();
  }

  function archStackSummaryImportFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var raw = JSON.parse(r.result);
        var I = window.AEPDiagram && window.AEPDiagram.interop;
        if (!I || typeof I.validateStackSummaryForImport !== 'function') {
          window.alert('Interop module missing. Reload the page.');
          return;
        }
        var v = I.validateStackSummaryForImport(raw);
        if (!v.ok) {
          window.alert('Not a valid stack summary:\n' + v.errors.slice(0, 12).join('\n'));
          return;
        }
        if (!archIsEditMode()) {
          window.alert('Turn on Edit diagram first.');
          return;
        }
        var vendors = raw.vendors || [];
        if (vendors.length === 0) {
          window.alert('No vendors in this file.');
          return;
        }
        if (
          vendors.length > 24 &&
          !window.confirm('Import ' + vendors.length + ' icons/logos onto the canvas?')
        ) {
          return;
        }
        archApplyStackSummaryVendors(raw);
        archUndoMaybePushSnapshot();
        if (liveRegion) {
          liveRegion.textContent = 'Imported ' + vendors.length + ' vendor(s) from stack summary.';
        }
      } catch (err) {
        window.alert('Could not import: invalid JSON.');
      }
    };
    r.readAsText(file);
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
    archFlowHitsEnsureAll();
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
    archFlowFloatInit();
    archLineFloatUpdateVisibility();
    archFlowFloatUpdateVisibility();

    var reset = qs('#archDragReset');
    var masterSave = qs('#archMasterSave');
    var masterDl = qs('#archMasterDownload');
    var stackSummaryDl = qs('#archStackSummaryDownload');
    var stackSummaryImport = qs('#archStackSummaryImport');
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
    if (stackSummaryDl) {
      stackSummaryDl.addEventListener('click', archStackSummaryDownload);
    }
    if (stackSummaryImport) {
      stackSummaryImport.addEventListener('change', function () {
        var f = stackSummaryImport.files && stackSummaryImport.files[0];
        if (f) archStackSummaryImportFile(f);
        stackSummaryImport.value = '';
      });
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
    archDrag.svg.addEventListener('pointerdown', archFlowHandlePointerDown, true);
    archDrag.svg.addEventListener('pointerdown', archDiagramFlowPointerDown, true);
    archDrag.svg.addEventListener('pointerdown', archCustomBoxDrawPointerDownCapture, true);
    archDrag.svg.addEventListener('pointerdown', archLabelPointerDownCapture, true);
    archDrag.svg.addEventListener('click', archDiagramFlowClick, true);
    archDrag.svg.addEventListener('dblclick', archDblClickEdit, true);
    archDrag.svg.addEventListener('contextmenu', archDiagramContextMenuOnCanvas, true);
    archDrag.svg.addEventListener('pointerdown', archResizePointerDown, false);
    archDrag.svg.addEventListener('pointerdown', archUserLineOnPointerDown, false);

    $all('.arch-int-svg-wrap g.arch-node').forEach(function (g) {
      g.addEventListener('pointerdown', archDragPointerDown);
    });

    archUserLineSyncDrawModeFromEditor();
    archEditorSyncLinesDockChrome();

    archEditSelectionInit();
    archContextMenuInit();
    archLayerOrderInit();
    archHiddenNodesApply();
    archBackgroundsApply();
    archAepBgPlateSync();
    archLayerOrderApply();
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
          if (!archIsEditMode()) return;
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
          if (mod && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            archDiagramCutSelection();
            return;
          }
          if (mod && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            archDiagramDuplicateSelection();
            return;
          }
          if (mod && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            if (e.shiftKey) archDiagramUngroupSelection();
            else archDiagramGroupSelection();
            return;
          }
          if (mod && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            archDiagramSelectAllBaseNodes();
            return;
          }
          if (mod && e.key.toLowerCase() === 's') {
            if (e.shiftKey) {
              e.preventDefault();
              if (typeof archProposalsHandleSaveAs === 'function') archProposalsHandleSaveAs();
              return;
            }
            e.preventDefault();
            if (typeof archProposalsHandleSave === 'function') archProposalsHandleSave();
            return;
          }
          if (mod && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            archDiagramToggleEditMode();
            return;
          }
          if (!mod && e.key === 'Escape') {
            archDiagramDeselectAll();
            return;
          }
          if (!mod && archIsEditMode() && archLayerOrderCanAdjust()) {
            if (e.key === ']' && e.shiftKey) {
              e.preventDefault();
              archLayerOrderToExtreme(true);
              return;
            }
            if (e.key === '[' && e.shiftKey) {
              e.preventDefault();
              archLayerOrderToExtreme(false);
              return;
            }
            if (e.key === ']') {
              e.preventDefault();
              archLayerOrderMove(1);
              return;
            }
            if (e.key === '[') {
              e.preventDefault();
              archLayerOrderMove(-1);
              return;
            }
          }
          if (!mod && archIsEditMode() && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            var hasSel = !!(
              archEditMultiToArray().length ||
              archCustomBoxSelectedId ||
              userLines.selectedId ||
              archLabelSelectedId ||
              (archSelection && archSelection.count() > 0)
            );
            if (!hasSel) return;
            var step = e.shiftKey ? 10 : 1;
            var dx = 0, dy = 0;
            if (e.key === 'ArrowLeft') dx = -step;
            else if (e.key === 'ArrowRight') dx = step;
            else if (e.key === 'ArrowUp') dy = -step;
            else if (e.key === 'ArrowDown') dy = step;
            if (archDiagramNudgeSelection(dx, dy)) e.preventDefault();
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

    var containerAlignSeg = qs('#archContainerAlignSeg');
    if (containerAlignSeg && !containerAlignSeg.getAttribute('data-arch-container-align-ready')) {
      containerAlignSeg.setAttribute('data-arch-container-align-ready', '1');
      containerAlignSeg.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-arch-container-align]');
        if (!btn || btn.disabled) return;
        var mode = btn.getAttribute('data-arch-container-align');
        if (mode) archContainerAlignInside(mode);
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
    if (spectGrid && !spectGrid.getAttribute('data-arch-spectrum-grid-ready')) {
      spectGrid.setAttribute('data-arch-spectrum-grid-ready', '1');
      /* Placement and edit-mode guard live on each tile (archSpectrumIconsRenderFromData); clicks do not bubble here. */
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
        if (archLogoLibraryEditModeIsOn()) {
          if (e.target.closest && e.target.closest('.arch-architecture-logo-tile-actions')) return;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
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
        archArchitectureLogosApplyFilter(qs('#archAdobeLogoMenuMount'), qs('#archAdobeLogoStatus'), adobeLogoSearch.value);
      });
    }
    var logoSearch = qs('#archArchitectureLogoSearch');
    if (logoSearch && !logoSearch.getAttribute('data-arch-ready')) {
      logoSearch.setAttribute('data-arch-ready', '1');
      logoSearch.addEventListener('input', function () {
        archArchitectureLogosApplyFilter(qs('#archArchitectureLogoMenuMount'), qs('#archArchitectureLogoStatus'), logoSearch.value);
      });
    }

    archStateHighlightOverridesPersist();
    archProposalsBarInit();
    archAssistInstallOnce();
  }

  /* ============================================================
   *  Proposals — full-snapshot save/load via Firestore per sandbox
   *  ============================================================ */

  var ARCH_SNAPSHOT_KEYS = [
    'aepArchMasterLayout',
    'aepArchDragNodes',
    'aepArchLabelEdits',
    'aepArchUserLines',
    'aepArchSourcesDividers',
    'aepArchCustomBoxes',
    'aepArchStateHighlights',
    'aepArchStateHighlightOverrides',
    'aepArchTour',
    'aepArchCustomLogoLibrary',
    'aepArchCatalogLogoOverrides',
    'aepArchCatalogLogoHiddenFromPicker',
    'aepArchSpectrumWorkflowIconsHiddenFromPicker',
    'aepArchMenuGroupLabelOverrides',
    'aepArchHiddenFlows',
    'aepArchHiddenNodes',
    'aepArchFlowOverrides',
    'aepArchPlayDelayMs',
  ];
  var ARCH_PROPOSAL_LS_ACTIVE = 'aepArchActiveProposalId';
  /** Sandboxes allowed to overwrite the shared master baseline (server env may extend). */
  var ARCH_MASTER_OWNER_SANDBOXES = ['apalmer'];

  function archCanSaveMaster() {
    return ARCH_MASTER_OWNER_SANDBOXES.indexOf(archProposalsActiveSandbox()) >= 0;
  }

  function archSnapshotCollect() {
    var out = {};
    for (var i = 0; i < ARCH_SNAPSHOT_KEYS.length; i++) {
      var k = ARCH_SNAPSHOT_KEYS[i];
      var v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    }
    return {
      version: 2,
      keys: out,
      tour: PB ? PB.cloneTour(archGetTour()) : JSON.parse(JSON.stringify(archGetTour())),
    };
  }

  function archSnapshotRestore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    var version = Number(snapshot.version) || 1;
    var keys = snapshot.keys && typeof snapshot.keys === 'object' ? snapshot.keys : snapshot;
    for (var i = 0; i < ARCH_SNAPSHOT_KEYS.length; i++) {
      var k = ARCH_SNAPSHOT_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(keys, k)) {
        try { localStorage.setItem(k, String(keys[k])); } catch (e) {}
      } else {
        try { localStorage.removeItem(k); } catch (e) {}
      }
    }
    if (snapshot.tour && typeof snapshot.tour === 'object') {
      if (TE) {
        TE.applyStatesFromTour(snapshot.tour);
        TE.persist();
      }
    } else if (version < 2 && TE) {
      TE.highlightOverridesLoad();
    }
  }

  function archProposalsActiveSandbox() {
    try {
      if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSelected === 'function') {
        var s = (window.AepGlobalSandbox.getSelected() || '').trim();
        if (s) return s;
      }
      var ls = localStorage.getItem('aepGlobalSandboxName');
      return ls ? String(ls).trim() : '';
    } catch (e) { return ''; }
  }

  function archProposalsSetStatus(msg) {
    var el = qs('#archProposalsStatus');
    if (el) el.textContent = msg || '';
  }

  async function archProposalsApiList(sandbox) {
    var r = await fetch('/api/arch-proposals?sandbox=' + encodeURIComponent(sandbox));
    if (!r.ok) throw new Error('list failed: ' + r.status);
    return r.json();
  }
  async function archProposalsApiGet(sandbox, id) {
    var r = await fetch('/api/arch-proposals?sandbox=' + encodeURIComponent(sandbox) + '&id=' + encodeURIComponent(id));
    if (!r.ok) throw new Error('get failed: ' + r.status);
    return r.json();
  }
  async function archProposalsApiSave(sandbox, body) {
    var r = await fetch('/api/arch-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ sandbox: sandbox }, body)),
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || j.ok === false) throw new Error(j.error || ('save failed: ' + r.status));
    return j;
  }
  async function archProposalsApiDelete(sandbox, id) {
    var r = await fetch('/api/arch-proposals?sandbox=' + encodeURIComponent(sandbox) + '&id=' + encodeURIComponent(id), { method: 'DELETE' });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || j.ok === false) throw new Error(j.error || ('delete failed: ' + r.status));
    return j;
  }
  async function archMasterApiGet() {
    var r = await fetch('/api/arch-master');
    if (!r.ok) throw new Error('master get failed: ' + r.status);
    return r.json();
  }
  async function archMasterApiSave(sandbox, snapshot) {
    var r = await fetch('/api/arch-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sandbox: sandbox, snapshot: snapshot }),
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || j.ok === false) throw new Error(j.error || ('master save failed: ' + r.status));
    return j;
  }

  function archProposalsPopulateSelect(items, activeId) {
    var sel = qs('#archProposalsSelect');
    if (!sel) return;
    sel.textContent = '';
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— Base diagram —';
    sel.appendChild(opt0);
    (items || []).forEach(function (it) {
      var o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.name || '(untitled)';
      sel.appendChild(o);
    });
    if (activeId) sel.value = activeId;
  }

  async function archProposalsRefresh() {
    var sandbox = archProposalsActiveSandbox();
    if (!sandbox) {
      archProposalsSetStatus('Select a sandbox to load proposals.');
      archProposalsPopulateSelect([], '');
      return;
    }
    try {
      var data = await archProposalsApiList(sandbox);
      var active = localStorage.getItem(ARCH_PROPOSAL_LS_ACTIVE) || '';
      archProposalsPopulateSelect(data.items || [], active);
      archProposalsSetStatus('Sandbox: ' + sandbox + ' · ' + ((data.items || []).length) + ' saved');
    } catch (e) {
      archProposalsSetStatus('Could not list proposals: ' + e.message);
    }
  }

  async function archProposalsHandleLoad() {
    var sandbox = archProposalsActiveSandbox();
    var sel = qs('#archProposalsSelect');
    if (!sandbox || !sel) return;
    var id = sel.value;
    if (!id) {
      if (!window.confirm('Reset canvas to base diagram? All unsaved edits in this browser will be cleared.')) return;
      archSnapshotRestore({ keys: {} });
      try { localStorage.removeItem(ARCH_PROPOSAL_LS_ACTIVE); } catch (e) {}
      archProposalsSetStatus('Loaded base diagram. Reload the page to apply.');
      window.location.reload();
      return;
    }
    try {
      var data = await archProposalsApiGet(sandbox, id);
      if (!data.record || !data.record.snapshot) {
        archProposalsSetStatus('Proposal not found.');
        return;
      }
      archSnapshotRestore(data.record.snapshot);
      try { localStorage.setItem(ARCH_PROPOSAL_LS_ACTIVE, id); } catch (e) {}
      archProposalsSetStatus('Loaded "' + data.record.name + '". Reloading…');
      window.location.reload();
    } catch (e) {
      archProposalsSetStatus('Load failed: ' + e.message);
    }
  }

  async function archProposalsHandleSaveAs() {
    var sandbox = archProposalsActiveSandbox();
    if (!sandbox) { archProposalsSetStatus('Select a sandbox first.'); return; }
    var name = window.prompt('Name this proposal (e.g. customer name):', '');
    if (name == null) return;
    name = String(name).trim();
    if (!name) return;
    try {
      var snapshot = archSnapshotCollect();
      var res = await archProposalsApiSave(sandbox, { name: name, snapshot: snapshot });
      try { localStorage.setItem(ARCH_PROPOSAL_LS_ACTIVE, res.record.proposalId || res.record.id); } catch (e) {}
      archProposalsSetStatus('Saved "' + name + '".');
      await archProposalsRefresh();
      var sel = qs('#archProposalsSelect');
      if (sel) sel.value = res.record.proposalId || res.record.id;
    } catch (e) {
      archProposalsSetStatus('Save failed: ' + e.message);
    }
  }

  async function archProposalsHandleSave() {
    var sandbox = archProposalsActiveSandbox();
    var sel = qs('#archProposalsSelect');
    if (!sandbox || !sel) return;
    var id = sel.value;
    if (!id) { return archProposalsHandleSaveAs(); }
    var name = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
    try {
      var snapshot = archSnapshotCollect();
      await archProposalsApiSave(sandbox, { id: id, name: name, snapshot: snapshot });
      archProposalsSetStatus('Saved changes to "' + name + '".');
    } catch (e) {
      archProposalsSetStatus('Save failed: ' + e.message);
    }
  }

  async function archProposalsHandleRename() {
    var sandbox = archProposalsActiveSandbox();
    var sel = qs('#archProposalsSelect');
    if (!sandbox || !sel || !sel.value) return;
    var id = sel.value;
    var current = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
    var next = window.prompt('Rename proposal:', current);
    if (next == null) return;
    next = String(next).trim();
    if (!next || next === current) return;
    try {
      var data = await archProposalsApiGet(sandbox, id);
      if (!data.record || !data.record.snapshot) { archProposalsSetStatus('Not found.'); return; }
      await archProposalsApiSave(sandbox, { id: id, name: next, snapshot: data.record.snapshot });
      archProposalsSetStatus('Renamed.');
      await archProposalsRefresh();
    } catch (e) {
      archProposalsSetStatus('Rename failed: ' + e.message);
    }
  }

  async function archProposalsHandleDelete() {
    var sandbox = archProposalsActiveSandbox();
    var sel = qs('#archProposalsSelect');
    if (!sandbox || !sel || !sel.value) return;
    var id = sel.value;
    var name = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
    if (!window.confirm('Delete proposal "' + name + '"? This cannot be undone.')) return;
    try {
      await archProposalsApiDelete(sandbox, id);
      if (localStorage.getItem(ARCH_PROPOSAL_LS_ACTIVE) === id) {
        try { localStorage.removeItem(ARCH_PROPOSAL_LS_ACTIVE); } catch (e) {}
      }
      archProposalsSetStatus('Deleted.');
      await archProposalsRefresh();
    } catch (e) {
      archProposalsSetStatus('Delete failed: ' + e.message);
    }
  }

  async function archProposalsHandleSaveMaster() {
    var sandbox = archProposalsActiveSandbox();
    if (!archCanSaveMaster()) {
      archProposalsSetStatus('Only master-owner sandboxes can save master (' + ARCH_MASTER_OWNER_SANDBOXES.join(', ') + ').');
      return;
    }
    if (!window.confirm('Overwrite the shared base diagram for everyone with the current canvas?')) return;
    try {
      var snapshot = archSnapshotCollect();
      await archMasterApiSave(sandbox, snapshot);
      archProposalsSetStatus('Master saved.');
    } catch (e) {
      archProposalsSetStatus('Master save failed: ' + e.message);
    }
  }

  function archProposalsMasterBtnSyncVisibility() {
    var btn = qs('#archProposalsSaveMaster');
    if (!btn) return;
    btn.hidden = !archCanSaveMaster();
  }

  function archProposalsBarSyncVisibility() {
    var bar = qs('#archProposalsBar');
    var tgl = qs('#archEditModeToggle');
    if (!bar) return;
    bar.hidden = !(tgl && tgl.checked);
  }

  var ARCH_MASTER_APPLIED_TS_KEY = 'aepArchMasterAppliedTs';

  async function archProposalsMaybeApplyMaster() {
    try {
      if (localStorage.getItem(ARCH_PROPOSAL_LS_ACTIVE)) return;
      var alreadyApplied = localStorage.getItem(ARCH_MASTER_APPLIED_TS_KEY);
      var hasLocalEdits = false;
      for (var i = 0; i < ARCH_SNAPSHOT_KEYS.length; i++) {
        if (localStorage.getItem(ARCH_SNAPSHOT_KEYS[i]) != null) { hasLocalEdits = true; break; }
      }
      if (alreadyApplied && hasLocalEdits) return;
      var data = await archMasterApiGet();
      if (!data || !data.record || !data.record.snapshot) return;
      var ts = (data.record.updatedAt && data.record.updatedAt._seconds) || (data.record.updatedAt && data.record.updatedAt.seconds) || 0;
      if (alreadyApplied && Number(alreadyApplied) === Number(ts)) return;
      if (hasLocalEdits) return;
      archSnapshotRestore(data.record.snapshot);
      try { localStorage.setItem(ARCH_MASTER_APPLIED_TS_KEY, String(ts)); } catch (e) {}
      window.location.reload();
    } catch (e) {}
  }

  function archProposalsBarInit() {
    var bar = qs('#archProposalsBar');
    if (!bar || bar.getAttribute('data-arch-proposals-init') === '1') return;
    bar.setAttribute('data-arch-proposals-init', '1');

    var btnLoad = qs('#archProposalsLoad');
    var btnSave = qs('#archProposalsSave');
    var btnSaveAs = qs('#archProposalsSaveAs');
    var btnRename = qs('#archProposalsRename');
    var btnDelete = qs('#archProposalsDelete');
    var btnMaster = qs('#archProposalsSaveMaster');
    if (btnLoad) btnLoad.addEventListener('click', archProposalsHandleLoad);
    if (btnSave) btnSave.addEventListener('click', archProposalsHandleSave);
    if (btnSaveAs) btnSaveAs.addEventListener('click', archProposalsHandleSaveAs);
    if (btnRename) btnRename.addEventListener('click', archProposalsHandleRename);
    if (btnDelete) btnDelete.addEventListener('click', archProposalsHandleDelete);
    if (btnMaster) btnMaster.addEventListener('click', archProposalsHandleSaveMaster);

    var tgl = qs('#archEditModeToggle');
    if (tgl) tgl.addEventListener('change', archProposalsBarSyncVisibility);

    window.addEventListener('aep-global-sandbox-change', function () {
      archProposalsMasterBtnSyncVisibility();
      archProposalsRefresh();
    });

    archProposalsBarSyncVisibility();
    archProposalsMasterBtnSyncVisibility();
    archProposalsRefresh();
    archProposalsMaybeApplyMaster();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArchCanvasZoom);
  } else {
    initArchCanvasZoom();
  }
})();
