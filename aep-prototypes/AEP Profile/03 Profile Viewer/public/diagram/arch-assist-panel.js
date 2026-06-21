/**
 * Vertex AI assist panel for AEP & Apps architecture diagram (Edit mode).
 * Calls archDiagramAssist Cloud Function; validates and applies structured actions.
 */
(function (global) {
  'use strict';

  var LS_HISTORY = 'aepArchAssistHistory';

  function aepLabCloudFunctionsOrigin() {
    try {
      if (global.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__) {
        return String(global.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__).replace(/\/+$/, '');
      }
    } catch (_e) {}
    var pid = 'aep-orchestration-lab';
    try {
      if (global.firebaseDatabaseConfig && global.firebaseDatabaseConfig.projectId) {
        pid = String(global.firebaseDatabaseConfig.projectId).trim() || pid;
      }
    } catch (_e2) {}
    return 'https://us-central1-' + pid + '.cloudfunctions.net';
  }

  function assistUrl() {
    return aepLabCloudFunctionsOrigin() + '/archDiagramAssist';
  }

  /**
   * @param {object} deps
   * @returns {object}
   */
  function install(deps) {
    var qs = deps.qs;
    var getIdx = deps.getIdx;
    var getTour = deps.getTour;
    var getLayoutSummary = deps.getLayoutSummary;
    var applyState = deps.applyState;
    var tourEditor = deps.tourEditor;
    var playback = deps.playback;
    var addCustomBox = deps.addCustomBox;
    var addUserLine = deps.addUserLine;
    var undoMaybePush = deps.undoMaybePush;
    var saveProposalAs = deps.saveProposalAs;
    var isEditMode = deps.isEditMode;

    var chatEl = qs('#archAssistChat');
    var promptEl = qs('#archAssistPrompt');
    var sendBtn = qs('#archAssistSend');
    var applyBtn = qs('#archAssistApply');
    var saveBtn = qs('#archAssistSaveProposal');
    var clearBtn = qs('#archAssistClear');
    var statusEl = qs('#archAssistStatus');
    var previewEl = qs('#archAssistPreview');
    var longNoteEl = qs('#archAssistLongNote');

    /** @type {Array<{role:string,content:string}>} */
    var history = [];
    /** @type {object|null} */
    var pendingResult = null;

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('is-error', !!isError);
    }

    function loadHistory() {
      try {
        var raw = localStorage.getItem(LS_HISTORY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) history = parsed.slice(-20);
      } catch (e) {}
    }

    function persistHistory() {
      try {
        localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(-20)));
      } catch (e) {}
    }

    function appendChatBubble(role, text) {
      if (!chatEl) return;
      var row = document.createElement('div');
      row.className = 'arch-assist-msg arch-assist-msg--' + (role === 'assistant' ? 'assistant' : 'user');
      var label = document.createElement('span');
      label.className = 'arch-assist-msg-label';
      label.textContent = role === 'assistant' ? 'Vertex AI' : 'You';
      var body = document.createElement('div');
      body.className = 'arch-assist-msg-body';
      body.textContent = text;
      row.appendChild(label);
      row.appendChild(body);
      chatEl.appendChild(row);
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    function renderHistory() {
      if (!chatEl) return;
      chatEl.textContent = '';
      history.forEach(function (h) {
        appendChatBubble(h.role, h.content);
      });
    }

    function flowWithStroke(f) {
      var C = playback && playback.FLOW_COLORS ? playback.FLOW_COLORS : {
        ingress: '#308fff',
        intra: '#7d8a9e',
        egress: '#e34850',
      };
      var kind = f && f.kind ? f.kind : 'intra';
      return {
        id: f.id,
        kind: kind,
        stroke: C[kind] || C.intra,
      };
    }

    function normaliseStatePatch(patch) {
      if (!patch || typeof patch !== 'object') return patch;
      var out = Object.assign({}, patch);
      if (Array.isArray(out.flows)) {
        out.flows = out.flows.map(flowWithStroke);
      }
      if (playback && playback.normalizeState) {
        return playback.normalizeState(out);
      }
      return out;
    }

    function applyActions(actions) {
      if (!Array.isArray(actions) || !actions.length) return { applied: 0, errors: [] };
      var applied = 0;
      var errors = [];

      actions.forEach(function (action) {
        try {
          if (action.type === 'updateTourState' && tourEditor) {
            var idx = Number(action.stateIndex);
            var states = tourEditor.getStates();
            if (!states[idx]) {
              errors.push('State index ' + idx + ' out of range');
              return;
            }
            var cur = states[idx];
            var patch = normaliseStatePatch(action.patch || {});
            var merged = playback && playback.normalizeState
              ? playback.normalizeState(Object.assign({}, cur, patch))
              : Object.assign({}, cur, patch);
            states[idx] = merged;
            var tour = tourEditor.getTour();
            tour.states = states.slice();
            tourEditor.applyStatesFromTour(tour);
            tourEditor.persist();
            tourEditor.rebuildDots();
            tourEditor.editorSync();
            applied += 1;
            return;
          }

          if (action.type === 'replaceTour' && tourEditor) {
            var t = action.tour;
            if (playback && playback.normalizeTour) t = playback.normalizeTour(t);
            tourEditor.applyStatesFromTour(t);
            tourEditor.persist();
            tourEditor.rebuildDots();
            tourEditor.editorSync();
            applied += 1;
            return;
          }

          if (action.type === 'addCustomBox' && typeof addCustomBox === 'function') {
            addCustomBox(action.box || {});
            applied += 1;
            return;
          }

          if (action.type === 'addUserLine' && typeof addUserLine === 'function') {
            addUserLine(action.line || {});
            applied += 1;
            return;
          }

          errors.push('Unknown or unsupported action: ' + (action.type || '?'));
        } catch (e) {
          errors.push(String(e.message || e));
        }
      });

      if (applied > 0) {
        applyState();
        if (typeof undoMaybePush === 'function') undoMaybePush();
      }
      return { applied: applied, errors: errors };
    }

    function showPreview(result) {
      pendingResult = result;
      if (!previewEl) return;
      if (!result || !result.actions || !result.actions.length) {
        previewEl.hidden = true;
        previewEl.textContent = '';
        if (applyBtn) applyBtn.disabled = true;
        return;
      }
      previewEl.hidden = false;
      previewEl.textContent = JSON.stringify(result.actions, null, 2);
      if (applyBtn) applyBtn.disabled = false;
    }

    async function sendPrompt() {
      if (!promptEl || !sendBtn) return;
      if (!isEditMode()) {
        setStatus('Turn on Edit diagram to use the AI assistant.', true);
        return;
      }
      var prompt = String(promptEl.value || '').trim();
      if (!prompt) {
        setStatus('Enter a prompt first.', true);
        return;
      }

      sendBtn.disabled = true;
      if (applyBtn) applyBtn.disabled = true;
      if (longNoteEl) longNoteEl.hidden = false;
      setStatus('Vertex AI is thinking… (typically 20–90 seconds)');

      history.push({ role: 'user', content: prompt });
      appendChatBubble('user', prompt);
      persistHistory();
      promptEl.value = '';

      var payload = {
        prompt: prompt,
        currentStateIndex: getIdx(),
        tour: getTour(),
        layoutSummary: getLayoutSummary(),
        history: history.slice(0, -1),
      };

      try {
        var r = await fetch(assistUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var data = await r.json().catch(function () { return {}; });
        if (!r.ok || data.ok === false) {
          throw new Error(data.error || ('Request failed: ' + r.status));
        }
        var msg = data.assistantMessage || 'Updates ready.';
        history.push({ role: 'assistant', content: msg });
        appendChatBubble('assistant', msg);
        persistHistory();
        pendingResult = data;
        showPreview(data);
        var n = (data.actions && data.actions.length) || 0;
        setStatus(n ? ('Ready — ' + n + ' action(s). Review and click Apply.') : 'No structural actions; see assistant reply.');
      } catch (e) {
        setStatus(String(e.message || e), true);
        pendingResult = null;
        showPreview(null);
      } finally {
        sendBtn.disabled = false;
        if (longNoteEl) longNoteEl.hidden = true;
      }
    }

    function onApply() {
      if (!pendingResult || !pendingResult.actions || !pendingResult.actions.length) return;
      var res = applyActions(pendingResult.actions);
      pendingResult = null;
      showPreview(null);
      if (res.errors.length) {
        setStatus('Applied ' + res.applied + ' action(s). Issues: ' + res.errors.join('; '), res.applied === 0);
      } else {
        setStatus('Applied ' + res.applied + ' action(s) to the diagram.');
      }
    }

    function onClear() {
      history = [];
      pendingResult = null;
      try { localStorage.removeItem(LS_HISTORY); } catch (e) {}
      if (chatEl) chatEl.textContent = '';
      showPreview(null);
      setStatus('');
      if (promptEl) promptEl.value = '';
    }

    function init() {
      loadHistory();
      renderHistory();
      if (sendBtn && !sendBtn.getAttribute('data-arch-assist-init')) {
        sendBtn.setAttribute('data-arch-assist-init', '1');
        sendBtn.addEventListener('click', sendPrompt);
      }
      if (promptEl && !promptEl.getAttribute('data-arch-assist-init')) {
        promptEl.setAttribute('data-arch-assist-init', '1');
        promptEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            sendPrompt();
          }
        });
      }
      if (applyBtn && !applyBtn.getAttribute('data-arch-assist-init')) {
        applyBtn.setAttribute('data-arch-assist-init', '1');
        applyBtn.disabled = true;
        applyBtn.addEventListener('click', onApply);
      }
      if (saveBtn && !saveBtn.getAttribute('data-arch-assist-init')) {
        saveBtn.setAttribute('data-arch-assist-init', '1');
        saveBtn.addEventListener('click', function () {
          if (typeof saveProposalAs === 'function') saveProposalAs();
        });
      }
      if (clearBtn && !clearBtn.getAttribute('data-arch-assist-init')) {
        clearBtn.setAttribute('data-arch-assist-init', '1');
        clearBtn.addEventListener('click', onClear);
      }
    }

    return { init: init, applyActions: applyActions };
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.archAssist = { install: install };
})(typeof window !== 'undefined' ? window : this);
