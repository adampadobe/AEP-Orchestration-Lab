/**
 * Customise dock: per–AEP-sandbox image URLs for the two-step AJO accelerator demo.
 * Storage: localStorage aepExpAccelImageUrls JSON { [sandboxKey]: { step1, step2 } }.
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
    step1: defaultBase() + 'demo-step-1.png',
    step2: defaultBase() + 'demo-step-2.png',
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
    return all[sandboxKey(sb)] || null;
  }

  function saveUrlsForSandbox(sb, data) {
    var all = readAll();
    all[sandboxKey(sb)] = data;
    writeAll(all);
  }

  function mergeWithDefaults(stored) {
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      o[k] =
        stored && typeof stored[k] === 'string' && stored[k].trim()
          ? stored[k].trim()
          : DEFAULTS[k];
    });
    return o;
  }

  function bust(pathOrUrl) {
    if (!pathOrUrl) return pathOrUrl;
    if (pathOrUrl.indexOf('http://') === 0 || pathOrUrl.indexOf('https://') === 0) {
      try {
        var u = new URL(pathOrUrl, window.location.href);
        u.searchParams.set('_ea', String(Date.now()));
        return u.href;
      } catch (e) {
        return pathOrUrl + (pathOrUrl.indexOf('?') >= 0 ? '&' : '?') + '_ea=' + Date.now();
      }
    }
    try {
      var rel = new URL(pathOrUrl, window.location.href);
      rel.searchParams.set('_ea', String(Date.now()));
      return rel.href;
    } catch (e) {
      return pathOrUrl;
    }
  }

  function applyUrlsToPage(urls) {
    var u = mergeWithDefaults(urls);
    var img = document.getElementById('expAccelImg');
    if (!img) return;
    img.setAttribute('data-url-step1', u.step1);
    img.setAttribute('data-url-step2', u.step2);
    if (window.__expAccelApplyStepUrls) {
      window.__expAccelApplyStepUrls(u.step1, u.step2);
    } else {
      img.src = bust(u.step1 || u.step2);
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
    var stored = getUrlsForSandbox(sb);
    var m = mergeWithDefaults(stored);
    var s1 = document.getElementById('expAccelUrlStep1');
    var s2 = document.getElementById('expAccelUrlStep2');
    if (s1) s1.value = m.step1 || '';
    if (s2) s2.value = m.step2 || '';
  }

  function collectInputsRaw() {
    function val(id) {
      var el = document.getElementById(id);
      return el && el.value != null ? String(el.value).trim() : '';
    }
    return {
      step1: val('expAccelUrlStep1'),
      step2: val('expAccelUrlStep2'),
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

  function resolveStoredUrls(c) {
    var out = {};
    var k;
    for (k in DEFAULTS) {
      var v = c[k] || '';
      if (!v) {
        out[k] = DEFAULTS[k];
      } else if (isRelativeAsset(v)) {
        try {
          out[k] = new URL(v, window.location.href).href;
        } catch (e) {
          out[k] = v;
        }
      } else if (validateUrl(v)) {
        out[k] = v;
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
        var k;
        for (k in c) {
          if (c[k] && !validateUrl(c[k]) && !isRelativeAsset(c[k])) {
            setStatus('Use a valid https URL, a relative path like assets/…, or leave empty for the default.', 'err');
            return;
          }
        }
        var out = resolveStoredUrls(c);
        var sb = currentSandboxName();
        saveUrlsForSandbox(sb, out);
        applyUrlsToPage(out);
        setStatus('Updated demo images for sandbox “' + (sb || 'default') + '”.', 'ok');
      });
    }

    function refreshFromStorage() {
      fillInputsFromStored();
      var stored = getUrlsForSandbox(currentSandboxName());
      applyUrlsToPage(stored);
    }

    window.addEventListener('aep-global-sandbox-change', function () {
      var sel = document.getElementById('expAccelSandboxSelect');
      if (sel && typeof AepGlobalSandbox !== 'undefined') {
        var n = AepGlobalSandbox.getSandboxName();
        if (n !== undefined && Array.from(sel.options).some(function (o) {
          return o.value === n;
        })) {
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
