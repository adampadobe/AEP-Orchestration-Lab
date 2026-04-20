/**
 * Customise dock: display name + team label for Experimentation Accelerator demo (native UI).
 * Storage: localStorage aepExpAccelUiPrefs JSON { [sandboxKey]: { displayName, teamName } }.
 */
(function () {
  var LS = 'aepExpAccelUiPrefs';

  var DEFAULTS = {
    displayName: 'Tina',
    teamName: 'Adobe.com',
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

  function getForSandbox(sb) {
    var all = readAll();
    return all[sandboxKey(sb)] || null;
  }

  function saveForSandbox(sb, data) {
    var all = readAll();
    all[sandboxKey(sb)] = data;
    writeAll(all);
  }

  function mergeDefaults(stored) {
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      o[k] =
        stored && typeof stored[k] === 'string' && stored[k].trim()
          ? stored[k].trim()
          : DEFAULTS[k];
    });
    return o;
  }

  function applyToDom(prefs) {
    var p = mergeDefaults(prefs);
    var nameEl = document.getElementById('expAccelDisplayName');
    var teamEl = document.getElementById('expAccelTeamDisplay');
    if (nameEl) nameEl.textContent = p.displayName;
    if (teamEl) teamEl.textContent = p.teamName;
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

  function fillInputs() {
    var m = mergeDefaults(getForSandbox(currentSandboxName()));
    var n = document.getElementById('expAccelDisplayNameInput');
    var t = document.getElementById('expAccelTeamInput');
    if (n) n.value = m.displayName;
    if (t) t.value = m.teamName;
  }

  function init() {
    initDock();
    initSandboxSelect();

    var btn = document.getElementById('expAccelCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        var d = (document.getElementById('expAccelDisplayNameInput') || {}).value;
        var team = (document.getElementById('expAccelTeamInput') || {}).value;
        var out = {
          displayName: d != null && String(d).trim() ? String(d).trim() : DEFAULTS.displayName,
          teamName: team != null && String(team).trim() ? String(team).trim() : DEFAULTS.teamName,
        };
        saveForSandbox(currentSandboxName(), out);
        applyToDom(out);
        setStatus('Updated labels for sandbox “' + (currentSandboxName() || 'default') + '”.', 'ok');
      });
    }

    function refreshFromStorage() {
      fillInputs();
      applyToDom(getForSandbox(currentSandboxName()));
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
