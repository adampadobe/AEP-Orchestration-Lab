/**
 * Event Tool — unified Edge event sender.
 * Sandbox selector shown inline, identity query first,
 * two-step config (setupEventInfra → datastream ID + save).
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
    schemaId:         document.getElementById('etSchemaId'),
    datasetName:      document.getElementById('etDatasetName'),
    dsInput:          document.getElementById('etManualDs'),
    saveConfigBtn:    document.getElementById('etSaveConfigBtn'),
    connectionMsg:    document.getElementById('etConnectionMsg'),
    fetchConfigBtn:   document.getElementById('etFetchConfigBtn'),
    setupInfraBtn:    document.getElementById('etSetupInfraBtn'),
    checkInfraBtn:    document.getElementById('etCheckInfraBtn'),
    infraProgressList: document.getElementById('etInfraProgressList'),
    infraMsg:         document.getElementById('etInfraMsg'),
    enableProfileBtn: document.getElementById('etEnableProfileBtn'),
    enableProfileProgressList: document.getElementById('etEnableProfileProgressList'),

    triggerMode:      document.getElementById('etTriggerMode'),
    industryMode:     document.getElementById('etIndustryMode'),
    industrySelect:   document.getElementById('etIndustrySelect'),
    scenarioSelect:   document.getElementById('etScenarioSelect'),
    industryDesc:     document.getElementById('etIndustryDesc'),
    indEventType:     document.getElementById('etIndEventType'),
    indViewName:      document.getElementById('etIndViewName'),
    indViewUrl:       document.getElementById('etIndViewUrl'),
    indOrchId:        document.getElementById('etIndOrchId'),
    industryFieldsWrap: document.getElementById('etIndustryFieldsWrap'),
    industryFields:   document.getElementById('etIndustryFields'),
    attachIndustryFgBtn: document.getElementById('etAttachIndustryFgBtn'),
    industrySchemaMsg: document.getElementById('etIndustrySchemaMsg'),
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
    previewJson:      document.getElementById('etPreviewJson'),
    previewBeautifyBtn: document.getElementById('etPreviewBeautifyBtn'),
    previewEditHint:  document.getElementById('etPreviewEditHint'),
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
  let previewPayloadDirty = false;

  var previewJsonOpts = { fixedScroll: true };

  /** Default event schema title — mirrors profile-gen `AEP Lab - … - Schema` naming. */
  const DEFAULT_EVENT_SCHEMA_TITLE = 'AEP Lab - Event Generic - Schema';
  const CHANNEL_STORAGE_KEY = 'aepEventToolChannel';
  const DEFAULT_CHANNEL = 'web';
  /** True once the operator edits dataset name away from auto-derived value. */
  let datasetNameTouched = false;
  /** Guard: programmatic dataset writes must not flip datasetNameTouched. */
  let syncingDatasetName = false;

  function deriveDatasetName(schemaTitle) {
    return String(schemaTitle || '').replace(/\bSchema\b/i, 'Dataset');
  }

  function ensureDefaultSchemaTitle() {
    if (!dom.schemaTitle) return;
    if (!(dom.schemaTitle.value || '').trim()) {
      dom.schemaTitle.value = DEFAULT_EVENT_SCHEMA_TITLE;
    }
  }

  function syncDatasetFromSchema(force) {
    if (!dom.schemaTitle || !dom.datasetName) return;
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    if (!schemaTitle) return;
    const derived = deriveDatasetName(schemaTitle);
    const current = (dom.datasetName.value || '').trim();
    if (force || !datasetNameTouched || !current) {
      syncingDatasetName = true;
      dom.datasetName.value = derived;
      syncingDatasetName = false;
    }
  }

  function applyLoadedDatasetName(schemaTitle, datasetName) {
    if (!dom.datasetName) return;
    const schema = String(schemaTitle || '').trim();
    const saved = String(datasetName || '').trim();
    if (saved) {
      syncingDatasetName = true;
      dom.datasetName.value = saved;
      syncingDatasetName = false;
      datasetNameTouched = saved !== deriveDatasetName(schema);
    } else {
      datasetNameTouched = false;
      syncDatasetFromSchema(true);
    }
  }

  function getSelectedChannel() {
    if (!dom.channel) return DEFAULT_CHANNEL;
    const ch = (dom.channel.value || '').trim();
    return ch || DEFAULT_CHANNEL;
  }

  function resolveIdentityNamespace() {
    if (typeof AepIdentityPicker !== 'undefined') {
      return AepIdentityPicker.getNamespace('etIdentifier');
    }
    return (dom.namespace && dom.namespace.value) || 'email';
  }

  function namespaceIsEcid(ns) {
    var s = String(ns || '').trim().toLowerCase();
    return s === 'ecid' || s === 'experiencecloudid';
  }

  function isValidEdgeEcid(val) {
    var s = String(val || '').trim();
    return s && s !== '—' && /^\d{10,}$/.test(s);
  }

  /** Resolve email and/or ECID for Edge send — either alone is valid. */
  function resolveSendIdentity() {
    var identifier = (dom.identifier.value || '').trim();
    var ns = resolveIdentityNamespace();
    var email = resolvedEmail ? String(resolvedEmail).trim() : '';
    var ecid = isValidEdgeEcid(resolvedEcid) ? String(resolvedEcid).trim() : '';

    if (email && isValidEdgeEcid(email) && !ecid && namespaceIsEcid(ns)) {
      ecid = email;
      email = '';
    }

    if (!email && !ecid && identifier) {
      if (namespaceIsEcid(ns) && isValidEdgeEcid(identifier)) {
        ecid = identifier;
      } else if (identifier.indexOf('@') >= 0 || String(ns).toLowerCase() === 'email') {
        email = identifier;
      } else if (isValidEdgeEcid(identifier)) {
        ecid = identifier;
      } else {
        email = identifier;
      }
    }

    return { email: email, ecid: ecid };
  }

  function applyResolvedIdentityFromProfile(id, ns, data) {
    var emailVal = (data && data.email) ? String(data.email).trim() : '';
    var ecidVal = '';
    if (data && data.ecid != null) {
      ecidVal = Array.isArray(data.ecid) ? String(data.ecid[0] || '').trim() : String(data.ecid).trim();
    }
    if (!isValidEdgeEcid(ecidVal) && namespaceIsEcid(ns) && isValidEdgeEcid(id)) {
      ecidVal = id;
    }
    if (!emailVal && !namespaceIsEcid(ns) && (String(ns).toLowerCase() === 'email' || id.indexOf('@') >= 0)) {
      emailVal = id;
    }
    resolvedEmail = emailVal;
    resolvedEcid = isValidEdgeEcid(ecidVal) ? ecidVal : '';
  }

  function persistChannelSelection() {
    try {
      sessionStorage.setItem(CHANNEL_STORAGE_KEY, getSelectedChannel());
    } catch { /* ignore */ }
  }

  function restoreChannelSelection() {
    if (!dom.channel) return;
    try {
      const saved = sessionStorage.getItem(CHANNEL_STORAGE_KEY);
      if (saved && dom.channel.querySelector('option[value="' + saved.replace(/"/g, '') + '"]')) {
        dom.channel.value = saved;
      } else {
        dom.channel.value = DEFAULT_CHANNEL;
      }
    } catch {
      dom.channel.value = DEFAULT_CHANNEL;
    }
  }

  function bindSchemaDatasetNameSync() {
    if (dom.schemaTitle) {
      dom.schemaTitle.addEventListener('input', function () {
        syncDatasetFromSchema(false);
      });
    }
    if (dom.datasetName) {
      dom.datasetName.addEventListener('input', function () {
        if (syncingDatasetName) return;
        datasetNameTouched = true;
      });
    }
  }

  if (dom.channel) {
    dom.channel.addEventListener('change', persistChannelSelection);
  }

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

  async function labAuthFetch(url, options) {
    options = options || {};
    const extra =
      typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.getAuthHeaders
        ? await AepLabSandboxSync.getAuthHeaders()
        : {};
    return fetch(url, {
      ...options,
      headers: { ...extra, ...(options.headers || {}) },
    });
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

  function formatInfraStepError(data) {
    const parts = [];
    if (data && data.error) parts.push(String(data.error));
    if (Array.isArray(data && data.platformErrors) && data.platformErrors.length) {
      for (const pe of data.platformErrors) {
        if (!pe || !pe.message) continue;
        parts.push(pe.title ? `${pe.title}: ${pe.message}` : pe.message);
      }
    }
    if (Array.isArray(data && data.warnings) && data.warnings.length) {
      for (const w of data.warnings) {
        if (w) parts.push(String(w));
      }
    }
    return parts.filter(Boolean).join(' ') || 'Failed.';
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
      const res = await labAuthFetch('/api/events/config' + qs);
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.record) {
        if (data.record.datastreamId) dom.dsInput.value = data.record.datastreamId;
        if (data.record.schemaTitle) dom.schemaTitle.value = data.record.schemaTitle;
        else ensureDefaultSchemaTitle();
        if (dom.schemaId && data.record.schemaId) dom.schemaId.value = data.record.schemaId;
        applyLoadedDatasetName(
          data.record.schemaTitle || dom.schemaTitle.value,
          data.record.datasetName
        );
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
        if (data.record.schemaTitle || data.record.schemaId) {
          loadSchemaEventTypes(data.record.schemaTitle, data.record.schemaId);
        }
      } else {
        expandConfig();
        datasetNameTouched = false;
        ensureDefaultSchemaTitle();
        syncDatasetFromSchema(true);
        setMsg(dom.infraMsg, 'No configuration found for this sandbox. Complete the steps below to get started.', '');
      }
    } catch {
      expandConfig();
      ensureDefaultSchemaTitle();
      syncDatasetFromSchema(true);
      setMsg(dom.infraMsg, '', '');
    }
  }

  async function saveConfigField(patch) {
    const sandbox = getSandboxName();
    if (!sandbox) return;
    try {
      await labAuthFetch('/api/events/config', {
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

  async function loadSchemaEventTypes(schemaTitle, schemaId) {
    const t = (schemaTitle || '').trim();
    const id = (schemaId || '').trim();
    if (!t && !id) return;
    const qs = sandboxQs();
    if (!qs) return;
    try {
      let url = '/api/events/infra/event-types' + qs;
      if (id) url += '&schemaId=' + encodeURIComponent(id);
      else url += '&schemaTitle=' + encodeURIComponent(t);
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.eventTypes) && data.eventTypes.length > 0) {
        schemaEventTypes = data.eventTypes;
      } else {
        schemaEventTypes = [];
      }
    } catch (e) {
      schemaEventTypes = [];
    }
    populateEventTypeDatalist();
  }

  function populateEventTypeDatalist() {
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

  /* ═══════════ Combined setup (schema + field groups + dataset) ═══════════ */

  const COMBINED_EVENT_INFRA_STEPS = [
    { step: 'ensureFieldGroups', label: 'Field groups' },
    { step: 'createSchema', label: 'Schema' },
    { step: 'attachRecommendedFieldGroups', label: 'Attach field groups' },
    { step: 'createDataset', label: 'Dataset' },
  ];

  function ensureEventInfraProgressList() {
    if (!dom.infraProgressList) return null;
    dom.infraProgressList.hidden = false;
    dom.infraProgressList.innerHTML = '';
    COMBINED_EVENT_INFRA_STEPS.forEach(function (s, i) {
      const li = document.createElement('li');
      li.className = 'consent-infra-progress__item consent-infra-progress__item--pending';
      li.dataset.step = s.step;
      const icon = document.createElement('span');
      icon.className = 'consent-infra-progress__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '·';
      const label = document.createElement('span');
      label.className = 'consent-infra-progress__label';
      label.textContent = (i + 1) + '. ' + s.label;
      const detail = document.createElement('span');
      detail.className = 'consent-infra-progress__detail';
      detail.textContent = '';
      li.append(icon, label, detail);
      dom.infraProgressList.appendChild(li);
    });
    return dom.infraProgressList;
  }

  function setEventInfraProgressItem(step, state, detailText) {
    if (!dom.infraProgressList) return;
    const li = dom.infraProgressList.querySelector('[data-step="' + step + '"]');
    if (!li) return;
    li.className = 'consent-infra-progress__item consent-infra-progress__item--' + state;
    const icon = li.querySelector('.consent-infra-progress__icon');
    const detail = li.querySelector('.consent-infra-progress__detail');
    if (icon) {
      icon.textContent = state === 'success' ? '✓' : state === 'error' ? '✗' : state === 'working' ? '…' : '·';
    }
    if (detail) detail.textContent = detailText ? ' — ' + detailText : '';
  }

  function applySetupEventInfraResult(data) {
    if (data.schemaId && dom.schemaId) dom.schemaId.value = data.schemaId;
    if (data.schemaTitle && dom.schemaTitle) dom.schemaTitle.value = data.schemaTitle;
    if (data.datasetName && dom.datasetName) {
      syncingDatasetName = true;
      dom.datasetName.value = data.datasetName;
      syncingDatasetName = false;
    }
    saveConfigField({
      schemaTitle: data.schemaTitle || (dom.schemaTitle && dom.schemaTitle.value) || undefined,
      schemaId: data.schemaId || undefined,
      datasetName: data.datasetName || (dom.datasetName && dom.datasetName.value) || undefined,
    });
    loadSchemaEventTypes(data.schemaTitle || dom.schemaTitle.value, data.schemaId);
  }

  async function runSetupEventInfra() {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    const datasetName = (dom.datasetName.value || '').trim();
    if (!schemaTitle) { setMsg(dom.infraMsg, 'Enter a schema name.', 'error'); return; }
    if (!datasetName) { setMsg(dom.infraMsg, 'Enter a dataset name.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.infraMsg, 'Select a sandbox first.', 'error'); return; }

    const busy = [dom.setupInfraBtn, dom.checkInfraBtn].filter(Boolean);
    busy.forEach(function (b) { b.disabled = true; });
    ensureEventInfraProgressList();
    setMsg(dom.infraMsg, 'Setting up schema, field groups and dataset…', '');

    COMBINED_EVENT_INFRA_STEPS.forEach(function (s) {
      setEventInfraProgressItem(s.step, 'working', 'working…');
    });

    try {
      const res = await fetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'setupEventInfra', schemaTitle, datasetName }),
      });
      const data = await res.json().catch(function () { return {}; });

      if (Array.isArray(data.subSteps)) {
        data.subSteps.forEach(function (sub) {
          if (!sub || !sub.step) return;
          if (sub.ok === false) {
            setEventInfraProgressItem(sub.step, 'error', formatInfraStepError(sub));
          } else if (sub.skipped) {
            setEventInfraProgressItem(sub.step, 'success', 'already configured');
          } else {
            setEventInfraProgressItem(sub.step, 'success', 'done');
          }
        });
      }

      if (!res.ok || data.ok === false) {
        setMsg(dom.infraMsg, formatInfraStepError(data), 'error');
        return;
      }

      applySetupEventInfraResult(data);
      setMsg(dom.infraMsg, data.message || 'Event infrastructure ready.', 'success');
    } catch (e) {
      setMsg(dom.infraMsg, e.message || 'Network error', 'error');
    } finally {
      busy.forEach(function (b) { b.disabled = false; });
    }
  }

  if (dom.setupInfraBtn) {
    dom.setupInfraBtn.addEventListener('click', runSetupEventInfra);
  }

  /* ═══════════ Enable schema + dataset for Profile (identityMap alternate primary) ═══════════ */

  const ENABLE_PROFILE_PROGRESS_STEPS = [
    { step: 'schemaUnion', label: 'Schema enabled for Profile (identityMap)' },
    { step: 'datasetProfile', label: 'Dataset enabled for Profile' },
  ];

  function ensureEnableProfileProgressList() {
    if (!dom.enableProfileProgressList) return null;
    dom.enableProfileProgressList.hidden = false;
    dom.enableProfileProgressList.innerHTML = '';
    ENABLE_PROFILE_PROGRESS_STEPS.forEach(function (s) {
      const li = document.createElement('li');
      li.className = 'consent-infra-progress__item consent-infra-progress__item--pending';
      li.dataset.step = s.step;
      const icon = document.createElement('span');
      icon.className = 'consent-infra-progress__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '·';
      const label = document.createElement('span');
      label.className = 'consent-infra-progress__label';
      label.textContent = s.label;
      const detail = document.createElement('span');
      detail.className = 'consent-infra-progress__detail';
      detail.textContent = '';
      li.append(icon, label, detail);
      dom.enableProfileProgressList.appendChild(li);
    });
    return dom.enableProfileProgressList;
  }

  function setEnableProfileProgressItem(step, state, detailText) {
    if (!dom.enableProfileProgressList) return;
    const li = dom.enableProfileProgressList.querySelector('[data-step="' + step + '"]');
    if (!li) return;
    li.className = 'consent-infra-progress__item consent-infra-progress__item--' + state;
    const icon = li.querySelector('.consent-infra-progress__icon');
    const detail = li.querySelector('.consent-infra-progress__detail');
    if (icon) {
      icon.textContent = state === 'success' ? '✓' : state === 'error' ? '✗' : state === 'working' ? '…' : '·';
    }
    if (detail) detail.textContent = detailText ? ' — ' + detailText : '';
  }

  function describeEnableSubResult(value, errorText) {
    if (value === 'enabled') return { state: 'success', text: 'enabled' };
    if (value === 'already-enabled') return { state: 'success', text: 'already enabled' };
    if (value === 'skipped') return { state: 'pending', text: 'skipped' };
    return { state: 'error', text: errorText || 'failed' };
  }

  async function runEnableSchemaAndDatasetForProfile() {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    const datasetName = (dom.datasetName.value || '').trim();
    const schemaId = dom.schemaId ? (dom.schemaId.value || '').trim() : '';
    if (!schemaTitle && !schemaId) {
      setMsg(dom.infraMsg, 'Enter a schema name or run Set up event infrastructure first.', 'error');
      return;
    }
    if (!datasetName) {
      setMsg(dom.infraMsg, 'Enter a dataset name.', 'error');
      return;
    }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.infraMsg, 'Select a sandbox first.', 'error'); return; }

    if (!dom.enableProfileBtn) return;
    dom.enableProfileBtn.disabled = true;
    ensureEnableProfileProgressList();
    setEnableProfileProgressItem('schemaUnion', 'working', 'working…');
    setEnableProfileProgressItem('datasetProfile', 'pending', '');
    setMsg(dom.infraMsg, 'Enabling ExperienceEvent schema (union + identityMap alternate primary), then dataset…', '');

    try {
      const body = {
        step: 'enableForProfile',
        schemaTitle: schemaTitle || undefined,
        schemaId: schemaId || undefined,
        datasetName,
      };
      const res = await fetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(function () { return {}; });

      const schemaSub = describeEnableSubResult(data.schemaUnion, data.schemaError || data.error);
      setEnableProfileProgressItem('schemaUnion', schemaSub.state, schemaSub.text);
      if (data.datasetProfile) {
        const dsSub = describeEnableSubResult(data.datasetProfile, data.datasetError);
        setEnableProfileProgressItem('datasetProfile', dsSub.state, dsSub.text);
      }

      if (!res.ok || data.ok === false) {
        setMsg(dom.infraMsg, data.message || data.error || formatInfraStepError(data), 'error');
        return;
      }

      if (data.schemaId && dom.schemaId) dom.schemaId.value = data.schemaId;
      setMsg(dom.infraMsg, data.message || 'Schema and dataset are Profile-enabled (identityMap alternate primary).', 'success');
    } catch (e) {
      setEnableProfileProgressItem('schemaUnion', 'error', e.message || 'Network error');
      setMsg(dom.infraMsg, e.message || 'Network error', 'error');
    } finally {
      dom.enableProfileBtn.disabled = false;
    }
  }

  if (dom.enableProfileBtn) {
    dom.enableProfileBtn.addEventListener('click', runEnableSchemaAndDatasetForProfile);
  }

  async function runAttachIndustryFieldGroups() {
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    const schemaId = dom.schemaId ? (dom.schemaId.value || '').trim() : '';
    if (!schemaTitle && !schemaId) {
      setMsg(dom.industrySchemaMsg, 'Enter a schema name or run Set up event infrastructure first.', 'error');
      return;
    }
    const sandbox = getSandboxName();
    if (!sandbox) {
      setMsg(dom.industrySchemaMsg, 'Select a sandbox first.', 'error');
      return;
    }
    if (!dom.attachIndustryFgBtn) return;
    dom.attachIndustryFgBtn.disabled = true;
    setMsg(dom.industrySchemaMsg, 'Attaching industry field groups to schema…', '');
    try {
      const res = await fetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'attachIndustryEventFieldGroups',
          schemaTitle: schemaTitle || undefined,
          schemaId: schemaId || undefined,
        }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) {
        setMsg(dom.industrySchemaMsg, data.message || data.error || formatInfraStepError(data), 'error');
        return;
      }
      if (data.schemaId && dom.schemaId) dom.schemaId.value = data.schemaId;
      var msg = data.message || 'Industry field groups attached.';
      if (Array.isArray(data.warnings) && data.warnings.length) {
        msg += ' ' + data.warnings.join(' ');
      }
      setMsg(dom.industrySchemaMsg, msg, 'success');
      loadSchemaEventTypes(schemaTitle || dom.schemaTitle.value, data.schemaId || schemaId);
    } catch (e) {
      setMsg(dom.industrySchemaMsg, e.message || 'Network error', 'error');
    } finally {
      dom.attachIndustryFgBtn.disabled = false;
    }
  }

  if (dom.attachIndustryFgBtn) {
    dom.attachIndustryFgBtn.addEventListener('click', runAttachIndustryFieldGroups);
  }

  /* ═══════════ Step 2 — Save Datastream ID ═══════════ */

  dom.saveConfigBtn.addEventListener('click', async () => {
    const dsId = (dom.dsInput.value || '').trim();
    if (!dsId) { setMsg(dom.connectionMsg, 'Paste a datastream ID.', 'error'); return; }
    const sandbox = getSandboxName();
    if (!sandbox) { setMsg(dom.connectionMsg, 'Select a sandbox first.', 'error'); return; }
    setMsg(dom.connectionMsg, 'Saving to Firebase…', '');
    const schemaTitle = (dom.schemaTitle.value || '').trim();
    const schemaId = dom.schemaId ? (dom.schemaId.value || '').trim() : '';
    const datasetName = (dom.datasetName.value || '').trim();
    try {
      const res = await labAuthFetch('/api/events/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox, datastreamId: dsId, schemaTitle, schemaId, datasetName }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMsg(dom.connectionMsg, 'Saved to Firebase for sandbox "' + sandbox + '".', 'success');
        setMsg(dom.infraMsg, 'Configuration loaded from Firebase.', 'success');
        collapseConfig();
        if (schemaTitle || schemaId) loadSchemaEventTypes(schemaTitle, schemaId);
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
      const res = await labAuthFetch('/api/events/config' + sandboxQs());
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.record) {
        const r = data.record;
        const parts = [];
        if (r.schemaTitle) { dom.schemaTitle.value = r.schemaTitle; parts.push('Schema: ' + r.schemaTitle); }
        else ensureDefaultSchemaTitle();
        if (dom.schemaId && r.schemaId) dom.schemaId.value = r.schemaId;
        applyLoadedDatasetName(r.schemaTitle || dom.schemaTitle.value, r.datasetName);
        if (r.datasetName) parts.push('Dataset: ' + r.datasetName);
        else if (dom.datasetName && dom.datasetName.value) parts.push('Dataset: ' + dom.datasetName.value);
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
          if (r.schemaTitle || r.schemaId) loadSchemaEventTypes(r.schemaTitle, r.schemaId);
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
        applyResolvedIdentityFromProfile(id, ns, data);
        dom.infoEmail.textContent = resolvedEmail || '—';
        dom.infoFirst.textContent = data.firstName || '—';
        dom.infoLast.textContent = data.lastName || '—';
        dom.infoEcid.textContent = resolvedEcid || '—';
        dom.profileInfo.hidden = false;
        setMsg(dom.profileMsg, 'Profile found.', 'success');
      } else {
        applyResolvedIdentityFromProfile(id, ns, null);
        dom.infoEmail.textContent = resolvedEmail || '—';
        dom.infoFirst.textContent = '—';
        dom.infoLast.textContent = '—';
        dom.infoEcid.textContent = resolvedEcid || '—';
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
      dom.industryMode.hidden = mode !== 'industry';
    });
  });

  /* ═══════════ Industry event mode ═══════════ */

  function getIndustryCatalog() {
    return typeof window.AepEventIndustryCatalog !== 'undefined' ? window.AepEventIndustryCatalog : null;
  }

  function getSelectedIndustryScenario() {
    var catalog = getIndustryCatalog();
    if (!catalog || !dom.industrySelect || !dom.scenarioSelect) return null;
    return catalog.getScenario(dom.industrySelect.value, dom.scenarioSelect.value);
  }

  function getIndustryFieldValues() {
    var values = {};
    if (!dom.industryFields) return values;
    dom.industryFields.querySelectorAll('[data-industry-field]').forEach(function (input) {
      var key = input.getAttribute('data-industry-field');
      if (!key) return;
      if (input.type === 'number') values[key] = input.value;
      else values[key] = (input.value || '').trim();
    });
    return values;
  }

  function renderIndustryFields(scenario) {
    if (!dom.industryFields || !dom.industryFieldsWrap) return;
    dom.industryFields.innerHTML = '';
    var fields = (scenario && scenario.fields) || [];
    if (!fields.length) {
      dom.industryFieldsWrap.hidden = true;
      return;
    }
    dom.industryFieldsWrap.hidden = false;
    fields.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'form-row et-industry-field-row';
      var label = document.createElement('label');
      label.setAttribute('for', 'etIndField_' + f.key);
      label.textContent = f.label || f.key;
      var input = document.createElement('input');
      input.id = 'etIndField_' + f.key;
      input.type = f.type === 'number' ? 'number' : 'text';
      input.setAttribute('data-industry-field', f.key);
      input.value = f.default == null ? '' : String(f.default);
      input.autocomplete = 'off';
      row.appendChild(label);
      row.appendChild(input);
      dom.industryFields.appendChild(row);
    });
  }

  function applyIndustryScenarioToForm(scenario) {
    if (!scenario) return;
    if (dom.indEventType) dom.indEventType.value = scenario.eventType || '';
    if (dom.indViewName) dom.indViewName.value = scenario.viewName || '';
    if (dom.indViewUrl) dom.indViewUrl.value = scenario.viewUrl || '';
    if (dom.industryDesc) dom.industryDesc.textContent = scenario.description || '';
    renderIndustryFields(scenario);
  }

  function renderIndustryScenarios(industryId) {
    var catalog = getIndustryCatalog();
    if (!catalog || !dom.scenarioSelect) return;
    dom.scenarioSelect.innerHTML = '';
    var scenarios = catalog.getScenarios(industryId);
    scenarios.forEach(function (sc) {
      var opt = document.createElement('option');
      opt.value = sc.id;
      opt.textContent = sc.label;
      dom.scenarioSelect.appendChild(opt);
    });
    applyIndustryScenarioToForm(catalog.getScenario(industryId, dom.scenarioSelect.value));
  }

  function initIndustryMode() {
    var catalog = getIndustryCatalog();
    if (!catalog || !dom.industrySelect) return;
    dom.industrySelect.innerHTML = '';
    catalog.getIndustries().forEach(function (ind) {
      var opt = document.createElement('option');
      opt.value = ind.id;
      opt.textContent = ind.label;
      dom.industrySelect.appendChild(opt);
    });
    renderIndustryScenarios(dom.industrySelect.value);
  }

  if (dom.industrySelect) {
    dom.industrySelect.addEventListener('change', function () {
      renderIndustryScenarios(dom.industrySelect.value);
    });
  }
  if (dom.scenarioSelect) {
    dom.scenarioSelect.addEventListener('change', function () {
      applyIndustryScenarioToForm(getSelectedIndustryScenario());
    });
  }

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
    const identity = resolveSendIdentity();
    if (!identity.email && !identity.ecid) {
      return { error: 'Enter an identifier (email or ECID) first.' };
    }

    const body = { datastreamId: dsId, channel: getSelectedChannel(), xdmStyle: 'minimal' };
    if (identity.email) body.email = identity.email;
    if (identity.ecid) body.ecid = identity.ecid;

    if (activeMode === 'trigger') {
      const key = (dom.triggerType.value || '').trim();
      if (!key) return { error: 'Enter or select an event type.' };
      body.eventType = key;
    } else if (activeMode === 'industry') {
      var catalog = getIndustryCatalog();
      if (!catalog) return { error: 'Industry catalog not loaded.' };
      var scenario = getSelectedIndustryScenario();
      if (!scenario) return { error: 'Select an industry scenario.' };
      body.xdmStyle = 'full';
      body.eventType = (dom.indEventType && dom.indEventType.value || '').trim() || scenario.eventType;
      var vn = (dom.indViewName && dom.indViewName.value || '').trim() || scenario.viewName || '';
      var vu = (dom.indViewUrl && dom.indViewUrl.value || '').trim() || scenario.viewUrl || '';
      if (vn) body.viewName = vn;
      if (vu) body.viewUrl = vu;
      var orch = (dom.indOrchId && dom.indOrchId.value || '').trim();
      if (orch) body.eventID = orch;
      body.public = catalog.buildPublicPayload(scenario, getIndustryFieldValues());
    } else {
      body.eventType = 'transaction';
    }
    return { body };
  }

  function shouldUseRichPreview(body) {
    if (!body || typeof body !== 'object') return false;
    var style = String(body.xdmStyle || body.xdm_style || '').trim().toLowerCase();
    if (style === 'full') return true;
    if (style === 'minimal') return false;
    if (body.xdmTenantKey || body.xdm_tenant_key) return true;
    if (body.message && typeof body.message === 'object' && Object.keys(body.message).length) return true;
    if (body.public && typeof body.public === 'object' && Object.keys(body.public).length) return true;
    if (body.viewName && String(body.viewName).trim()) return true;
    if (body.viewUrl && String(body.viewUrl).trim()) return true;
    return false;
  }

  function normalizePreviewChannel(raw) {
    var chNorm = String(raw || '').trim().toLowerCase();
    if (!chNorm) return '';
    if (chNorm === 'mobile app' || chNorm === 'app') return 'mobile';
    if (chNorm === 'website') return 'web';
    if (chNorm === 'call center' || chNorm === 'call centre' || chNorm === 'cx') return 'callcentre';
    if (chNorm === 'point of sale') return 'pos';
    if (chNorm === 'travel agent') return 'agent';
    return chNorm;
  }

  function buildPreviewXdm(body) {
    var now = new Date().toISOString();
    var _id = String(Date.now());
    var eventType = body.eventType || 'transaction';
    var email = (body.email || '').trim();
    var ecid = body.ecid ? String(body.ecid).trim() : '';

    var ecidOk = isValidEdgeEcid(ecid);
    var identityMap = {};
    if (ecidOk) identityMap.ECID = [{ id: ecid, primary: true }];
    if (email) identityMap.Email = [{ id: email, primary: !ecidOk }];

    var xdm = {
      identityMap: identityMap,
      _id: _id,
      eventType: eventType,
      timestamp: now,
    };

    var chNorm = normalizePreviewChannel(body.channel);

    if (shouldUseRichPreview(body)) {
      var orchId = (body.eventID || body.orchestrationEventID || '').trim();
      if (orchId) {
        xdm._experience = { campaign: { orchestration: { eventID: orchId } } };
      }
      var tenantKey = (body.xdmTenantKey || body.xdm_tenant_key || '_demoemea').trim();
      var tenantNode = { identification: { core: { ecid: ecid || '', email: email || '' } } };
      if (body.public && typeof body.public === 'object') {
        tenantNode.public = JSON.parse(JSON.stringify(body.public));
      }
      if (chNorm) {
        tenantNode.interactionDetails = { core: { channel: chNorm } };
      }
      if (body.message && typeof body.message === 'object') {
        tenantNode.message = JSON.parse(JSON.stringify(body.message));
      }
      xdm[tenantKey] = tenantNode;
      if (tenantKey === '_demoemea') {
        try { xdm.demoemea = JSON.parse(JSON.stringify(tenantNode)); } catch (e) { xdm.demoemea = tenantNode; }
      }
      var vn = (body.viewName || '').trim();
      var vu = (body.viewUrl || '').trim();
      if (vn || vu) {
        xdm.web = { webPageDetails: { URL: vu, name: vn, viewName: vn } };
      }
    } else if (chNorm) {
      xdm.interactionDetails = { core: { channel: chNorm } };
    }

    return {
      endpoint: 'POST https://server.adobedc.net/ee/v2/interact?dataStreamId=' + body.datastreamId,
      payload: { event: { xdm: xdm } },
    };
  }

  /* ═══════════ Preview payload ═══════════ */

  function resetPreviewPanel() {
    if (dom.previewPanel) dom.previewPanel.hidden = true;
    if (dom.previewJson) {
      dom.previewJson.value = '';
      dom.previewJson.classList.remove('aep-json--invalid');
    }
    previewPayloadDirty = false;
  }

  function getPreviewJsonText() {
    return dom.previewJson ? String(dom.previewJson.value || '') : '';
  }

  function getEditedPreviewPayload() {
    var raw = getPreviewJsonText().trim();
    if (!raw) return { payload: null, error: null };
    if (typeof window.AepJsonEditor === 'undefined') {
      return { payload: null, error: 'JSON editor is not loaded.' };
    }
    try {
      var parsed = window.AepJsonEditor.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { payload: null, error: 'Payload must be a JSON object.' };
      }
      if (!parsed.event || typeof parsed.event !== 'object') {
        return { payload: null, error: 'Payload must include an "event" object (Edge interact shape).' };
      }
      return { payload: parsed, error: null };
    } catch (e) {
      return { payload: null, error: 'Invalid JSON — ' + (e.message || e) };
    }
  }

  function setPreviewJsonInvalid(invalid) {
    if (!dom.previewJson) return;
    dom.previewJson.classList.toggle('aep-json--invalid', !!invalid);
  }

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
        var json = getPreviewJsonText();
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

  if (dom.previewJson) {
    dom.previewJson.addEventListener('input', function () {
      previewPayloadDirty = true;
      setPreviewJsonInvalid(false);
    });
  }

  if (dom.previewBeautifyBtn && dom.previewJson) {
    dom.previewBeautifyBtn.addEventListener('click', function () {
      if (typeof window.AepJsonEditor === 'undefined') {
        setMsg(dom.sendMsg, 'JSON editor is not loaded.', 'error');
        return;
      }
      window.AepJsonEditor.beautify(dom.previewJson, function (err) {
        setMsg(dom.sendMsg, err, 'error');
        setPreviewJsonInvalid(true);
      }, previewJsonOpts);
      setPreviewJsonInvalid(false);
    });
  }

  dom.previewBtn.addEventListener('click', function () {
    var result = buildRequestBody();
    if (result.error) { setMsg(dom.sendMsg, result.error, 'error'); return; }
    var hadEdits = previewPayloadDirty && getPreviewJsonText().trim();
    var preview = buildPreviewXdm(result.body);
    if (dom.previewPanel && dom.previewNote && dom.previewJson) {
      dom.previewPanel.hidden = false;
      setPreviewMinimized(false);
      dom.previewNote.textContent = preview.endpoint;
      if (typeof window.AepJsonEditor !== 'undefined') {
        dom.previewJson.value = window.AepJsonEditor.format(preview.payload);
        window.AepJsonEditor.refresh(dom.previewJson, previewJsonOpts);
      } else {
        dom.previewJson.value = JSON.stringify(preview.payload, null, 2);
      }
      setPreviewJsonInvalid(false);
      previewPayloadDirty = false;
    }
    var msg = hadEdits
      ? 'Preview refreshed from form — previous edits were replaced.'
      : 'Payload preview loaded below — edit JSON, then Send event.';
    setMsg(dom.sendMsg, msg, 'success');
  });

  /* ═══════════ Send event ═══════════ */

  dom.sendBtn.addEventListener('click', async () => {
    var result = buildRequestBody();
    if (result.error) { setMsg(dom.sendMsg, result.error, 'error'); return; }
    var postBody = result.body;
    var useEditedPayload = dom.previewPanel && !dom.previewPanel.hidden && getPreviewJsonText().trim();
    if (useEditedPayload) {
      var edited = getEditedPreviewPayload();
      if (edited.error) {
        setMsg(dom.sendMsg, edited.error, 'error');
        setPreviewJsonInvalid(true);
        return;
      }
      postBody = Object.assign({}, result.body, { rawPayload: edited.payload });
    }
    setPreviewJsonInvalid(false);

    dom.sendBtn.disabled = true;
    setMsg(dom.sendMsg, 'Sending…', '');

    try {
      const res = await fetch('/api/events/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
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
    datasetNameTouched = false;
    dom.dsInput.value = '';
    if (dom.triggerType) dom.triggerType.value = '';
    dom.profileInfo.hidden = true;
    setMsg(dom.profileMsg, '', '');
    setMsg(dom.connectionMsg, '', '');
    setMsg(dom.infraMsg, '', '');
    setMsg(dom.industrySchemaMsg, '', '');
    setMsg(dom.sendMsg, '', '');
    resetPreviewPanel();
    if (dom.configBadge) dom.configBadge.hidden = true;
    rebuildTriggerSelect();
    loadSavedConfig();
  }

  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.onChange === 'function') {
    window.AepGlobalSandbox.onChange(onSandboxChange);
  }

  /* ═══════════ Init ═══════════ */

  async function init() {
    bindSchemaDatasetNameSync();
    restoreChannelSelection();
    if (dom.previewJson && typeof window.AepJsonEditor !== 'undefined') {
      window.AepJsonEditor.initTextarea(dom.previewJson, previewJsonOpts);
    }
    await initSandboxSelect();
    initIndustryMode();
    loadTriggerTemplates();
    if (window.__aepLabSyncReady) {
      try {
        await window.__aepLabSyncReady;
      } catch (e) {}
    }
    await loadSavedConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
