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

    var DT_LOG = '[DemoTagsInjection:' + storagePrefix + ']';
    function dtLog() {
      if (typeof global.console === 'undefined' || !global.console.log) return;
      try {
        var a = [DT_LOG].concat(Array.prototype.slice.call(arguments));
        global.console.log.apply(global.console, a);
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
        syncSelectedScriptDisplayAfterTagsStructureChange();

        if (Array.isArray(items) && items.length === 1) {
          const onlyId = String(items[0] && items[0].id ? items[0].id : '').trim();
          if (onlyId) {
            tagsCompanySelect.value = onlyId;
            setTagsCompanyRowVisible(false);
            await loadTagsProperties(onlyId);
            return;
          }
        }
        setTagsCompanyRowVisible(true);
        setMessage('Tags companies loaded.', 'success');
      } catch (err) {
        setTagsCompanyRowVisible(true);
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
        syncSelectedScriptDisplayAfterTagsStructureChange();
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
        syncSelectedScriptDisplayAfterTagsStructureChange();
        setMessage('Properties loaded.', 'success');
      } catch (err) {
        setMessage(err.message || 'Failed to load properties.', 'error');
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
        syncSelectedScriptDisplayAfterTagsStructureChange();
        return;
      }
      const hit = findPropertyByLabel(raw);
      if (!hit || !hit.id) {
        selectedPropertyId = '';
        setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
        syncSelectedScriptDisplayAfterTagsStructureChange();
        return;
      }
      const nextPropertyId = String(hit.id);
      if (nextPropertyId === selectedPropertyId) return;
      selectedPropertyId = nextPropertyId;
      await loadTagsEnvironments(selectedPropertyId);
    }

    /**
     * Edge / Demo Website datasets often require a root `_demoemea` object (DCVS-1106 if missing).
     * Navigator lab CTAs use `_demosystem5` via the Event generator only; Web SDK hits use this tenant.
     */
    function xdmDemoemeaShellForEdge() {
      return {
        _demoemea: {
          identification: {
            core: {},
          },
        },
      };
    }

    async function primeAlloyIdentityOnEdge(alloyFn) {
      try {
        const shell = xdmDemoemeaShellForEdge();
        await alloyFn('sendEvent', {
          xdm: Object.assign(
            {
              eventType: 'web.webPageDetails.pageViews',
              web: {
                webPageDetails: {
                  name: (global.document && global.document.title) || 'AEP lab demo',
                  URL: (global.location && global.location.href) || '',
                },
              },
            },
            shell
          ),
        });
        dtLog('syncEcidFromAlloy: priming sendEvent (page view + _demoemea shell) completed');
      } catch (e) {
        dtLog('syncEcidFromAlloy: priming sendEvent failed (non-fatal)', e && e.message ? e.message : String(e));
      }
    }

    async function sendAlloyDemoemeaVisitorPageViewWithEcid(alloyFn, ecid) {
      const id = String(ecid || '').trim();
      if (!id) return;
      try {
        await alloyFn('sendEvent', {
          xdm: {
            eventType: 'web.webPageDetails.pageViews',
            web: {
              webPageDetails: {
                name: (global.document && global.document.title) || 'AEP lab demo',
                URL: (global.location && global.location.href) || '',
              },
            },
            _demoemea: {
              identification: {
                core: { ecid: id },
              },
            },
          },
        });
        dtLog('syncEcidFromAlloy: sendEvent with _demoemea.identification.core.ecid completed');
      } catch (e) {
        dtLog('syncEcidFromAlloy: demoemea ECID sendEvent failed (non-fatal)', e && e.message ? e.message : String(e));
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
      dtLog('syncEcidFromAlloy: alloy available — prime edge then poll getIdentity');
      try {
        await primeAlloyIdentityOnEdge(alloyFn);
        await delay(400);
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
        await sendAlloyDemoemeaVisitorPageViewWithEcid(alloyFn, ecid);
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
      const rawOverride = scriptOverride || selectedScriptUrl;
      const scriptUrl = sanitiseLaunchScriptUrl(rawOverride);
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
        await syncEcidFromAlloy();
        markSdkConfiguredForSandbox(true);
        setSdkConfigExpanded(false);
        dtLog('injectSelectedScriptNow: complete (configured + summary mode)');
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
      });
    }

    if (injectSdkBtn) {
      injectSdkBtn.addEventListener('click', function () {
        dtLog('injectSdkBtn: click', { buttonId: cfg.injectButtonId });
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

    dtLog('init: boot', {
      sandboxKey: getSandboxKey(),
      iframeCount: iframes.length,
      injectButtonId: cfg.injectButtonId,
      pendingSessionKey: pendingSessionKey,
    });
    const pendingScriptInject = sanitiseLaunchScriptUrl(consumePendingLaunchInject());
    if (pendingScriptInject) {
      dtLog('init: post-reload pending inject branch', { preview: dtPreview(pendingScriptInject) });
      renderSelectedScript(pendingScriptInject);
      persistSelectedScriptUrl(pendingScriptInject);
      void injectSelectedScriptNow(pendingScriptInject).finally(function () {
        void loadTagsCompanies();
      });
    } else {
      dtLog('init: no pending inject — applySandboxConfigState');
      applySandboxConfigState();
      void loadTagsCompanies();
    }

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
