/**
 * Decision lab Edge — workflow: provision (schema/dataset), save config, load Launch URL from Firebase.
 */
(function (global) {
  'use strict';

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

  function getPlacementsFromForm() {
    return [
      {
        key: 'topRibbon',
        fragment: (el('cdLabFragTop') && el('cdLabFragTop').value.trim()) || 'TopRibbon',
        label: (el('cdMountLabelTopRibbon') && el('cdMountLabelTopRibbon').textContent) || 'Top ribbon',
      },
      {
        key: 'hero',
        fragment: (el('cdLabFragHero') && el('cdLabFragHero').value.trim()) || 'hero-banner',
        label: (el('cdMountLabelHero') && el('cdMountLabelHero').textContent) || 'Hero banner',
      },
      {
        key: 'contentCard',
        fragment: (el('cdLabFragCard') && el('cdLabFragCard').value.trim()) || 'ContentCardContainer',
        label: (el('cdMountLabelContentCard') && el('cdMountLabelContentCard').textContent) || 'Content card',
      },
    ];
  }

  function syncMountLabelsFromForm() {
    var t = el('cdLabFragTop');
    var h = el('cdLabFragHero');
    var c = el('cdLabFragCard');
    if (el('cdMountLabelTopRibbon') && t) el('cdMountLabelTopRibbon').textContent = 'Top ribbon — #' + t.value.trim();
    if (el('cdMountLabelHero') && h) el('cdMountLabelHero').textContent = 'Hero — #' + h.value.trim();
    if (el('cdMountLabelContentCard') && c) {
      el('cdMountLabelContentCard').textContent = 'Content card — #' + c.value.trim();
    }
  }

  function applyPlacementsToMountsModule() {
    if (typeof CdEdgeMounts !== 'undefined' && CdEdgeMounts.setPlacements) {
      CdEdgeMounts.setPlacements(getPlacementsFromForm());
    }
    syncMountLabelsFromForm();
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
    if (rec.schemaTitle && el('cdLabSchemaTitle')) el('cdLabSchemaTitle').value = rec.schemaTitle;
    if (rec.datasetName && el('cdLabDatasetName')) el('cdLabDatasetName').value = rec.datasetName;
    if (rec.edgePersonalizationMode && el('cdLabEdgeMode')) {
      el('cdLabEdgeMode').value =
        rec.edgePersonalizationMode === 'decisionScopes' ? 'decisionScopes' : 'surfaces';
    }
    var pl = rec.placements;
    if (Array.isArray(pl) && pl.length) {
      pl.forEach(function (p) {
        if (p.key === 'topRibbon' && el('cdLabFragTop')) el('cdLabFragTop').value = p.fragment || '';
        if (p.key === 'hero' && el('cdLabFragHero')) el('cdLabFragHero').value = p.fragment || '';
        if (p.key === 'contentCard' && el('cdLabFragCard')) el('cdLabFragCard').value = p.fragment || '';
      });
    }
    applyPlacementsToMountsModule();
    toggleScopesRow();
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
    setMsg(el('cdLabSaveStatus'), 'Saving…', '');
    var body = {
      datastreamId: el('edgeConfigId') && el('edgeConfigId').value.trim(),
      launchScriptUrl: el('cdLabLaunchUrl') && el('cdLabLaunchUrl').value.trim(),
      schemaTitle: el('cdLabSchemaTitle') && el('cdLabSchemaTitle').value.trim(),
      datasetName: el('cdLabDatasetName') && el('cdLabDatasetName').value.trim(),
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

  async function createSchemaStep() {
    var title = el('cdLabSchemaTitle') && el('cdLabSchemaTitle').value.trim();
    if (!title) {
      setMsg(el('cdLabSchemaMsg'), 'Enter a schema name.', 'err');
      return;
    }
    if (!sandboxName()) {
      setMsg(el('cdLabSchemaMsg'), 'Select a sandbox first.', 'err');
      return;
    }
    setMsg(el('cdLabSchemaMsg'), 'Creating schema…', '');
    try {
      var res = await labFetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'createSchema', schemaTitle: title }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(el('cdLabSchemaMsg'), data.error || 'Failed.', 'err');
        return;
      }
      setMsg(el('cdLabSchemaMsg'), data.message || 'Schema OK.', 'ok');
    } catch (e) {
      setMsg(el('cdLabSchemaMsg'), e.message || 'Network error', 'err');
    }
  }

  async function createDatasetStep() {
    var schemaTitle = el('cdLabSchemaTitle') && el('cdLabSchemaTitle').value.trim();
    var datasetName = el('cdLabDatasetName') && el('cdLabDatasetName').value.trim();
    if (!schemaTitle || !datasetName) {
      setMsg(el('cdLabDatasetMsg'), 'Enter schema name and dataset name.', 'err');
      return;
    }
    if (!sandboxName()) {
      setMsg(el('cdLabDatasetMsg'), 'Select a sandbox first.', 'err');
      return;
    }
    setMsg(el('cdLabDatasetMsg'), 'Creating dataset…', '');
    try {
      var res = await labFetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'createDataset', schemaTitle: schemaTitle, datasetName: datasetName }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(el('cdLabDatasetMsg'), data.error || 'Failed.', 'err');
        return;
      }
      setMsg(el('cdLabDatasetMsg'), data.message || 'Dataset OK.', 'ok');
    } catch (e) {
      setMsg(el('cdLabDatasetMsg'), e.message || 'Network error', 'err');
    }
  }

  async function checkInfra() {
    var st = el('cdLabSchemaTitle') && el('cdLabSchemaTitle').value.trim();
    var ds = el('cdLabDatasetName') && el('cdLabDatasetName').value.trim();
    if (!st || !ds) {
      setMsg(el('cdLabInfraMsg'), 'Enter schema and dataset names first.', 'err');
      return;
    }
    if (!sandboxName()) {
      setMsg(el('cdLabInfraMsg'), 'Select a sandbox first.', 'err');
      return;
    }
    setMsg(el('cdLabInfraMsg'), 'Checking…', '');
    try {
      var res = await labFetch(
        '/api/events/infra/status' + sandboxQs() + '&schemaTitle=' + encodeURIComponent(st) + '&datasetName=' + encodeURIComponent(ds)
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(el('cdLabInfraMsg'), data.error || 'Failed.', 'err');
        return;
      }
      var parts = [];
      if (data.schemaFound) parts.push('schema ✓');
      if (data.datasetFound) parts.push('dataset ✓');
      setMsg(el('cdLabInfraMsg'), parts.join(' · ') || JSON.stringify(data).slice(0, 200), 'ok');
    } catch (e) {
      setMsg(el('cdLabInfraMsg'), e.message || 'Network error', 'err');
    }
  }

  function wireFormListeners() {
    ['cdLabFragTop', 'cdLabFragHero', 'cdLabFragCard'].forEach(function (id) {
      var n = el(id);
      if (n) n.addEventListener('change', applyPlacementsToMountsModule);
      if (n) n.addEventListener('blur', applyPlacementsToMountsModule);
    });
    if (el('cdLabEdgeMode')) el('cdLabEdgeMode').addEventListener('change', toggleScopesRow);
  }

  var __lastLaunchInjected = '';

  global.CdLabUi = {
    getPlacementsFromForm: getPlacementsFromForm,
    applyPlacementsToMountsModule: applyPlacementsToMountsModule,
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
      applyPlacementsToMountsModule();

      if (el('cdLabCreateSchemaBtn')) el('cdLabCreateSchemaBtn').addEventListener('click', createSchemaStep);
      if (el('cdLabCreateDatasetBtn')) el('cdLabCreateDatasetBtn').addEventListener('click', createDatasetStep);
      if (el('cdLabCheckInfraBtn')) el('cdLabCheckInfraBtn').addEventListener('click', checkInfra);
      if (el('cdLabSaveConfigBtn')) el('cdLabSaveConfigBtn').addEventListener('click', saveConfigToFirebase);
      if (el('cdLabLoadConfigBtn')) el('cdLabLoadConfigBtn').addEventListener('click', fetchConfigFromFirebase);

      await fetchConfigFromFirebase();
      __lastLaunchInjected = global.CdLabUi.getLaunchScriptUrl();
    },
    /** Call after inline script defines injectLaunchScript */
    noteLaunchInjected: function (url) {
      __lastLaunchInjected = String(url || '').trim();
    },
    getLastInjectedLaunchUrl: function () {
      return __lastLaunchInjected;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
