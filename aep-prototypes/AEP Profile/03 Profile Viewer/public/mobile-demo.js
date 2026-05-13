/**
 * Mobile simulator: iframe demo loader, device chrome, customize drawer, fullscreen.
 */
(function () {
  var DEMOS = [
    { value: 'fnb-demo.html', label: 'FNB (demo)' },
    { value: 'oldmutual-demo.html', label: 'Old Mutual (demo)' },
    { value: 'oldmutual-wealth.html', label: 'Old Mutual Wealth (demo)' },
    { value: 'donate-demo.html', label: 'Donate (demo)' },
    { value: 'race-for-life-demo.html', label: 'Race for Life (demo)' },
    { value: 'events-trigger.html', label: 'Events trigger' },
    { value: 'firebase-hosting.html', label: 'Firebase images' },
  ];

  /**
   * Logical CSS px viewport + bezel chrome (frame is cosmetic; user can still resize).
   * bezel: class suffix for .mobile-demo-bezel--*
   * notch: class suffix for .mobile-demo-notch--*
   */
  var DEVICES = [
    { id: 's24u', label: 'Samsung Galaxy S24 Ultra', w: 412, h: 915, bezel: 'samsung', notch: 'samsung' },
    { id: 's23', label: 'Samsung Galaxy S23', w: 360, h: 780, bezel: 'samsung', notch: 'samsung' },
    { id: 'iphone15p', label: 'Apple iPhone 15 Pro', w: 393, h: 852, bezel: 'apple', notch: 'dynamic-island' },
    { id: 'iphone14', label: 'Apple iPhone 14', w: 390, h: 844, bezel: 'apple', notch: 'apple-lite' },
    { id: 'pixel8', label: 'Google Pixel 8', w: 412, h: 915, bezel: 'pixel', notch: 'punch-hole' },
    { id: 'pixel8pro', label: 'Google Pixel 8 Pro', w: 412, h: 892, bezel: 'pixel', notch: 'punch-hole' },
    { id: 'oneplus12', label: 'OnePlus 12', w: 412, h: 919, bezel: 'oneplus', notch: 'oblong' },
    { id: 'ipad11', label: 'Apple iPad Pro 11″', w: 834, h: 1194, bezel: 'ipad', notch: 'none' },
  ];

  /** Deep links from Demos → Mobile (channel-first nav). */
  var HASH_ROUTES = {
    'fnb-phone': { demo: 'fnb-demo.html', device: 's24u' },
    'fnb-ipad': { demo: 'fnb-demo.html', device: 'ipad11' },
  };

  function normalizeHashKey() {
    return (window.location.hash || '').replace(/^#/, '').trim();
  }

  function ensureDefaultNavHash() {
    var k = normalizeHashKey();
    if (HASH_ROUTES[k]) return k;
    if (!k && window.history && window.history.replaceState) {
      try {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + '#fnb-phone'
        );
      } catch (e) {
        /* ignore */
      }
      return 'fnb-phone';
    }
    return k;
  }

  function routeFromHash() {
    var k = ensureDefaultNavHash();
    return HASH_ROUTES[k] || null;
  }

  var SIM_QUERY = 'aepSimMobile=1';
  var STORAGE_KEY = 'aepMobileSimDemoPath';
  var STORAGE_KEY_DEVICE = 'aepMobileSimDeviceId';

  var frame = document.getElementById('mobileDemoFrame');
  var select = document.getElementById('mobileDemoSelect');
  var deviceSelect = document.getElementById('mobileDemoDeviceSelect');
  var panel = document.getElementById('mobileDemoCustomizePanel');
  var backdrop = document.getElementById('mobileDemoCustomizeBackdrop');
  var toggleBtn = document.getElementById('mobileDemoCustomizeToggle');
  var closeBtn = document.getElementById('mobileDemoCustomizeClose');
  var fsRoot = document.getElementById('mobileDemoFsRoot');
  var fsBtn = document.getElementById('mobileDemoFullscreenBtn');
  var viewportEl = document.getElementById('mobileDemoViewport');
  var bezelEl = document.getElementById('mobileDemoBezel');
  var notchEl = document.getElementById('mobileDemoNotch');
  var deviceLabelEl = document.getElementById('mobileDemoDeviceLabel');

  var BEZEL_PREFIX = 'mobile-demo-bezel--';
  var NOTCH_PREFIX = 'mobile-demo-notch--';

  function buildSrc(path) {
    var p = (path || '').trim();
    if (!p) return 'fnb-demo.html?' + SIM_QUERY;
    var sep = p.indexOf('?') >= 0 ? '&' : '?';
    if (p.indexOf('aepSimMobile=') >= 0) return p;
    return p + sep + SIM_QUERY;
  }

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

  function applyDemoPath(path, persist) {
    if (!frame) return;
    var src = buildSrc(path);
    frame.src = src;
    if (persist !== false) {
      try {
        sessionStorage.setItem(STORAGE_KEY, path.split('?')[0]);
      } catch (_) {
        /* ignore */
      }
    }
    if (select) {
      var base = path.split('?')[0];
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === base) {
          select.selectedIndex = i;
          break;
        }
      }
    }
  }

  function getDeviceById(id) {
    for (var i = 0; i < DEVICES.length; i++) {
      if (DEVICES[i].id === id) return DEVICES[i];
    }
    return null;
  }

  function stripBezelVariants(el) {
    if (!el || !el.classList) return;
    var list = el.classList;
    var copy = [];
    for (var i = 0; i < list.length; i++) copy.push(list[i]);
    for (var j = 0; j < copy.length; j++) {
      if (copy[j].indexOf(BEZEL_PREFIX) === 0) el.classList.remove(copy[j]);
    }
  }

  function applyDevice(deviceId, persist) {
    var d = getDeviceById(deviceId) || DEVICES[0];
    if (!viewportEl || !bezelEl || !notchEl) return;

    document.documentElement.style.setProperty('--device-vp-w', d.w + 'px');
    document.documentElement.style.setProperty('--device-vp-h', d.h + 'px');

    stripBezelVariants(bezelEl);
    bezelEl.classList.add(BEZEL_PREFIX + d.bezel);

    notchEl.className = 'mobile-demo-notch ' + NOTCH_PREFIX + d.notch;

    if (deviceLabelEl) {
      deviceLabelEl.textContent = d.label + ' · simulator';
    }

    if (deviceSelect) deviceSelect.value = d.id;

    if (persist !== false) {
      try {
        sessionStorage.setItem(STORAGE_KEY_DEVICE, d.id);
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (select) {
    DEMOS.forEach(function (demo) {
      var opt = document.createElement('option');
      opt.value = demo.value;
      opt.textContent = demo.label;
      select.appendChild(opt);
    });

    var hashRoute = routeFromHash();
    var initial = 'fnb-demo.html';
    if (hashRoute) {
      initial = hashRoute.demo;
    } else {
      try {
        var saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          for (var si = 0; si < DEMOS.length; si++) {
            if (DEMOS[si].value === saved) {
              initial = saved;
              break;
            }
          }
        }
      } catch (_) {
        /* ignore */
      }
    }

    select.value = initial.split('?')[0];
    var built = buildSrc(initial);
    if (frame.getAttribute('src') !== built) {
      frame.src = built;
    }

    select.addEventListener('change', function () {
      applyDemoPath(select.value, true);
    });
  }

  if (deviceSelect) {
    DEVICES.forEach(function (dev) {
      var opt = document.createElement('option');
      opt.value = dev.id;
      opt.textContent = dev.label;
      deviceSelect.appendChild(opt);
    });

    var hashRouteDev = routeFromHash();
    var initialDev = 's24u';
    if (hashRouteDev) {
      initialDev = hashRouteDev.device;
    } else {
      try {
        var savedD = sessionStorage.getItem(STORAGE_KEY_DEVICE);
        if (savedD && getDeviceById(savedD)) initialDev = savedD;
      } catch (_) {
        /* ignore */
      }
    }

    applyDevice(initialDev, false);

    deviceSelect.addEventListener('change', function () {
      applyDevice(deviceSelect.value, true);
    });
  }

  window.addEventListener('hashchange', function () {
    var k = normalizeHashKey();
    if (!HASH_ROUTES[k]) return;
    var r = HASH_ROUTES[k];
    applyDemoPath(r.demo, true);
    applyDevice(r.device, true);
  });

  function togglePanel() {
    var open = !panel || !panel.classList.contains('mobile-demo-customize--open');
    setPanelOpen(open);
  }

  if (toggleBtn) toggleBtn.addEventListener('click', togglePanel);
  if (closeBtn) closeBtn.addEventListener('click', function () {
    setPanelOpen(false);
  });
  if (backdrop) backdrop.addEventListener('click', function () {
    setPanelOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      exitFs().catch(function () {});
      return;
    }
    setPanelOpen(false);
  });

  /* Fullscreen */
  function isFs() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function exitFs() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    return Promise.resolve();
  }

  function enterFs(el) {
    if (!el) return Promise.resolve();
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    return Promise.resolve();
  }

  var fsExitFloat = document.getElementById('mobileDemoFsExitFloat');

  function syncFsButton() {
    var fs = isFs();
    if (fsBtn) {
      fsBtn.textContent = fs ? 'Exit full screen' : 'Full screen';
      fsBtn.setAttribute('aria-pressed', fs ? 'true' : 'false');
    }
    if (fsExitFloat) fsExitFloat.hidden = !fs;
    document.body.classList.toggle('mobile-demo-page--fs', fs);
  }

  if (fsBtn && fsRoot) {
    fsBtn.addEventListener('click', function () {
      if (isFs()) {
        exitFs().catch(function () {});
      } else {
        enterFs(fsRoot).catch(function () {});
      }
    });

    if (fsExitFloat) {
      fsExitFloat.addEventListener('click', function () {
        exitFs().catch(function () {});
      });
    }

    document.addEventListener('fullscreenchange', syncFsButton);
    document.addEventListener('webkitfullscreenchange', syncFsButton);
    syncFsButton();
  }

})();
