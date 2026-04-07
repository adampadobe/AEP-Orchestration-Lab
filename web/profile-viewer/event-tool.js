/**
 * Event Tool — unified Edge event sender.
 * Sandbox selector shown inline, identity query first,
 * collapsible config section (schema → dataset → datastream).
 */
(function () {
  'use strict';

  /* ── DOM refs ── */
  const dom = {
    sandboxSelect:    document.getElementById('sandboxSelect'),

    namespace:        document.getElementById('etNamespace'),
    identifier:       document.getElementById('etIdentifier'),
    queryBtn:         document.getElementById('etQueryBtn'),
    profileMsg:       document.getElementById('etProfileMsg'),
    profileInfo:      document.getElementById('etProfileInfo'),
    infoEmail:        document.getElementById('etInfoEmail'),
    infoFirst:        document.getElementById('etInfoFirst'),
    infoLast:         document.getElementById('etInfoLast'),
    infoEcid:         document.getElementById('etInfoEcid'),

    configDetails:    document.getElementById('etConfigDetails'),
    configBadge:      document.getElementById('etConfigBadge'),
    schemaTitle:      document.getElementById('etSchemaTitle'),
    createSchemaBtn:  document.getElementById('etCreateSchemaBtn'),
    schemaMsg:        document.getElementById('etSchemaMsg'),
    datasetName:      document.getElementById('etDatasetName'),
    createDatasetBtn: document.getElementById('etCreateDatasetBtn'),
    datasetMsg:       document.getElementById('etDatasetMsg'),
    dsInput:          document.getElementById('etManualDs'),
    saveConfigBtn:    document.getElementById('etSaveConfigBtn'),
    connectionMsg:    document.getElementById('etConnectionMsg'),
    fetchConfigBtn:   document.getElementById('etFetchConfigBtn'),
    checkInfraBtn:    document.getElementById('etCheckInfraBtn'),
    infraMsg:         document.getElementById('etInfraMsg'),

    triggerMode:      document.getElementById('etTriggerMode'),
    customMode:       document.getElementById('etCustomMode'),
    triggerType:      document.getElementById('etTriggerType'),
    triggerDesc:      document.getElementById('etTriggerDesc'),
    eventType:        document.getElementById('etEventType'),
    orchId:           document.getElementById('etOrchId'),
    viewName:         document.getElementById('etViewName'),
    viewUrl:          document.getElementById('etViewUrl'),
    channel:          document.getElementById('etChannel'),

    sendBtn:          document.getElementById('etSendBtn'),
    sendMsg:          document.getElementById('etSendMsg'),
  };

  /* ── State ── */
  let triggerTemplates = {};
  let schemaEventTypes = [];
  let resolvedEcid = '';
  let resolvedEmail = '';
  let activeMode = 'trigger';

  /* ── Sandbox helper (uses inline select on this page) ── */
  function getSandboxName() {
    if (dom.sandboxSelect && dom.sandboxSelect.value) return dom.sandboxSelect.value;
    if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandbox === 'function') {
      return window.AepGlobalSandbox.getSandbox() || '';
    }
    return '';
  }

  function sandboxQs() {
    const n = getSandboxName();
    return n ? '?sandbox=' + encodeURIComponent(n) : '';
  }

  function sandboxQsAmp() {
    const n = getSandboxName();
    return n ? '&sandbox=' + encodeURIComponent(n) : '';
  }

  /* ── Message helper ── */
  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'consent-message' + (type ? ' ' + type : '');
    el.hidden = !text;
  }

  /* ── Identity setup ── */
  if (typeof attachEmailDatalist === 'function') attachEmailDatalist('etIdentifier');
  if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('etIdentifier', 'etNamespace');

  /* ═══════════ Sandbox selector ═══════════ */

  function initSandboxSelect() {
    if (!dom.sandboxSelect) return;
    if (typeof window.AepGlobalSandbox !== 'undefined') {
      window.AepGlobalSandbox.loadSandboxesIntoSelect(dom.sandboxSelect);
      window.AepGlobalSandbox.onSandboxSelectChange(dom.sandboxSelect);
      window.AepGlobalSandbox.attachStorageSync(dom.sandboxSelect);
    }
    dom.sandboxSelect.addEventListener('change', onSandboxChange);
  }

  /* ═══════════ Config — Firestore per sandbox ═══════════ */

  async function loadSavedConfig() {
    const qs = sandboxQs();
    if (!qs) return;
    setMsg(dom.infraMsg, 'Loading saved configuration from Firebase…', '');
    try {
      const res = await fetch('/api/events/config' + qs);
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.record) {
        if (data.record.datastreamId) dom.dsInput.value = data.record.datastreamId;
        if (data.record.schemaTitle) dom.schemaTitle.value = data.record.schemaTitle;
        if (data.record.datasetName) dom.datasetName.value = data.record.datasetName;
        if (data.record.datastreamId) {
          collapseConfig();
          setMsg(dom.infraMsg, 'Configuration loaded from Firebase.', 'success');
        } else {
          expandConfig();
          setMsg(dom.infraMsg, 'No datastream saved for this sandbox yet. Complete the steps below, then click Save.', '');
        }
        if (data.record.schemaTitle) loadSchemaEventTypes(data.record.schemaTitle);
      } else {
        expandConfig();
        setMsg(dom.infraMsg, 'No configuration found for this sandbox. Complete the steps below to get started.', '');
      }
    } catch {
      expandConfig();
      setMsg(dom.infraMsg, '', '');
    }
  }

  async function saveConfigField(patch) {
    const sandbox = getSandboxName();
    if (!sandbox) return;
    try {
      await fetch('/api/events/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox, ...patch }),
      });
    } catch { /* silent — best-effort persist */ }
  }

  function collapseConfig() {
    if (dom.configDetails) dom.configDetails.removeAttribute('open');
    if (dom.configBadge) dom.configBadge.hidden = false;
  }

  function expandConfig() {
    if (dom.configDetails) dom.configDetails.setAttribute('open', '');
    if (dom.configBadge) dom.configBadge.hidden = true;
  }

  /* ═══════════ Event types from schema ═══════════ */

  async function loadSchemaEventTypes(schemaTitle) {
    if (!schemaTitle) return;
    const qs = sandboxQs();
    if (!qs) return;
    const hint = document.getElementById('etEventTypeHint');
    if (hint) { hint.textContent = 'Loading event types from schema…'; hint.hidden = false; }
    try {
      const res = await fetch('/api/events/infra/event-types' + qs + '&schemaTitle=' + encodeURIComponent(schemaTitle));
      const data = await res.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.eventTypes) && data.eventTypes.length > 0) {
        schemaEventTypes = data.eventTypes;
      } else {
        schemaEventTypes = [];
        if (hint) { hint.textContent = data.error || 'No event types found in schema — type any value.'; hint.hidden = false; }
      }
    } catch (e) {
      schemaEventTypes = [];
      if (hint) { hint.textContent = 'Could not load event types: ' + (e.message || 'network error'); hint.hidden = false; }
    }
    populateEventTypeDatalist();
  }

  function populateEventTypeDatalist() {
    const dl = document.getElementById('etEventTypeList');
    if (dl) {
      dl.innerHTML = '';
      schemaEventTypes.forEach(function (et) {
        const opt = document.createElement('option');
        opt.value = et.value;
        if (et.label && et.label !== et.value) opt.label = et.label;
        dl.appendChild(opt);
      });
    }
    const hint = document.getElementById('etEventTypeHint');
    if (hint && schemaEventTypes.length > 0) {
      hint.textContent = schemaEventTypes.length + ' event types loaded from schema — select or type your own.';
      hint.hidden = false;
    }
    populateTriggerSelectWithSchema();
  }

  function populateTriggerSelectWithSchema() {
    if (!dom.triggerType) return;
    const existing = dom.triggerType.querySelector('optgroup[data-schema]');
    if (existing) existing.remove();
    if (schemaEventTypes.length === 0) return;

    const templateKeys = new Set(Object.keys(triggerTemplates));
    const schemaOnly = schemaEventTypes.filter(function (et) { return !templateKeys.has(et.value); });
    if (schemaOnly.length === 0) return;

    const group = document.createElement('optgroup');
    group.label = 'From schema';
    group.dataset.schema = '1';
    schemaOnly.forEach(function (et) {
      const opt = document.createElement('option');
      opt.value = et.value;
      opt.textContent = et.label && et.label !== et.value ? et.value + ' — ' + et.label : et.value;
      group.appendChild(opt);
    });
    dom.triggerType.appendChild(group);
  }

  /* ═══════════ Step 1 — Create Schema ═══════════ */

  dom.createSchemaBtn.addEventListener('click', async () => {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    if (!schemaTitle) { setMsg(dom.schemaMsg, 'Enter a schema name.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.schemaMsg, 'Select a sandbox first.', 'error'); return; }
    dom.createSchemaBtn.disabled = true;
    setMsg(dom.schemaMsg, 'Creating schema…', '');
    try {
      const res = await fetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'createSchema', schemaTitle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setMsg(dom.schemaMsg, data.error || 'Failed.', 'error'); return; }
      setMsg(dom.schemaMsg, data.message || 'Schema created.', 'success');
      saveConfigField({ schemaTitle });
      loadSchemaEventTypes(schemaTitle);
    } catch (e) {
      setMsg(dom.schemaMsg, e.message || 'Network error', 'error');
    } finally {
      dom.createSchemaBtn.disabled = false;
    }
  });

  /* ═══════════ Step 2 — Create Dataset ═══════════ */

  dom.createDatasetBtn.addEventListener('click', async () => {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    if (!schemaTitle) { setMsg(dom.datasetMsg, 'Enter the schema name first — the dataset links to it.', 'error'); return; }
    const datasetName = (dom.datasetName.value || '').trim();
    if (!datasetName) { setMsg(dom.datasetMsg, 'Enter a dataset name.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.datasetMsg, 'Select a sandbox first.', 'error'); return; }
    dom.createDatasetBtn.disabled = true;
    setMsg(dom.datasetMsg, 'Creating dataset…', '');
    try {
      const res = await fetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'createDataset', schemaTitle, datasetName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setMsg(dom.datasetMsg, data.error || 'Failed.', 'error'); return; }
      setMsg(dom.datasetMsg, data.message || 'Dataset created.', 'success');
      saveConfigField({ schemaTitle, datasetName });
    } catch (e) {
      setMsg(dom.datasetMsg, e.message || 'Network error', 'error');
    } finally {
      dom.createDatasetBtn.disabled = false;
    }
  });

  /* ═══════════ Step 3 — Save Datastream ID ═══════════ */

  dom.saveConfigBtn.addEventListener('click', async () => {
    const dsId = (dom.dsInput.value || '').trim();
    if (!dsId) { setMsg(dom.connectionMsg, 'Paste a datastream ID.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.connectionMsg, 'Select a sandbox first.', 'error'); return; }
    setMsg(dom.connectionMsg, 'Saving to Firebase…', '');
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    const datasetName = (dom.datasetName.value || '').trim();
    try {
      const res = await fetch('/api/events/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox, datastreamId: dsId, schemaTitle, datasetName }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMsg(dom.connectionMsg, 'Saved to Firebase for sandbox "' + sandbox + '".', 'success');
        setMsg(dom.infraMsg, 'Configuration loaded from Firebase.', 'success');
        collapseConfig();
        if (schemaTitle) loadSchemaEventTypes(schemaTitle);
      } else {
        setMsg(dom.connectionMsg, data.error || 'Save failed.', 'error');
      }
    } catch (e) {
      setMsg(dom.connectionMsg, e.message || 'Network error', 'error');
    }
  });

  /* ═══════════ Fetch Config from Firebase ═══════════ */

  dom.fetchConfigBtn.addEventListener('click', async () => {
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.infraMsg, 'Select a sandbox first.', 'error'); return; }
    dom.fetchConfigBtn.disabled = true;
    setMsg(dom.infraMsg, 'Fetching configuration from Firebase…', '');
    try {
      const res = await fetch('/api/events/config' + sandboxQs());
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.record) {
        const r = data.record;
        const parts = [];
        if (r.schemaTitle) { dom.schemaTitle.value = r.schemaTitle; parts.push('Schema: ' + r.schemaTitle); }
        if (r.datasetName) { dom.datasetName.value = r.datasetName; parts.push('Dataset: ' + r.datasetName); }
        if (r.datastreamId) { dom.dsInput.value = r.datastreamId; parts.push('Datastream: ' + r.datastreamId); }
        if (parts.length > 0) {
          setMsg(dom.infraMsg, 'Loaded from Firebase — ' + parts.join('  ·  '), 'success');
          if (r.schemaTitle) loadSchemaEventTypes(r.schemaTitle);
        } else {
          setMsg(dom.infraMsg, 'No saved configuration found for sandbox "' + sandbox + '".', 'error');
        }
      } else {
        setMsg(dom.infraMsg, 'No saved configuration found for sandbox "' + sandbox + '".', 'error');
      }
    } catch (e) {
      setMsg(dom.infraMsg, e.message || 'Network error', 'error');
    } finally {
      dom.fetchConfigBtn.disabled = false;
    }
  });

  /* ═══════════ Check Status ═══════════ */

  dom.checkInfraBtn.addEventListener('click', async () => {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    const datasetName = (dom.datasetName.value || '').trim();
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.infraMsg, 'Select a sandbox first.', 'error'); return; }
    if (!schemaTitle) { setMsg(dom.infraMsg, 'Enter a schema name to check.', 'error'); return; }
    setMsg(dom.infraMsg, 'Checking…', '');
    try {
      let qs = sandboxQs() + '&schemaTitle=' + encodeURIComponent(schemaTitle);
      if (datasetName) qs += '&datasetName=' + encodeURIComponent(datasetName);
      const res = await fetch('/api/events/infra/status' + qs);
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setMsg(dom.infraMsg, data.error || 'Check failed.', 'error'); return; }
      const parts = [];
      parts.push('Schema: ' + (data.schemaFound ? '✓ found' : '✗ not found'));
      if (datasetName) parts.push('Dataset: ' + (data.datasetFound ? '✓ found' : '✗ not found'));
      const dsId = (dom.dsInput.value || '').trim();
      parts.push('Datastream ID: ' + (dsId ? '✓ set' : '✗ not set'));
      const allOk = data.schemaFound && (!datasetName || data.datasetFound) && dsId;
      setMsg(dom.infraMsg, parts.join('  ·  '), allOk ? 'success' : '');
    } catch (e) {
      setMsg(dom.infraMsg, e.message || 'Network error', 'error');
    }
  });

  /* ═══════════ Identity ═══════════ */

  dom.queryBtn.addEventListener('click', async () => {
    const id = (dom.identifier.value || '').trim();
    if (!id) { setMsg(dom.profileMsg, 'Enter an identifier.', 'error'); return; }
    const ns = typeof AepIdentityPicker !== 'undefined'
      ? AepIdentityPicker.getNamespace('etIdentifier')
      : (dom.namespace.value || 'email');
    setMsg(dom.profileMsg, 'Loading…', '');
    dom.profileInfo.hidden = true;
    try {
      const res = await fetch(
        '/api/profile/consent?identifier=' + encodeURIComponent(id) +
        '&namespace=' + encodeURIComponent(ns) + sandboxQsAmp()
      );
      const data = await res.json();
      if (!res.ok) { setMsg(dom.profileMsg, data.error || 'Request failed.', 'error'); return; }
      if (typeof addEmail === 'function') addEmail(id);

      if (data.found) {
        dom.infoEmail.textContent = data.email || id;
        dom.infoFirst.textContent = data.firstName || '—';
        dom.infoLast.textContent = data.lastName || '—';
        const ecidVal = Array.isArray(data.ecid) ? (data.ecid[0] || '') : (data.ecid || '');
        dom.infoEcid.textContent = ecidVal || '—';
        resolvedEcid = String(ecidVal);
        resolvedEmail = data.email || id;
        dom.profileInfo.hidden = false;
        setMsg(dom.profileMsg, 'Profile found.', 'success');
      } else {
        dom.infoEmail.textContent = id;
        dom.infoFirst.textContent = '—';
        dom.infoLast.textContent = '—';
        dom.infoEcid.textContent = '—';
        resolvedEcid = '';
        resolvedEmail = id;
        dom.profileInfo.hidden = false;
        setMsg(dom.profileMsg, 'No profile found — event may create a new profile.', 'success');
      }
    } catch (e) {
      setMsg(dom.profileMsg, e.message || 'Network error', 'error');
    }
  });

  /* ═══════════ Event mode toggle ═══════════ */

  document.querySelectorAll('.et-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === activeMode) return;
      activeMode = mode;
      document.querySelectorAll('.et-mode-btn').forEach((b) =>
        b.classList.toggle('et-mode-btn--active', b.dataset.mode === mode)
      );
      dom.triggerMode.hidden = mode !== 'trigger';
      dom.customMode.hidden = mode !== 'custom';
    });
  });

  /* ═══════════ Trigger templates ═══════════ */

  async function loadTriggerTemplates() {
    try {
      const res = await fetch('event-triggers.json');
      triggerTemplates = await res.json().catch(() => ({}));
    } catch {
      triggerTemplates = {};
    }

    const keys = Object.keys(triggerTemplates).filter(
      (k) => typeof triggerTemplates[k] === 'object' && triggerTemplates[k].payload
    );
    dom.triggerType.innerHTML = '';
    if (keys.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— No templates —';
      dom.triggerType.appendChild(opt);
      return;
    }
    keys.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      dom.triggerType.appendChild(opt);
    });
    updateTriggerDesc();
  }

  function updateTriggerDesc() {
    const key = dom.triggerType.value;
    const tpl = triggerTemplates[key];
    if (tpl) {
      dom.triggerDesc.textContent = tpl.description || '';
    } else {
      const et = schemaEventTypes.find(function (e) { return e.value === key; });
      dom.triggerDesc.textContent = et && et.label && et.label !== et.value ? et.label : 'Schema event type — sends a generic XDM event.';
    }
  }

  dom.triggerType.addEventListener('change', updateTriggerDesc);

  /* ═══════════ Send event ═══════════ */

  dom.sendBtn.addEventListener('click', async () => {
    const dsId = (dom.dsInput.value || '').trim();
    if (!dsId) { setMsg(dom.sendMsg, 'Set a Datastream ID in Configuration first.', 'error'); return; }
    const email = resolvedEmail || (dom.identifier.value || '').trim();
    if (!email) { setMsg(dom.sendMsg, 'Enter an identifier first.', 'error'); return; }

    dom.sendBtn.disabled = true;
    setMsg(dom.sendMsg, 'Sending…', '');

    try {
      const body = { datastreamId: dsId, email };
      if (resolvedEcid && resolvedEcid !== '—' && /^\d+$/.test(resolvedEcid) && resolvedEcid.length >= 10) {
        body.ecid = resolvedEcid;
      }

      if (activeMode === 'trigger') {
        const key = dom.triggerType.value;
        if (!key) { setMsg(dom.sendMsg, 'Select an event type.', 'error'); return; }
        const tpl = triggerTemplates[key];
        if (tpl && tpl.payload) {
          body.triggerTemplate = tpl.payload;
        }
        body.eventType = key;
      } else {
        body.eventType = (dom.eventType.value || '').trim() || 'transaction';
        const orchId = (dom.orchId.value || '').trim();
        if (orchId) body.eventID = orchId;
        const vn = (dom.viewName.value || '').trim();
        const vu = (dom.viewUrl.value || '').trim();
        if (vn) body.viewName = vn;
        if (vu) body.viewUrl = vu;
        const ch = (dom.channel.value || '').trim();
        if (ch) body.channel = ch;
      }

      const res = await fetch('/api/events/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setMsg(dom.sendMsg, data.error || 'Request failed.', 'error');
      } else {
        let idPart = '';
        if (data.requestId) idPart = ' — requestId: ' + data.requestId;
        setMsg(dom.sendMsg, 'Event sent successfully.' + idPart, 'success');
      }
    } catch (e) {
      setMsg(dom.sendMsg, e.message || 'Network error', 'error');
    } finally {
      dom.sendBtn.disabled = false;
    }
  });

  /* ═══════════ Sandbox change ═══════════ */

  function onSandboxChange() {
    resolvedEcid = '';
    resolvedEmail = '';
    dom.dsInput.value = '';
    dom.profileInfo.hidden = true;
    setMsg(dom.profileMsg, '', '');
    setMsg(dom.connectionMsg, '', '');
    setMsg(dom.schemaMsg, '', '');
    setMsg(dom.datasetMsg, '', '');
    setMsg(dom.infraMsg, '', '');
    setMsg(dom.sendMsg, '', '');
    if (dom.configBadge) dom.configBadge.hidden = true;
    loadSavedConfig();
  }

  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.onChange === 'function') {
    window.AepGlobalSandbox.onChange(onSandboxChange);
  }

  /* ═══════════ Init ═══════════ */

  function init() {
    initSandboxSelect();
    loadTriggerTemplates();
    loadSavedConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
