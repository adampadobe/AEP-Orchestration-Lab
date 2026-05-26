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

  var injectedToggle = document.getElementById('modBcInjectedToggle');
  var modalToggle = document.getElementById('modBcModalToggle');
  var fullScreenToggle = document.getElementById('modBcFullScreenToggle');
  var injectedPanel = document.getElementById('modDemoBcInjectedPanel');
  var bcModal = document.getElementById('aepBcModal');

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
    unloadStyleConfigScripts(document);
    var iframeDoc = getIframeDoc();
    if (iframeDoc) {
      var iframeWin = iframeDoc.defaultView;
      if (iframeWin) iframeWin.__modDemoBcBootstrapped = false;
      unloadStyleConfigScripts(iframeDoc);
      teardownIframeInlineSection(iframeDoc);
    }
    try {
      delete global.styleConfiguration;
    } catch (_e) {
      global.styleConfiguration = undefined;
    }
  }

  function loadScript(src, doc) {
    var targetDoc = doc || document;
    var key = String(src);
    if (targetDoc.querySelector('script[data-mod-demo-bc="' + key + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = targetDoc.createElement('script');
      s.src = key;
      s.async = false;
      s.setAttribute('data-mod-demo-bc', key);
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
          win.styleConfiguration = cfg;
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
    clearMountInDoc(document, '#brand-concierge-mount');
    clearMountInDoc(document, '#modDemoBcModalMount');
    global.__aepBcToggleBootstrapped = false;
    global.__brandConciergeBootstrapped = false;
    global.__modDemoBcBootstrapped = false;
  }

  async function ensureAlloyJs(win, doc) {
    installAlloyStub(win);
    if (typeof win.alloy === 'function') return;
    await loadScript(ALLOY_JS, doc);
    await waitFor(
      function () {
        return typeof win.alloy === 'function';
      },
      15000,
      'Alloy did not become available (check Tags / Launch inject or network).',
    );
  }

  async function ensureConciergeAgent(win, doc) {
    if (win.adobe && win.adobe.concierge && typeof win.adobe.concierge.bootstrap === 'function') {
      return;
    }
    await loadScript(BC_MAIN_JS, doc);
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

  function patchFetchForNld2(win) {
    if (!win || win.__modDemoBcFetchPatched) return;
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
    var nativeFetch = win.fetch;
    if (typeof nativeFetch !== 'function') return;
    win.fetch = function (input, init) {
      if (typeof input === 'string') {
        input = rewrite(input);
      } else if (input && typeof input.url === 'string') {
        var next = rewrite(input.url);
        if (next !== input.url) input = new Request(next, input);
      }
      return nativeFetch.call(this, input, init);
    };
    win.__modDemoBcFetchPatched = true;
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

  async function configureAlloyOnce(win) {
    if (!win) return;
    if (win.__modDemoBcAlloyConfigured) return;
    installAlloyStub(win);
    if (typeof win.alloy !== 'function') {
      throw new Error('Alloy is not available');
    }
    try {
      await win.alloy('configure', ALLOY_CONFIG);
      await win.alloy('sendEvent', {});
      win.__modDemoBcAlloyConfigured = true;
    } catch (err) {
      if (isAlloyAlreadyConfiguredError(err)) {
        win.__modDemoBcAlloyConfigured = true;
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

  async function bootstrapConcierge(win, selector, stylingConfigurations) {
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
    } catch (err) {
      clearMountInDoc(win.document, selector);
      try {
        await win.adobe.concierge.bootstrap(bootOpts);
        win.__modDemoBcBootstrapped = true;
        return;
      } catch (retryErr) {
        if (typeof win.adobe.concierge.open === 'function') {
          win.adobe.concierge.open();
          win.__modDemoBcBootstrapped = true;
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
      patchFetchForNld2(global);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.css'), 'shared');
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-local-fallback.css'), 'shared');
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-scroll-fix.css'), 'shared');

      var loadedStyle = await loadStyleConfigScript(getStyleConfigUrl(), global, document);
      loadedParentStyleUrl = loadedStyle || styleUrl;
      console.info('[mod-demo-bc] loaded style configuration:', loadedParentStyleUrl);
      await ensureAlloyJs(global, document);
      await ensureConciergeAgent(global, document);
      await configureAlloyOnce(global);

      await loadScript(resolveAssetUrl(BASE + 'army-bc-scroll-fix.js'));
      await loadScript(resolveAssetUrl(BASE + 'army-bc-local-engine.js'));
      await loadScript(resolveAssetUrl(BASE + 'army-bc-local-fallback.js'));
      await loadScript(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.js'));
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
      patchFetchForNld2(win);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.css'), 'shared', doc);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-local-fallback.css'), 'shared', doc);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-scroll-fix.css'), 'shared', doc);
      loadStylesheet(resolveAssetUrl(BASE + 'army-bc-inline.css'), 'inline', doc);

      var loadedStyle = await loadStyleConfigScript(getStyleConfigUrl(), win, doc);
      loadedIframeStyleUrl = loadedStyle || styleUrl;
      console.info('[mod-demo-bc] loaded style configuration (iframe):', loadedIframeStyleUrl);
      await ensureAlloyJs(win, doc);
      await ensureConciergeAgent(win, doc);
      await configureAlloyOnce(win);

      await loadScript(resolveAssetUrl(BASE + 'army-bc-scroll-fix.js'), doc);
      await loadScript(resolveAssetUrl(BASE + 'army-bc-local-engine.js'), doc);
      await loadScript(resolveAssetUrl(BASE + 'army-bc-local-fallback.js'), doc);
      await loadScript(resolveAssetUrl(BASE + 'army-bc-disclaimer-layout.js'), doc);
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
      existing.classList.toggle('mod-demo-army-bc-inline--fullscreen', !!fullscreen);
      return existing.querySelector(IFRAME_MOUNT_SELECTOR) || existing;
    }
    var hero =
      doc.querySelector('.exp-hero-banner') ||
      doc.querySelector('.exp-content__block-container') ||
      doc.body.firstElementChild;
    var section = doc.createElement('section');
    section.id = IFRAME_INLINE_SECTION_ID;
    section.className = 'army-bc-inline mod-demo-army-bc-inline';
    if (fullscreen) section.classList.add('mod-demo-army-bc-inline--fullscreen');
    section.setAttribute('aria-label', 'Army recruitment assistant');
    var mount = doc.createElement('div');
    mount.id = 'brand-concierge-mount';
    mount.className = 'army-bc-inline__mount';
    section.appendChild(mount);
    if (hero && hero.parentNode) {
      hero.parentNode.insertBefore(section, hero.nextSibling);
    } else {
      doc.body.insertBefore(section, doc.body.firstChild);
    }
    return mount;
  }

  async function bootstrapParent(selector) {
    await ensureParentCore();
    await bootstrapConcierge(global, selector, global.styleConfiguration);
    activeMode = 'modal';
  }

  async function bootstrapIframeInjected(fullscreen) {
    var doc = getIframeDoc();
    if (!doc) throw new Error('MOD site iframe is not ready');
    var win = doc.defaultView;
    await ensureIframeCore();
    ensureIframeInlineSection(doc, fullscreen);
    await bootstrapConcierge(win, IFRAME_MOUNT_SELECTOR, win.styleConfiguration);
    var section = doc.getElementById(IFRAME_INLINE_SECTION_ID);
    if (section && typeof section.scrollIntoView === 'function') {
      try {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_e) {
        section.scrollIntoView();
      }
    }
    activeMode = fullscreen ? 'fullscreen' : 'injected';
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
    if (!bcModal) return;
    bcModal.classList.remove('is-open');
    bcModal.setAttribute('hidden', '');
    document.body.classList.remove('aep-bc-modal-open');
  }

  function openBcModal() {
    if (!bcModal) return;
    bcModal.classList.add('is-open');
    bcModal.removeAttribute('hidden');
    document.body.classList.add('aep-bc-modal-open');
    var closeBtn = bcModal.querySelector('.aep-bc-modal__close');
    if (closeBtn) closeBtn.focus();
  }

  function updateChromeVisibility() {
    if (injectedPanel) injectedPanel.hidden = true;
    if (!isModalOn()) closeBcModal();
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
      clearMountInDoc(document, '#modDemoBcModalMount');
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
        await loadModalAssets();
        await bootstrapParent('#modDemoBcModalMount');
        openBcModal();
      } else if (wantFullScreen || wantInjected) {
        closeBcModal();
        clearMountInDoc(document, '#modDemoBcModalMount');
        await bootstrapIframeInjected(wantFullScreen);
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

  function bindModalClose() {
    if (!bcModal) return;
    bcModal.querySelectorAll('[data-aep-bc-close]').forEach(function (el) {
      el.addEventListener('click', closeBcModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bcModal.classList.contains('is-open')) closeBcModal();
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
      }
    });
  }

  bindToggles();
  bindModalClose();
  bindIframeLoad();
  global.ModDemoBc = { sync: sync, invalidateCore: invalidateCore };

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
