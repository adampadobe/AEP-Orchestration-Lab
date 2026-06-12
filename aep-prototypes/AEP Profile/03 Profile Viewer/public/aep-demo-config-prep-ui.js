/**
 * Global settings — Demo prep form (iPad, Call Centre, Agentic layer) → RTDB.
 */
(function (global) {
  'use strict';

  var AGENTIC_KEYS = ['brand', 'product', 'operational', 'field', 'audience', 'journey', 'data', 'support'];

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
    var sp = s.StaffPortal || {};
    var td = s.TravelData || {};
    setVal('aepPrepIpadAgentName', sp.AgentName || '');
    setVal('aepPrepIpadColour', sp.Colour || '');
    setVal('aepPrepIpadFlight', td.flightNumber || '');
    setVal('aepPrepIpadRoute', td.route || '');
    setVal('aepPrepIpadGate', td.gate || '');
  }

  function collectIPad(existing) {
    var ex = existing || {};
    var sp = Object.assign({}, ex.StaffPortal || {}, {
      AgentName: val('aepPrepIpadAgentName'),
      Colour: val('aepPrepIpadColour'),
    });
    var td = Object.assign({}, ex.TravelData || {}, {
      flightNumber: val('aepPrepIpadFlight'),
      route: val('aepPrepIpadRoute'),
      gate: val('aepPrepIpadGate'),
    });
    return {
      StaffPortal: sp,
      CoreDemoData: ex.CoreDemoData || {},
      Mobile: ex.Mobile || {},
      TravelData: td,
      CustomerLoyalty: ex.CustomerLoyalty || {},
    };
  }

  function fillCallCentre(section) {
    var s = section || {};
    var sp = s.StaffPortal || {};
    setVal('aepPrepCcAgentName', sp.AgentName || (s.Mobile && s.Mobile.StaffName) || '');
    setVal('aepPrepCcColour', sp.Colour || '');
    setVal('aepPrepCcBrand', (s.CoreDemoData && s.CoreDemoData.name) || '');
    var sel = document.getElementById('aepPrepCcIndustry');
    if (sel) sel.value = s.industryId || 'travel';
  }

  function collectCallCentre(existing) {
    var ex = existing || {};
    var sp = Object.assign({}, ex.StaffPortal || {}, {
      AgentName: val('aepPrepCcAgentName'),
      Colour: val('aepPrepCcColour'),
    });
    var cd = Object.assign({}, ex.CoreDemoData || {}, { name: val('aepPrepCcBrand') });
    var sel = document.getElementById('aepPrepCcIndustry');
    return {
      StaffPortal: sp,
      CoreDemoData: cd,
      Mobile: Object.assign({}, ex.Mobile || {}, { StaffName: val('aepPrepCcAgentName') }),
      industryId: sel ? sel.value : ex.industryId || 'travel',
    };
  }

  var cachedSections = { iPad: null, CallCentre: null, AgenticLayer: null };

  function loadAllForms() {
    var c = cfg();
    if (!c) return Promise.resolve();
    return c.whenReady().then(function () {
      return Promise.all([
        c.loadSection(c.SECTIONS.iPad).then(function (d) {
          cachedSections.iPad = d;
          fillIPad(d);
        }),
        c.loadSection(c.SECTIONS.CallCentre).then(function (d) {
          cachedSections.CallCentre = d;
          fillCallCentre(d);
        }),
        c.loadSection(c.SECTIONS.AgenticLayer).then(function (d) {
          cachedSections.AgenticLayer = d;
          fillAgentic(d && d.agentUrls);
        }),
      ]);
    });
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
          setStatus(sectionKey + ' saved for sandbox “' + c.getActiveSandboxSlug() + '”.', 'ok');
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
    wireSave('iPad', collectIPad);
    wireSave('CallCentre', collectCallCentre);
    wireSave('AgenticLayer', collectAgentic);
    loadAllForms().catch(function () {});
    global.addEventListener('aep-global-sandbox-change', function () {
      loadAllForms().catch(function () {});
    });
    global.addEventListener('aep-demo-config-prep-reload', function () {
      loadAllForms().catch(function () {});
    });
    global.addEventListener('aep-demo-config-changed', function () {
      loadAllForms().catch(function () {});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
