/**
 * Global settings — Demo prep form (all RTDB sections) → ajoLookups/{ldap}/sandboxes/{sandbox}/.
 */
(function (global) {
  'use strict';

  var AGENTIC_KEYS = ['brand', 'product', 'operational', 'field', 'audience', 'journey', 'data', 'support'];
  var EXP_VIZ_KEYS = ['treatmentA', 'treatmentB', 'treatmentC', 'emailA', 'emailB'];

  var SECTION_LABELS = {
    CoreDemoData: 'Customer & brand',
    StaffPortal: 'Agent & chrome',
    iPad: 'iPad',
    CallCentre: 'Call Centre',
    AgenticLayer: 'Agentic layer',
    ExpVisualiser: 'Exp visualiser',
    ExpAccelerator: 'Exp accelerator',
    ContentDecisionLive: 'Content decision live',
  };

  var INDUSTRY_OPTIONS = [
    { id: 'generic', label: 'Generic · CDP lab' },
    { id: 'travel', label: 'Travel & hospitality' },
    { id: 'fsi', label: 'Financial services' },
    { id: 'telecom', label: 'Telecommunications' },
    { id: 'retail', label: 'Retail' },
    { id: 'media', label: 'Media & entertainment' },
    { id: 'sports', label: 'Sports' },
  ];

  function cfg() {
    return global.AepDemoConfigRtdb;
  }

  function setStatus(text, kind) {
    var el = document.getElementById('aepDemoPrepStatus');
    if (!el) return;
    el.textContent = text || '';
    el.style.color =
      kind === 'err' ? 'var(--dash-error, #c9252d)' : kind === 'ok' ? 'var(--dash-success, #12805c)' : 'var(--dash-text-secondary, #64748b)';
  }

  function val(id) {
    var el = document.getElementById(id);
    return el && el.value != null ? String(el.value).trim() : '';
  }

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v != null ? String(v) : '';
  }

  function setChecked(id, on) {
    var el = document.getElementById(id);
    if (el) el.checked = !!on;
  }

  function fillCoreDemoData(section) {
    var s = section || {};
    setVal('aepPrepCore_name', s.name || '');
    setVal('aepPrepCore_airlineName', s.airlineName || '');
    setVal('aepPrepCore_shortName', s.shortName || '');
    setVal('aepPrepCore_slogan', s.slogan || '');
    setVal('aepPrepCore_url', s.url || '');
    setVal('aepPrepCore_customerLogo', s.customerLogo || '');
  }

  function collectCoreDemoData(existing) {
    return Object.assign({}, existing || {}, {
      name: val('aepPrepCore_name'),
      airlineName: val('aepPrepCore_airlineName'),
      shortName: val('aepPrepCore_shortName'),
      slogan: val('aepPrepCore_slogan'),
      url: val('aepPrepCore_url'),
      customerLogo: val('aepPrepCore_customerLogo'),
    });
  }

  function fillStaffPortal(section) {
    var s = section || {};
    setVal('aepPrepStaff_AgentName', s.AgentName || '');
    setVal('aepPrepStaff_AgentID', s.AgentID || '');
    setVal('aepPrepStaff_AgentType', s.AgentType || '');
    setVal('aepPrepStaff_Colour', s.Colour || '');
    setVal('aepPrepStaff_FlightTerminalInfo', s.FlightTerminalInfo || '');
  }

  function collectStaffPortal(existing) {
    return Object.assign({}, existing || {}, {
      AgentName: val('aepPrepStaff_AgentName'),
      AgentID: val('aepPrepStaff_AgentID'),
      AgentType: val('aepPrepStaff_AgentType'),
      Colour: val('aepPrepStaff_Colour'),
      FlightTerminalInfo: val('aepPrepStaff_FlightTerminalInfo'),
    });
  }

  function fillAgentic(agentUrls) {
    var u = agentUrls && typeof agentUrls === 'object' ? agentUrls : {};
    AGENTIC_KEYS.forEach(function (k) {
      setVal('aepPrepAgentic_' + k, u[k] || '');
    });
  }

  function collectAgentic() {
    var o = {};
    AGENTIC_KEYS.forEach(function (k) {
      o[k] = val('aepPrepAgentic_' + k);
    });
    return { agentUrls: o };
  }

  function fillIPad(section) {
    var s = section || {};
    var td = s.TravelData || {};
    setVal('aepPrepIpadFlight', td.flightNumber || '');
    setVal('aepPrepIpadRoute', td.route || '');
    setVal('aepPrepIpadGate', td.gate || '');
  }

  function collectIPad(existing) {
    var ex = existing || {};
    var td = Object.assign({}, ex.TravelData || {}, {
      flightNumber: val('aepPrepIpadFlight'),
      route: val('aepPrepIpadRoute'),
      gate: val('aepPrepIpadGate'),
    });
    return {
      Mobile: ex.Mobile || {},
      TravelData: td,
      CustomerLoyalty: ex.CustomerLoyalty || {},
    };
  }

  function fillCallCentre(section) {
    var s = section || {};
    var sel = document.getElementById('aepPrepCcIndustry');
    if (sel) sel.value = s.industryId || 'travel';
  }

  function collectCallCentre(existing) {
    var ex = existing || {};
    var sel = document.getElementById('aepPrepCcIndustry');
    return {
      industryId: sel ? sel.value : ex.industryId || 'travel',
    };
  }

  function fillExpVisualiser(section) {
    var s = section || {};
    EXP_VIZ_KEYS.forEach(function (k) {
      setVal('aepPrepExpViz_' + k, s[k] || '');
    });
  }

  function collectExpVisualiser(existing) {
    var ex = existing || {};
    var o = Object.assign({}, ex);
    EXP_VIZ_KEYS.forEach(function (k) {
      o[k] = val('aepPrepExpViz_' + k);
    });
    return o;
  }

  function fillExpAccelerator(section) {
    var s = section || {};
    setVal('aepPrepExpAccel_displayNameOverride', s.displayNameOverride || '');
    setVal('aepPrepExpAccel_opportunityIndustry', s.opportunityIndustry || 'general');
  }

  function collectExpAccelerator(existing) {
    return Object.assign({}, existing || {}, {
      displayNameOverride: val('aepPrepExpAccel_displayNameOverride'),
      opportunityIndustry: val('aepPrepExpAccel_opportunityIndustry') || 'general',
    });
  }

  function fillContentDecisionLive(section) {
    var s = section || {};
    setVal('aepPrepCdLive_edgeConfigId', s.edgeConfigId || '');
    setVal('aepPrepCdLive_decisionScopes', s.decisionScopes || '');
    setChecked('aepPrepCdLive_edgeForceConfigure', !!s.edgeForceConfigure);
  }

  function collectContentDecisionLive(existing) {
    return Object.assign({}, existing || {}, {
      edgeConfigId: val('aepPrepCdLive_edgeConfigId'),
      decisionScopes: val('aepPrepCdLive_decisionScopes'),
      edgeForceConfigure: !!(document.getElementById('aepPrepCdLive_edgeForceConfigure') && document.getElementById('aepPrepCdLive_edgeForceConfigure').checked),
      edgeConfigBySandbox: (existing && existing.edgeConfigBySandbox) || {},
    });
  }

  var cachedSections = {
    CoreDemoData: null,
    StaffPortal: null,
    iPad: null,
    CallCentre: null,
    AgenticLayer: null,
    ExpVisualiser: null,
    ExpAccelerator: null,
    ContentDecisionLive: null,
  };

  function renderStructureMap(data) {
    var wrap = document.getElementById('aepDemoPrepStructure');
    var c = cfg();
    if (!wrap || !c) return;
    var ldap = c.getLdapSlugSync() || '—';
    var sb = c.getActiveSandboxSlug() || '—';
    if (ldap === '—' || sb === '—') {
      wrap.textContent = 'Select a sandbox and sign in from Home to provision your demo prep tree in RTDB.';
      return;
    }
    var base = 'ajoLookups/' + ldap + '/sandboxes/' + sb + '/';
    var items = Object.keys(c.SECTIONS).map(function (key) {
      var section = c.SECTIONS[key];
      var label = SECTION_LABELS[section] || section;
      var exists = data && data[section] != null && typeof data[section] === 'object';
      return (
        '<li><code>' +
        base +
        section +
        '</code><span class="aep-demo-prep-structure-status' +
        (exists ? '' : ' aep-demo-prep-structure-status--pending') +
        '">' +
        (exists ? 'ready' : 'pending') +
        '</span><span>' +
        label +
        '</span></li>'
      );
    });
    wrap.innerHTML =
      '<strong>RTDB prep tree</strong> (auto-created for your active sandbox)<ul class="aep-demo-prep-structure">' +
      items.join('') +
      '</ul>';
  }

  function ensureAndLoad() {
    var c = cfg();
    if (!c) return Promise.resolve();
    setStatus('Preparing RTDB workspace…', '');
    return c
      .ensurePrepReady()
      .then(function (result) {
        if (result && result.skipped && result.reason === 'auth') {
          setStatus('Sign in from Home with your @adobe.com lab account to prep demos in RTDB.', 'err');
          renderStructureMap(null);
          return null;
        }
        if (result && result.skipped && result.reason === 'no_slug') {
          setStatus('Select an Adobe sandbox in the lab strip first.', 'err');
          renderStructureMap(null);
          return null;
        }
        return c.loadSandboxSections();
      })
      .then(function (sandboxData) {
        if (sandboxData !== null) {
          renderStructureMap(sandboxData);
          setStatus('Demo prep ready in RTDB for sandbox “' + c.getActiveSandboxSlug() + '”.', 'ok');
        }
        return loadAllForms();
      })
      .catch(function (e) {
        setStatus(String((e && e.message) || e), 'err');
      });
  }

  function loadAllForms() {
    var c = cfg();
    if (!c) return Promise.resolve();
    var skip = { skipEnsurePrep: true, skipBrandMerge: true };
    return Promise.all([
      c.loadSection(c.SECTIONS.CoreDemoData, skip).then(function (d) {
        cachedSections.CoreDemoData = d;
        fillCoreDemoData(d);
      }),
      c.loadSection(c.SECTIONS.StaffPortal, skip).then(function (d) {
        cachedSections.StaffPortal = d;
        fillStaffPortal(d);
      }),
      c.loadSection(c.SECTIONS.iPad, skip).then(function (d) {
        cachedSections.iPad = d;
        fillIPad(d);
      }),
      c.loadSection(c.SECTIONS.CallCentre, skip).then(function (d) {
        cachedSections.CallCentre = d;
        fillCallCentre(d);
      }),
      c.loadSection(c.SECTIONS.AgenticLayer, skip).then(function (d) {
        cachedSections.AgenticLayer = d;
        fillAgentic(d && d.agentUrls);
      }),
      c.loadSection(c.SECTIONS.ExpVisualiser, skip).then(function (d) {
        cachedSections.ExpVisualiser = d;
        fillExpVisualiser(d);
      }),
      c.loadSection(c.SECTIONS.ExpAccelerator, skip).then(function (d) {
        cachedSections.ExpAccelerator = d;
        fillExpAccelerator(d);
      }),
      c.loadSection(c.SECTIONS.ContentDecisionLive, skip).then(function (d) {
        cachedSections.ContentDecisionLive = d;
        fillContentDecisionLive(d);
      }),
    ]);
  }

  function wireSave(sectionKey, collectFn) {
    var btn = document.getElementById('aepPrepSave' + sectionKey);
    if (!btn || !cfg()) return;
    btn.addEventListener('click', function () {
      setStatus('Saving ' + sectionKey + '…', '');
      btn.disabled = true;
      var c = cfg();
      var payload = collectFn(cachedSections[sectionKey]);
      c.saveSection(c.SECTIONS[sectionKey], payload)
        .then(function () {
          cachedSections[sectionKey] = payload;
          setStatus((SECTION_LABELS[sectionKey] || sectionKey) + ' saved for sandbox “' + c.getActiveSandboxSlug() + '”.', 'ok');
          return c.loadSandboxSections();
        })
        .then(function (data) {
          renderStructureMap(data);
        })
        .catch(function (e) {
          setStatus(String((e && e.message) || e), 'err');
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  function wireIndustrySelect() {
    var sel = document.getElementById('aepPrepCcIndustry');
    if (!sel) return;
    sel.innerHTML = '';
    INDUSTRY_OPTIONS.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
  }

  function init() {
    wireIndustrySelect();
    wireSave('CoreDemoData', collectCoreDemoData);
    wireSave('StaffPortal', collectStaffPortal);
    wireSave('iPad', collectIPad);
    wireSave('CallCentre', collectCallCentre);
    wireSave('AgenticLayer', collectAgentic);
    wireSave('ExpVisualiser', collectExpVisualiser);
    wireSave('ExpAccelerator', collectExpAccelerator);
    wireSave('ContentDecisionLive', collectContentDecisionLive);
    ensureAndLoad();
    global.addEventListener('aep-global-sandbox-change', function () {
      var c2 = cfg();
      if (c2 && c2.clearPrepCache) c2.clearPrepCache();
      ensureAndLoad();
    });
    global.addEventListener('aep-demo-config-prep-reload', function () {
      ensureAndLoad();
    });
    global.addEventListener('aep-demo-config-changed', function () {
      var c = cfg();
      if (!c) return;
      c.loadSandboxSections().then(renderStructureMap).catch(function () {});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
