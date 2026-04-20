/**
 * Decision lab Edge — workflow: provision (schema/dataset), save config, load Launch URL from Firebase.
 * Placement fragments: dynamic rows → preview mounts (cd-edge-{key}).
 */
(function (global) {
  'use strict';

  /** Aligned with functions/decisionLabConfigStore.js sanitizePlacements (max 8). */
  var MAX_PLACEMENTS = 8;

  var DEFAULT_PLACEMENTS = [
    { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
    { key: 'hero', fragment: 'hero-banner', label: 'Hero banner' },
    { key: 'contentCard', fragment: 'ContentCardContainer', label: 'Content card' },
  ];

  var placementRowSeq = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function setMsg(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.className = 'status' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : '');
    node.hidden = !text;
  }

  function sandboxName() {
    return typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName
      ? String(AepGlobalSandbox.getSandboxName() || '').trim()
      : '';
  }

  function sandboxQs() {
    var n = sandboxName();
    return n ? '?sandbox=' + encodeURIComponent(n) : '';
  }

  async function labFetch(url, opts) {
    if (typeof CdLabConfigApi !== 'undefined' && CdLabConfigApi.labAuthFetch) {
      return CdLabConfigApi.labAuthFetch(url, opts || {});
    }
    return fetch(url, opts || {});
  }

  function sanitizeKey(raw) {
    return String(raw || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /** Ensure unique sanitized keys (server + DOM id safety). */
  function dedupePlacementKeys(rows) {
    var seen = {};
    return rows.map(function (r) {
      var base = sanitizeKey(r.key) || 'slot';
      var k = base;
      var n = 1;
      while (seen[k]) {
        k = base + '_' + n++;
      }
      seen[k] = true;
      return {
        key: k,
        fragment: String(r.fragment || '')
          .trim()
          .replace(/^#/, ''),
        label: String(r.label || r.key || '')
          .trim()
          .slice(0, 128),
      };
    });
  }

  function readRowsFromDom() {
    var list = el('cdLabPlacementsList');
    if (!list) return [];
    var rows = list.querySelectorAll('.cd-lab-placement-row');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var keyIn = row.querySelector('.cd-lab-placement-key');
      var fragIn = row.querySelector('.cd-lab-placement-fragment');
      var labIn = row.querySelector('.cd-lab-placement-label');
      out.push({
        key: keyIn ? keyIn.value : '',
        fragment: fragIn ? fragIn.value : '',
        label: labIn ? labIn.value : '',
      });
    }
    return out;
  }

  function getPlacementsFromForm() {
    var raw = readRowsFromDom();
    var normalized = raw
      .map(function (r) {
        return {
          key: r.key,
          fragment: String(r.fragment || '')
            .trim()
            .replace(/^#/, ''),
          label: String(r.label || '').trim(),
        };
      })
      .filter(function (r) {
        return r.fragment.length > 0;
      });
    if (!normalized.length) {
      normalized = DEFAULT_PLACEMENTS.slice();
    }
    return dedupePlacementKeys(normalized);
  }

  function validatePlacementKeysForSave() {
    var raw = readRowsFromDom();
    var keys = raw.map(function (r) {
      return sanitizeKey(r.key) || 'slot';
    });
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      if (seen[keys[i]]) {
        return { ok: false, msg: 'Duplicate placement key after sanitizing: ' + keys[i] + '. Edit keys so each is unique.' };
      }
      seen[keys[i]] = true;
    }
    return { ok: true };
  }

  function rebuildPreviewMounts() {
    var wrap = el('cdEdgeMounts');
    if (!wrap) return;
    var placements = getPlacementsFromForm();
    wrap.textContent = '';
    var i;
    for (i = 0; i < placements.length; i++) {
      var p = placements[i];
      var key = p.key;
      var fragment = p.fragment || '';
      var lab = p.label || key;
      var outer = document.createElement('div');
      outer.className = 'cd-edge-mount';
      var labEl = document.createElement('span');
      labEl.className = 'cd-edge-mount-label';
      labEl.id = 'cdMountLabel-' + key;
      labEl.textContent = lab + (fragment ? ' — #' + fragment : '');
      var body = document.createElement('div');
      body.id = 'cd-edge-' + key;
      body.className = 'cd-edge-mount-body';
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', lab);
      var lk = String(key).toLowerCase();
      if (lk === 'hero') {
        body.classList.add('cd-edge-mount-body--hero');
      }
      var isCardSlot =
        lk === 'contentcard' || /contentcard|content-card/i.test(fragment);
      if (!isCardSlot) {
        body.classList.add('cd-edge-prefer-html');
      }
      outer.appendChild(labEl);
      outer.appendChild(body);
      wrap.appendChild(outer);
    }
  }

  function createPlacementRow(p) {
    p = p || { key: '', fragment: '', label: '' };
    var row = document.createElement('div');
    row.className = 'cd-lab-placement-row';
    var uid = 'cdpl_' + ++placementRowSeq;

    function field(labelText, className, value, ph) {
      var wrap = document.createElement('div');
      var lab = document.createElement('label');
      lab.setAttribute('for', uid + '_' + className);
      lab.textContent = labelText;
      var input = document.createElement('input');
      input.type = 'text';
      input.id = uid + '_' + className;
      input.className = className;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.value = value != null ? value : '';
      if (ph) input.placeholder = ph;
      wrap.appendChild(lab);
      wrap.appendChild(input);
      return wrap;
    }

    row.appendChild(field('Key', 'cd-lab-placement-key', p.key, 'e.g. topRibbon'));
    row.appendChild(field('Fragment (hash)', 'cd-lab-placement-fragment', p.fragment, 'e.g. hero-banner'));
    row.appendChild(field('Label', 'cd-lab-placement-label', p.label, 'Preview title'));

    var rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'secondary cd-lab-placement-row-remove';
    rm.setAttribute('aria-label', 'Remove placement');
    rm.textContent = 'Remove';
    row.appendChild(rm);

    return row;
  }

  function renderPlacementRows(arr) {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    list.textContent = '';
    var source = arr && arr.length ? arr : DEFAULT_PLACEMENTS.slice();
    var i;
    for (i = 0; i < source.length; i++) {
      list.appendChild(
        createPlacementRow({
          key: source[i].key || '',
          fragment: source[i].fragment || '',
          label: source[i].label || '',
        })
      );
    }
    if (!list.querySelector('.cd-lab-placement-row')) {
      list.appendChild(createPlacementRow(DEFAULT_PLACEMENTS[0]));
    }
    updateRemoveButtonsEnabled();
  }

  function placementRowCount() {
    var list = el('cdLabPlacementsList');
    if (!list) return 0;
    return list.querySelectorAll('.cd-lab-placement-row').length;
  }

  function updateRemoveButtonsEnabled() {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    var n = placementRowCount();
    var rows = list.querySelectorAll('.cd-lab-placement-row');
    for (var i = 0; i < rows.length; i++) {
      var btn = rows[i].querySelector('.cd-lab-placement-row-remove');
      if (btn) btn.disabled = n <= 1;
    }
    var addBtn = el('cdLabAddPlacementBtn');
    if (addBtn) {
      addBtn.disabled = n >= MAX_PLACEMENTS;
      addBtn.title =
        n >= MAX_PLACEMENTS
          ? 'Maximum ' + MAX_PLACEMENTS + ' placements (same limit as saved config).'
          : 'Add another preview region and surface fragment.';
    }
  }

  function onPlacementsListClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var rm = t.closest('.cd-lab-placement-row-remove');
    if (!rm || rm.disabled) return;
    var row = rm.closest('.cd-lab-placement-row');
    if (!row) return;
    if (placementRowCount() <= 1) return;
    row.remove();
    updateRemoveButtonsEnabled();
    applyPlacementsToMountsModule();
  }

  function onPlacementsListInput() {
    setMsg(el('cdLabPlacementKeyMsg'), '', '');
    applyPlacementsToMountsModule();
  }

  function wirePlacementList() {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    list.addEventListener('click', onPlacementsListClick);
    list.addEventListener('input', onPlacementsListInput);
    list.addEventListener('change', onPlacementsListInput);
  }

  function addPlacementRow() {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    if (placementRowCount() >= MAX_PLACEMENTS) return;
    var n = placementRowCount() + 1;
    list.appendChild(
      createPlacementRow({
        key: 'slot' + n,
        fragment: 'placement-' + n,
        label: 'Placement ' + n,
      })
    );
    updateRemoveButtonsEnabled();
    applyPlacementsToMountsModule();
  }

  function applyPlacementsToMountsModule() {
    rebuildPreviewMounts();
    if (typeof CdEdgeMounts !== 'undefined' && CdEdgeMounts.setPlacements) {
      CdEdgeMounts.setPlacements(getPlacementsFromForm());
    }
  }

  function toggleScopesRow() {
    var mode = el('cdLabEdgeMode') && el('cdLabEdgeMode').value;
    var row = el('cdLabScopesRow');
    if (row) row.style.display = mode === 'decisionScopes' ? 'block' : 'none';
  }

  function loadRecordIntoForm(rec) {
    if (!rec || typeof rec !== 'object') return;
    if (rec.datastreamId && el('edgeConfigId')) el('edgeConfigId').value = rec.datastreamId;
    if (rec.launchScriptUrl && el('cdLabLaunchUrl')) el('cdLabLaunchUrl').value = rec.launchScriptUrl;
    if (rec.edgePersonalizationMode && el('cdLabEdgeMode')) {
      el('cdLabEdgeMode').value =
        rec.edgePersonalizationMode === 'decisionScopes' ? 'decisionScopes' : 'surfaces';
    }
    var pl = rec.placements;
    if (Array.isArray(pl) && pl.length) {
      renderPlacementRows(pl.slice(0, MAX_PLACEMENTS));
    } else {
      renderPlacementRows(DEFAULT_PLACEMENTS);
    }
    applyPlacementsToMountsModule();
    toggleScopesRow();
  }

  /** Best-effort save schema/dataset names after successful infra steps (requires sign-in). */
  async function persistDecisionLabFields(patch) {
    if (typeof CdLabConfigApi === 'undefined' || !CdLabConfigApi.saveDecisionLabConfig) return;
    try {
      var data = await CdLabConfigApi.saveDecisionLabConfig(patch);
      if (data.ok) {
        setMsg(el('cdLabSaveStatus'), 'Saved to your lab config for this sandbox.', 'ok');
      } else if (data.error && /Sign in|401/i.test(String(data.error))) {
        setMsg(
          el('cdLabSaveStatus'),
          'Sign in (anonymous is fine) under the profile menu to save names for next visit.',
          ''
        );
      }
    } catch (e) {
      /* ignore */
    }
  }

  async function fetchConfigFromFirebase() {
    setMsg(el('cdLabSaveStatus'), 'Loading configuration…', '');
    var data = await CdLabConfigApi.fetchDecisionLabConfig();
    if (!data.ok) {
      setMsg(el('cdLabSaveStatus'), data.error || 'Could not load config.', 'err');
      return null;
    }
    loadRecordIntoForm(data.record || {});
    setMsg(
      el('cdLabSaveStatus'),
      data.record ? 'Loaded saved configuration (' + (data.storage || 'user') + ').' : 'No saved config yet — fill and save.',
      data.record ? 'ok' : ''
    );
    return data.record || null;
  }

  async function saveConfigToFirebase() {
    var sb = sandboxName();
    if (!sb) {
      setMsg(el('cdLabSaveStatus'), 'Select a sandbox first.', 'err');
      return;
    }
    var keyCheck = validatePlacementKeysForSave();
    if (!keyCheck.ok) {
      setMsg(el('cdLabPlacementKeyMsg'), keyCheck.msg, 'err');
      return;
    }
    setMsg(el('cdLabPlacementKeyMsg'), '', '');
    setMsg(el('cdLabSaveStatus'), 'Saving…', '');
    var body = {
      datastreamId: el('edgeConfigId') && el('edgeConfigId').value.trim(),
      launchScriptUrl: el('cdLabLaunchUrl') && el('cdLabLaunchUrl').value.trim(),
      edgePersonalizationMode: el('cdLabEdgeMode') && el('cdLabEdgeMode').value,
      placements: getPlacementsFromForm(),
    };
    var data = await CdLabConfigApi.saveDecisionLabConfig(body);
    if (!data.ok) {
      setMsg(el('cdLabSaveStatus'), data.error || 'Save failed.', 'err');
      return;
    }
    loadRecordIntoForm(data.record || {});
    setMsg(el('cdLabSaveStatus'), 'Saved for sandbox ' + sb + '.', 'ok');
  }

  async function probeTagsApiStep() {
    if (!sandboxName()) {
      setMsg(el('cdLabTagsApiMsg'), 'Select a sandbox first.', 'err');
      return;
    }
    setMsg(el('cdLabTagsApiMsg'), 'Calling Reactor API…', '');
    try {
      var res = await labFetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'probeTagsApi' }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok && data.authorized) {
        setMsg(
          el('cdLabTagsApiMsg'),
          (data.hint || 'Tags API OK.') + (data.companiesCount != null ? ' Companies visible: ' + data.companiesCount + '.' : ''),
          'ok'
        );
        return;
      }
      var msg = data.hint || data.detail || data.error || 'Tags API check failed.';
      setMsg(el('cdLabTagsApiMsg'), msg, 'err');
    } catch (e) {
      setMsg(el('cdLabTagsApiMsg'), e.message || 'Network error', 'err');
    }
  }

  function wireFormListeners() {
    wirePlacementList();
    if (el('cdLabEdgeMode')) el('cdLabEdgeMode').addEventListener('change', toggleScopesRow);
    if (el('cdLabAddPlacementBtn')) {
      el('cdLabAddPlacementBtn').addEventListener('click', function () {
        addPlacementRow();
      });
    }
  }

  function earlyInitPlacements() {
    var list = el('cdLabPlacementsList');
    if (!list || list.querySelector('.cd-lab-placement-row')) return;
    renderPlacementRows(DEFAULT_PLACEMENTS);
    applyPlacementsToMountsModule();
  }

  var __lastLaunchInjected = '';

  global.CdLabUi = {
    DEFAULT_PLACEMENTS: DEFAULT_PLACEMENTS,
    getPlacementsFromForm: getPlacementsFromForm,
    applyPlacementsToMountsModule: applyPlacementsToMountsModule,
    rebuildPreviewMounts: rebuildPreviewMounts,
    getLaunchScriptUrl: function () {
      return el('cdLabLaunchUrl') ? el('cdLabLaunchUrl').value.trim() : '';
    },
    getEdgePersonalizationMode: function () {
      return el('cdLabEdgeMode') ? el('cdLabEdgeMode').value : 'surfaces';
    },
    loadRecordIntoForm: loadRecordIntoForm,
    fetchConfigFromFirebase: fetchConfigFromFirebase,
    /** After auth — load Firebase config, wire buttons, first Launch inject */
    bootstrapAfterAuth: async function () {
      wireFormListeners();
      toggleScopesRow();
      if (!el('cdLabPlacementsList') || !el('cdLabPlacementsList').querySelector('.cd-lab-placement-row')) {
        renderPlacementRows(DEFAULT_PLACEMENTS);
      }
      applyPlacementsToMountsModule();

      if (el('cdLabProbeTagsBtn')) el('cdLabProbeTagsBtn').addEventListener('click', probeTagsApiStep);
      if (el('cdLabSaveConfigBtn')) el('cdLabSaveConfigBtn').addEventListener('click', saveConfigToFirebase);
      if (el('cdLabLoadConfigBtn')) el('cdLabLoadConfigBtn').addEventListener('click', fetchConfigFromFirebase);

      await fetchConfigFromFirebase();
      __lastLaunchInjected = global.CdLabUi.getLaunchScriptUrl();
    },
    noteLaunchInjected: function (url) {
      __lastLaunchInjected = String(url || '').trim();
    },
    getLastInjectedLaunchUrl: function () {
      return __lastLaunchInjected;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', earlyInitPlacements);
  } else {
    earlyInitPlacements();
  }
})(typeof window !== 'undefined' ? window : globalThis);
