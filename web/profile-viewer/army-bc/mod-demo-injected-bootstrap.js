/**
 * MOD demo — injected BC inside army-home-snapshot iframe.
 * Loaded by the snapshot page; activated by mod-demo-bc.js when Injected is checked.
 * Mirrors army-mod-home.html head stack (style → alloy → concierge → edge-path → configure).
 */
(function (global) {
  'use strict';

  var PROFILE_VIEWER_PREFIX = '/profile-viewer/';
  var BASE = PROFILE_VIEWER_PREFIX + 'army-bc/';
  var DATASTREAM_ID = 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
  var ORG_ID = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
  var BC_MAIN_JS =
    'https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js';
  var ALLOY_JS = 'https://cdn1.adoberesources.net/alloy/2.32.0/alloy.min.js';
  var DEFAULT_MOUNT_SELECTOR = '#modDemoArmyBcInline #brand-concierge-mount';

  var corePromise = null;
  var loadedStyleUrl = null;

  function resolveAssetUrl(url) {
    var u = String(url || '').trim();
    if (!u) return BASE + 'styleConfigurations-6a0992.js';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/') return u;
    return PROFILE_VIEWER_PREFIX + u.replace(/^\.\//, '');
  }

  function isolateFromParent(win) {
    if (!win || !win.parent || win.parent === win) return;
    try {
      if (win.adobe && win.parent.adobe && win.adobe === win.parent.adobe) {
        win.adobe = undefined;
      }
    } catch (_e) {
      /* noop */
    }
  }

  function installAlloyStub(win) {
    if (!win || typeof win.alloy === 'function') return;
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
    })(win, ['alloy']);
  }

  function loadScript(src, doc, marker) {
    var key = String(src);
    var attr = marker ? 'data-mod-demo-injected-' + marker : 'data-mod-demo-injected';
    if (doc.querySelector('script[' + attr + '="' + key + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = key;
      s.async = false;
      s.setAttribute('data-mod-demo-injected', key);
      if (marker) s.setAttribute(attr, key);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Failed to load ' + key));
      };
      (doc.head || doc.documentElement).appendChild(s);
    });
  }

  function waitFor(predicate, maxMs, label) {
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      function tick() {
        if (predicate()) {
          resolve();
          return;
        }
        if (Date.now() - start > maxMs) {
          reject(new Error(label));
          return;
        }
        global.setTimeout(tick, 100);
      }
      tick();
    });
  }

  function shouldUseLocalCatalog() {
    try {
      var search = global.location.search || '';
      if (global.parent && global.parent !== global) {
        try {
          search = global.parent.location.search || search;
        } catch (_e) {
          /* noop */
        }
      }
      return new URLSearchParams(search).has('armyBcLocal');
    } catch (_e2) {
      return false;
    }
  }

  async function ensureEdgePathPatches(win, doc) {
    if (!win || shouldUseLocalCatalog()) return;
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
      return;
    }
    await loadScript(BASE + 'army-bc-edge-path.js', doc, 'edge-path');
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    }
  }

  async function refreshInjectedEdgePatches(win, doc) {
    await ensureEdgePathPatches(win, doc);
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    }
  }

  async function ensureCore(doc, win, styleUrl, datastreamId) {
    var resolvedStyle = resolveAssetUrl(styleUrl);
    var resolvedDatastream = datastreamId || resolveDatastreamId();
    if (corePromise && loadedStyleUrl && loadedStyleUrl !== resolvedStyle) {
      global.resetModDemoInjectedBc();
    }
    if (
      corePromise &&
      win.__modDemoBcLoadedDatastreamId &&
      win.__modDemoBcLoadedDatastreamId !== resolvedDatastream
    ) {
      global.resetModDemoInjectedBc();
    }
    if (corePromise) {
      await corePromise;
      await refreshInjectedEdgePatches(win, doc);
      return;
    }

    corePromise = (async function () {
      isolateFromParent(win);
      win.__modDemoBcAlloyConfiguredWin = null;

      await loadScript(resolvedStyle, doc, 'style');
      await waitFor(
        function () {
          return !!win.styleConfiguration;
        },
        15000,
        'Style configuration did not load in injected iframe',
      );
      loadedStyleUrl = resolvedStyle;
      win.__modDemoBcLoadedDatastreamId = resolvedDatastream;

      installAlloyStub(win);
      await loadScript(ALLOY_JS, doc, 'alloy');
      await waitFor(
        function () {
          return typeof win.alloy === 'function';
        },
        15000,
        'Alloy did not become available in injected iframe',
      );

      await loadScript(BC_MAIN_JS, doc, 'concierge');
      await waitFor(
        function () {
          return !!(
            win.adobe &&
            win.adobe.concierge &&
            typeof win.adobe.concierge.bootstrap === 'function'
          );
        },
        30000,
        'Brand Concierge agent did not load in injected iframe',
      );

      await ensureEdgePathPatches(win, doc);

      try {
        await win.alloy('configure', {
          defaultConsent: 'in',
          edgeDomain: 'edge.adobedc.net',
          edgeBasePath: 'ee',
          datastreamId: resolvedDatastream,
          orgId: ORG_ID,
          debugEnabled: true,
          idMigrationEnabled: false,
          thirdPartyCookiesEnabled: false,
          prehidingStyle: '.personalization-container { opacity: 0 !important }',
        });
        await win.alloy('sendEvent', {});
        win.__modDemoBcAlloyConfiguredWin = win;
      } catch (err) {
        var msg = String((err && err.message) || err);
        if (msg.indexOf('already been configured') < 0) throw err;
        win.__modDemoBcAlloyConfiguredWin = win;
      }

      await loadScript(BASE + 'army-bc-scroll-fix.js', doc, 'scroll-fix');
      await loadScript(BASE + 'army-bc-disclaimer-layout.js', doc, 'disclaimer');
      if (shouldUseLocalCatalog()) {
        await loadScript(BASE + 'army-bc-local-engine.js', doc, 'local-engine');
        await loadScript(BASE + 'army-bc-local-fallback.js', doc, 'local-fallback');
      }

      await refreshInjectedEdgePatches(win, doc);
    })().catch(function (err) {
      corePromise = null;
      throw err;
    });

    return corePromise;
  }

  global.resetModDemoInjectedBc = function () {
    corePromise = null;
    loadedStyleUrl = null;
    global.__modDemoBcBootstrapped = false;
    global.__modDemoBcAlloyConfiguredWin = null;
    global.__modDemoBcLoadedDatastreamId = null;
  };

  function resolveDatastreamId(override) {
    if (override) return String(override).trim().toLowerCase();
    try {
      if (
        global.parent &&
        global.parent !== global &&
        global.parent.ModDemoBcConfig &&
        typeof global.parent.ModDemoBcConfig.getDatastreamId === 'function'
      ) {
        return global.parent.ModDemoBcConfig.getDatastreamId();
      }
    } catch (_e) {
      /* noop */
    }
    return DATASTREAM_ID;
  }

  global.activateModDemoInjectedBc = async function (styleUrl, mountSelector, datastreamId) {
    var doc = global.document;
    var win = global;
    var selector = mountSelector || DEFAULT_MOUNT_SELECTOR;
    var resolvedDatastream = resolveDatastreamId(datastreamId);

    if (loadedStyleUrl && corePromise) {
      var styleChanged = resolveAssetUrl(styleUrl) !== loadedStyleUrl;
      var dsStored = win.__modDemoBcLoadedDatastreamId;
      if (styleChanged || (dsStored && dsStored !== resolvedDatastream)) {
        global.resetModDemoInjectedBc();
      }
    }

    await ensureCore(doc, win, styleUrl, resolvedDatastream);

    var mount = doc.querySelector(selector);
    if (!mount) {
      throw new Error('Injected BC mount not found: ' + selector);
    }
    mount.innerHTML = '';

    await ensureEdgePathPatches(win, doc);

    await win.adobe.concierge.bootstrap({
      instanceName: 'alloy',
      stylingConfigurations: win.styleConfiguration,
      selector: selector,
      stickySession: false,
    });

    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    }

    win.__modDemoBcBootstrapped = true;

    function repatch() {
      if (typeof win.applyArmyBcEdgePathPatches === 'function') {
        win.applyArmyBcEdgePathPatches(win);
      }
    }
    repatch();
    [100, 500, 1500, 3000, 6000].forEach(function (ms) {
      global.setTimeout(repatch, ms);
    });
  };
})(typeof window !== 'undefined' ? window : this);
