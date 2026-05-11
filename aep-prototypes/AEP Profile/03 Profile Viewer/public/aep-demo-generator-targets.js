/**
 * Sandbox-aware Event Generator targets: GET /api/events/generator-targets?sandbox=…
 * with optional Firebase auth (AepLabSandboxSync) for user-scoped Firestore config.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'aepDemoGeneratorTargetBySandbox';

  function getSandboxName() {
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      var n = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      if (n) return n;
    }
    try {
      var el = global.document.getElementById('sandboxSelect');
      if (el && el.value != null && String(el.value).trim()) return String(el.value).trim();
    } catch (e1) {
      /* noop */
    }
    return '';
  }

  function readTargetMap() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (e2) {
      return {};
    }
  }

  function writeTargetMap(m) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(m || {}));
    } catch (e3) {
      /* noop */
    }
  }

  function optionValueExists(selectEl, value) {
    var opts = selectEl && selectEl.options;
    if (!opts) return false;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === value) return true;
    }
    return false;
  }

  function generatorTargetsUrl() {
    var s = getSandboxName();
    return '/api/events/generator-targets' + (s ? '?sandbox=' + encodeURIComponent(s) : '');
  }

  function labAuthFetch(url, options) {
    options = options || {};
    var extra = {};
    if (typeof global.AepLabSandboxSync !== 'undefined' && global.AepLabSandboxSync.getAuthHeaders) {
      return global.AepLabSandboxSync.getAuthHeaders().then(function (h) {
        var headers = Object.assign({}, h || {}, options.headers || {});
        return global.fetch(url, Object.assign({}, options, { headers: headers }));
      });
    }
    var headers = Object.assign({}, options.headers || {});
    return Promise.resolve(global.fetch(url, Object.assign({}, options, { headers: headers })));
  }

  function attachSelectPersistence(selectEl) {
    if (!selectEl || selectEl.getAttribute('data-aep-gen-targets-bound') === '1') return;
    selectEl.setAttribute('data-aep-gen-targets-bound', '1');
    selectEl.addEventListener('change', function () {
      var sb = getSandboxName();
      if (!sb) return;
      var m = readTargetMap();
      m[sb] = String(selectEl.value || '');
      writeTargetMap(m);
    });
  }

  /**
   * @param {HTMLSelectElement|null} selectEl
   * @param {{ preferredId?: string, onTargets?: function(Array) }} [opts]
   * @returns {Promise<Array>}
   */
  function loadGeneratorTargetsIntoSelect(selectEl, opts) {
    opts = opts || {};
    if (!selectEl) return Promise.resolve([]);
    var url = generatorTargetsUrl();
    return labAuthFetch(url)
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .then(function (data) {
        var targets = Array.isArray(data.targets) ? data.targets : [];
        selectEl.innerHTML = '';
        if (targets.length === 0) {
          var o0 = global.document.createElement('option');
          o0.value = '';
          o0.textContent = 'No targets (configure Event tool / Decision lab or presets)';
          selectEl.appendChild(o0);
          if (typeof opts.onTargets === 'function') opts.onTargets([]);
          return [];
        }
        targets.forEach(function (t) {
          var o = global.document.createElement('option');
          o.value = t.id;
          o.textContent = t.label || t.id;
          selectEl.appendChild(o);
        });
        attachSelectPersistence(selectEl);
        var sb = getSandboxName();
        var saved = sb ? readTargetMap()[sb] : '';
        if (saved && optionValueExists(selectEl, saved)) {
          selectEl.value = saved;
        } else if (opts.preferredId && optionValueExists(selectEl, opts.preferredId)) {
          selectEl.value = opts.preferredId;
        }
        if (typeof opts.onTargets === 'function') opts.onTargets(targets);
        return targets;
      })
      .catch(function () {
        selectEl.innerHTML = '';
        var opt = global.document.createElement('option');
        opt.value = '';
        opt.textContent = 'Failed to load targets';
        selectEl.appendChild(opt);
        if (typeof opts.onTargets === 'function') opts.onTargets([]);
        return [];
      });
  }

  function augmentGeneratorPostBody(body) {
    var b = body && typeof body === 'object' ? body : {};
    var s = getSandboxName();
    if (s && !b.sandbox) b.sandbox = s;
    return b;
  }

  function onSandboxChange(callback) {
    global.addEventListener('aep-global-sandbox-change', function () {
      if (typeof callback === 'function') global.requestAnimationFrame(callback);
    });
  }

  global.AepDemoGeneratorTargets = {
    getSandboxName: getSandboxName,
    generatorTargetsUrl: generatorTargetsUrl,
    labAuthFetch: labAuthFetch,
    loadGeneratorTargetsIntoSelect: loadGeneratorTargetsIntoSelect,
    augmentGeneratorPostBody: augmentGeneratorPostBody,
    onSandboxChange: onSandboxChange,
  };
})(typeof window !== 'undefined' ? window : this);
