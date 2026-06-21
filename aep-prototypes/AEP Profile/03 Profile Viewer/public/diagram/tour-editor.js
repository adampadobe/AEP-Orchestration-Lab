/**
 * Tour editor — deck-aligned state machine UI (copy, highlights, flows, user lines, play).
 * Loaded before aep-architecture-apps.js; wired via AEPDiagram.tourEditor.install(deps).
 */
(function (global) {
  'use strict';

  var ARCH_HIGHLIGHT_KEYS = [
    'tags', 'sources', 'edge', 'creative', 'aem', 'aep', 'streaming', 'batch',
    'query', 'intel', 'lake', 'pipeline', 'profile', 'identity', 'seg', 'decision',
    'jo', 'rtcdp', 'cja', 'mix', 'inbound', 'msg', 'paid', 'jrpt', 'mrpt',
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

  /**
   * @param {object} deps — hooks from aep-architecture-apps.js
   * @returns {object} tour editor public API
   */
  function install(deps) {
    var qs = deps.qs;
    var $all = deps.$all;
    var PB = deps.playback;
    var C = PB ? PB.FLOW_COLORS : { ingress: '#308fff', intra: '#7d8a9e', egress: '#e34850' };
    var getIdx = deps.getIdx;
    var setIdx = deps.setIdx;
    var applyState = deps.applyState;
    var getNodeLayout = deps.getNodeLayout;
    var getUserLines = deps.getUserLines;
    var getViewport = deps.getViewport;
    var syncPlaybackNav = deps.syncPlaybackNav;

    var STATES = PB ? PB.EMBEDDED_STATES.slice() : [];
    var archTour = PB ? PB.cloneTour(PB.EMBEDDED_TOUR) : { version: 1, states: STATES };
    var archDefaultTour = PB ? PB.cloneTour(PB.EMBEDDED_TOUR) : { version: 1, states: STATES.slice() };
    var LS_TOUR = 'aepArchTour';
    var LS_STATE_HILITE_OVERRIDES = 'aepArchStateHighlightOverrides';
    var LS_PLAY_DELAY = 'aepArchPlayDelayMs';
    var archTourEditorSyncing = false;
    var archPlayTimerId = null;
    var archTourReady = false;
    var archStateHighlightOverrides = {};
    var archHighlightPickerSyncing = false;
    var dotButtons = [];

    function archTourNormalize(raw) {
      if (PB && PB.normalizeTour) return PB.normalizeTour(raw);
      return raw && typeof raw === 'object' ? raw : { version: 1, states: STATES.slice() };
    }

    function archTourApplyStatesFromTour(tour) {
      archTour = archTourNormalize(tour);
      STATES = archTour.states.slice();
      var idx = getIdx();
      if (idx >= STATES.length) setIdx(Math.max(0, STATES.length - 1));
      archTourRebuildDots();
    }

    function archTourPersist() {
      try {
        localStorage.setItem(LS_TOUR, JSON.stringify(archTour));
      } catch (e) {}
    }

    function archTourLoadFromStorage() {
      try {
        var raw = localStorage.getItem(LS_TOUR);
        if (!raw) return false;
        archTourApplyStatesFromTour(JSON.parse(raw));
        return true;
      } catch (e2) {
        return false;
      }
    }

    function archTourInitFromDefault() {
      if (!PB) return Promise.resolve();
      return PB.loadDefaultTour(PB.DEFAULT_TOUR_URL).then(function (tour) {
        archDefaultTour = PB.cloneTour(tour);
        if (!archTourLoadFromStorage()) {
          archTourApplyStatesFromTour(archDefaultTour);
        }
        archTourReady = true;
      });
    }

    function archTourDefaultState(index) {
      if (archDefaultTour && archDefaultTour.states && archDefaultTour.states[index]) {
        return PB ? PB.normalizeState(archDefaultTour.states[index]) : archDefaultTour.states[index];
      }
      return STATES[index] ? (PB ? PB.normalizeState(STATES[index]) : STATES[index]) : null;
    }

    function archTourUpdateCurrentState(patch) {
      var idx = getIdx();
      if (!STATES[idx]) return;
      var st = PB
        ? PB.normalizeState(Object.assign({}, STATES[idx], patch || {}))
        : Object.assign({}, STATES[idx], patch || {});
      STATES[idx] = st;
      archTour.states[idx] = st;
      archTourPersist();
    }

    function goTo(i) {
      archPlayStop();
      if (i < 0 || i >= STATES.length) return;
      setIdx(i);
      applyState();
    }

    function archTourRebuildDots() {
      var dots = qs('#archIntDots');
      if (!dots) return;
      dots.textContent = '';
      dotButtons = [];
      for (var i = 0; i < STATES.length; i++) {
        (function (stateIndex) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'arch-int-dot';
          b.title = 'Go to slide ' + (stateIndex + 1);
          b.addEventListener('click', function () {
            goTo(stateIndex);
          });
          dots.appendChild(b);
          dotButtons.push(b);
        })(i);
      }
      if (syncPlaybackNav) syncPlaybackNav();
    }

    function archFlowPickerInit() {
      var host = qs('#archFlowPicker');
      if (!host || host.getAttribute('data-arch-built')) return;
      host.setAttribute('data-arch-built', '1');
      var ids = PB && PB.FLOW_IDS ? PB.FLOW_IDS : [];
      var labels = PB && PB.FLOW_LABELS ? PB.FLOW_LABELS : {};
      ids.forEach(function (fid) {
        var wrap = document.createElement('label');
        wrap.className = 'arch-flow-picker-item';
        var inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.setAttribute('data-flow-id', fid);
        inp.addEventListener('change', archFlowPickerOnChange);
        var span = document.createElement('span');
        span.textContent = labels[fid] || fid;
        wrap.appendChild(inp);
        wrap.appendChild(span);
        host.appendChild(wrap);
      });
    }

    function archFlowPickerSync() {
      var host = qs('#archFlowPicker');
      if (!host) return;
      var idx = getIdx();
      var st = STATES[idx];
      var active = {};
      if (st && st.flows) {
        st.flows.forEach(function (f) {
          active[f.id] = true;
        });
      }
      archTourEditorSyncing = true;
      host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        var fid = cb.getAttribute('data-flow-id');
        cb.checked = !!active[fid];
      });
      archTourEditorSyncing = false;
    }

    function archFlowPickerOnChange() {
      if (archTourEditorSyncing) return;
      var host = qs('#archFlowPicker');
      if (!host) return;
      var selectedIds = [];
      host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        if (cb.checked) selectedIds.push(cb.getAttribute('data-flow-id'));
      });
      var flows = selectedIds.map(function (fid) {
        var kind =
          fid.indexOf('inbound') >= 0 ||
          fid.indexOf('-msg') >= 0 ||
          fid.indexOf('-paid') >= 0 ||
          fid.indexOf('-jrpt') >= 0 ||
          fid.indexOf('-mrpt') >= 0
            ? 'egress'
            : fid.indexOf('sources') >= 0 || fid.indexOf('tags') >= 0
              ? 'ingress'
              : 'intra';
        return { id: fid, stroke: C[kind], kind: kind };
      });
      archTourUpdateCurrentState({ flows: flows });
      applyState();
    }

    function archUserLinePickerLabel(ln, index) {
      var stroke = ln.stroke || '#308fff';
      return 'Line ' + (index + 1) + ' · ' + stroke;
    }

    function archUserLinePickerInit() {
      var host = qs('#archUserLinePicker');
      if (!host) return;
      archUserLinePickerRefresh();
    }

    function archUserLinePickerRefresh() {
      var host = qs('#archUserLinePicker');
      if (!host) return;
      var lines = getUserLines ? getUserLines() : [];
      host.textContent = '';
      if (!lines.length) {
        var empty = document.createElement('p');
        empty.className = 'arch-highlight-picker-help';
        empty.textContent = 'No user-drawn lines yet. Use the Lines tool in Edit mode to add connectors.';
        host.appendChild(empty);
        return;
      }
      lines.forEach(function (ln, li) {
        if (!ln || !ln.id) return;
        var wrap = document.createElement('label');
        wrap.className = 'arch-flow-picker-item';
        var inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.setAttribute('data-user-line-id', ln.id);
        inp.addEventListener('change', archUserLinePickerOnChange);
        var span = document.createElement('span');
        span.textContent = archUserLinePickerLabel(ln, li);
        wrap.appendChild(inp);
        wrap.appendChild(span);
        host.appendChild(wrap);
      });
      archUserLinePickerSync();
    }

    function archUserLinePickerSync() {
      var host = qs('#archUserLinePicker');
      if (!host) return;
      var idx = getIdx();
      var st = STATES[idx];
      var active = {};
      if (st && Array.isArray(st.userLineIds)) {
        st.userLineIds.forEach(function (id) {
          active[id] = true;
        });
      }
      archTourEditorSyncing = true;
      host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        var lid = cb.getAttribute('data-user-line-id');
        cb.checked = !!active[lid];
      });
      archTourEditorSyncing = false;
    }

    function archUserLinePickerOnChange() {
      if (archTourEditorSyncing) return;
      var host = qs('#archUserLinePicker');
      if (!host) return;
      var selectedIds = [];
      host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        if (cb.checked) selectedIds.push(cb.getAttribute('data-user-line-id'));
      });
      archTourUpdateCurrentState({ userLineIds: selectedIds });
      applyState();
    }

    function archTourEditorSync() {
      var idx = getIdx();
      var numStr = String(idx + 1);
      $all('.arch-tour-state-num-ref').forEach(function (el) {
        el.textContent = numStr;
      });
      var st = STATES[idx];
      var labelInp = qs('#archTourStateLabel');
      var headInp = qs('#archTourStateHeadline');
      var bodyInp = qs('#archTourStateBody');
      archTourEditorSyncing = true;
      if (labelInp) labelInp.value = st && st.label ? st.label : '';
      if (headInp) headInp.value = st && st.headline ? st.headline : '';
      if (bodyInp) bodyInp.value = st && st.body ? st.body : '';
      archTourEditorSyncing = false;
      archHighlightPickerSync();
      archFlowPickerSync();
      archUserLinePickerSync();
      var countEl = qs('#archTourStateCount');
      if (countEl) countEl.textContent = String(STATES.length);
    }

    function archTourEditorOnFieldChange() {
      if (archTourEditorSyncing) return;
      var labelInp = qs('#archTourStateLabel');
      var headInp = qs('#archTourStateHeadline');
      var bodyInp = qs('#archTourStateBody');
      archTourUpdateCurrentState({
        label: labelInp ? labelInp.value : '',
        headline: headInp ? headInp.value : '',
        body: bodyInp ? bodyInp.value : '',
      });
      applyState();
    }

    function archTourDuplicateState() {
      var idx = getIdx();
      if (!STATES[idx]) return;
      var copy = PB ? PB.normalizeState(STATES[idx]) : JSON.parse(JSON.stringify(STATES[idx]));
      STATES.splice(idx + 1, 0, copy);
      archTour.states = STATES.slice();
      archTourPersist();
      archTourRebuildDots();
      goTo(idx + 1);
      archTourEditorSync();
    }

    function archTourDeleteState() {
      var idx = getIdx();
      if (STATES.length <= 1) return;
      if (!window.confirm('Delete slide ' + (idx + 1) + '?')) return;
      STATES.splice(idx, 1);
      archTour.states = STATES.slice();
      archTourPersist();
      if (idx >= STATES.length) setIdx(STATES.length - 1);
      archTourRebuildDots();
      applyState();
      archTourEditorSync();
    }

    function archTourAddState() {
      var idx = getIdx();
      var blank = PB
        ? PB.normalizeState({
            label: 'New slide',
            headline: 'Headline',
            body: 'Body copy for this step.',
            highlights: [],
            flows: [],
            userLineIds: [],
          })
        : {
            label: 'New slide',
            headline: 'Headline',
            body: 'Body copy for this step.',
            highlights: [],
            flows: [],
            userLineIds: [],
          };
      STATES.splice(idx + 1, 0, blank);
      archTour.states = STATES.slice();
      archTourPersist();
      archTourRebuildDots();
      goTo(idx + 1);
      archTourEditorSync();
    }

    function archTourMoveState(delta) {
      var idx = getIdx();
      var target = idx + delta;
      if (target < 0 || target >= STATES.length) return;
      var tmp = STATES[idx];
      STATES[idx] = STATES[target];
      STATES[target] = tmp;
      archTour.states = STATES.slice();
      archTourPersist();
      setIdx(target);
      archTourRebuildDots();
      applyState();
      archTourEditorSync();
    }

    function archTourResetAll() {
      if (!window.confirm('Reset the tour to the deck-aligned Adobe default (16 slides)?')) return;
      archTourApplyStatesFromTour(archDefaultTour);
      archStateHighlightOverrides = {};
      archStateHighlightOverridesPersist();
      try {
        localStorage.removeItem(LS_TOUR);
      } catch (e) {}
      setIdx(0);
      archTourRebuildDots();
      applyState();
      archTourEditorSync();
    }

    function archTourInitEditor() {
      archFlowPickerInit();
      archUserLinePickerInit();
      var labelInp = qs('#archTourStateLabel');
      var headInp = qs('#archTourStateHeadline');
      var bodyInp = qs('#archTourStateBody');
      if (labelInp) labelInp.addEventListener('input', archTourEditorOnFieldChange);
      if (headInp) headInp.addEventListener('input', archTourEditorOnFieldChange);
      if (bodyInp) bodyInp.addEventListener('input', archTourEditorOnFieldChange);
      var dupBtn = qs('#archTourDuplicateState');
      var delBtn = qs('#archTourDeleteState');
      var addBtn = qs('#archTourAddState');
      var upBtn = qs('#archTourMoveUp');
      var downBtn = qs('#archTourMoveDown');
      var resetBtn = qs('#archTourResetAll');
      if (dupBtn) dupBtn.addEventListener('click', archTourDuplicateState);
      if (delBtn) delBtn.addEventListener('click', archTourDeleteState);
      if (addBtn) addBtn.addEventListener('click', archTourAddState);
      if (upBtn) upBtn.addEventListener('click', function () { archTourMoveState(-1); });
      if (downBtn) downBtn.addEventListener('click', function () { archTourMoveState(1); });
      if (resetBtn) resetBtn.addEventListener('click', archTourResetAll);
      archTourEditorSync();
    }

    function archPlayGetDelayMs() {
      var inp = qs('#archPlayDelayMs');
      var val = inp ? parseInt(inp.value, 10) : 3200;
      if (!val || val < 500) val = 3200;
      return val;
    }

    function archPlayDelayLabelSync() {
      var lab = qs('#archPlayDelayLabel');
      if (lab) lab.textContent = String(archPlayGetDelayMs()) + ' ms';
    }

    function archPlayPrefersReducedMotion() {
      try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) {
        return false;
      }
    }

    function archPlaySetPlayingUi(playing) {
      var vp = getViewport ? getViewport() : null;
      if (vp) vp.classList.toggle('arch-int-viewport--playing', !!playing);
      var playBtn = qs('#archPlayBtn');
      if (playBtn) {
        playBtn.textContent = playing ? 'Stop' : 'Play';
        playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
        playBtn.disabled = false;
      }
    }

    function archPlayStop() {
      if (archPlayTimerId) {
        clearTimeout(archPlayTimerId);
        archPlayTimerId = null;
      }
      archPlaySetPlayingUi(false);
    }

    function archPlayStep() {
      var idx = getIdx();
      if (idx >= STATES.length - 1) {
        archPlayStop();
        return;
      }
      setIdx(idx + 1);
      applyState();
      archPlayTimerId = setTimeout(archPlayStep, archPlayGetDelayMs());
    }

    function archPlayStart() {
      archPlayStop();
      if (archPlayPrefersReducedMotion()) {
        setIdx(STATES.length - 1);
        applyState();
        return;
      }
      archPlaySetPlayingUi(true);
      var idx = getIdx();
      if (idx >= STATES.length - 1) setIdx(0);
      applyState();
      archPlayTimerId = setTimeout(archPlayStep, archPlayGetDelayMs());
    }

    function archPlayToggle() {
      if (archPlayTimerId) archPlayStop();
      else archPlayStart();
    }

    function archPlayInitControls() {
      var playBtn = qs('#archPlayBtn');
      var delayInp = qs('#archPlayDelayMs');
      if (playBtn) playBtn.addEventListener('click', archPlayToggle);
      if (delayInp) {
        try {
          var saved = localStorage.getItem(LS_PLAY_DELAY);
          if (saved) delayInp.value = saved;
        } catch (e) {}
        delayInp.addEventListener('input', function () {
          archPlayDelayLabelSync();
          try {
            localStorage.setItem(LS_PLAY_DELAY, delayInp.value);
          } catch (e2) {}
        });
        archPlayDelayLabelSync();
      }
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

    function archHighlightsForState(stateIndex) {
      var o = archStateHighlightOverrides[stateIndex];
      if (o === undefined) o = archStateHighlightOverrides[String(stateIndex)];
      if (Array.isArray(o)) return o.slice();
      var st = STATES[stateIndex];
      return st && st.highlights ? st.highlights.slice() : [];
    }

    function archResolvedState(stateIndex) {
      var st = STATES[stateIndex];
      if (!st) return null;
      return Object.assign({}, st, { highlights: archHighlightsForState(stateIndex) });
    }

    function archHighlightPickerInit() {
      var host = qs('#archHighlightPicker');
      if (!host || host.getAttribute('data-arch-built')) return;
      host.setAttribute('data-arch-built', '1');
      var NODE_LAYOUT = getNodeLayout ? getNodeLayout() : {};
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
      var hilites = archHighlightsForState(getIdx());
      archHighlightPickerSyncing = true;
      host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        var nid = cb.getAttribute('data-node-id');
        cb.checked = hilites.indexOf(nid) >= 0;
      });
      archHighlightPickerSyncing = false;
    }

    function archHighlightPickerOnChange() {
      archHighlightPickerApplyFromDom();
    }

    function archHighlightPickerApplyFromDom() {
      if (archHighlightPickerSyncing) return;
      var host = qs('#archHighlightPicker');
      if (!host) return;
      var idx = getIdx();
      var selected = [];
      host.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        if (cb.checked) selected.push(cb.getAttribute('data-node-id'));
      });
      var def = archTourDefaultState(idx);
      var defH = def && def.highlights ? def.highlights : [];
      if (archHighlightArraysEqual(selected, defH)) {
        delete archStateHighlightOverrides[idx];
        delete archStateHighlightOverrides[String(idx)];
        archTourUpdateCurrentState({ highlights: defH.slice() });
      } else {
        archStateHighlightOverrides[String(idx)] = selected;
        archTourUpdateCurrentState({ highlights: selected.slice() });
      }
      archStateHighlightOverridesPersist();
      applyState();
    }

    function archHighlightResetCurrentState() {
      var idx = getIdx();
      var def = archTourDefaultState(idx);
      delete archStateHighlightOverrides[idx];
      delete archStateHighlightOverrides[String(idx)];
      if (def) {
        archTourUpdateCurrentState({
          label: def.label || '',
          headline: def.headline || '',
          body: def.body || '',
          highlights: def.highlights ? def.highlights.slice() : [],
          flows: def.flows ? def.flows.slice() : [],
          userLineIds: def.userLineIds ? def.userLineIds.slice() : [],
        });
      }
      archStateHighlightOverridesPersist();
      applyState();
    }

    return {
      getStates: function () { return STATES; },
      getTour: function () { return archTour; },
      getDefaultTour: function () { return archDefaultTour; },
      getHighlightOverrides: function () { return archStateHighlightOverrides; },
      setHighlightOverrides: function (o) {
        archStateHighlightOverrides = o && typeof o === 'object' ? o : {};
      },
      getDotButtons: function () { return dotButtons; },
      isReady: function () { return archTourReady; },
      initFromDefault: archTourInitFromDefault,
      initEditor: archTourInitEditor,
      rebuildDots: archTourRebuildDots,
      editorSync: archTourEditorSync,
      persist: archTourPersist,
      applyStatesFromTour: archTourApplyStatesFromTour,
      playStop: archPlayStop,
      playInitControls: archPlayInitControls,
      goTo: goTo,
      highlightPickerInit: archHighlightPickerInit,
      highlightPickerSync: archHighlightPickerSync,
      highlightsForState: archHighlightsForState,
      resolvedState: archResolvedState,
      defaultState: archTourDefaultState,
      highlightResetCurrentState: archHighlightResetCurrentState,
      highlightOverridesLoad: archStateHighlightOverridesLoad,
      highlightOverridesPersist: archStateHighlightOverridesPersist,
      highlightPickerApplyFromDom: archHighlightPickerApplyFromDom,
      userLinePickerRefresh: archUserLinePickerRefresh,
      updateCurrentState: archTourUpdateCurrentState,
    };
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.tourEditor = { install: install, ARCH_NODE_LABELS: ARCH_NODE_LABELS };
})(typeof window !== 'undefined' ? window : this);
