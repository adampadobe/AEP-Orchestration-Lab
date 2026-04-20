/**
 * Customise dock: display name + team label for Experimentation Accelerator demo (native UI).
 * Hero first name: optional per-sandbox override; otherwise `/api/profile/consent` for the
 * most recent email identifier (same sandbox), then fallback default.
 * Storage: localStorage aepExpAccelUiPrefs JSON { [sandboxKey]: { displayNameOverride?, teamName, displayName? } }.
 */
(function () {
  var LS = 'aepExpAccelUiPrefs';

  var DEFAULTS = {
    displayName: 'Tina',
    teamName: 'Adobe.com',
  };

  var lastResolvedFirstName = '';
  var fetchGen = 0;

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

  /**
   * Explicit override from Customise, or legacy { displayName } from earlier builds.
   */
  function getNameOverride(sb) {
    var p = getForSandbox(sb);
    if (!p) return null;
    if (Object.prototype.hasOwnProperty.call(p, 'displayNameOverride')) {
      var vo = p.displayNameOverride;
      if (vo === null || vo === '') return null;
      if (typeof vo === 'string' && vo.trim()) return vo.trim();
      return null;
    }
    if (typeof p.displayName === 'string' && p.displayName.trim()) return p.displayName.trim();
    return null;
  }

  function sandboxQsForApi() {
    if (typeof AepGlobalSandbox !== 'undefined' && typeof AepGlobalSandbox.getSandboxParam === 'function') {
      return AepGlobalSandbox.getSandboxParam();
    }
    return '';
  }

  function getRecentEmailIdentifier() {
    try {
      var raw = localStorage.getItem('aep-profile-viewer-recent-identifiers-v1');
      if (!raw) return '';
      var o = JSON.parse(raw);
      var emails = o && o.email;
      if (Array.isArray(emails) && emails.length && emails[0]) return String(emails[0]).trim();
    } catch (e) {}
    return '';
  }

  function fetchProfileFirstName() {
    var email = getRecentEmailIdentifier();
    if (!email) return Promise.resolve('');
    var p = new URLSearchParams();
    p.set('identifier', email);
    p.set('namespace', 'email');
    return fetch('/api/profile/consent?' + p.toString() + sandboxQsForApi())
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || data.found === false) return '';
        var fn = data.firstName;
        return fn != null && String(fn).trim() ? String(fn).trim() : '';
      })
      .catch(function () {
        return '';
      });
  }

  function applyHeroNameEl(name) {
    var nameEl = document.getElementById('expAccelDisplayName');
    if (nameEl) nameEl.textContent = name;
  }

  function fillNameInputOnly() {
    var n = document.getElementById('expAccelDisplayNameInput');
    if (!n || document.activeElement === n) return;
    var sb = currentSandboxName();
    var o = getNameOverride(sb);
    n.value = o != null ? o : lastResolvedFirstName || '';
  }

  function resolveAndApplyHeroName() {
    var sb = currentSandboxName();
    var gen = ++fetchGen;
    var override = getNameOverride(sb);
    if (override) {
      lastResolvedFirstName = override;
      applyHeroNameEl(override);
      fillNameInputOnly();
      return;
    }
    fetchProfileFirstName().then(function (fn) {
      if (gen !== fetchGen) return;
      var show = fn || DEFAULTS.displayName;
      lastResolvedFirstName = show;
      applyHeroNameEl(show);
      fillNameInputOnly();
    });
  }

  function mergeTeam(stored) {
    return stored && typeof stored.teamName === 'string' && stored.teamName.trim()
      ? stored.teamName.trim()
      : DEFAULTS.teamName;
  }

  function applyToDom(prefs) {
    var raw = prefs && typeof prefs === 'object' ? prefs : {};
    var teamEl = document.getElementById('expAccelTeamDisplay');
    if (teamEl) teamEl.textContent = mergeTeam(raw);
    resolveAndApplyHeroName();
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
    var m = getForSandbox(currentSandboxName());
    var team = mergeTeam(m || {});
    var t = document.getElementById('expAccelTeamInput');
    if (t) t.value = team;
    fillNameInputOnly();
  }

  function refreshFromStorage() {
    fillInputs();
    applyToDom(getForSandbox(currentSandboxName()) || {});
  }

  function init() {
    initDock();
    initSandboxSelect();

    var btn = document.getElementById('expAccelCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        var sb = currentSandboxName();
        var d = (document.getElementById('expAccelDisplayNameInput') || {}).value;
        var team = (document.getElementById('expAccelTeamInput') || {}).value;
        var trimmed = d != null ? String(d).trim() : '';
        var teamTrim = team != null && String(team).trim() ? String(team).trim() : DEFAULTS.teamName;
        var prev = getForSandbox(sb) || {};
        var payload = Object.assign({}, prev, {
          displayNameOverride: trimmed ? trimmed : null,
          teamName: teamTrim,
        });
        if (trimmed) {
          payload.displayName = trimmed;
        } else {
          delete payload.displayName;
        }
        saveForSandbox(sb, payload);
        refreshFromStorage();
        setStatus('Updated labels for sandbox “' + (sb || 'default') + '”.', 'ok');
      });
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
