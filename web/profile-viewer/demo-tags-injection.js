/* Shared Tags/Launch injection flow for demo pages.
 * One-time per-sandbox config, reload-based injection with cache busting, and ECID/email stitching helpers.
 */
(function attachDemoTagsInjection(global) {
  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function readStorageMap(key) {
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

  function waitForAlloy(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      function poll() {
        if (typeof global.alloy === 'function') {
          resolve(global.alloy);
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

  function extractEcid(result) {
    if (!result || typeof result !== 'object') return '';
    const identity = result.identity || {};
    if (identity.ECID && Array.isArray(identity.ECID) && identity.ECID[0] && identity.ECID[0].id) {
      return String(identity.ECID[0].id);
    }
    if (identity.ecid && Array.isArray(identity.ecid) && identity.ecid[0] && identity.ecid[0].id) {
      return String(identity.ecid[0].id);
    }
    if (result.id) return String(result.id);
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
    if (profile && profile.ecid) return String(profile.ecid).trim();
    if (profile && Array.isArray(profile.identities)) {
      const found = profile.identities.find((id) => String(id.namespace || '').toLowerCase() === 'ecid');
      if (found && found.value) return String(found.value).trim();
    }
    const ui = infoEcidEl ? String(infoEcidEl.textContent || '').trim() : '';
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
    const identityEventType = String(cfg.identityEventType || 'demo.identity.stitch');

    const injectSdkBtn = byId(cfg.injectButtonId);
    const selectedScriptEl = byId(cfg.selectedScriptId);
    const tagsCompanySelect = byId(cfg.tagsCompanyId);
    const tagsPropertyInput = byId(cfg.tagsPropertyInputId);
    const tagsPropertyList = byId(cfg.tagsPropertyListId);
    const tagsEnvironmentSelect = byId(cfg.tagsEnvironmentId);
    const sdkConfigFields = byId(cfg.configFieldsId);
    const sdkConfigSummary = byId(cfg.configSummaryId);
    const sdkConfigSummaryText = byId(cfg.configSummaryTextId);
    const changeSdkConfigBtn = byId(cfg.changeConfigButtonId);
    const infoEcidEl = byId(cfg.infoEcidId);

    const iframeIds = Array.isArray(cfg.iframeIds) ? cfg.iframeIds : [];
    const iframes = iframeIds.map(byId).filter(Boolean);

    const setMessage = typeof cfg.messageSetter === 'function' ? cfg.messageSetter : function () {};

    let selectedScriptUrl = '';
    let allPropertyOptions = [];
    let selectedPropertyId = '';

    function renderSelectedScript(url) {
      selectedScriptUrl = url || '';
      if (!selectedScriptEl) return;
      selectedScriptEl.textContent = selectedScriptUrl || 'None';
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
      return String(map[getSandboxKey()] || '').trim();
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

    function setSdkConfigExpanded(expanded) {
      if (sdkConfigFields) sdkConfigFields.hidden = !expanded;
      if (sdkConfigSummary) sdkConfigSummary.hidden = expanded;
      if (sdkConfigSummaryText) {
        const sb = getSandboxName() || 'default sandbox';
        const script = selectedScriptUrl || 'no script selected';
        sdkConfigSummaryText.textContent = 'SDK configured for ' + sb + ' (' + script + ').';
      }
      try {
        global.dispatchEvent(
          new CustomEvent('aep-demo-tags-ui-state', { detail: { tagFieldsExpanded: !!expanded } })
        );
      } catch (e) {
        /* noop */
      }
    }

    function markPendingLaunchInject(url) {
      try {
        sessionStorage.setItem(pendingSessionKey, String(url || '').trim());
      } catch {
        /* noop */
      }
    }

    function consumePendingLaunchInject() {
      try {
        const v = String(sessionStorage.getItem(pendingSessionKey) || '').trim();
        sessionStorage.removeItem(pendingSessionKey);
        return v;
      } catch {
        return '';
      }
    }

    function reloadPageForLaunchInjection() {
      try {
        const u = new URL(global.location.href);
        u.searchParams.set(storagePrefix + 'LaunchReload', String(Date.now()));
        global.location.replace(u.toString());
      } catch {
        global.location.reload();
      }
    }

    async function fetchTags(resource, companyId, propertyId) {
      const res = await fetch(tagsApiUrl(resource, companyId, propertyId));
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        throw new Error(data.error || data.detail || 'Request failed.');
      }
      return Array.isArray(data.items) ? data.items : [];
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

    function renderPropertySuggestions(query) {
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

    function findPropertyByLabel(label) {
      const target = String(label || '').trim().toLowerCase();
      if (!target) return null;
      return allPropertyOptions.find((p) => propertyLabelFromItem(p).toLowerCase() === target) || null;
    }

    async function loadTagsCompanies() {
      if (!tagsCompanySelect) return;
      try {
        setMessage('Loading Tags companies...', '');
        const items = await fetchTags('companies');
        setSelectOptions(
          tagsCompanySelect,
          items,
          (c) => {
            const n = c && c.attributes && (c.attributes.name || c.attributes.title);
            return (n || c.id || 'Unnamed') + ' (' + String(c.id || '') + ')';
          },
          (c) => String(c && c.id ? c.id : ''),
          'Select company'
        );
        allPropertyOptions = [];
        selectedPropertyId = '';
        if (tagsPropertyInput) tagsPropertyInput.value = '';
        renderPropertySuggestions('');
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        renderSelectedScript('');
        setMessage('Tags companies loaded.', 'success');
      } catch (err) {
        setMessage(err.message || 'Failed to load Tags companies.', 'error');
      }
    }

    async function loadTagsProperties(companyId) {
      if (!tagsPropertyInput || !tagsEnvironmentSelect) return;
      if (!companyId) {
        allPropertyOptions = [];
        selectedPropertyId = '';
        tagsPropertyInput.value = '';
        renderPropertySuggestions('');
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        renderSelectedScript('');
        return;
      }
      try {
        setMessage('Loading properties...', '');
        const items = await fetchTags('properties', companyId, '');
        allPropertyOptions = items;
        selectedPropertyId = '';
        tagsPropertyInput.value = '';
        renderPropertySuggestions('');
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        renderSelectedScript('');
        setMessage('Properties loaded.', 'success');
      } catch (err) {
        setMessage(err.message || 'Failed to load properties.', 'error');
      }
    }

    async function loadTagsEnvironments(propertyId) {
      if (!tagsEnvironmentSelect) return;
      if (!propertyId) {
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        renderSelectedScript('');
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
        renderSelectedScript('');
        setMessage('Environments loaded.', 'success');
      } catch (err) {
        setMessage(err.message || 'Failed to load environments.', 'error');
      }
    }

    async function applyPropertySelectionFromInput() {
      const raw = tagsPropertyInput ? String(tagsPropertyInput.value || '').trim() : '';
      if (!raw) {
        selectedPropertyId = '';
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        renderSelectedScript('');
        return;
      }
      const hit = findPropertyByLabel(raw);
      if (!hit || !hit.id) {
        selectedPropertyId = '';
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        renderSelectedScript('');
        return;
      }
      const nextPropertyId = String(hit.id);
      if (nextPropertyId === selectedPropertyId) return;
      selectedPropertyId = nextPropertyId;
      await loadTagsEnvironments(selectedPropertyId);
    }

    async function syncEcidFromAlloy() {
      const alloyFn = await waitForAlloy(12000);
      if (!alloyFn) {
        setMessage('Launch script loaded, but alloy is not available yet.', 'error');
        return '';
      }
      try {
        let ecid = '';
        for (let i = 0; i < 7; i++) {
          const result = await alloyFn('getIdentity', { namespaces: ['ECID'] });
          ecid = extractEcid(result);
          if (ecid) break;
          await delay(500);
        }
        if (!ecid) {
          setMessage('No ECID returned yet from alloy.getIdentity after retry.', 'error');
          return '';
        }
        if (infoEcidEl) infoEcidEl.textContent = ecid;
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
        }
        if (typeof cfg.onEcidResolved === 'function') cfg.onEcidResolved(ecid);
        setMessage('ECID resolved from Web SDK and linked to drawer context.', 'success');
        return ecid;
      } catch (err) {
        setMessage(err.message || 'ECID fetch failed.', 'error');
        return '';
      }
    }

    async function injectSelectedScriptNow(scriptOverride) {
      const scriptUrl = sanitiseLaunchScriptUrl(scriptOverride || selectedScriptUrl);
      if (!scriptUrl) return false;

      if (injectSdkBtn) injectSdkBtn.disabled = true;
      try {
        setMessage('Injecting selected Launch script...', '');
        await injectScriptIntoDocument(document, withCacheBust(scriptUrl), storagePrefix + 'LaunchScript');

        for (let i = 0; i < iframes.length; i++) {
          const frame = iframes[i];
          if (!frame || !frame.contentDocument || !frame.contentDocument.head) continue;
          try {
            await injectScriptIntoDocument(
              frame.contentDocument,
              withCacheBust(scriptUrl),
              storagePrefix + 'LaunchScriptFrame' + i
            );
          } catch {
            /* Do not fail main flow on iframe injection misses */
          }
        }

        await syncEcidFromAlloy();
        markSdkConfiguredForSandbox(true);
        setSdkConfigExpanded(false);
        return true;
      } catch (err) {
        setMessage(err.message || 'Script injection failed.', 'error');
        return false;
      } finally {
        if (injectSdkBtn) injectSdkBtn.disabled = false;
      }
    }

    function injectSelectedScript() {
      const scriptUrl = sanitiseLaunchScriptUrl(selectedScriptUrl);
      if (!scriptUrl) {
        setMessage('Select a valid Tags environment script first.', 'error');
        return;
      }
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

    function applySandboxConfigState(options) {
      const opts = options || {};
      const persistedScript = sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl());
      renderSelectedScript(persistedScript);
      const configured = isSdkConfiguredForSandbox();
      setSdkConfigExpanded(!configured);
      if (opts.announceSandboxChange) {
        if (configured) {
          setMessage('Sandbox changed. Existing SDK config found for this sandbox.', 'success');
        } else {
          setMessage('Sandbox changed. Configure SDK injection for this sandbox.', '');
        }
      }
    }

    if (tagsCompanySelect) {
      tagsCompanySelect.addEventListener('change', function () {
        const companyId = String(tagsCompanySelect.value || '').trim();
        void loadTagsProperties(companyId);
      });
    }

    if (tagsPropertyInput) {
      tagsPropertyInput.addEventListener('input', function () {
        renderPropertySuggestions(tagsPropertyInput.value || '');
        void applyPropertySelectionFromInput();
      });
      tagsPropertyInput.addEventListener('change', function () {
        void applyPropertySelectionFromInput();
      });
      tagsPropertyInput.addEventListener('blur', function () {
        void applyPropertySelectionFromInput();
      });
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
        renderSelectedScript(clean);
        persistSelectedScriptUrl(clean);
      });
    }

    if (injectSdkBtn) {
      injectSdkBtn.addEventListener('click', function () {
        injectSelectedScript();
      });
    }

    if (changeSdkConfigBtn) {
      changeSdkConfigBtn.addEventListener('click', function () {
        markSdkConfiguredForSandbox(false);
        setSdkConfigExpanded(true);
        setMessage('SDK config reopened for this sandbox.', '');
      });
    }

    global.addEventListener('aep-global-sandbox-change', function () {
      applySandboxConfigState({ announceSandboxChange: true });
      void loadTagsCompanies();
    });

    const pendingScriptInject = sanitiseLaunchScriptUrl(consumePendingLaunchInject());
    if (pendingScriptInject) {
      renderSelectedScript(pendingScriptInject);
      void injectSelectedScriptNow(pendingScriptInject);
    } else {
      applySandboxConfigState();
    }
    void loadTagsCompanies();

    return {
      stitchAfterProfileLookup,
      applySandboxConfigState,
      syncEcidFromAlloy,
    };
  }

  global.DemoTagsInjection = {
    init: createInstance,
  };
})(window);
