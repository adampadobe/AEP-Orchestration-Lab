const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'admiralNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const admiralMessage = document.getElementById('admiralMessage');
const injectSdkBtn = document.getElementById('injectSdkBtn');
const selectedScriptEl = document.getElementById('admiralSelectedScript');
const tagsCompanySelect = document.getElementById('admiralTagsCompany');
const tagsPropertyInput = document.getElementById('admiralTagsProperty');
const tagsPropertyList = document.getElementById('admiralTagsPropertyList');
const tagsEnvironmentSelect = document.getElementById('admiralTagsEnvironment');
const admiralSiteFrame = document.getElementById('admiralSiteFrame');
const sdkConfigFields = document.getElementById('admiralSdkConfigFields');
const sdkConfigSummary = document.getElementById('admiralSdkConfigSummary');
const sdkConfigSummaryText = document.getElementById('admiralSdkConfigSummaryText');
const changeSdkConfigBtn = document.getElementById('admiralChangeSdkConfigBtn');

const LS_SELECTED_LAUNCH_SCRIPT = 'admiralSelectedLaunchScriptBySandbox';
const LS_CONFIGURED_SANDBOX = 'admiralSdkConfiguredBySandbox';
const SS_PENDING_LAUNCH_INJECT = 'admiralPendingLaunchInject';

let selectedScriptUrl = '';
let allPropertyOptions = [];
let selectedPropertyId = '';

function setAdmiralMessage(text, type) {
  if (!admiralMessage) return;
  admiralMessage.textContent = text || '';
  admiralMessage.className =
    'admiral-demo-message' + (type ? ' admiral-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  admiralMessage.hidden = !text;
}

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function getSandboxName() {
  if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
    return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
  }
  return '';
}

function sandboxConfigKey() {
  const raw = getSandboxName().toLowerCase();
  return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
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
  } catch {}
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

function renderSelectedScript(url) {
  selectedScriptUrl = url || '';
  if (!selectedScriptEl) return;
  selectedScriptEl.textContent = selectedScriptUrl || 'None';
}

function persistSelectedScriptUrl(url) {
  const map = readStorageMap(LS_SELECTED_LAUNCH_SCRIPT);
  const key = sandboxConfigKey();
  if (!url) delete map[key];
  else map[key] = String(url);
  writeStorageMap(LS_SELECTED_LAUNCH_SCRIPT, map);
}

function readPersistedSelectedScriptUrl() {
  const map = readStorageMap(LS_SELECTED_LAUNCH_SCRIPT);
  return String(map[sandboxConfigKey()] || '').trim();
}

function isSdkConfiguredForSandbox() {
  const map = readStorageMap(LS_CONFIGURED_SANDBOX);
  return map[sandboxConfigKey()] === 1;
}

function markSdkConfiguredForSandbox(configured) {
  const map = readStorageMap(LS_CONFIGURED_SANDBOX);
  const key = sandboxConfigKey();
  if (configured) map[key] = 1;
  else delete map[key];
  writeStorageMap(LS_CONFIGURED_SANDBOX, map);
}

function setSdkConfigExpanded(expanded) {
  if (sdkConfigFields) sdkConfigFields.hidden = !expanded;
  if (sdkConfigSummary) sdkConfigSummary.hidden = expanded;
  if (sdkConfigSummaryText) {
    const sb = getSandboxName() || 'default sandbox';
    const script = selectedScriptUrl || 'no script selected';
    sdkConfigSummaryText.textContent = 'SDK configured for ' + sb + ' (' + script + ').';
  }
}

function markPendingLaunchInject(url) {
  try {
    sessionStorage.setItem(SS_PENDING_LAUNCH_INJECT, String(url || '').trim());
  } catch {}
}

function consumePendingLaunchInject() {
  try {
    const v = String(sessionStorage.getItem(SS_PENDING_LAUNCH_INJECT) || '').trim();
    sessionStorage.removeItem(SS_PENDING_LAUNCH_INJECT);
    return v;
  } catch {
    return '';
  }
}

function withCacheBust(url) {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('aepcb', String(Date.now()));
    return u.toString();
  } catch {
    const sep = String(url || '').indexOf('?') === -1 ? '?' : '&';
    return String(url || '') + sep + 'aepcb=' + String(Date.now());
  }
}

function reloadPageForLaunchInjection() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('admiralLaunchReload', String(Date.now()));
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
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
  return (
    allPropertyOptions.find((p) => propertyLabelFromItem(p).toLowerCase() === target) ||
    null
  );
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

async function loadTagsCompanies() {
  try {
    setAdmiralMessage('Loading Tags companies...', '');
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
    setAdmiralMessage('Tags companies loaded.', 'success');
  } catch (err) {
    setAdmiralMessage(err.message || 'Failed to load Tags companies.', 'error');
  }
}

