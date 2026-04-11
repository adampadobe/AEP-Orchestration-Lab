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
    removeTriggerBtn: document.getElementById('etRemoveTriggerBtn'),
    addTriggerBtn:    document.getElementById('etAddTriggerBtn'),
    myTriggersPanel:  document.getElementById('etMyTriggersPanel'),
    myTriggersCount:  document.getElementById('etMyTriggersCount'),
    myTriggersList:   document.getElementById('etMyTriggersList'),
    schemaTypesPanel: document.getElementById('etSchemaTypesPanel'),
    schemaTypesCount: document.getElementById('etSchemaTypesCount'),
    schemaTypesList:  document.getElementById('etSchemaTypesList'),
    eventType:        document.getElementById('etEventType'),
    orchId:           document.getElementById('etOrchId'),
    viewName:         document.getElementById('etViewName'),
    viewUrl:          document.getElementById('etViewUrl'),
    channel:          document.getElementById('etChannel'),

    sendBtn:          document.getElementById('etSendBtn'),
    previewBtn:       document.getElementById('etPreviewBtn'),
    sendMsg:          document.getElementById('etSendMsg'),
    previewPanel:     document.getElementById('etPreviewPanel'),
    previewHeader:    document.getElementById('etPreviewHeader'),
    previewTitle:     document.getElementById('etPreviewTitle'),
    previewMeta:      document.getElementById('etPreviewMeta'),
    previewMinBtn:    document.getElementById('etPreviewMinBtn'),
    previewNote:      document.getElementById('etPreviewNote'),
    previewPre:       document.getElementById('etPreviewPre'),
  };

  /* ── State ── */
  let triggerTemplates = {};
  let schemaEventTypes = [];
  let customTriggers = [];
  /** Short list for the quick-trigger datalist only (also in Firestore). */
  let quickMenuTriggers = [];
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

  function triggerKey(t) {
    if (t == null) return '';
    return typeof t === 'string' ? t : (t.value || t.eventType || '');
  }

  function isTemplatePayloadKey(k) {
    var tpl = triggerTemplates[k];
    return !!(tpl && typeof tpl === 'object' && tpl.payload);
  }

  function isInCustomLibrary(key) {
    if (!key) return false;
    return customTriggers.some(function (t) { return triggerKey(t) === key; });
  }

  /** Keep quick menu aligned with library + optional template keys pinned in menu. */
  function sanitizeQuickMenuTriggers() {
    var seen = new Set();
    quickMenuTriggers = quickMenuTriggers.filter(function (k) {
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return isInCustomLibrary(k) || isTemplatePayloadKey(k);
    });
  }

  function persistTriggersState() {
    sanitizeQuickMenuTriggers();
    saveConfigField({ customTriggers: customTriggers, quickMenuTriggers: quickMenuTriggers });
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

  async function initSandboxSelect() {
    if (!dom.sandboxSelect) return;
    if (typeof window.AepGlobalSandbox !== 'undefined') {
      await window.AepGlobalSandbox.loadSandboxesIntoSelect(dom.sandboxSelect);
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
        customTriggers = Array.isArray(data.record.customTriggers) ? data.record.customTriggers : [];
        if (Array.isArray(data.record.quickMenuTriggers)) {
          quickMenuTriggers = data.record.quickMenuTriggers.map(function (x) { return typeof x === 'string' ? x : triggerKey(x); }).filter(Boolean);
        } else if (customTriggers.length > 0) {
          quickMenuTriggers = customTriggers.map(function (t) { return triggerKey(t); }).filter(Boolean);
          persistTriggersState();
        } else {
          quickMenuTriggers = [];
        }
        sanitizeQuickMenuTriggers();
        rebuildTriggerSelect();
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
    rebuildTriggerSelect();
  }

  function rebuildTriggerSelect() {
    if (!dom.triggerType) return;
    sanitizeQuickMenuTriggers();
    var prev = (dom.triggerType.value || '').trim();
    var dl = document.getElementById('etQuickTriggerList');
    if (dl) {
      dl.innerHTML = '';
      var seen = new Set();
      function addDatalistOption(val) {
        if (!val || seen.has(val)) return;
        seen.add(val);
        var opt = document.createElement('option');
        opt.value = val;
        dl.appendChild(opt);
      }
      Object.keys(triggerTemplates)
        .filter(function (k) {
          return typeof triggerTemplates[k] === 'object' && triggerTemplates[k].payload;
        })
        .sort()
        .forEach(addDatalistOption);
      quickMenuTriggers.slice().sort().forEach(addDatalistOption);
    }
    if (prev) dom.triggerType.value = prev;
    updateTriggerDesc();
    updateRemoveBtn();
    populateMyTriggersPanel();
    populateSchemaTypesPanel();
  }

  function updateRemoveBtn() {
    if (!dom.removeTriggerBtn) return;
    var key = (dom.triggerType.value || '').trim();
    var isCustom = isInCustomLibrary(key);
    dom.removeTriggerBtn.hidden = !isCustom;
  }

  function populateMyTriggersPanel() {
    if (!dom.myTriggersList) return;
    dom.myTriggersList.innerHTML = '';

    var keys = customTriggers.map(function (t) { return triggerKey(t); }).filter(Boolean);
    keys.sort();

    if (dom.myTriggersCount) {
      dom.myTriggersCount.textContent = keys.length > 0 ? '(' + keys.length + ' saved)' : '';
    }

    if (keys.length === 0) {
      dom.myTriggersList.innerHTML = '<p class="field-hint">No saved triggers yet — use <strong>+ Add</strong> under Schema event types or <strong>Add to my triggers</strong> above.</p>';
      return;
    }

    keys.forEach(function (eventType) {
      var inMenu = quickMenuTriggers.indexOf(eventType) >= 0;

      var row = document.createElement('div');
      row.className = 'et-schema-type-row';

      var name = document.createElement('span');
      name.className = 'et-schema-type-name';
      name.textContent = eventType;
      row.appendChild(name);

      var badge = document.createElement('span');
      badge.className = 'et-my-triggers-badge';
      badge.textContent = inMenu ? 'In dropdown' : 'Not in dropdown';
      row.appendChild(badge);

      if (inMenu) {
        var rmMenu = document.createElement('button');
        rmMenu.type = 'button';
        rmMenu.className = 'et-schema-type-add et-my-triggers-btn--ghost';
        rmMenu.textContent = 'Remove from dropdown';
        rmMenu.title = 'Hide from type-ahead; keeps saved trigger';
        rmMenu.addEventListener('click', function () { removeFromQuickMenuOnly(eventType); });
        row.appendChild(rmMenu);
      } else {
        var addMenu = document.createElement('button');
        addMenu.type = 'button';
        addMenu.className = 'et-schema-type-add';
        addMenu.textContent = 'Add to dropdown';
        addMenu.title = 'Show in type-ahead shortcuts';
        addMenu.addEventListener('click', function () { addToQuickMenuOnly(eventType); });
        row.appendChild(addMenu);
      }

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'et-my-triggers-delete';
      del.textContent = 'Delete saved';
      del.title = 'Remove from My triggers and from Firebase';
      del.addEventListener('click', function () { removeCustomTrigger(eventType); });
      row.appendChild(del);

      dom.myTriggersList.appendChild(row);
    });
  }

  function addToQuickMenuOnly(eventType) {
    if (!eventType || quickMenuTriggers.indexOf(eventType) >= 0) return;
    if (!isInCustomLibrary(eventType) && !isTemplatePayloadKey(eventType)) return;
    quickMenuTriggers.push(eventType);
    sanitizeQuickMenuTriggers();
    rebuildTriggerSelect();
    persistTriggersState();
  }

  function removeFromQuickMenuOnly(eventType) {
    quickMenuTriggers = quickMenuTriggers.filter(function (k) { return k !== eventType; });
    sanitizeQuickMenuTriggers();
    rebuildTriggerSelect();
    saveConfigField({ quickMenuTriggers: quickMenuTriggers });
  }

  function populateSchemaTypesPanel() {
    if (!dom.schemaTypesList) return;
    dom.schemaTypesList.innerHTML = '';

    var inSelect = new Set();
    Object.keys(triggerTemplates).forEach(function (k) { inSelect.add(k); });
    customTriggers.forEach(function (t) { inSelect.add(triggerKey(t)); });

    var available = schemaEventTypes.filter(function (et) { return !inSelect.has(et.value); });

    if (dom.schemaTypesCount) {
      dom.schemaTypesCount.textContent = schemaEventTypes.length > 0
        ? '(' + available.length + ' available of ' + schemaEventTypes.length + ')'
        : '';
    }

    if (schemaEventTypes.length === 0) {
      dom.schemaTypesList.innerHTML = '<p class="field-hint">No schema event types loaded yet. Save a schema name in Configuration and fetch config.</p>';
      return;
    }
    if (available.length === 0) {
      dom.schemaTypesList.innerHTML = '<p class="field-hint">All schema event types have been added to your triggers.</p>';
      return;
    }

    available.forEach(function (et) {
      var row = document.createElement('div');
      row.className = 'et-schema-type-row';

      var name = document.createElement('span');
      name.className = 'et-schema-type-name';
      name.textContent = et.value;
      row.appendChild(name);

      if (et.label && et.label !== et.value) {
        var lbl = document.createElement('span');
        lbl.className = 'et-schema-type-label';
        lbl.textContent = et.label;
        row.appendChild(lbl);
      }

      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'et-schema-type-add';
      addBtn.textContent = '+ Add';
      addBtn.addEventListener('click', function () { addCustomTrigger(et.value); });
      row.appendChild(addBtn);

      dom.schemaTypesList.appendChild(row);
    });
  }

  function addCustomTrigger(eventType) {
    if (!eventType) return;
    if (!customTriggers.some(function (t) { return triggerKey(t) === eventType; })) {
      customTriggers.push(eventType);
    }
    if (quickMenuTriggers.indexOf(eventType) < 0) {
      quickMenuTriggers.push(eventType);
    }
    sanitizeQuickMenuTriggers();
    rebuildTriggerSelect();
    dom.triggerType.value = eventType;
    updateTriggerDesc();
    updateRemoveBtn();
    persistTriggersState();
  }

  function removeCustomTrigger(eventType) {
    customTriggers = customTriggers.filter(function (t) { return triggerKey(t) !== eventType; });
    quickMenuTriggers = quickMenuTriggers.filter(function (k) { return k !== eventType; });
    sanitizeQuickMenuTriggers();
    rebuildTriggerSelect();
    persistTriggersState();
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
        customTriggers = Array.isArray(r.customTriggers) ? r.customTriggers : [];
        if (Array.isArray(r.quickMenuTriggers)) {
          quickMenuTriggers = r.quickMenuTriggers.map(function (x) { return typeof x === 'string' ? x : triggerKey(x); }).filter(Boolean);
        } else if (customTriggers.length > 0) {
          quickMenuTriggers = customTriggers.map(function (t) { return triggerKey(t); }).filter(Boolean);
          persistTriggersState();
        } else {
          quickMenuTriggers = [];
        }
        sanitizeQuickMenuTriggers();
        rebuildTriggerSelect();
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
      if (typeof addRecentIdentifier === 'function') {
        addRecentIdentifier(id, ns);
      } else if (typeof addEmail === 'function') {
        addEmail(id);
      }

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
    rebuildTriggerSelect();
  }

  function updateTriggerDesc() {
    const key = (dom.triggerType.value || '').trim();
    const tpl = triggerTemplates[key];
    if (tpl) {
      dom.triggerDesc.textContent = tpl.description || '';
    } else if (key) {
      const et = schemaEventTypes.find(function (e) { return e.value === key; });
      dom.triggerDesc.textContent = et && et.label && et.label !== et.value ? et.label : 'Sends a generic XDM event with this eventType.';
    } else {
      dom.triggerDesc.textContent = '';
    }
    updateRemoveBtn();
  }

  if (dom.triggerType) {
    dom.triggerType.addEventListener('change', updateTriggerDesc);
    dom.triggerType.addEventListener('input', updateTriggerDesc);
  }

  if (dom.addTriggerBtn) {
    dom.addTriggerBtn.addEventListener('click', function () {
      var raw = (dom.triggerType.value || '').trim();
      if (!raw) {
        setMsg(dom.sendMsg, 'Enter an event type in the field first.', 'error');
        return;
      }
      if (isInCustomLibrary(raw)) {
        if (quickMenuTriggers.indexOf(raw) < 0) {
          addToQuickMenuOnly(raw);
          setMsg(dom.sendMsg, 'Added to dropdown shortcuts.', 'success');
        } else {
          setMsg(dom.sendMsg, 'Already saved and listed in the dropdown.', '');
        }
        return;
      }
      addCustomTrigger(raw);
      setMsg(dom.sendMsg, 'Saved to My triggers and added to dropdown (Firebase).', 'success');
    });
  }

  if (dom.removeTriggerBtn) {
    dom.removeTriggerBtn.addEventListener('click', function () {
      var key = (dom.triggerType.value || '').trim();
      if (!key) return;
      removeCustomTrigger(key);
    });
  }

  /** After a successful Edge send, persist non-template event types to My triggers for next time. */
  function persistQuickTriggerIfNeededAfterSend() {
    var key = (dom.triggerType.value || '').trim();
    if (!key) return;
    var tpl = triggerTemplates[key];
    if (tpl && tpl.payload) return;
    if (isInCustomLibrary(key)) {
      if (quickMenuTriggers.indexOf(key) < 0) {
        addToQuickMenuOnly(key);
      }
      return;
    }
    addCustomTrigger(key);
  }

  /* ═══════════ Build request body ═══════════ */

  function buildRequestBody() {
    const dsId = (dom.dsInput.value || '').trim();
    if (!dsId) return { error: 'Set a Datastream ID in Configuration first.' };
    const email = resolvedEmail || (dom.identifier.value || '').trim();
    if (!email) return { error: 'Enter an identifier first.' };

    const body = { datastreamId: dsId, email };
    if (resolvedEcid && resolvedEcid !== '—' && /^\d+$/.test(resolvedEcid) && resolvedEcid.length >= 10) {
      body.ecid = resolvedEcid;
    }

    if (activeMode === 'trigger') {
      const key = (dom.triggerType.value || '').trim();
      if (!key) return { error: 'Enter or select an event type.' };
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
    return { body };
  }

  function buildPreviewXdm(body) {
    var now = new Date().toISOString();
    var _id = String(Date.now());
    var eventType = body.eventType || 'transaction';
    var email = body.email || '';
    var ecid = body.ecid || '';

    if (body.triggerTemplate) {
      var tpl = JSON.parse(JSON.stringify(body.triggerTemplate));
      var replacements = { ecid: ecid, email: email, _id: 'trigger-' + Date.now(), timestamp: now, eventType: eventType };
      (function replace(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) { obj.forEach(function (v, i) { obj[i] = replace(v); }); return obj; }
        for (var k of Object.keys(obj)) {
          if (typeof obj[k] === 'string') {
            for (var rk in replacements) { obj[k] = obj[k].replace(new RegExp('\\{\\{' + rk + '\\}\\}', 'g'), String(replacements[rk])); }
          } else if (typeof obj[k] === 'object') { replace(obj[k]); }
        }
        return obj;
      })(tpl);
      if (tpl.event && tpl.event.xdm) {
        tpl.event.xdm.identityMap = {};
        if (ecid) tpl.event.xdm.identityMap.ECID = [{ id: ecid, primary: true }];
        if (email) tpl.event.xdm.identityMap.Email = [{ id: email, primary: !ecid }];
      }
      return { endpoint: 'POST https://server.adobedc.net/ee/v2/interact?dataStreamId=' + body.datastreamId, payload: tpl };
    }

    var identityMap = {};
    if (ecid) identityMap.ECID = [{ id: ecid, primary: true }];
    if (email) identityMap.Email = [{ id: email, primary: !ecid }];

    var xdm = {
      identityMap: identityMap,
      _id: _id,
      eventType: eventType,
      timestamp: now,
      _experience: { campaign: { orchestration: { eventID: body.eventID || '' } } },
    };
    if (body.viewName || body.viewUrl) {
      xdm.web = { webPageDetails: { URL: body.viewUrl || '', name: body.viewName || '', viewName: body.viewName || '' } };
    }

    return {
      endpoint: 'POST https://server.adobedc.net/ee/v2/interact?dataStreamId=' + body.datastreamId,
      payload: { event: { xdm: xdm } },
    };
  }

  /* ═══════════ Preview payload ═══════════ */

  function setPreviewMinimized(min) {
    if (!dom.previewPanel) return;
    dom.previewPanel.classList.toggle('consent-preview-panel--minimized', min);
    if (dom.previewHeader) dom.previewHeader.setAttribute('aria-expanded', String(!min));
    if (dom.previewMinBtn) {
      dom.previewMinBtn.textContent = min ? 'Expand' : 'Minimize';
      dom.previewMinBtn.title = min ? 'Expand payload preview' : 'Collapse payload preview';
    }
    if (dom.previewTitle) dom.previewTitle.textContent = min ? 'Edge payload preview (collapsed)' : 'Edge payload preview';
    if (dom.previewMeta) {
      dom.previewMeta.setAttribute('aria-hidden', min ? 'false' : 'true');
      if (min) {
        var json = (dom.previewPre && dom.previewPre.textContent) || '';
        var bytes = json.length;
        try { bytes = new TextEncoder().encode(json).length; } catch {}
        dom.previewMeta.textContent = (bytes / 1024).toFixed(1) + ' KB';
      } else {
        dom.previewMeta.textContent = '';
      }
    }
  }

  function togglePreview() {
    if (!dom.previewPanel || dom.previewPanel.hidden) return;
    setPreviewMinimized(!dom.previewPanel.classList.contains('consent-preview-panel--minimized'));
  }

  if (dom.previewHeader) {
    dom.previewHeader.addEventListener('click', function (e) { if (!e.target.closest('#etPreviewMinBtn')) togglePreview(); });
    dom.previewHeader.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('#etPreviewMinBtn')) return;
      e.preventDefault();
      togglePreview();
    });
  }
  if (dom.previewMinBtn) dom.previewMinBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePreview(); });

  dom.previewBtn.addEventListener('click', function () {
    var result = buildRequestBody();
    if (result.error) { setMsg(dom.sendMsg, result.error, 'error'); return; }
    var preview = buildPreviewXdm(result.body);
    if (dom.previewPanel && dom.previewNote && dom.previewPre) {
      dom.previewPanel.hidden = false;
      setPreviewMinimized(false);
      dom.previewNote.textContent = preview.endpoint;
      dom.previewPre.textContent = JSON.stringify(preview.payload, null, 2);
    }
    setMsg(dom.sendMsg, 'Payload preview loaded below — this is what will be sent to the Edge Network.', 'success');
  });

  /* ═══════════ Send event ═══════════ */

  dom.sendBtn.addEventListener('click', async () => {
    var result = buildRequestBody();
    if (result.error) { setMsg(dom.sendMsg, result.error, 'error'); return; }
    var body = result.body;

    dom.sendBtn.disabled = true;
    setMsg(dom.sendMsg, 'Sending…', '');

    try {
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
        if (activeMode === 'trigger') persistQuickTriggerIfNeededAfterSend();
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
    customTriggers = [];
    quickMenuTriggers = [];
    schemaEventTypes = [];
    dom.dsInput.value = '';
    if (dom.triggerType) dom.triggerType.value = '';
    dom.profileInfo.hidden = true;
    setMsg(dom.profileMsg, '', '');
    setMsg(dom.connectionMsg, '', '');
    setMsg(dom.schemaMsg, '', '');
    setMsg(dom.datasetMsg, '', '');
    setMsg(dom.infraMsg, '', '');
    setMsg(dom.sendMsg, '', '');
    if (dom.configBadge) dom.configBadge.hidden = true;
    rebuildTriggerSelect();
    loadSavedConfig();
  }

  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.onChange === 'function') {
    window.AepGlobalSandbox.onChange(onSandboxChange);
  }

  /* ═══════════ Init ═══════════ */

  async function init() {
    await initSandboxSelect();
    loadTriggerTemplates();
    loadSavedConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
