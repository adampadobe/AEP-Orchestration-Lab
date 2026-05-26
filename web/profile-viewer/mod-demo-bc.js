/**
 * MOD demo — Army Brand Concierge: modal (parent shell) + injected inline in site iframe.
 */
(function (global) {
  'use strict';

  var BASE = 'army-bc/';
  var PROFILE_VIEWER_PREFIX = '/profile-viewer/';
  var DEFAULT_DATASTREAM_ID = 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
  var ORG_ID = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
  var EDGE_DEPLOYMENT = 'nld2';
  var IFRAME_ID = 'modDemoSiteFrame';
  var IFRAME_INLINE_SECTION_ID = 'modDemoArmyBcInline';
  var IFRAME_MOUNT_SELECTOR = '#brand-concierge-mount';
  var IFRAME_INJECTED_MOUNT_SELECTOR = '#modDemoArmyBcInline #brand-concierge-mount';
  var MODAL_MOUNT_SELECTOR = '#aepBcModal #brand-concierge-mount';
  var FRAME_OVERLAY_HOST_ID = 'modDemoBcFrameHost';
  var FRAME_OVERLAY_MOUNT_SELECTOR = '#modDemoBcFrameMount';
  var DEFAULT_FRAME_SRC = 'mod-demo-assets/army-home-snapshot.html';
  var bcFrameHostRepositionBound = false;
  var SNAPSHOT_FS_LAYOUT_STYLE_ID = 'aep-mod-bc-fullscreen-layout';
  var SNAPSHOT_FS_LAYOUT_CSS = [
    'html.mod-demo-bc-fs-active,html.mod-demo-bc-fs-active body{height:100%!important;overflow:hidden!important;background-color:#2c2e31!important;}',
    'html.mod-demo-bc-fs-active .pin-spacer,html.mod-demo-bc-fs-active .main-page-layout__body,html.mod-demo-bc-fs-active .main-page-layout__footer,html.mod-demo-bc-fs-active .exp-hero-banner{display:none!important;pointer-events:none!important;}',
    'html.mod-demo-bc-fs-active .main-page-layout__header{position:fixed!important;top:0!important;left:0!important;right:0!important;z-index:1200!important;pointer-events:auto!important;}',
    'html.mod-demo-bc-fs-active .main-page-layout:has(.exp-content-theme--home) .site-header__logo.logo-svg,html.mod-demo-bc-fs-active .main-page-layout:has(.exp-content-theme--global-operations) .site-header__logo.logo-svg,html.mod-demo-bc-fs-active .main-page-layout:has(.exp-content-theme--ranks-listing) .site-header__logo.logo-svg{visibility:visible!important;}',
    'html.mod-demo-bc-fs-active .site-header{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;width:100%!important;box-sizing:border-box!important;padding:var(--site-header-spacer-y,1.5rem) 1.25rem 0.5rem!important;}',
    'html.mod-demo-bc-fs-active .site-header__logo.logo-svg{display:block!important;height:var(--site-header-logo-height,76px)!important;width:6.25rem!important;margin:0 auto!important;background-repeat:no-repeat!important;background-position:center center!important;background-size:contain!important;}',
    'html.mod-demo-bc-fs-active .site-header__actions{position:fixed!important;right:0.5rem!important;bottom:1.5rem!important;z-index:1210!important;flex-direction:column!important;pointer-events:auto!important;}',
    'html.mod-demo-bc-fs-active #modDemoArmyBcInline.mod-demo-army-bc-inline--fullscreen{position:fixed!important;top:var(--site-header-height,calc(var(--site-header-logo-height,76px) + 2rem))!important;left:0!important;right:0!important;bottom:0!important;z-index:1300!important;margin:0 auto!important;padding:clamp(0.75rem,2vw,1.25rem)!important;min-height:0!important;overflow:auto!important;display:flex!important;flex-direction:column!important;align-items:center!important;box-sizing:border-box!important;pointer-events:auto!important;background:linear-gradient(122.87deg,#e1e9ff 20.72%,#efe3fa 34.96%,#f5dff8 42.08%,#fcdcf5 49.2%,#ffdec3 91.6%)!important;}',
    'html.mod-demo-bc-fs-active #modDemoArmyBcInline.mod-demo-army-bc-inline--fullscreen .army-bc-inline__mount,html.mod-demo-bc-fs-active #modDemoArmyBcInline.mod-demo-army-bc-inline--fullscreen #brand-concierge-mount{width:100%!important;max-width:920px!important;margin-left:auto!important;margin-right:auto!important;min-height:min(540px,calc(100vh - var(--site-header-height,5rem) - 2rem))!important;pointer-events:auto!important;}',
    'html.mod-demo-bc-fs-active #modDemoArmyBcInline.mod-demo-army-bc-inline--fullscreen #brand-concierge-mount *{pointer-events:auto!important;}',
  ].join('');
  var SNAPSHOT_INJECTED_LAYOUT_STYLE_ID = 'aep-mod-bc-injected-layout';
  var SNAPSHOT_INJECTED_LAYOUT_CSS = [
    'html.mod-demo-bc-injected-active .pin-spacer{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important;pointer-events:none!important;}',
    'html.mod-demo-bc-injected-active .pin-spacer>.exp-content__block-container,html.mod-demo-bc-injected-active .pin-spacer>[x-ref="blockInner"]{position:relative!important;inset:auto!important;transform:none!important;pointer-events:none!important;}',
    'html.mod-demo-bc-injected-active .exp-hero-banner{position:relative!important;height:auto!important;min-height:0!important;max-height:none!important;pointer-events:none!important;}',
    'html.mod-demo-bc-injected-active .exp-hero-banner__media-bg,html.mod-demo-bc-injected-active .exp-hero-banner__media-container,html.mod-demo-bc-injected-active .exp-hero-banner__text-container,html.mod-demo-bc-injected-active .exp-hero-banner__footer-container{pointer-events:none!important;}',
    'html.mod-demo-bc-injected-active .exp-hero-banner__logo,html.mod-demo-bc-injected-active .exp-hero-banner__cta-btn{pointer-events:auto!important;}',
    'html.mod-demo-bc-injected-active #modDemoArmyBcInline.army-bc-inline{position:relative!important;z-index:1300!important;isolation:isolate!important;pointer-events:auto!important;}',
    'html.mod-demo-bc-injected-active #modDemoArmyBcInline.army-bc-inline #brand-concierge-mount,html.mod-demo-bc-injected-active #modDemoArmyBcInline.army-bc-inline #brand-concierge-mount *{pointer-events:auto!important;}',
  ].join('');

  var injectedToggle = document.getElementById('modBcInjectedToggle');
  var modalToggle = document.getElementById('modBcModalToggle');
  var fullScreenToggle = document.getElementById('modBcFullScreenToggle');
  var bcModal = document.getElementById('aepBcModal');
  var bcFab = document.getElementById('modDemoBcFab');

  var parentCoreReady = null;
  var iframeCoreReady = null;
  var loadedParentStyleUrl = null;
  var loadedIframeStyleUrl = null;
  var loadedParentDatastreamId = null;
  var loadedIframeDatastreamId = null;
  var activeMode = null;
  var cssLoaded = { shared: false, inline: false, modal: false };

  var DEFAULT_STYLE_CONFIG_URL = BASE + 'styleConfigurations-6a0992.js';
  var BC_MAIN_JS =
    'https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js';
  var ALLOY_JS = 'https://cdn1.adoberesources.net/alloy/2.32.0/alloy.min.js';

  function getStyleConfigUrl() {
    if (global.ModDemoBcConfig && typeof global.ModDemoBcConfig.getStyleConfigUrl === 'function') {
      return global.ModDemoBcConfig.getStyleConfigUrl();
    }
    return DEFAULT_STYLE_CONFIG_URL;
  }

  function getDatastreamId() {
    if (global.ModDemoBcConfig && typeof global.ModDemoBcConfig.getDatastreamId === 'function') {
      return global.ModDemoBcConfig.getDatastreamId();
    }
    return DEFAULT_DATASTREAM_ID;
  }

  function setSnapshotInjectedLayout(doc, on) {
    if (!doc || !doc.documentElement) return;
    doc.documentElement.classList.toggle('mod-demo-bc-injected-active', !!on);
    var styleEl = doc.getElementById(SNAPSHOT_INJECTED_LAYOUT_STYLE_ID);
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = SNAPSHOT_INJECTED_LAYOUT_STYLE_ID;
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = on ? SNAPSHOT_INJECTED_LAYOUT_CSS : '';
    refreshSnapshotRuntimeFix(doc);
  }

  async function restoreModDemoSnapshotFrame() {
    var doc = getIframeDoc();
    if (doc) {
      setSnapshotFullscreenLayout(doc, false);
      setSnapshotInjectedLayout(doc, false);
    }
    if (!isLegacyFullscreenShellLoaded()) return;
    iframeCoreReady = null;
    loadedIframeStyleUrl = null;
    loadedIframeDatastreamId = null;
    await ensureSnapshotFrame();
  }

  function resolveAssetUrl(url) {
    var u = String(url || '').trim();
    if (!u) return PROFILE_VIEWER_PREFIX + DEFAULT_STYLE_CONFIG_URL;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/') return u;
    return PROFILE_VIEWER_PREFIX + u.replace(/^\.\//, '');
  }

  function getModDemoFrame() {
    return document.getElementById(IFRAME_ID);
  }

  function getIframeDoc() {
    var frame = getModDemoFrame();
    if (!frame) return null;
    try {
      return frame.contentDocument || null;
    } catch (_e) {
      return null;
    }
  }

  function getFrameSrcPath() {
    var frame = getModDemoFrame();
    if (!frame) return '';
    var src = frame.getAttribute('src') || '';
    return src.split('?')[0];
  }

  function isLegacyFullscreenShellLoaded() {
    return getFrameSrcPath().indexOf('mod-bc-fullscreen-shell.html') >= 0;
  }

  function refreshSnapshotRuntimeFix(doc) {
    if (!doc || !doc.body) return;
    var styleEl = doc.getElementById('aep-mod-snapshot-runtime-fix');
    if (!styleEl) return;
    var fs = doc.documentElement.classList.contains('mod-demo-bc-fs-active');
    var inj = doc.documentElement.classList.contains('mod-demo-bc-injected-active');
    if (fs || inj) {
      styleEl.textContent =
        'html,body{margin:0!important;width:100%!important;max-width:none!important;overflow-x:hidden!important;}';
      return;
    }
    styleEl.textContent = [
      'html,body{margin:0!important;width:100%!important;max-width:none!important;overflow-x:hidden!important;}',
      '.pin-spacer{width:100%!important;max-width:100%!important;left:0!important;right:0!important;padding:0!important;margin:0!important;transform:none!important;overflow:visible!important;}',
      '.pin-spacer>.exp-content__block-container,.pin-spacer>[x-ref="blockInner"]{width:100%!important;max-width:100%!important;left:0!important;right:0!important;top:0!important;margin:0!important;transform:none!important;}',
      '.exp-hero-banner__logo{position:fixed!important;top:18px!important;left:50%!important;transform:translateX(-50%)!important;z-index:1200!important;margin:0!important;}',
      '.exp-hero-banner__cta-btn{position:fixed!important;top:18px!important;left:22px!important;transform:none!important;z-index:1200!important;margin:0!important;}',
      '.exp-hero-banner__text-container,.exp-hero-banner__media-container,.exp-hero-banner__scroll-prompt{transform:none!important;}',
    ].join('');
  }

  function setSnapshotFullscreenLayout(doc, on) {
    if (!doc || !doc.documentElement) return;
    doc.documentElement.classList.toggle('mod-demo-bc-fs-active', !!on);
    var logo = doc.querySelector('.site-header__logo.logo-svg');
    if (logo) {
      if (on) logo.classList.add('logo-svg--dark');
      else logo.classList.remove('logo-svg--dark');
    }
    var styleEl = doc.getElementById(SNAPSHOT_FS_LAYOUT_STYLE_ID);
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = SNAPSHOT_FS_LAYOUT_STYLE_ID;
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = on ? SNAPSHOT_FS_LAYOUT_CSS : '';
    refreshSnapshotRuntimeFix(doc);
    try {
      doc.defaultView && doc.defaultView.scrollTo(0, 0);
    } catch (_e) {
      /* noop */
    }
  }

  function waitForFrameLoad(frame) {
    return new Promise(function (resolve) {
      if (!frame) {
        resolve();
        return;
      }
      try {
        var doc = frame.contentDocument;
        if (doc && doc.readyState === 'complete') {
          resolve();
          return;
        }
      } catch (_e) {
        /* cross-origin guard */
      }
      frame.addEventListener('load', function () {
        resolve();
      }, { once: true });
    });
  }

  async function ensureSnapshotFrame() {
    var frame = getModDemoFrame();
    if (!frame) return;
    var current = getFrameSrcPath();
    var onSnapshot =
      current.indexOf(DEFAULT_FRAME_SRC) >= 0 && current.indexOf('mod-bc-fullscreen-shell.html') < 0;
    if (onSnapshot) {
      await waitForFrameLoad(frame);
      return;
    }
    iframeCoreReady = null;
    loadedIframeStyleUrl = null;
    loadedIframeDatastreamId = null;
    await new Promise(function (resolve) {
      frame.addEventListener(
        'load',
        function () {
          resolve();
        },
        { once: true },
      );
      frame.src = DEFAULT_FRAME_SRC;
    });
  }

  function unloadStyleConfigScripts(doc) {
    var root = doc || document;
    root.querySelectorAll('script[data-mod-demo-bc-style-config="1"]').forEach(function (s) {
      if (s.parentNode) s.parentNode.removeChild(s);
    });
  }

  function invalidateCore() {
    parentCoreReady = null;
    iframeCoreReady = null;
    loadedParentStyleUrl = null;
    loadedIframeStyleUrl = null;
    loadedParentDatastreamId = null;
    loadedIframeDatastreamId = null;
    activeMode = null;
    global.__aepBcToggleBootstrapped = false;
    global.__modDemoBcBootstrapped = false;
    global.__modDemoBcAlloyConfiguredWin = null;
    global.__armyBcForceLocal = false;
    unloadStyleConfigScripts(document);
    clearMountInDoc(document, FRAME_OVERLAY_MOUNT_SELECTOR);
    hideBcFrameHost();
    var iframeDoc = getIframeDoc();
    if (iframeDoc) {
      var iframeWin = iframeDoc.defaultView;
      if (iframeWin) {
        iframeWin.__modDemoBcBootstrapped = false;
        iframeWin.__modDemoBcAlloyConfiguredWin = null;
        iframeWin.__armyBcForceLocal = false;
        if (typeof iframeWin.resetModDemoInjectedBc === 'function') {
          iframeWin.resetModDemoInjectedBc();
        }
      }
      unloadStyleConfigScripts(iframeDoc);
      teardownIframeInlineSection(iframeDoc);
    }
    try {
      delete global.styleConfiguration;
    } catch (_e) {
      global.styleConfiguration = undefined;
    }
  }

  function loadScript(src, doc, marker) {
    var targetDoc = doc || document;
    var key = String(src);
    var attr = marker ? 'data-mod-demo-bc-' + marker : 'data-mod-demo-bc';
    if (targetDoc.querySelector('script[' + attr + '="' + key + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = targetDoc.createElement('script');
      s.src = key;
      s.async = false;
      s.setAttribute('data-mod-demo-bc', key);
      if (marker) {
        s.setAttribute('data-mod-demo-bc-' + marker, key);
      }
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Failed to load ' + key));
      };
      (targetDoc.head || targetDoc.documentElement).appendChild(s);
    });
  }

  function loadStylesheet(href, key, doc) {
    var targetDoc = doc || document;
    if (!doc && cssLoaded[key]) return;
    if (targetDoc.querySelector('link[data-mod-demo-bc="' + href + '"]')) {
      if (!doc) cssLoaded[key] = true;
      return;
    }
    var link = targetDoc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-mod-demo-bc', href);
    (targetDoc.head || targetDoc.documentElement).appendChild(link);
    if (!doc) cssLoaded[key] = true;
  }

  function clearStyleConfiguration(win) {
    if (!win) return;
    try {
      delete win.styleConfiguration;
    } catch (_e) {
      win.styleConfiguration = undefined;
    }
  }

  function removeStyleConfigurationScripts(doc, resolvedUrl) {
    unloadStyleConfigScripts(doc);
    var base = String(resolvedUrl || '').replace(/\?.*$/, '');
    doc.querySelectorAll('script[src]').forEach(function (existing) {
      var href = String(existing.getAttribute('src') || '').replace(/\?.*$/, '');
      if (!href) return;
      if (
        href === base ||
        href.indexOf('styleConfigurations') >= 0 ||
        href.indexOf('styling-config') >= 0 ||
        href.indexOf('mod-styling') >= 0
      ) {
        if (existing.parentNode) existing.parentNode.removeChild(existing);
      }
    });
  }

  function applyModDemoStyleConfigDefaults(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    if (!cfg.behavior || typeof cfg.behavior !== 'object') cfg.behavior = {};
    if (!cfg.behavior.disclaimer || typeof cfg.behavior.disclaimer !== 'object') {
      cfg.behavior.disclaimer = {};
    }
    cfg.behavior.disclaimer.attachWithInput = false;
    return cfg;
  }

  function assignStyleConfiguration(win, cfg) {
    win.styleConfiguration = applyModDemoStyleConfigDefaults(cfg);
  }

  function parseStyleConfigFromText(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    var assignMatch = t.match(/window\.styleConfiguration\s*=\s*([\s\S]+?)\s*;?\s*$/);
    if (assignMatch) {
      try {
        return new Function('return (' + assignMatch[1] + ')')();
      } catch (_e) {
        /* fall through */
      }
    }
    if (t.charAt(0) === '{') {
      try {
        return JSON.parse(t);
      } catch (_e) {
        /* fall through */
      }
    }
    return null;
  }

  async function loadStyleConfigScript(src, win, doc) {
    var url = resolveAssetUrl(src);
    if (!url) {
      throw new Error('Brand Concierge style configuration URL is empty');
    }
    removeStyleConfigurationScripts(doc, url);
    clearStyleConfiguration(win);
    var busted = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'modDemoBc=' + String(Date.now());

    try {
      var res = await fetch(busted, { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) {
        var text = await res.text();
        var cfg = parseStyleConfigFromText(text);
        if (cfg && typeof cfg === 'object') {
          assignStyleConfiguration(win, cfg);
          console.info('[mod-demo-bc] style configuration loaded (fetch):', url);
          return url;
        }
      }
    } catch (fetchErr) {
      console.warn('[mod-demo-bc] fetch style config failed, trying script tag', fetchErr);
    }

    return new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = busted;
      s.async = false;
      s.setAttribute('data-mod-demo-bc', url);
      s.setAttribute('data-mod-demo-bc-style-config', '1');
      s.onload = function () {
        if (!win.styleConfiguration) {
          reject(
            new Error(
              'Style URL did not set window.styleConfiguration. Use a .js file with window.styleConfiguration = { ... }, or bare JSON / .json export: ' +
                url,
            ),
          );
          return;
        }
        assignStyleConfiguration(win, win.styleConfiguration);
        resolve(url);
      };
      s.onerror = function () {
        reject(new Error('Failed to load style configuration: ' + url));
      };
      (doc.head || doc.documentElement).appendChild(s);
    });
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

  function teardownConflictingBcMounts() {
    clearMountInDoc(document, MODAL_MOUNT_SELECTOR);
    clearMountInDoc(document, FRAME_OVERLAY_MOUNT_SELECTOR);
    hideBcFrameHost();
    global.__aepBcToggleBootstrapped = false;
    global.__brandConciergeBootstrapped = false;
    global.__modDemoBcBootstrapped = false;
  }

  function hideBcFrameHost() {
    var host = document.getElementById(FRAME_OVERLAY_HOST_ID);
    if (host) host.hidden = true;
  }

  function positionBcFrameHost(fullscreen) {
    var host = document.getElementById(FRAME_OVERLAY_HOST_ID);
    var frame = getModDemoFrame();
    if (!host || !frame) return;

    var frameRect = frame.getBoundingClientRect();
    var top = frameRect.top;
    var doc = getIframeDoc();

    if (doc) {
      var anchor = fullscreen
        ? doc.querySelector('.main-page-layout__header')
        : doc.querySelector('.exp-hero-banner');
      if (anchor) {
        var anchorRect = anchor.getBoundingClientRect();
        top = anchorRect.bottom;
      }
    }

    if (top < frameRect.top) top = frameRect.top;
    var height = Math.max(240, frameRect.bottom - top);

    host.style.left = frameRect.left + 'px';
    host.style.width = frameRect.width + 'px';
    host.style.top = top + 'px';
    host.style.height = height + 'px';
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  }

  function showBcFrameHost(fullscreen) {
    var host = document.getElementById(FRAME_OVERLAY_HOST_ID);
    if (!host) return;
    host.hidden = false;
    host.classList.toggle('mod-demo-bc-frame-host--fullscreen', !!fullscreen);
    host.classList.toggle('mod-demo-bc-frame-host--injected', !fullscreen);
    positionBcFrameHost(!!fullscreen);
  }

  function onBcFrameHostReposition() {
    if (!isInjectedOn() && !isFullScreenOn()) return;
    positionBcFrameHost(isFullScreenOn());
  }

  function bindBcFrameHostReposition() {
    onBcFrameHostReposition();
    if (bcFrameHostRepositionBound) return;
    bcFrameHostRepositionBound = true;
    global.addEventListener('resize', onBcFrameHostReposition);
    var frame = getModDemoFrame();
    if (!frame) return;
    frame.addEventListener('load', onBcFrameHostReposition);
    try {
      var win = frame.contentWindow;
      if (win) {
        win.addEventListener('scroll', onBcFrameHostReposition, { passive: true });
      }
    } catch (_e) {
      /* noop */
    }
  }

  async function ensureAlloyJs(win, doc) {
    installAlloyStub(win);
    if (!doc.querySelector('script[data-mod-demo-bc-alloy="1"]')) {
      await loadScript(ALLOY_JS, doc, 'alloy');
    }
    await waitFor(
      function () {
        return typeof win.alloy === 'function';
      },
      15000,
      'Alloy did not become available (check Tags / Launch inject or network).',
    );
  }

  async function ensureConciergeAgent(win, doc) {
    if (!doc.querySelector('script[data-mod-demo-bc-concierge="1"]')) {
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
      'Brand Concierge agent did not load (main.js).',
    );
  }

  function getArmyBcQuerySearch(win) {
    var target = win || global;
    try {
      if (target.parent && target.parent !== target) {
        try {
          return target.parent.location.search || target.location.search || '';
        } catch (_e) {
          return target.location.search || '';
        }
      }
      return target.location.search || '';
    } catch (_e2) {
      return '';
    }
  }

  function shouldUseLocalArmyBcCatalog(win) {
    try {
      return new URLSearchParams(getArmyBcQuerySearch(win)).has('armyBcLocal');
    } catch (_e) {
      return false;
    }
  }

  function prepareArmyBcRuntime(win) {
    if (!win) return;
    var useLocal = shouldUseLocalArmyBcCatalog(win);
    win.__armyBcUseLocal = useLocal;
    if (!useLocal) {
      win.__armyBcForceLocal = false;
    }
  }

  async function ensureEdgePathPatches(win, doc) {
    if (!win || shouldUseLocalArmyBcCatalog(win)) return;
    prepareArmyBcRuntime(win);
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
      return;
    }
    await loadScript(resolveAssetUrl(BASE + 'army-bc-edge-path.js'), doc, 'edge-path');
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    }
  }

  async function ensureEdgePathPatchesForLab(win, doc) {
    await ensureEdgePathPatches(global, document);
    if (win && win !== global && doc) {
      await ensureEdgePathPatches(win, doc);
    }
  }

  function scheduleEdgeRepatch(win) {
    if (!win || shouldUseLocalArmyBcCatalog(win)) return;
    function repatch() {
      if (typeof win.applyArmyBcEdgePathPatches === 'function') {
        win.applyArmyBcEdgePathPatches(win);
      }
    }
    repatch();
    [0, 50, 100, 250, 500, 1000, 2000, 4000, 8000].forEach(function (ms) {
      setTimeout(repatch, ms);
    });
  }

  function bindBcMountRepatch(win, doc) {
    if (!win || !doc) return;
    doc.querySelectorAll('#brand-concierge-mount, #modDemoBcFrameMount').forEach(function (mount) {
      if (mount.__modDemoBcRepatchBound) return;
      mount.__modDemoBcRepatchBound = true;
      mount.addEventListener(
        'pointerdown',
        function () {
          if (typeof win.applyArmyBcEdgePathPatches === 'function') {
            win.applyArmyBcEdgePathPatches(win);
          }
        },
        true,
      );
    });
  }

  async function loadArmyBcHelperScripts(win, doc) {
    await loadScript(resolveAssetUrl(BASE + 'army-bc-scroll-fix.js'), doc);
    await loadScript(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.js'), doc);
    if (shouldUseLocalArmyBcCatalog(win)) {
      await loadScript(resolveAssetUrl(BASE + 'army-bc-local-engine.js'), doc);
      await loadScript(resolveAssetUrl(BASE + 'army-bc-local-fallback.js'), doc);
      console.info('[mod-demo-bc] Local catalog scripts loaded (?armyBcLocal=1)');
    } else {
      console.info(
        '[mod-demo-bc] Live Edge mode — Alloy/BC not wrapped; expect network calls to edge.adobedc.net/brand-concierge/' +
          EDGE_DEPLOYMENT +
          '/conversations',
      );
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

  function getAlloyConfig() {
    return {
      defaultConsent: 'in',
      edgeDomain: 'edge.adobedc.net',
      edgeBasePath: 'ee',
      datastreamId: getDatastreamId(),
      orgId: ORG_ID,
      debugEnabled: true,
      idMigrationEnabled: false,
      thirdPartyCookiesEnabled: false,
      prehidingStyle: '.personalization-container { opacity: 0 !important }',
    };
  }

  function isAlloyAlreadyConfiguredError(err) {
    var msg = String((err && err.message) || err);
    return msg.indexOf('already been configured') >= 0;
  }

  async function configureAlloyOnce(win, doc) {
    if (!win) return;
    if (win.__modDemoBcAlloyConfiguredWin === win) return;
    if (typeof win.alloy !== 'function') {
      throw new Error('Alloy is not available');
    }
    try {
      await win.alloy('configure', getAlloyConfig());
      await win.alloy('sendEvent', {});
      win.__modDemoBcAlloyConfiguredWin = win;
      if (typeof win.applyArmyBcEdgePathPatches === 'function') {
        win.applyArmyBcEdgePathPatches(win);
      }
    } catch (err) {
      if (isAlloyAlreadyConfiguredError(err)) {
        win.__modDemoBcAlloyConfiguredWin = win;
        return;
      }
      throw err;
    }
  }

  function reportBcStatus(text, isError) {
    var el = document.getElementById('modMessage');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.textContent = text;
    el.className = isError ? 'mod-demo-message mod-demo-message--error' : 'mod-demo-message';
    el.hidden = false;
  }

  function ensureBcCardImageStyles(doc) {
    if (!doc || doc.getElementById('modDemoBcCardImageFix')) return;
    var style = doc.createElement('style');
    style.id = 'modDemoBcCardImageFix';
    style.textContent =
      '.bc-card__image { background-size: cover !important; background-position: center !important; }';
    (doc.head || doc.documentElement).appendChild(style);
  }

  function findHeroInsertPoint(doc) {
    var hero = doc.querySelector('.exp-hero-banner');
    if (!hero) return null;
    return (
      hero.closest('[id^="pin-spacer"]') ||
      hero.closest('.pin-spacer') ||
      hero.closest('.exp-content__block-container') ||
      hero
    );
  }

  function scheduleDisclaimerReposition(doc) {
    if (!doc) return;
    function run() {
      if (typeof global.repositionArmyBcDisclaimer === 'function') {
        doc.querySelectorAll('#brand-concierge-mount, #modDemoBcFrameMount').forEach(function (mount) {
          global.repositionArmyBcDisclaimer(mount);
        });
      }
    }
    run();
    [100, 400, 1000, 2500].forEach(function (ms) {
      setTimeout(run, ms);
    });
  }

  async function bootstrapConcierge(win, selector, stylingConfigurations, options) {
    options = options || {};
    if (!shouldUseLocalArmyBcCatalog(win)) {
      await ensureEdgePathPatchesForLab(win, win.document);
    }
    if (
      !win ||
      !win.adobe ||
      !win.adobe.concierge ||
      typeof win.adobe.concierge.bootstrap !== 'function'
    ) {
      throw new Error('Brand Concierge agent not available');
    }
    if (!stylingConfigurations) {
      throw new Error(
        'Style configuration is missing. Set Brand Concierge style configuration URL in Environment (e.g. army-bc/styleConfigurations-6a0992.js).',
      );
    }
    clearMountInDoc(win.document, selector);
    var bootOpts = {
      instanceName: 'alloy',
      stylingConfigurations: stylingConfigurations,
      selector: selector,
      stickySession: false,
    };
    try {
      await win.adobe.concierge.bootstrap(bootOpts);
      win.__modDemoBcBootstrapped = true;
      if (typeof win.applyArmyBcEdgePathPatches === 'function') {
        win.applyArmyBcEdgePathPatches(win);
      }
      scheduleEdgeRepatch(win);
      bindBcMountRepatch(win, win.document);
      scheduleDisclaimerReposition(win.document);
    } catch (err) {
      clearMountInDoc(win.document, selector);
      try {
        await win.adobe.concierge.bootstrap(bootOpts);
        win.__modDemoBcBootstrapped = true;
        if (typeof win.applyArmyBcEdgePathPatches === 'function') {
          win.applyArmyBcEdgePathPatches(win);
        }
        scheduleEdgeRepatch(win);
        bindBcMountRepatch(win, win.document);
        scheduleDisclaimerReposition(win.document);
        return;
      } catch (retryErr) {
        if (
          options.allowConciergeOpenOnRetry !== false &&
          typeof win.adobe.concierge.open === 'function'
        ) {
          win.adobe.concierge.open();
          win.__modDemoBcBootstrapped = true;
          if (typeof win.applyArmyBcEdgePathPatches === 'function') {
            win.applyArmyBcEdgePathPatches(win);
          }
          scheduleEdgeRepatch(win);
          bindBcMountRepatch(win, win.document);
          scheduleDisclaimerReposition(win.document);
          return;
        }
        throw retryErr;
      }
    }
  }

  function ensureParentCore() {
    var styleUrl = resolveAssetUrl(getStyleConfigUrl());
    var datastreamId = getDatastreamId();
    if (
      parentCoreReady &&
      ((loadedParentStyleUrl && loadedParentStyleUrl !== styleUrl) ||
        (loadedParentDatastreamId && loadedParentDatastreamId !== datastreamId))
    ) {
      parentCoreReady = null;
      loadedParentStyleUrl = null;
      loadedParentDatastreamId = null;
    }
    if (parentCoreReady) return parentCoreReady;
    parentCoreReady = (async function () {
      prepareArmyBcRuntime(global);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.css'), 'shared');
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-scroll-fix.css'), 'shared');
      if (shouldUseLocalArmyBcCatalog(global)) {
        loadStylesheet(resolveAssetUrl(BASE + 'army-bc-local-fallback.css'), 'shared');
      }

      var loadedStyle = await loadStyleConfigScript(getStyleConfigUrl(), global, document);
      loadedParentStyleUrl = loadedStyle || styleUrl;
      loadedParentDatastreamId = datastreamId;
      console.info('[mod-demo-bc] loaded style configuration:', loadedParentStyleUrl);
      console.info('[mod-demo-bc] alloy datastreamId:', loadedParentDatastreamId);
      await ensureEdgePathPatchesForLab(global, document);
      await ensureAlloyJs(global, document);
      await ensureEdgePathPatchesForLab(global, document);
      await ensureConciergeAgent(global, document);
      await configureAlloyOnce(global, document);
      await ensureEdgePathPatchesForLab(global, document);

      await loadArmyBcHelperScripts(global, document);
    })().catch(function (err) {
      parentCoreReady = null;
      console.error('[mod-demo-bc] parent core init failed', err);
      throw err;
    });
    return parentCoreReady;
  }

  function ensureIframeCore() {
    var doc = getIframeDoc();
    if (!doc || !doc.body) {
      return Promise.reject(new Error('MOD site iframe is not ready'));
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
      teardownIframeInlineSection(doc);
    }
    if (iframeCoreReady) return iframeCoreReady;

    iframeCoreReady = (async function () {
      prepareArmyBcRuntime(win);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.css'), 'shared', doc);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-scroll-fix.css'), 'shared', doc);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-inline.css'), 'inline', doc);
      ensureBcCardImageStyles(doc);
      if (shouldUseLocalArmyBcCatalog(win)) {
        loadStylesheet(resolveAssetUrl(BASE + 'army-bc-local-fallback.css'), 'shared', doc);
      }

      var loadedStyle = await loadStyleConfigScript(getStyleConfigUrl(), win, doc);
      loadedIframeStyleUrl = loadedStyle || styleUrl;
      loadedIframeDatastreamId = datastreamId;
      console.info('[mod-demo-bc] loaded style configuration (iframe):', loadedIframeStyleUrl);
      console.info('[mod-demo-bc] alloy datastreamId (iframe):', loadedIframeDatastreamId);
      await ensureEdgePathPatchesForLab(win, doc);
      await ensureAlloyJs(win, doc);
      await ensureEdgePathPatchesForLab(win, doc);
      await ensureConciergeAgent(win, doc);
      await configureAlloyOnce(win, doc);
      await ensureEdgePathPatchesForLab(win, doc);

      await loadArmyBcHelperScripts(win, doc);
    })().catch(function (err) {
      iframeCoreReady = null;
      console.error('[mod-demo-bc] iframe core init failed', err);
      throw err;
    });
    return iframeCoreReady;
  }

  function clearMountInDoc(doc, selector) {
    var el = doc.querySelector(selector);
    if (el) el.innerHTML = '';
  }

  function teardownIframeInlineSection(doc) {
    var section = doc.getElementById(IFRAME_INLINE_SECTION_ID);
    if (section && section.parentNode) {
      clearMountInDoc(doc, IFRAME_MOUNT_SELECTOR);
      section.parentNode.removeChild(section);
    }
  }

  function ensureIframeInlineSection(doc, fullscreen) {
    var existing = doc.getElementById(IFRAME_INLINE_SECTION_ID);
    if (existing) {
      existing.className = fullscreen
        ? 'army-bc-inline mod-demo-army-bc-inline--fullscreen'
        : 'army-bc-inline';
      if (fullscreen) {
        var header = doc.querySelector('.main-page-layout__header');
        if (header && header.parentNode && existing.previousSibling !== header) {
          header.parentNode.insertBefore(existing, header.nextSibling);
        }
      }
      return existing.querySelector(IFRAME_MOUNT_SELECTOR) || existing;
    }
    var section = doc.createElement('section');
    section.id = IFRAME_INLINE_SECTION_ID;
    section.className = fullscreen
      ? 'army-bc-inline mod-demo-army-bc-inline--fullscreen'
      : 'army-bc-inline';
    section.setAttribute('aria-label', 'Army recruitment assistant');
    var mount = doc.createElement('div');
    mount.id = 'brand-concierge-mount';
    mount.className = 'army-bc-inline__mount';
    section.appendChild(mount);
    if (fullscreen) {
      var siteHeader = doc.querySelector('.main-page-layout__header');
      if (siteHeader && siteHeader.parentNode) {
        siteHeader.parentNode.insertBefore(section, siteHeader.nextSibling);
      } else {
        doc.body.insertBefore(section, doc.body.firstChild);
      }
    } else {
      var anchor = findHeroInsertPoint(doc);
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(section, anchor.nextSibling);
      } else {
        doc.body.insertBefore(section, doc.body.firstChild);
      }
    }
    return mount;
  }

  async function bootstrapParent(selector) {
    await ensureParentCore();
    await bootstrapConcierge(global, selector, global.styleConfiguration, {
      allowConciergeOpenOnRetry: false,
    });
    activeMode = 'modal';
  }

  async function bootstrapIframeBcInline(fullscreen) {
    await ensureSnapshotFrame();
    var doc = getIframeDoc();
    if (!doc) throw new Error('MOD site iframe is not ready');

    setSnapshotFullscreenLayout(doc, !!fullscreen);
    setSnapshotInjectedLayout(doc, !fullscreen);
    teardownIframeInlineSection(doc);

    loadStylesheet(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.css'), 'shared');
    loadStylesheet(resolveAssetUrl(BASE + 'army-bc-scroll-fix.css'), 'shared');
    loadStylesheet(resolveAssetUrl(BASE + 'army-bc-inline.css'), 'inline');
    ensureBcCardImageStyles(document);

    showBcFrameHost(!!fullscreen);
    bindBcFrameHostReposition();

    await ensureParentCore();
    await bootstrapConcierge(global, FRAME_OVERLAY_MOUNT_SELECTOR, global.styleConfiguration, {
      allowConciergeOpenOnRetry: false,
    });
    scheduleDisclaimerReposition(document);

    if (!fullscreen) {
      try {
        var hero = doc.querySelector('.exp-hero-banner');
        if (hero && typeof hero.scrollIntoView === 'function') {
          hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (_e) {
        /* noop */
      }
    }
    activeMode = fullscreen ? 'fullscreen' : 'injected';
  }

  async function bootstrapIframeFullscreen() {
    await bootstrapIframeBcInline(true);
  }

  async function bootstrapIframeInjected() {
    await bootstrapIframeBcInline(false);
  }

  async function loadModalAssets() {
    loadStylesheet(resolveAssetUrl(BASE + 'army-bc-popup.css'), 'modal');
    if (!document.querySelector('script[data-mod-demo-bc="' + resolveAssetUrl(BASE + 'army-bc-popup.js') + '"]')) {
      await loadScript(resolveAssetUrl(BASE + 'army-bc-popup.js'));
    }
  }

  function isInjectedOn() {
    return !!(injectedToggle && injectedToggle.checked);
  }

  function isModalOn() {
    return !!(modalToggle && modalToggle.checked);
  }

  function isFullScreenOn() {
    return !!(fullScreenToggle && fullScreenToggle.checked);
  }

  function closeBcModal() {
    if (global.ArmyBcPopup && typeof global.ArmyBcPopup.close === 'function') {
      global.ArmyBcPopup.close();
      return;
    }
    if (!bcModal) return;
    bcModal.classList.remove('is-open');
    bcModal.setAttribute('hidden', '');
    document.body.classList.remove('aep-bc-modal-open');
    if (bcFab) bcFab.setAttribute('aria-expanded', 'false');
  }

  function setModalFabArmed(armed) {
    if (document.body && document.body.classList) {
      document.body.classList.toggle('mod-demo-bc-modal-armed', !!armed);
    }
    if (bcFab) bcFab.hidden = !armed;
  }

  async function ensureModalPopupUi() {
    await loadModalAssets();
    if (typeof global.initArmyBcPopup === 'function') {
      global.initArmyBcPopup();
    }
  }

  function updateChromeVisibility() {
    if (!isModalOn()) {
      closeBcModal();
      setModalFabArmed(false);
    }
    if (document.body && document.body.classList) {
      document.body.classList.toggle('mod-demo-bc-fullscreen-armed', isFullScreenOn());
    }
    var doc = getIframeDoc();
    if (doc) {
      if (!isFullScreenOn()) setSnapshotFullscreenLayout(doc, false);
      if (!isInjectedOn()) setSnapshotInjectedLayout(doc, false);
      if (!isInjectedOn() && !isFullScreenOn()) teardownIframeInlineSection(doc);
    }
    if (!isInjectedOn() && !isFullScreenOn()) {
      hideBcFrameHost();
    }
  }

  var syncInFlight = null;

  async function sync() {
    if (syncInFlight) return syncInFlight;
    syncInFlight = syncInner().finally(function () {
      syncInFlight = null;
    });
    return syncInFlight;
  }

  async function syncInner() {
    updateChromeVisibility();
    var wantInjected = isInjectedOn();
    var wantModal = isModalOn();
    var wantFullScreen = isFullScreenOn();

    if (!wantInjected && !wantModal && !wantFullScreen) {
      var iframeDocOff = getIframeDoc();
      if (iframeDocOff) {
        setSnapshotFullscreenLayout(iframeDocOff, false);
        setSnapshotInjectedLayout(iframeDocOff, false);
        teardownIframeInlineSection(iframeDocOff);
      }
      await restoreModDemoSnapshotFrame();
      clearMountInDoc(document, MODAL_MOUNT_SELECTOR);
      clearMountInDoc(document, FRAME_OVERLAY_MOUNT_SELECTOR);
      hideBcFrameHost();
      activeMode = null;
      reportBcStatus('');
      return;
    }

    var styleUrl = resolveAssetUrl(getStyleConfigUrl());
    try {
      teardownConflictingBcMounts();
      if (wantFullScreen) {
        closeBcModal();
        clearMountInDoc(document, MODAL_MOUNT_SELECTOR);
        await restoreModDemoSnapshotFrame();
        await bootstrapIframeFullscreen();
      } else {
        await restoreModDemoSnapshotFrame();
        if (wantModal) {
          var iframeDocModal = getIframeDoc();
          if (iframeDocModal) teardownIframeInlineSection(iframeDocModal);
          await ensureModalPopupUi();
          await bootstrapParent(MODAL_MOUNT_SELECTOR);
          closeBcModal();
          setModalFabArmed(true);
        } else if (wantInjected) {
          closeBcModal();
          clearMountInDoc(document, MODAL_MOUNT_SELECTOR);
          await bootstrapIframeInjected();
        }
      }
      reportBcStatus('');
    } catch (e) {
      console.error('[mod-demo-bc] sync failed', e);
      var detail = String((e && e.message) || e);
      reportBcStatus(
        'Brand Concierge could not load (' +
          detail +
          '). Style URL: ' +
          styleUrl +
          '. If Tags is injected, try unchecking Enable Brand Concierge when injecting Tags, then toggle Modal again.',
        true,
      );
    }
  }

  function bindToggles() {
    [injectedToggle, modalToggle, fullScreenToggle].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        sync();
      });
    });
  }

  function bindIframeLoad() {
    var frame = getModDemoFrame();
    if (!frame) return;
    frame.addEventListener('load', function () {
      iframeCoreReady = null;
      loadedIframeStyleUrl = null;
      if (isInjectedOn() || isFullScreenOn()) {
        void sync();
      } else {
        void restoreModDemoSnapshotFrame().then(function () {
          var iframeDoc = getIframeDoc();
          if (iframeDoc) teardownIframeInlineSection(iframeDoc);
        });
      }
    });
  }

  bindToggles();
  bindIframeLoad();
  global.ModDemoBc = { sync: sync, invalidateCore: invalidateCore };

  prepareArmyBcRuntime(global);
  void ensureEdgePathPatches(global, document);

  function scheduleInitialSync() {
    if (!isInjectedOn() && !isModalOn() && !isFullScreenOn()) return;
    var frame = getModDemoFrame();
    function run() {
      void sync();
    }
    if ((isInjectedOn() || isFullScreenOn()) && frame) {
      var doc = getIframeDoc();
      if (doc && doc.body) run();
      else frame.addEventListener('load', run, { once: true });
    } else {
      run();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      updateChromeVisibility();
      scheduleInitialSync();
    });
  } else {
    updateChromeVisibility();
    scheduleInitialSync();
  }
})(typeof window !== 'undefined' ? window : this);
