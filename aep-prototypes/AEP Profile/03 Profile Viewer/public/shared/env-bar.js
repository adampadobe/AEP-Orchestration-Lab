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
  var MODULE_VERSION = '1.1.0';

  /** Fallback when env-bar-versions.json cannot be fetched. Keep in sync with JSON file. */
  var DEFAULT_VERSIONS = {
    manifestVersion: '20260903-settings-button-gated',
    moduleVersion: '1.1.0',
    assets: {
      bundleCss: '20260713e-armcom-env-bar',
      spectrumCss: '20260714-env-bar-config-fileconvert',
      demoEnvStripSpectrum: '20260721-linkedin-env-bar-fix',
      demoEnvStrip: '20260714-tags-property-typeahead',
      spectrumSync: '20260721-linkedin-env-bar-fix',
      aepLabDebug: '20260616-hide-lab-debug-ui',
      aepLabDebugCss: '20260616-hide-lab-debug-ui',
      aepLabConsole: '20260720-global-lab-console',
      compactCss: '20260714-env-bar-config-fileconvert',
      compactJs: '20260903-settings-button-gated',
      bootstrap: '20260720-global-lab-console',
      prefsLocal: '20260721-cross-tab-bc-prefs',
      prefsSync: '20260616-tags-incognito-load',
      tagsInjection: '20260721-organic-flow',
      aepDemoEnvBar: '20260720-global-lab-console',
      siteCloneBcEnv: '20260721-cross-tab-bc-restore',
      siteCloneBcChrome: '20260614-modal-dock-parity',
      siteCloneBc: '20260625-bc-incognito-sync-skip',
      bottomDockCss: '20260614-modal-dock-parity',
      bottomDockJs: '20260614-modal-dock-parity',
      bottomDockBoot: '20260614-modal-dock-parity',
      modalBarCss: '20260617-modal-bar-v8',
      modalBarJs: '20260617-modal-bar-v7',
      modalBarBoot: '20260617-modal-bar-v7',
      envBarJs: '20260721-cross-tab-bc-prefs',
      decisioningModuleCss: '20260618-reset-apply-spacing',
      decisioningPanelCss: '20260618-midrail-dynamic-stack',
      profileStreamingShared: '20260615',
      contentDecisionSurfaceStylesCore: '20260616',
      contentDecisionLabConfig: '20260615',
      contentDecisionEdgeMounts: '20260615-edge-mounts-syntax',
      decisioningEdgeInject: '20260617-mount-reset',
      decisioningProfileRuntime: '20260617-mount-reset',
      decisioningProfileModule: '20260617-reset-icon-toolbar',
      decisioningSurfaceStylesPanel: '20260617-live-preview',
      decisioningProfilePanel: '20260617-panel-editing-guard',
      siteCloneDecisioningBoot: '20260617-alloy-ready',
      bcMidrailPanelCss: '20260618-midrail-dynamic-stack',
      bcMidrailPanel: '20260618-midrail-dynamic-stack',
      bcMidrailBoot: '20260617-sparkle-icon',
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
   * @property {object} [decisioning] — Wiring for SiteCloneDecisioningBoot (iframeId, viewName, mountLayoutPreset, …)
   * @property {string[]} [iframeIds] — Iframe ids for Tags injection (demo JS)
   * @property {string} [disclaimer] — HTML disclaimer on mount host
   * @property {string} [labCoreScript] — Optional demo lab-core script to load after env bar ready
   * @property {'shell'|'journey'|'minimal'|'compact-fnb'|'sandbox-only'} [mode='shell'] — shell = full site-clone; minimal = sandbox + profile; compact-fnb / sandbox-only = sandbox row only
   * @property {string} [basePath] — Asset root (default: directory containing this script)
   * @property {boolean} [autoInit=true] — Auto-init on DOMContentLoaded when envBarConfig is set
   * @property {string} [storagePrefix] — SiteCloneDemoEnv storage prefix override
   * @property {object} [siteCloneDemoEnv] — Merge into window.SiteCloneDemoEnv
   * @property {boolean} [settingsButtonOnly=false] — Keep configuration closed until the right-side settings button is used
   * @property {string} [defaultBcStyle] — BC style default for Tags remount
   * @property {object} [envBar] — Extra passthrough to initLabDemoEnvBar → AepDemoEnvStrip
   * @property {string} [demoId] — Firestore envBarConfigs doc id (defaults to prefix)
   * @property {boolean} [localOverride=false] — When true, page envBarConfig wins over remote defaults
   * @property {boolean} [firestoreListen=true] — Poll /api/env-bar-config for remote updates
   */

  var REMOTE_CONFIG_POLL_MS = 60000;
  var remoteConfigPollTimer = null;

  /** @type {{ config: EnvBarConfig|null, versions: typeof DEFAULT_VERSIONS|null, initialized: boolean, initPromise: Promise<void>|null, prefsReadyPromise: Promise<void>|null, changeListeners: Array<Function>, tagsInjection: object|null, basePath: string }} */
  var state = {
    config: null,
    versions: null,
    initialized: false,
    initPromise: null,
    prefsReadyPromise: null,
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

  function labInfo(message, detail) {
    if (global.AepLabConsole) global.AepLabConsole.info('env-bar', message, detail);
  }

  function labWarn(message, detail) {
    if (global.AepLabConsole) global.AepLabConsole.warn('env-bar', message, detail);
  }

  function labError(message, detail) {
    if (global.AepLabConsole) global.AepLabConsole.error('env-bar', message, detail);
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

  function loadPrefsScripts(versions) {
    var a = versions.assets;
    var chain = [
      assetUrl('shared/env-bar-prefs-local.js', a.prefsLocal || '20260614-env-bar-prefs'),
      assetUrl('shared/env-bar-prefs-sync.js', a.prefsSync || '20260614-env-bar-prefs'),
    ];
    return chain.reduce(function (p, src) {
      return p.then(function () {
        log('load prefs script', src);
        return loadScript(src);
      });
    }, Promise.resolve());
  }

  var PREFS_READY_CAP_MS = 1500;

  function capPromise(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        global.setTimeout(function () {
          resolve(null);
        }, ms);
      }),
    ]);
  }

  function ensurePrefsReady() {
    if (state.prefsReadyPromise) return state.prefsReadyPromise;
    state.prefsReadyPromise = loadVersions().then(function (versions) {
      return loadPrefsScripts(versions).then(function () {
        if (global.AepLabEnvBarPrefsSync && global.AepLabEnvBarPrefsSync.whenReady) {
          return capPromise(global.AepLabEnvBarPrefsSync.whenReady, PREFS_READY_CAP_MS);
        }
        return null;
      });
    });
    return state.prefsReadyPromise;
  }

  /**
   * Resolve demo id for Firestore envBarConfigs/{demoId}.
   * @param {Partial<EnvBarConfig>} [cfg]
   * @returns {string}
   */
  function resolveDemoId(cfg) {
    var fromCfg = cfg && (cfg.demoId || cfg.prefix);
    if (fromCfg) return String(fromCfg).trim();
    var mount = document.querySelector('[data-demo-env-strip-mount]');
    if (mount) {
      var prefixAttr = mount.getAttribute('data-demo-env-strip-prefix');
      if (prefixAttr) return String(prefixAttr).trim();
    }
    return '';
  }

  /**
   * Merge remote Firestore defaults with page envBarConfig.
   * Remote wins by default; page wins when localOverride is true (local dev).
   * @param {object} pageConfig
   * @param {object} remoteConfig
   * @returns {EnvBarConfig}
   */
  function mergeFeatures(pageFeatures, remoteFeatures) {
    var base = { webPush: true, bc: true, decisioning: true };
    var merged = Object.assign({}, base, remoteFeatures || {});
    if (pageFeatures && typeof pageFeatures === 'object') {
      Object.keys(pageFeatures).forEach(function (key) {
        if (pageFeatures[key] !== undefined) merged[key] = pageFeatures[key];
      });
    }
    return merged;
  }

  function mergeConfigLayers(pageConfig, remoteConfig) {
    pageConfig = pageConfig && typeof pageConfig === 'object' ? pageConfig : {};
    remoteConfig = remoteConfig && typeof remoteConfig === 'object' ? remoteConfig : {};
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.stripRemoteUserFields === 'function') {
      remoteConfig = global.AepLabEnvBarPrefs.stripRemoteUserFields(remoteConfig);
    } else if (pageConfig.defaultSandbox && hasUserSandboxSelection()) {
      remoteConfig = Object.assign({}, remoteConfig);
      delete remoteConfig.defaultSandbox;
    }
    if (pageConfig.localOverride) {
      var localMerged = Object.assign({}, remoteConfig, pageConfig);
      localMerged.features = mergeFeatures(pageConfig.features, remoteConfig.features);
      if (pageConfig.decisioning || remoteConfig.decisioning) {
        localMerged.decisioning = Object.assign({}, remoteConfig.decisioning || {}, pageConfig.decisioning || {});
      }
      return localMerged;
    }
    var merged = Object.assign({}, pageConfig, remoteConfig);
    merged.features = mergeFeatures(pageConfig.features, remoteConfig.features);
    if (pageConfig.decisioning || remoteConfig.decisioning) {
      merged.decisioning = Object.assign({}, remoteConfig.decisioning || {}, pageConfig.decisioning || {});
    }
    return merged;
  }

  function hasUserSandboxSelection() {
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.hasUserSandboxPref === 'function') {
      return global.AepLabEnvBarPrefs.hasUserSandboxPref();
    }
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSelected === 'function') {
      return !!String(global.AepGlobalSandbox.getSelected() || '').trim();
    }
    try {
      return !!String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      return false;
    }
  }

  /**
   * @param {string} demoId
   * @returns {Promise<object|null>}
   */
  function fetchRemoteConfig(demoId) {
    if (!demoId) return Promise.resolve(null);
    var url = '/api/env-bar-config?demoId=' + encodeURIComponent(demoId);
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (body && body.ok && body.config && typeof body.config === 'object') return body.config;
        return null;
      })
      .catch(function (err) {
        log('remote config unavailable', demoId, err && err.message ? err.message : err);
        return null;
      });
  }

  /**
   * Fetch envBarConfigs/{demoId} via API proxy and merge into window.envBarConfig.
   * @returns {Promise<EnvBarConfig>}
   */
  function loadAndMergeRemoteConfig() {
    var page =
      global.envBarConfig && typeof global.envBarConfig === 'object' ? Object.assign({}, global.envBarConfig) : {};
    var demoId = resolveDemoId(page);
    if (!demoId) return Promise.resolve(page);
    return fetchRemoteConfig(demoId).then(function (remote) {
      if (!remote) return page;
      var merged = mergeConfigLayers(page, remote);
      global.envBarConfig = merged;
      log('remote config merged', demoId, merged.localOverride ? 'localOverride' : 'remote-defaults');
      return merged;
    });
  }

  /**
   * Poll remote config when firestoreListen is enabled (API proxy — no client Firestore SDK).
   * @param {string} demoId
   * @param {EnvBarConfig} cfg
   */
  function startRemoteConfigListen(demoId, cfg) {
    if (!demoId || cfg.firestoreListen === false) return;
    if (remoteConfigPollTimer) return;
    remoteConfigPollTimer = setInterval(function () {
      fetchRemoteConfig(demoId).then(function (remote) {
        if (!remote) return;
        var page = global.envBarConfig && typeof global.envBarConfig === 'object' ? global.envBarConfig : {};
        var merged = mergeConfigLayers(page, remote);
        var prevJson = JSON.stringify(state.config || global.envBarConfig || {});
        var nextJson = JSON.stringify(merged);
        if (prevJson === nextJson) return;
        global.envBarConfig = merged;
        if (state.config) state.config = resolveConfig();
        notifyChange({ type: 'remote-config', config: getConfig(), remote: remote });
        log('remote config updated', demoId);
      });
    }, REMOTE_CONFIG_POLL_MS);
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
    if (!merged.features || typeof merged.features !== 'object') {
      merged.features = {};
    }
    if (merged.mode === 'minimal' || merged.mode === 'sandbox-only') {
      merged.variant = merged.variant === 'spectrum' ? 'classic' : merged.variant || 'classic';
      merged.features = Object.assign({ webPush: false, bc: false, decisioning: false }, merged.features);
    } else {
      merged.features = Object.assign({ webPush: true, bc: true, decisioning: true }, merged.features);
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
    var htmlDecisioningOn = mount.getAttribute('data-demo-env-strip-decisioning') === '1';
    var pageDecisioningOn = !!(cfg.features && cfg.features.decisioning === true);
    var decisioningOn = isDecisioningFeatureEnabled(cfg) || htmlDecisioningOn || pageDecisioningOn;
    if (decisioningOn) mount.setAttribute('data-demo-env-strip-decisioning', '1');
    else mount.setAttribute('data-demo-env-strip-decisioning', '0');
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

  function isProfileLookupMode(cfg) {
    var mode = cfg && cfg.mode ? cfg.mode : 'shell';
    return mode === 'shell' || mode === 'journey' || mode === 'minimal';
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
    if (isProfileLookupMode(cfg)) {
      jobs.push(linkCss(assetUrl('shared/aep-lab-debug.css', a.aepLabDebugCss || a.aepLabDebug)));
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
    chain.push(assetUrl('shared/aep-lab-console.js', a.aepLabConsole || '20260720-global-lab-console'));
    if (isProfileLookupMode(cfg)) {
      chain.push(assetUrl('shared/aep-lab-debug.js', a.aepLabDebug));
    }
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

  function isDecisioningFeatureEnabled(cfg) {
    return !(cfg.features && cfg.features.decisioning === false);
  }

  /**
   * Load decisioning module CSS when the env strip exposes the decisioning toggle.
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadDecisioningStyles(versions, cfg) {
    if (!isFullShellMode(cfg) || !isDecisioningFeatureEnabled(cfg)) return Promise.resolve();
    var a = versions.assets;
    return Promise.all([
      linkCss(assetUrl('decisioning-profile-module/decisioning-profile-module.css', a.decisioningModuleCss)),
      linkCss(assetUrl('decisioning-profile-module/decisioning-profile-panel.css', a.decisioningPanelCss)),
    ]);
  }

  function isBcFeatureEnabled(cfg) {
    return !(cfg.features && cfg.features.bc === false);
  }

  /**
   * Load BC mid-rail panel CSS when Brand Concierge is enabled on the env strip.
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadBcMidrailStyles(versions, cfg) {
    if (!isFullShellMode(cfg) || !isBcFeatureEnabled(cfg)) return Promise.resolve();
    var a = versions.assets;
    return linkCss(assetUrl('shared/brand-concierge-midrail-panel.css', a.bcMidrailPanelCss));
  }

  /**
   * Load decisioning runtime script chain (Sky parity). Skips files already on the page.
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadDecisioningScripts(versions, cfg) {
    if (!isFullShellMode(cfg) || !isDecisioningFeatureEnabled(cfg)) return Promise.resolve();
    var a = versions.assets;
    var chain = [
      assetUrl('profile-streaming-shared.js', a.profileStreamingShared),
      assetUrl('content-decision-surface-styles-core.js', a.contentDecisionSurfaceStylesCore),
      assetUrl('content-decision-lab-config.js', a.contentDecisionLabConfig),
      assetUrl('content-decision-edge-mounts.js', a.contentDecisionEdgeMounts),
      assetUrl('decisioning-profile-module/decisioning-edge-inject.js', a.decisioningEdgeInject),
      assetUrl('decisioning-profile-module/decisioning-profile-runtime.js', a.decisioningProfileRuntime),
      assetUrl('decisioning-profile-module/decisioning-profile-module.js', a.decisioningProfileModule),
      assetUrl('decisioning-profile-module/decisioning-surface-styles-panel.js', a.decisioningSurfaceStylesPanel),
      assetUrl('decisioning-profile-module/decisioning-profile-panel.js', a.decisioningProfilePanel),
      assetUrl('shared/site-clone-decisioning-boot.js', a.siteCloneDecisioningBoot),
    ];
    return chain.reduce(function (p, src) {
      return p.then(function () {
        log('load decisioning script', src);
        return loadScript(src);
      });
    }, Promise.resolve());
  }

  /**
   * Load BC mid-rail display-mode panel scripts.
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadBcMidrailScripts(versions, cfg) {
    if (!isFullShellMode(cfg) || !isBcFeatureEnabled(cfg)) return Promise.resolve();
    var a = versions.assets;
    var chain = [
      assetUrl('shared/brand-concierge-midrail-panel.js', a.bcMidrailPanel),
      assetUrl('shared/brand-concierge-midrail-boot.js', a.bcMidrailBoot),
    ];
    return chain.reduce(function (p, src) {
      return p.then(function () {
        if (
          src.indexOf('brand-concierge-midrail-panel.js') !== -1 &&
          document.querySelector('script[src*="brand-concierge-midrail-panel.js"]')
        ) {
          return;
        }
        if (
          src.indexOf('brand-concierge-midrail-boot.js') !== -1 &&
          document.querySelector('script[src*="brand-concierge-midrail-boot.js"]')
        ) {
          return;
        }
        log('load bc midrail script', src);
        return loadScript(src);
      });
    }, Promise.resolve());
  }

  function bootBcMidrailPanel(cfg) {
    if (!isBcFeatureEnabled(cfg)) return;
    if (global.BrandConciergeMidrailBoot && typeof global.BrandConciergeMidrailBoot.boot === 'function') {
      log('boot BrandConciergeMidrailBoot');
      global.BrandConciergeMidrailBoot.boot(cfg);
    }
  }

  /**
   * Init decisioning runtime + panel when decisioning feature is enabled (auto-detects iframe wiring).
   * @param {EnvBarConfig} cfg
   */
  function bootSiteCloneDecisioning(cfg, opts) {
    opts = opts || {};
    if (!isDecisioningFeatureEnabled(cfg)) return;
    if (global.SiteCloneDecisioningBoot && typeof global.SiteCloneDecisioningBoot.boot === 'function') {
      log('boot SiteCloneDecisioningBoot');
      global.SiteCloneDecisioningBoot.boot(cfg, opts);
    }
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
    var injectSnap = '';
    if (global.AepLabTagsInjectGuard && typeof global.AepLabTagsInjectGuard.getSandboxSnapshot === 'function') {
      injectSnap = String(global.AepLabTagsInjectGuard.getSandboxSnapshot() || '').trim();
    }
    if (!injectSnap) {
      try {
        var prefix = cfg && (cfg.storagePrefix || cfg.prefix) ? String(cfg.storagePrefix || cfg.prefix).trim() : '';
        if (!prefix && global.envBarConfig) {
          prefix = String(global.envBarConfig.storagePrefix || global.envBarConfig.prefix || '').trim();
        }
        if (prefix && global.sessionStorage.getItem(prefix + 'InjectInProgress') === '1') {
          injectSnap = String(global.sessionStorage.getItem(prefix + 'InjectSandboxSnapshot') || '').trim();
        }
      } catch (_inj) {}
    }
    if (injectSnap) {
      setEnvironment(injectSnap);
      return;
    }
    if (hasUserSandboxSelection()) {
      var saved =
        global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.getSelectedSandbox === 'function'
          ? global.AepLabEnvBarPrefs.getSelectedSandbox()
          : global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSelected === 'function'
            ? global.AepGlobalSandbox.getSelected()
            : '';
      if (saved) {
        setEnvironment(saved);
        return;
      }
    }
    if (!cfg.defaultSandbox) return;
    var sandbox = String(cfg.defaultSandbox).trim();
    if (!sandbox) return;
    var select = document.getElementById('sandboxSelect');
    if (select && !String(select.value || '').trim()) {
      var matched = false;
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === sandbox) {
          select.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) select.value = sandbox;
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

  function ensureDecisioningPrefsMounted(cfg) {
    if (!isDecisioningFeatureEnabled(cfg)) return;
    if (!global.DemoEnvStrip) return;
    if (document.getElementById('siteCloneDecisioningEnabledToggle')) return;
    var prefsHost = document.getElementById('siteCloneDecisioningPrefsMount');
    if (!prefsHost) {
      var shellHost = document.querySelector('[data-demo-env-strip-mount="site-clone-shell"]');
      if (shellHost) {
        shellHost.setAttribute('data-demo-env-strip-decisioning', '1');
        shellHost.removeAttribute('data-demo-env-strip-mounted');
        if (typeof global.DemoEnvStrip.mountSiteCloneEnvShell === 'function') {
          global.DemoEnvStrip.mountSiteCloneEnvShell({ host: shellHost });
        }
      }
    }
    if (document.getElementById('siteCloneDecisioningEnabledToggle')) return;
    if (typeof global.DemoEnvStrip.mountSiteCloneDecisioningPrefs === 'function') {
      global.DemoEnvStrip.mountSiteCloneDecisioningPrefs({ mountId: 'siteCloneDecisioningPrefsMount' });
      return;
    }
    if (typeof global.DemoEnvStrip.mountSiteCloneProfileBcPrefs === 'function') {
      var host = document.getElementById('siteCloneBcPrefsMount');
      if (host) {
        host.removeAttribute('data-demo-env-strip-mounted');
        host.setAttribute('data-demo-env-strip-decisioning', '1');
      }
      global.DemoEnvStrip.mountSiteCloneProfileBcPrefs({
        mountId: 'siteCloneBcPrefsMount',
        includeDecisioning: true,
      });
    }
  }

  function scheduleDecisioningBoot(cfg) {
    if (!isDecisioningFeatureEnabled(cfg)) return;
    bootSiteCloneDecisioning(cfg, { force: true });
    window.setTimeout(function () {
      bootSiteCloneDecisioning(cfg, { force: true });
    }, 0);
    window.setTimeout(function () {
      bootSiteCloneDecisioning(cfg, { force: true });
    }, 1200);
  }

  /**
   * Load site-clone-bc-env.js after strip mount (BC style hosting + datastream pickers need DOM).
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadSiteCloneBcEnv(versions, cfg) {
    if (!isFullShellMode(cfg)) return Promise.resolve();
    /* Env strip datastream + BC style pickers need site-clone-bc-env even when bc runtime is off (LinkedIn). */
    var refresh = function () {
      ensureDecisioningPrefsMounted(cfg);
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
   * Load centre-bottom BC dock assets when the env strip exposes bc-bottom toggle.
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadBottomDockRuntime(versions, cfg) {
    if (!isFullShellMode(cfg) || (cfg.features && cfg.features.bc === false)) return Promise.resolve();
    if (!document.querySelector('[data-demo-env-strip-bc-bottom="1"]')) return Promise.resolve();
    var a = versions.assets;
    var dockCss = assetUrl(
      'brand-concierge-bottom-dock/brand-concierge-bottom-dock.css',
      a.bottomDockCss || '20260613bc-panel-compact'
    );
    var dockJs = assetUrl(
      'brand-concierge-bottom-dock/brand-concierge-bottom-dock.js',
      a.bottomDockJs || '20260613bc-typing'
    );
    var bootJs = assetUrl('shared/site-clone-bottom-dock-boot.js', a.bottomDockBoot || '20260613bc-boot');
    return linkCss(dockCss)
      .then(function () {
        return loadScript(dockJs);
      })
      .then(function () {
        if (document.querySelector('script[src*="site-clone-bottom-dock-boot.js"]')) return;
        return loadScript(bootJs);
      })
      .then(function () {
        if (global.SiteCloneBottomDockBoot && typeof global.SiteCloneBottomDockBoot.boot === 'function') {
          global.SiteCloneBottomDockBoot.boot();
        }
      });
  }

  /**
   * Load right-side Modal bar BC shell for all site-clone demos with BC enabled.
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadModalBarRuntime(versions, cfg) {
    if (!isFullShellMode(cfg) || !isBcFeatureEnabled(cfg)) return Promise.resolve();
    var a = versions.assets;
    var barCss = assetUrl(
      'brand-concierge-modal-bar/brand-concierge-modal-bar.css',
      a.modalBarCss || '20260617-modal-bar',
    );
    var barJs = assetUrl(
      'brand-concierge-modal-bar/brand-concierge-modal-bar.js',
      a.modalBarJs || '20260617-modal-bar',
    );
    var bootJs = assetUrl('shared/site-clone-modal-bar-boot.js', a.modalBarBoot || '20260617-modal-bar');
    return linkCss(barCss)
      .then(function () {
        return loadScript(barJs);
      })
      .then(function () {
        if (document.querySelector('script[src*="site-clone-modal-bar-boot.js"]')) return;
        return loadScript(bootJs);
      })
      .then(function () {
        if (global.SiteCloneModalBarBoot && typeof global.SiteCloneModalBarBoot.boot === 'function') {
          global.SiteCloneModalBarBoot.boot();
        }
      });
  }

  /**
   * Mount BC page chrome (FAB, modal, frame host) and load site-clone-bc.js when the demo
   * enables BC but omits a static script tag (e.g. aviva-target).
   * @param {typeof DEFAULT_VERSIONS} versions
   * @param {EnvBarConfig} cfg
   */
  function loadSiteCloneBcRuntime(versions, cfg) {
    if (!isFullShellMode(cfg)) return Promise.resolve();
    if (cfg.features && cfg.features.bc === false) return Promise.resolve();
    var a = versions.assets;
    var chromeSrc = assetUrl('shared/site-clone-bc-chrome.js', a.siteCloneBcChrome || '20260624-bc-chrome');
    return loadScript(chromeSrc)
      .then(function () {
        if (global.SiteCloneBcChrome && typeof global.SiteCloneBcChrome.ensure === 'function') {
          global.SiteCloneBcChrome.ensure();
        }
        if (global.SiteCloneBcChrome && typeof global.SiteCloneBcChrome.upgradeModalShell === 'function') {
          global.SiteCloneBcChrome.upgradeModalShell();
        }
        if (global.SiteCloneBc) return;
        if (document.querySelector('script[src*="site-clone-bc.js"]')) return;
        return loadScript(assetUrl('site-clone-bc.js', a.siteCloneBc || '20260624-bc-toggle-refresh'));
      })
      .then(function () {
        if (global.SiteCloneBc && typeof global.SiteCloneBc.refreshDisplayModeToggles === 'function') {
          global.SiteCloneBc.refreshDisplayModeToggles();
        }
        if (global.SiteCloneBc && typeof global.SiteCloneBc.sync === 'function') {
          return global.SiteCloneBc.sync();
        }
      })
      .then(function () {
        return loadBottomDockRuntime(versions, cfg);
      })
      .then(function () {
        return loadModalBarRuntime(versions, cfg);
      });
  }

  /**
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
   * Legacy brand-scraper shells shipped before labCoreScript — load Tags injection wiring.
   * @param {EnvBarConfig} cfg
   */
  function loadBrandScraperLabCoreFallback(cfg) {
    if (!isFullShellMode(cfg)) return Promise.resolve();
    if (cfg.labCoreScript) return Promise.resolve();
    if (state.tagsInjection) return Promise.resolve();
    if (global.__brandScraperLabCoreRan) return Promise.resolve();
    var mount = document.querySelector('[data-demo-env-strip-mount="site-clone-shell"]');
    if (!mount) return Promise.resolve();
    var disclaimer = String(mount.getAttribute('data-demo-env-strip-disclaimer') || '');
    if (disclaimer.indexOf('Brand scrape demo') === -1) return Promise.resolve();
    log('load brand scraper lab core (legacy shell fallback)');
    return loadScript((state.basePath || '') + 'brand-scraper-site-clone-lab-core.js?v=20260629-tags-inject');
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

    labInfo('loader init start', {
      demoPrefix: userConfig && userConfig.prefix,
      hasMount: !!document.querySelector('[data-demo-env-strip-mount]'),
    });

    state.initPromise = ensurePrefsReady()
      .then(function () {
        return loadAndMergeRemoteConfig();
      })
      .then(function (mergedCfg) {
        startRemoteConfigListen(resolveDemoId(mergedCfg), mergedCfg);
        return loadVersions();
      })
      .then(function (versions) {
        state.config = resolveConfig(userConfig);
        if (!state.config.prefix) {
          labError('loader init failed — missing demo prefix', {
            hasMount: !!document.querySelector('[data-demo-env-strip-mount]'),
          });
          throw new Error('envBar.init requires config.prefix (or data-demo-env-strip-prefix on mount host)');
        }
        labInfo('config loaded', {
          demoPrefix: state.config.prefix,
          variant: state.config.variant,
          mode: state.config.mode,
        });
        applyFeatureFlags(state.config);
        ensureSiteCloneDemoEnv(state.config);
        return loadStyles(versions, state.config)
          .then(function () {
            return loadDecisioningStyles(versions, state.config);
          })
          .then(function () {
            return loadBcMidrailStyles(versions, state.config);
          })
          .then(function () {
            return loadScripts(versions, state.config);
          })
          .then(function () {
            return loadDecisioningScripts(versions, state.config);
          });
      })
      .then(function () {
        var result = runBootstrap(state.config);
        ensureDecisioningPrefsMounted(state.config);
        scheduleDecisioningBoot(state.config);
        return loadSiteCloneBcEnv(state.versions, state.config).then(function () {
          return loadSiteCloneBcRuntime(state.versions, state.config);
        }).then(function () {
          return loadBcMidrailScripts(state.versions, state.config);
        }).then(function () {
          bootBcMidrailPanel(state.config);
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
        labInfo('loader init complete', {
          demoPrefix: state.config.prefix,
          stripMounted: !!(result && result.stripMounted),
          envBarInited: !!(result && result.envBarInited),
        });
        return loadLabCoreIfConfigured(state.config).then(function () {
          return loadBrandScraperLabCoreFallback(state.config);
        }).then(function () {
          return Object.assign({ config: getConfig() }, result);
        });
      })
      .catch(function (err) {
        state.initPromise = null;
        warn('init failed', err);
        labError('loader init failed', { message: err && err.message ? err.message : String(err) });
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

    var current =
      global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function'
        ? String(global.AepGlobalSandbox.getSandboxName() || '').trim()
        : '';
    var sandboxChanged = current !== name;

    if (sandboxChanged) {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.setSelected === 'function') {
        global.AepGlobalSandbox.setSelected(name, { source: 'user' });
      } else if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.setSelectedSandbox === 'function') {
        global.AepLabEnvBarPrefs.setSelectedSandbox(name, { explicit: true });
      }
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
      if (sandboxChanged && String(select.value || '').trim() === name) {
        try {
          select.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_e) {}
      }
    }

    if (state.tagsInjection && typeof state.tagsInjection.applySandboxConfigState === 'function') {
      state.tagsInjection.applySandboxConfigState();
    } else if (global.__envBarTagsInjection && typeof global.__envBarTagsInjection.applySandboxConfigState === 'function') {
      global.__envBarTagsInjection.applySandboxConfigState();
    }

    if (global.SiteCloneBcEnv && typeof global.SiteCloneBcEnv.applyForCurrentSandbox === 'function') {
      global.SiteCloneBcEnv.applyForCurrentSandbox({ force: sandboxChanged });
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

  function openEnvOverlay(opts) {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.openOverlay === 'function') {
      return global.EnvBarCompact.openOverlay(opts);
    }
    try {
      global.dispatchEvent(new CustomEvent('aep-demo-env-overlay-open', { detail: opts || {} }));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function closeEnvOverlay(opts) {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.closeOverlay === 'function') {
      return global.EnvBarCompact.closeOverlay(opts);
    }
    return false;
  }

  function dockEnvBar() {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.dock === 'function') {
      return global.EnvBarCompact.dock();
    }
    return false;
  }

  function undockEnvBar() {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.undock === 'function') {
      return global.EnvBarCompact.undock();
    }
    return false;
  }

  function toggleDockEnvBar() {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.toggleDock === 'function') {
      return global.EnvBarCompact.toggleDock();
    }
    return false;
  }

  function isEnvBarDocked() {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.isDocked === 'function') {
      return global.EnvBarCompact.isDocked();
    }
    return false;
  }

  function whenPrefsReady() {
    return ensurePrefsReady();
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
    whenPrefsReady: whenPrefsReady,
    setEnvironment: setEnvironment,
    reloadSDK: reloadSDK,
    getConfig: getConfig,
    onChange: onChange,
    registerTagsInjection: registerTagsInjection,
    openOverlay: openEnvOverlay,
    closeOverlay: closeEnvOverlay,
    dock: dockEnvBar,
    undock: undockEnvBar,
    toggleDock: toggleDockEnvBar,
    isDocked: isEnvBarDocked,
  };

  scheduleAutoInit();

  global.addEventListener('pageshow', function (ev) {
    if (!ev || !ev.persisted) return;
    labWarn('bfcache restore — re-initializing env bar', {
      demoPrefix: state.config && state.config.prefix,
    });
    state.initialized = false;
    state.initPromise = null;
    init().catch(function (e) {
      warn('bfcache re-init failed', e);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
