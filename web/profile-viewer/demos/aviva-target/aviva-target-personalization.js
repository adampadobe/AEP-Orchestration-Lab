/**
 * Adobe Target / Web SDK personalization for the Aviva car insurance journey.
 * Requires alloy from your Launch property (injected via aviva-target-demo.html lab strip).
 *
 * Override scopes: window.AvivaTargetDemoConfig = { decisionScopes: ['your-scope-name'] };
 */
(function (global) {
  'use strict';

  var VIEW_SCOPE = '__view__';
  var PERSONALIZATION_SCHEMAS = [
    'https://ns.adobe.com/personalization/default-content-item',
    'https://ns.adobe.com/personalization/html-content-item',
    'https://ns.adobe.com/personalization/json-content-item',
    'https://ns.adobe.com/personalization/dom-action',
    'https://ns.adobe.com/personalization/message/content-card',
  ];

  var DEFAULT_SCOPES_BY_PAGE = {
    'index.html': ['aviva-landing-hero', 'aviva-landing-quote-cta'],
    'step1-registration.html': ['aviva-step1-registration'],
    'step1-vehicle-details.html': ['aviva-step1-vehicle'],
    'driver-details.html': ['aviva-step2-driver'],
    'additional-information.html': ['aviva-step3-assumptions', 'aviva-step3-continue-cta'],
    'driver-quote.html': ['aviva-step4-quote-price', 'aviva-step4-quote-cta'],
  };

  var refreshTimer = null;
  var refreshGeneration = 0;
  var lastAppliedSignature = '';

  function currentPage() {
    var path = (global.location.pathname || '').toLowerCase();
    if (path.indexOf('/quote/direct/motor/driver-details') !== -1) return 'driver-details.html';
    if (path.indexOf('/quote/direct/motor/additional-information') !== -1) return 'additional-information.html';
    if (path.indexOf('/quote/direct/motor/driver-quote') !== -1) return 'driver-quote.html';
    if (path.indexOf('/quote/direct/motor/quote-details') !== -1) return 'driver-quote.html';
    return (path.split('/').pop() || 'index.html').replace(/^\.\//, '');
  }

  function uniqueScopes(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (name) {
      var key = String(name || '').trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function decisionScopesForPage() {
    var cfg = global.AvivaTargetDemoConfig;
    if (cfg && Array.isArray(cfg.decisionScopes) && cfg.decisionScopes.length) {
      return uniqueScopes(cfg.decisionScopes);
    }
    var scopes = DEFAULT_SCOPES_BY_PAGE[currentPage()] || ['aviva-motor-journey-default'];
    if (currentPage() === 'index.html') {
      return uniqueScopes([VIEW_SCOPE].concat(scopes));
    }
    return uniqueScopes(scopes);
  }

  function waitForAlloy(maxMs, intervalMs) {
    var started = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        if (typeof global.alloy === 'function') {
          resolve(global.alloy);
          return;
        }
        if (Date.now() - started >= maxMs) {
          resolve(null);
          return;
        }
        global.setTimeout(tick, intervalMs);
      }
      tick();
    });
  }

  function buildXdm() {
    var xdm = {
      web: {
        webPageDetails: {
          URL: global.location.href,
          name: document.title || currentPage(),
        },
      },
    };
    var tenantKey =
      (global.AvivaTargetDemoConfig && global.AvivaTargetDemoConfig.xdmTenantKey) || '_demoemea';
    try {
      var ecidMap = readStorageMap('avivaTargetLastResolvedEcidBySandbox');
      var sandboxKey = getSandboxKey();
      var ecid = String(ecidMap[sandboxKey] || '').replace(/\D/g, '');
      if (ecid.length >= 10) {
        xdm[tenantKey] = {
          identification: {
            core: {
              ecid: ecid,
            },
          },
        };
      }
    } catch (e) {}
    return xdm;
  }

  function getSandboxKey() {
    try {
      var raw = (localStorage.getItem('aepGlobalSandboxName') || '').toLowerCase();
      return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
    } catch (e) {
      return '__default__';
    }
  }

  function readStorageMap(key) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  /** Env bar datastream (per sandbox) — applied per sendEvent; Launch/Tags still sets debugger default. */
  function labEdgeConfigOverrides() {
    if (global.DemoLabEdgeConfig && typeof global.DemoLabEdgeConfig.edgeConfigOverrides === 'function') {
      return global.DemoLabEdgeConfig.edgeConfigOverrides() || {};
    }
    try {
      var map = readStorageMap('siteCloneBcDatastreamIdBySandbox');
      var raw = String(map[getSandboxKey()] || '').trim();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        return { edgeConfigOverrides: { datastreamId: raw.toLowerCase() } };
      }
    } catch (e) {}
    return {};
  }

  function markTargets(scopeNames) {
    scopeNames.forEach(function (scope) {
      document.querySelectorAll('[data-aviva-target-scope="' + scope + '"]').forEach(function (el) {
        el.setAttribute('data-target-scope', scope);
      });
    });
  }

  function propositionSignature(scopes, propositions) {
    return scopes.join('|') + ':' + String((propositions && propositions.length) || 0);
  }

  function sendPersonalizationEvent(alloyFn, scopes) {
    return alloyFn(
      'sendEvent',
      Object.assign(
        {
          renderDecisions: true,
          decisionScopes: scopes.map(function (name) {
            return { name: name };
          }),
          xdm: buildXdm(),
        },
        labEdgeConfigOverrides()
      )
    ).then(function (result) {
      var propositions = (result && (result.propositions || result.decisions)) || [];
      if (!propositions.length) {
        if (global.console && global.console.debug) {
          global.console.debug('[AvivaTarget] no propositions for scopes', scopes);
        }
        return false;
      }
      var signature = propositionSignature(scopes, propositions);
      if (signature === lastAppliedSignature) {
        return true;
      }
      return alloyFn('applyPropositions', {
        propositions: propositions,
        metadata: { __adobe: { target: true } },
      }).then(function () {
        lastAppliedSignature = signature;
        if (global.console && global.console.info) {
          global.console.info('[AvivaTarget] applied', propositions.length, 'proposition(s) for', scopes.join(', '));
        }
        return true;
      });
    });
  }

  function requestPersonalization() {
    if (global.location.search.indexOf('mboxDisable=1') >= 0) return Promise.resolve();
    if (global.location.search.indexOf('adobe_authoring_enabled') >= 0) return Promise.resolve();

    var generation = ++refreshGeneration;
    var scopes = decisionScopesForPage();
    markTargets(scopes);

    return waitForAlloy(25000, 250).then(function (alloyFn) {
      if (generation !== refreshGeneration) return;
      if (!alloyFn) {
        if (global.console && global.console.debug) {
          global.console.debug('[AvivaTarget] alloy not available — inject Tags from the lab strip first.');
        }
        return;
      }
      return sendPersonalizationEvent(alloyFn, scopes);
    });
  }

  function schedulePersonalization(delayMs) {
    if (refreshTimer) {
      global.clearTimeout(refreshTimer);
    }
    refreshTimer = global.setTimeout(function () {
      refreshTimer = null;
      void requestPersonalization();
    }, typeof delayMs === 'number' ? delayMs : 0);
  }

  global.AvivaTargetPersonalization = {
    refresh: requestPersonalization,
    scopesForCurrentPage: decisionScopesForPage,
  };

  global.addEventListener('aviva-target-launch-injected', function () {
    schedulePersonalization(400);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      schedulePersonalization(0);
    });
  } else {
    schedulePersonalization(0);
  }

  global.addEventListener('load', function () {
    schedulePersonalization(1200);
  });
})(window);
