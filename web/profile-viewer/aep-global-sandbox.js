/**
 * Global AEP sandbox: list sandboxes via POST /api/aep (Firebase aepProxy) or fallback GET /api/sandboxes (local Express).
 * Persists selected technical name in localStorage for all Profile Viewer pages.
 */
(function (global) {
  var LS_SANDBOX = 'aepGlobalSandboxName';
  var LS_RECENT = 'aepRecentSandboxes';
  var MAX_RECENT = 5;

  function getSelected() {
    try {
      return localStorage.getItem(LS_SANDBOX) || '';
    } catch (e) {
      return '';
    }
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

  function setSelected(name) {
    var v = name != null ? String(name) : '';
    try {
      if (v) localStorage.setItem(LS_SANDBOX, v);
      else localStorage.removeItem(LS_SANDBOX);
    } catch (e) {}
    pushRecent(v);
    try {
      global.dispatchEvent(new CustomEvent('aep-global-sandbox-change', { detail: { name: v } }));
    } catch (e) {}
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
          path: '/data/foundation/sandbox-management/',
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

  function fillSandboxSelect(sandboxSelect, sandboxes) {
    if (!sandboxSelect) return;
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

    var saved = getSelected().trim();
    if (saved && byName[saved]) {
      sandboxSelect.value = saved;
    } else if (byName['apalmer']) {
      sandboxSelect.value = 'apalmer';
    } else if (byName['kirkham']) {
      sandboxSelect.value = 'kirkham';
    }
  }

  async function loadSandboxesIntoSelect(sandboxSelect) {
    if (!sandboxSelect) return;
    sandboxSelect.innerHTML = '<option value="">Loading sandboxes…</option>';
    var sandboxes;
    try {
      sandboxes = await fetchSandboxesViaAepProxy();
    } catch (e1) {
      try {
        sandboxes = await fetchSandboxesViaExpress();
      } catch (e2) {
        sandboxSelect.innerHTML = '<option value="">Failed to load sandboxes</option>';
        console.warn('Sandbox list:', e1 && e1.message, e2 && e2.message);
        return;
      }
    }
    fillSandboxSelect(sandboxSelect, sandboxes);
  }

  function onSandboxSelectChange(sandboxSelect) {
    if (!sandboxSelect || sandboxSelect.dataset.aepGlobalListener === '1') return;
    sandboxSelect.dataset.aepGlobalListener = '1';
    sandboxSelect.addEventListener('change', function () {
      setSelected(sandboxSelect.value);
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

  global.AepGlobalSandbox = {
    LS_SANDBOX: LS_SANDBOX,
    getSelected: getSelected,
    setSelected: setSelected,
    getSandboxName: getSandboxName,
    getSandboxParam: getSandboxParam,
    loadSandboxesIntoSelect: loadSandboxesIntoSelect,
    fillSandboxSelect: fillSandboxSelect,
    onSandboxSelectChange: onSandboxSelectChange,
    attachStorageSync: attachStorageSync,
  };
})(typeof window !== 'undefined' ? window : this);
