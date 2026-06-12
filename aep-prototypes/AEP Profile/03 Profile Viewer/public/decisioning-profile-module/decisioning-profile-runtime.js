/**
 * Site-clone decisioning runtime — profile lookup + Edge sendEvent into iframe mounts.
 * Brand-agnostic; page wiring supplies identity + enablement + mount layout preset.
 */
(function (global) {
  'use strict';

  var LOG_PREFIX = '[decisioning-profile-runtime]';
  var CACHE_BUST = '20260620';

  var config = null;
  var lastUpsClientData = null;
  var lastProfileEcid = '';
  var labConfigRecord = null;
  var labConfigLoadPromise = null;

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.log.apply(console, args);
    } catch (_e) {}
  }

  function cfg(key) {
    return config && config[key];
  }

  function useParentDocument() {
    return cfg('useParentDocument') === true;
  }

  function getFrame() {
    if (useParentDocument()) return null;
    var id = cfg('iframeId') || 'siteCloneDemoSiteFrame';
    return document.getElementById(id);
  }

  function getIframeDoc() {
    if (useParentDocument()) return document;
    var frame = getFrame();
    if (!frame) return null;
    try {
      return frame.contentDocument || null;
    } catch (_e) {
      return null;
    }
  }

  function isEnabled() {
    if (typeof cfg('enabled') === 'function') return !!cfg('enabled')();
    return true;
  }

  function mountLayout() {
    if (typeof cfg('mountLayout') !== 'undefined') return cfg('mountLayout');
    return cfg('mountLayoutPreset') || 'sky-home';
  }

  function dispatchUpdated(detail) {
    try {
      global.dispatchEvent(new CustomEvent('decisioning-profile-updated', { detail: detail || {} }));
    } catch (_e) {}
  }

  function extractEcidFromUps(data) {
    if (!data || typeof data !== 'object') return '';
    var entity = null;
    if (
      typeof global.DecisioningProfileModule !== 'undefined' &&
      typeof global.DecisioningProfileModule.extractEntityFromUps === 'function'
    ) {
      entity = global.DecisioningProfileModule.extractEntityFromUps(data);
    }
    if (!entity) return '';
    var im = entity.identityMap;
    if (!im || typeof im !== 'object') return '';
    var arr = im.ECID || im.ecid;
    if (!Array.isArray(arr)) return '';
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id) return String(arr[i].id).replace(/\s/g, '');
    }
    return '';
  }

  function isUpsOk(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.error) return false;
    if (data.platform_response && data.platform_response.error) return false;
    return true;
  }

  async function runProfileLookup(opts) {
    opts = opts || {};
    if (!isEnabled()) return false;
    var idVal =
      typeof cfg('getIdentifierValue') === 'function' ? String(cfg('getIdentifierValue')() || '').trim() : '';
    var ns =
      typeof cfg('getNamespace') === 'function' ? String(cfg('getNamespace')() || 'email').trim().toLowerCase() : 'email';
    var sandbox =
      typeof cfg('getSandboxName') === 'function' ? String(cfg('getSandboxName')() || '').trim() : '';
    if (!idVal) {
      dispatchUpdated({ ok: false, reason: 'missing-identifier' });
      return false;
    }
    var qs = new URLSearchParams({ namespace: ns, identifier: idVal });
    if (sandbox) qs.set('sandbox', sandbox);
    try {
      var res = await fetch('/api/profile/table?' + qs.toString(), { headers: { Accept: 'application/json' } });
      var data = await res.json().catch(function () {
        return {};
      });
      lastUpsClientData = data;
      if (!res.ok || !isUpsOk(data)) {
        lastUpsClientData = null;
        lastProfileEcid = '';
        dispatchUpdated({ ok: false });
        return false;
      }
      lastProfileEcid = extractEcidFromUps(data);
      dispatchUpdated({ ok: true, ecid: lastProfileEcid, skipHydrate: !!opts.skipHydrate });
      return true;
    } catch (e) {
      lastUpsClientData = null;
      lastProfileEcid = '';
      dispatchUpdated({ ok: false, error: String(e && e.message ? e.message : e) });
      return false;
    }
  }

  function buildSurfacesForPage() {
    if (typeof global.CdEdgeMounts === 'undefined') return [];
    if (
      labConfigRecord &&
      labConfigRecord.targetPageUrl &&
      typeof global.CdEdgeMounts.buildSurfacesFromPageUrl === 'function'
    ) {
      return global.CdEdgeMounts.buildSurfacesFromPageUrl(labConfigRecord.targetPageUrl);
    }
    if (typeof global.CdEdgeMounts.buildSurfacesForEdgeLabPage === 'function') {
      return global.CdEdgeMounts.buildSurfacesForEdgeLabPage();
    }
    return [];
  }

  async function loadLabConfig() {
    if (typeof global.CdLabConfigApi === 'undefined' || typeof global.CdLabConfigApi.fetchDecisionLabConfig !== 'function') {
      return null;
    }
    try {
      var data = await global.CdLabConfigApi.fetchDecisionLabConfig();
      if (data && data.ok && data.record) {
        labConfigRecord = data.record;
        if (labConfigRecord.placements && typeof global.CdEdgeMounts !== 'undefined' && global.CdEdgeMounts.setPlacements) {
          global.CdEdgeMounts.setPlacements(labConfigRecord.placements);
        }
        log('loadLabConfig', 'ok');
        return labConfigRecord;
      }
    } catch (e) {
      log('loadLabConfig', String(e && e.message ? e.message : e));
    }
    return null;
  }

  function ensureLabConfigLoaded() {
    if (!labConfigLoadPromise) labConfigLoadPromise = loadLabConfig();
    return labConfigLoadPromise;
  }

  function wireIframeMountRetries() {
    if (useParentDocument()) {
      var onDomReady = function () {
        if (isEnabled()) ensureMounts();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDomReady);
      } else {
        onDomReady();
      }
      return;
    }
    var frame = getFrame();
    if (!frame || frame.getAttribute('data-decisioning-mount-wired') === '1') return;
    frame.setAttribute('data-decisioning-mount-wired', '1');
    var onReady = function () {
      if (isEnabled()) ensureMounts();
    };
    try {
      if (frame.contentDocument && frame.contentDocument.body) onReady();
    } catch (_e) {}
    frame.addEventListener('load', onReady);
  }

  async function waitForAlloy(maxMs) {
    var deadline = Date.now() + (maxMs || 20000);
    while (Date.now() < deadline) {
      if (typeof global.alloy === 'function') return global.alloy;
      await new Promise(function (r) {
        setTimeout(r, 200);
      });
    }
    throw new Error('Web SDK (Alloy) not ready — inject Tags first.');
  }

  function applyPropositionsToIframe(propositions) {
    var iframeDoc = getIframeDoc();
    if (!iframeDoc) return;
    var inject = global.DecisioningEdgeInject;
    if (!inject) return;
    var layout = mountLayout();
    inject.applyDecisioningPropositions(propositions, iframeDoc, {
      layout: layout,
      surfaceStyles: labConfigRecord && labConfigRecord.surfaceStyles,
    });
  }

  function setEntityPath(entity, path, value) {
    if (!entity || !path) return;
    var parts = String(path).split('.');
    if (!parts.length) return;
    var cur = entity;
    var i;
    for (i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) cur[key] = {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function patchLastUpsClientData(updates) {
    if (!lastUpsClientData || !updates || !updates.length) return;
    var entity = null;
    if (
      typeof global.DecisioningProfileModule !== 'undefined' &&
      typeof global.DecisioningProfileModule.extractEntityFromUps === 'function'
    ) {
      entity = global.DecisioningProfileModule.extractEntityFromUps(lastUpsClientData);
    }
    if (!entity) return;
    var ui;
    for (ui = 0; ui < updates.length; ui++) {
      var u = updates[ui];
      if (u && u.path) setEntityPath(entity, u.path, u.value);
    }
  }

  async function runContentDecision() {
    if (!isEnabled()) throw new Error('Decisioning is disabled.');
    await ensureLabConfigLoaded();
    ensureMounts();
    if (!lastUpsClientData || !isUpsOk(lastUpsClientData)) {
      var ok = await runProfileLookup({ silent: true });
      if (!ok) throw new Error('Profile lookup failed — enter an identifier and look up profile first.');
    } else if (!lastProfileEcid) {
      lastProfileEcid = extractEcidFromUps(lastUpsClientData);
    }
    var alloyFn = await waitForAlloy();
    var idVal =
      typeof cfg('getIdentifierValue') === 'function' ? String(cfg('getIdentifierValue')() || '').trim() : '';
    var ns =
      typeof cfg('getNamespace') === 'function' ? String(cfg('getNamespace')() || 'email').trim().toLowerCase() : 'email';
    var profile = { ecid: lastProfileEcid || null, email: ns === 'email' ? idVal || null : null };
    var identityMap =
      typeof global.CdEdgeMounts !== 'undefined' && typeof global.CdEdgeMounts.buildIdentityMap === 'function'
        ? global.CdEdgeMounts.buildIdentityMap(profile, idVal, ns)
        : {};
    var surfaces = buildSurfacesForPage();
    var href = global.location ? global.location.href.split('?')[0] : '';
    var viewName =
      typeof cfg('getViewName') === 'function'
        ? String(cfg('getViewName')() || '').trim()
        : document.title || 'Site clone demo';
    var schemas =
      global.CdEdgeMounts && global.CdEdgeMounts.PERSONALIZATION_SCHEMAS
        ? global.CdEdgeMounts.PERSONALIZATION_SCHEMAS
        : [
            'https://ns.adobe.com/personalization/default-content-item',
            'https://ns.adobe.com/personalization/html-content-item',
            'https://ns.adobe.com/personalization/json-content-item',
            'https://ns.adobe.com/personalization/dom-action',
          ];
    var sendOpts = {
      renderDecisions: true,
      personalization: { surfaces: surfaces, schemas: schemas },
      xdm: {
        identityMap: identityMap,
        web: {
          webPageDetails: {
            URL: href,
            name: viewName || document.title || 'Site clone demo',
            viewName: viewName || document.title || 'Site clone demo',
          },
        },
      },
    };
    log('sendEvent', { surfaces: surfaces.length, ns: ns });
    var result = await alloyFn('sendEvent', sendOpts);
    var propositions = (result && (result.propositions || result.decisions)) || [];
    try {
      if (propositions.length) await alloyFn('applyPropositions', { propositions: propositions });
    } catch (e) {
      log('applyPropositions', String(e && e.message ? e.message : e));
    }
    applyPropositionsToIframe(propositions);
    dispatchUpdated({ ok: true, propositionCount: propositions.length, skipHydrate: true });
    return result;
  }

  function ensureMounts() {
    if (!isEnabled()) return null;
    var doc = getIframeDoc();
    if (!doc || !global.DecisioningEdgeInject) return null;
    return global.DecisioningEdgeInject.ensureDecisioningMounts(doc, mountLayout());
  }

  function removeMounts() {
    var doc = getIframeDoc();
    if (!doc || !global.DecisioningEdgeInject) return;
    global.DecisioningEdgeInject.removeDecisioningMounts(doc);
  }

  function init(options) {
    config = options || {};
    wireIframeMountRetries();
    labConfigLoadPromise = loadLabConfig();
    try {
      global.addEventListener('aep-global-sandbox-change', function () {
        labConfigRecord = null;
        labConfigLoadPromise = loadLabConfig();
      });
    } catch (_e) {}
    if (isEnabled()) ensureMounts();
    else removeMounts();
    return getApi();
  }

  function getApi() {
    return {
      getLastUpsClientData: function () {
        return lastUpsClientData;
      },
      getLastProfileEcid: function () {
        return lastProfileEcid;
      },
      runProfileLookup: runProfileLookup,
      patchLastUpsClientData: patchLastUpsClientData,
      runContentDecision: runContentDecision,
      ensureMounts: ensureMounts,
      removeMounts: removeMounts,
      injectTopRibbon: function (decisionData) {
        var doc = getIframeDoc();
        if (!doc || !global.DecisioningEdgeInject) return false;
        return global.DecisioningEdgeInject.injectTopRibbon(decisionData, doc, { layout: mountLayout() });
      },
    };
  }

  function refreshEnabledState() {
    if (isEnabled()) ensureMounts();
    else removeMounts();
  }

  global.DecisioningProfileRuntime = {
    CACHE_BUST: CACHE_BUST,
    init: init,
    getApi: getApi,
    ensureMounts: ensureMounts,
    removeMounts: removeMounts,
    runProfileLookup: runProfileLookup,
    runContentDecision: runContentDecision,
    refreshEnabledState: refreshEnabledState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
