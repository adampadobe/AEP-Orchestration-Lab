/**
 * MOD demo — Army Brand Concierge: modal (parent shell) + injected inline in site iframe.
 */
(function (global) {
  'use strict';

  var BASE = 'army-bc/';
  var PROFILE_VIEWER_PREFIX = '/profile-viewer/';
  var DATASTREAM_ID = 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
  var ORG_ID = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
  var EDGE_DEPLOYMENT = 'nld2';
  var IFRAME_ID = 'modDemoSiteFrame';
  var IFRAME_INLINE_SECTION_ID = 'modDemoArmyBcInline';
  var IFRAME_MOUNT_SELECTOR = '#brand-concierge-mount';
  var IFRAME_INJECTED_MOUNT_SELECTOR = '#modDemoArmyBcInline #brand-concierge-mount';
  var MODAL_MOUNT_SELECTOR = '#aepBcModal #brand-concierge-mount';
  var DEFAULT_FRAME_SRC = 'mod-demo-assets/army-home-snapshot.html';
  var FULLSCREEN_FRAME_SRC = BASE + 'mod-bc-fullscreen-shell.html';

  var injectedToggle = document.getElementById('modBcInjectedToggle');
  var modalToggle = document.getElementById('modBcModalToggle');
  var fullScreenToggle = document.getElementById('modBcFullScreenToggle');
  var bcModal = document.getElementById('aepBcModal');
  var bcFab = document.getElementById('modDemoBcFab');

  var parentCoreReady = null;
  var iframeCoreReady = null;
  var loadedParentStyleUrl = null;
  var loadedIframeStyleUrl = null;
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

  function isFullscreenFrameLoaded() {
    return getFrameSrcPath().indexOf('mod-bc-fullscreen-shell.html') >= 0;
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

  async function ensureFrameSrcForMode(fullscreen) {
    var frame = getModDemoFrame();
    if (!frame) return;
    var target = fullscreen ? FULLSCREEN_FRAME_SRC : DEFAULT_FRAME_SRC;
    var current = getFrameSrcPath();
    if (current.indexOf(target) >= 0) {
      await waitForFrameLoad(frame);
      return;
    }
    iframeCoreReady = null;
    loadedIframeStyleUrl = null;
    await new Promise(function (resolve) {
      frame.addEventListener('load', function () {
        resolve();
      }, { once: true });
      frame.src = target;
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
    activeMode = null;
    global.__aepBcToggleBootstrapped = false;
    global.__modDemoBcBootstrapped = false;
    global.__armyBcForceLocal = false;
    unloadStyleConfigScripts(document);
    var iframeDoc = getIframeDoc();
    if (iframeDoc) {
      var iframeWin = iframeDoc.defaultView;
      if (iframeWin) {
        iframeWin.__modDemoBcBootstrapped = false;
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
    global.__aepBcToggleBootstrapped = false;
    global.__brandConciergeBootstrapped = false;
    global.__modDemoBcBootstrapped = false;
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
    await loadScript(resolveAssetUrl(BASE + 'army-bc-edge-path.js'), doc);
    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    }
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

  var ALLOY_CONFIG = {
    defaultConsent: 'in',
    edgeDomain: 'edge.adobedc.net',
    edgeBasePath: 'ee',
    datastreamId: DATASTREAM_ID,
    orgId: ORG_ID,
    debugEnabled: true,
    idMigrationEnabled: false,
    thirdPartyCookiesEnabled: false,
    prehidingStyle: '.personalization-container { opacity: 0 !important }',
  };

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
      await win.alloy('configure', ALLOY_CONFIG);
      await win.alloy('sendEvent', {});
      win.__modDemoBcAlloyConfiguredWin = win;
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
        doc.querySelectorAll('#brand-concierge-mount').forEach(function (mount) {
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
      await ensureEdgePathPatches(win, win.document);
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
      scheduleDisclaimerReposition(win.document);
    } catch (err) {
      clearMountInDoc(win.document, selector);
      try {
        await win.adobe.concierge.bootstrap(bootOpts);
        win.__modDemoBcBootstrapped = true;
        if (typeof win.applyArmyBcEdgePathPatches === 'function') {
          win.applyArmyBcEdgePathPatches(win);
        }
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
          scheduleDisclaimerReposition(win.document);
          return;
        }
        throw retryErr;
      }
    }
  }

  function ensureParentCore() {
    var styleUrl = resolveAssetUrl(getStyleConfigUrl());
    if (parentCoreReady && loadedParentStyleUrl && loadedParentStyleUrl !== styleUrl) {
      parentCoreReady = null;
      loadedParentStyleUrl = null;
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
      console.info('[mod-demo-bc] loaded style configuration:', loadedParentStyleUrl);
      await ensureEdgePathPatches(global, document);
      await ensureAlloyJs(global, document);
      await ensureEdgePathPatches(global, document);
      await ensureConciergeAgent(global, document);
      await configureAlloyOnce(global, document);

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
    if (iframeCoreReady && loadedIframeStyleUrl && loadedIframeStyleUrl !== styleUrl) {
      iframeCoreReady = null;
      loadedIframeStyleUrl = null;
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
      console.info('[mod-demo-bc] loaded style configuration (iframe):', loadedIframeStyleUrl);
      await ensureEdgePathPatches(win, doc);
      await ensureAlloyJs(win, doc);
      await ensureEdgePathPatches(win, doc);
      await ensureConciergeAgent(win, doc);
      await configureAlloyOnce(win, doc);

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
    var anchor = findHeroInsertPoint(doc);
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(section, anchor.nextSibling);
    } else {
      doc.body.insertBefore(section, doc.body.firstChild);
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

  function isFullscreenShellBootstrapped(doc, win) {
    if (!doc || !win) return false;
    if (win.__modDemoBcBootstrapped) return true;
    var mount = doc.querySelector(IFRAME_MOUNT_SELECTOR);
    return !!(mount && mount.childElementCount > 0);
  }

  async function bootstrapIframeFullscreen() {
    await ensureFrameSrcForMode(true);
    var doc = getIframeDoc();
    if (!doc) throw new Error('MOD fullscreen iframe is not ready');
    var win = doc.defaultView;
    if (!win) throw new Error('MOD fullscreen window is not ready');

    if (typeof win.applyArmyBcEdgePathPatches === 'function') {
      win.applyArmyBcEdgePathPatches(win);
    } else {
      await ensureEdgePathPatches(win, doc);
    }

    var styleUrl = resolveAssetUrl(getStyleConfigUrl());
    var usesCustomStyle = styleUrl.indexOf('styleConfigurations-6a0992') < 0;
    var shellLive = isFullscreenShellBootstrapped(doc, win);

    if (usesCustomStyle || !shellLive) {
      await loadStyleConfigScript(getStyleConfigUrl(), win, doc);
      if (!win.styleConfiguration) {
        throw new Error('Style configuration missing in fullscreen shell');
      }
      await bootstrapConcierge(win, IFRAME_MOUNT_SELECTOR, win.styleConfiguration, {
        allowConciergeOpenOnRetry: false,
      });
    } else {
      win.__modDemoBcBootstrapped = true;
      await loadArmyBcHelperScripts(win, doc);
      scheduleDisclaimerReposition(doc);
      if (typeof win.applyArmyBcEdgePathPatches === 'function') {
        win.applyArmyBcEdgePathPatches(win);
      }
    }

    activeMode = 'fullscreen';
  }

  async function bootstrapIframeInjected() {
    await ensureFrameSrcForMode(false);
    var doc = getIframeDoc();
    if (!doc) throw new Error('MOD site iframe is not ready');
    var win = doc.defaultView;
    if (!win) throw new Error('MOD site iframe window is not ready');

    iframeCoreReady = null;
    loadedIframeStyleUrl = null;
    teardownIframeInlineSection(doc);
    ensureIframeInlineSection(doc, false);
    loadStylesheet(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.css'), 'shared', doc);
    loadStylesheet(resolveAssetUrl(BASE + 'army-bc-scroll-fix.css'), 'shared', doc);
    loadStylesheet(resolveAssetUrl(BASE + 'army-bc-inline.css'), 'inline', doc);
    ensureBcCardImageStyles(doc);

    if (typeof win.activateModDemoInjectedBc === 'function') {
      await win.activateModDemoInjectedBc(getStyleConfigUrl(), IFRAME_INJECTED_MOUNT_SELECTOR);
      scheduleDisclaimerReposition(doc);
    } else {
      await ensureIframeCore();
      await bootstrapConcierge(win, IFRAME_INJECTED_MOUNT_SELECTOR, win.styleConfiguration, {
        allowConciergeOpenOnRetry: false,
      });
    }

    var section = doc.getElementById(IFRAME_INLINE_SECTION_ID);
    if (section && typeof section.scrollIntoView === 'function') {
      try {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_e) {
        section.scrollIntoView();
      }
    }
    activeMode = 'injected';
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
    if (doc && !isInjectedOn() && !isFullScreenOn()) {
      teardownIframeInlineSection(doc);
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
      var iframeDoc = getIframeDoc();
      if (iframeDoc) teardownIframeInlineSection(iframeDoc);
      clearMountInDoc(document, MODAL_MOUNT_SELECTOR);
      activeMode = null;
      reportBcStatus('');
      return;
    }

    var styleUrl = resolveAssetUrl(getStyleConfigUrl());
    try {
      teardownConflictingBcMounts();
      if (wantModal) {
        var iframeDocModal = getIframeDoc();
        if (iframeDocModal) teardownIframeInlineSection(iframeDocModal);
        await ensureModalPopupUi();
        await bootstrapParent(MODAL_MOUNT_SELECTOR);
        closeBcModal();
        setModalFabArmed(true);
      } else if (wantFullScreen) {
        closeBcModal();
        clearMountInDoc(document, MODAL_MOUNT_SELECTOR);
        await bootstrapIframeFullscreen();
      } else if (wantInjected) {
        closeBcModal();
        clearMountInDoc(document, MODAL_MOUNT_SELECTOR);
        await bootstrapIframeInjected();
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
      } else if (isFullscreenFrameLoaded()) {
        teardownIframeInlineSection(getIframeDoc());
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