async function loadTagsProperties(companyId) {
  if (!companyId) {
    allPropertyOptions = [];
    selectedPropertyId = '';
    if (tagsPropertyInput) tagsPropertyInput.value = '';
    renderPropertySuggestions('');
    setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
    renderSelectedScript('');
    return;
  }
  try {
    setAdmiralMessage('Loading properties...', '');
    const items = await fetchTags('properties', companyId, '');
    allPropertyOptions = items;
    selectedPropertyId = '';
    if (tagsPropertyInput) tagsPropertyInput.value = '';
    renderPropertySuggestions('');
    setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
    renderSelectedScript('');
    setAdmiralMessage('Properties loaded.', 'success');
  } catch (err) {
    setAdmiralMessage(err.message || 'Failed to load properties.', 'error');
  }
}

async function loadTagsEnvironments(propertyId) {
  if (!propertyId) {
    setSelectOptions(tagsEnvironmentSelect, [], () => '', () => '', 'Select environment');
    renderSelectedScript('');
    return;
  }
  try {
    setAdmiralMessage('Loading environments...', '');
    const items = await fetchTags('environments', '', propertyId);
    setSelectOptions(
      tagsEnvironmentSelect,
      items,
      (env) => {
        const label = env && env.name ? env.name : env && env.environmentId ? env.environmentId : 'Environment';
        const stage = env && env.stage ? ' [' + env.stage + ']' : '';
        return label + stage;
      },
      (env) => encodeURIComponent(String(env && env.scriptUrl ? env.scriptUrl : '')),
      'Select environment'
    );
    renderSelectedScript('');
    setAdmiralMessage('Environments loaded.', 'success');
  } catch (err) {
    setAdmiralMessage(err.message || 'Failed to load environments.', 'error');
  }
}

