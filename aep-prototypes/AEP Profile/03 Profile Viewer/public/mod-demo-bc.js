/**
 * MOD demo — Army Brand Concierge from army-mod-home (injected) and army-mod-home-3 (modal).
 * Toggled via env-bar checkboxes; loads army-bc/* assets on first use.
 */
(function (global) {
  'use strict';

  var BASE = 'army-bc/';
  var DATASTREAM_ID = 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
  var ORG_ID = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
  var EDGE_DEPLOYMENT = 'nld2';

  var injectedToggle = document.getElementById('modBcInjectedToggle');
  var modalToggle = document.getElementById('modBcModalToggle');
  var injectedPanel = document.getElementById('modDemoBcInjectedPanel');
  var reopenBtn = document.getElementById('aepBcReopenBtn');
  var bcModal = document.getElementById('aepBcModal');

  var coreReady = null;
  var activeSelector = null;
  var cssLoaded = { shared: false, inline: false, modal: false };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-mod-demo-bc="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.setAttribute('data-mod-demo-bc', src);
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadStylesheet(href, key) {
    if (cssLoaded[key]) return;
    if (document.querySelector('link[data-mod-demo-bc="' + href + '"]')) {
      cssLoaded[key] = true;
      return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-mod-demo-bc', href);
    document.head.appendChild(link);
    cssLoaded[key] = true;
  }

  function patchFetchForNld2() {
    if (global.__modDemoBcFetchPatched) return;
    var from = 'https://edge.adobedc.net/brand-concierge/conversations';
    var to = 'https://edge.adobedc.net/brand-concierge/' + EDGE_DEPLOYMENT + '/conversations';
    var voiceFrom = 'https://edge.adobedc.net/brand-concierge-voice/conversations';
    var voiceTo = 'https://edge.adobedc.net/brand-concierge-voice/' + EDGE_DEPLOYMENT + '/conversations';
    function rewrite(url) {
      if (typeof url !== 'string') return url;
      if (url.indexOf(from) === 0) return to + url.slice(from.length);
      if (url.indexOf(voiceFrom) === 0) return voiceTo + url.slice(voiceFrom.length);
      return url;
    }
    var nativeFetch = global.fetch;
    if (typeof nativeFetch !== 'function') return;
    global.fetch = function (input, init) {
      if (typeof input === 'string') {
        input = rewrite(input);
      } else if (input && typeof input.url === 'string') {
        var next = rewrite(input.url);
        if (next !== input.url) input = new Request(next, input);
      }
      return nativeFetch.call(this, input, init);
    };
    global.__modDemoBcFetchPatched = true;
  }

  function installAlloyStub() {
    if (typeof global.alloy === 'function') return;
    !(function (n, o) {
      o.forEach(function (o) {
        n[o] ||
          ((n.__alloyNS = n.__alloyNS || []).push(o),
          (n[o] = function () {
            var u = arguments;
            return new Promise(function (i, l) {
              n[o].q.push([i, l, u]);
            });
          }),
          (n[o].q = []));
      });
    })(global, ['alloy']);
  }

  function ensureCore() {
    if (coreReady) return coreReady;
    coreReady = (async function () {
      patchFetchForNld2();
      loadStylesheet(BASE + 'army-bc-disclaimer-layout.css', 'shared');
      loadStylesheet(BASE + 'army-bc-local-fallback.css', 'shared');
      loadStylesheet(BASE + 'army-bc-scroll-fix.css', 'shared');

      await loadScript(BASE + 'styleConfigurations-6a0992.js');
      installAlloyStub();
      await loadScript('https://cdn1.adoberesources.net/alloy/2.32.0/alloy.min.js');
      await loadScript(
        'https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js',
      );

      await global.alloy('configure', {
        defaultConsent: 'in',
        edgeDomain: 'edge.adobedc.net',
        edgeBasePath: 'ee',
        datastreamId: DATASTREAM_ID,
        orgId: ORG_ID,
        debugEnabled: true,
        idMigrationEnabled: false,
        thirdPartyCookiesEnabled: false,
        prehidingStyle: '.personalization-container { opacity: 0 !important }',
      });
      await global.alloy('sendEvent', {});

      await loadScript(BASE + 'army-bc-scroll-fix.js');
      await loadScript(BASE + 'army-bc-local-engine.js');
      await loadScript(BASE + 'army-bc-local-fallback.js');
      await loadScript(BASE + 'army-bc-disclaimer-layout.js');
    })().catch(function (err) {
      coreReady = null;
      console.error('[mod-demo-bc] core init failed', err);
      throw err;
    });
    return coreReady;
  }

  function clearMount(selector) {
    var el = document.querySelector(selector);
    if (el) el.innerHTML = '';
  }

  async function bootstrap(selector) {
    await ensureCore();
    if (activeSelector && activeSelector !== selector) {
      clearMount(activeSelector);
    }
    if (
      !global.adobe ||
      !global.adobe.concierge ||
      typeof global.adobe.concierge.bootstrap !== 'function'
    ) {
      throw new Error('Brand Concierge agent not available');
    }
    clearMount(selector);
    await global.adobe.concierge.bootstrap({
      instanceName: 'alloy',
      stylingConfigurations: global.styleConfiguration,
      selector: selector,
      stickySession: false,
    });
    activeSelector = selector;
  }

  async function loadInjectedAssets() {
    loadStylesheet(BASE + 'army-bc-inline.css', 'inline');
  }

  async function loadModalAssets() {
    loadStylesheet(BASE + 'army-bc-popup.css', 'modal');
    if (!document.querySelector('script[data-mod-demo-bc="army-bc-popup.js"]')) {
      await loadScript(BASE + 'army-bc-popup.js');
    }
  }

  function isInjectedOn() {
    return !!(injectedToggle && injectedToggle.checked);
  }

  function isModalOn() {
    return !!(modalToggle && modalToggle.checked);
  }

  function updateChromeVisibility() {
    if (injectedPanel) injectedPanel.hidden = !isInjectedOn() || isModalOn();
    if (reopenBtn) reopenBtn.hidden = !isModalOn();
    if (bcModal && !isModalOn()) {
      bcModal.classList.remove('is-open');
      bcModal.setAttribute('hidden', '');
      document.body.classList.remove('aep-bc-modal-open');
      if (reopenBtn) reopenBtn.setAttribute('aria-expanded', 'false');
    }
  }

  async function sync() {
    updateChromeVisibility();
    var wantInjected = isInjectedOn();
    var wantModal = isModalOn();

    if (!wantInjected && !wantModal) {
      if (activeSelector) clearMount(activeSelector);
      activeSelector = null;
      return;
    }

    try {
      if (wantModal) {
        await loadModalAssets();
        await bootstrap('#modDemoBcModalMount');
      } else if (wantInjected) {
        await loadInjectedAssets();
        await bootstrap('#modDemoBcInjectMount');
      }
    } catch (e) {
      console.error('[mod-demo-bc] sync failed', e);
    }
  }

  function bindToggles() {
    [injectedToggle, modalToggle].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        sync();
      });
    });
  }

  bindToggles();
  global.ModDemoBc = { sync: sync };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      updateChromeVisibility();
      if (isInjectedOn() || isModalOn()) sync();
    });
  } else {
    updateChromeVisibility();
    if (isInjectedOn() || isModalOn()) sync();
  }
})(typeof window !== 'undefined' ? window : this);
