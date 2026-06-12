/**
 * Unified lab env bar loader — single entry point for site-clone demo pages.
 * Loads CSS + script chain from shared/env-bar-versions.json, mounts strip via
 * DemoEnvStrip / initLabDemoEnvBar, and exposes window.envBar API.
 *
 * @module env-bar
 * @see docs/env-bar-shared-module.md
 * @see docs/demo-env-strip-standard.md
 */
(function attachLabEnvBar(global) {
  'use strict';

  /** @type {string} */
  var MODULE_VERSION = '1.0.0';

  /** Fallback when env-bar-versions.json cannot be fetched. Keep in sync with JSON file. */
  var DEFAULT_VERSIONS = {
    manifestVersion: '20260612-env-bar',
    moduleVersion: '1.0.0',
    assets: {
      bundleCss: '20260623-env-inline',
      spectrumCss: '20260623-spectrum',
      demoEnvStripSpectrum: '20260623-spectrum',
      demoEnvStrip: '20260623-spectrum',
      spectrumSync: '20260623-spectrum',
      compactJs: '20260612-env-compact-b',
      compactCss: '20260612-env-compact-b',
      bootstrap: '20260602-env-bar-bootstrap',
      tagsInjection: '20260605-tags-sandbox-restore',
      aepDemoEnvBar: '20260601-launch-unset-expand',
      siteCloneBcEnv: '20260612-strip-dom-defer',
    },
  };

  /**
   * @typedef {object} EnvBarFeatures
   * @property {boolean} [webPush=true]
   * @property {boolean} [bc=true]
   * @property {boolean} [decisioning=true]
   */

  /**
   * @typedef {object} EnvBarConfig
   * @property {string} prefix — Demo prefix (sky, ksia, premierInn, …)
   * @property {string} [defaultSandbox] — Initial sandbox technical name
   * @property {string[]} [availableSandboxes] — Optional sandbox allowlist
   * @property {string} [orgId] — Passthrough org id (future use)
   * @property {string} [edgeConfigId] — Passthrough edge config id
   * @property {boolean} [debug=false] — Verbose console logging
   * @property {'spectrum'|'classic'} [variant='spectrum'] — Strip layout variant
   * @property {EnvBarFeatures} [features] — Feature toggles for mount attributes
   * @property {string[]} [iframeIds] — Iframe ids for Tags injection (demo JS)
   * @property {string} [disclaimer] — HTML disclaimer on mount host
   * @property {string} [labCoreScript] — Optional demo lab-core script to load after env bar ready
   * @property {'shell'|'journey'|'minimal'|'compact-fnb'|'sandbox-only'} [mode='shell'] — shell = full site-clone; minimal = sandbox + profile; compact-fnb / sandbox-only = sandbox row only
   * @property {string} [basePath] — Asset root (default: directory containing this script)
   * @property {boolean} [autoInit=true] — Auto-init on DOMContentLoaded when envBarConfig is set
   * @property {string} [storagePrefix] — SiteCloneDemoEnv storage prefix override
   * @property {object} [siteCloneDemoEnv] — Merge into window.SiteCloneDemoEnv
   * @property {string} [defaultBcStyle] — BC style default for Tags remount
   * @property {object} [envBar] — Extra passthrough to initLabDemoEnvBar → AepDemoEnvStrip
   */

  /** @type {{ config: EnvBarConfig|null, versions: typeof DEFAULT_VERSIONS|null, initialized: boolean, initPromise: Promise<void>|null, changeListeners: Array<Function>, tagsInjection: object|null, basePath: string }} */
  var state = {
    config: null,
    versions: null,
    initialized: false,
    initPromise: null,
    changeListeners: [],
    tagsInjection: null,
    basePath: '',
  };

  function log() {
    if (!state.config || !state.config.debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[envBar]');
    console.log.apply(console, args);
  }

  function warn() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[envBar]');
    console.warn.apply(console, args);
  }

  /**
   * Resolve profile-viewer root from this script's src (works for nested demos).
   * @returns {string}
   */
  function detectBasePath() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('shared/env-bar.js') !== -1) {
        var idx = src.lastIndexOf('shared/env-bar.js');
        return src.slice(0, idx);
      }
    }
    return '';
  }

  function assetUrl(rel, cacheKey) {
    var base = state.basePath || detectBasePath();
    var q = cacheKey ? '?v=' + encodeURIComponent(cacheKey) : '';
    return base + rel + q;
  }

  function linkCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = function () {
        resolve();
      };
      link.onerror = function () {
        reject(new Error('Failed to load CSS ' + href));
      };
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Failed to load ' + src));
      };
      (document.body || document.head).appendChild(script);
    });
  }

  /**
   * Fetch version manifest; fall back to embedded defaults.
   * @returns {Promise<typeof DEFAULT_VERSIONS>}
   */
  function loadVersions() {
    if (state.versions) return Promise.resolve(state.versions);
    var url = assetUrl('shared/env-bar-versions.json', DEFAULT_VERSIONS.manifestVersion);
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        state.versions = json && json.assets ? json : DEFAULT_VERSIONS;
        if (!state.versions.moduleVersion) state.versions.moduleVersion = MODULE_VERSION;
        log('versions loaded', state.versions.manifestVersion);
        return state.versions;
      })
      .catch(function (err) {
        warn('using embedded version manifest', err && err.message ? err.message : err);
        state.versions = DEFAULT_VERSIONS;
        return state.versions;
      });
  }

  /**
   * Merge window.envBarConfig, data attributes on mount host, and init() argument.
   * @param {Partial<EnvBarConfig>} [override]
   * @returns {EnvBarConfig}
   */
  function resolveConfig(override) {
    var fromGlobal = global.envBarConfig && typeof global.envBarConfig === 'object' ? global.envBarConfig : {};
    var merged = Object.assign({}, fromGlobal, override || {});
    if (!merged.prefix) {
      var mount = document.querySelector('[data-demo-env-strip-mount]');
      if (mount) {
        merged.prefix = mount.getAttribute('data-demo-env-strip-prefix') || merged.prefix;
        if (!merged.disclaimer) merged.disclaimer = mount.getAttribute('data-demo-env-strip-disclaimer') || '';
        var variantAttr = mount.getAttribute('data-demo-env-strip-variant');
        if (variantAttr && !merged.variant) merged.variant = variantAttr;
      }
    }
    if (!merged.variant) merged.variant = 'spectrum';
    if (merged.mode === 'compact-fnb') merged.mode = 'sandbox-only';
    if (!merged.mode) merged.mode = 'shell';
    if (merged.mode === 'minimal' || merged.mode === 'sandbox-only') {
      merged.variant = merged.variant === 'spectrum' ? 'classic' : merged.variant || 'classic';
      merged.features = Object.assign({ webPush: false, bc: false, decisioning: false }, merged.features || {});
    }
    if (!merged.features || typeof merged.features !== 'object') {
      merged.features = { webPush: true, bc: true, decisioning: true };
    }
    if (merged.autoInit === undefined) merged.autoInit = true;
    if (merged.basePath) state.basePath = merged.basePath;
    else if (!state.basePath) state.basePath = detectBasePath();
    return merged;
  }

  /**
   * Apply feature flags to mount host data attributes before autoMount.
   * @param {EnvBarConfig} cfg
   */
  function applyFeatureFlags(cfg) {
    if (!cfg.prefix) return;
    var mount =
      document.querySelector('[data-demo-env-strip-prefix="' + cfg.prefix + '"]') ||
      document.querySelector('[data-demo-env-strip-mount]');
    if (!mount) return;
    if (cfg.disclaimer) mount.setAttribute('data-demo-env-strip-disclaimer', cfg.disclaimer);
    if (cfg.features && cfg.features.bc === false) mount.setAttribute('data-demo-env-strip-bc-bottom', '0');
    if (cfg.features && cfg.features.decisioning === false) mount.setAttribute('data-demo-env-strip-decisioning', '0');
    if (cfg.variant === 'spectrum') mount.setAttribute('data-demo-env-strip-variant', 'spectrum');
  }

  /**
   * Load env bar CSS (bundle + optional spectrum).
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function isFullShellMode(cfg) {
    var mode = cfg && cfg.mode ? cfg.mode : 'shell';
    return mode === 'shell' || mode === 'journey';
  }

  function loadStyles(versions, cfg) {
    var a = versions.assets;
    var jobs = [linkCss(assetUrl('shared/demo-env-bar.bundle.css', a.bundleCss))];
    if (isFullShellMode(cfg)) {
      jobs.push(linkCss(assetUrl('shared/env-bar-compact.css', a.compactCss)));
    }
    if (cfg.variant === 'spectrum' && isFullShellMode(cfg)) {
      jobs.push(linkCss(assetUrl('shared/demo-env-bar-spectrum.css', a.spectrumCss)));
    }
    return Promise.all(jobs);
  }

  /**
   * Load env bar script chain (delegates to existing modules — no fork).
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadScripts(versions, cfg) {
    var a = versions.assets;
    var chain = [];
    var fullShell = isFullShellMode(cfg);
    if (fullShell && cfg.variant === 'spectrum') {
      chain.push(assetUrl('shared/demo-env-strip-spectrum.js', a.demoEnvStripSpectrum));
    }
    chain.push(assetUrl('shared/demo-env-strip.js', a.demoEnvStrip));
    if (fullShell && cfg.variant === 'spectrum') {
      chain.push(assetUrl('shared/demo-env-bar-spectrum-sync.js', a.spectrumSync));
    }
    chain.push(assetUrl('shared/demo-env-bar-bootstrap.js', a.bootstrap));
    if (fullShell) {
      chain.push(assetUrl('demo-tags-injection.js', a.tagsInjection));
    }
    chain.push(assetUrl('aep-demo-env-bar.js', a.aepDemoEnvBar));
    if (fullShell) {
      chain.push(assetUrl('shared/env-bar-compact.js', a.compactJs));
    }

    return chain.reduce(function (p, src) {
      return p.then(function () {
        log('load script', src);
        return loadScript(src);
      });
    }, Promise.resolve());
  }

  /**
   * Wire SiteCloneDemoEnv from prefix when not already set by demo HTML.
   * @param {EnvBarConfig} cfg
   */
  function ensureSiteCloneDemoEnv(cfg) {
    if (!cfg.prefix) return;
    if (global.SiteCloneDemoEnv && global.SiteCloneDemoEnv.storagePrefix) return;
    if (global.DemoEnvStrip && typeof global.DemoEnvStrip.siteCloneDemoEnvObject === 'function') {
      var base = global.DemoEnvStrip.siteCloneDemoEnvObject(cfg.prefix, cfg.storagePrefix);
      if (base) {
        global.SiteCloneDemoEnv = Object.assign({}, base, global.SiteCloneDemoEnv || {}, cfg.siteCloneDemoEnv || {});
      }
    } else if (cfg.siteCloneDemoEnv) {
      global.SiteCloneDemoEnv = Object.assign({}, global.SiteCloneDemoEnv || {}, cfg.siteCloneDemoEnv);
    }
  }

  function initCompactDropdown(cfg) {
    if (!isFullShellMode(cfg)) return;
    if (global.EnvBarCompact && typeof global.EnvBarCompact.init === 'function') {
      global.EnvBarCompact.init(cfg);
    }
  }

  /**
   * Initialize spectrum status sync when variant is spectrum.
   * @param {EnvBarConfig} cfg
   */
  function initSpectrumSync(cfg) {
    if (cfg.variant !== 'spectrum') return;
    if (global.DemoEnvBarSpectrumSync && typeof global.DemoEnvBarSpectrumSync.init === 'function') {
      global.DemoEnvBarSpectrumSync.init({ prefix: cfg.prefix });
    }
  }

  /**
   * Call existing bootstrap — mount strip + env bar editor.
   * @param {EnvBarConfig} cfg
   * @returns {object}
   */
  function runBootstrap(cfg) {
    if (typeof global.initLabDemoEnvBar !== 'function') {
      warn('initLabDemoEnvBar not available');
      return { stripMounted: false, envBarInited: false };
    }
    var bootOpts = {
      prefix: cfg.prefix,
      storagePrefix: cfg.storagePrefix,
      defaultBcStyle: cfg.defaultBcStyle,
      siteCloneDemoEnv: cfg.siteCloneDemoEnv,
      envBar: cfg.envBar,
      refreshSiteCloneBcEnv: isFullShellMode(cfg),
    };
    log('initLabDemoEnvBar', bootOpts);
    return global.initLabDemoEnvBar(bootOpts);
  }

  /**
   * Apply default sandbox when configured.
   * @param {EnvBarConfig} cfg
   */
  function applyDefaultSandbox(cfg) {
    if (!cfg.defaultSandbox) return;
    var sandbox = String(cfg.defaultSandbox).trim();
    if (!sandbox) return;
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.setSelected === 'function') {
      var current =
        typeof global.AepGlobalSandbox.getSandboxName === 'function'
          ? global.AepGlobalSandbox.getSandboxName()
          : '';
      if (!current) global.AepGlobalSandbox.setSelected(sandbox);
    }
    var select = document.getElementById('sandboxSelect');
    if (select && !select.value) {
      select.value = sandbox;
      try {
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_e) {
        /* IE-compat not needed */
      }
    }
  }

  function notifyChange(detail) {
    state.changeListeners.forEach(function (fn) {
      try {
        fn(detail);
      } catch (e) {
        warn('onChange listener error', e);
      }
    });
    try {
      global.dispatchEvent(new CustomEvent('env-bar-change', { detail: detail }));
    } catch (_e) {}
  }

  /**
   * Load site-clone-bc-env.js after strip mount (BC style hosting + datastream pickers need DOM).
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadSiteCloneBcEnv(versions, cfg) {
    if (!isFullShellMode(cfg)) return Promise.resolve();
    if (cfg.features && cfg.features.bc === false) return Promise.resolve();
    var refresh = function () {
      if (global.SiteCloneBcEnv && typeof global.SiteCloneBcEnv.applyForCurrentSandbox === 'function') {
        global.SiteCloneBcEnv.applyForCurrentSandbox();
        log('SiteCloneBcEnv refreshed after strip mount');
      }
    };
    if (document.querySelector('script[src*="site-clone-bc-env.js"]')) {
      return Promise.resolve().then(refresh);
    }
    var a = versions.assets;
    var src = assetUrl('site-clone-bc-env.js', a.siteCloneBcEnv || '20260612-strip-dom-defer');
    return loadScript(src).then(refresh);
  }

  /**
   * Optionally load demo lab-core script after env bar stack is ready.
   * @param {EnvBarConfig} cfg
   */
  function loadLabCoreIfConfigured(cfg) {
    if (!cfg.labCoreScript) return Promise.resolve();
    var rel = String(cfg.labCoreScript);
    var src =
      rel.indexOf('?') !== -1
        ? (state.basePath || '') + rel
        : assetUrl(rel, state.versions ? state.versions.manifestVersion : DEFAULT_VERSIONS.manifestVersion);
    log('load labCoreScript', src);
    return loadScript(src);
  }

  /**
   * Initialize env bar: load manifest, CSS, scripts, mount strip, bootstrap env editor.
   * Demo-specific DemoTagsInjection.init remains in per-demo lab-core JS.
   *
   * @param {Partial<EnvBarConfig>} [userConfig]
   * @returns {Promise<{ stripMounted: boolean, envBarInited: boolean, config: EnvBarConfig }>}
   */
  function init(userConfig) {
    if (state.initPromise && !userConfig) return state.initPromise;

    state.initPromise = loadVersions()
      .then(function (versions) {
        state.config = resolveConfig(userConfig);
        if (!state.config.prefix) {
          throw new Error('envBar.init requires config.prefix (or data-demo-env-strip-prefix on mount host)');
        }
        applyFeatureFlags(state.config);
        ensureSiteCloneDemoEnv(state.config);
        return loadStyles(versions, state.config).then(function () {
          return loadScripts(versions, state.config);
        });
      })
      .then(function () {
        var result = runBootstrap(state.config);
        return loadSiteCloneBcEnv(state.versions, state.config).then(function () {
          return result;
        });
      })
      .then(function (result) {
        initSpectrumSync(state.config);
        initCompactDropdown(state.config);
        applyDefaultSandbox(state.config);
        state.initialized = true;
        notifyChange({ type: 'init', config: getConfig(), bootstrap: result });
        log('initialized', result);
        return loadLabCoreIfConfigured(state.config).then(function () {
          return Object.assign({ config: getConfig() }, result);
        });
      })
      .catch(function (err) {
        state.initPromise = null;
        warn('init failed', err);
        throw err;
      });

    return state.initPromise;
  }

  /**
   * Switch active AEP sandbox. Updates global sandbox + select; reapplies Tags state when available.
   *
   * @param {string} sandbox — Technical sandbox name
   * @returns {boolean}
   */
  function setEnvironment(sandbox) {
    var name = String(sandbox || '').trim();
    if (!name) return false;
    log('setEnvironment', name);

    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.setSelected === 'function') {
      global.AepGlobalSandbox.setSelected(name);
    }

    var select = document.getElementById('sandboxSelect');
    if (select) {
      var matched = false;
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === name || select.options[i].textContent === name) {
          select.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) select.value = name;
      try {
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_e) {}
    }

    if (state.tagsInjection && typeof state.tagsInjection.applySandboxConfigState === 'function') {
      state.tagsInjection.applySandboxConfigState();
    } else if (global.__envBarTagsInjection && typeof global.__envBarTagsInjection.applySandboxConfigState === 'function') {
      global.__envBarTagsInjection.applySandboxConfigState();
    }

    if (global.SiteCloneBcEnv && typeof global.SiteCloneBcEnv.applyForCurrentSandbox === 'function') {
      global.SiteCloneBcEnv.applyForCurrentSandbox();
    }

    notifyChange({ type: 'sandbox', sandbox: name, config: getConfig() });
    return true;
  }

  /**
   * Trigger Web SDK / Tags reinject via existing inject button flow (reload-based).
   * Does not duplicate injection logic — delegates to demo-tags-injection.js.
   *
   * @returns {boolean}
   */
  function reloadSDK() {
    var prefix = state.config && state.config.prefix ? state.config.prefix : '';
    var btnId = prefix ? prefix + 'InjectSdkBtn' : 'injectSdkBtn';
    var btn = document.getElementById(btnId);
    if (btn && !btn.disabled) {
      log('reloadSDK via click', btnId);
      btn.click();
      notifyChange({ type: 'sdk-reload', method: 'inject-button', config: getConfig() });
      return true;
    }
    warn('reloadSDK: inject button not found or disabled', btnId);
    return false;
  }

  /**
   * @returns {EnvBarConfig|null}
   */
  function getConfig() {
    return state.config ? Object.assign({}, state.config) : null;
  }

  /**
   * Register Tags injection instance from demo lab-core (for setEnvironment / reloadSDK).
   * @param {object} instance — Return value of DemoTagsInjection.init()
   */
  function registerTagsInjection(instance) {
    state.tagsInjection = instance || null;
    global.__envBarTagsInjection = instance || null;
  }

  /**
   * Subscribe to env bar changes (init, sandbox switch, sdk reload).
   * @param {function(object): void} callback
   * @returns {function(): void} unsubscribe
   */
  function onChange(callback) {
    if (typeof callback !== 'function') return function () {};
    state.changeListeners.push(callback);
    return function () {
      var idx = state.changeListeners.indexOf(callback);
      if (idx >= 0) state.changeListeners.splice(idx, 1);
    };
  }

  /**
   * Resolves when env bar init completes (strip mounted, Tags stack loaded, bootstrap done).
   * Kicks off init when demo lab-core runs before DOMContentLoaded autoInit (Tags boot race).
   * @returns {Promise<void>}
   */
  function ready() {
    if (state.initialized) return Promise.resolve();
    if (state.initPromise) return state.initPromise;
    return init();
  }

  function scheduleAutoInit() {
    var cfg = resolveConfig();
    if (cfg.autoInit === false) return;
    if (!cfg.prefix && !document.querySelector('[data-demo-env-strip-mount]')) return;

    function run() {
      if (state.initialized || state.initPromise) return;
      init().catch(function (e) {
        warn('autoInit failed', e);
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  global.envBar = {
    VERSION: MODULE_VERSION,
    MANIFEST_VERSION: DEFAULT_VERSIONS.manifestVersion,
    init: init,
    ready: ready,
    setEnvironment: setEnvironment,
    reloadSDK: reloadSDK,
    getConfig: getConfig,
    onChange: onChange,
    registerTagsInjection: registerTagsInjection,
  };

  scheduleAutoInit();
})(typeof window !== 'undefined' ? window : globalThis);