function decodeScriptUrl(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function waitForAlloy(timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    function poll() {
      if (typeof window.alloy === 'function') {
        resolve(window.alloy);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(poll, 120);
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
    window.setTimeout(resolve, ms);
  });
}

async function syncEcidFromAlloy() {
  const alloyFn = await waitForAlloy(12000);
  if (!alloyFn) {
    setAdmiralMessage('Launch script loaded, but alloy is not available yet.', 'error');
    return;
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
      setAdmiralMessage('No ECID returned yet from alloy.getIdentity after retry.', 'error');
      return;
    }
    if (infoEcid) infoEcid.textContent = ecid;
    if (window.DemoProfileDrawer && typeof window.DemoProfileDrawer.patchLastProfileOrUpdate === 'function') {
      window.DemoProfileDrawer.patchLastProfileOrUpdate({
        ecid: ecid,
        identities: [{ namespace: 'ECID', value: ecid }],
      });
    }
    if (window.DemoProfileDrawer && typeof window.DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function') {
      void window.DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
    }
    setAdmiralMessage('ECID resolved from Web SDK and linked to drawer context.', 'success');
  } catch (err) {
    setAdmiralMessage(err.message || 'ECID fetch failed.', 'error');
  }
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function resolveKnownEcid(profile) {
  if (profile && profile.ecid) return String(profile.ecid).trim();
  if (profile && Array.isArray(profile.identities)) {
    const found = profile.identities.find((id) => String(id.namespace || '').toLowerCase() === 'ecid');
    if (found && found.value) return String(found.value).trim();
  }
  const ui = infoEcid ? String(infoEcid.textContent || '').trim() : '';
  return ui && ui !== '-' ? ui : '';
}

function resolveKnownEmail(profile, fallbackIdentifier) {
  if (profile && profile.email && looksLikeEmail(profile.email)) return String(profile.email).trim().toLowerCase();
  if (looksLikeEmail(fallbackIdentifier)) return String(fallbackIdentifier).trim().toLowerCase();
  return '';
}

async function stitchEmailToEcid(email, ecid) {
  const alloyFn = await waitForAlloy(8000);
  if (!alloyFn) return false;
  if (!email || !ecid) return false;
  try {
    await alloyFn('sendEvent', {
      xdm: {
        eventType: 'admiral.identity.stitch',
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

async function injectSelectedScript() {
  const scriptUrl = sanitiseLaunchScriptUrl(selectedScriptUrl);
  if (!scriptUrl) {
    setAdmiralMessage('Select a valid Tags environment script first.', 'error');
    return;
  }

  markPendingLaunchInject(scriptUrl);
  persistSelectedScriptUrl(scriptUrl);
  setAdmiralMessage('Reloading page with cache-busted script injection...', '');
  reloadPageForLaunchInjection();
}

async function injectSelectedScriptNow(scriptOverride) {
  const scriptUrl = sanitiseLaunchScriptUrl(scriptOverride || selectedScriptUrl);
  if (!scriptUrl) return false;

  if (injectSdkBtn) injectSdkBtn.disabled = true;
  try {
    setAdmiralMessage('Injecting selected Launch script...', '');
    await injectScriptIntoDocument(document, withCacheBust(scriptUrl), 'admiralLaunchScript');

    if (admiralSiteFrame && admiralSiteFrame.contentDocument && admiralSiteFrame.contentDocument.head) {
      try {
        await injectScriptIntoDocument(
          admiralSiteFrame.contentDocument,
          withCacheBust(scriptUrl),
          'admiralLaunchScriptFrame'
        );
      } catch {
        // Do not fail the main flow if frame injection misses.
      }
    }

    await syncEcidFromAlloy();
    markSdkConfiguredForSandbox(true);
    setSdkConfigExpanded(false);
    return true;
  } catch (err) {
    setAdmiralMessage(err.message || 'Script injection failed.', 'error');
    return false;
  } finally {
    if (injectSdkBtn) injectSdkBtn.disabled = false;
  }
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setAdmiralMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setAdmiralMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok) return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const ecid = resolveKnownEcid(profile);
    const stitchedEmail = resolveKnownEmail(profile, email);
    if (stitchedEmail && ecid) {
      const stitched = await stitchEmailToEcid(stitchedEmail, ecid);
      if (stitched) {
        setAdmiralMessage('Profile loaded and email linked to ECID for stitching.', 'success');
      }
    }
  });

tagsCompanySelect &&
  tagsCompanySelect.addEventListener('change', function () {
    const companyId = String(tagsCompanySelect.value || '').trim();
    void loadTagsProperties(companyId);
  });

tagsPropertyInput &&
  tagsPropertyInput.addEventListener('input', function () {
    renderPropertySuggestions(tagsPropertyInput.value || '');
    void applyPropertySelectionFromInput();
  });

tagsPropertyInput &&
  tagsPropertyInput.addEventListener('change', function () {
    void applyPropertySelectionFromInput();
  });

tagsPropertyInput &&
  tagsPropertyInput.addEventListener('blur', function () {
    void applyPropertySelectionFromInput();
  });

tagsEnvironmentSelect &&
  tagsEnvironmentSelect.addEventListener('change', function () {
    const raw = decodeScriptUrl(String(tagsEnvironmentSelect.value || '').trim());
    const clean = sanitiseLaunchScriptUrl(raw);
    renderSelectedScript(clean);
    persistSelectedScriptUrl(clean);
  });

injectSdkBtn &&
  injectSdkBtn.addEventListener('click', function () {
    void injectSelectedScript();
  });

(function initAdmiralDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('admiral-demo-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('admiral-demo-page--nav-open', open);
  }

  function scheduleClose() {
    clearHideTimer();
    hideTimer = window.setTimeout(function () {
      setFlyoutOpen(false);
      hideTimer = null;
    }, 450);
  }

  function onPointerMove(e) {
    if (mq.matches) return;
    if (e.clientX <= 24) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    const r = sidebar.getBoundingClientRect();
    const over =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    if (body.classList.contains('admiral-demo-page--nav-open')) {
      scheduleClose();
    }
  }

  sidebar.addEventListener('mouseenter', function () {
    if (!mq.matches) {
      clearHideTimer();
      setFlyoutOpen(true);
    }
  });

  sidebar.addEventListener('mouseleave', function () {
    if (!mq.matches) scheduleClose();
  });

  document.addEventListener('mousemove', onPointerMove, { passive: true });

  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('admiral-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'admiral-demo-page--profile-open',
  viewName: 'Admiral demo',
  emailGetter: getEmail,
  messageSetter: setAdmiralMessage,
  fetchBrowserEcidOnInit: true,
});

if (changeSdkConfigBtn) {
  changeSdkConfigBtn.addEventListener('click', function () {
    markSdkConfiguredForSandbox(false);
    setSdkConfigExpanded(true);
    setAdmiralMessage('SDK config reopened for this sandbox.', '');
  });
}

function applySandboxConfigState(options) {
  const opts = options || {};
  const persistedScript = sanitiseLaunchScriptUrl(readPersistedSelectedScriptUrl());
  renderSelectedScript(persistedScript);
  const configured = isSdkConfiguredForSandbox();
  setSdkConfigExpanded(!configured);
  if (opts.announceSandboxChange) {
    if (configured) {
      setAdmiralMessage('Sandbox changed. Existing SDK config found for this sandbox.', 'success');
    } else {
      setAdmiralMessage('Sandbox changed. Configure SDK injection for this sandbox.', '');
    }
  }
}

window.addEventListener('aep-global-sandbox-change', function () {
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
