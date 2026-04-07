/**
 * Event Tool — unified Edge event sender with datastream discovery,
 * config persistence per sandbox, profile query, and quick trigger / custom modes.
 */
(function () {
  'use strict';

  /* ── DOM refs ── */
  const dom = {
    dsSelect:      document.getElementById('etDatastreamSelect'),
    dsRefresh:     document.getElementById('etDsRefreshBtn'),
    manualRow:     document.getElementById('etManualRow'),
    manualDs:      document.getElementById('etManualDs'),
    manualToggle:  document.getElementById('etManualToggle'),
    saveConfigBtn: document.getElementById('etSaveConfigBtn'),
    connectionMsg: document.getElementById('etConnectionMsg'),

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
  let datastreams = [];
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

  /* ═══════════ Connection ═══════════ */

  async function loadDatastreams() {
    dom.dsSelect.innerHTML = '<option value="">Loading…</option>';
    try {
      const res = await fetch('/api/events/datastreams' + getSandboxParam());
      const data = await res.json().catch(() => ({}));
      datastreams = Array.isArray(data.datastreams) ? data.datastreams : [];

      dom.dsSelect.innerHTML = '';
      if (datastreams.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— No datastreams found (use Manual input) —';
        dom.dsSelect.appendChild(opt);
        dom.manualToggle.checked = true;
        dom.manualRow.hidden = false;
        if (data.discoveryErrors) {
          setMsg(dom.connectionMsg, 'Datastream auto-discovery unavailable — enter a datastream ID manually.', '');
        }
        return;
      }
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— Select a datastream —';
      dom.dsSelect.appendChild(blank);

      datastreams.forEach((ds) => {
        const opt = document.createElement('option');
        opt.value = ds.id;
        opt.textContent = ds.title ? ds.title + ' (' + ds.id.slice(0, 8) + '…)' : ds.id;
        dom.dsSelect.appendChild(opt);
      });
    } catch {
      dom.dsSelect.innerHTML = '<option value="">Failed to load datastreams</option>';
      dom.manualToggle.checked = true;
      dom.manualRow.hidden = false;
    }
  }

  async function loadSavedConfig() {
    try {
      const res = await fetch('/api/events/config' + getSandboxParam());
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.record && data.record.datastreamId) {
        const dsId = data.record.datastreamId;
        if (dom.dsSelect) {
          const exists = Array.from(dom.dsSelect.options).some((o) => o.value === dsId);
          if (exists) {
            dom.dsSelect.value = dsId;
          } else {
            dom.manualToggle.checked = true;
            dom.manualRow.hidden = false;
            dom.manualDs.value = dsId;
          }
        }
        setMsg(dom.connectionMsg, 'Loaded saved config: ' + (data.record.datastreamTitle || dsId), 'success');
      }
    } catch { /* no saved config */ }
  }

  function getSelectedDatastreamId() {
    if (dom.manualToggle.checked && dom.manualDs.value.trim()) {
      return dom.manualDs.value.trim();
    }
    return (dom.dsSelect && dom.dsSelect.value) || '';
  }

  function getSelectedDatastreamTitle() {
    const dsId = getSelectedDatastreamId();
    if (dom.manualToggle.checked) return '';
    const ds = datastreams.find((d) => d.id === dsId);
    return ds ? ds.title || '' : '';
  }

  dom.manualToggle.addEventListener('change', () => {
    dom.manualRow.hidden = !dom.manualToggle.checked;
  });

  dom.dsRefresh.addEventListener('click', () => loadDatastreams());

  dom.saveConfigBtn.addEventListener('click', async () => {
    const dsId = getSelectedDatastreamId();
    if (!dsId) { setMsg(dom.connectionMsg, 'Select or enter a datastream first.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.connectionMsg, 'No sandbox selected.', 'error'); return; }
    setMsg(dom.connectionMsg, 'Saving…', '');
    try {
      const res = await fetch('/api/events/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox,
          datastreamId: dsId,
          datastreamTitle: getSelectedDatastreamTitle(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMsg(dom.connectionMsg, 'Saved for sandbox: ' + sandbox, 'success');
      } else {
        setMsg(dom.connectionMsg, data.error || 'Save failed.', 'error');
      }
    } catch (e) {
      setMsg(dom.connectionMsg, e.message || 'Network error', 'error');
    }
  });

  /* ═══════════ Identity ═══════════ */

  dom.queryBtn.addEventListener('click', async () => {
    const id = (dom.identifier.value || '').trim();
    if (!id) { setMsg(dom.profileMsg, 'Enter an identifier.', 'error'); return; }
    const ns = typeof AepIdentityPicker !== 'undefined' ? AepIdentityPicker.getNamespace('etIdentifier') : (dom.namespace.value || 'email');
    setMsg(dom.profileMsg, 'Loading…', '');
    dom.profileInfo.hidden = true;
    try {
      const res = await fetch('/api/profile/consent?identifier=' + encodeURIComponent(id) + '&namespace=' + encodeURIComponent(ns) + getSandboxParam());
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
      document.querySelectorAll('.et-mode-btn').forEach((b) => b.classList.toggle('et-mode-btn--active', b.dataset.mode === mode));
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

    const keys = Object.keys(triggerTemplates).filter((k) => typeof triggerTemplates[k] === 'object' && triggerTemplates[k].payload);
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
    const dsId = getSelectedDatastreamId();
    if (!dsId) { setMsg(dom.sendMsg, 'Select a datastream first.', 'error'); return; }
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
        if (tpl.datastreamId) body.datastreamId = tpl.datastreamId;
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
        const errMsg = data.error || 'Request failed.';
        setMsg(dom.sendMsg, errMsg, 'error');
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
    dom.profileInfo.hidden = true;
    setMsg(dom.profileMsg, '', '');
    setMsg(dom.connectionMsg, '', '');
    setMsg(dom.sendMsg, '', '');
    loadDatastreams().then(() => loadSavedConfig());
  }

  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.onChange === 'function') {
    window.AepGlobalSandbox.onChange(onSandboxChange);
  }

  /* ═══════════ Init ═══════════ */

  function init() {
    loadTriggerTemplates();
    loadDatastreams().then(() => loadSavedConfig());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
