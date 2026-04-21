/**
 * Customise dock: display name + team label for Experimentation Accelerator demo (native UI).
 * Hero first name: optional per-sandbox override; otherwise `/api/profile/consent` for the
 * most recent email identifier (same sandbox), then fallback default.
 * Storage: localStorage aepExpAccelUiPrefs JSON { [sandboxKey]: { displayNameOverride?, teamName,
 *   expImg1..4, expTitle1..4, expSub1..4, heroDetailImg, ... } }.
 */
(function () {
  var LS = 'aepExpAccelUiPrefs';

  var DEFAULTS = {
    displayName: 'Tina',
    teamName: 'Adobe.com',
  };

  /** Default copy for Top experiments rows (ACE… / subtitle). */
  var EXP_ROW_DEFAULTS = [
    { title: 'ACE0998 | US | TwP Modals', sub: 'Illustrator product page' },
    { title: 'ACE0916 | US | Catalog | AICS on Premiere page', sub: 'Premiere Pro page' },
    { title: 'ACE0918 | US | Catalog | AICS on Catalog page', sub: 'Acrobat DC page' },
    { title: 'ACE0930 | US | HP | Logged-out | SMB | AICS', sub: 'Photoshop product page' },
  ];

  function rowField(p, i, kind) {
    var def = EXP_ROW_DEFAULTS[i - 1] || { title: '', sub: '' };
    var key = kind === 'title' ? 'expTitle' + i : 'expSub' + i;
    if (!p || p[key] === undefined || p[key] === null) return def[kind];
    var s = String(p[key]).trim();
    return s.length ? s : def[kind];
  }

  function applyExperimentCustomisation(p) {
    var i;
    var raw = p && typeof p === 'object' ? p : {};
    for (i = 1; i <= 4; i++) {
      var titleEl = document.getElementById('expAccelExpTitle' + i);
      var subEl = document.getElementById('expAccelExpSub' + i);
      var imgEl = document.getElementById('expAccelExpImg' + i);
      if (titleEl) titleEl.textContent = rowField(raw, i, 'title');
      if (subEl) subEl.textContent = rowField(raw, i, 'sub');
      if (imgEl) {
        var u = raw['expImg' + i] != null ? String(raw['expImg' + i]).trim() : '';
        var thumb = imgEl.closest('.ajo-exp-thumb');
        if (u) {
          imgEl.src = u;
          imgEl.removeAttribute('hidden');
          if (thumb) thumb.classList.add('ajo-exp-thumb--custom');
        } else {
          imgEl.removeAttribute('src');
          imgEl.setAttribute('hidden', '');
          if (thumb) thumb.classList.remove('ajo-exp-thumb--custom');
        }
      }
    }
  }

  function applyHeroDetailImage(p) {
    var raw = p && typeof p === 'object' ? p : {};
    var img = document.getElementById('expAccelHeroDetailImg');
    var wrap = img && img.closest('.ajo-exp-leader-thumb');
    if (!img || !wrap) return;
    var u = raw.heroDetailImg != null ? String(raw.heroDetailImg).trim() : '';
    if (u) {
      img.src = u;
      wrap.classList.add('ajo-exp-leader-thumb--has-custom-img');
    } else {
      img.removeAttribute('src');
      wrap.classList.remove('ajo-exp-leader-thumb--has-custom-img');
    }
  }

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
    applyExperimentCustomisation(raw);
    applyHeroDetailImage(raw);
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

    var p = m || {};
    var i;
    for (i = 1; i <= 4; i++) {
      var urlEl = document.getElementById('expAccelDockExpImgUrl' + i);
      var titleIn = document.getElementById('expAccelDockExpTitle' + i);
      var subIn = document.getElementById('expAccelDockExpSub' + i);
      var def = EXP_ROW_DEFAULTS[i - 1] || { title: '', sub: '' };
      if (urlEl) urlEl.value = p['expImg' + i] != null ? String(p['expImg' + i]) : '';
      if (titleIn) {
        if (p['expTitle' + i] !== undefined && p['expTitle' + i] !== null) {
          titleIn.value = String(p['expTitle' + i]);
        } else {
          titleIn.value = def.title;
        }
      }
      if (subIn) {
        if (p['expSub' + i] !== undefined && p['expSub' + i] !== null) {
          subIn.value = String(p['expSub' + i]);
        } else {
          subIn.value = def.sub;
        }
      }
    }
    var heroU = document.getElementById('expAccelDockHeroDetailImgUrl');
    if (heroU) heroU.value = p.heroDetailImg != null ? String(p.heroDetailImg) : '';
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

        var j;
        for (j = 1; j <= 4; j++) {
          var urlEl = document.getElementById('expAccelDockExpImgUrl' + j);
          var titleIn = document.getElementById('expAccelDockExpTitle' + j);
          var subIn = document.getElementById('expAccelDockExpSub' + j);
          var u = urlEl && urlEl.value != null ? String(urlEl.value).trim() : '';
          payload['expImg' + j] = u || '';
          payload['expTitle' + j] = titleIn && titleIn.value != null ? String(titleIn.value).trim() : '';
          payload['expSub' + j] = subIn && subIn.value != null ? String(subIn.value).trim() : '';
        }
        var heroIn = document.getElementById('expAccelDockHeroDetailImgUrl');
        var heroTrim = heroIn && heroIn.value != null ? String(heroIn.value).trim() : '';
        payload.heroDetailImg = heroTrim;

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
