/**
 * Adobe Target / Web SDK personalization for the Aviva car insurance journey.
 * Requires alloy from your Launch property (injected via aviva-target-demo.html lab strip).
 *
 * Override scopes: window.AvivaTargetDemoConfig = { decisionScopes: ['your-scope-name'] };
 */
(function (global) {
  'use strict';

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
    'step2-driver.html': ['aviva-step2-driver'],
    'step3-additional.html': ['aviva-step3-assumptions', 'aviva-step3-continue-cta'],
    'step4-quote.html': ['aviva-step4-quote-price', 'aviva-step4-quote-cta'],
    'quote-details.html': ['aviva-step4-quote-price', 'aviva-step4-quote-cta'],
  };

  function currentPage() {
    var path = global.location.pathname || '';
    if (path.indexOf('/quote/Direct/Motor/quote-details') !== -1 || path.indexOf('quote-details.html') !== -1) {
      return 'quote-details.html';
    }
    return (path.split('/').pop() || 'index.html').replace(/^\.\//, '');
  }

  function decisionScopesForPage() {
    var cfg = global.AvivaTargetDemoConfig;
    if (cfg && Array.isArray(cfg.decisionScopes) && cfg.decisionScopes.length) {
      return cfg.decisionScopes;
    }
    return DEFAULT_SCOPES_BY_PAGE[currentPage()] || ['aviva-motor-journey-default'];
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

  function markTargets(scopeNames) {
    scopeNames.forEach(function (scope) {
      document.querySelectorAll('[data-aviva-target-scope="' + scope + '"]').forEach(function (el) {
        el.setAttribute('data-target-scope', scope);
      });
    });
  }

  function requestPersonalization() {
    if (global.location.search.indexOf('mboxDisable=1') >= 0) return Promise.resolve();
    if (global.location.search.indexOf('adobe_authoring_enabled') >= 0) return Promise.resolve();

    var scopes = decisionScopesForPage();
    markTargets(scopes);

    return waitForAlloy(20000, 250).then(function (alloyFn) {
      if (!alloyFn) {
        if (global.console && global.console.debug) {
          global.console.debug('[AvivaTarget] alloy not available — inject Tags from the lab strip first.');
        }
        return;
      }

      return alloyFn('sendEvent', {
        renderDecisions: true,
        decisionScopes: scopes.map(function (name) {
          return { name: name };
        }),
        xdm: buildXdm(),
      }).then(function (result) {
        var propositions = (result && (result.propositions || result.decisions)) || [];
        if (!propositions.length) {
          if (global.console && global.console.debug) {
            global.console.debug('[AvivaTarget] no propositions for scopes', scopes);
          }
          return;
        }
        return alloyFn('applyPropositions', {
          propositions: propositions,
          metadata: { __adobe: { target: true } },
        });
      });
    });
  }

  global.AvivaTargetPersonalization = {
    refresh: requestPersonalization,
    scopesForCurrentPage: decisionScopesForPage,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      void requestPersonalization();
    });
  } else {
    void requestPersonalization();
  }
})(window);
