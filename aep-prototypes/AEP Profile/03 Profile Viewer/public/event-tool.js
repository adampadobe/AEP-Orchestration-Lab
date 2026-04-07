/**
 * Event Tool — unified Edge event sender.
 * User pastes a datastream ID, saves it per sandbox (Firestore),
 * queries a profile for ECID, then sends quick trigger or custom events.
 */
(function () {
  'use strict';

  /* ── DOM refs ── */
  const dom = {
    dsInput:       document.getElementById('etManualDs'),
    saveConfigBtn: document.getElementById('etSaveConfigBtn'),
    connectionMsg: document.getElementById('etConnectionMsg'),

    schemaTitle:      document.getElementById('etSchemaTitle'),
    datasetName:      document.getElementById('etDatasetName'),
    checkInfraBtn:    document.getElementById('etCheckInfraBtn'),
    createSchemaBtn:  document.getElementById('etCreateSchemaBtn'),
    createDatasetBtn: document.getElementById('etCreateDatasetBtn'),
    infraMsg:         document.getElementById('etInfraMsg'),

    namespace:     document.getElementById('etNamespace'),
    identifier:    document.getElementById('etIdentifier'),
    queryBtn:      document.getElementById('etQueryBtn'),
    profileMsg:    document.getElementById('etProfileMsg'),
    profileInfo:   document.getElementById('etProfileInfo'),
    infoEmail:     document.getElementById('etInfoEmail'),
    infoFirst:     document.getElementById('etInfoFirst'),
    infoLast:      document.getElementById('etInfoLast'),
    infoEcid:      document.getElementById('etInfoEcid'),

    triggerMode:   document.getElementById('etTriggerMode'),
    customMode:    document.getElementById('etCustomMode'),
    triggerType:   document.getElementById('etTriggerType'),
    triggerDesc:   document.getElementById('etTriggerDesc'),
    eventType:     document.getElementById('etEventType'),
    orchId:        document.getElementById('etOrchId'),
    viewName:      document.getElementById('etViewName'),
    viewUrl:       document.getElementById('etViewUrl'),
    channel:       document.getElementById('etChannel'),

    sendBtn:       document.getElementById('etSendBtn'),
    sendMsg:       document.getElementById('etSendMsg'),
  };

  /* ── State ── */
  let triggerTemplates = {};
  let resolvedEcid = '';
  let resolvedEmail = '';
  let activeMode = 'trigger';

  /* ── Sandbox helper ── */
  function getSandboxParam() {
    if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
      return window.AepGlobalSandbox.getSandboxParam();
    }
    return '';
  }

  function getSandboxName() {
    if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandbox === 'function') {
      return window.AepGlobalSandbox.getSandbox() || '';
    }
    return '';
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

  /* ═══════════ Connection — Firestore config per sandbox ═══════════ */

  async function loadSavedConfig() {
    try {
      const res = await fetch('/api/events/config' + getSandboxParam());
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.record && data.record.datastreamId) {
        dom.dsInput.value = data.record.datastreamId;
        setMsg(dom.connectionMsg, 'Loaded saved datastream for this sandbox.', 'success');
      }
    } catch { /* no saved config */ }
  }

  dom.saveConfigBtn.addEventListener('click', async () => {
    const dsId = (dom.dsInput.value || '').trim();
    if (!dsId) { setMsg(dom.connectionMsg, 'Paste a datastream ID first.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.connectionMsg, 'No sandbox selected — check Global values.', 'error'); return; }
    setMsg(dom.connectionMsg, 'Saving…', '');
    try {
      const res = await fetch('/api/events/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox, datastreamId: dsId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMsg(dom.connectionMsg, 'Saved for sandbox "' + sandbox + '".', 'success');
      } else {
        setMsg(dom.connectionMsg, data.error || 'Save failed.', 'error');
      }
    } catch (e) {
      setMsg(dom.connectionMsg, e.message || 'Network error', 'error');
    }
  });

  /* ═══════════ Schema & Dataset Setup ═══════════ */

  dom.checkInfraBtn.addEventListener('click', async () => {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    if (!schemaTitle) { setMsg(dom.infraMsg, 'Enter a schema name first.', 'error'); return; }
    const datasetName = (dom.datasetName.value || '').trim();
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.infraMsg, 'No sandbox selected.', 'error'); return; }
    setMsg(dom.infraMsg, 'Checking…', '');
    try {
      const qs = getSandboxParam() + '&schemaTitle=' + encodeURIComponent(schemaTitle) +
        (datasetName ? '&datasetName=' + encodeURIComponent(datasetName) : '');
      const res = await fetch('/api/events/infra/status' + qs);
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setMsg(dom.infraMsg, data.error || 'Status check failed.', 'error'); return; }
      const parts = [];
      parts.push('Schema: ' + (data.schemaFound ? 'found ✓' : 'not found'));
      if (datasetName) parts.push('Dataset: ' + (data.datasetFound ? 'found ✓' : 'not found'));
      const allOk = data.schemaFound && (!datasetName || data.datasetFound);
      setMsg(dom.infraMsg, parts.join(' · '), allOk ? 'success' : '');
    } catch (e) {
      setMsg(dom.infraMsg, e.message || 'Network error', 'error');
    }
  });

  dom.createSchemaBtn.addEventListener('click', async () => {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    if (!schemaTitle) { setMsg(dom.infraMsg, 'Enter a schema name first.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.infraMsg, 'No sandbox selected.', 'error'); return; }
    dom.createSchemaBtn.disabled = true;
    setMsg(dom.infraMsg, 'Creating schema…', '');
    try {
      const res = await fetch('/api/events/infra/step' + getSandboxParam(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'createSchema', schemaTitle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setMsg(dom.infraMsg, data.error || 'Create schema failed.', 'error'); return; }
      setMsg(dom.infraMsg, data.message || 'Schema created.', 'success');
    } catch (e) {
      setMsg(dom.infraMsg, e.message || 'Network error', 'error');
    } finally {
      dom.createSchemaBtn.disabled = false;
    }
  });

  dom.createDatasetBtn.addEventListener('click', async () => {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    if (!schemaTitle) { setMsg(dom.infraMsg, 'Enter a schema name — the dataset links to this schema.', 'error'); return; }
    const datasetName = (dom.datasetName.value || '').trim();
    if (!datasetName) { setMsg(dom.infraMsg, 'Enter a dataset name.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.infraMsg, 'No sandbox selected.', 'error'); return; }
    dom.createDatasetBtn.disabled = true;
    setMsg(dom.infraMsg, 'Creating dataset…', '');
    try {
      const res = await fetch('/api/events/infra/step' + getSandboxParam(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'createDataset', schemaTitle, datasetName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setMsg(dom.infraMsg, data.error || 'Create dataset failed.', 'error'); return; }
      setMsg(dom.infraMsg, data.message || 'Dataset created.', 'success');
    } catch (e) {
      setMsg(dom.infraMsg, e.message || 'Network error', 'error');
    } finally {
      dom.createDatasetBtn.disabled = false;
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
        '&namespace=' + encodeURIComponent(ns) + getSandboxParam()
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
    dom.triggerDesc.textContent = tpl ? (tpl.description || '') : '';
  }

  dom.triggerType.addEventListener('change', updateTriggerDesc);

  /* ═══════════ Send event ═══════════ */

  dom.sendBtn.addEventListener('click', async () => {
    const dsId = (dom.dsInput.value || '').trim();
    if (!dsId) { setMsg(dom.sendMsg, 'Enter a datastream ID in the Connection section first.', 'error'); return; }
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
        const tpl = triggerTemplates[key];
        if (!tpl || !tpl.payload) { setMsg(dom.sendMsg, 'Select a valid event template.', 'error'); return; }
        body.triggerTemplate = tpl.payload;
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
    setMsg(dom.infraMsg, '', '');
    setMsg(dom.sendMsg, '', '');
    loadSavedConfig();
  }

  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.onChange === 'function') {
    window.AepGlobalSandbox.onChange(onSandboxChange);
  }

  /* ═══════════ Init ═══════════ */

  function init() {
    loadTriggerTemplates();
    loadSavedConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
