/**
 * Global AEP sandbox: list sandboxes via POST /api/aep (Firebase aepProxy) or fallback GET /api/sandboxes (local Express).
 * Persists selected technical name in localStorage for all Profile Viewer pages.
 */
(function (global) {
  var LS_SANDBOX = 'aepGlobalSandboxName';
  var LS_RECENT = 'aepRecentSandboxes';
  var MAX_RECENT = 5;
  var PENDING_ATTR = 'data-aep-pending-sandbox';
  var LOAD_GEN_ATTR = 'data-aep-sandbox-load-gen';
  var lastDispatchedSandbox = null;
  var loadInFlightBySelect = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function trim(s) {
    return String(s || '').trim();
  }

  function getSelected() {
    try {
      var v = localStorage.getItem(LS_SANDBOX) || '';
      if (v) return v;
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.getSelectedSandbox === 'function') {
        return String(global.AepLabEnvBarPrefs.getSelectedSandbox() || '').trim();
      }
    } catch (e) {
      return '';
    }
    return '';
  }

  function getRecentSandboxes() {
    try {
      var raw = localStorage.getItem(LS_RECENT);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (v) { return typeof v === 'string' && v; }) : [];
    } catch (e) {
      return [];
    }
  }

  function pushRecent(name) {
    if (!name) return;
    var v = String(name).trim();
    if (!v) return;
    try {
      var list = getRecentSandboxes().filter(function (x) { return x !== v; });
      list.unshift(v);
      if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
      localStorage.setItem(LS_RECENT, JSON.stringify(list));
    } catch (e) {}
  }

  function setSelected(name, opts) {
    var v = name != null ? String(name).trim() : '';
    var source = opts && opts.source ? String(opts.source) : 'programmatic';
    var force = !!(opts && opts.force);
    if (!force && v === lastDispatchedSandbox) {
      try {
        if (v) localStorage.setItem(LS_SANDBOX, v);
        else localStorage.removeItem(LS_SANDBOX);
      } catch (_ls) {}
      return;
    }
    lastDispatchedSandbox = v;
    try {
      if (v) localStorage.setItem(LS_SANDBOX, v);
      else localStorage.removeItem(LS_SANDBOX);
    } catch (e) {}
    pushRecent(v);
    try {
      global.dispatchEvent(
        new CustomEvent('aep-global-sandbox-change', { detail: { name: v, source: source } }),
      );
    } catch (e) {}
  }

  function isLoadingPlaceholderSelect(sandboxSelect) {
    if (!sandboxSelect || !sandboxSelect.options || !sandboxSelect.options.length) return false;
    var first = sandboxSelect.options[0];
    var text = first ? String(first.textContent || '').toLowerCase() : '';
    return text.indexOf('loading sandbox') !== -1;
  }

  function capturePendingSandboxBeforeLoad(sandboxSelect) {
    if (!sandboxSelect) return;
    var pending = '';
    if (!isLoadingPlaceholderSelect(sandboxSelect)) {
      pending = trim(sandboxSelect.value);
    }
    if (!pending) pending = getSelected();
    if (pending) sandboxSelect.setAttribute(PENDING_ATTR, pending);
  }

  function applyStoredSandboxToSelect(sandboxSelect) {
    if (!sandboxSelect) return;
    var saved = getSelected();
    if (!saved) return;
    sandboxSelect.setAttribute(PENDING_ATTR, saved);
    if (isLoadingPlaceholderSelect(sandboxSelect)) {
      sandboxSelect.innerHTML = '';
      var opt = document.createElement('option');
      opt.value = saved;
      opt.textContent = saved + ' (saved)';
      sandboxSelect.appendChild(opt);
      sandboxSelect.value = saved;
      return;
    }
    var hasOption = Array.from(sandboxSelect.options).some(function (o) {
      return o.value === saved;
    });
    if (hasOption) sandboxSelect.value = saved;
  }

  function parseAepProxyBody(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return { _parseError: true };
    }
  }

  async function fetchSandboxesViaAepProxy() {
    var all = [];
    var offset = 0;
    var limit = 100;
    for (;;) {
      var r = await fetch('/api/aep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          path: '/data/foundation/sandbox-management/sandboxes',
          params: { limit: String(limit), offset: String(offset) },
        }),
      });
      var text = await r.text();
      var data = parseAepProxyBody(text);
      var st = data.status != null ? data.status : r.status;
      if (st >= 400) {
        var pr = data.platform_response || {};
        var msg =
          pr.message ||
          pr.title ||
          data.error ||
          (typeof pr === 'string' ? pr : null) ||
          r.statusText ||
          'Sandbox list failed';
        throw new Error(msg);
      }
      var pr = data.platform_response || {};
      var batch = pr.sandboxes || [];
      all.push.apply(all, batch);
      if (batch.length < limit) break;
      offset += limit;
    }
    return all
      .filter(function (s) {
        return s && s.state === 'active';
      })
      .map(function (s) {
        return { name: s.name, title: s.title || s.name, type: s.type || '' };
      });
  }

  async function fetchSandboxesViaExpress() {
    var res = await fetch('/api/sandboxes');
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data.sandboxes || [];
  }

  function makeOption(s) {
    var opt = document.createElement('option');
    opt.value = s.name;
    var label = s.title ? s.title + ' (' + s.name + ')' : s.name;
    opt.textContent = s.type ? label + ' - ' + s.type : label;
    return opt;
  }

  function resolveInjectGuardPrefix() {
    try {
      if (global.envBarConfig) {
        var p = String(global.envBarConfig.storagePrefix || global.envBarConfig.prefix || '').trim();
        if (p) return p;
      }
    } catch (e0) {}
    return '';
  }

  function readInjectSandboxSnapshotEarly() {
    try {
      if (global.AepLabTagsInjectGuard && typeof global.AepLabTagsInjectGuard.getSandboxSnapshot === 'function') {
        var viaGuard = String(global.AepLabTagsInjectGuard.getSandboxSnapshot() || '').trim();
        if (viaGuard) return viaGuard;
      }
      var prefix = resolveInjectGuardPrefix();
      if (!prefix) return '';
      if (global.sessionStorage.getItem(prefix + 'InjectInProgress') !== '1') return '';
      return String(global.sessionStorage.getItem(prefix + 'InjectSandboxSnapshot') || '').trim();
    } catch (e1) {
      return '';
    }
  }

  function isInjectReloadInProgress() {
    try {
      if (global.AepLabTagsInjectGuard && typeof global.AepLabTagsInjectGuard.isInProgress === 'function') {
        if (global.AepLabTagsInjectGuard.isInProgress()) return true;
      }
      var prefix = resolveInjectGuardPrefix();
      if (!prefix) return false;
      return global.sessionStorage.getItem(prefix + 'InjectInProgress') === '1';
    } catch (e2) {
      return false;
    }
  }

  function resolveSandboxSelection(sandboxSelect, byName) {
    var saved = getSelected();
    if (!saved && isInjectReloadInProgress()) {
      saved = readInjectSandboxSnapshotEarly();
    }
    var pending = sandboxSelect ? trim(sandboxSelect.getAttribute(PENDING_ATTR)) : '';
    if (!saved && pending) saved = pending;
    if (!saved && sandboxSelect && !isLoadingPlaceholderSelect(sandboxSelect)) {
      var cur = trim(sandboxSelect.value);
      if (cur && (!byName || byName[cur])) saved = cur;
    }
    if (saved) {
      if (byName && byName[saved]) return saved;
      return saved;
    }
    if (byName && byName['apalmer']) return 'apalmer';
    if (byName && byName['kirkham']) return 'kirkham';
    return '';
  }

  function fillSandboxSelect(sandboxSelect, sandboxes) {
    if (!sandboxSelect) return;
    var previous = trim(sandboxSelect.value);
    sandboxSelect.innerHTML = '';
    var defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Default (from server .env)';
    sandboxSelect.appendChild(defaultOpt);
    if (!sandboxes || sandboxes.length === 0) {
      var emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No sandboxes available';
      emptyOpt.disabled = true;
      sandboxSelect.appendChild(emptyOpt);
      return;
    }

    var byName = {};
    sandboxes.forEach(function (s) { byName[s.name] = s; });

    var recentNames = getRecentSandboxes().filter(function (n) { return byName[n]; });
    if (recentNames.length > 0) {
      var recentGroup = document.createElement('optgroup');
      recentGroup.label = 'Recent';
      recentNames.forEach(function (n) { recentGroup.appendChild(makeOption(byName[n])); });
      sandboxSelect.appendChild(recentGroup);
    }

    var sorted = sandboxes.slice().sort(function (a, b) {
      var la = (a.title || a.name).toLowerCase();
      var lb = (b.title || b.name).toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
    var allGroup = document.createElement('optgroup');
    allGroup.label = 'All sandboxes (A\u2013Z)';
    sorted.forEach(function (s) { allGroup.appendChild(makeOption(s)); });
    sandboxSelect.appendChild(allGroup);

    var pick = resolveSandboxSelection(sandboxSelect, byName);
    if (pick && byName[pick]) {
      sandboxSelect.value = pick;
    } else if (pick) {
      var orphanOpt = document.createElement('option');
      orphanOpt.value = pick;
      orphanOpt.textContent = pick + ' (saved)';
      sandboxSelect.appendChild(orphanOpt);
      sandboxSelect.value = pick;
    } else if (previous && byName[previous]) {
      sandboxSelect.value = previous;
    }
    if (isInjectReloadInProgress()) {
      var snap = readInjectSandboxSnapshotEarly();
      if (snap) sandboxSelect.value = snap;
    }
    if (pick || sandboxSelect.value) {
      sandboxSelect.setAttribute(PENDING_ATTR, trim(sandboxSelect.value));
    } else {
      sandboxSelect.removeAttribute(PENDING_ATTR);
    }
    // UI-only default — never persist apalmer/kirkham unless the user picks from the dropdown.
    // getSandboxName() reads #sandboxSelect before localStorage, so API calls still honor the visible default.
  }

  async function loadSandboxesIntoSelect(sandboxSelect) {
    if (!sandboxSelect) return;
    if (loadInFlightBySelect && loadInFlightBySelect.has(sandboxSelect)) {
      return loadInFlightBySelect.get(sandboxSelect);
    }
    var gen = parseInt(sandboxSelect.getAttribute(LOAD_GEN_ATTR) || '0', 10) + 1;
    sandboxSelect.setAttribute(LOAD_GEN_ATTR, String(gen));
    capturePendingSandboxBeforeLoad(sandboxSelect);
    var showLoading = isLoadingPlaceholderSelect(sandboxSelect) || sandboxSelect.options.length <= 1;
    if (showLoading) {
      sandboxSelect.innerHTML = '<option value="">Loading sandboxes…</option>';
    }
    var promise = (async function () {
      var sandboxes;
      try {
        sandboxes = await fetchSandboxesViaAepProxy();
      } catch (e1) {
        try {
          sandboxes = await fetchSandboxesViaExpress();
        } catch (e2) {
          if (parseInt(sandboxSelect.getAttribute(LOAD_GEN_ATTR) || '0', 10) === gen) {
            sandboxSelect.innerHTML = '<option value="">Failed to load sandboxes</option>';
          }
          console.warn('Sandbox list:', e1 && e1.message, e2 && e2.message);
          return;
        }
      }
      if (parseInt(sandboxSelect.getAttribute(LOAD_GEN_ATTR) || '0', 10) !== gen) return;
      fillSandboxSelect(sandboxSelect, sandboxes);
    })();
    if (loadInFlightBySelect) {
      loadInFlightBySelect.set(sandboxSelect, promise);
      promise.finally(function () {
        if (loadInFlightBySelect.get(sandboxSelect) === promise) {
          loadInFlightBySelect.delete(sandboxSelect);
        }
      });
    }
    return promise;
  }

  function onSandboxSelectChange(sandboxSelect) {
    if (!sandboxSelect || sandboxSelect.dataset.aepGlobalListener === '1') return;
    sandboxSelect.dataset.aepGlobalListener = '1';
    sandboxSelect.addEventListener('change', function () {
      var v = trim(sandboxSelect.value);
      if (v) sandboxSelect.setAttribute(PENDING_ATTR, v);
      else sandboxSelect.removeAttribute(PENDING_ATTR);
      setSelected(sandboxSelect.value, { source: 'user' });
    });
  }

  function attachStorageSync(sandboxSelect) {
    if (!sandboxSelect || sandboxSelect.dataset.aepStorageSync === '1') return;
    sandboxSelect.dataset.aepStorageSync = '1';
    function apply(val) {
      var v = val != null ? String(val) : '';
      if (v === '' || Array.from(sandboxSelect.options).some(function (o) {
        return o.value === v;
      })) {
        sandboxSelect.value = v;
      }
    }
    global.addEventListener('storage', function (e) {
      if (e.key !== LS_SANDBOX) return;
      apply(e.newValue);
    });
    global.addEventListener('aep-global-sandbox-change', function (e) {
      apply(e.detail && e.detail.name);
    });
  }

  /**
   * Technical sandbox name: ?sandbox= in URL wins, then #sandboxSelect, then localStorage.
   */
  function getSandboxName() {
    try {
      var href = global.location && global.location.href;
      if (href) {
        var u = new URL(href);
        var qs = u.searchParams.get('sandbox');
        if (qs != null && String(qs).trim() !== '') return String(qs).trim();
      }
    } catch (e) {}
    try {
      if (global.AepAccessScope && global.AepAccessScope.getAccessMode && global.AepAccessScope.getAccessMode() === 'workspace') {
        return '';
      }
    } catch (e0) {}
    try {
      var el = typeof document !== 'undefined' ? document.getElementById('sandboxSelect') : null;
      var v = el && el.value != null ? String(el.value).trim() : '';
      if (v) return v;
    } catch (e2) {}
    return getSelected().trim();
  }

  /** Query fragment for API calls, e.g. &sandbox=apalmer */
  function getSandboxParam() {
    var n = getSandboxName();
    return n ? '&sandbox=' + encodeURIComponent(n) : '';
  }

  function getScopeQuery() {
    try {
      if (global.AepAccessScope && typeof global.AepAccessScope.buildScopeQuery === 'function') {
        var q = String(global.AepAccessScope.buildScopeQuery() || '');
        if (q) return q;
      }
    } catch (e) {}
    var n = getSandboxName();
    return n ? 'sandbox=' + encodeURIComponent(n) : '';
  }

  global.AepGlobalSandbox = {
    LS_SANDBOX: LS_SANDBOX,
    getSelected: getSelected,
    setSelected: setSelected,
    getSandboxName: getSandboxName,
    getSandboxParam: getSandboxParam,
    getScopeQuery: getScopeQuery,
    loadSandboxesIntoSelect: loadSandboxesIntoSelect,
    fillSandboxSelect: fillSandboxSelect,
    applyStoredSandboxToSelect: applyStoredSandboxToSelect,
    onSandboxSelectChange: onSandboxSelectChange,
    attachStorageSync: attachStorageSync,
  };
})(typeof window !== 'undefined' ? window : this);
