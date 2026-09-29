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
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
      return global.AepLabEnvBarPrefs.readMap(STORAGE_KEY);
    }
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
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.writeMap === 'function') {
      global.AepLabEnvBarPrefs.writeMap(STORAGE_KEY, m || {});
      return;
    }
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

  /**
   * Re-run callback when shared/env-bar.js finishes mounting the env strip (#generatorTarget).
   * @param {function(): void} callback
   */
  function onEnvBarInit(callback) {
    if (typeof callback !== 'function') return;
    function run() {
      callback();
    }
    if (global.envBar && typeof global.envBar.onChange === 'function') {
      global.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init') run();
      });
    }
    global.addEventListener('env-bar-change', function (ev) {
      if (ev && ev.detail && ev.detail.type === 'init') run();
    });
  }

  /** @param {string} [selectId='generatorTarget'] */
  function resolveGeneratorTargetSelect(selectId) {
    return global.document.getElementById(selectId || 'generatorTarget');
  }

  /**
   * Reload generator targets when env bar remounts (async strip mount race).
   * @param {function(): (void|Promise<void>)} reloadFn — must re-query #generatorTarget inside
   */
  function bindEnvBarGeneratorTargetReload(reloadFn) {
    onEnvBarInit(function () {
      void reloadFn();
    });
  }

  /**
   * Initial load + sandbox change + env-bar init remount (canonical demo wiring).
   * @param {function(): (void|Promise<void>)} loadFn
   */
  function bindGeneratorTargetLifecycle(loadFn) {
    if (typeof loadFn !== 'function') return;
    void loadFn();
    onSandboxChange(function () {
      void loadFn();
    });
    bindEnvBarGeneratorTargetReload(loadFn);
  }

  global.AepDemoGeneratorTargets = {
    getSandboxName: getSandboxName,
    generatorTargetsUrl: generatorTargetsUrl,
    labAuthFetch: labAuthFetch,
    loadGeneratorTargetsIntoSelect: loadGeneratorTargetsIntoSelect,
    augmentGeneratorPostBody: augmentGeneratorPostBody,
    onSandboxChange: onSandboxChange,
    onEnvBarInit: onEnvBarInit,
    resolveGeneratorTargetSelect: resolveGeneratorTargetSelect,
    bindEnvBarGeneratorTargetReload: bindEnvBarGeneratorTargetReload,
    bindGeneratorTargetLifecycle: bindGeneratorTargetLifecycle,
  };
})(typeof window !== 'undefined' ? window : this);
