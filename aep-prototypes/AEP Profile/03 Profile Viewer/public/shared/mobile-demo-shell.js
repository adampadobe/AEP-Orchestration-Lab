/**
 * Scalable mobile demo shell — config-driven device frame + iframe app loader.
 *
 * Usage:
 *   window.mobileDemoConfig = MobileDemoConfigs.getPageConfig('ksia');
 *   MobileDemoShell.init({ config: window.mobileDemoConfig, storageKeyPrefix: 'ksiaMobile' });
 *
 * Hash routes (mobile-demo-apalmer.html#etihad-phone):
 *   MobileDemoShell.initFromHash({ defaultHash: 'etihad-phone', storageKeyPrefix: 'apalmerLab' });
 *
 * SDK injection: Tags inject targets iframe via env bar lab-core iframeIds.
 * In-app BC mount: #brand-concierge-mobile-mount inside iframe (see ksia-mobile-app.js).
 * postMessage bridge: parent listens for { source: '{demoId}-mobile-lab', type: '...' }.
 */
(function (global) {
  'use strict';

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
   * @param {boolean} [opts.showLegacyCustomize=false]
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

    /* Legacy customize drawer (etihad multi-demo picker) */
    if (opts.showLegacyCustomize) {
      initLegacyCustomize(config, storageDemoKey, applyAppUrl, applyDevice);
    }

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

  function initLegacyCustomize(config, storageDemoKey, applyAppUrl, applyDevice) {
    var Cfgs = global.MobileDemoConfigs;
    var select = $('mobileDemoSelect');
    var deviceSelect = $('mobileDemoDeviceSelect');
    var panel = $('mobileDemoCustomizePanel');
    var backdrop = $('mobileDemoCustomizeBackdrop');
    var toggleBtn = $('mobileDemoCustomizeToggle');
    var closeBtn = $('mobileDemoCustomizeClose');

    if (!select || !Cfgs || !Cfgs.LEGACY_DEMOS) return;

    Cfgs.LEGACY_DEMOS.forEach(function (demo) {
      var opt = document.createElement('option');
      opt.value = demo.value;
      opt.textContent = demo.label;
      select.appendChild(opt);
    });

    if (deviceSelect && Cfgs.DEVICES) {
      var toggleIds = config.deviceToggleDevices || ['iphone17pro', 's24u'];
      toggleIds.forEach(function (id) {
        var d = Cfgs.getDevice(id);
        if (!d) return;
        var devOpt = document.createElement('option');
        devOpt.value = d.id;
        devOpt.textContent = d.label;
        deviceSelect.appendChild(devOpt);
      });
      var initialDev = config.defaultDevice || toggleIds[0] || 's24u';
      try {
        var savedDev = sessionStorage.getItem('aepMobileSimDevice_apalmerLab');
        if (savedDev && toggleIds.indexOf(savedDev) >= 0) initialDev = savedDev;
      } catch (_) {
        /* ignore */
      }
      deviceSelect.value = initialDev;
      deviceSelect.addEventListener('change', function () {
        if (typeof applyDevice === 'function') applyDevice(deviceSelect.value, true);
      });
    }

    var initial = config.appEntryUrl || 'etihad-demo.html';
    try {
      var saved = sessionStorage.getItem(storageDemoKey);
      if (saved) initial = saved;
    } catch (_) {
      /* ignore */
    }
    select.value = String(initial).split('?')[0];

    select.addEventListener('change', function () {
      applyAppUrl(select.value, true);
    });

    function setPanelOpen(open) {
      var on = !!open;
      if (panel) {
        panel.classList.toggle('mobile-demo-customize--open', on);
        panel.setAttribute('aria-hidden', on ? 'false' : 'true');
      }
      if (backdrop) {
        backdrop.hidden = !on;
        backdrop.setAttribute('aria-hidden', on ? 'false' : 'true');
      }
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
        toggleBtn.classList.toggle('mobile-demo-customize-tab--open', on);
      }
    }

    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      setPanelOpen(!panel || !panel.classList.contains('mobile-demo-customize--open'));
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { setPanelOpen(false); });
    if (backdrop) backdrop.addEventListener('click', function () { setPanelOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setPanelOpen(false);
    });
  }

  function initFullscreen() {
    var fsRoot = $('mobileDemoFsRoot');
    var fsBtn = $('mobileDemoFullscreenBtn');
    var fsExitFloat = $('mobileDemoFsExitFloat');

    var PRESENTATION_CLASS = 'mobile-demo-fs-root--presentation';

    function isBrowserFs() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function exitBrowserFs() {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
      return Promise.resolve();
    }

    function isPresentation() {
      return fsRoot && fsRoot.classList.contains(PRESENTATION_CLASS);
    }

    function syncFsButton() {
      var on = isPresentation();
      if (fsBtn) {
        fsBtn.textContent = on ? 'Exit full screen' : 'Full screen';
        fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      if (fsExitFloat) fsExitFloat.hidden = !on;
    }

    function setPresentation(on) {
      if (!fsRoot) return;
      var active = !!on;
      fsRoot.classList.toggle(PRESENTATION_CLASS, active);
      document.body.classList.toggle('mobile-demo-page--fs', active);
      syncFsButton();
    }

    if (!fsBtn || !fsRoot) return;

    /* CSS presentation mode — avoids Chrome sticky “press and hold Esc” overlay */
    if (isBrowserFs()) exitBrowserFs().catch(function () {});

    fsBtn.addEventListener('click', function () {
      setPresentation(!isPresentation());
    });
    if (fsExitFloat) {
      fsExitFloat.addEventListener('click', function () {
        setPresentation(false);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isPresentation()) setPresentation(false);
    });
    document.addEventListener('fullscreenchange', function () {
      if (isBrowserFs()) exitBrowserFs().catch(function () {});
    });
    document.addEventListener('webkitfullscreenchange', function () {
      if (isBrowserFs()) exitBrowserFs().catch(function () {});
    });
    syncFsButton();
  }

  /**
   * @param {object} opts
   * @param {string} [opts.defaultHash='etihad-phone']
   * @param {string} [opts.storageKeyPrefix='apalmerLab']
   */
  function initFromHash(opts) {
    opts = opts || {};
    var Cfgs = global.MobileDemoConfigs;
    if (!Cfgs) return null;

    function normalizeHashKey() {
      return (global.location.hash || '').replace(/^#/, '').trim();
    }

    function ensureDefaultNavHash(defaultKey) {
      var k = normalizeHashKey();
      if (Cfgs.resolveHashRoute(k)) return k;
      if (!k && global.history && global.history.replaceState) {
        try {
          global.history.replaceState(null, '', global.location.pathname + global.location.search + '#' + defaultKey);
        } catch (_) {
          /* ignore */
        }
        return defaultKey;
      }
      return k;
    }

    var hashKey = ensureDefaultNavHash(opts.defaultHash || 'etihad-phone');
    var route = Cfgs.resolveHashRoute(hashKey);

    if (route && route.redirect) {
      global.location.replace(route.redirect);
      return null;
    }

    var config = route || Cfgs.resolveHashRoute('etihad-phone') || {};
    var shell = init({
      config: config,
      storageKeyPrefix: opts.storageKeyPrefix || 'apalmerLab',
      showLegacyCustomize: !!config.legacyDemoSelect,
    });

    global.addEventListener('hashchange', function () {
      var k = normalizeHashKey();
      var r = Cfgs.resolveHashRoute(k);
      if (r && r.redirect) {
        global.location.replace(r.redirect);
        return;
      }
      if (!r || !shell) return;
      shell.applyAppUrl(r.appEntryUrl, true);
      if (r.defaultDevice) shell.applyDevice(r.defaultDevice, true);
    });

    return shell;
  }

  global.MobileDemoShell = {
    init: init,
    initFromHash: initFromHash,
    buildSrc: buildSrc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
