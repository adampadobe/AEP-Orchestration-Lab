/**
 * Site-clone decisioning runtime — profile lookup + Edge sendEvent into iframe mounts.
 * Brand-agnostic; page wiring supplies identity + enablement.
 */
(function (global) {
  'use strict';

  var LOG_PREFIX = '[decisioning-profile-runtime]';
  var CACHE_BUST = '20260613';
  var MOUNT_STYLE_ID = 'dpmEdgeMountStyles';
  var MOUNT_ATTR = 'data-dpm-edge-mount';

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
            name: document.title || 'Site clone demo',
            viewName: document.title || 'Site clone demo',
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
    var iframeDoc = getIframeDoc();
    if (
      iframeDoc &&
      typeof global.CdEdgeMounts !== 'undefined' &&
      typeof global.CdEdgeMounts.applyPropositionsManually === 'function'
    ) {
      global.CdEdgeMounts.applyPropositionsManually(propositions, { root: iframeDoc });
    }
    dispatchUpdated({ ok: true, propositionCount: propositions.length });
    return result;
  }

  function findSkyHeroBlockForInject(doc) {
    var main = doc.querySelector('main#app');
    if (!main) return null;
    var hero = main.querySelector('[data-test-id="hero"]');
    if (hero) {
      var node = hero;
      while (node.parentElement && node.parentElement !== main) {
        node = node.parentElement;
      }
      if (node.parentElement === main) return node;
    }
    var i;
    for (i = 0; i < main.children.length; i++) {
      var child = main.children[i];
      if (child && child.querySelector && child.querySelector('[data-test-id="hero"]')) {
        return child;
      }
    }
    return null;
  }

  function findSkyInjectAfterNode(doc) {
    if (!doc) return null;
    var heroBlock = findSkyHeroBlockForInject(doc);
    if (heroBlock) return heroBlock;
    var main = doc.querySelector('main#app');
    return main && main.children.length > 1 ? main.children[1] : main ? main.firstElementChild : null;
  }

  function mountStylesCss() {
    return (
      '#cd-edge-topRibbon{position:relative;z-index:120;width:100%;box-sizing:border-box;}' +
      '#cd-edge-topRibbon:empty{display:none;}' +
      '#cd-edge-hero{position:relative;width:100%;box-sizing:border-box;min-height:0;}' +
      '#cd-edge-hero:empty{display:none;}' +
      '#cd-edge-hero:not(:empty){position:absolute;inset:0;z-index:5;}' +
      '#cd-edge-hero:not(:empty) ~ *{visibility:hidden;}' +
      '#cd-edge-contentCard{position:relative;width:100%;max-width:960px;margin:1rem auto;box-sizing:border-box;}' +
      '#cd-edge-contentCard:empty{display:none;}' +
      '.cd-banner,.cd-edge-ajo-card-inner{border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.12);}' +
      '.cd-slot-title,.cd-edge-ajo-card-title{margin:0;font-size:14px;font-weight:700;}' +
      '.cd-slot-desc,.cd-edge-ajo-card-desc{margin:0;font-size:12px;opacity:0.85;}' +
      '.cd-banner-image,.cd-edge-ajo-card-img{width:100%;max-height:200px;object-fit:cover;display:block;}' +
      '.cd-edge-ajo-iframe{width:100%;min-height:180px;border:0;border-radius:4px;}'
    );
  }

  function ensureMountStyles(doc) {
    if (!doc || doc.getElementById(MOUNT_STYLE_ID)) return;
    var styleEl = doc.createElement('style');
    styleEl.id = MOUNT_STYLE_ID;
    styleEl.setAttribute(MOUNT_ATTR, '1');
    styleEl.textContent = mountStylesCss();
    (doc.head || doc.documentElement).appendChild(styleEl);
  }

  function ensureFragmentAnchor(doc, id) {
    var el = doc.getElementById(id);
    if (el) return el;
    el = doc.createElement('span');
    el.id = id;
    el.hidden = true;
    el.setAttribute(MOUNT_ATTR, '1');
    el.setAttribute('data-dpm-fragment', id);
    doc.body.appendChild(el);
    return el;
  }

  function ensureMountEl(doc, id, className) {
    var el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement('div');
      el.id = id;
      el.setAttribute(MOUNT_ATTR, '1');
      el.setAttribute('role', 'region');
      if (className) el.className = className;
    } else if (className && !el.className) {
      el.className = className;
    }
    return el;
  }

  function insertAfter(parent, node, ref) {
    if (!parent || !node) return;
    if (ref && ref.parentNode === parent) {
      if (ref.nextSibling) parent.insertBefore(node, ref.nextSibling);
      else parent.appendChild(node);
      return;
    }
    parent.appendChild(node);
  }

  function ensureMounts() {
    if (!isEnabled()) return null;
    var doc = getIframeDoc();
    if (!doc || !doc.body) return null;

    ensureMountStyles(doc);
    ensureFragmentAnchor(doc, 'TopRibbon');
    ensureFragmentAnchor(doc, 'hero-banner');
    ensureFragmentAnchor(doc, 'ContentCardContainer');

    var masthead = doc.getElementById('masthead-header');
    var ribbon = ensureMountEl(doc, 'cd-edge-topRibbon', 'cd-edge-mount-body cd-edge-mount-body--ribbon-fixed');
    if (masthead && masthead.parentNode) {
      if (ribbon.parentNode !== masthead.parentNode || ribbon.previousSibling !== masthead) {
        insertAfter(masthead.parentNode, ribbon, masthead);
      }
    } else if (!ribbon.parentNode) {
      doc.body.insertBefore(ribbon, doc.body.firstChild);
    }

    var heroBlock = findSkyHeroBlockForInject(doc);
    if (heroBlock) {
      if (heroBlock.style.position !== 'relative') heroBlock.style.position = 'relative';
      var heroMount = ensureMountEl(doc, 'cd-edge-hero', 'cd-edge-mount-body cd-edge-mount-body--hero cd-banner-wrap');
      if (heroMount.parentNode !== heroBlock) {
        heroBlock.insertBefore(heroMount, heroBlock.firstChild);
      }
    }

    var cardAnchor = findSkyInjectAfterNode(doc);
    var card = ensureMountEl(doc, 'cd-edge-contentCard', 'cd-edge-mount-body');
    if (cardAnchor && cardAnchor.parentNode) {
      if (card.parentNode !== cardAnchor.parentNode || card.previousSibling !== cardAnchor) {
        insertAfter(cardAnchor.parentNode, card, cardAnchor);
      }
    } else if (!card.parentNode) {
      var main = doc.querySelector('main#app');
      if (main) main.appendChild(card);
      else doc.body.appendChild(card);
    }

    return { ribbon: ribbon, hero: doc.getElementById('cd-edge-hero'), contentCard: card };
  }

  function removeMounts() {
    var doc = getIframeDoc();
    if (!doc) return;
    doc.querySelectorAll('[' + MOUNT_ATTR + '="1"]').forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    var heroBlock = findSkyHeroBlockForInject(doc);
    if (heroBlock && heroBlock.style.position === 'relative') heroBlock.style.position = '';
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
