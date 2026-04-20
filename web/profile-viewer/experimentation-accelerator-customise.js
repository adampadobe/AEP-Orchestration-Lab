/**
 * Customise dock: per–AEP-sandbox assets for Accelerator (overview stitch + experiments + chrome).
 * Storage: localStorage aepExpAccelImageUrls JSON { [sandboxKey]: fields }.
 */
(function () {
  var LS = 'aepExpAccelImageUrls';

  function defaultBase() {
    try {
      return new URL('assets/experimentation-accelerator/', window.location.href).href;
    } catch (e) {
      return '';
    }
  }

  var DEFAULTS = {
    overview1: defaultBase() + 'accelerator-overview-1.png',
    overview2: defaultBase() + 'accelerator-overview-2.png',
    experiments: defaultBase() + 'accelerator-experiments.png',
    stitchOverlapPx: '96',
    clipTop: '26%',
    clipLeft: '5.1%',
  };

  function sandboxKey(name) {
    var s = name != null ? String(name).trim() : '';
    return s || '_default';
  }

  function readAll() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function writeAll(obj) {
    try {
      localStorage.setItem(LS, JSON.stringify(obj));
    } catch (e) {}
    if (window.AepLabSandboxSync && typeof AepLabSandboxSync.notifyDirty === 'function') {
      AepLabSandboxSync.notifyDirty();
    }
  }

  function getUrlsForSandbox(sb) {
    var all = readAll();
    return migrateStored(all[sandboxKey(sb)] || null);
  }

  function saveUrlsForSandbox(sb, data) {
    var all = readAll();
    all[sandboxKey(sb)] = data;
    writeAll(all);
  }

  function migrateStored(stored) {
    if (!stored || typeof stored !== 'object') return stored;
    if (stored.overview1 || stored.overview2 || stored.experiments) return stored;
    if (stored.step1) {
      return {
        overview1: stored.step1,
        overview2: stored.step2 || DEFAULTS.overview2,
        experiments: stored.experiments || DEFAULTS.experiments,
        stitchOverlapPx: stored.stitchOverlapPx || DEFAULTS.stitchOverlapPx,
        clipTop: stored.clipTop || DEFAULTS.clipTop,
        clipLeft: stored.clipLeft || DEFAULTS.clipLeft,
      };
    }
    return stored;
  }

  function mergeWithDefaults(stored) {
    var s = migrateStored(stored);
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      o[k] =
        s && typeof s[k] === 'string' && s[k].trim()
          ? s[k].trim()
          : DEFAULTS[k];
    });
    return o;
  }

  function applyUrlsToPage(urls) {
    var u = mergeWithDefaults(urls);
    if (window.__expAccelApplyAssets) {
      window.__expAccelApplyAssets({
        overview1: u.overview1,
        overview2: u.overview2,
        experiments: u.experiments,
        stitchOverlapPx: u.stitchOverlapPx,
        clipTop: u.clipTop,
        clipLeft: u.clipLeft,
      });
    }
  }

  function currentSandboxName() {
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return AepGlobalSandbox.getSandboxName() || '';
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function fillInputsFromStored() {
    var sb = currentSandboxName();
    var stored = migrateStored(getUrlsForSandbox(sb));
    var m = mergeWithDefaults(stored);
    function set(id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val || '';
    }
    set('expAccelUrlOverview1', m.overview1);
    set('expAccelUrlOverview2', m.overview2);
    set('expAccelUrlExperiments', m.experiments);
    set('expAccelStitchOverlap', m.stitchOverlapPx);
    set('expAccelClipTop', m.clipTop);
    set('expAccelClipLeft', m.clipLeft);
  }

  function collectInputsRaw() {
    function val(id) {
      var el = document.getElementById(id);
      return el && el.value != null ? String(el.value).trim() : '';
    }
    return {
      overview1: val('expAccelUrlOverview1'),
      overview2: val('expAccelUrlOverview2'),
      experiments: val('expAccelUrlExperiments'),
      stitchOverlapPx: val('expAccelStitchOverlap'),
      clipTop: val('expAccelClipTop'),
      clipLeft: val('expAccelClipLeft'),
    };
  }

  function validateUrl(s) {
    if (!s) return false;
    try {
      var u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  function isRelativeAsset(s) {
    if (!s) return false;
    if (validateUrl(s)) return false;
    return /^[\w\-./]+$/.test(s) && !s.startsWith('//');
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('expAccelCustomiseStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  }

  function initDock() {
    var mainEl = document.querySelector('main.dashboard-main.profile-viewer-main');
    var dockOuter = document.getElementById('expAccelDockOuter');
    var drawer = document.getElementById('expAccelCustomiseDrawer');
    var hit = document.getElementById('expAccelDockHit');
    if (!mainEl || !dockOuter) return;

    var PEEK_PX = 40;
    var peekRaf = null;
    var lastX = 0;
    var lastY = 0;

    function alignDock() {
      var r = mainEl.getBoundingClientRect();
      dockOuter.style.left = Math.max(0, r.left) + 'px';
      dockOuter.style.width = Math.min(r.width, window.innerWidth) + 'px';
    }

    function setPeekFromPoint(clientX, clientY) {
      if (drawer && drawer.open) {
        dockOuter.classList.add('workflow-dock-outer--peek');
        return;
      }
      var r = mainEl.getBoundingClientRect();
      var nearBottom = clientY >= window.innerHeight - PEEK_PX;
      var inMain = clientX >= r.left && clientX <= r.right;
      if (nearBottom && inMain) {
        dockOuter.classList.add('workflow-dock-outer--peek');
      } else {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    }

    function onMouseMove(e) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (peekRaf) return;
      peekRaf = window.requestAnimationFrame(function () {
        peekRaf = null;
        setPeekFromPoint(lastX, lastY);
      });
    }

    alignDock();
    try {
      var ro = new ResizeObserver(alignDock);
      ro.observe(mainEl);
    } catch (e) {}
    window.addEventListener('resize', alignDock);
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () {
      if (drawer && !drawer.open) {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    });

    if (drawer) {
      drawer.addEventListener('toggle', function () {
        if (drawer.open) {
          dockOuter.classList.add('workflow-dock-outer--peek');
        } else {
          setPeekFromPoint(lastX, lastY);
        }
      });
    }

    if (hit) {
      hit.addEventListener(
        'touchstart',
        function () {
          dockOuter.classList.add('workflow-dock-outer--peek');
        },
        { passive: true }
      );
    }
  }

  function initSandboxSelect() {
    var sel = document.getElementById('expAccelSandboxSelect');
    if (!sel || typeof AepGlobalSandbox === 'undefined') return;
    AepGlobalSandbox.loadSandboxesIntoSelect(sel).then(function () {
      AepGlobalSandbox.onSandboxSelectChange(sel);
      AepGlobalSandbox.attachStorageSync(sel);
    });
  }

  function resolveStoredRow(c) {
    var out = {};
    var k;
    for (k in DEFAULTS) {
      if (k === 'stitchOverlapPx' || k === 'clipTop' || k === 'clipLeft') {
        var v = c[k] != null ? String(c[k]).trim() : '';
        out[k] = v || DEFAULTS[k];
        continue;
      }
      var v2 = c[k] || '';
      if (!v2) {
        out[k] = DEFAULTS[k];
      } else if (isRelativeAsset(v2)) {
        try {
          out[k] = new URL(v2, window.location.href).href;
        } catch (e) {
          out[k] = v2;
        }
      } else if (validateUrl(v2)) {
        out[k] = v2;
      } else {
        out[k] = DEFAULTS[k];
      }
    }
    return out;
  }

  function init() {
    initDock();
    initSandboxSelect();

    var btn = document.getElementById('expAccelCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        var c = collectInputsRaw();
        var fk;
        for (fk in DEFAULTS) {
          if (fk === 'stitchOverlapPx' || fk === 'clipTop' || fk === 'clipLeft') continue;
          if (c[fk] && !validateUrl(c[fk]) && !isRelativeAsset(c[fk])) {
            setStatus('Asset fields need valid https URLs or a relative path, or leave empty for defaults.', 'err');
            return;
          }
        }
        var so = c.stitchOverlapPx;
        if (so && !/^\d+$/.test(so)) {
          setStatus('Stitch overlap must be a whole number of pixels.', 'err');
          return;
        }
        var out = resolveStoredRow(c);
        var sb = currentSandboxName();
        saveUrlsForSandbox(sb, out);
        applyUrlsToPage(out);
        setStatus('Updated accelerator demo for sandbox “' + (sb || 'default') + '”.', 'ok');
      });
    }

    function refreshFromStorage() {
      fillInputsFromStored();
      var stored = migrateStored(getUrlsForSandbox(currentSandboxName()));
      applyUrlsToPage(stored);
    }

    window.addEventListener('aep-global-sandbox-change', function () {
      var sel = document.getElementById('expAccelSandboxSelect');
      if (sel && typeof AepGlobalSandbox !== 'undefined') {
        var n = AepGlobalSandbox.getSandboxName();
        if (
          n !== undefined &&
          Array.from(sel.options).some(function (o) {
            return o.value === n;
          })
        ) {
          sel.value = n;
        }
      }
      refreshFromStorage();
    });

    document.addEventListener('aep-lab-sandbox-keys-applied', function () {
      refreshFromStorage();
    });

    if (window.__aepLabSyncReady && typeof window.__aepLabSyncReady.then === 'function') {
      window.__aepLabSyncReady.then(function () {
        refreshFromStorage();
      });
    } else {
      refreshFromStorage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
