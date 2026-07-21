/* Shared Tags/Launch injection flow for demo pages.
 * One-time per-sandbox config, reload-based injection with cache busting, and ECID/email stitching helpers.
 * A normal refresh removes the injected Launch tag from the DOM; when this sandbox is still SDK-configured,
 * auto-reinject the persisted Launch URL on load so alloy is live without clicking Inject again
 * (optional cfg.resumeSdkOnReload: false opts out).
 *
 * Anonymous Edge + _demoemea: see docs/ANONYMOUS_EDGE_DEMO_PATTERN.md (core.ecid + getIdentity + single sendEvent).
 */
(function attachDemoTagsInjection(global) {
  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function readStorageMap(key) {
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
      return global.AepLabEnvBarPrefs.readMap(key);
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeStorageMap(key, mapObj) {
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.writeMap === 'function') {
      global.AepLabEnvBarPrefs.writeMap(key, mapObj || {});
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(mapObj || {}));
    } catch {
      /* noop */
    }
  }

  function getSandboxName() {
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    return '';
  }

  function getSandboxKey() {
    const raw = getSandboxName().toLowerCase();
    return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
  }

  function resolvePageStoragePrefix() {
    try {
      if (global.envBarConfig && global.envBarConfig.storagePrefix) {
        return String(global.envBarConfig.storagePrefix).trim();
      }
      if (global.envBarConfig && global.envBarConfig.prefix) {
        return String(global.envBarConfig.prefix).trim();
      }
    } catch (_e) {
      /* noop */
    }
    return '';
  }

  function injectGuardSessionKeys(storagePrefix) {
    const p = String(storagePrefix || resolvePageStoragePrefix() || 'demoTagsInjection');
    return {
      inProgress: p + 'InjectInProgress',
      sandbox: p + 'InjectSandboxSnapshot',
    };
  }

  /** Tab-scoped “Tags injected this session” flag (survives F5; cleared when tab closes). */
  function tagsInjectedSessionStorageKey(storagePrefix, sandboxKey) {
    const prefix = String(storagePrefix || resolvePageStoragePrefix() || 'demoTagsInjection').trim();
    const sk = String(sandboxKey || '__default__').trim();
    return 'aepDemoTagsInjected:' + prefix + ':' + sk;
  }

  function readTagsInjectedSessionScript(storagePrefix, sandboxKey) {
    const key = tagsInjectedSessionStorageKey(storagePrefix, sandboxKey);
    try {
      return String(global.sessionStorage.getItem(key) || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function writeTagsInjectedSessionScript(storagePrefix, sandboxKey, scriptUrl) {
    const key = tagsInjectedSessionStorageKey(storagePrefix, sandboxKey);
    const url = String(scriptUrl || '').trim();
    try {
      if (!url) global.sessionStorage.removeItem(key);
      else global.sessionStorage.setItem(key, url);
    } catch (_e2) {
      /* quota / private mode */
    }
    writeTagsInjectedLocalScript(storagePrefix, sandboxKey, url);
  }

  /** Cross-tab Launch script mirror (same origin; survives new-tab opens from LinkedIn → arm.com). */
  function tagsInjectedLocalStorageKey(storagePrefix, sandboxKey) {
    const prefix = String(storagePrefix || resolvePageStoragePrefix() || 'demoTagsInjection').trim();
    const sk = String(sandboxKey || '__default__').trim();
    return 'aepDemoTagsInjectedLocal:' + prefix + ':' + sk;
  }

  function readTagsInjectedLocalScript(storagePrefix, sandboxKey) {
    const key = tagsInjectedLocalStorageKey(storagePrefix, sandboxKey);
    try {
      return String(global.localStorage.getItem(key) || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function writeTagsInjectedLocalScript(storagePrefix, sandboxKey, scriptUrl) {
    const key = tagsInjectedLocalStorageKey(storagePrefix, sandboxKey);
    const url = String(scriptUrl || '').trim();
    try {
      if (!url) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, url);
    } catch (_e2) {
      /* quota / private mode */
    }
  }

  function labEnvConfiguredLocalStorageKey(labPrefix) {
    const prefix = String(labPrefix || resolvePageStoragePrefix() || '').trim();
    return prefix ? 'aepLabEnvConfiguredLocal:' + prefix : 'aepLabEnvConfiguredLocal';
  }

  function readLabEnvConfiguredLocal(labPrefix) {
    try {
      return global.localStorage.getItem(labEnvConfiguredLocalStorageKey(labPrefix)) === '1';
    } catch (_e) {
      return false;
    }
  }

  function writeLabEnvConfiguredLocal(labPrefix, configured) {
    const key = labEnvConfiguredLocalStorageKey(labPrefix);
    try {
      if (configured) global.localStorage.setItem(key, '1');
      else global.localStorage.removeItem(key);
    } catch (_e2) {
      /* noop */
    }
  }

  function sessionKeysToPreserveOnIdentityReset(storagePrefix) {
    const p = String(storagePrefix || resolvePageStoragePrefix() || 'demoTagsInjection').trim();
    const keys = injectGuardSessionKeys(p);
    const labPrefix = p;
    return [
      keys.inProgress,
      keys.sandbox,
      p + 'PendingLaunchInject',
      labPrefix ? 'aepLabEnvConfigured:' + labPrefix : 'aepLabEnvConfigured',
    ];
  }

  function isTagsInjectInProgress(storagePrefix) {
    const keys = injectGuardSessionKeys(storagePrefix);
    try {
      return global.sessionStorage.getItem(keys.inProgress) === '1';
    } catch (_e) {
      return false;
    }
  }

  function readTagsInjectSandboxSnapshot(storagePrefix) {
    const keys = injectGuardSessionKeys(storagePrefix);
    try {
      return String(global.sessionStorage.getItem(keys.sandbox) || '').trim();
    } catch (_e) {
      return '';
    }
  }

  /** Technical sandbox name → Tags property name prefix (datalist filter). */
  const TAGS_PROPERTY_PREFIX_BY_SANDBOX = {
    kirkham: 'kirkham',
  };

  function getSandboxSelectLabelLower() {
    try {
      const el = document.getElementById('sandboxSelect');
      if (!el || el.selectedIndex < 0) return '';
      return String(el.options[el.selectedIndex].textContent || '').toLowerCase();
    } catch {
      return '';
    }
  }

  function resolveTagsPropertyNamePrefix(cfg) {
    if (cfg && typeof cfg.tagsPropertyNamePrefix === 'string') {
      const forced = String(cfg.tagsPropertyNamePrefix || '').trim().toLowerCase();
      if (forced) return forced;
    }
    if (cfg && cfg.tagsPropertyPrefixBySandbox && typeof cfg.tagsPropertyPrefixBySandbox === 'object') {
      const sb = getSandboxName().toLowerCase();
      const mapped = cfg.tagsPropertyPrefixBySandbox[sb];
      if (mapped) return String(mapped).trim().toLowerCase();
    }
    const sb = getSandboxName().toLowerCase();
    if (TAGS_PROPERTY_PREFIX_BY_SANDBOX[sb]) return TAGS_PROPERTY_PREFIX_BY_SANDBOX[sb];
    const label = getSandboxSelectLabelLower();
    if (label.indexOf('alan kirkham') !== -1) return 'kirkham';
    return '';
  }

  function filterPropertiesForSandbox(items, cfg) {
    const prefix = resolveTagsPropertyNamePrefix(cfg);
    if (!prefix) return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter(function (p) {
      const name = String((p && p.attributes && p.attributes.name) || '').trim().toLowerCase();
      return name.indexOf(prefix) === 0;
    });
  }

  const LAB_EDGE_DATASTREAM_BY_SANDBOX_KEY = 'siteCloneBcDatastreamIdBySandbox';

  function sanitiseLabEdgeDatastreamId(raw) {
    const v = String(raw || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return '';
    return v.toLowerCase();
  }

  /** Datastream UUID from env bar (per sandbox). Does not change Alloy instance config from Launch. */
  function readLabEdgeDatastreamOverrideFromStorage() {
    const id = sanitiseLabEdgeDatastreamId(readStorageMap(LAB_EDGE_DATASTREAM_BY_SANDBOX_KEY)[getSandboxKey()]);
    return id;
  }

  function labEdgeConfigOverrides() {
    const id = readLabEdgeDatastreamOverrideFromStorage();
    return id ? { edgeConfigOverrides: { datastreamId: id } } : {};
  }

  function tagsApiUrl(resource, companyId, propertyId) {
    const p = new URLSearchParams();
    const sandbox = getSandboxName();
    if (sandbox) p.set('sandbox', sandbox);
    p.set('resource', resource);
    if (companyId) p.set('companyId', companyId);
    if (propertyId) p.set('propertyId', propertyId);
    return '/api/tags/reactor?' + p.toString();
  }

  function sanitiseLaunchScriptUrl(raw) {
    let v = String(raw || '').trim();
    if (!v) return '';
    const m = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i.exec(v);
    if (m) v = m[1].trim();
    if (/^http:\/\/assets\.adobedtm\.com/i.test(v)) v = v.replace(/^http:/i, 'https:');
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    if (!/^https:\/\/assets\.adobedtm\.com\//i.test(v)) return '';
    return v;
  }

  function withCacheBust(url) {
    try {
      const u = new URL(url, global.location.origin);
      u.searchParams.set('aepcb', String(Date.now()));
      return u.toString();
    } catch {
      const sep = String(url || '').indexOf('?') === -1 ? '?' : '&';
      return String(url || '') + sep + 'aepcb=' + String(Date.now());
    }
  }

  function injectScriptIntoDocument(doc, scriptUrl, scriptId) {
    return new Promise((resolve, reject) => {
      if (!doc || !doc.head) {
        reject(new Error('Document head is not available for script injection.'));
        return;
      }
      const existing = doc.getElementById(scriptId);
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      const script = doc.createElement('script');
      script.id = scriptId;
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error('Failed to load script: ' + scriptUrl));
      doc.head.appendChild(script);
    });
  }

  function isAlloyOnWindow() {
    return typeof global.alloy === 'function' ? global.alloy : null;
  }

  function waitForAlloy(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      function poll() {
        const alloy = isAlloyOnWindow();
        if (alloy) {
          resolve(alloy);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        global.setTimeout(poll, 120);
      }
      poll();
    });
  }

  function buildAlloyNotReadyError(storagePrefix) {
    const prefix = String(storagePrefix || '').trim();
    if (prefix && isTagsInjectInProgress(prefix)) {
      return new Error('Web SDK (Alloy) is still loading — wait for Tags inject to finish, then try again.');
    }
    const launchId = prefix ? prefix + 'LaunchScript' : '';
    if (!launchId || !document.getElementById(launchId)) {
      return new Error('Web SDK (Alloy) not ready — inject Tags first.');
    }
    return new Error(
      'Web SDK (Alloy) not ready — Launch script loaded but alloy is missing (verify your Tags property includes the Web SDK extension).',
    );
  }

  /**
   * Wait for window.alloy after Tags inject (poll + aep-demo-tags-injected + optional sync nudge).
   * @param {{ timeoutMs?: number, storagePrefix?: string }} [opts]
   * @returns {Promise<Function>}
   */
  function ensureAlloyReady(opts) {
    opts = opts || {};
    const maxMs = Math.max(5000, Number(opts.timeoutMs) || 30000);
    const storagePrefix = String(opts.storagePrefix || '').trim();
    const immediate = isAlloyOnWindow();
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve, reject) => {
      let settled = false;
      const deadline = Date.now() + maxMs;
      let nudgedSync = false;

      function finish(alloy) {
        if (settled) return;
        settled = true;
        global.removeEventListener('aep-demo-tags-injected', onInjected);
        resolve(alloy);
      }

      function fail() {
        if (settled) return;
        settled = true;
        global.removeEventListener('aep-demo-tags-injected', onInjected);
        reject(buildAlloyNotReadyError(storagePrefix));
      }

      function onInjected() {
        const alloy = isAlloyOnWindow();
        if (alloy) finish(alloy);
      }

      global.addEventListener('aep-demo-tags-injected', onInjected);

      void (async function poll() {
        while (Date.now() < deadline && !settled) {
          const alloy = isAlloyOnWindow();
          if (alloy) {
            finish(alloy);
            return;
          }

          const elapsed = maxMs - (deadline - Date.now());
          if (!nudgedSync && elapsed >= 1500) {
            nudgedSync = true;
            const inst = global.__envBarTagsInjection;
            if (inst && typeof inst.syncEcidFromAlloy === 'function') {
              try {
                await inst.syncEcidFromAlloy();
              } catch (_e) {
                /* noop */
              }
              const alloyAfter = isAlloyOnWindow();
              if (alloyAfter) {
                finish(alloyAfter);
                return;
              }
            }
          }

          await new Promise((r) => global.setTimeout(r, 120));
        }
        if (!settled) fail();
      })();
    });
  }

  /** ECID from Web SDK responses is digits-only; strip non-digits for safety. */
  function normaliseEcidDigits(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits : '';
  }

  /**
   * Parse `alloy('getIdentity', …)` result — shape varies by SDK version (ECID string, object, array).
   * Matches the resilient path in `aep-profile-drawer.js` / Old Mutual demos.
   */
  function extractEcid(result) {
    if (!result || typeof result !== 'object') return '';
    const id = result.identity;
    if (id && typeof id === 'object') {
      const raw = id.ECID != null ? id.ECID : id.ecid;
      if (typeof raw === 'string') {
        const n = normaliseEcidDigits(raw);
        if (n) return n;
      }
      if (raw && typeof raw === 'object' && raw.id != null) {
        const n = normaliseEcidDigits(raw.id);
        if (n) return n;
      }
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
          const item = raw[i];
          if (item && item.id != null) {
            const n = normaliseEcidDigits(item.id);
            if (n) return n;
          }
          if (typeof item === 'string') {
            const n = normaliseEcidDigits(item);
            if (n) return n;
          }
        }
      }
      if (Array.isArray(id.ECID) && id.ECID[0] && id.ECID[0].id) {
        return normaliseEcidDigits(id.ECID[0].id);
      }
      if (Array.isArray(id.ecid) && id.ecid[0] && id.ecid[0].id) {
        return normaliseEcidDigits(id.ecid[0].id);
      }
    }
    if (result.id != null) return normaliseEcidDigits(result.id);
    return '';
  }

  function delay(ms) {
    return new Promise((resolve) => {
      global.setTimeout(resolve, ms);
    });
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function resolveKnownEcid(profile, infoEcidEl) {
    const ui = infoEcidEl ? String(infoEcidEl.textContent || '').trim() : '';
    if (ui && ui !== '—' && ui !== '-' && /^\d+$/.test(ui) && ui.length >= 10) {
      return ui;
    }
    if (profile && profile.ecid) return String(profile.ecid).trim();
    if (profile && Array.isArray(profile.identities)) {
      const found = profile.identities.find((id) => String(id.namespace || '').toLowerCase() === 'ecid');
      if (found && found.value) return String(found.value).trim();
    }
    return ui && ui !== '-' ? ui : '';
  }

  function resolveKnownEmail(profile, fallbackIdentifier) {
    if (profile && profile.email && looksLikeEmail(profile.email)) return String(profile.email).trim().toLowerCase();
    if (looksLikeEmail(fallbackIdentifier)) return String(fallbackIdentifier).trim().toLowerCase();
    return '';
  }

  function createInstance(config) {
    const cfg = config || {};
    const storagePrefix = String(cfg.storagePrefix || 'demoTagsInjection');
    const scriptStorageKey = storagePrefix + 'SelectedLaunchScriptBySandbox';
    const configuredStorageKey = storagePrefix + 'SdkConfiguredBySandbox';
    const pendingSessionKey = storagePrefix + 'PendingLaunchInject';
    const injectInProgressKey = storagePrefix + 'InjectInProgress';
    const injectSandboxSnapshotKey = storagePrefix + 'InjectSandboxSnapshot';
    const ecidBySandboxKey = storagePrefix + 'LastResolvedEcidBySandbox';
    const companyStorageKey = storagePrefix + 'SelectedTagsCompanyBySandbox';
    const propertyStorageKey = storagePrefix + 'SelectedTagsPropertyBySandbox';
    const environmentStorageKey = storagePrefix + 'SelectedTagsEnvironmentBySandbox';

    function resolveLabEnvPrefix() {
      try {
        if (global.envBarConfig && global.envBarConfig.prefix) {
          return String(global.envBarConfig.prefix).trim();
        }
      } catch (_e) {
        /* noop */
      }
      if (cfg.labEnvPrefix) return String(cfg.labEnvPrefix).trim();
      return '';
    }

    function labEnvConfiguredStorageKey() {
      const prefix = resolveLabEnvPrefix();
      return prefix ? 'aepLabEnvConfigured:' + prefix : 'aepLabEnvConfigured';
    }

    function markLabEnvConfiguredSession() {
      if (!isSdkConfiguredForSandbox()) return;
      const script = sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl());
      if (!script) return;
      try {
        sessionStorage.setItem(labEnvConfiguredStorageKey(), '1');
      } catch (_e) {
        /* noop */
      }
      writeLabEnvConfiguredLocal(resolveLabEnvPrefix(), true);
    }
    const identityEventType = String(cfg.identityEventType || 'demo.identity.stitch');

    let injectSdkBtn = byId(cfg.injectButtonId);
    let selectedScriptEl = byId(cfg.selectedScriptId);
    let tagsCompanySelect = byId(cfg.tagsCompanyId);
    let tagsPropertyInput = byId(cfg.tagsPropertyInputId);
    let tagsPropertyList = byId(cfg.tagsPropertyListId);
    let tagsEnvironmentSelect = byId(cfg.tagsEnvironmentId);
    let sdkConfigFields = byId(cfg.configFieldsId);
    let sdkConfigSummary = byId(cfg.configSummaryId);
    let sdkConfigSummaryText = byId(cfg.configSummaryTextId);
    let changeSdkConfigBtn = byId(cfg.changeConfigButtonId);
    let infoEcidEl = byId(cfg.infoEcidId);

    /** Re-resolve after DemoEnvStrip mounts Tags fields (mount may run after this script on DOMContentLoaded). */
    function refreshTagsDom() {
      if (!injectSdkBtn && cfg.injectButtonId) injectSdkBtn = byId(cfg.injectButtonId);
      if (!selectedScriptEl && cfg.selectedScriptId) selectedScriptEl = byId(cfg.selectedScriptId);
      if (!tagsCompanySelect && cfg.tagsCompanyId) tagsCompanySelect = byId(cfg.tagsCompanyId);
      if (!tagsPropertyInput && cfg.tagsPropertyInputId) tagsPropertyInput = byId(cfg.tagsPropertyInputId);
      if (!tagsPropertyList && cfg.tagsPropertyListId) tagsPropertyList = byId(cfg.tagsPropertyListId);
      if (!tagsEnvironmentSelect && cfg.tagsEnvironmentId) tagsEnvironmentSelect = byId(cfg.tagsEnvironmentId);
      if (!sdkConfigFields && cfg.configFieldsId) sdkConfigFields = byId(cfg.configFieldsId);
      if (!sdkConfigSummary && cfg.configSummaryId) sdkConfigSummary = byId(cfg.configSummaryId);
      if (!sdkConfigSummaryText && cfg.configSummaryTextId) sdkConfigSummaryText = byId(cfg.configSummaryTextId);
      if (!changeSdkConfigBtn && cfg.changeConfigButtonId) changeSdkConfigBtn = byId(cfg.changeConfigButtonId);
      if (!infoEcidEl && cfg.infoEcidId) infoEcidEl = byId(cfg.infoEcidId);
    }

    function tagsDomReady() {
      refreshTagsDom();
      return !!(tagsCompanySelect && tagsPropertyInput && tagsEnvironmentSelect);
    }

    const iframeIds = Array.isArray(cfg.iframeIds) ? cfg.iframeIds : [];
    const iframes = iframeIds.map(byId).filter(Boolean);
    const hideTagsCompanyUi = cfg.hideTagsCompanyUi === true;

    const setMessageRaw =
      typeof cfg.messageSetter === 'function'
        ? global.AepLabDebug && typeof global.AepLabDebug.wrapMessageSetter === 'function'
          ? global.AepLabDebug.wrapMessageSetter(cfg.messageSetter)
          : cfg.messageSetter
        : global.AepLabDebug && typeof global.AepLabDebug.wrapMessageSetter === 'function'
          ? global.AepLabDebug.wrapMessageSetter(null)
          : function () {};

    function tagsStatusElement() {
      if (cfg.tagsStatusId) return byId(cfg.tagsStatusId);
      if (cfg.tagsPropertyInputId) {
        return byId(String(cfg.tagsPropertyInputId).replace(/TagsProperty$/, 'TagsStatus'));
      }
      return null;
    }

    function setTagsInlineStatus(text) {
      const el = tagsStatusElement();
      if (!el) return;
      el.textContent = String(text || '');
    }

    /** Route transient Tags loading copy to the Environment card — avoids footer layout shift. */
    const setMessage = function (text, type) {
      const t = String(text || '');
      if (/^Loading\b/i.test(t)) {
        setTagsInlineStatus(t);
        return;
      }
      setTagsInlineStatus('');
      setMessageRaw(t, type);
    };
    const getSelectedGeneratorTarget =
      typeof cfg.getSelectedGeneratorTarget === 'function' ? cfg.getSelectedGeneratorTarget : null;

    var DT_LOG = '[DemoTagsInjection:' + storagePrefix + ']';
    function dtLog() {
      if (typeof global.console === 'undefined') return;
      var args = Array.prototype.slice.call(arguments);
      var message = args.length ? String(args[0]) : '';
      var detail = args.length > 1 ? args[1] : undefined;
      if (global.AepLabConsole) {
        var level = 'info';
        if (/FAILED|failed|abort|skip/i.test(message)) {
          level = /FAILED|failed/i.test(message) ? 'error' : 'warn';
        }
        if (level === 'error') global.AepLabConsole.error('tags-inject', message, detail);
        else if (level === 'warn') global.AepLabConsole.warn('tags-inject', message, detail);
        else global.AepLabConsole.info('tags-inject', message, detail);
        return;
      }
      try {
        var legacy = [DT_LOG].concat(args);
        if (global.console.log) global.console.log.apply(global.console, legacy);
      } catch (_e) {
        /* noop */
      }
    }
    function dtPreview(u) {
      var s = String(u || '');
      if (!s) return '(empty)';
      if (s.length > 140) return s.slice(0, 140) + '\u2026(len=' + s.length + ')';
      return s;
    }

    let selectedScriptUrl = '';
    let allPropertyOptions = [];
    let selectedPropertyId = '';
    let tagsCompaniesLoadGen = 0;
    let tagsPropertiesLoadGen = 0;
    let tagsSandboxReloadTimer = null;
    let tagsSandboxReloadKey = '';
    let tagsPrefsSyncTimer = null;
    let tagsCompaniesInflightKey = '';
    let tagsCompaniesInflightPromise = null;
    let tagsPropertiesInflightKey = '';
    let tagsPropertiesInflightPromise = null;

    const TAGS_SESSION_CACHE_KEY = 'aepLabTagsReactorSessionCache';
    const TAGS_SESSION_CACHE_TTL_MS = 15 * 60 * 1000;
    const TAGS_FETCH_TIMEOUT_MS = 60 * 1000;
    const tagsFetchInflight = new Map();

    function tagsReactorCacheKey(resource, companyId, propertyId) {
      return [getSandboxKey(), resource, companyId || '', propertyId || ''].join('|');
    }

    function readTagsSessionCacheEntry(key) {
      try {
        const raw = global.sessionStorage.getItem(TAGS_SESSION_CACHE_KEY);
        if (!raw) return null;
        const map = JSON.parse(raw);
        if (!map || typeof map !== 'object') return null;
        const entry = map[key];
        if (!entry || !Array.isArray(entry.items)) return null;
        if (Date.now() - Number(entry.ts || 0) > TAGS_SESSION_CACHE_TTL_MS) return null;
        return entry.items;
      } catch (_e) {
        return null;
      }
    }

    function writeTagsSessionCacheEntry(key, items) {
      try {
        const raw = global.sessionStorage.getItem(TAGS_SESSION_CACHE_KEY);
        const map = raw ? JSON.parse(raw) : {};
        map[key] = { ts: Date.now(), items: items };
        global.sessionStorage.setItem(TAGS_SESSION_CACHE_KEY, JSON.stringify(map));
      } catch (_e2) {
        /* quota / private mode */
      }
    }

    function isActiveTagsCompaniesLoad(loadGen, sandboxKeyAtStart) {
      return loadGen === tagsCompaniesLoadGen && sandboxKeyAtStart === getSandboxKey();
    }

    function isActiveTagsPropertiesLoad(loadGen, sandboxKeyAtStart) {
      return loadGen === tagsPropertiesLoadGen && sandboxKeyAtStart === getSandboxKey();
    }

    function renderSelectedScript(url) {
      const prev = selectedScriptUrl;
      selectedScriptUrl = url || '';
      if (!selectedScriptEl) return;
      selectedScriptEl.textContent = selectedScriptUrl || 'None';
      if (prev !== selectedScriptUrl) {
        dtLog('selectedScriptUrl updated', { sandboxKey: getSandboxKey(), preview: dtPreview(selectedScriptUrl) });
      }
    }

    function persistSelectedScriptUrl(url) {
      const map = readStorageMap(scriptStorageKey);
      const key = getSandboxKey();
      if (!url) delete map[key];
      else map[key] = String(url);
      writeStorageMap(scriptStorageKey, map);
    }

    function readPersistedSelectedScriptUrl() {
      const map = readStorageMap(scriptStorageKey);
      const own = String(map[getSandboxKey()] || '').trim();
      if (own) return own;
      if (storagePrefix === 'armcom') {
        const liMap = readStorageMap('linkedinArmSelectedLaunchScriptBySandbox');
        const fromLi = String(liMap[getSandboxKey()] || '').trim();
        if (fromLi) return fromLi;
        const localInject = readTagsInjectedLocalScript('linkedinArm', getSandboxKey());
        if (localInject) return localInject;
      }
      return '';
    }

    function isCrossTabSdkConfiguredForSandbox() {
      if (isSdkConfiguredForSandbox()) return true;
      if (storagePrefix !== 'armcom') return false;
      const liMap = readStorageMap('linkedinArmSdkConfiguredBySandbox');
      if (liMap[getSandboxKey()] === 1) return true;
      return !!readTagsInjectedLocalScript('linkedinArm', getSandboxKey());
    }

    function persistTagsCompanyId(companyId) {
      const map = readStorageMap(companyStorageKey);
      const key = getSandboxKey();
      if (!companyId) delete map[key];
      else map[key] = String(companyId);
      writeStorageMap(companyStorageKey, map);
    }

    function readPersistedTagsCompanyId() {
      const map = readStorageMap(companyStorageKey);
      return String(map[getSandboxKey()] || '').trim();
    }

    function persistTagsPropertySelection(propertyId, propertyLabel) {
      const map = readStorageMap(propertyStorageKey);
      const key = getSandboxKey();
      if (!propertyId) delete map[key];
      else {
        map[key] = {
          propertyId: String(propertyId),
          propertyLabel: String(propertyLabel || ''),
        };
      }
      writeStorageMap(propertyStorageKey, map);
    }

    function readPersistedTagsPropertySelection() {
      const raw = readStorageMap(propertyStorageKey)[getSandboxKey()];
      if (!raw || typeof raw !== 'object') return null;
      return {
        propertyId: String(raw.propertyId || '').trim(),
        propertyLabel: String(raw.propertyLabel || '').trim(),
      };
    }

    function persistTagsEnvironmentEncodedValue(encodedValue) {
      const map = readStorageMap(environmentStorageKey);
      const key = getSandboxKey();
      if (!encodedValue) delete map[key];
      else map[key] = String(encodedValue);
      writeStorageMap(environmentStorageKey, map);
    }

    function readPersistedTagsEnvironmentEncodedValue() {
      const map = readStorageMap(environmentStorageKey);
      return String(map[getSandboxKey()] || '').trim();
    }

    function selectTagsEnvironmentByEncodedValue(encodedValue) {
      if (!tagsEnvironmentSelect || !encodedValue) return false;
      const target = String(encodedValue);
      for (let i = 0; i < tagsEnvironmentSelect.options.length; i++) {
        const opt = tagsEnvironmentSelect.options[i];
        if (String(opt.value || '') === target) {
          tagsEnvironmentSelect.selectedIndex = i;
          return true;
        }
      }
      return false;
    }

    function applyTagsEnvironmentOptionValue(encodedValue) {
      const raw = String(encodedValue || '').trim();
      if (!raw) return '';
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch (_e) {
        decoded = raw;
      }
      const clean = sanitiseLaunchScriptUrl(decoded);
      if (clean) {
        renderSelectedScript(clean);
        persistSelectedScriptUrl(clean);
      }
      return clean;
    }

    async function restorePersistedTagsEnvironmentSelection() {
      const encoded = readPersistedTagsEnvironmentEncodedValue();
      if (encoded && selectTagsEnvironmentByEncodedValue(encoded)) {
        applyTagsEnvironmentOptionValue(encoded);
        return;
      }
      const persistedScript = sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl());
      if (!persistedScript || !tagsEnvironmentSelect) return;
      for (let i = 0; i < tagsEnvironmentSelect.options.length; i++) {
        const opt = tagsEnvironmentSelect.options[i];
        let decoded = String(opt.value || '');
        try {
          decoded = decodeURIComponent(decoded);
        } catch (_e) {
          /* keep */
        }
        if (sanitiseLaunchScriptUrl(decoded) === persistedScript) {
          tagsEnvironmentSelect.selectedIndex = i;
          persistTagsEnvironmentEncodedValue(String(opt.value || ''));
          renderSelectedScript(persistedScript);
          return;
        }
      }
    }

    function applyPersistedTagsFieldsEarly() {
      refreshTagsDom();
      const rec = readPersistedTagsPropertySelection();
      if (rec && rec.propertyId) selectedPropertyId = String(rec.propertyId);
      if (tagsPropertyInput && rec && rec.propertyId) {
        setTagsPropertyFieldValue(rec.propertyId, rec.propertyLabel);
      }
      const persistedScript = sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl());
      if (persistedScript) renderSelectedScript(persistedScript);
      const encodedEnv = readPersistedTagsEnvironmentEncodedValue();
      if (encodedEnv && tagsEnvironmentSelect && selectTagsEnvironmentByEncodedValue(encodedEnv)) {
        applyTagsEnvironmentOptionValue(encodedEnv);
      }
    }

    async function restorePersistedTagsPropertySelection() {
      const rec = readPersistedTagsPropertySelection();
      if (!rec || !rec.propertyId) return;
      let hit =
        allPropertyOptions.find(function (p) {
          return String(p && p.id ? p.id : '') === rec.propertyId;
        }) || null;
      if (!hit && rec.propertyLabel) {
        hit = findPropertyByLabel(rec.propertyLabel);
      }
      if (!hit || !hit.id) {
        if (tagsPropertyInput && rec.propertyId) {
          setTagsPropertyFieldValue(rec.propertyId, rec.propertyLabel);
        }
        return;
      }
      selectedPropertyId = String(hit.id);
      setTagsPropertyFieldValue(selectedPropertyId, propertyLabelFromItem(hit));
      persistTagsPropertySelection(selectedPropertyId, propertyLabelFromItem(hit));
      await loadTagsEnvironments(selectedPropertyId);
    }

    function isSdkConfiguredForSandbox() {
      const map = readStorageMap(configuredStorageKey);
      return map[getSandboxKey()] === 1;
    }

    function markSdkConfiguredForSandbox(configured) {
      const map = readStorageMap(configuredStorageKey);
      const key = getSandboxKey();
      if (configured) map[key] = 1;
      else delete map[key];
      writeStorageMap(configuredStorageKey, map);
    }

    function readLastResolvedEcid() {
      const map = readStorageMap(ecidBySandboxKey);
      return normaliseEcidDigits(map[getSandboxKey()]);
    }

    function persistLastResolvedEcid(ecidDigits) {
      const id = normaliseEcidDigits(ecidDigits);
      const map = readStorageMap(ecidBySandboxKey);
      const key = getSandboxKey();
      if (!id) delete map[key];
      else map[key] = id;
      writeStorageMap(ecidBySandboxKey, map);
    }

    function clearLastResolvedEcidForSandbox() {
      const map = readStorageMap(ecidBySandboxKey);
      delete map[getSandboxKey()];
      writeStorageMap(ecidBySandboxKey, map);
    }

    /**
     * Full page reload removes the injected Launch tag. When this sandbox is still SDK-configured,
     * re-inject the persisted Launch URL so alloy/getIdentity and decisioning sendEvent work without
     * another manual Inject click (identified profile lookups still need the Web SDK on the page).
     */
    function readTagsInjectedSessionScriptForSandbox() {
      return readTagsInjectedSessionScript(storagePrefix, getSandboxKey());
    }

    function markTagsInjectedSession(scriptUrl) {
      writeTagsInjectedSessionScript(storagePrefix, getSandboxKey(), scriptUrl);
    }

    function clearTagsInjectedSessionForSandbox() {
      writeTagsInjectedSessionScript(storagePrefix, getSandboxKey(), '');
      writeTagsInjectedLocalScript(storagePrefix, getSandboxKey(), '');
    }

    function resolvePersistedLaunchScriptForResume() {
      return (
        sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl()) ||
        sanitiseLaunchScriptUrl(readTagsInjectedSessionScriptForSandbox()) ||
        sanitiseLaunchScriptUrl(readTagsInjectedLocalScript(storagePrefix, getSandboxKey()))
      );
    }

    function shouldResumeSdkInjectionOnReload() {
      if (cfg.resumeSdkOnReload === false) return false;
      const url = resolvePersistedLaunchScriptForResume();
      if (!url) return false;
      if (isSdkConfiguredForSandbox() || isCrossTabSdkConfiguredForSandbox()) return true;
      return !!readTagsInjectedSessionScriptForSandbox();
    }

    function sandboxReadyForTagsResume() {
      const sb = getSandboxName();
      if (sb) return true;
      return getSandboxKey() !== '__default__';
    }

    let autoResumeOnReloadStarted = false;
    let autoResumeSandboxDeferWired = false;

    function wireAutoResumeWhenSandboxReady() {
      if (autoResumeSandboxDeferWired) return;
      autoResumeSandboxDeferWired = true;
      function retryAutoResume() {
        if (autoResumeOnReloadStarted) return;
        if (!shouldResumeSdkInjectionOnReload()) return;
        if (!sandboxReadyForTagsResume()) return;
        void startAutoResumeOnReload();
      }
      global.addEventListener('aep-global-sandbox-change', retryAutoResume);
      global.addEventListener('aep-lab-env-bar-prefs-synced', retryAutoResume);
      global.addEventListener('aep-demo-env-strip-mounted', retryAutoResume);
    }

    async function startAutoResumeOnReload() {
      if (autoResumeOnReloadStarted) return false;
      const persistedResume = resolvePersistedLaunchScriptForResume();
      if (!shouldResumeSdkInjectionOnReload() || !persistedResume) return false;
      if (!sandboxReadyForTagsResume()) {
        dtLog('auto-resume on refresh — waiting for sandbox before reinject', {
          sandboxKey: getSandboxKey(),
          preview: dtPreview(persistedResume),
        });
        wireAutoResumeWhenSandboxReady();
        return false;
      }
      autoResumeOnReloadStarted = true;
      dtLog('auto-resume on refresh — reinject persisted Launch script', {
        sandboxKey: getSandboxKey(),
        preview: dtPreview(persistedResume),
        sessionInjectFlag: !!readTagsInjectedSessionScriptForSandbox(),
        sdkConfiguredMap: isSdkConfiguredForSandbox(),
      });
      renderSelectedScript(persistedResume);
      markInjectGuardActive();
      try {
        await injectSelectedScriptNow(persistedResume, { silentResume: true });
      } finally {
        finishInjectFlow({ silentResume: true });
      }
      return true;
    }

    /** Optional `cfg.brandConcierge` — bootstraps Brand Concierge after ECID resolves. Requires brand-concierge-styles-bundle.js + brand-concierge-toggle.js loaded before this script. */
    function resolveBrandConciergeCfg() {
      if (!cfg.brandConcierge) return null;
      const bc = typeof cfg.brandConcierge === 'object' ? cfg.brandConcierge : {};
      const enabledVal = bc.enabled;
      const enabled = typeof enabledVal === 'function' ? (function () { try { return !!enabledVal(); } catch (_e) { return false; } })() : enabledVal === true;
      if (!enabled) return null;
      const styleKeyVal = bc.styleKey;
      const styleKey = typeof styleKeyVal === 'function' ? (function () { try { return String(styleKeyVal() || 'miral'); } catch (_e) { return 'miral'; } })() : String(styleKeyVal || 'miral');
      const suppressVal = bc.suppressEnable;
      const suppressEnable =
        typeof suppressVal === 'function'
          ? (function () {
              try {
                return !!suppressVal();
              } catch (_e) {
                return false;
              }
            })()
          : suppressVal === true;
      return { styleKey: styleKey, suppressEnable: suppressEnable };
    }

    /** Optional `cfg.webPush` — registers Adobe Alloy SW and, after successful ECID sync, calls `sendPushSubscriptionIfReady` when `AepDemoWebPush` is loaded. */
    function coerceWebPushFlag(value) {
      if (typeof value === 'function') {
        try {
          return !!value();
        } catch (_e) {
          return false;
        }
      }
      return value === true;
    }

    function coerceWebPushSubscribeAfterInject(value) {
      if (value === false) return false;
      if (typeof value === 'function') {
        try {
          return !!value();
        } catch (_e) {
          return true;
        }
      }
      return true;
    }

    function resolveWebPushCfg() {
      if (!cfg.webPush || cfg.webPush.enabled !== true) return null;
      const w = typeof cfg.webPush === 'object' ? cfg.webPush : {};
      return {
        workerScriptUrl: w.workerScriptUrl || '/profile-viewer/alloyServiceWorker.min.js',
        scope: w.scope || '/profile-viewer/',
        storagePrefix: storagePrefix,
        subscribeAfterInject: coerceWebPushSubscribeAfterInject(w.subscribeAfterInject),
        requestPermissionOnInject: coerceWebPushFlag(w.requestPermissionOnInject),
        skipDailyThrottleOnInject: coerceWebPushFlag(w.skipDailyThrottleOnInject),
      };
    }

    /** When Tags lists reload, keep showing the persisted Launch URL if this sandbox is already SDK-configured (avoids “Selected script: None” after inject + properties load). */
    function syncSelectedScriptDisplayAfterTagsStructureChange() {
      if (isSdkConfiguredForSandbox()) {
        const persisted = sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl());
        if (persisted) {
          renderSelectedScript(persisted);
          return;
        }
      }
      renderSelectedScript('');
    }

    function setSdkConfigExpanded(expanded, opts) {
      const options = opts || {};
      if (sdkConfigFields) sdkConfigFields.hidden = !expanded;
      if (sdkConfigSummary) sdkConfigSummary.hidden = expanded;
      if (sdkConfigSummaryText) {
        const sb = getSandboxName() || 'default sandbox';
        const script = selectedScriptUrl || 'no script selected';
        sdkConfigSummaryText.textContent = 'SDK configured for ' + sb + ' (' + script + ').';
      }
      try {
        global.dispatchEvent(
          new CustomEvent('aep-demo-tags-ui-state', {
            detail: { tagFieldsExpanded: !!expanded, sdkConfigured: isSdkConfiguredForSandbox() },
          })
        );
        if (isSdkConfiguredForSandbox()) markLabEnvConfiguredSession();
        if (!expanded && !options.skipConfiguredSignals) {
          const overlayStillOpen =
            global.EnvBarCompact &&
            typeof global.EnvBarCompact.isOpen === 'function' &&
            global.EnvBarCompact.isOpen();
          if (!overlayStillOpen) {
            /* Overlay already collapsed — skip re-dispatch to avoid collapse loop. */
          } else {
            global.dispatchEvent(new CustomEvent('aep-demo-env-configured'));
          }
        }
      } catch (e) {
        /* noop */
      }
    }

    function markInjectGuardActive() {
      const sb = getSandboxName();
      try {
        global.sessionStorage.setItem(injectInProgressKey, '1');
        if (sb) global.sessionStorage.setItem(injectSandboxSnapshotKey, sb);
        dtLog('inject guard active', { sandbox: sb || '(empty)' });
      } catch (e) {
        dtLog('inject guard active FAILED', e && e.message ? e.message : String(e));
      }
    }

    function clearInjectGuard() {
      try {
        global.sessionStorage.removeItem(injectInProgressKey);
        global.sessionStorage.removeItem(injectSandboxSnapshotKey);
        dtLog('inject guard cleared');
      } catch (e) {
        dtLog('inject guard clear FAILED', e && e.message ? e.message : String(e));
      }
    }

    function readInjectSandboxSnapshot() {
      try {
        return String(global.sessionStorage.getItem(injectSandboxSnapshotKey) || '').trim();
      } catch (_e) {
        return '';
      }
    }

    function restoreInjectSandboxIfNeeded() {
      const snap = readInjectSandboxSnapshot();
      if (!snap) return;
      const cur = getSandboxName();
      if (cur === snap) return;
      dtLog('restoreInjectSandboxIfNeeded', { from: cur || '(empty)', to: snap });
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.setSelected === 'function') {
        global.AepGlobalSandbox.setSelected(snap, { source: 'programmatic' });
      } else if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.setSelectedSandbox === 'function') {
        global.AepLabEnvBarPrefs.setSelectedSandbox(snap, { explicit: true });
      }
      const sel = document.getElementById('sandboxSelect');
      if (sel) sel.value = snap;
    }

    function finishInjectFlow(flowOpts) {
      const opts = flowOpts || {};
      restoreInjectSandboxIfNeeded();
      clearInjectGuard();
      stripLaunchReloadParamFromUrl();
      if (opts.silentResume) {
        try {
          global.dispatchEvent(new CustomEvent('aep-demo-env-configured'));
        } catch (_e) {
          /* noop */
        }
        if (
          global.EnvBarCompact &&
          typeof global.EnvBarCompact.shouldSuppressPresenterOverlay === 'function' &&
          global.EnvBarCompact.shouldSuppressPresenterOverlay()
        ) {
          if (typeof global.EnvBarCompact.closeOverlay === 'function') {
            global.EnvBarCompact.closeOverlay({ force: true });
          }
          if (typeof global.EnvBarCompact.setPresenterStripHidden === 'function') {
            global.EnvBarCompact.setPresenterStripHidden(true);
          }
        }
        return;
      }
      if (
        global.EnvBarCompact &&
        typeof global.EnvBarCompact.isArmcomPresenterMode === 'function' &&
        global.EnvBarCompact.isArmcomPresenterMode()
      ) {
        if (typeof global.EnvBarCompact.closeOverlay === 'function') {
          global.EnvBarCompact.closeOverlay({ force: true });
        }
        if (
          typeof global.EnvBarCompact.shouldSuppressPresenterOverlay === 'function' &&
          global.EnvBarCompact.shouldSuppressPresenterOverlay() &&
          typeof global.EnvBarCompact.setPresenterStripHidden === 'function'
        ) {
          global.EnvBarCompact.setPresenterStripHidden(true);
        }
        return;
      }
      if (
        global.EnvBarCompact &&
        typeof global.EnvBarCompact.minimizeToProfileLookup === 'function' &&
        global.EnvBarCompact.isConfiguredForCollapse &&
        global.EnvBarCompact.isConfiguredForCollapse()
      ) {
        global.EnvBarCompact.minimizeToProfileLookup();
        return;
      }
      requestEnvOverlayOpen();
    }

    function releaseBcSuppressForActiveInject() {
      try {
        global.__siteCloneSuppressBcEnable = false;
      } catch (_e) {
        /* noop */
      }
    }

    function syncSiteCloneBcDisplayAfterInject() {
      if (global.SiteCloneBc && typeof global.SiteCloneBc.sync === 'function') {
        void global.SiteCloneBc.sync();
      }
      try {
        global.dispatchEvent(new CustomEvent('aep-demo-tags-injected'));
      } catch (_e2) {
        /* noop */
      }
      refreshTagsDom();
      if (global.DemoProfileDrawer && typeof global.DemoProfileDrawer.refreshBrowserEcidFromAlloy === 'function') {
        void global.DemoProfileDrawer.refreshBrowserEcidFromAlloy();
      } else if (infoEcidEl) {
        void syncEcidFromAlloy();
      }
    }

    function requestEnvOverlayOpen() {
      if (
        global.EnvBarCompact &&
        typeof global.EnvBarCompact.shouldSuppressPresenterOverlay === 'function' &&
        global.EnvBarCompact.shouldSuppressPresenterOverlay()
      ) {
        return;
      }
      if (global.EnvBarCompact && typeof global.EnvBarCompact.openOverlay === 'function') {
        global.EnvBarCompact.openOverlay();
        return;
      }
      try {
        global.dispatchEvent(new CustomEvent('aep-demo-env-overlay-open'));
      } catch (_e) {
        /* noop */
      }
    }

    function markPendingLaunchInject(url) {
      try {
        sessionStorage.setItem(pendingSessionKey, String(url || '').trim());
        dtLog('sessionStorage pending set', { key: pendingSessionKey, preview: dtPreview(url) });
      } catch (e) {
        dtLog('sessionStorage pending set FAILED', e && e.message ? e.message : String(e));
      }
    }

    function consumePendingLaunchInject() {
      try {
        const v = String(sessionStorage.getItem(pendingSessionKey) || '').trim();
        sessionStorage.removeItem(pendingSessionKey);
        dtLog('sessionStorage pending consumed', { key: pendingSessionKey, hadValue: !!v, preview: dtPreview(v) });
        return v;
      } catch (e) {
        dtLog('sessionStorage pending consume FAILED', e && e.message ? e.message : String(e));
        return '';
      }
    }

    function reloadPageForLaunchInjection() {
      try {
        const u = new URL(global.location.href);
        const p = storagePrefix + 'LaunchReload';
        u.searchParams.set(p, String(Date.now()));
        dtLog('navigation: location.replace for inject reload', { param: p, href: u.toString() });
        global.location.replace(u.toString());
      } catch (e) {
        dtLog('navigation: location.replace failed, falling back to reload', e && e.message ? e.message : String(e));
        global.location.reload();
      }
    }

    function stripLaunchReloadParamFromUrl() {
      try {
        const u = new URL(global.location.href);
        const p = storagePrefix + 'LaunchReload';
        if (!u.searchParams.has(p)) return;
        u.searchParams.delete(p);
        const qs = u.searchParams.toString();
        const href = u.pathname + (qs ? '?' + qs : '') + u.hash;
        global.history.replaceState(global.history.state, '', href);
        dtLog('navigation: stripped LaunchReload query param', { param: p });
      } catch (_e) {
        /* noop */
      }
    }

    async function fetchTags(resource, companyId, propertyId, opts) {
      const o = opts || {};
      const cacheKey = tagsReactorCacheKey(resource, companyId, propertyId);
      const cached = o.skipCache || o.networkOnly ? null : readTagsSessionCacheEntry(cacheKey);
      if (cached && !o.cacheOnly) {
        if (!o.networkOnly) {
          void fetchTags(resource, companyId, propertyId, { networkOnly: true }).catch(function () {
            /* background refresh */
          });
        }
        return cached;
      }
      if (tagsFetchInflight.has(cacheKey)) {
        return tagsFetchInflight.get(cacheKey);
      }
      const promise = (async function () {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller
          ? global.setTimeout(function () {
              controller.abort();
            }, TAGS_FETCH_TIMEOUT_MS)
          : null;
        try {
          const res = await fetch(tagsApiUrl(resource, companyId, propertyId), {
            cache: 'no-store',
            signal: controller ? controller.signal : undefined,
          });
          const data = await res.json().catch(() => ({}));
          if (!data.ok) {
            throw new Error(data.error || data.detail || 'Request failed.');
          }
          const items = Array.isArray(data.items) ? data.items : [];
          writeTagsSessionCacheEntry(cacheKey, items);
          return items;
        } catch (err) {
          if (err && err.name === 'AbortError') {
            throw new Error('Tags request timed out. Check your connection and try again.');
          }
          throw err;
        } finally {
          if (timeoutId != null) global.clearTimeout(timeoutId);
        }
      })();
      tagsFetchInflight.set(cacheKey, promise);
      try {
        return await promise;
      } finally {
        if (tagsFetchInflight.get(cacheKey) === promise) {
          tagsFetchInflight.delete(cacheKey);
        }
      }
    }

    function setSelectOptions(select, rows, labelGetter, valueGetter, emptyLabel) {
      if (!select) return;
      select.innerHTML = '';
      const base = document.createElement('option');
      base.value = '';
      base.textContent = emptyLabel;
      select.appendChild(base);
      rows.forEach((row) => {
        const opt = document.createElement('option');
        opt.value = valueGetter(row);
        opt.textContent = labelGetter(row);
        select.appendChild(opt);
      });
    }

    function propertyLabelFromItem(p) {
      const n = p && p.attributes && p.attributes.name;
      return (n || p.id || 'Unnamed') + ' (' + String(p && p.id ? p.id : '') + ')';
    }

    function isTagsPropertySelect() {
      return !!(tagsPropertyInput && tagsPropertyInput.tagName === 'SELECT');
    }

    function setTagsPropertyFieldValue(propertyId, propertyLabel) {
      if (!tagsPropertyInput) return;
      if (isTagsPropertySelect()) {
        tagsPropertyInput.value = propertyId ? String(propertyId) : '';
        return;
      }
      tagsPropertyInput.value = propertyLabel ? String(propertyLabel) : '';
    }

    function renderPropertyOptions(query) {
      if (!tagsPropertyInput) return;
      if (isTagsPropertySelect()) {
        const keepId = String(selectedPropertyId || tagsPropertyInput.value || '').trim();
        setSelectOptions(
          tagsPropertyInput,
          allPropertyOptions,
          propertyLabelFromItem,
          (p) => String(p && p.id ? p.id : ''),
          'Select property',
        );
        if (keepId) tagsPropertyInput.value = keepId;
        return;
      }
      if (!tagsPropertyList) return;
      const q = String(query || '').trim().toLowerCase();
      tagsPropertyList.innerHTML = '';
      const matches = allPropertyOptions
        .filter((p) => {
          if (!q) return true;
          const label = propertyLabelFromItem(p).toLowerCase();
          return label.indexOf(q) !== -1;
        })
        .slice(0, 200);
      matches.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = propertyLabelFromItem(p);
        tagsPropertyList.appendChild(opt);
      });
    }

    function findPropertyFromField() {
      if (!tagsPropertyInput) return null;
      if (isTagsPropertySelect()) {
        const id = String(tagsPropertyInput.value || '').trim();
        if (!id) return null;
        return (
          allPropertyOptions.find(function (p) {
            return String(p && p.id ? p.id : '') === id;
          }) || null
        );
      }
      const raw = String(tagsPropertyInput.value || '').trim();
      if (!raw) return null;
      return findPropertyByLabel(raw);
    }

    function findPropertyByLabel(label) {
      const target = String(label || '').trim().toLowerCase();
      if (!target) return null;
      return allPropertyOptions.find((p) => propertyLabelFromItem(p).toLowerCase() === target) || null;
    }

    function tagsCompanyRowEl() {
      if (!tagsCompanySelect || typeof tagsCompanySelect.closest !== 'function') return null;
      return tagsCompanySelect.closest('.form-row');
    }

    function setTagsCompanyRowVisible(visible) {
      const row = tagsCompanyRowEl();
      if (!row) return;
      if (visible) row.removeAttribute('hidden');
      else row.setAttribute('hidden', '');
    }

    async function loadTagsCompanies() {
      if (!tagsCompanySelect) return;
      const sandboxKeyAtStart = getSandboxKey();
      if (tagsCompaniesInflightPromise && tagsCompaniesInflightKey === sandboxKeyAtStart) {
        return tagsCompaniesInflightPromise;
      }
      const loadGen = ++tagsCompaniesLoadGen;
      tagsCompaniesInflightKey = sandboxKeyAtStart;
      tagsCompaniesInflightPromise = (async function () {
        applyPersistedTagsFieldsEarly();
        try {
          setMessage('Loading Tags companies...', '');
          const items = await fetchTags('companies');
          if (!isActiveTagsCompaniesLoad(loadGen, sandboxKeyAtStart)) return;
          setSelectOptions(
            tagsCompanySelect,
            items,
            (c) => {
              const n = c && c.attributes && (c.attributes.name || c.attributes.title);
              return (n || c.id || 'Unnamed') + ' (' + String(c.id || '') + ')';
            },
            (c) => String(c && c.id ? c.id : ''),
            'Select company',
          );
          allPropertyOptions = [];
          const earlyRec = readPersistedTagsPropertySelection();
          if (earlyRec && earlyRec.propertyId) {
            selectedPropertyId = String(earlyRec.propertyId);
          } else {
            selectedPropertyId = '';
          }
          if (tagsPropertyInput && !(earlyRec && earlyRec.propertyLabel)) {
            tagsPropertyInput.value = '';
          }
          renderPropertyOptions(tagsPropertyInput ? tagsPropertyInput.value : '');
          setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
          syncSelectedScriptDisplayAfterTagsStructureChange();

          tagsSandboxReloadKey = getSandboxKey();

          const persistedCompanyId = readPersistedTagsCompanyId();
          if (
            persistedCompanyId &&
            Array.isArray(items) &&
            items.some(function (c) {
              return String(c && c.id ? c.id : '') === persistedCompanyId;
            })
          ) {
            tagsCompanySelect.value = persistedCompanyId;
            if (hideTagsCompanyUi) setTagsCompanyRowVisible(false);
            await loadTagsProperties(persistedCompanyId);
            setMessage('Tags companies loaded (restored last property for this sandbox).', 'success');
            return;
          }

          if (hideTagsCompanyUi && Array.isArray(items) && items.length > 0) {
            const pickId = String(
              (tagsCompanySelect.value && tagsCompanySelect.value.trim()) ||
                (items[0] && items[0].id ? items[0].id : ''),
            ).trim();
            if (pickId) {
              tagsCompanySelect.value = pickId;
              persistTagsCompanyId(pickId);
              setTagsCompanyRowVisible(false);
              await loadTagsProperties(pickId);
              setMessage('Tags companies loaded.', 'success');
              return;
            }
          }
          if (Array.isArray(items) && items.length === 1) {
            const onlyId = String(items[0] && items[0].id ? items[0].id : '').trim();
            if (onlyId) {
              tagsCompanySelect.value = onlyId;
              persistTagsCompanyId(onlyId);
              setTagsCompanyRowVisible(false);
              await loadTagsProperties(onlyId);
              return;
            }
          }
          setTagsCompanyRowVisible(!hideTagsCompanyUi);
          setMessage('Tags companies loaded.', 'success');
        } catch (err) {
          if (!isActiveTagsCompaniesLoad(loadGen, sandboxKeyAtStart)) return;
          setTagsCompanyRowVisible(!hideTagsCompanyUi);
          setMessage(err.message || 'Failed to load Tags companies.', 'error');
        }
      })();
      try {
        return await tagsCompaniesInflightPromise;
      } finally {
        if (tagsCompaniesInflightKey === sandboxKeyAtStart) {
          tagsCompaniesInflightPromise = null;
          tagsCompaniesInflightKey = '';
        }
      }
    }

    function applyTagsPropertyItems(items, loadGen, sandboxKeyAtStart, fromCache) {
      if (!isActiveTagsPropertiesLoad(loadGen, sandboxKeyAtStart)) return false;
      allPropertyOptions = filterPropertiesForSandbox(items, cfg);
      const prefix = resolveTagsPropertyNamePrefix(cfg);
      const earlyRec = readPersistedTagsPropertySelection();
      if (!(earlyRec && earlyRec.propertyId)) selectedPropertyId = '';
      renderPropertyOptions(tagsPropertyInput ? tagsPropertyInput.value : '');
      setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
      syncSelectedScriptDisplayAfterTagsStructureChange();
      void restorePersistedTagsPropertySelection();
      if (prefix && !allPropertyOptions.length) {
        setMessage(
          'No Tags properties starting with “' +
            prefix +
            '” for this sandbox. Check Data Collection or sandbox selection.',
          'error',
        );
      } else {
        setMessage(
          fromCache ? 'Properties loaded (cached — refreshing in background).' : 'Properties loaded.',
          'success',
        );
      }
      return true;
    }

    async function loadTagsProperties(companyId) {
      if (!tagsPropertyInput || !tagsEnvironmentSelect) return;
      if (!companyId) {
        allPropertyOptions = [];
        selectedPropertyId = '';
        tagsPropertyInput.value = '';
        renderPropertyOptions('');
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        syncSelectedScriptDisplayAfterTagsStructureChange();
        tagsPropertiesInflightKey = '';
        tagsPropertiesInflightPromise = null;
        return;
      }
      const sandboxKeyAtStart = getSandboxKey();
      const inflightKey = sandboxKeyAtStart + '|' + String(companyId);
      if (tagsPropertiesInflightPromise && tagsPropertiesInflightKey === inflightKey) {
        return tagsPropertiesInflightPromise;
      }
      const loadGen = ++tagsPropertiesLoadGen;
      tagsPropertiesInflightKey = inflightKey;
      const cacheKey = tagsReactorCacheKey('properties', companyId, '');
      const cachedItems = readTagsSessionCacheEntry(cacheKey);

      tagsPropertiesInflightPromise = (async function () {
        try {
          if (cachedItems) {
            applyTagsPropertyItems(cachedItems, loadGen, sandboxKeyAtStart, true);
          } else {
            setMessage('Loading properties...', '');
          }
          const items = await fetchTags('properties', companyId, '', cachedItems ? { networkOnly: true } : {});
          if (!isActiveTagsPropertiesLoad(loadGen, sandboxKeyAtStart)) return;
          applyTagsPropertyItems(items, loadGen, sandboxKeyAtStart, false);
        } catch (err) {
          if (!isActiveTagsPropertiesLoad(loadGen, sandboxKeyAtStart)) return;
          if (cachedItems && applyTagsPropertyItems(cachedItems, loadGen, sandboxKeyAtStart, true)) return;
          setMessage(err.message || 'Failed to load properties.', 'error');
        }
      })();
      try {
        return await tagsPropertiesInflightPromise;
      } finally {
        if (tagsPropertiesInflightKey === inflightKey) {
          tagsPropertiesInflightPromise = null;
          tagsPropertiesInflightKey = '';
        }
      }
    }

    async function loadTagsEnvironments(propertyId) {
      if (!tagsEnvironmentSelect) return;
      if (!propertyId) {
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        syncSelectedScriptDisplayAfterTagsStructureChange();
        return;
      }
      try {
        setMessage('Loading environments...', '');
        const items = await fetchTags('environments', '', propertyId);
        setSelectOptions(
          tagsEnvironmentSelect,
          items,
          (env) => {
            const label =
              env && env.name ? env.name : env && env.environmentId ? env.environmentId : 'Environment';
            const stage = env && env.stage ? ' [' + env.stage + ']' : '';
            return label + stage;
          },
          (env) => encodeURIComponent(String(env && env.scriptUrl ? env.scriptUrl : '')),
          'Select environment'
        );
        syncSelectedScriptDisplayAfterTagsStructureChange();
        await restorePersistedTagsEnvironmentSelection();
        setMessage('Environments loaded.', 'success');
      } catch (err) {
        setMessage(err.message || 'Failed to load environments.', 'error');
      }
    }

    async function applyPropertySelectionFromInput() {
      const hit = findPropertyFromField();
      if (!hit || !hit.id) {
        selectedPropertyId = '';
        persistTagsPropertySelection('', '');
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        syncSelectedScriptDisplayAfterTagsStructureChange();
        return;
      }
      const nextPropertyId = String(hit.id);
      if (nextPropertyId === selectedPropertyId) return;
      selectedPropertyId = nextPropertyId;
      persistTagsPropertySelection(selectedPropertyId, propertyLabelFromItem(hit));
      persistTagsEnvironmentEncodedValue('');
      if (!isSdkConfiguredForSandbox()) {
        persistSelectedScriptUrl('');
        renderSelectedScript('');
      }
      setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
      await loadTagsEnvironments(selectedPropertyId);
    }

    /**
     * Demo Website–style datasets require `_demoemea` with `identification.core.ecid` (DCVS-1106 if
     * missing). Failed-batch export for dataset 655cc… shows: required key [ecid] not found under
     * `core` when we sent empty `core: {}`. Alloy still attaches ECID in `identityMap`; `core.ecid`
     * must mirror the same digits for this schema. (Prior UPINGT-030075 was addressed separately;
     * if it recurs with core.ecid restored, use Identity settings / Launch rules — same ECID value.)
     */
    function xdmDemoemeaTenantForEdge(ecidDigits) {
      const id = normaliseEcidDigits(ecidDigits);
      return {
        _demoemea: {
          identification: {
            core: id ? { ecid: id } : {},
          },
        },
      };
    }

    /**
     * @param {{ phase?: string, pageNameSuffix?: string, ecid?: string }} [opts]
     */
    async function sendDemoemeaWebPageViewToEdge(alloyFn, opts) {
      const o = opts || {};
      const phase = String(o.phase || 'send');
      const suffix = String(o.pageNameSuffix || '').trim();
      const baseTitle = (global.document && global.document.title) || 'AEP lab demo';
      const pageName = suffix ? baseTitle + suffix : baseTitle;
      const tenant = xdmDemoemeaTenantForEdge(o.ecid);
      if (!tenant._demoemea.identification.core.ecid) {
        dtLog('syncEcidFromAlloy: skip sendEvent — no ECID for _demoemea.identification.core (schema requires ecid)');
        return;
      }
      // Lab: strip query from URL; human title from document.title (see mirror POST fields).
      const pageUrlNoQuery =
        global.location && global.location.href ? String(global.location.href).split('?')[0] : '';
      try {
        await alloyFn(
          'sendEvent',
          Object.assign(
            {
              xdm: Object.assign(
                {
                  eventType: 'web.webPageDetails.pageViews',
                  web: {
                    webPageDetails: {
                      name: pageName,
                      URL: pageUrlNoQuery,
                    },
                  },
                },
                tenant
              ),
            },
            labEdgeConfigOverrides()
          )
        );
        dtLog('syncEcidFromAlloy: sendEvent (page view + _demoemea.core.ecid) completed', { phase });
      } catch (e) {
        dtLog('syncEcidFromAlloy: sendEvent failed (non-fatal)', {
          phase,
          err: e && e.message ? e.message : String(e),
        });
      }
    }

    /**
     * Drawer "Last 5 events" uses GET /api/profile/events (UPS), which often lags Edge sendEvent.
     * Mirror the same anonymous page view through the lab generator so the timeline populates like
     * Premier Inn hotel.* / post-lookup application.login traffic.
     */
    async function mirrorAnonymousPageViewToGeneratorIfConfigured(ecidDigits, mirrorOpts) {
      if (!getSelectedGeneratorTarget) {
        dtLog('mirrorPageViewGenerator: skip — no getSelectedGeneratorTarget in DemoTagsInjection.init');
        return;
      }
      const target = getSelectedGeneratorTarget();
      if (!target || !target.id) {
        dtLog('mirrorPageViewGenerator: skip — no generator target (pick Event destination)');
        return;
      }
      const id = normaliseEcidDigits(ecidDigits);
      if (!id) return;
      const mo = mirrorOpts || {};
      const suffix = String(mo.pageNameSuffix || '').trim();
      // Match Edge sendEvent: document.title + optional suffix (human page label in UPS / drawer).
      const baseTitle = (global.document && global.document.title) || 'AEP lab demo';
      const pageName = suffix ? baseTitle + suffix : baseTitle;
      const pageUrl =
        (global.location && global.location.href ? String(global.location.href).split('?')[0] : '') || '';
      const body = {
        targetId: target.id,
        eventType: 'web.webPageDetails.pageViews',
        pageName: pageName,
        viewName: pageName,
        viewUrl: pageUrl,
        pageUrl: pageUrl,
        channel: 'Web',
        ecid: id,
        xdmTenantKey: '_demoemea',
        identityMapEcidKey: 'ECID',
      };
      let postBody = body;
      if (global.AepDemoGeneratorTargets && typeof global.AepDemoGeneratorTargets.augmentGeneratorPostBody === 'function') {
        postBody = global.AepDemoGeneratorTargets.augmentGeneratorPostBody(body);
      }
      try {
        const res = await fetch('/api/events/generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        });
        const data = await res.json().catch(() => ({}));
        dtLog('mirrorPageViewGenerator: POST /api/events/generator', {
          ok: res.ok,
          status: res.status,
          targetId: target.id,
        });
        if (!res.ok) {
          dtLog(
            'mirrorPageViewGenerator: error',
            data && (data.error || data.message) ? String(data.error || data.message) : '',
          );
          return;
        }
        if (global.DemoProfileDrawer && typeof global.DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function') {
          global.setTimeout(function () {
            void global.DemoProfileDrawer.refreshDrawerEventsForIdentity(id, 'ecid');
          }, 1200);
        }
      } catch (e) {
        dtLog('mirrorPageViewGenerator: fetch failed', e && e.message ? e.message : String(e));
      }
    }

    async function syncEcidFromAlloy() {
      dtLog('syncEcidFromAlloy: waiting for window.alloy (up to 12s)');
      const alloyFn = await waitForAlloy(12000);
      if (!alloyFn) {
        dtLog('syncEcidFromAlloy: alloy still missing after timeout');
        setMessage('Launch script loaded, but alloy is not available yet.', 'error');
        return '';
      }
      dtLog('syncEcidFromAlloy: alloy available — poll getIdentity (no pre-hit; empty _demoemea.core fails DCVS-1106 on this dataset)');
      try {
        await delay(200);
        let ecid = '';
        for (let i = 0; i < 7; i++) {
          let result = null;
          try {
            result = await alloyFn('getIdentity', { namespaces: ['ECID'] });
          } catch (e1) {
            dtLog('syncEcidFromAlloy: namespaced getIdentity error', e1 && e1.message ? e1.message : String(e1));
          }
          ecid = extractEcid(result);
          if (!ecid) {
            try {
              result = await alloyFn('getIdentity');
            } catch (e2) {
              dtLog('syncEcidFromAlloy: plain getIdentity error', e2 && e2.message ? e2.message : String(e2));
              result = null;
            }
            ecid = extractEcid(result);
          }
          dtLog('syncEcidFromAlloy: getIdentity attempt', {
            attempt: i + 1,
            ecidFound: !!ecid,
            resultKeys: result && typeof result === 'object' ? Object.keys(result).slice(0, 12) : typeof result,
          });
          if (ecid) break;
          await delay(500);
        }
        if (!ecid) {
          dtLog('syncEcidFromAlloy: no ECID after retries (Launch may not configure Alloy on this document)');
          setMessage('No ECID returned yet from alloy.getIdentity after retry.', 'error');
          return '';
        }
        if (infoEcidEl) infoEcidEl.textContent = ecid;
        persistLastResolvedEcid(ecid);
        await sendDemoemeaWebPageViewToEdge(alloyFn, {
          phase: 'post-ecid-anonymous',
          ecid: ecid,
        });
        void mirrorAnonymousPageViewToGeneratorIfConfigured(ecid);
        if (global.DemoProfileDrawer && typeof global.DemoProfileDrawer.patchLastProfileOrUpdate === 'function') {
          global.DemoProfileDrawer.patchLastProfileOrUpdate({
            ecid: ecid,
            identities: [{ namespace: 'ECID', value: ecid }],
          });
        }
        if (
          global.DemoProfileDrawer &&
          typeof global.DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function'
        ) {
          void global.DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
          global.setTimeout(function () {
            void global.DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
          }, 2500);
          global.setTimeout(function () {
            void global.DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
          }, 8000);
        }
        if (typeof cfg.onEcidResolved === 'function') cfg.onEcidResolved(ecid);
        if (global.EmbedBcAepEvents && typeof global.EmbedBcAepEvents.install === 'function') {
          global.EmbedBcAepEvents.install(global);
        }
        const bcCfg = resolveBrandConciergeCfg();
        if (
          bcCfg &&
          !bcCfg.suppressEnable &&
          global.AepBcToggle &&
          typeof global.AepBcToggle.enable === 'function'
        ) {
          dtLog('syncEcidFromAlloy: enabling Brand Concierge', { styleKey: bcCfg.styleKey });
          global.AepBcToggle.enable(bcCfg.styleKey);
        }
        setMessage('ECID resolved from Web SDK and linked to drawer context.', 'success');
        return ecid;
      } catch (err) {
        setMessage(err.message || 'ECID fetch failed.', 'error');
        return '';
      }
    }

    async function injectSelectedScriptNow(scriptOverride, injectOpts) {
      const opts = injectOpts || {};
      const silentResume = opts.silentResume === true;
      const rawOverride = scriptOverride || selectedScriptUrl;
      const scriptUrl = sanitiseLaunchScriptUrl(rawOverride);
      releaseBcSuppressForActiveInject();
      dtLog('injectSelectedScriptNow: start', {
        sandboxKey: getSandboxKey(),
        rawPreview: dtPreview(rawOverride),
        sanitisedOk: !!scriptUrl,
        sanitisedPreview: dtPreview(scriptUrl),
      });
      if (!scriptUrl) return false;

      if (injectSdkBtn) injectSdkBtn.disabled = true;
      try {
        setMessage('Injecting selected Launch script...', '');
        const mainId = storagePrefix + 'LaunchScript';
        const busted = withCacheBust(scriptUrl);
        dtLog('injectSelectedScriptNow: injecting into parent document', { scriptId: mainId, url: dtPreview(busted) });
        await injectScriptIntoDocument(document, busted, mainId);
        dtLog('injectSelectedScriptNow: parent document script onload OK');

        for (let i = 0; i < iframes.length; i++) {
          const frame = iframes[i];
          if (!frame || !frame.contentDocument || !frame.contentDocument.head) {
            dtLog('injectSelectedScriptNow: skip iframe (no document/head)', { index: i, frameId: frame && frame.id });
            continue;
          }
          try {
            const fid = storagePrefix + 'LaunchScriptFrame' + i;
            dtLog('injectSelectedScriptNow: injecting into iframe', { index: i, frameId: frame.id, scriptId: fid });
            await injectScriptIntoDocument(frame.contentDocument, withCacheBust(scriptUrl), fid);
            dtLog('injectSelectedScriptNow: iframe script onload OK', { index: i });
          } catch (iframeErr) {
            dtLog('injectSelectedScriptNow: iframe inject failed (non-fatal)', {
              index: i,
              message: iframeErr && iframeErr.message ? iframeErr.message : String(iframeErr),
            });
          }
        }

        renderSelectedScript(scriptUrl);
        persistSelectedScriptUrl(scriptUrl);
        const ecid = await syncEcidFromAlloy();
        const wp = resolveWebPushCfg();
        if (
          ecid &&
          wp &&
          wp.subscribeAfterInject &&
          global.AepDemoWebPush &&
          typeof global.AepDemoWebPush.sendPushSubscriptionIfReady === 'function'
        ) {
          void global.AepDemoWebPush.sendPushSubscriptionIfReady({
            storagePrefix: wp.storagePrefix,
            workerScriptUrl: wp.workerScriptUrl,
            scope: wp.scope,
            requestPermission: wp.requestPermissionOnInject,
            skipDailyThrottle: wp.skipDailyThrottleOnInject,
          });
        }
        markSdkConfiguredForSandbox(true);
        markTagsInjectedSession(scriptUrl);
        if (silentResume) {
          setSdkConfigExpanded(false);
        } else {
          setSdkConfigExpanded(false);
        }
        syncSiteCloneBcDisplayAfterInject();
        dtLog(
          silentResume
            ? 'injectSelectedScriptNow: complete (configured, collapsed toolbar)'
            : 'injectSelectedScriptNow: complete (configured, summary shown — collapse overlay when done)',
        );
        return true;
      } catch (err) {
        dtLog('injectSelectedScriptNow: FAILED', err && err.message ? err.message : String(err));
        setMessage(err.message || 'Script injection failed.', 'error');
        return false;
      } finally {
        if (injectSdkBtn) injectSdkBtn.disabled = false;
      }
    }

    function injectSelectedScript() {
      if (global.__aepTagsInjectViaButtonClick !== true) {
        dtLog('injectSelectedScript: blocked — reload inject requires explicit Inject button click');
        return;
      }
      const raw = selectedScriptUrl;
      const scriptUrl = sanitiseLaunchScriptUrl(raw);
      dtLog('injectSelectedScript (reload path): click', {
        sandboxKey: getSandboxKey(),
        rawSelectedPreview: dtPreview(raw),
        sanitisedOk: !!scriptUrl,
        sanitisedPreview: dtPreview(scriptUrl),
      });
      if (!scriptUrl) {
        dtLog('injectSelectedScript: abort — sanitise returned empty (pick a Tags environment with a valid assets.adobedtm.com URL)');
        setMessage('Select a valid Tags environment script first.', 'error');
        return;
      }
      markInjectGuardActive();
      markPendingLaunchInject(scriptUrl);
      persistSelectedScriptUrl(scriptUrl);
      setMessage('Reloading page with cache-busted script injection...', '');
      reloadPageForLaunchInjection();
    }

    async function stitchEmailToEcid(email, ecid) {
      const alloyFn = await waitForAlloy(8000);
      if (!alloyFn) return false;
      if (!email || !ecid) return false;
      try {
        await alloyFn('sendEvent', {
          xdm: {
            eventType: identityEventType,
            identityMap: {
              ECID: [{ id: ecid, authenticatedState: 'authenticated', primary: true }],
              Email: [{ id: email, authenticatedState: 'authenticated', primary: false }],
            },
          },
        });
        return true;
      } catch {
        return false;
      }
    }

    async function stitchAfterProfileLookup(profile, fallbackIdentifier) {
      const ecid = resolveKnownEcid(profile, infoEcidEl);
      const email = resolveKnownEmail(profile, fallbackIdentifier);
      if (!email || !ecid) return false;
      return stitchEmailToEcid(email, ecid);
    }

    function isUserEnvPanelOpen() {
      if (!global.EnvBarCompact) return false;
      if (typeof global.EnvBarCompact.isOpen === 'function' && global.EnvBarCompact.isOpen()) return true;
      if (typeof global.EnvBarCompact.isPinned === 'function' && global.EnvBarCompact.isPinned()) return true;
      return false;
    }

    function applySandboxConfigState(options) {
      if (global.__aepApplySandboxConfigStateInProgress) return;
      global.__aepApplySandboxConfigStateInProgress = true;
      try {
        const opts = options || {};
        const persistedScript = sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl());
        let configured = isSdkConfiguredForSandbox() || isCrossTabSdkConfiguredForSandbox();
        if (configured && !persistedScript) {
          if (isSdkConfiguredForSandbox()) {
            markSdkConfiguredForSandbox(false);
          }
          configured = false;
        }
        const overlayOpen = isUserEnvPanelOpen();
        const presenterMode =
          global.EnvBarCompact &&
          typeof global.EnvBarCompact.isArmcomPresenterMode === 'function' &&
          global.EnvBarCompact.isArmcomPresenterMode();
        const keepPanelOpen = !!(opts.announceSandboxChange && overlayOpen);
        const preserveEditing = !!opts.preserveEditing || (overlayOpen && !presenterMode);
        const expandFields = presenterMode
          ? false
          : !configured || keepPanelOpen || preserveEditing || !persistedScript;
        const skipConfiguredSignals =
          keepPanelOpen ||
          preserveEditing ||
          !!opts.skipConfiguredSignals ||
          (!overlayOpen && configured);
        setSdkConfigExpanded(expandFields, {
          skipConfiguredSignals: skipConfiguredSignals,
        });
        if (configured && persistedScript) {
          if (!isSdkConfiguredForSandbox()) {
            markSdkConfiguredForSandbox(true);
            persistSelectedScriptUrl(persistedScript);
          }
          markLabEnvConfiguredSession();
        }
        renderSelectedScript(persistedScript);
        if (opts.announceSandboxChange) {
          if (configured) {
            setMessage('Sandbox changed. Existing SDK config found for this sandbox.', 'success');
          } else {
            setMessage('Sandbox changed. Configure SDK injection for this sandbox.', '');
          }
        }
      } finally {
        global.__aepApplySandboxConfigStateInProgress = false;
      }
    }

    let tagsListenersBound = false;
    function bindTagsListenersOnce() {
      if (tagsListenersBound) return;
      refreshTagsDom();
      if (!tagsDomReady()) return;
      tagsListenersBound = true;

      if (tagsCompanySelect) {
        tagsCompanySelect.addEventListener('change', function () {
          const companyId = String(tagsCompanySelect.value || '').trim();
          persistTagsCompanyId(companyId);
          void loadTagsProperties(companyId);
        });
      }

      if (tagsPropertyInput) {
        tagsPropertyInput.addEventListener('change', function () {
          void applyPropertySelectionFromInput();
        });
        if (!isTagsPropertySelect()) {
          tagsPropertyInput.addEventListener('input', function () {
            renderPropertyOptions(tagsPropertyInput.value || '');
          });
          tagsPropertyInput.addEventListener('blur', function () {
            void applyPropertySelectionFromInput();
          });
          tagsPropertyInput.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            void applyPropertySelectionFromInput();
          });
        }
      }

      if (tagsEnvironmentSelect) {
        tagsEnvironmentSelect.addEventListener('change', function () {
          const raw = String(tagsEnvironmentSelect.value || '').trim();
          let decoded = raw;
          try {
            decoded = decodeURIComponent(raw);
          } catch {
            decoded = raw;
          }
          const clean = sanitiseLaunchScriptUrl(decoded);
          dtLog('tagsEnvironmentSelect: change', {
            optionLabel:
              tagsEnvironmentSelect.selectedIndex >= 0
                ? String(tagsEnvironmentSelect.options[tagsEnvironmentSelect.selectedIndex].textContent || '').trim()
                : '',
            rawValueLen: raw.length,
            decodedPreview: dtPreview(decoded),
            sanitisedOk: !!clean,
            sanitisedPreview: dtPreview(clean),
          });
          renderSelectedScript(clean);
          persistSelectedScriptUrl(clean);
          persistTagsEnvironmentEncodedValue(raw);
        });
      }

      if (injectSdkBtn) {
        injectSdkBtn.addEventListener('click', function () {
          dtLog('injectSdkBtn: click', { buttonId: cfg.injectButtonId });
          global.__aepTagsInjectViaButtonClick = true;
          try {
            injectSelectedScript();
          } finally {
            global.__aepTagsInjectViaButtonClick = false;
          }
        });
      }

      if (changeSdkConfigBtn) {
        changeSdkConfigBtn.addEventListener('click', function () {
          markSdkConfiguredForSandbox(false);
          clearTagsInjectedSessionForSandbox();
          clearLastResolvedEcidForSandbox();
          setSdkConfigExpanded(true);
          requestEnvOverlayOpen();
          setMessage('SDK config reopened for this sandbox.', '');
        });
      }
    }

    function scheduleTagsReloadForSandbox(options) {
      const opts = options || {};
      const nextKey = getSandboxKey();
      if (!opts.force && nextKey === tagsSandboxReloadKey && tagsCompaniesLoadGen > 0) {
        refreshTagsDom();
        applyPersistedTagsFieldsEarly();
        if (opts.announceSandboxChange) {
          applySandboxConfigState({ announceSandboxChange: true });
        }
        const companyId = tagsCompanySelect ? String(tagsCompanySelect.value || '').trim() : '';
        if (companyId) {
          void loadTagsProperties(companyId);
        } else {
          void loadTagsCompanies();
        }
        return;
      }
      clearTimeout(tagsSandboxReloadTimer);
      tagsSandboxReloadTimer = setTimeout(function () {
        tagsSandboxReloadTimer = null;
        tagsSandboxReloadKey = getSandboxKey();
        refreshTagsDom();
        applyPersistedTagsFieldsEarly();
        if (opts.announceSandboxChange) {
          applySandboxConfigState({ announceSandboxChange: true });
        }
        void loadTagsCompanies();
      }, 0);
    }

    function isArmcomPresenterBootstrap() {
      return !!(
        global.ArmcomLinkedInReturn &&
        typeof global.ArmcomLinkedInReturn.isLinkedInReturnVisit === 'function' &&
        global.ArmcomLinkedInReturn.isLinkedInReturnVisit() &&
        typeof global.ArmcomLinkedInReturn.isPresenterBootstrapComplete === 'function' &&
        !global.ArmcomLinkedInReturn.isPresenterBootstrapComplete()
      );
    }

    function shouldSkipTagsPrefsSyncReload() {
      if (isUserEnvPanelOpen()) return true;
      if (isArmcomPresenterBootstrap()) return true;
      if (
        global.EnvBarCompact &&
        typeof global.EnvBarCompact.isArmcomPresenterMode === 'function' &&
        global.EnvBarCompact.isArmcomPresenterMode() &&
        (isSdkConfiguredForSandbox() || isCrossTabSdkConfiguredForSandbox())
      ) {
        return true;
      }
      return false;
    }

    function applyTagsPrefsAfterSyncNow() {
      refreshTagsDom();
      applyPersistedTagsFieldsEarly();
      if (shouldSkipTagsPrefsSyncReload()) {
        applySandboxConfigState({ preserveEditing: true, skipConfiguredSignals: true });
        return;
      }
      applySandboxConfigState({ preserveEditing: true });
      const companyId = tagsCompanySelect ? String(tagsCompanySelect.value || '').trim() : '';
      if (companyId) {
        void loadTagsProperties(companyId);
        return;
      }
      void loadTagsCompanies();
    }

    function applyTagsPrefsAfterSync() {
      clearTimeout(tagsPrefsSyncTimer);
      tagsPrefsSyncTimer = setTimeout(function () {
        tagsPrefsSyncTimer = null;
        applyTagsPrefsAfterSyncNow();
      }, 80);
    }

    global.addEventListener('aep-global-sandbox-change', function () {
      scheduleTagsReloadForSandbox({ announceSandboxChange: true });
    });

    global.addEventListener('aep-lab-env-bar-prefs-synced', function () {
      if (!tagsDomReady()) return;
      if (!tagsListenersBound) bindTagsListenersOnce();
      applyTagsPrefsAfterSync();
    });

    global.addEventListener('aep-lab-env-overlay-state', function (ev) {
      if (!tagsDomReady()) return;
      if (!tagsListenersBound) bindTagsListenersOnce();
      const detail = ev && ev.detail ? ev.detail : {};
      if (detail.open) {
        applySandboxConfigState({ preserveEditing: true });
      } else {
        applySandboxConfigState({ skipConfiguredSignals: true });
      }
    });

    if (!global[storagePrefix + 'EdgeDatastreamListener']) {
      global[storagePrefix + 'EdgeDatastreamListener'] = true;
      global.addEventListener('aep-lab-edge-datastream-changed', function () {
        if (!isSdkConfiguredForSandbox()) return;
        dtLog('edge datastream changed — re-send lab page view with new edgeConfigOverrides');
        void syncEcidFromAlloy();
      });
    }

    let tagsBootStarted = false;
    function runTagsBoot() {
      if (tagsBootStarted) return true;
      refreshTagsDom();
      if (!tagsDomReady()) {
        dtLog('init: defer boot — Tags DOM not mounted yet', {
          tagsCompanyId: cfg.tagsCompanyId,
          tagsPropertyInputId: cfg.tagsPropertyInputId,
        });
        return false;
      }
      tagsBootStarted = true;
      bindTagsListenersOnce();
      applyPersistedTagsFieldsEarly();

      dtLog('init: boot', {
        sandboxKey: getSandboxKey(),
        iframeCount: iframes.length,
        injectButtonId: cfg.injectButtonId,
        pendingSessionKey: pendingSessionKey,
      });
      const pendingScriptInject = sanitiseLaunchScriptUrl(consumePendingLaunchInject());
      if (pendingScriptInject) {
        dtLog('init: post-reload pending inject branch', { preview: dtPreview(pendingScriptInject) });
        restoreInjectSandboxIfNeeded();
        renderSelectedScript(pendingScriptInject);
        persistSelectedScriptUrl(pendingScriptInject);
        void injectSelectedScriptNow(pendingScriptInject).finally(function () {
          finishInjectFlow();
          void loadTagsCompanies();
        });
      } else {
        dtLog('init: no pending inject — applySandboxConfigState');
        applySandboxConfigState();
        const persistedResume = resolvePersistedLaunchScriptForResume();
        if (shouldResumeSdkInjectionOnReload() && persistedResume) {
          const cachedEcid = readLastResolvedEcid();
          if (cachedEcid && infoEcidEl) {
            const cur = String(infoEcidEl.textContent || '').trim();
            if (!cur || cur === '—' || cur === '-' || cur.length < 10) {
              infoEcidEl.textContent = cachedEcid;
              setMessage('Restoring Web SDK — last lab ECID shown until getIdentity refreshes.', '');
            }
          }
          void startAutoResumeOnReload().finally(function () {
            void loadTagsCompanies();
          });
        } else {
          void loadTagsCompanies();
        }
      }
      return true;
    }

    function scheduleTagsBootRetry() {
      function stopRetry() {
        document.removeEventListener('DOMContentLoaded', retry);
        global.removeEventListener('aep-demo-env-strip-mounted', retry);
        global.removeEventListener('env-bar-change', onEnvBarChange);
      }
      function retry() {
        if (runTagsBoot()) stopRetry();
      }
      function onEnvBarChange(ev) {
        if (ev && ev.detail && ev.detail.type === 'init') retry();
      }
      document.addEventListener('DOMContentLoaded', retry);
      global.addEventListener('aep-demo-env-strip-mounted', retry);
      global.addEventListener('env-bar-change', onEnvBarChange);
    }

    if (!runTagsBoot()) {
      scheduleTagsBootRetry();
    }

    const webPushCfgEarly = resolveWebPushCfg();
    if (
      webPushCfgEarly &&
      global.AepDemoWebPush &&
      typeof global.AepDemoWebPush.ensureServiceWorkerRegistered === 'function'
    ) {
      void global.AepDemoWebPush.ensureServiceWorkerRegistered(webPushCfgEarly);
    }

    return {
      stitchAfterProfileLookup,
      applySandboxConfigState,
      syncEcidFromAlloy,
    };
  }

  global.DemoTagsInjection = {
    init: createInstance,
    waitForAlloy: waitForAlloy,
    ensureAlloyReady: ensureAlloyReady,
    isAlloyReady: function () {
      return !!isAlloyOnWindow();
    },
  };

  global.AepLabTagsInjectGuard = {
    isInProgress: isTagsInjectInProgress,
    getSandboxSnapshot: readTagsInjectSandboxSnapshot,
    resolveStoragePrefix: resolvePageStoragePrefix,
  };

  global.AepLabTagsInjectSession = {
    sessionKey: tagsInjectedSessionStorageKey,
    localKey: tagsInjectedLocalStorageKey,
    readScript: readTagsInjectedSessionScript,
    writeScript: writeTagsInjectedSessionScript,
    readLocalScript: readTagsInjectedLocalScript,
    writeLocalScript: writeTagsInjectedLocalScript,
    readLabEnvConfiguredLocal: readLabEnvConfiguredLocal,
    writeLabEnvConfiguredLocal: writeLabEnvConfiguredLocal,
    labEnvConfiguredLocalKey: labEnvConfiguredLocalStorageKey,
    keysToPreserveOnIdentityReset: sessionKeysToPreserveOnIdentityReset,
  };

  global.DemoLabEdgeConfig = {
    readDatastreamId: readLabEdgeDatastreamOverrideFromStorage,
    edgeConfigOverrides: labEdgeConfigOverrides,
  };
})(window);
