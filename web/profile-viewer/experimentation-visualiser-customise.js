/**
 * Customise dock: sandbox-scoped image URLs for path treatments + email previews.
 * Storage: localStorage aepExpVizImageUrls JSON { [sandboxKey]: { treatmentA, … } }; synced via aep-lab-sandbox-sync.
 */
(function () {
  var LS = 'aepExpVizImageUrls';
  var DEFAULTS = {
    treatmentA: 'https://contenthosting.web.app/experiments/treatmenta.png',
    treatmentB: 'https://contenthosting.web.app/experiments/treatmentb.png',
    treatmentC: 'https://contenthosting.web.app/experiments/treatmentc.png',
    emailA: 'https://contenthosting.web.app/experiments/emailsubjecta.png',
    emailB: 'https://contenthosting.web.app/experiments/emailsubjectb.png',
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

  function setSvgImageHref(el, url) {
    if (!el || !url) return;
    try {
      el.setAttribute('href', url);
      el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    } catch (e) {}
  }

  function bust(url) {
    if (!url) return url;
    try {
      var u = new URL(url, window.location.href);
      u.searchParams.set('_expviz', String(Date.now()));
      return u.href;
    } catch (e) {
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_expviz=' + Date.now();
    }
  }

  function applyUrlsToPage(urls) {
    var u = mergeWithDefaults(urls);
    setSvgImageHref(document.getElementById('expVizImgTreatmentA'), bust(u.treatmentA));
    setSvgImageHref(document.getElementById('expVizImgTreatmentB'), bust(u.treatmentB));
    setSvgImageHref(document.getElementById('expVizImgTreatmentC'), bust(u.treatmentC));
    var imgA = document.getElementById('expVizImgEmailA');
    var imgB = document.getElementById('expVizImgEmailB');
    if (imgA) imgA.src = bust(u.emailA);
    if (imgB) imgB.src = bust(u.emailB);
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
    var ids = {
      treatmentA: 'expVizUrlTreatmentA',
      treatmentB: 'expVizUrlTreatmentB',
      treatmentC: 'expVizUrlTreatmentC',
      emailA: 'expVizUrlEmailA',
      emailB: 'expVizUrlEmailB',
    };
    Object.keys(ids).forEach(function (k) {
      var inp = document.getElementById(ids[k]);
      if (inp) inp.value = m[k] || '';
    });
  }

  function collectInputsRaw() {
    function val(id) {
      var el = document.getElementById(id);
      return el && el.value != null ? String(el.value).trim() : '';
    }
    return {
      treatmentA: val('expVizUrlTreatmentA'),
      treatmentB: val('expVizUrlTreatmentB'),
      treatmentC: val('expVizUrlTreatmentC'),
      emailA: val('expVizUrlEmailA'),
      emailB: val('expVizUrlEmailB'),
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

  function setStatus(msg, kind) {
    var el = document.getElementById('expVizCustomiseStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  }

  function initDock() {
    var mainEl = document.querySelector('main.dashboard-main.profile-viewer-main');
    var dockOuter = document.getElementById('expVizDockOuter');
    var drawer = document.getElementById('expVizCustomiseDrawer');
    var hit = document.getElementById('expVizDockHit');
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
    var sel = document.getElementById('expVizSandboxSelect');
    if (!sel || typeof AepGlobalSandbox === 'undefined') return;
    AepGlobalSandbox.loadSandboxesIntoSelect(sel).then(function () {
      AepGlobalSandbox.onSandboxSelectChange(sel);
      AepGlobalSandbox.attachStorageSync(sel);
    });
  }

  function init() {
    initDock();
    initSandboxSelect();

    var btn = document.getElementById('expVizCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        var c = collectInputsRaw();
        var k;
        for (k in c) {
          if (c[k] && !validateUrl(c[k])) {
            setStatus('Each non-empty URL must be valid http(s).', 'err');
            return;
          }
        }
        var out = {};
        for (k in DEFAULTS) {
          out[k] = c[k] || DEFAULTS[k];
        }
        var sb = currentSandboxName();
        saveUrlsForSandbox(sb, out);
        applyUrlsToPage(out);
        setStatus('Updated visuals for sandbox “' + (sb || 'default') + '”.', 'ok');
      });
    }

    function refreshFromStorage() {
      fillInputsFromStored();
      var stored = getUrlsForSandbox(currentSandboxName());
      applyUrlsToPage(stored);
    }

    window.addEventListener('aep-global-sandbox-change', function () {
      var sel = document.getElementById('expVizSandboxSelect');
      if (sel && typeof AepGlobalSandbox !== 'undefined') {
        var n = AepGlobalSandbox.getSandboxName();
        if (n !== undefined && Array.from(sel.options).some(function (o) { return o.value === n; })) {
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
