/**
 * Demo flows — sequence demo-library assets into a story with talk tracks, and present them.
 */
(function () {
  'use strict';

  var API = '/api/demo-assets';
  var MAX_STEPS = 30;
  var state = {
    user: null, flows: [], assets: [], assetById: {}, types: [],
    current: null, steps: [], dirty: false, pendingAdd: null,
    present: null, versions: {}, versionsLoading: new Set(), suggestion: null, undoSuggestion: null, saving: false,
    notesWindow: null, checkedFlowId: null,
  };
  var els = {};

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(label, cls, onClick, title) {
    var b = el('button', cls || 'dashboard-btn-outline', label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', onClick);
    return b;
  }

  // /api/* Hosting rewrites cap at 60s; Gemini suggestions can take longer, so suggest calls the function directly.
  function cloudFunctionsOrigin() {
    try {
      if (window.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__) return String(window.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__).replace(/\/+$/, '');
    } catch (_e) {}
    var pid = 'aep-orchestration-lab';
    try {
      if (window.firebaseDatabaseConfig && window.firebaseDatabaseConfig.projectId) pid = String(window.firebaseDatabaseConfig.projectId).trim() || pid;
    } catch (_e2) {}
    return 'https://us-central1-' + pid + '.cloudfunctions.net';
  }

  async function request(url, opts) {
    opts = opts || {};
    var token = await state.user.getIdToken();
    var headers = { Authorization: 'Bearer ' + token };
    var init = { method: opts.method || 'GET', headers: headers };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    var res = await fetch(url, init);
    var data = null;
    try { data = await res.json(); } catch (_e) { data = null; }
    if (!res.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    }
    return data;
  }

  function setStatus(node, msg, isError) {
    node.textContent = msg || '';
    node.className = 'status' + (isError ? ' error' : '');
  }

  function fmtMinutes(m) {
    var n = Number(m) || 0;
    return (Math.round(n * 2) / 2) + ' min';
  }

  function markDirty() {
    state.dirty = true;
    renderTotals();
  }

  // ---- Data loading ----

  async function loadAll() {
    setStatus(els.listStatus, 'Loading…');
    try {
      var results = await Promise.all([loadPaged(API, 'assets'), loadPaged(API + '/flows', 'flows')]);
      state.assets = results[0].assets || [];
      state.types = results[0].conversationTypes || [];
      state.assetById = {};
      state.assets.forEach(function (a) { state.assetById[a.id] = a; });
      state.flows = results[1].flows || [];
      fillTypes();
      renderFlowList();
      renderAssetResults();
      setStatus(els.listStatus, state.flows.length ? '' : 'No flows yet.');
      handleDeepLinks();
    } catch (e) {
      setStatus(els.listStatus, e.message, true);
    }

    async function loadPaged(url, key) {
      var all = [], cursor = null, result;
      do {
        result = await request(url + '?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        all = all.concat(result[key] || []);
        cursor = result.nextCursor || null;
      } while (cursor);
      result[key] = all;
      return result;
    }
  }

  function fillTypes() {
    var sel = els.type;
    while (sel.options.length > 1) sel.remove(1);
    state.types.forEach(function (t) {
      var o = el('option', null, t);
      o.value = t;
      sel.appendChild(o);
    });
  }

  function handleDeepLinks() {
    var params = new URLSearchParams(location.search);
    var flowId = params.get('flow');
    var add = params.get('assets') || params.get('add');
    if (flowId) {
      openFlow(flowId);
    } else if (add) {
      var ids = add.split(',').filter(Boolean);
      var asset = state.assetById[ids[0]];
      newFlow(asset ? { customer: asset.customer, conversationType: asset.conversationType } : null);
      ids.forEach(function (id) { if (state.assetById[id]) addStep(state.assetById[id]); });
      setStatus(els.flowStatus, state.steps.length ? 'Added selected assets to a new flow. Set your audience and goal with Suggest with Gemini.' : 'The selected assets were not found in the library.', !state.steps.length);
    }
  }

  // ---- Flow list ----

  function renderFlowList() {
    var q = els.search.value.trim().toLowerCase();
    els.list.textContent = '';
    state.flows
      .filter(function (f) { return !q || (f.title + ' ' + f.customer).toLowerCase().indexOf(q) !== -1; })
      .forEach(function (f) {
        var li = el('li', 'demo-flows-item' + (state.current && state.current.id === f.id ? ' is-active' : ''));
        var b = el('button', 'demo-flows-item-btn');
        b.type = 'button';
        b.appendChild(el('strong', null, f.title || 'Untitled'));
        var meta = [f.customer, f.conversationType, f.stepCount + ' steps', fmtMinutes(f.totalMinutes)].filter(Boolean).join(' · ');
        b.appendChild(el('span', 'hint', meta));
        b.addEventListener('click', function () { selectFlow(f.id); });
        li.appendChild(b);
        els.list.appendChild(li);
      });
  }

  function confirmDiscard() {
    return !state.dirty || window.confirm('Discard unsaved changes to this flow?');
  }

  async function selectFlow(id) {
    if (!confirmDiscard()) return;
    if (state.pendingAdd) return addPendingToFlow(id);
    openFlow(id);
  }

  async function openFlow(id) {
    setStatus(els.flowStatus, 'Loading flow…');
    try {
      var data = await request(API + '/flows/' + encodeURIComponent(id));
      loadIntoEditor(data.flow);
      setStatus(els.flowStatus, '');
    } catch (e) {
      setStatus(els.flowStatus, e.message, true);
    }
  }

  async function addPendingToFlow(id) {
    var assetId = state.pendingAdd;
    state.pendingAdd = null;
    await openFlow(id);
    var asset = state.assetById[assetId];
    if (asset) addStep(asset);
  }

  function newFlow(seed) {
    if (!confirmDiscard()) return;
    loadIntoEditor({ id: null, title: '', customer: (seed && seed.customer) || '', conversationType: (seed && seed.conversationType) || '', description: '', steps: [] });
    els.form.elements.title.focus();
  }

  function loadIntoEditor(flow) {
    state.undoSuggestion = null;
    $('flowUndoSuggestion').hidden = true;
    state.current = flow;
    state.steps = (flow.steps || []).map(function (s) {
      return { assetId: s.assetId, versionId: s.versionId || null, currentVersionAtSave: s.currentVersionAtSave || null, title: s.title || '', talkTrack: s.talkTrack || '', transition: s.transition || '', durationMin: s.durationMin || 0 };
    });
    var f = els.form.elements;
    f.title.value = flow.title || '';
    f.customer.value = flow.customer || '';
    f.conversationType.value = flow.conversationType || '';
    f.description.value = flow.description || '';
    els.empty.hidden = true;
    els.form.hidden = false;
    els.del.hidden = !flow.id;
    els.present.hidden = !flow.id;
    $('flowCheck').hidden = !flow.id;
    state.dirty = false;
    renderSteps();
    renderFlowList();
    var url = new URL(location.href);
    url.searchParams.delete('add');
    url.searchParams.delete('assets');
    if (flow.id) url.searchParams.set('flow', flow.id); else url.searchParams.delete('flow');
    history.replaceState(null, '', url);
  }

  // ---- Steps ----

  function renderTotals() {
    var total = state.steps.reduce(function (t, s) { return t + (Number(s.durationMin) || 0); }, 0);
    els.totals.textContent = state.steps.length + ' · ' + fmtMinutes(total);
  }

  function moveStep(i, delta) {
    var j = i + delta;
    if (j < 0 || j >= state.steps.length) return;
    var tmp = state.steps[i];
    state.steps[i] = state.steps[j];
    state.steps[j] = tmp;
    markDirty();
    renderSteps();
    var target = els.steps.children[j];
    var btn = target && target.querySelector(delta < 0 ? '[data-move="up"]' : '[data-move="down"]');
    if (btn && !btn.disabled) btn.focus();
  }

  function renderSteps() {
    els.steps.textContent = '';
    if (!state.steps.length) {
      els.steps.appendChild(el('li', 'demo-flows-steps-empty hint', 'No steps yet — search the library below to add assets.'));
    }
    state.steps.forEach(function (s, i) {
      var asset = state.assetById[s.assetId];
      var li = el('li', 'demo-flows-step' + (asset ? '' : ' is-missing'));
      var head = el('div', 'demo-flows-step-head');
      head.appendChild(el('span', 'demo-flows-step-num', String(i + 1)));
      var info = el('div', 'demo-flows-step-info');
      info.appendChild(el('strong', null, asset ? asset.title : 'Missing asset'));
      info.appendChild(el('span', 'hint', asset ? [asset.customer, asset.conversationType].filter(Boolean).join(' · ') : 'Deleted from the library — remove this step.'));
      head.appendChild(info);
      var up = button('↑', 'dashboard-btn-outline', function () { moveStep(i, -1); }, 'Move step up');
      up.dataset.move = 'up';
      up.disabled = i === 0;
      var down = button('↓', 'dashboard-btn-outline', function () { moveStep(i, 1); }, 'Move step down');
      down.dataset.move = 'down';
      down.disabled = i === state.steps.length - 1;
      head.appendChild(up);
      head.appendChild(down);
      head.appendChild(button('Remove', 'dashboard-btn-outline', function () {
        state.steps.splice(i, 1);
        markDirty();
        renderSteps();
      }, 'Remove step ' + (i + 1)));
      li.appendChild(head);

      var fields = el('div', 'demo-flows-step-fields');
      var titleLabel = el('label', null, 'Step title');
      var titleInput = el('input');
      titleInput.maxLength = 200;
      titleInput.value = s.title;
      titleInput.placeholder = asset ? asset.title : '';
      titleInput.addEventListener('input', function () { s.title = titleInput.value; markDirty(); });
      titleLabel.appendChild(titleInput);
      var durLabel = el('label', null, 'Minutes');
      var dur = el('input');
      dur.type = 'number';
      dur.min = '0';
      dur.max = '120';
      dur.step = '0.5';
      dur.value = s.durationMin || 0;
      dur.addEventListener('input', function () { s.durationMin = Number(dur.value) || 0; markDirty(); });
      durLabel.appendChild(dur);
      var talkLabel = el('label', 'demo-flows-wide', 'Talk track');
      var talk = el('textarea');
      talk.rows = 3;
      talk.maxLength = 4000;
      talk.value = s.talkTrack;
      talk.placeholder = 'What to say and what to click on this step';
      talk.addEventListener('input', function () { s.talkTrack = talk.value; markDirty(); });
      talkLabel.appendChild(talk);
      fields.appendChild(titleLabel);
      fields.appendChild(durLabel);
      var versionLabel = el('label', 'demo-flows-wide', 'Demo version');
      var versionSelect = el('select');
      var latest = el('option', null, 'Follow latest version');
      latest.value = '';
      versionSelect.appendChild(latest);
      var versions = state.versions[s.assetId] || [];
      versions.forEach(function (v) {
        var option = el('option', null, (v.current ? 'Current · ' : 'Archived · ') + (v.note || v.originalFilename || v.id.slice(0, 8)) +
          (v.createdAt ? ' · ' + new Date(v.createdAt).toLocaleDateString() : ''));
        option.value = v.id;
        versionSelect.appendChild(option);
      });
      if (s.versionId && !versions.some(function (v) { return v.id === s.versionId; })) {
        var pinned = el('option', null, 'Pinned version · ' + s.versionId.slice(0, 8));
        pinned.value = s.versionId;
        versionSelect.appendChild(pinned);
      }
      versionSelect.value = s.versionId || '';
      versionSelect.setAttribute('aria-label', 'Version for step ' + (i + 1));
      versionSelect.addEventListener('change', function () { s.versionId = versionSelect.value || null; markDirty(); });
      versionLabel.appendChild(versionSelect);
      fields.appendChild(versionLabel);
      if (asset && !state.versions[s.assetId] && !state.versionsLoading.has(s.assetId)) {
        fields.appendChild(button('Load version choices', null, function () { loadStepVersions(s.assetId); }));
      }
      fields.appendChild(talkLabel);
      li.appendChild(fields);
      els.steps.appendChild(li);
    });
    renderTotals();
    renderAssetResults();
  }

  async function loadStepVersions(assetId) {
    if (state.versionsLoading.has(assetId)) return;
    state.versionsLoading.add(assetId);
    setStatus(els.flowStatus, 'Loading version choices…');
    try {
      var data = await loadPaged(API + '/' + encodeURIComponent(assetId) + '/versions', 'versions');
      state.versions[assetId] = data.versions || [];
      renderSteps();
      setStatus(els.flowStatus, '');
    } catch (e) { setStatus(els.flowStatus, e.message, true); }
    finally { state.versionsLoading.delete(assetId); }
  }

  function addStep(asset) {
    if (state.steps.length >= MAX_STEPS) {
      setStatus(els.flowStatus, 'A flow can have at most ' + MAX_STEPS + ' steps.', true);
      return;
    }
    state.steps.push({ assetId: asset.id, versionId: null, currentVersionAtSave: asset.currentVersionId, title: '', talkTrack: '', durationMin: 5 });
    markDirty();
    renderSteps();
  }

  function renderAssetResults() {
    var q = els.assetSearch.value.trim().toLowerCase();
    els.assetResults.textContent = '';
    var inFlow = {};
    state.steps.forEach(function (s) { inFlow[s.assetId] = true; });
    var matches = state.assets.filter(function (a) {
      return !q || [a.title, a.customer, a.conversationType, a.event, a.industry].join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, q ? 25 : 8);
    if (!matches.length) els.assetResults.appendChild(el('li', 'hint', q ? 'No matching assets.' : 'The library is empty.'));
    matches.forEach(function (a) {
      var li = el('li', 'demo-flows-asset');
      var info = el('div', 'demo-flows-step-info');
      info.appendChild(el('strong', null, a.title));
      info.appendChild(el('span', 'hint', [a.customer, a.conversationType, a.event].filter(Boolean).join(' · ')));
      li.appendChild(info);
      var add = button(inFlow[a.id] ? 'Add again' : 'Add', inFlow[a.id] ? 'dashboard-btn-outline' : 'dashboard-btn-primary', function () { addStep(a); }, 'Add ' + a.title + ' to the flow');
      li.appendChild(add);
      els.assetResults.appendChild(li);
    });
  }

  // ---- Save / delete ----

  function formPayload() {
    var f = els.form.elements;
    return {
      title: f.title.value.trim(),
      customer: f.customer.value.trim(),
      conversationType: f.conversationType.value,
      description: f.description.value.trim(),
      steps: state.steps.map(function (s) {
        return { assetId: s.assetId, versionId: s.versionId, currentVersionAtSave: s.currentVersionAtSave || null,
          title: s.title.trim(), talkTrack: s.talkTrack.trim(), transition: s.transition || '', durationMin: Number(s.durationMin) || 0 };
      }),
    };
  }

  async function saveFlow(ev) {
    ev.preventDefault();
    if (state.saving) return;
    var body = formPayload();
    if (!body.title) { setStatus(els.flowStatus, 'Give the flow a title.', true); return; }
    setStatus(els.flowStatus, 'Saving…');
    state.saving = true;
    $('flowSave').disabled = true;
    try {
      var id = state.current && state.current.id;
      var data = id
        ? await request(API + '/flows/' + encodeURIComponent(id), { method: 'PATCH', body: body })
        : await request(API + '/flows', { method: 'POST', body: body });
      var index = state.flows.findIndex(function (f) { return f.id === data.flow.id; });
      if (index >= 0) state.flows[index] = data.flow; else state.flows.unshift(data.flow);
      loadIntoEditor(data.flow);
      setStatus(els.flowStatus, 'Saved.');
    } catch (e) {
      setStatus(els.flowStatus, e.message, true);
    } finally { state.saving = false; $('flowSave').disabled = false; }
  }

  async function deleteFlow() {
    if (state.saving) return;
    var flow = state.current;
    if (!flow || !flow.id || !window.confirm('Delete “' + (flow.title || 'this flow') + '”? The library assets are not affected.')) return;
    els.del.disabled = true;
    try {
      await request(API + '/flows/' + encodeURIComponent(flow.id), { method: 'DELETE' });
      state.flows = state.flows.filter(function (f) { return f.id !== flow.id; });
      state.current = null;
      state.dirty = false;
      els.form.hidden = true;
      els.empty.hidden = false;
      renderFlowList();
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      setStatus(els.flowStatus, e.message, true);
    } finally { els.del.disabled = false; }
  }

  // ---- Gemini suggest ----

  function openSuggest() {
    var f = els.suggestForm.elements;
    if (!f.customer.value) f.customer.value = els.form.elements.customer.value;
    setStatus(els.suggestError, '');
    els.suggestRationale.textContent = state.steps.length
      ? 'Gemini will reorder the ' + state.steps.length + ' current step(s).'
      : 'Add assets from the library first. Gemini only reviews assets you choose.';
    els.suggestDialog.showModal();
  }

  async function runSuggest(ev) {
    ev.preventDefault();
    if (els.suggestRun.disabled) return;
    var f = els.suggestForm.elements;
    var ids = state.steps.map(function (s) { return s.assetId; }).filter(function (id, i, arr) { return arr.indexOf(id) === i; });
    if (!ids.length) { setStatus(els.suggestError, 'Add assets to this flow before asking Gemini.', true); return; }
    if (ids.length > 12) { setStatus(els.suggestError, 'Choose at most 12 assets for one AI review. Your flow has not changed.', true); return; }
    var before = formPayload();
    var wasDirty = state.dirty;
    els.suggestRun.disabled = true;
    setStatus(els.suggestError, 'Asking Gemini…');
    try {
      var data = await request(cloudFunctionsOrigin() + '/demoAssetsApi/flows/suggest', {
        method: 'POST',
        body: { assetIds: ids, steps: before.steps, goal: f.goal.value.trim(), customer: f.customer.value.trim(), minutes: Number(f.minutes.value) || 30, model: f.model.value || undefined },
      });
      var s = data.suggestion;
      if (!s || !Array.isArray(s.steps) || !s.steps.length) throw new Error('Gemini did not return a usable flow. Your steps are unchanged.');
      state.suggestion = { result: s, before: before, dirty: wasDirty };
      els.suggestDialog.close();
      $('flowSuggestionRationale').textContent = (s.rationale || 'Review the suggested sequence and talk tracks before using it.') +
        ((s.reviewNotes || []).length ? '\nReview notes: ' + s.reviewNotes.join(' ') : '');
      var list = $('flowSuggestionSteps');
      list.textContent = '';
      s.steps.forEach(function (step) {
        var li = el('li');
        li.appendChild(el('strong', null, step.title || (state.assetById[step.assetId] || {}).title || step.assetId));
        li.appendChild(el('p', null, step.talkTrack || 'No talk track suggested.'));
        if (step.transition) li.appendChild(el('p', 'hint', 'Transition: ' + step.transition));
        li.appendChild(el('p', 'hint', fmtMinutes(step.durationMin) + (step.versionId ? ' · Pinned version' : ' · Follows latest')));
        list.appendChild(li);
      });
      $('flowSuggestionOmitted').textContent = (s.omitted || []).length ? 'Left out: ' +
        s.omitted.map(function (id) { return (state.assetById[id] || {}).title || id; }).join(', ') : 'All selected assets are included.';
      $('flowSuggestionReview').showModal();
    } catch (e) {
      setStatus(els.suggestError, e.message, true);
    } finally {
      els.suggestRun.disabled = false;
    }
  }

  function acceptSuggestion() {
      if (!state.suggestion) return;
      var pending = state.suggestion;
      var now = formPayload();
      if (JSON.stringify(now) !== JSON.stringify(pending.before)) {
        setStatus(els.flowStatus, 'Your flow changed while Gemini was working. Ask for a fresh suggestion; nothing was replaced.', true);
        $('flowSuggestionReview').close();
        state.suggestion = null;
        return;
      }
      state.undoSuggestion = { payload: pending.before, dirty: pending.dirty };
      var s = pending.result;
      var ff = els.form.elements;
      if (!ff.title.value.trim()) ff.title.value = s.title || '';
      if (!ff.description.value.trim()) ff.description.value = s.description || '';
      if (!ff.customer.value.trim()) ff.customer.value = s.customer || '';
      state.steps = s.steps.map(function (step) {
        var old = pending.before.steps.find(function (o) { return o.assetId === step.assetId; });
        return { assetId: step.assetId, versionId: old ? old.versionId : step.versionId || null,
          currentVersionAtSave: old ? old.currentVersionAtSave : null,
          title: step.title || '', talkTrack: step.talkTrack || '', transition: step.transition || '', durationMin: step.durationMin || 0 };
      });
      markDirty();
      renderSteps();
      $('flowUndoSuggestion').hidden = false;
      $('flowSuggestionReview').close();
      state.suggestion = null;
      setStatus(els.flowStatus, 'Suggested steps added. Version pins kept. Save when ready, or Undo suggestion.');
    }

  function undoSuggestion() {
      if (!state.undoSuggestion) return;
      if (!window.confirm('Undo the suggestion and any subsequent edits? Your saved flow is unaffected.')) return;
      var undo = state.undoSuggestion;
      loadIntoEditor(Object.assign({}, undo.payload, { id: state.current.id }));
      state.dirty = undo.dirty;
      setStatus(els.flowStatus, 'Your previous flow is restored in the editor.');
    }

  // ---- Presenter ----

  async function startPresenting() {
    var flow = state.current;
    if (!flow || !flow.id) return;
    if (state.dirty && !window.confirm('Present the last saved version? Unsaved changes are not included.')) return;
    await checkFlow(true);
  }

  async function checkFlow(forPresentation) {
    if (!state.current || !state.current.id) return;
    state.checkedFlowId = state.current.id;
    $('flowCheckContinue').hidden = true;
    $('flowCheckIssues').textContent = '';
    $('flowCheckDialog').showModal();
    setStatus($('flowCheckStatus'), 'Checking saved assets and versions…');
    try {
      var data = await request(API + '/flows/' + encodeURIComponent(state.current.id) + '/check');
      var check = data.check;
      (check.issues || []).forEach(function (issue) {
        $('flowCheckIssues').appendChild(el('li', null, (issue.severity === 'error' ? 'Fix: ' : 'Review: ') +
          (Number.isInteger(issue.stepIndex) ? 'Step ' + (issue.stepIndex + 1) + ' — ' : '') + issue.message));
      });
      setStatus($('flowCheckStatus'), check.ready ? 'The saved flow can be presented.' : 'Resolve the issues below before presenting.', !check.ready);
      $('flowCheckContinue').hidden = !check.ready || !forPresentation;
    } catch (e) { setStatus($('flowCheckStatus'), e.message, true); }
  }

  async function presentCheckedFlow() {
    var flow = state.current;
    if (!flow || flow.id !== state.checkedFlowId) return;
    $('flowCheckContinue').disabled = true;
    setStatus(els.flowStatus, 'Preparing presentation…');
    try {
      var data = await request(API + '/flows/' + encodeURIComponent(flow.id) + '/present', { method: 'POST', body: {} });
      if (!data.flow.steps.length) { setStatus(els.flowStatus, 'Add at least one step first.', true); return; }
      if (data.flow.steps.some(function (step) { return step.missing; })) {
        throw new Error('An asset or version became unavailable after the check. Return to the editor and check again.');
      }
      setStatus(els.flowStatus, '');
      state.present = { flow: data.flow, index: 0, started: Date.now(), stepStarted: Date.now(), timer: null, opener: document.activeElement };
      $('flowCheckDialog').close();
      els.presenter.hidden = false;
      document.body.classList.add('demo-flows-presenting');
      $('presenterTitle').textContent = data.flow.title;
      renderOutline();
      showStep(0);
      state.present.timer = setInterval(tick, 1000);
      els.next.focus();
    } catch (e) {
      setStatus(els.flowStatus, e.message, true);
      setStatus($('flowCheckStatus'), e.message, true);
    } finally { $('flowCheckContinue').disabled = false; }
  }

  function renderOutline() {
    var ol = $('presenterOutline');
    ol.textContent = '';
    state.present.flow.steps.forEach(function (s, i) {
      var li = el('li');
      var b = el('button', 'demo-flows-outline-btn', s.title || (s.asset && s.asset.title) || 'Step ' + (i + 1));
      b.type = 'button';
      b.addEventListener('click', function () { showStep(i); });
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  async function showStep(i) {
    var p = state.present;
    var steps = p.flow.steps;
    if (i < 0 || i >= steps.length) return;
    p.index = i;
    p.stepStarted = Date.now();
    var s = steps[i];
    $('presenterStep').textContent = 'Step ' + (i + 1) + ' of ' + steps.length;
    $('presenterStepTitle').textContent = s.title || (s.asset && s.asset.title) || 'Step ' + (i + 1);
    var talk = $('presenterTalk');
    talk.textContent = '';
    String(s.talkTrack || 'No talk track for this step.').split(/\n{2,}/).forEach(function (para) {
      talk.appendChild(el('p', null, para));
    });
    if (s.transition) talk.appendChild(el('p', 'hint', 'Transition: ' + s.transition));
    if (s.missing || !s.renderUrl) {
      els.frame.hidden = true;
      els.frame.removeAttribute('src');
      els.missing.hidden = false;
      els.missing.textContent = s.error || 'This step cannot be shown.';
    } else {
      els.missing.hidden = true;
      els.frame.hidden = false;
      if (s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now() + 30000) {
        els.frame.src = 'about:blank';
        try {
          var renewed = await request(API + '/' + encodeURIComponent(s.assetId) + '/render-token', {
            method: 'POST', body: { versionId: s.versionId },
          });
          s.renderUrl = renewed.url;
          s.expiresAt = renewed.expiresAt;
        } catch (e) {
          if (state.present === p && p.index === i) {
            els.frame.hidden = true;
            els.missing.hidden = false;
            els.missing.textContent = 'Could not renew this preview: ' + e.message + '. Select the step again to retry.';
          }
          return;
        }
      }
      if (state.present !== p || p.index !== i) return;
      els.frame.src = s.renderUrl;
    }
    els.prev.disabled = i === 0;
    els.next.disabled = i === steps.length - 1;
    Array.prototype.forEach.call($('presenterOutline').children, function (li, j) {
      li.classList.toggle('is-active', j === i);
      if (j === i) li.firstChild.setAttribute('aria-current', 'step'); else li.firstChild.removeAttribute('aria-current');
    });
    tick();
    renderNotesWindow();
  }

  function clock(ms) {
    var sec = Math.floor(ms / 1000);
    var m = Math.floor(sec / 60);
    var r = sec % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function tick() {
    var p = state.present;
    if (!p) return;
    var step = p.flow.steps[p.index];
    var elapsed = Date.now() - p.stepStarted;
    var over = step.durationMin && elapsed > step.durationMin * 60000;
    var t = $('presenterTimer');
    t.textContent = clock(elapsed) + (step.durationMin ? ' / ' + fmtMinutes(step.durationMin) : '') + ' · total ' + clock(Date.now() - p.started);
    t.classList.toggle('is-over', !!over);
    if (state.notesWindow && !state.notesWindow.closed) {
      var timer = state.notesWindow.document.getElementById('notesTimer');
      if (timer) timer.textContent = t.textContent;
    }
  }

  function openNotesWindow() {
    if (!state.present) return;
    if (state.notesWindow && !state.notesWindow.closed) { state.notesWindow.focus(); return; }
    var win = window.open('about:blank', '_blank', 'popup,width=680,height=800');
    if (!win) { setStatus(els.flowStatus, 'Your browser blocked the presenter window. Allow pop-ups and try again.', true); return; }
    state.notesWindow = win;
    win.document.title = 'Presenter notes';
    var stylesheet = win.document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('demo-presenter-notes.css?v=20261009-workspace', location.href).href;
    win.document.head.appendChild(stylesheet);
    if (document.documentElement.getAttribute('data-aep-theme') === 'dark') win.document.documentElement.setAttribute('data-aep-theme', 'dark');
    win.document.body.appendChild(win.document.createElement('main'));
    $('presenterAside').hidden = true;
    $('presenterNotes').setAttribute('aria-pressed', 'false');
    renderNotesWindow();
  }

  function renderNotesWindow() {
    var win = state.notesWindow;
    if (!win || win.closed || !state.present) return;
    var doc = win.document, main = doc.querySelector('main');
    main.textContent = '';
    var step = state.present.flow.steps[state.present.index];
    function node(tag, text) { var n = doc.createElement(tag); n.textContent = text; main.appendChild(n); return n; }
    node('h1', step.title || (step.asset && step.asset.title) || 'Demo step');
    node('p', 'Step ' + (state.present.index + 1) + ' of ' + state.present.flow.steps.length);
    node('p', $('presenterTimer').textContent).id = 'notesTimer';
    node('p', step.talkTrack || 'No talk track for this step.').className = 'talk-track';
    if (step.transition) node('p', 'Transition: ' + step.transition);
    [['Previous', -1], ['Next', 1]].forEach(function (entry) {
      var b = node('button', entry[0]);
      b.type = 'button';
      b.disabled = state.present.index + entry[1] < 0 || state.present.index + entry[1] >= state.present.flow.steps.length;
      b.addEventListener('click', function () { showStep(state.present.index + entry[1]); });
    });
  }

  function stopPresenting() {
    var p = state.present;
    if (!p) return;
    clearInterval(p.timer);
    if (state.notesWindow && !state.notesWindow.closed) state.notesWindow.close();
    state.notesWindow = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    els.frame.removeAttribute('src');
    els.presenter.hidden = true;
    document.body.classList.remove('demo-flows-presenting');
    state.present = null;
    if (p.opener && p.opener.focus) p.opener.focus();
  }

  function onKey(ev) {
    if (!state.present) return;
    var tag = (ev.target && ev.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); showStep(state.present.index + 1); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); showStep(state.present.index - 1); }
    else if (ev.key === 'Escape' && !document.fullscreenElement) { ev.preventDefault(); stopPresenting(); }
  }

  // ---- Init ----

  function init() {
    els = {
      gate: $('flowsGate'), app: $('flowsApp'), list: $('flowsList'), listStatus: $('flowsListStatus'), search: $('flowsSearch'),
      empty: $('flowEmpty'), form: $('flowForm'), type: $('flowType'), totals: $('flowTotals'), steps: $('flowSteps'),
      assetSearch: $('assetSearch'), assetResults: $('assetResults'), flowStatus: $('flowStatus'),
      del: $('flowDelete'), present: $('flowPresent'),
      suggestDialog: $('suggestDialog'), suggestForm: $('suggestForm'), suggestError: $('suggestError'),
      suggestRationale: $('suggestRationale'), suggestRun: $('suggestRun'),
      presenter: $('presenter'), frame: $('presenterFrame'), missing: $('presenterMissing'),
      prev: $('presenterPrev'), next: $('presenterNext'),
    };
    $('flowsNew').addEventListener('click', function () { state.pendingAdd = null; newFlow(null); });
    els.search.addEventListener('input', renderFlowList);
    els.assetSearch.addEventListener('input', renderAssetResults);
    els.form.addEventListener('submit', saveFlow);
    els.form.addEventListener('input', function (ev) { if (ev.target.closest('.demo-flows-fields')) state.dirty = true; });
    els.del.addEventListener('click', deleteFlow);
    els.present.addEventListener('click', startPresenting);
    $('flowSuggest').addEventListener('click', openSuggest);
    $('flowSuggestionAccept').addEventListener('click', acceptSuggestion);
    $('flowSuggestionCancel').addEventListener('click', function () { state.suggestion = null; $('flowSuggestionReview').close(); });
    $('flowUndoSuggestion').addEventListener('click', undoSuggestion);
    $('flowCheck').addEventListener('click', function () { checkFlow(false); });
    $('flowCheckClose').addEventListener('click', function () { $('flowCheckDialog').close(); });
    $('flowCheckContinue').addEventListener('click', presentCheckedFlow);
    $('presenterNotesWindow').addEventListener('click', openNotesWindow);
    $('suggestCancel').addEventListener('click', function () { els.suggestDialog.close(); });
    els.suggestForm.addEventListener('submit', runSuggest);
    els.prev.addEventListener('click', function () { showStep(state.present.index - 1); });
    els.next.addEventListener('click', function () { showStep(state.present.index + 1); });
    $('presenterClose').addEventListener('click', stopPresenting);
    $('presenterFull').addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else els.presenter.requestFullscreen().catch(function () {});
    });
    $('presenterNotes').addEventListener('click', function () {
      var aside = $('presenterAside');
      aside.hidden = !aside.hidden;
      this.setAttribute('aria-pressed', String(!aside.hidden));
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', function (ev) {
      if (state.dirty) { ev.preventDefault(); ev.returnValue = ''; }
    });
    window.addEventListener('pagehide', function () {
      if (state.notesWindow && !state.notesWindow.closed) state.notesWindow.close();
    });

    if (typeof firebase === 'undefined' || !window.firebaseDatabaseConfig) {
      els.gate.hidden = false;
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(window.firebaseDatabaseConfig);
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user || user.isAnonymous || !user.email) {
        state.user = null;
        els.app.hidden = true;
        els.gate.hidden = false;
        return;
      }
      var first = !state.user;
      state.user = user;
      els.gate.hidden = true;
      els.app.hidden = false;
      if (first) loadAll();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
