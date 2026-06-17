/**
 * Site-clone decisioning runtime — profile lookup + Edge sendEvent into iframe mounts.
 * Brand-agnostic; page wiring supplies identity + enablement + mount layout preset.
 */
(function (global) {
  'use strict';

  var LOG_PREFIX = '[decisioning-profile-runtime]';
  var CACHE_BUST = '20260617-alloy-ready';

  var config = null;
  var lastUpsClientData = null;
  var lastProfileEcid = '';
  var labConfigRecord = null;
  var labConfigLoadPromise = null;
  var autoLookupInFlight = null;
  var autoLookupLastKey = '';

  function lookupIdentityKey() {
    var idVal =
      typeof cfg('getIdentifierValue') === 'function' ? String(cfg('getIdentifierValue')() || '').trim() : '';
    var ns =
      typeof cfg('getNamespace') === 'function' ? String(cfg('getNamespace')() || 'email').trim().toLowerCase() : 'email';
    var sandbox =
      typeof cfg('getSandboxName') === 'function' ? String(cfg('getSandboxName')() || '').trim() : '';
    return sandbox + '\u0001' + ns + '\u0001' + idVal;
  }

  function hasCachedProfileForCurrentIdentity() {
    if (!lastUpsClientData || !isUpsOk(lastUpsClientData)) return false;
    return lookupIdentityKey() === autoLookupLastKey;
  }

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
      dispatchUpdated({ ok: false, reason: 'missing-identifier', loading: false });
      return false;
    }
    var qs = new URLSearchParams({ namespace: ns, identifier: idVal });
    if (sandbox) qs.set('sandbox', sandbox);
    dispatchUpdated({ loading: true });
    try {
      var res = await fetch('/api/profile/table?' + qs.toString(), { headers: { Accept: 'application/json' } });
      var data = await res.json().catch(function () {
        return {};
      });
      lastUpsClientData = data;
      autoLookupLastKey = lookupIdentityKey();
      if (!res.ok || !isUpsOk(data)) {
        lastUpsClientData = null;
        lastProfileEcid = '';
        dispatchUpdated({ ok: false, loading: false });
        return false;
      }
      lastProfileEcid = extractEcidFromUps(data);
      dispatchUpdated({ ok: true, ecid: lastProfileEcid, skipHydrate: !!opts.skipHydrate, loading: false });
      return true;
    } catch (e) {
      lastUpsClientData = null;
      lastProfileEcid = '';
      dispatchUpdated({ ok: false, error: String(e && e.message ? e.message : e), loading: false });
      return false;
    }
  }

  /**
   * Coalesced profile prefetch — safe to call from panel open, toggle enable, sandbox change.
   * @param {string} [reason]
   */
  async function maybeAutoLookup(reason) {
    if (!isEnabled()) return false;
    var key = lookupIdentityKey();
    var idVal = key.split('\u0001')[2] || '';
    if (!idVal) return false;
    if (autoLookupInFlight) return autoLookupInFlight;
    if (key === autoLookupLastKey && hasCachedProfileForCurrentIdentity()) return true;
    log('maybeAutoLookup', reason || 'unspecified', { sandbox: key.split('\u0001')[0], ns: key.split('\u0001')[1] });
    autoLookupInFlight = runProfileLookup({ silent: true }).finally(function () {
      autoLookupInFlight = null;
    });
    return autoLookupInFlight;
  }

  function invalidateProfileLookupCache() {
    autoLookupLastKey = '';
    lastUpsClientData = null;
    lastProfileEcid = '';
  }

  function stripUrlQueryHash(raw) {
    return String(raw || '')
      .trim()
      .split('#')[0]
      .split('?')[0];
  }

  /** Same-origin iframe journey path, or resolved src when navigation is not readable yet. */
  function getIframePageUrl() {
    if (useParentDocument()) return '';
    var frame = getFrame();
    if (!frame) return '';
    try {
      var win = frame.contentWindow;
      if (win && win.location && win.location.href) {
        return stripUrlQueryHash(win.location.href);
      }
    } catch (_e) {}
    var src = frame.getAttribute('src');
    if (!src) return '';
    try {
      return stripUrlQueryHash(new URL(src, global.location && global.location.href ? global.location.href : undefined).href);
    } catch (_e2) {
      return '';
    }
  }

  /**
   * Resolve AJO target page URL for personalization surfaces.
   * Journey shells (iframe src ≠ shell pathname) must use the iframe URL, not parent location.
   */
  function getEffectiveTargetPageUrl() {
    if (typeof cfg('getTargetPageUrl') === 'function') {
      var fromFn = stripUrlQueryHash(cfg('getTargetPageUrl')());
      if (fromFn) return fromFn;
    }
    var explicit = stripUrlQueryHash(cfg('targetPageUrl'));
    if (explicit) return explicit;
    var iframeUrl = getIframePageUrl();
    if (iframeUrl) return iframeUrl;
    if (labConfigRecord && labConfigRecord.targetPageUrl) {
      return stripUrlQueryHash(labConfigRecord.targetPageUrl);
    }
    return '';
  }

  function buildSurfacesForPage() {
    if (typeof global.CdEdgeMounts === 'undefined') return [];
    var urls = [];
    function addUrl(raw) {
      var u = stripUrlQueryHash(raw);
      if (u && urls.indexOf(u) === -1) urls.push(u);
    }
    // Journey iframe URL first — lab targetPageUrl may still point at the shell page.
    addUrl(getEffectiveTargetPageUrl());
    if (labConfigRecord && labConfigRecord.targetPageUrl) addUrl(labConfigRecord.targetPageUrl);
    if (global.location && global.location.href) addUrl(global.location.href);
    var surfaces = [];
    var ui;
    for (ui = 0; ui < urls.length; ui++) {
      if (typeof global.CdEdgeMounts.buildSurfacesFromPageUrl !== 'function') continue;
      var built = global.CdEdgeMounts.buildSurfacesFromPageUrl(urls[ui]);
      var bi;
      for (bi = 0; bi < built.length; bi++) {
        if (surfaces.indexOf(built[bi]) === -1) surfaces.push(built[bi]);
      }
    }
    if (surfaces.length) return surfaces;
    if (typeof global.CdEdgeMounts.buildSurfacesForEdgeLabPage === 'function') {
      return global.CdEdgeMounts.buildSurfacesForEdgeLabPage();
    }
    return [];
  }

  function resolvePersonalizationPageUrl() {
    var effective = getEffectiveTargetPageUrl();
    if (effective) return effective;
    if (global.location) return stripUrlQueryHash(global.location.href);
    return '';
  }

  function countAppliedMounts(doc) {
    if (!doc) return { topRibbon: false, hero: false, contentCard: false, filled: 0 };
    if (
      global.DecisioningEdgeInject &&
      typeof global.DecisioningEdgeInject.countFilledDecisioningMounts === 'function'
    ) {
      return global.DecisioningEdgeInject.countFilledDecisioningMounts(doc);
    }
    return { topRibbon: false, hero: false, contentCard: false, filled: 0 };
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
        applySavedSurfaceStyles();
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

  function applySavedSurfaceStyles() {
    if (!isEnabled()) return;
    ensureMounts();
    var doc = getIframeDoc();
    if (!doc || !global.DecisioningEdgeInject) return;
    var styles = labConfigRecord && labConfigRecord.surfaceStyles;
    if (!styles || typeof styles !== 'object') return;
    global.DecisioningEdgeInject.applySurfaceStyles(doc, styles);
  }

  function getLabConfigRecord() {
    return labConfigRecord;
  }

  function updateSurfaceStyles(surfaceStyles, opts) {
    opts = opts || {};
    if (!labConfigRecord) labConfigRecord = {};
    labConfigRecord.surfaceStyles =
      surfaceStyles && typeof surfaceStyles === 'object' && !Array.isArray(surfaceStyles)
        ? Object.assign({}, surfaceStyles)
        : {};
    applySavedSurfaceStyles();
    if (!opts.skipSave && global.CdLabConfigApi && typeof global.CdLabConfigApi.saveDecisionLabConfig === 'function') {
      return global.CdLabConfigApi.saveDecisionLabConfig({ surfaceStyles: labConfigRecord.surfaceStyles });
    }
    return Promise.resolve({ ok: true });
  }

  function wireIframeMountRetries() {
    if (useParentDocument()) {
      var onDomReady = function () {
        if (isEnabled()) {
          ensureMounts();
          applySavedSurfaceStyles();
        }
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
      if (!isEnabled()) return;
      ensureLabConfigLoaded()
        .then(function () {
          ensureMounts();
          applySavedSurfaceStyles();
        })
        .catch(function () {
          ensureMounts();
          applySavedSurfaceStyles();
        });
    };
    try {
      if (frame.contentDocument && frame.contentDocument.body) onReady();
    } catch (_e) {}
    frame.addEventListener('load', onReady);
  }

  function resolveAlloyFn() {
    if (typeof global.alloy === 'function') return global.alloy;
    var frame = getFrame();
    if (!frame) return null;
    try {
      var win = frame.contentWindow;
      if (win && typeof win.alloy === 'function') return win.alloy;
    } catch (_e) {}
    return null;
  }

  async function waitForAlloy(maxMs) {
    var storagePrefix = typeof cfg('tagsStoragePrefix') === 'string' ? String(cfg('tagsStoragePrefix') || '').trim() : '';
    if (global.DemoTagsInjection && typeof global.DemoTagsInjection.ensureAlloyReady === 'function') {
      return global.DemoTagsInjection.ensureAlloyReady({
        timeoutMs: maxMs || 30000,
        storagePrefix: storagePrefix,
      });
    }
    var deadline = Date.now() + (maxMs || 30000);
    while (Date.now() < deadline) {
      var alloy = resolveAlloyFn();
      if (alloy) return alloy;
      await new Promise(function (r) {
        setTimeout(r, 150);
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
      var ok = await maybeAutoLookup('content-decision');
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
    var href = resolvePersonalizationPageUrl();
    if (!href && global.location) href = stripUrlQueryHash(global.location.href);
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
    var appliedMounts = countAppliedMounts(getIframeDoc());
    var appliedCount = propositions.length;
    dispatchUpdated({
      ok: true,
      propositionCount: appliedCount,
      appliedMounts: appliedMounts,
      skipHydrate: true,
    });
    if (!appliedCount) {
      log('sendEvent returned no propositions', { surfaces: surfaces.length, href: href });
    } else if (appliedMounts.filled === 0) {
      log('propositions returned but no mounts rendered', {
        surfaces: surfaces.length,
        href: href,
        propositionCount: appliedCount,
      });
    }
    return Object.assign({}, result || {}, {
      propositions: propositions,
      appliedMounts: appliedMounts,
      personalizationPageUrl: href,
      surfaces: surfaces,
    });
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
        invalidateProfileLookupCache();
        labConfigRecord = null;
        labConfigLoadPromise = loadLabConfig().then(function () {
          applySavedSurfaceStyles();
          if (isEnabled()) void maybeAutoLookup('sandbox-change');
          return labConfigRecord;
        });
      });
    } catch (_e) {}
    if (isEnabled()) void maybeAutoLookup('runtime-init');
    labConfigLoadPromise.then(function () {
      if (isEnabled()) {
        ensureMounts();
        applySavedSurfaceStyles();
      } else {
        removeMounts();
      }
    });
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
      maybeAutoLookup: maybeAutoLookup,
      invalidateProfileLookupCache: invalidateProfileLookupCache,
      isProfileLookupInFlight: function () {
        return !!autoLookupInFlight;
      },
      patchLastUpsClientData: patchLastUpsClientData,
      runContentDecision: runContentDecision,
      ensureMounts: ensureMounts,
      removeMounts: removeMounts,
      injectTopRibbon: function (decisionData) {
        var doc = getIframeDoc();
        if (!doc || !global.DecisioningEdgeInject) return false;
        return global.DecisioningEdgeInject.injectTopRibbon(decisionData, doc, { layout: mountLayout() });
      },
      applySavedSurfaceStyles: applySavedSurfaceStyles,
      getLabConfigRecord: getLabConfigRecord,
      updateSurfaceStyles: updateSurfaceStyles,
    };
  }

  function refreshEnabledState() {
    if (isEnabled()) {
      ensureMounts();
      applySavedSurfaceStyles();
      void maybeAutoLookup('enabled');
    } else removeMounts();
  }

  global.DecisioningProfileRuntime = {
    CACHE_BUST: CACHE_BUST,
    init: init,
    getApi: getApi,
    ensureMounts: ensureMounts,
    removeMounts: removeMounts,
    runProfileLookup: runProfileLookup,
    maybeAutoLookup: maybeAutoLookup,
    invalidateProfileLookupCache: invalidateProfileLookupCache,
    runContentDecision: runContentDecision,
    refreshEnabledState: refreshEnabledState,
    applySavedSurfaceStyles: applySavedSurfaceStyles,
    getLabConfigRecord: getLabConfigRecord,
    updateSurfaceStyles: updateSurfaceStyles,
  };
})(typeof window !== 'undefined' ? window : globalThis);
