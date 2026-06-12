/**
 * Site-clone decisioning runtime — profile lookup + Edge sendEvent into iframe mounts.
 * Brand-agnostic; page wiring supplies identity + enablement + mount layout preset.
 */
(function (global) {
  'use strict';

  var LOG_PREFIX = '[decisioning-profile-runtime]';
  var CACHE_BUST = '20260614';

  var config = null;
  var lastUpsClientData = null;
  var lastProfileEcid = '';

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

  function getFrame() {
    var id = cfg('iframeId') || 'siteCloneDemoSiteFrame';
    return document.getElementById(id);
  }

  function getIframeDoc() {
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
      dispatchUpdated({ ok: true, ecid: lastProfileEcid });
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
    if (typeof global.CdEdgeMounts.buildSurfacesForEdgeLabPage === 'function') {
      return global.CdEdgeMounts.buildSurfacesForEdgeLabPage();
    }
    return [];
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
    inject.applyDecisioningPropositions(propositions, iframeDoc, { layout: layout });
  }

  async function runContentDecision() {
    if (!isEnabled()) throw new Error('Decisioning is disabled.');
    ensureMounts();
    var ok = await runProfileLookup({ silent: true });
    if (!ok) throw new Error('Profile lookup failed — enter an identifier and look up profile first.');
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
    dispatchUpdated({ ok: true, propositionCount: propositions.length });
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
