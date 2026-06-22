/**
 * Scalable mobile demo shell — config-driven device frame + iframe app loader.
 *
 * Usage:
 *   window.mobileDemoConfig = MobileDemoConfigs.getPageConfig('ksia');
 *   MobileDemoShell.init({ config: window.mobileDemoConfig, storageKeyPrefix: 'ksiaMobile' });
 *
 * Legacy hub bookmarks (#etihad-phone, …) redirect via mobile-demo-apalmer.html stubs.
 *
 * SDK injection: Tags inject targets iframe via env bar lab-core iframeIds.
 * In-app BC mount: #brand-concierge-mobile-mount inside iframe (see ksia-mobile-app.js).
 * postMessage bridge: parent listens for { source: '{demoId}-mobile-lab', type: '...' }.
 */
(function (global) {
  'use strict';

  var PRESENTATION_CLASS = 'mobile-demo-fs-root--presentation';
  var PRESENTATION_ON_LABEL = 'Exit presentation';
  var PRESENTATION_OFF_LABEL = 'Expand simulator';
  var BROWSER_FS_BANNER_KEY = 'aepMobileDemoBrowserFsBannerDismissed';
  var ENV_FS_BTN_ATTR = 'data-mobile-demo-env-fs-btn';

  /** Spectrum S2 enter/exit — matches aep-fullscreen.js for env toolbar parity. */
  var LOGO_ENTER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM17.75,2.5h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  var LOGO_EXIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM3.25,17h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  function isBrowserFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function exitBrowserFullscreen() {
    if (!isBrowserFullscreen()) return Promise.resolve();
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    return Promise.resolve();
  }

  function purgeBrowserFullscreen() {
    return exitBrowserFullscreen().catch(function () {});
  }

  (function purgeBrowserFullscreenEarly() {
    purgeBrowserFullscreen();
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        if (isBrowserFullscreen()) purgeBrowserFullscreen();
      });
    });
    global.addEventListener('pageshow', function () {
      purgeBrowserFullscreen();
    });
    global.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') purgeBrowserFullscreen();
    });
  })();

  function showBrowserFsBannerIfNeeded() {
    if (!isBrowserFullscreen()) return;
    try {
      if (sessionStorage.getItem(BROWSER_FS_BANNER_KEY)) return;
    } catch (_) {
      /* ignore */
    }
    if (document.getElementById('mobileDemoBrowserFsBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'mobileDemoBrowserFsBanner';
    banner.className = 'mobile-demo-browser-fs-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML =
      '<p class="mobile-demo-browser-fs-banner__text">' +
      '<strong>Browser fullscreen is still active.</strong> Press Esc to exit browser fullscreen, then hard-refresh this page (Ctrl+Shift+R or Cmd+Shift+R).' +
      '</p>' +
      '<button type="button" class="mobile-demo-browser-fs-banner__dismiss">Dismiss</button>';
    var mount = document.body || document.documentElement;
    mount.appendChild(banner);
    var dismiss = banner.querySelector('.mobile-demo-browser-fs-banner__dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        banner.remove();
        try {
          sessionStorage.setItem(BROWSER_FS_BANNER_KEY, '1');
        } catch (_) {
          /* ignore */
        }
      });
    }
  }

  var SIM_QUERY = 'aepSimMobile=1';
  var BEZEL_PREFIX = 'mobile-demo-bezel--';
  var NOTCH_PREFIX = 'mobile-demo-notch--';

  function $(id) {
    return document.getElementById(id);
  }

  function buildSrc(path) {
    var p = String(path || '').trim();
    if (!p) return 'about:blank';
    var sep = p.indexOf('?') >= 0 ? '&' : '?';
    if (p.indexOf('aepSimMobile=') >= 0) return p;
    return p + sep + SIM_QUERY;
  }

  function stripPrefixClasses(el, prefix) {
    if (!el || !el.classList) return;
    var copy = [];
    for (var i = 0; i < el.classList.length; i++) copy.push(el.classList[i]);
    for (var j = 0; j < copy.length; j++) {
      if (copy[j].indexOf(prefix) === 0) el.classList.remove(copy[j]);
    }
  }

  function formatTime() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m;
  }

  function syncStatusBarTime(bar) {
    if (!bar) return;
    var timeEl = bar.querySelector('.mobile-demo-status-bar__time');
    if (timeEl) timeEl.textContent = formatTime();
  }

  /**
   * @param {object} opts
   * @param {object} opts.config — MobileDemoConfig
   * @param {string} [opts.storageKeyPrefix='mobileDemo']
   */
  function init(opts) {
    opts = opts || {};
    var config = opts.config || {};
    var storagePrefix = opts.storageKeyPrefix || config.demoId || 'mobileDemo';
    var storageDeviceKey = 'aepMobileSimDevice_' + storagePrefix;
    var storageDemoKey = 'aepMobileSimDemo_' + storagePrefix;

    var frameId = config.iframeId || 'mobileDemoFrame';
    var frame = $(frameId);
    var viewportEl = $('mobileDemoViewport');
    var bezelEl = $('mobileDemoBezel');
    var notchEl = $('mobileDemoNotch');
    var deviceLabelEl = $('mobileDemoDeviceLabel');
    var statusBarEl = $('mobileDemoStatusBar');
    var toggleRoot = $('mobileDemoDeviceToggle');

    var Cfgs = global.MobileDemoConfigs;
    if (!Cfgs) {
      console.warn('[MobileDemoShell] MobileDemoConfigs not loaded');
      return null;
    }

    var toggleIds = config.deviceToggleDevices || ['iphone17pro', 's24u'];

    function getDevice(id) {
      return Cfgs.getDevice(id) || Cfgs.getDevice('s24u');
    }

    function applyDevice(deviceId, persist) {
      var d = getDevice(deviceId);
      if (!viewportEl || !bezelEl || !notchEl) return d;

      document.documentElement.style.setProperty('--device-vp-w', d.w + 'px');
      document.documentElement.style.setProperty('--device-vp-h', d.h + 'px');

      stripPrefixClasses(bezelEl, BEZEL_PREFIX);
      bezelEl.classList.add(BEZEL_PREFIX + d.bezel);
      if (d.id === 'iphone17pro') {
        bezelEl.classList.add(BEZEL_PREFIX + 'iphone17pro');
      }

      notchEl.className = 'mobile-demo-notch ' + NOTCH_PREFIX + d.notch;
      if (d.id === 'iphone17pro') {
        notchEl.classList.add(NOTCH_PREFIX + 'iphone17pro');
      }

      if (deviceLabelEl) {
        deviceLabelEl.textContent = d.label + ' · simulator';
      }

      viewportEl.classList.remove('mobile-demo-viewport--ios-status', 'mobile-demo-viewport--android-status');
      viewportEl.classList.add('mobile-demo-viewport--with-status');
      if (d.statusBar === 'ios') {
        viewportEl.classList.add('mobile-demo-viewport--ios-status');
      } else if (d.statusBar === 'android') {
        viewportEl.classList.add('mobile-demo-viewport--android-status');
      }

      if (statusBarEl) {
        statusBarEl.className =
          'mobile-demo-status-bar mobile-demo-status-bar--' + (d.statusBar || 'android');
        statusBarEl.innerHTML =
          '<span class="mobile-demo-status-bar__time">' +
          formatTime() +
          '</span>' +
          '<span class="mobile-demo-status-bar__icons" aria-hidden="true">' +
          (d.statusBar === 'ios' ? '●●●○ 📶 🔋' : '📶 🔋 100%') +
          '</span>';
      }

      if (toggleRoot) {
        var btns = toggleRoot.querySelectorAll('.mobile-demo-shell-device-btn');
        for (var bi = 0; bi < btns.length; bi++) {
          var btn = btns[bi];
          var match = btn.getAttribute('data-device-id') === d.id;
          btn.classList.toggle('is-active', match);
          btn.setAttribute('aria-pressed', match ? 'true' : 'false');
        }
      }

      if (persist !== false) {
        try {
          sessionStorage.setItem(storageDeviceKey, d.id);
        } catch (_) {
          /* ignore */
        }
      }
      return d;
    }

    function applyAppUrl(url, persist) {
      if (!frame) return;
      var src = buildSrc(url || config.appEntryUrl);
      frame.src = src;
      if (persist !== false) {
        try {
          sessionStorage.setItem(storageDemoKey, String(url || config.appEntryUrl).split('?')[0]);
        } catch (_) {
          /* ignore */
        }
      }
    }

    function bindDeviceToggle() {
      if (!toggleRoot) return;
      toggleRoot.addEventListener('click', function (e) {
        var btn = e.target.closest('.mobile-demo-shell-device-btn');
        if (!btn) return;
        var id = btn.getAttribute('data-device-id');
        if (id) applyDevice(id, true);
      });
    }

    function renderDeviceToggle() {
      if (!toggleRoot || !Cfgs.DEVICES) return;
      toggleRoot.innerHTML = toggleIds
        .map(function (id) {
          var d = getDevice(id);
          var icon = d.bezel === 'apple' ? '\uF8FF' : '\u25A3';
          return (
            '<button type="button" class="mobile-demo-shell-device-btn" data-device-id="' +
            d.id +
            '" aria-pressed="false">' +
            '<span class="mobile-demo-shell-device-icon" aria-hidden="true">' +
            icon +
            '</span>' +
            '<span class="mobile-demo-shell-device-btn-label">' +
            d.label +
            '</span></button>'
          );
        })
        .join('');
    }

    /* Initial device */
    var initialDevice = config.defaultDevice || toggleIds[0] || 'iphone17pro';
    try {
      var savedDev = sessionStorage.getItem(storageDeviceKey);
      if (savedDev && toggleIds.indexOf(savedDev) >= 0) initialDevice = savedDev;
    } catch (_) {
      /* ignore */
    }

    renderDeviceToggle();
    bindDeviceToggle();
    applyDevice(initialDevice, false);
    applyAppUrl(config.appEntryUrl, false);

    /* Status bar clock */
    if (statusBarEl) {
      setInterval(function () {
        syncStatusBarTime(statusBarEl);
      }, 30000);
    }

    /* Fullscreen helpers (reuse existing ids) */
    initFullscreen();

    return { applyDevice: applyDevice, applyAppUrl: applyAppUrl, getConfig: function () { return config; } };
  }

  function findEnvToolbarInsertPoint() {
    var dockBtn = document.getElementById('aepLabEnvDockToolbarBtn');
    if (dockBtn && dockBtn.parentNode) return { parent: dockBtn.parentNode, before: dockBtn };
    var toolbarActions = document.querySelector('.lab-env-toolbar__actions');
    if (toolbarActions) return { parent: toolbarActions, before: toolbarActions.firstChild };
    return null;
  }

  function initFullscreen() {
    var fsRoot = $('mobileDemoFsRoot');
    var fsBtn = $('mobileDemoFullscreenBtn');
    var fsExitFloat = $('mobileDemoFsExitFloat');
    var envFsBtn = null;

    if (!fsRoot) return;

    function isPresentation() {
      return fsRoot.classList.contains(PRESENTATION_CLASS);
    }

    function syncFsButtons() {
      var on = isPresentation();
      if (fsBtn) {
        fsBtn.textContent = on ? PRESENTATION_ON_LABEL : PRESENTATION_OFF_LABEL;
        fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        fsBtn.setAttribute('title', on ? 'Exit presentation mode' : 'Expand simulator (presentation mode)');
        fsBtn.setAttribute('aria-label', on ? PRESENTATION_ON_LABEL : PRESENTATION_OFF_LABEL);
      }
      if (envFsBtn) {
        envFsBtn.innerHTML = on ? LOGO_EXIT : LOGO_ENTER;
        envFsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        var envLabel = on ? PRESENTATION_ON_LABEL : PRESENTATION_OFF_LABEL;
        envFsBtn.setAttribute('aria-label', envLabel);
        envFsBtn.setAttribute('title', on ? 'Exit presentation mode' : 'Expand simulator (presentation mode)');
      }
      if (fsExitFloat) {
        fsExitFloat.hidden = !on;
        fsExitFloat.setAttribute('aria-label', PRESENTATION_ON_LABEL);
        fsExitFloat.textContent = PRESENTATION_ON_LABEL;
      }
    }

    function setPresentation(on) {
      var active = !!on;
      fsRoot.classList.toggle(PRESENTATION_CLASS, active);
      document.body.classList.toggle('mobile-demo-page--fs', active);
      syncFsButtons();
    }

    function togglePresentation() {
      setPresentation(!isPresentation());
    }

    function mountEnvBarPresentationBtn() {
      if (envFsBtn || document.querySelector('[' + ENV_FS_BTN_ATTR + ']')) {
        envFsBtn = document.querySelector('[' + ENV_FS_BTN_ATTR + ']');
        return !!envFsBtn;
      }
      var point = findEnvToolbarInsertPoint();
      if (!point) return false;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute(ENV_FS_BTN_ATTR, '1');
      btn.className = 'spectrum-env-icon-btn lab-env-fullscreen-btn lab-env-presentation-btn aep-fullscreen-btn';
      btn.addEventListener('click', togglePresentation);
      point.parent.insertBefore(btn, point.before || null);
      envFsBtn = btn;
      document.body.classList.add('mobile-demo-shell-page--env-fs-toolbar');
      syncFsButtons();
      return true;
    }

    function scheduleEnvBarPresentationBtn() {
      mountEnvBarPresentationBtn();
      window.setTimeout(mountEnvBarPresentationBtn, 0);
      window.setTimeout(mountEnvBarPresentationBtn, 400);
      window.setTimeout(mountEnvBarPresentationBtn, 1500);
    }

    /* CSS presentation mode — avoids Chrome sticky “press and hold Esc” overlay */
    purgeBrowserFullscreen().finally(function () {
      if (isBrowserFullscreen()) showBrowserFsBannerIfNeeded();
    });

    if (fsBtn) {
      fsBtn.addEventListener('click', togglePresentation);
    }
    if (fsExitFloat) {
      fsExitFloat.addEventListener('click', function () {
        setPresentation(false);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isPresentation()) setPresentation(false);
    });

    scheduleEnvBarPresentationBtn();
    global.addEventListener('env-bar-change', scheduleEnvBarPresentationBtn);
    global.addEventListener('aep-demo-env-strip-mounted', scheduleEnvBarPresentationBtn);
    syncFsButtons();
  }

  global.MobileDemoShell = {
    init: init,
    buildSrc: buildSrc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
