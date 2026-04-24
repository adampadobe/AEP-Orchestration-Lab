/**
 * Decisioning lab (Edge) — profile fetch, Launch inject, Alloy sendEvent / applyPropositions.
 * Expects: CdLabUi, CdLabConfigApi, CdEdgeMounts, AepLabSandboxSync, AepGlobalSandbox, AepIdentityPicker.
 */
(function () {
  'use strict';

  var LS_EMAIL = 'aep-cd-live-email';
  var DEFAULT_EDGE_CONFIG_ID = 'ef0ee758-260c-4596-8a97-d8474d11c0ca';
  /** Dev fallback when no Launch URL is saved yet */
  var EDGE_LAUNCH_DEFAULT = {
    src: 'https://assets.adobedtm.com/60e5fd51ad90/a1f1412e037f/launch-e28cecaab26e-development.min.js',
    datastream: 'ef0ee758-260c-4596-8a97-d8474d11c0ca',
  };
  var EDGE_LAB_PATH = '/profile-viewer/content-decision-live-edge.html';
  var LOG_PREFIX = '[content-decision-live-edge]';

  var CD_BANNER_DEFAULTS = {
    layoutMode: 'overlay',
    blockY: 'flex-end',
    titleH: 'center',
    titleV: 'flex-start',
    descH: 'center',
    descV: 'center',
    ctaH: 'center',
    ctaV: 'flex-end',
    titleColor: '#e6e9ef',
    descColor: '#c5c9d3',
    ctaBg: '#f0f2f6',
    ctaText: '#1a1d23',
  };

  var lastUpsPayload = null;
  var lastUpsClientData = null;
  var lastProfileEcid = '';
  var lastEdgeResult = null;
  var alloyConfiguredFor = '';
  var lastIdentityMapSentForDebug = null;

  function cdLog() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.log.apply(console, args);
  }

  function persistLiveIdentity() {
    var em = document.getElementById('cdLiveEmail');
    var v = em ? em.value.trim() : '';
    try {
      if (v) localStorage.setItem(LS_EMAIL, v);
      else localStorage.removeItem(LS_EMAIL);
    } catch (e) {}
  }

  function getUpsEntityIdNS() {
    var pick =
      typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function'
        ? AepIdentityPicker.getNamespace('cdLiveEmail')
        : 'email';
    var map = { email: 'Email', ecid: 'ECID', phone: 'Phone', crmId: 'CRMId', loyaltyId: 'LoyaltyId' };
    return map[pick] || 'Email';
  }

  function getIdentifierValue() {
    var el = document.getElementById('cdLiveEmail');
    return el ? el.value.trim() : '';
  }

  function clearEdgeMounts() {
    var wrap = document.getElementById('cdEdgeMounts');
    if (!wrap) return;
    var bodies = wrap.querySelectorAll('.cd-edge-mount-body');
    for (var i = 0; i < bodies.length; i++) {
      bodies[i].innerHTML = '';
      bodies[i].classList.remove('cd-banner-wrap');
    }
  }

  function hydrateCdLiveEmailFromRecents() {
    var input = document.getElementById('cdLiveEmail');
    var nsSel = document.getElementById('cdNs');
    if (!input || (input.value || '').trim()) return;
    var ns = nsSel && nsSel.value ? String(nsSel.value).trim().toLowerCase() : 'email';
    try {
      if (typeof getRecentForNamespace === 'function') {
        var rec = getRecentForNamespace(ns);
        if (rec.length) {
          input.value = rec[0];
          return;
        }
      }
    } catch (e) {}
    try {
      var em = localStorage.getItem(LS_EMAIL);
      if (em) input.value = em;
    } catch (e2) {}
  }

  (function initEdgeFieldsFromStorage() {
    try {
      var ec = localStorage.getItem('aep-edge-config-id');
      var sc = localStorage.getItem('aep-decision-scopes');
      var fc = localStorage.getItem('aep-edge-force-configure');
      var eid = document.getElementById('edgeConfigId');
      if (eid) eid.value = ec || DEFAULT_EDGE_CONFIG_ID;
      var ds = document.getElementById('decisionScopes');
      if (ds && sc) ds.value = sc;
      var fcfg = document.getElementById('edgeForceConfigure');
      if (fcfg && fc === '1') fcfg.checked = true;
    } catch (e) {}
  })();

  function persistEdgeFields() {
    var ecEl = document.getElementById('edgeConfigId');
    var scEl = document.getElementById('decisionScopes');
    var fcEl = document.getElementById('edgeForceConfigure');
    var ec = ecEl ? ecEl.value.trim() : '';
    var sc = scEl ? scEl.value.trim() : '';
    var fc = fcEl ? fcEl.checked : false;
    try {
      if (ec) localStorage.setItem('aep-edge-config-id', ec);
      else localStorage.removeItem('aep-edge-config-id');
      if (sc) localStorage.setItem('aep-decision-scopes', sc);
      else localStorage.removeItem('aep-decision-scopes');
      localStorage.setItem('aep-edge-force-configure', fc ? '1' : '0');
    } catch (e) {}
  }

  function parseScopes() {
    var rawEl = document.getElementById('decisionScopes');
    var raw = rawEl ? rawEl.value.trim() : '';
    return raw ? raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
  }

  function getEdgeLabDecisionScopesFromFragments() {
    var placements =
      typeof window.CdLabUi !== 'undefined' && window.CdLabUi.getPlacementsFromForm
        ? window.CdLabUi.getPlacementsFromForm()
        : [];
    if (typeof location === 'undefined') return [];
    var loc = location;
    var h = loc.host;
    var path = (loc.pathname || EDGE_LAB_PATH).split('?')[0];
    if (path.indexOf('/') !== 0) path = '/' + path;
    var base = 'web://' + h + path.split('?')[0];
    return placements.map(function (p) {
      return base + '#' + String(p.fragment).replace(/^#/, '');
    });
  }

  function getEffectiveDecisionScopes() {
    var extra = parseScopes();
    if (extra.length) return extra;
    return getEdgeLabDecisionScopesFromFragments();
  }

  function getPersonalizationPayloads(edgeResult) {
    if (!edgeResult) return { source: 'none', payloads: [] };
    if (Array.isArray(edgeResult.decisions) && edgeResult.decisions.length) {
      return { source: 'decisions', payloads: edgeResult.decisions };
    }
    if (Array.isArray(edgeResult.propositions) && edgeResult.propositions.length) {
      return { source: 'propositions', payloads: edgeResult.propositions };
    }
    return { source: 'none', payloads: [] };
  }

  function waitForAlloy(timeoutMs) {
    var t = timeoutMs || 25000;
    var launchSrc = (window.__cdEdgeLaunchCfg && window.__cdEdgeLaunchCfg.src) || '';
    return new Promise(function (resolve, reject) {
      if (typeof alloy === 'function') return resolve();
      var start = Date.now();
      var id = setInterval(function () {
        if (typeof alloy === 'function') {
          clearInterval(id);
          resolve();
        } else if (Date.now() - start > t) {
          clearInterval(id);
          reject(new Error('Alloy not available after Launch load. ' + launchSrc));
        }
      }, 50);
    });
  }

  function primeWebSdkOnLoad() {
    function setInit(msg, cls) {
      var el = document.getElementById('webSdkInitStatus');
      if (!el) return;
      el.textContent = msg || '';
      el.className = 'status' + (cls ? ' ' + cls : '');
    }
waitForAlloy()
      .then(function () {
        var edgeConfigId = document.getElementById('edgeConfigId');
        var edgeConfig = edgeConfigId ? edgeConfigId.value.trim() : '';
        var forceCfg = document.getElementById('edgeForceConfigure');
        var force = forceCfg && forceCfg.checked;
        if (!force || !edgeConfig) {
          setInit('Web SDK ready — Alloy loaded via Launch (datastream from Web SDK extension unless you force configure).', 'ok');
          return;
        }
        if (alloyConfiguredFor === edgeConfig) {
          setInit('Web SDK ready — Alloy already configured for this datastream.', 'ok');
          return;
        }
        return alloy('configure', { edgeConfigId: edgeConfig })
          .then(function () {
            alloyConfiguredFor = edgeConfig;
            setInit('Web SDK ready — alloy(configure) applied with datastream from this page.', 'ok');
          })
          .catch(function (e) {
            var msg = e && e.message ? String(e.message) : String(e);
            if (/already been configured|only be configured once/i.test(msg)) {
              alloyConfiguredFor = edgeConfig;
              setInit('Web SDK ready — Launch already configured Alloy (skipped duplicate configure).', 'ok');
              return;
            }
            setInit(msg, 'err');
          });
      })
      .catch(function (e) {
        setInit(String(e.message || e), 'err');
      });
  }

  function initSandboxSelectWithReload() {
    var sel = document.getElementById('sandboxSelect');
    if (!sel || typeof AepGlobalSandbox === 'undefined') return;
    AepGlobalSandbox.loadSandboxesIntoSelect(sel).then(function () {
      AepGlobalSandbox.onSandboxSelectChange(sel);
      AepGlobalSandbox.attachStorageSync(sel);
    });
  }

  function beginAfterLaunchInject(cfg) {
    window.__cdEdgeLaunchCfg = cfg;
    window.__cdEdgeLaunchMode = cfg.mode || 'configured';
    primeWebSdkOnLoad();
    initSandboxSelectWithReload();
  }

  function injectLaunchFromConfiguredUrl(opts) {
    var url = '';
    var el = document.getElementById('cdLabLaunchUrl');
    if (el) url = el.value.trim();
    if (!url) url = EDGE_LAUNCH_DEFAULT.src;
    if (typeof CdLabConfigApi === 'undefined' || !CdLabConfigApi.injectLaunchFromUrl) {
      return Promise.reject(new Error('CdLabConfigApi.injectLaunchFromUrl unavailable'));
    }
    return CdLabConfigApi.injectLaunchFromUrl(url, 'cd-edge-launch-script', opts || {}).then(function (u) {
      beginAfterLaunchInject({ src: u, mode: 'configured' });
      if (window.CdLabUi && typeof window.CdLabUi.noteLaunchInjected === 'function') {
        window.CdLabUi.noteLaunchInjected(u);
      }
      cdLog('Launch injected', u);
    });
  }

  // Re-inject the Launch script when the user changes the URL live. We reset
  // the cached datastream-configure marker + the alloy global so the new
  // Launch bundle's Web SDK extension takes over cleanly.
  function reinjectLaunch(opts) {
    try { alloyConfiguredFor = ''; } catch (e) {}
    try { if (typeof window.alloy === 'function') delete window.alloy; } catch (e) {}
    try { if (window.__alloyNS && window.__alloyNS.alloy) delete window.__alloyNS.alloy; } catch (e) {}
    var setInit = function (msg, cls) {
      var el = document.getElementById('webSdkInitStatus');
      if (!el) return;
      el.textContent = msg || '';
      el.className = 'status' + (cls ? ' ' + cls : '');
    };
    setInit('Reloading Launch script…', '');
    // Sandbox switches pass { cacheBust: true } so the new property's Launch
    // bundle is re-downloaded and any cached alloy state is discarded.
    return injectLaunchFromConfiguredUrl(opts || { cacheBust: true }).catch(function (e) {
      setInit('Launch reload failed: ' + (e && e.message || e), 'err');
      throw e;
    });
  }

  window.CdEdgeLab = window.CdEdgeLab || {};
  window.CdEdgeLab.reinjectLaunch = reinjectLaunch;

  function wireFieldListeners() {
    var live = document.getElementById('cdLiveEmail');
    if (live) live.addEventListener('blur', persistLiveIdentity);
    var eid = document.getElementById('edgeConfigId');
    if (eid) eid.addEventListener('blur', persistEdgeFields);
    var ds = document.getElementById('decisionScopes');
    if (ds) ds.addEventListener('blur', persistEdgeFields);
    var fc = document.getElementById('edgeForceConfigure');
    if (fc) fc.addEventListener('change', persistEdgeFields);
  }

  function withSandboxPlatformHeaders(payload) {
    var base = payload && typeof payload === 'object' ? payload : {};
    var sb = '';
    try {
      if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
        sb = String(AepGlobalSandbox.getSandboxName() || '').trim();
      }
    } catch (e) {}
    if (!sb) return base;
    var ph = Object.assign({}, base.platform_headers || {});
    ph['x-sandbox-name'] = sb;
    return Object.assign({}, base, { platform_headers: ph });
  }

  async function aepCall(payload) {
    payload = withSandboxPlatformHeaders(payload);
    cdLog('UPS proxy →', payload.method || 'POST', payload.path || '', payload.params || {});
    var res;
    try {
      res = await fetch('/api/aep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      cdLog('UPS proxy ✗ network', String(e.message || e));
      return { httpOk: false, data: { error: 'Network error calling /api/aep', detail: String(e.message || e) } };
    }
    var text = await res.text();
    var data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e2) {
      data = { error: 'Non-JSON from proxy', detail: text.slice(0, 200) };
    }
    cdLog('UPS proxy ← HTTP', res.status, res.ok ? 'ok' : 'error');
    return { httpOk: res.ok, data: data };
  }

  function extractEntityFromUpsClientData(clientData) {
    if (!clientData || typeof clientData !== 'object') return null;
    var root = clientData.platform_response != null ? clientData.platform_response : clientData;
    if (!root || typeof root !== 'object') return null;
    var keys = Object.keys(root);
    for (var vi = 0; vi < keys.length; vi++) {
      var v = root[keys[vi]];
      if (v && typeof v === 'object' && v.entity && typeof v.entity === 'object') return v.entity;
    }
    if (root.entity && typeof root.entity === 'object') return root.entity;
    return null;
  }

  function buildIdentityMapFromUpsEntity(entity, fallbackEmail) {
    var im = entity && entity.identityMap;
    var out = {};
    if (im && typeof im === 'object') {
      for (var rawKey in im) {
        if (!Object.prototype.hasOwnProperty.call(im, rawKey)) continue;
        var arr = im[rawKey];
        if (!Array.isArray(arr) || !arr.length) continue;
        var pick = null;
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].id) {
            pick = arr[i];
            break;
          }
        }
        if (!pick || !pick.id) continue;
        var nsKey = rawKey;
        if (/^ecid$/i.test(rawKey)) nsKey = 'ECID';
        var entry = { id: String(pick.id).trim(), authenticatedState: pick.authenticatedState || 'ambiguous' };
        if (pick.primary === true || pick.primary === false) entry.primary = pick.primary;
        out[nsKey] = [entry];
      }
    }
    var fe = (fallbackEmail || '').trim();
    if (fe && !Object.keys(out).some(function (k) { return /^email$/i.test(k); })) {
      out.email = [{ id: fe, authenticatedState: 'ambiguous' }];
    }
    var keys = Object.keys(out);
    if (!keys.length) return null;
    var hasEcid = keys.indexOf('ECID') !== -1;
    keys.forEach(function (k) {
      var arr = out[k];
      if (!arr || !arr[0]) return;
      if (hasEcid) arr[0].primary = k === 'ECID';
      else arr[0].primary = true;
    });
    return out;
  }

  function recordEcidFromUpsProfile(clientData) {
    var ecid = extractEcidFromUpsApiResponse(clientData);
    lastProfileEcid = ecid || '';
    return ecid || '';
  }

  function isUpsProfileSuccess(data) {
    if (data == null || typeof data !== 'object') return false;
    if (typeof data.status === 'number' && data.status >= 400) return false;
    var t = data.type;
    if (typeof t === 'string' && (t.indexOf('/errors/') !== -1 || t.indexOf('problem') !== -1)) return false;
    return true;
  }

  function extractEcidFromUpsApiResponse(clientData) {
    if (!clientData || typeof clientData !== 'object') return '';
    var root = clientData.platform_response != null ? clientData.platform_response : clientData;
    var seen = new WeakSet();
    function walk(node, depth) {
      if (!node || typeof node !== 'object' || depth > 10) return '';
      if (seen.has(node)) return '';
      seen.add(node);
      var im = node.identityMap;
      if (im && typeof im === 'object') {
        for (var k in im) {
          if (!/^ecid$/i.test(k)) continue;
          var arr = im[k];
          if (!Array.isArray(arr)) continue;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id) return String(arr[i].id).trim();
          }
        }
      }
      var vals = Object.values(node);
      for (var vi = 0; vi < vals.length; vi++) {
        var v = vals[vi];
        if (v && typeof v === 'object') {
          var f = walk(v, depth + 1);
          if (f) return f;
        }
      }
      return '';
    }
    return walk(root, 0);
  }

  async function fetchProfileByIdentity(ns, id) {
    return aepCall({
      method: 'GET',
      path: '/data/core/ups/access/entities',
      params: { 'schema.name': '_xdm.context.profile', entityId: id, entityIdNS: ns },
    });
  }

  async function runEdgePropositionsSurfaces(opts) {
    opts = opts || {};
    await waitForAlloy();
    var idVal = getIdentifierValue();
    var nsPick =
      typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function'
        ? AepIdentityPicker.getNamespace('cdLiveEmail')
        : 'email';
    var ecidRaw =
      opts.profileEcid !== undefined && opts.profileEcid !== null
        ? String(opts.profileEcid).trim()
        : (lastProfileEcid || '').trim();
    var profile = { ecid: ecidRaw || null, email: nsPick === 'email' ? idVal || null : null };
    var identityMap = CdEdgeMounts.buildIdentityMap(profile, idVal, nsPick);
    lastIdentityMapSentForDebug = identityMap;
    var surfaces = CdEdgeMounts.buildSurfacesForEdgeLabPage();
    var href = typeof location !== 'undefined' ? location.href.split('?')[0] : '';
    var sendOpts = {
      renderDecisions: true,
      personalization: {
        surfaces: surfaces,
        schemas: CdEdgeMounts.PERSONALIZATION_SCHEMAS,
      },
      xdm: {
        identityMap: identityMap,
        web: {
          webPageDetails: {
            URL: href,
            name: 'Decisioning lab (Edge)',
            viewName: 'Decisioning lab (Edge)',
          },
        },
      },
    };
    var result = await alloy('sendEvent', sendOpts);
    var propositions = (result && (result.propositions || result.decisions)) || [];
    try {
      if (typeof alloy === 'function' && propositions.length) {
        await alloy('applyPropositions', { propositions: propositions });
      }
    } catch (e) {
      cdLog('applyPropositions', String(e && e.message ? e.message : e));
    }
    CdEdgeMounts.applyPropositionsManually(propositions);
    // Re-apply any saved surface HTML overrides on top of the live content
    // so the user's custom wrapper/styling survives each decisioning call.
    try {
      if (window.CdLabUi && typeof window.CdLabUi.applySurfaceStylesToMounts === 'function') {
        window.CdLabUi.applySurfaceStylesToMounts();
      }
    } catch (e) { cdLog('applySurfaceStylesToMounts', String(e && e.message || e)); }
    return result;
  }

  async function runEdgePropositionsDecisionScopes(opts) {
    opts = opts || {};
    await waitForAlloy();
    var edgeConfigId = document.getElementById('edgeConfigId');
    var edgeVal = edgeConfigId ? edgeConfigId.value.trim() : '';
    var forceCfg = document.getElementById('edgeForceConfigure');
    var force = forceCfg && forceCfg.checked;
    var decisionScopes = getEffectiveDecisionScopes();
    var idVal = getIdentifierValue();
    var ecidRaw =
      opts.profileEcid !== undefined && opts.profileEcid !== null
        ? String(opts.profileEcid).trim()
        : (lastProfileEcid || '').trim();
    lastIdentityMapSentForDebug = null;
    if (force && edgeVal) {
      if (alloyConfiguredFor !== edgeVal) {
        try {
          await alloy('configure', { edgeConfigId: edgeVal });
        } catch (e) {
          var msg0 = e && e.message ? String(e.message) : String(e);
          if (!/already been configured|only be configured once/i.test(msg0)) throw e;
        }
        alloyConfiguredFor = edgeVal;
      }
    }
    var pageUrl =
      typeof location !== 'undefined' ? location.href : '';
    var xdm = {
      eventType: 'web.webpagedetails.pageViews',
      web: {
        webPageDetails: {
          URL: pageUrl,
          name: 'AEP Profile Viewer — Decisioning lab (Edge)',
        },
      },
    };
    var upsForIdentity =
      opts.upsClientData !== undefined && opts.upsClientData !== null ? opts.upsClientData : lastUpsClientData;
    var identityMapBuilt = null;
    if (upsForIdentity) {
      var ent = extractEntityFromUpsClientData(upsForIdentity);
      if (ent) identityMapBuilt = buildIdentityMapFromUpsEntity(ent, idVal);
    }
    if (!identityMapBuilt && (idVal || ecidRaw)) {
      identityMapBuilt = {};
      var nsPick =
        typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function'
          ? AepIdentityPicker.getNamespace('cdLiveEmail')
          : 'email';
      if (idVal) {
        if (nsPick === 'ecid') {
          identityMapBuilt.ECID = [{ id: idVal, authenticatedState: 'ambiguous', primary: true }];
        } else if (nsPick === 'email') {
          identityMapBuilt.email = [{ id: idVal, authenticatedState: 'ambiguous', primary: true }];
        } else {
          var k =
            nsPick === 'phone' ? 'Phone' : nsPick === 'crmId' ? 'CRMId' : nsPick === 'loyaltyId' ? 'LoyaltyId' : 'email';
          identityMapBuilt[k] = [{ id: idVal, authenticatedState: 'ambiguous', primary: true }];
        }
      }
      if (ecidRaw && !identityMapBuilt.ECID) {
        identityMapBuilt.ECID = [{ id: ecidRaw, authenticatedState: 'ambiguous', primary: !idVal }];
      }
      if (identityMapBuilt.ECID && identityMapBuilt.email) {
        identityMapBuilt.ECID[0].primary = true;
        identityMapBuilt.email[0].primary = false;
      }
    }
    if (identityMapBuilt && Object.keys(identityMapBuilt).length) {
      xdm.identityMap = identityMapBuilt;
      lastIdentityMapSentForDebug = identityMapBuilt;
    }
    var sendOpts = { renderDecisions: false, xdm: xdm };
    if (decisionScopes.length) {
      sendOpts.personalization = { decisionScopes: decisionScopes };
    }
    var result = await alloy('sendEvent', sendOpts);
    var propositionsOut = (result && (result.propositions || result.decisions)) || [];
    if (typeof CdEdgeMounts !== 'undefined' && CdEdgeMounts.applyPropositionsManually) {
      CdEdgeMounts.applyPropositionsManually(propositionsOut);
    }
    try {
      if (window.CdLabUi && typeof window.CdLabUi.applySurfaceStylesToMounts === 'function') {
        window.CdLabUi.applySurfaceStylesToMounts();
      }
    } catch (e) { cdLog('applySurfaceStylesToMounts', String(e && e.message || e)); }
    return result;
  }

  async function runEdgePropositions(opts) {
    opts = opts || {};
    if (typeof window.CdLabUi !== 'undefined' && window.CdLabUi.applyPlacementsToMountsModule) {
      window.CdLabUi.applyPlacementsToMountsModule();
    }
    persistEdgeFields();
    clearEdgeMounts();
    var mode =
      typeof window.CdLabUi !== 'undefined' && typeof window.CdLabUi.getEdgePersonalizationMode === 'function'
        ? window.CdLabUi.getEdgePersonalizationMode()
        : 'surfaces';
    if (mode === 'surfaces') {
      return runEdgePropositionsSurfaces(opts);
    }
    return runEdgePropositionsDecisionScopes(opts);
  }

  function journeyVisualFromEdgeResult(edgeResult) {
    var pay = getPersonalizationPayloads(edgeResult);
    var payloads = pay.payloads || [];
    for (var pi = 0; pi < payloads.length; pi++) {
      var prop = payloads[pi];
      var items = prop.items || [];
      for (var ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        var cand = item.data;
        if (cand && typeof cand === 'object') {
          var jd = extractJourneyContentDecision(cand);
          if (jd) return jd;
          if (cand.content) {
            jd = extractJourneyContentDecision({ content: cand.content });
            if (jd) return jd;
          }
        }
        var nested = deepFindOfferContentNode(item, 0);
        if (nested) {
          jd = extractJourneyContentDecision({ content: nested });
          if (jd) return jd;
        }
      }
    }
    return null;
  }

  function deepFindOfferContentNode(obj, depth) {
    if (depth > 14 || obj == null || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var f = deepFindOfferContentNode(obj[i], depth + 1);
        if (f) return f;
      }
      return null;
    }
    var c = obj.content;
    if (c && c.mediaAssets && typeof c.mediaAssets === 'object' && c.textContent && typeof c.textContent === 'object')
      return c;
    var keys = Object.keys(obj);
    for (var ki = 0; ki < keys.length; ki++) {
      var f2 = deepFindOfferContentNode(obj[keys[ki]], depth + 1);
      if (f2) return f2;
    }
    return null;
  }

  function pickHeroSourceUrlFromMediaAssets(mediaAssets) {
    if (!mediaAssets || typeof mediaAssets !== 'object') return '';
    var order = ['imageHighRes', 'imageMediumRes', 'imageSmallRes', 'thumbnail', 'videoAsset'];
    for (var oi = 0; oi < order.length; oi++) {
      var a = mediaAssets[order[oi]];
      if (a && a.sourceURL) return String(a.sourceURL).trim();
    }
    var keys = Object.keys(mediaAssets);
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      var a2 = mediaAssets[k];
      if (a2 && a2.sourceURL) return String(a2.sourceURL).trim();
    }
    return '';
  }

  function extractJourneyContentDecision(raw) {
    var obj = raw;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        return null;
      }
    }
    if (!obj || typeof obj !== 'object') return null;
    var content = deepFindOfferContentNode(obj, 0);
    if (!content) return null;
    var tc = content.textContent || {};
    var ma = content.mediaAssets || {};
    var nav = content.navigation || {};
    var imageUrl = pickHeroSourceUrlFromMediaAssets(ma);
    var ctaHref = '';
    if (ma.imageHighRes && ma.imageHighRes.destinationURL) ctaHref = String(ma.imageHighRes.destinationURL).trim();
    if (!ctaHref && nav.webUrl) ctaHref = String(nav.webUrl).trim();
    if (!ctaHref && nav.internalUrl) ctaHref = String(nav.internalUrl).trim();
    var bannerTitle = tc.bannerTitle != null ? String(tc.bannerTitle) : '';
    var fullDescription =
      tc.fullDescription != null ? String(tc.fullDescription) : tc.fullTitle != null ? String(tc.fullTitle) : '';
    var bannerCTA = tc.bannerCTA != null ? String(tc.bannerCTA) : tc.fullCTA != null ? String(tc.fullCTA) : 'Learn more';
    if (!imageUrl && !bannerTitle && !fullDescription) return null;
    return {
      imageUrl: imageUrl,
      bannerTitle: bannerTitle,
      fullDescription: fullDescription,
      bannerCTA: bannerCTA,
      ctaHref: ctaHref,
    };
  }

  function applyDefaultHeroBannerLayout() {
    var wrap = document.getElementById('cd-edge-hero');
    if (!wrap || wrap.hidden) return;
    var st = CD_BANNER_DEFAULTS;
    var banner = wrap.querySelector('.cd-banner');
    if (banner) {
      var mode = st.layoutMode;
      banner.classList.remove('cd-banner--overlay', 'cd-banner--half', 'cd-banner--below');
      banner.classList.add('cd-banner--' + mode);
      wrap.classList.toggle('cd-banner-wrap--half-bridge', mode === 'half');
    }
    var copyEl = wrap.querySelector('.cd-banner-copy');
    if (copyEl) copyEl.style.setProperty('--cd-block-justify', st.blockY);
    wrap.style.setProperty('--cd-title-color', st.titleColor);
    wrap.style.setProperty('--cd-desc-color', st.descColor);
    wrap.style.setProperty('--cd-cta-bg', st.ctaBg);
    wrap.style.setProperty('--cd-cta-text', st.ctaText);
    var titleSlot = wrap.querySelector('.cd-slot--title');
    var descSlot = wrap.querySelector('.cd-slot--desc');
    var ctaSlot = wrap.querySelector('.cd-slot--cta');
    if (titleSlot) {
      titleSlot.style.setProperty('--cd-slot-justify', st.titleH);
      titleSlot.style.setProperty('--cd-slot-align', st.titleV);
    }
    if (descSlot) {
      descSlot.style.setProperty('--cd-slot-justify', st.descH);
      descSlot.style.setProperty('--cd-slot-align', st.descV);
    }
    if (ctaSlot) {
      ctaSlot.style.setProperty('--cd-slot-justify', st.ctaH);
      ctaSlot.style.setProperty('--cd-slot-align', st.ctaV);
    }
  }

  function withBannerImageCacheBust(jd) {
    if (!jd || !jd.imageUrl) return jd;
    var u = String(jd.imageUrl).trim();
    if (!u) return jd;
    var lower = u.slice(0, 5).toLowerCase();
    if (lower === 'data:' || lower === 'blob:') return jd;
    var sep = u.indexOf('?') >= 0 ? '&' : '?';
    return Object.assign({}, jd, { imageUrl: u + sep + '_cdcb=' + Date.now() });
  }

  function renderJourneyContentDecisionBanner(jd) {
    var wrap = document.getElementById('cd-edge-hero');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.classList.remove('cd-banner-wrap');
    if (!jd) {
      cdLog('Banner render: cleared (no data)');
      return;
    }
    cdLog('Banner render: DOM updated');
    wrap.classList.add('cd-banner-wrap');
    var banner = document.createElement('div');
    banner.className = 'cd-banner' + (jd.imageUrl ? '' : ' cd-banner--no-image');
    var figure = document.createElement('div');
    figure.className = 'cd-banner-figure' + (jd.imageUrl ? '' : ' cd-banner-figure--empty');
    if (jd.imageUrl) {
      figure.setAttribute('role', 'img');
      figure.setAttribute('aria-label', jd.bannerTitle ? 'Hero: ' + jd.bannerTitle : 'Hero image');
      figure.style.backgroundImage = 'url(' + JSON.stringify(jd.imageUrl) + ')';
    }
    var scrim = document.createElement('div');
    scrim.className = 'cd-banner-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    var copy = document.createElement('div');
    copy.className = 'cd-banner-copy';
    if (jd.bannerTitle) {
      var st = document.createElement('div');
      st.className = 'cd-slot cd-slot--title';
      var h = document.createElement('h2');
      h.className = 'cd-banner-title';
      h.textContent = jd.bannerTitle;
      st.appendChild(h);
      copy.appendChild(st);
    }
    if (jd.fullDescription) {
      var sd = document.createElement('div');
      sd.className = 'cd-slot cd-slot--desc';
      var p = document.createElement('p');
      p.className = 'cd-banner-desc';
      p.textContent = jd.fullDescription;
      sd.appendChild(p);
      copy.appendChild(sd);
    }
    if (jd.bannerCTA) {
      var sc = document.createElement('div');
      sc.className = 'cd-slot cd-slot--cta';
      if (jd.ctaHref) {
        var a = document.createElement('a');
        a.className = 'cd-banner-cta';
        a.href = jd.ctaHref;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = jd.bannerCTA;
        sc.appendChild(a);
      } else {
        var span = document.createElement('span');
        span.className = 'cd-banner-cta cd-banner-cta--ghost';
        span.textContent = jd.bannerCTA;
        sc.appendChild(span);
      }
      copy.appendChild(sc);
    }
    banner.appendChild(figure);
    banner.appendChild(scrim);
    banner.appendChild(copy);
    wrap.appendChild(banner);
    applyDefaultHeroBannerLayout();
  }

  function rememberCdLiveIdentifierAfterProfileOk() {
    var idVal = getIdentifierValue();
    if (!idVal) return;
    var ns =
      typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function'
        ? AepIdentityPicker.getNamespace('cdLiveEmail')
        : (document.getElementById('cdNs') && document.getElementById('cdNs').value) || 'email';
    if (typeof addRecentIdentifier === 'function') {
      addRecentIdentifier(idVal, String(ns || 'email').trim().toLowerCase());
    }
  }

  async function runProfileAndEdgeDecisions() {
    persistLiveIdentity();
    var idVal = getIdentifierValue();
    var upsNs = getUpsEntityIdNS();
    var st = document.getElementById('profileStatus');
    var edgeSt = document.getElementById('edgeStatus');
    var rawEdge = document.getElementById('edgeResultRaw');
    cdLog('Profile → Edge: start', upsNs);
    edgeSt.textContent = '';
    edgeSt.className = 'status';
    if (!idVal) {
      st.textContent = 'Enter an identifier for the selected namespace.';
      st.className = 'status err';
      return false;
    }
    st.textContent = 'Fetching profile…';
    st.className = 'status';
    var r = await fetchProfileByIdentity(upsNs, idVal);
    lastUpsPayload = r.data;
    lastUpsClientData = r.data;
    document.getElementById('profileRaw').textContent = JSON.stringify(r.data, null, 2);
    if (!r.httpOk || !isUpsProfileSuccess(r.data)) {
      cdLog('Profile → Edge ✗ profile failed');
      st.textContent = 'Profile failed — check identifier, namespace, and sandbox.';
      st.className = 'status err';
      lastUpsClientData = null;
      lastProfileEcid = '';
      document.getElementById('ecidHint').textContent = '';
      if (rawEdge) rawEdge.textContent = '{}';
      return false;
    }
    var ecid = recordEcidFromUpsProfile(r.data);
    document.getElementById('ecidHint').textContent = ecid
      ? 'ECID from UPS (sent on Edge): ' + ecid
      : 'No ECID in payload — Edge may rely on the primary identifier only.';
    st.textContent = 'Profile OK — requesting Edge…';
    st.className = 'status ok';
    rememberCdLiveIdentifierAfterProfileOk();
    edgeSt.textContent = 'Loading Alloy / Edge…';
    try {
      var edgeResult = await runEdgePropositions({ upsClientData: r.data, profileEcid: ecid });
      lastEdgeResult = edgeResult;
      if (rawEdge) {
        try {
          rawEdge.textContent = JSON.stringify(edgeResult, null, 2);
        } catch (e) {
          rawEdge.textContent = String(edgeResult);
        }
      }
      var jd = journeyVisualFromEdgeResult(edgeResult);
      var heroMount = document.getElementById('cd-edge-hero');
      if (jd && heroMount && !heroMount.querySelector('.cd-banner')) {
        renderJourneyContentDecisionBanner(withBannerImageCacheBust(jd));
        cdLog('Profile → Edge ✓ structured hero from Edge payload (mount was empty)');
      } else if (jd) {
        cdLog('Profile → Edge ✓ (structured hero skipped — mount already has proposition content)');
      } else {
        cdLog('Profile → Edge ✓ (no structured offer hero — check mounts + raw JSON)');
      }
      edgeSt.textContent = 'Edge response received.';
      edgeSt.className = 'status ok';
      return true;
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      cdLog('Profile → Edge ✗', msg);
      edgeSt.textContent = msg;
      edgeSt.className = 'status err';
      if (rawEdge) rawEdge.textContent = JSON.stringify({ error: msg }, null, 2);
      lastEdgeResult = null;
      return false;
    }
  }

  async function runFullContentDecisionPipeline() {
    var pipe = document.getElementById('cdPipelineStatus');
    function setPipe(msg, cls) {
      if (!pipe) return;
      pipe.textContent = msg || '';
      pipe.className = 'status' + (cls ? ' ' + cls : '');
    }
    setPipe('Starting…');
    var ok = await runProfileAndEdgeDecisions();
    if (!ok) {
      setPipe('Stopped — check Profile / Edge status below.', 'err');
      return;
    }
    setPipe('Done — check the preview placement mounts above.');
  }

  function initWorkflowDock() {
    var mainEl = document.querySelector('main.dashboard-main.cd-main');
    var dockOuter = document.getElementById('workflowDockOuter');
    var drawer = document.getElementById('workflowDrawer');
    var hit = document.getElementById('workflowDockHit');
    if (!mainEl || !dockOuter) return;

    var PEEK_PX = 40;
    var peekRaf = null;
    var lastX = 0;
    var lastY = 0;

    function alignWorkflowDock() {
      var r = mainEl.getBoundingClientRect();
      dockOuter.style.left = Math.max(0, r.left) + 'px';
      dockOuter.style.width = Math.min(r.width, window.innerWidth) + 'px';
    }

    function setPeekFromPoint(clientX, clientY) {
      if (drawer && drawer.open) {
        dockOuter.classList.add('workflow-dock-outer--peek');
        return;
      }
      var r = mainEl.getBoundingClientRect();
      var nearBottom = clientY >= window.innerHeight - PEEK_PX;
      var inMain = clientX >= r.left && clientX <= r.right;
      if (nearBottom && inMain) {
        dockOuter.classList.add('workflow-dock-outer--peek');
      } else {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    }

    function onMouseMove(e) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (peekRaf) return;
      peekRaf = window.requestAnimationFrame(function () {
        peekRaf = null;
        setPeekFromPoint(lastX, lastY);
      });
    }

    alignWorkflowDock();
    try {
      var ro = new ResizeObserver(alignWorkflowDock);
      ro.observe(mainEl);
    } catch (e) {}
    window.addEventListener('resize', alignWorkflowDock);

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () {
      if (drawer && !drawer.open) {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    });

    if (drawer) {
      drawer.addEventListener('toggle', function () {
        if (drawer.open) {
          dockOuter.classList.add('workflow-dock-outer--peek');
        } else {
          setPeekFromPoint(lastX, lastY);
        }
      });
    }

    if (hit) {
      hit.addEventListener(
        'touchstart',
        function () {
          dockOuter.classList.add('workflow-dock-outer--peek');
        },
        { passive: true }
      );
    }
  }

  function onSandboxSyncedReloadConfig() {
    if (typeof window.CdLabUi === 'undefined' || !window.CdLabUi.fetchConfigFromFirebase) return;
    window.CdLabUi.fetchConfigFromFirebase().then(function () {
      // Sandbox swap can change the Launch property entirely, so force a full
      // reinject (clears alloy + datastream-configure cache) rather than a
      // lightweight script swap.
      return reinjectLaunch();
    }).catch(function (e) {
      cdLog('Sandbox sync reload failed', String(e.message || e));
    });
  }

  function boot() {
    wireFieldListeners();
    initWorkflowDock();

    document.getElementById('btnFetchProfile').addEventListener('click', async function () {
      persistLiveIdentity();
      var idVal = getIdentifierValue();
      var upsNs = getUpsEntityIdNS();
      var st = document.getElementById('profileStatus');
      var hint = document.getElementById('ecidHint');
      cdLog('Fetch profile only: start', { namespace: upsNs });
      st.textContent = 'Loading…';
      st.className = 'status';
      if (!idVal) {
        st.textContent = 'Enter an identifier for the selected namespace.';
        st.className = 'status err';
        return;
      }
      var r = await fetchProfileByIdentity(upsNs, idVal);
      lastUpsPayload = r.data;
      lastUpsClientData = r.data;
      document.getElementById('profileRaw').textContent = JSON.stringify(r.data, null, 2);
      if (!r.httpOk || !isUpsProfileSuccess(r.data)) {
        st.textContent = 'Profile not found or UPS error — check identifier and sandbox.';
        st.className = 'status err';
        hint.textContent = '';
        lastUpsClientData = null;
        lastProfileEcid = '';
        return;
      }
      var ecid = recordEcidFromUpsProfile(r.data);
      cdLog('Fetch profile only ✓', { ecid: ecid ? ecid.slice(0, 8) + '…' : null });
      st.textContent = 'Profile loaded.';
      st.className = 'status ok';
      rememberCdLiveIdentifierAfterProfileOk();
      hint.textContent = ecid ? 'ECID in profile: ' + ecid : 'No ECID in identityMap; journey may still key on the primary id.';
    });

    document.getElementById('btnProfileAndEdge').addEventListener('click', async function () {
      await runProfileAndEdgeDecisions();
    });

    document.getElementById('btnRunFullContentDecision').addEventListener('click', async function () {
      var btn = this;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await runFullContentDecisionPipeline();
      } catch (e) {
        cdLog('Full pipeline ✗', String(e.message || e));
        var p = document.getElementById('cdPipelineStatus');
        if (p) {
          p.textContent = String(e.message || e);
          p.className = 'status err';
        }
      } finally {
        btn.disabled = false;
      }
    });

    var authChain = Promise.resolve(null);
    if (typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.whenReady) {
      authChain = AepLabSandboxSync.whenReady;
    }
    authChain
      .then(function () {
        if (typeof AepIdentityPicker !== 'undefined' && AepIdentityPicker.init) {
          AepIdentityPicker.init('cdLiveEmail', 'cdNs');
        }
        if (typeof attachEmailDatalist === 'function') {
          attachEmailDatalist('cdLiveEmail', 'cdLiveEmailRecent', 'cdNs');
        }
        hydrateCdLiveEmailFromRecents();
        return typeof window.CdLabUi !== 'undefined' && window.CdLabUi.bootstrapAfterAuth
          ? window.CdLabUi.bootstrapAfterAuth()
          : null;
      })
      .then(function () {
        return injectLaunchFromConfiguredUrl();
      })
      .then(function () {
        cdLog('initialized — filter console by', LOG_PREFIX);
      })
      .catch(function (e) {
        var st = document.getElementById('webSdkInitStatus');
        if (st) {
          st.textContent = String(e.message || e);
          st.className = 'status err';
        }
        cdLog('Boot failed', String(e.message || e));
      });

    window.addEventListener('aep-lab-sandbox-synced', onSandboxSyncedReloadConfig);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
