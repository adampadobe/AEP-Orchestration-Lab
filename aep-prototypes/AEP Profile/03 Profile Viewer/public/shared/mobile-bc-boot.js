/**
 * KSIA / mobile site-clone demos — Brand Concierge adapter.
 * Boots BC inside the phone iframe; suppresses parent-page BC chrome (modal, FAB, dock).
 */
(function (global) {
  'use strict';

  var PROFILE_VIEWER_PREFIX = '/profile-viewer/';
  var EMBED_BASE = 'embed-bc/';
  var ORG_ID = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
  var ALLOY_JS = 'https://cdn1.adoberesources.net/alloy/2.32.0/alloy.min.js';
  var BC_MAIN_JS =
    'https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js';
  var AEP_EVENTS_JS = 'embed-bc-aep-events.js';
  var AEP_EVENTS_CACHE = '20260616-turnid-numeric';

  var iframeCoreReady = null;
  var loadedIframeStyleUrl = null;
  var loadedIframeDatastreamId = null;
  var activeMode = null;
  var syncInFlight = null;
  var syncQueued = false;
  var patched = false;
  var initStarted = false;

  function pageCfg() {
    return global.SiteCloneBcPage || {};
  }

  function cfg(key, fallback) {
    var p = pageCfg();
    return p[key] !== undefined && p[key] !== null && p[key] !== '' ? p[key] : fallback;
  }

  function isMobileAdapter() {
    return String(cfg('channel', '')).toLowerCase() === 'mobile' && !!cfg('suppressParentBcChrome', false);
  }

  function iframeId() {
    return cfg('iframeId', 'ksiaMobileFrame');
  }

  function injectedMountSelector() {
    return cfg('injectedMountSelector', '#brand-concierge-mobile-mount');
  }

  function sheetMountSelector() {
    return cfg('modalMountSelector', '#ksiaMobileBcSheetMount');
  }

  function getFrame() {
    return document.getElementById(iframeId());
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

  function resolveAssetUrl(url) {
    var u = String(url || '').trim();
    if (!u) return PROFILE_VIEWER_PREFIX + EMBED_BASE + 'styleConfigurations-6a0992.js';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/') return u;
    return PROFILE_VIEWER_PREFIX + u.replace(/^\.\//, '');
  }

  function getStyleConfigUrl() {
    if (global.SiteCloneBcConfig && typeof global.SiteCloneBcConfig.getStyleConfigUrl === 'function') {
      return global.SiteCloneBcConfig.getStyleConfigUrl();
    }
    return EMBED_BASE + 'styleConfigurations-6a0992.js';
  }

  function getDatastreamId() {
    if (global.SiteCloneBcConfig && typeof global.SiteCloneBcConfig.getDatastreamId === 'function') {
      return String(global.SiteCloneBcConfig.getDatastreamId() || '').trim();
    }
    return 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
  }

  function reportStatus(text, isError) {
    var id = cfg('statusMessageId', 'ksiaMessage');
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.toggle('error', !!isError);
    el.classList.toggle('success', !isError && !!text);
  }

  function refreshToggles() {
    return {
      enabled: isBcMasterEnabled(),
      injected: !!(document.getElementById('siteCloneBcInjectedToggle') || {}).checked,
      modal: !!(document.getElementById('siteCloneBcModalToggle') || {}).checked,
      fullScreen: !!(document.getElementById('siteCloneBcFullScreenToggle') || {}).checked,
      bottomDock: !!(document.getElementById('siteCloneBcBottomDockToggle') || {}).checked,
      modalBar: !!(document.getElementById('siteCloneBcModalBarToggle') || {}).checked,
    };
  }

  function isBcMasterEnabled() {
    if (global.SiteCloneBcEnv && typeof global.SiteCloneBcEnv.isBcEnabled === 'function') {
      return !!global.SiteCloneBcEnv.isBcEnabled();
    }
    return !!(document.getElementById('siteCloneBcEnabledToggle') || {}).checked;
  }

  function getEffectiveDisplayModeKey(toggles) {
    if (global.SiteCloneBcEnv && typeof global.SiteCloneBcEnv.getEffectiveDisplayMode === 'function') {
      return String(global.SiteCloneBcEnv.getEffectiveDisplayMode() || '').trim();
    }
    if (!toggles) toggles = refreshToggles();
    if (toggles.injected) return 'injected';
    if (toggles.modal) return 'modal';
    if (toggles.fullScreen) return 'fullScreen';
    if (toggles.bottomDock) return 'bottomDock';
    if (toggles.modalBar) return 'modalBar';
    return 'modal';
  }

  function hasPresentationModeChecked(toggles) {
    if (!toggles) toggles = refreshToggles();
    return !!(toggles.injected || toggles.modal || toggles.fullScreen || toggles.bottomDock || toggles.modalBar);
  }

  /** Map env-bar display modes to in-app UX (Phase 2). */
  function getEffectiveUxMode(toggles) {
    if (!toggles) toggles = refreshToggles();
    if (!toggles.enabled) return 'off';
    if (toggles.injected) return 'injected';
    if (toggles.modal || toggles.fullScreen) return 'sheet';
    if (toggles.bottomDock || toggles.modalBar) return 'fab';
    var effective = getEffectiveDisplayModeKey(toggles);
    if (effective === 'injected') return 'injected';
    if (effective === 'modal' || effective === 'fullScreen') return 'fab-idle';
    if (effective === 'bottomDock' || effective === 'modalBar') return 'fab-idle';
    return 'fab-idle';
  }

  function suppressParentBcChrome() {
    var body = document.body;
    if (body && body.classList) {
      body.classList.add('ksia-mobile-bc-suppress-chrome');
    }
    ['siteCloneBcFab', 'aepBcModal', 'siteCloneBcFrameHost'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
      }
    });
    if (global.BrandConciergeBottomDock && typeof global.BrandConciergeBottomDock.setVisible === 'function') {
      global.BrandConciergeBottomDock.setVisible(false);
    }
    if (global.BrandConciergeModalBar && typeof global.BrandConciergeModalBar.setVisible === 'function') {
      global.BrandConciergeModalBar.setVisible(false);
    }
    if (global.ArmyBcPopup && typeof global.ArmyBcPopup.close === 'function') {
      global.ArmyBcPopup.close();
    }
  }

  function postToIframe(payload) {
    var frame = getFrame();
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        Object.assign(
          {
            source: 'ksia-mobile-lab-parent',
            bcEnabled: isBcMasterEnabled(),
            displayMode: getEffectiveDisplayModeKey(refreshToggles()),
          },
          payload,
        ),
        '*',
      );
    } catch (_e) {
      /* noop */
    }
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function waitFor(predicate, maxMs, label) {
    var start = Date.now();
    while (Date.now() - start < maxMs) {
      if (predicate()) return;
      await delay(100);
    }
    throw new Error(label);
  }

  function loadStylesheet(href, doc) {
    if (!doc) return;
    var url = resolveAssetUrl(href);
    if (doc.querySelector('link[data-mobile-bc-css="' + url + '"]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-mobile-bc-css', url);
    (doc.head || doc.documentElement).appendChild(link);
  }

  function loadScript(src, doc, marker) {
    var key = String(src);
    var attr = marker ? 'data-mobile-bc-' + marker : 'data-mobile-bc';
    if (doc.querySelector('script[' + attr + '="' + key + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = key;
      s.async = false;
      s.setAttribute('data-mobile-bc', key);
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

  function shouldUseLocalCatalog(win) {
    try {
      var search = global.location.search || '';
      if (win && win.location) search = win.location.search || search;
      return new URLSearchParams(search).has('embedBcLocal');
    } catch (_e) {
      return false;
    }
  }

  async function ensureEdgePathPatches(win, doc) {
    if (!win || shouldUseLocalCatalog(win)) return;
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
      return;
    }
    await loadScript(resolveAssetUrl(EMBED_BASE + 'embed-bc-edge-path.js'), doc, 'edge-path');
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    }
  }

  async function loadStyleConfigScript(src, win, doc) {
    var url = resolveAssetUrl(src);
    var busted = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'mobileBc=' + String(Date.now());
    return new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = busted;
      s.async = false;
      s.setAttribute('data-mobile-bc-style-config', '1');
      s.onload = function () {
        if (!win.styleConfiguration) {
          reject(new Error('Style URL did not set window.styleConfiguration: ' + url));
          return;
        }
        resolve(url);
      };
      s.onerror = function () {
        reject(new Error('Failed to load style configuration: ' + url));
      };
      (doc.head || doc.documentElement).appendChild(s);
    });
  }

  async function ensureIframeCore(doc) {
    if (!doc || !doc.body) {
      throw new Error('Mobile app iframe is not ready');
    }
    var win = doc.defaultView;
    var styleUrl = resolveAssetUrl(getStyleConfigUrl());
    var datastreamId = getDatastreamId();
    if (
      iframeCoreReady &&
      ((loadedIframeStyleUrl && loadedIframeStyleUrl !== styleUrl) ||
        (loadedIframeDatastreamId && loadedIframeDatastreamId !== datastreamId))
    ) {
      iframeCoreReady = null;
      loadedIframeStyleUrl = null;
      loadedIframeDatastreamId = null;
      win.__siteCloneBcBootstrapped = false;
    }
    if (iframeCoreReady) return iframeCoreReady;

    iframeCoreReady = (async function () {
      loadStylesheet(EMBED_BASE + 'embed-bc-disclaimer-layout.css?v=20260528-bc-disclaimer-frame', doc);
      loadStylesheet(EMBED_BASE + 'embed-bc-scroll-fix.css?v=20260528-bc-modal-scroll', doc);
      loadStylesheet(EMBED_BASE + 'embed-bc-inline.css?v=20260519-bc-poll-fix', doc);
      if (shouldUseLocalCatalog(win)) {
        loadStylesheet(EMBED_BASE + 'embed-bc-local-fallback.css', doc);
      }

      var loadedStyle = await loadStyleConfigScript(getStyleConfigUrl(), win, doc);
      loadedIframeStyleUrl = loadedStyle || styleUrl;
      loadedIframeDatastreamId = datastreamId;

      await ensureEdgePathPatches(win, doc);
      installAlloyStub(win);
      if (!doc.querySelector('script[data-mobile-bc-alloy="1"]')) {
        await loadScript(ALLOY_JS, doc, 'alloy');
      }
      await waitFor(
        function () {
          return typeof win.alloy === 'function';
        },
        15000,
        'Alloy did not become available in mobile iframe',
      );

      await ensureEdgePathPatches(win, doc);
      if (!doc.querySelector('script[data-mobile-bc-concierge="1"]')) {
        await loadScript(BC_MAIN_JS, doc, 'concierge');
      }
      await waitFor(
        function () {
          return !!(
            win.adobe &&
            win.adobe.concierge &&
            typeof win.adobe.concierge.bootstrap === 'function'
          );
        },
        30000,
        'Brand Concierge agent did not load in mobile iframe',
      );

      try {
        await win.alloy('configure', {
          defaultConsent: 'in',
          edgeDomain: 'edge.adobedc.net',
          edgeBasePath: 'ee',
          datastreamId: datastreamId,
          orgId: ORG_ID,
          debugEnabled: true,
          idMigrationEnabled: false,
          thirdPartyCookiesEnabled: false,
          prehidingStyle: '.personalization-container { opacity: 0 !important }',
        });
        await win.alloy('sendEvent', {});
      } catch (err) {
        var msg = String((err && err.message) || err);
        if (msg.indexOf('already been configured') < 0) throw err;
      }

      await loadScript(resolveAssetUrl(EMBED_BASE + 'embed-bc-scroll-fix.js'), doc, 'scroll-fix');
      await loadScript(
        resolveAssetUrl(EMBED_BASE + 'embed-bc-disclaimer-layout.js') + '?v=20260528-bc-disclaimer-frame',
        doc,
        'disclaimer',
      );
      await loadScript(resolveAssetUrl(EMBED_BASE + AEP_EVENTS_JS) + '?v=' + AEP_EVENTS_CACHE, doc, 'aep-events');
      if (shouldUseLocalCatalog(win)) {
        await loadScript(resolveAssetUrl(EMBED_BASE + 'embed-bc-local-engine.js'), doc, 'local-engine');
        await loadScript(resolveAssetUrl(EMBED_BASE + 'embed-bc-local-fallback.js'), doc, 'local-fallback');
      }
      if (global.EmbedBcAepEvents && typeof global.EmbedBcAepEvents.install === 'function') {
        global.EmbedBcAepEvents.install(win);
      }
      await ensureEdgePathPatches(win, doc);
    })().catch(function (err) {
      iframeCoreReady = null;
      throw err;
    });

    return iframeCoreReady;
  }

  function ensureMountAlias(mount) {
    if (!mount || !mount.ownerDocument) return;
    if (!mount.querySelector('#brand-concierge-mount')) {
      var alias = mount.ownerDocument.createElement('div');
      alias.id = 'brand-concierge-mount';
      alias.setAttribute('aria-hidden', 'true');
      alias.hidden = true;
      mount.appendChild(alias);
    }
  }

  function resolveMount(doc, uxMode) {
    var mountMode = uxMode === 'fab-idle' ? 'sheet' : uxMode;
    var selector = mountMode === 'injected' ? injectedMountSelector() : sheetMountSelector();
    var mount = doc.querySelector(selector);
    if (!mount && mountMode === 'injected') {
      mount = doc.querySelector(sheetMountSelector());
    }
    if (!mount) {
      throw new Error('Brand Concierge mobile mount not found: ' + selector);
    }
    ensureMountAlias(mount);
    return mount;
  }

  function clearMount(mount) {
    if (mount) mount.innerHTML = '';
    ensureMountAlias(mount);
  }

  async function bootstrapConcierge(win, mount, stylingConfigurations) {
    await ensureEdgePathPatches(win, win.document);
    if (
      !win ||
      !win.adobe ||
      !win.adobe.concierge ||
      typeof win.adobe.concierge.bootstrap !== 'function'
    ) {
      throw new Error('Brand Concierge agent not available');
    }
    if (!stylingConfigurations) {
      throw new Error('Brand Concierge style configuration is missing');
    }
    clearMount(mount);
    var bootSelector = mount.id ? '#' + mount.id : injectedMountSelector();
    var bootOpts = {
      instanceName: 'alloy',
      stylingConfigurations: stylingConfigurations,
      selector: bootSelector,
      stickySession: false,
    };
    if (global.EmbedBcAepEvents && typeof global.EmbedBcAepEvents.augmentBootstrapConfig === 'function') {
      global.EmbedBcAepEvents.augmentBootstrapConfig(bootOpts);
    }
    await win.adobe.concierge.bootstrap(bootOpts);
    win.__siteCloneBcBootstrapped = true;
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    }
  }

  function canSkipSync(uxMode) {
    if (!uxMode || uxMode === 'off') {
      return !activeMode;
    }
    if (activeMode !== uxMode && !(uxMode === 'fab-idle' && activeMode === 'fab')) return false;
    var doc = getIframeDoc();
    var win = doc && doc.defaultView;
    if (!win || !win.__siteCloneBcBootstrapped) return false;
    var styleUrl = resolveAssetUrl(getStyleConfigUrl());
    var datastreamId = getDatastreamId();
    if (loadedIframeStyleUrl && loadedIframeStyleUrl !== styleUrl) return false;
    if (loadedIframeDatastreamId && loadedIframeDatastreamId !== datastreamId) return false;
    return true;
  }

  function bcReadyNeedsSignal(uxMode) {
    return uxMode === 'fab-idle' || uxMode === 'fab' || uxMode === 'sheet';
  }

  async function mobileSyncInner() {
    suppressParentBcChrome();
    var toggles = refreshToggles();
    var uxMode = getEffectiveUxMode(toggles);
    if (!toggles.enabled) {
      activeMode = null;
      var docOff = getIframeDoc();
      if (docOff) {
        var inlineMount = docOff.querySelector(injectedMountSelector());
        var sheetMount = docOff.querySelector(sheetMountSelector());
        if (inlineMount) clearMount(inlineMount);
        if (sheetMount) clearMount(sheetMount);
        var winOff = docOff.defaultView;
        if (winOff) winOff.__siteCloneBcBootstrapped = false;
      }
      iframeCoreReady = null;
      postToIframe({ type: 'bc-display-mode', mode: 'off', bcEnabled: false });
      reportStatus('');
      return;
    }
    if (canSkipSync(uxMode)) {
      postToIframe({ type: 'bc-display-mode', mode: uxMode, bcEnabled: true });
      if (bcReadyNeedsSignal(uxMode)) {
        postToIframe({ type: 'bc-ready', mode: uxMode, bcEnabled: true });
      }
      reportStatus('');
      return;
    }

    var doc = getIframeDoc();
    if (!doc || !doc.body) {
      throw new Error('Mobile app iframe is not ready');
    }

    postToIframe({ type: 'bc-prepare', mode: uxMode });
    await ensureIframeCore(doc);
    var win = doc.defaultView;
    var mount = resolveMount(doc, uxMode);
    await bootstrapConcierge(win, mount, win.styleConfiguration);

    activeMode = uxMode;
    postToIframe({ type: 'bc-ready', mode: uxMode, bcEnabled: true });
    postToIframe({ type: 'bc-display-mode', mode: uxMode, bcEnabled: true });
    reportStatus('');
  }

  async function mobileSync() {
    if (syncInFlight) {
      syncQueued = true;
      return syncInFlight;
    }
    syncInFlight = mobileSyncInner()
      .catch(function (err) {
        console.error('[mobile-bc-boot] sync failed', err);
        reportStatus(
          'Brand Concierge could not load in the mobile app (' + String((err && err.message) || err) + ').',
          true,
        );
      })
      .finally(function () {
        syncInFlight = null;
        if (syncQueued) {
          syncQueued = false;
          void mobileSync();
        }
      });
    return syncInFlight;
  }

  function patchSiteCloneBcObject(bc) {
    if (!bc || bc._mobileBcPatched || !isMobileAdapter()) return bc;
    var originalRefresh = bc.refreshDisplayModeToggles;
    bc.refreshDisplayModeToggles = function () {
      if (typeof originalRefresh === 'function') originalRefresh();
      suppressParentBcChrome();
    };
    bc.sync = function () {
      return mobileSync();
    };
    bc._mobileBcPatched = true;
    patched = true;
    suppressParentBcChrome();
    return bc;
  }

  function patchSiteCloneBc() {
    if (patched || !isMobileAdapter()) return;
    if (!global.SiteCloneBc || typeof global.SiteCloneBc.sync !== 'function') return;
    patchSiteCloneBcObject(global.SiteCloneBc);
    void mobileSync();
  }

  function installSiteCloneBcSetterHook() {
    if (!isMobileAdapter() || global.__mobileBcSiteCloneBcHook) return;
    global.__mobileBcSiteCloneBcHook = true;
    var current = global.SiteCloneBc;
    try {
      Object.defineProperty(global, 'SiteCloneBc', {
        configurable: true,
        enumerable: true,
        get: function () {
          return current;
        },
        set: function (next) {
          current = patchSiteCloneBcObject(next) || next;
        },
      });
      if (current) {
        current = patchSiteCloneBcObject(current) || current;
      }
    } catch (_e) {
      /* fallback to polling */
    }
  }

  function bindToggleListeners() {
    [
      'siteCloneBcEnabledToggle',
      'siteCloneBcInjectedToggle',
      'siteCloneBcModalToggle',
      'siteCloneBcFullScreenToggle',
      'siteCloneBcBottomDockToggle',
      'siteCloneBcModalBarToggle',
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.getAttribute('data-mobile-bc-bound') === '1') return;
      el.setAttribute('data-mobile-bc-bound', '1');
      el.addEventListener('change', function () {
        void mobileSync();
      });
    });
  }

  function bindIframeLoad() {
    var frame = getFrame();
    if (!frame || frame.getAttribute('data-mobile-bc-load-bound') === '1') return;
    frame.setAttribute('data-mobile-bc-load-bound', '1');
    frame.addEventListener('load', function () {
      iframeCoreReady = null;
      loadedIframeStyleUrl = null;
      loadedIframeDatastreamId = null;
      activeMode = null;
      if (getEffectiveUxMode() !== 'off') {
        void mobileSync();
      }
    });
  }

  function init() {
    if (!isMobileAdapter()) return;
    if (initStarted) {
      patchSiteCloneBc();
      bindToggleListeners();
      return;
    }
    initStarted = true;
    installSiteCloneBcSetterHook();
    suppressParentBcChrome();
    bindIframeLoad();
    bindToggleListeners();

    global.addEventListener('aep-demo-env-strip-mounted', function () {
      bindToggleListeners();
      patchSiteCloneBc();
    });
    global.addEventListener('aep-demo-tags-injected', function () {
      bindToggleListeners();
      patchSiteCloneBc();
      void mobileSync();
    });

    global.addEventListener('aep-lab-bc-prefs-changed', function () {
      void mobileSync();
    });

    var attempts = 0;
    var poll = setInterval(function () {
      patchSiteCloneBc();
      bindToggleListeners();
      attempts += 1;
      if (patched || attempts > 80) clearInterval(poll);
    }, 250);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        patchSiteCloneBc();
        bindToggleListeners();
      });
    } else {
      patchSiteCloneBc();
    }
  }

  global.MobileBcBoot = {
    init: init,
    sync: mobileSync,
    isMobileAdapter: isMobileAdapter,
    suppressParentBcChrome: suppressParentBcChrome,
  };

  init();
})(typeof window !== 'undefined' ? window : this);
