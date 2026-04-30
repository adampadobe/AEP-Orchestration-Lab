/**
 * Profile Generation — generic (industry-less) section.
 *
 * Handles:
 *  - Sandbox-portable setup wizard (4 steps): Create schema → Attach field groups → Create dataset → HTTP flow instructions.
 *  - Per-sandbox saved DCS HTTP API connection (URL, Flow ID, Dataset ID, Schema $id) via Firestore.
 *  - Customer Analytics editor (churn, propensity, NPS, AOV, preferred channel, gender, loyalty tier+points, language).
 *  - Plain-email-to-pattern scaler `<local>+DDMMYYYY-N@<domain>` with daily counter per (sandbox, base email).
 *  - Find existing profile by scaled email (`/api/profile/table`).
 *  - Update / generate-N profiles via the existing Adobe Profile Updater (`/api/profile/update`).
 *
 * Sandbox is read from the global `AepGlobalSandbox` so the section follows the page's sandbox switcher.
 */

(function () {
  'use strict';

  // ---------- DOM lookups ----------
  const sandboxSelect = document.getElementById('sandboxSelect');

  // Setup wizard
  const checkInfraBtn = document.getElementById('genCheckInfraBtn');
  const stepCreateSchemaBtn = document.getElementById('genStepCreateSchemaBtn');
  const stepAttachFgBtn = document.getElementById('genStepAttachFgBtn');
  const stepCreateDatasetBtn = document.getElementById('genStepCreateDatasetBtn');
  const stepHttpFlowBtn = document.getElementById('genStepHttpFlowBtn');
  const infraStatusMessage = document.getElementById('genInfraStatusMessage');

  // Streaming connection fields
  const streamSchemaIdEl = document.getElementById('genStreamSchemaId');
  const streamDatasetIdEl = document.getElementById('genStreamDatasetId');
  const streamXdmKeyEl = document.getElementById('genStreamXdmKey');
  const streamFlowIdEl = document.getElementById('genStreamFlowId');
  const streamFlowNameEl = document.getElementById('genStreamFlowName');
  const streamUrlEl = document.getElementById('genStreamUrl');
  const loadFromFirebaseBtn = document.getElementById('genLoadFromFirebaseBtn');
  const fetchFlowFromAepBtn = document.getElementById('genFetchFlowFromAepBtn');
  const saveStreamBtn = document.getElementById('genSaveStreamBtn');

  // Email + actions
  const baseEmailEl = document.getElementById('genBaseEmail');
  const counterEl = document.getElementById('genCounter');
  const generateCountEl = document.getElementById('genGenerateCount');
  const emailPreviewEl = document.getElementById('genEmailPreview');
  const resetCounterBtn = document.getElementById('genResetCounterBtn');
  const findProfileBtn = document.getElementById('genFindProfileBtn');
  const updateProfileBtn = document.getElementById('genUpdateProfileBtn');
  const generateBtn = document.getElementById('genGenerateBtn');
  const dryRunEl = document.getElementById('genDryRun');
  const messageEl = document.getElementById('genericProfileMessage');

  // Customer Analytics
  const churnEl = document.getElementById('genChurn');
  const churnValueEl = document.getElementById('genChurnValue');
  const propensityEl = document.getElementById('genPropensity');
  const propensityValueEl = document.getElementById('genPropensityValue');
  const npsEl = document.getElementById('genNps');
  const aovEl = document.getElementById('genAov');
  const aovValueEl = document.getElementById('genAovValue');
  const preferredChannelEl = document.getElementById('genPreferredChannel');
  const genderEl = document.getElementById('genGender');
  const loyaltyTierEl = document.getElementById('genLoyaltyTier');
  const loyaltyPointsEl = document.getElementById('genLoyaltyPoints');
  const loyaltyRandomBtn = document.getElementById('genLoyaltyRandomBtn');
  const languageEl = document.getElementById('genLanguage');

  // Debug
  const debugEl = document.getElementById('genericProfileDebug');
  const debugClientReqEl = document.getElementById('genDebugClientRequest');
  const debugStatusEl = document.getElementById('genDebugStatus');
  const debugResponseEl = document.getElementById('genDebugResponse');

  // Bail out if the section isn't on the page (defensive — same JS file is shared).
  if (!baseEmailEl || !counterEl || !emailPreviewEl) return;

  // ---------- Helpers ----------
  function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'consent-message' + (type ? ' ' + type : '') + ' consent-message--below-btn';
    el.hidden = !text;
  }

  function showInfraMessage(text, type) {
    if (!infraStatusMessage) return;
    infraStatusMessage.textContent = text || '';
    infraStatusMessage.className = 'consent-message' + (type ? ' ' + type : '');
    infraStatusMessage.hidden = !text;
    if (text && type === 'error') {
      const det = document.getElementById('genericProfileInfraDetails');
      if (det) det.open = true;
    }
  }

  function getSandboxName() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    return String((sandboxSelect && sandboxSelect.value) || '').trim();
  }

  function querySuffix(extra) {
    const params = new URLSearchParams();
    const sb = getSandboxName();
    if (sb) params.set('sandbox', sb);
    if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra)) {
        if (v != null && String(v).trim() !== '') params.set(k, String(v));
      }
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  function trimVal(el) {
    return el ? String(el.value || '').trim() : '';
  }

  function getStreamingPayload() {
    return {
      url: trimVal(streamUrlEl),
      flowId: trimVal(streamFlowIdEl),
      flowName: trimVal(streamFlowNameEl),
      datasetId: trimVal(streamDatasetIdEl),
      schemaId: trimVal(streamSchemaIdEl),
      xdmKey: trimVal(streamXdmKeyEl) || '_demoemea',
    };
  }

  // ---------- Email scaler ----------
  /**
   * Scale a base email to a plus-addressed pattern with today's DDMMYYYY and a counter N.
   * Examples:
   *   adamp.adobedemo@gmail.com   → adamp.adobedemo+30042026-1@gmail.com
   *   apalmer@adobetest.com       → apalmer+30042026-1@adobetest.com
   * Existing plus-tags on the local part are preserved (we append after them with a `-N` suffix only).
   * @param {string} base
   * @param {number} n
   * @param {Date} [date]
   * @returns {string} scaled email or empty string when base is invalid
   */
  function scaleEmail(base, n, date) {
    const s = String(base || '').trim();
    if (!s.includes('@')) return '';
    const at = s.lastIndexOf('@');
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    if (!local || !domain) return '';
    const d = date instanceof Date ? date : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const counter = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    // If the user typed `local+something`, append `-DDMMYYYY-N` to that, otherwise add a fresh `+DDMMYYYY-N`.
    if (local.includes('+')) {
      return `${local}-${dd}${mm}${yyyy}-${counter}@${domain}`;
    }
    return `${local}+${dd}${mm}${yyyy}-${counter}@${domain}`;
  }

  function getCurrentScaledEmail() {
    const base = trimVal(baseEmailEl);
    const n = parseInt(counterEl.value || '1', 10) || 1;
    return scaleEmail(base, n, new Date());
  }

  function updateEmailPreview() {
    const out = getCurrentScaledEmail();
    if (!emailPreviewEl) return;
    emailPreviewEl.textContent = out || '— enter a base email like apalmer@adobetest.com —';
  }

  // ---------- Daily per-sandbox counter persistence ----------
  function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  function counterStorageKey() {
    const sb = getSandboxName() || 'default';
    const base = (trimVal(baseEmailEl) || 'no-email').toLowerCase();
    return `genericProfileCounter:${sb}:${base}:${todayYmd()}`;
  }

  function loadCounterForCurrentContext() {
    try {
      const raw = localStorage.getItem(counterStorageKey());
      const n = raw != null ? parseInt(raw, 10) : NaN;
      counterEl.value = String(Number.isFinite(n) && n > 0 ? n : 1);
    } catch (_) {
      counterEl.value = '1';
    }
    updateEmailPreview();
  }

  function persistCounter(n) {
    try {
      localStorage.setItem(counterStorageKey(), String(n));
    } catch (_) {
      /* ignore */
    }
  }

  function bumpCounter() {
    const cur = parseInt(counterEl.value || '1', 10) || 1;
    const next = cur + 1;
    counterEl.value = String(next);
    persistCounter(next);
    updateEmailPreview();
  }

  // ---------- Streaming connection (Firestore-backed) ----------
  function fillStreamingFields(streaming) {
    if (!streaming || typeof streaming !== 'object') return;
    if (streamUrlEl && streaming.url) streamUrlEl.value = streaming.url;
    if (streamFlowIdEl && streaming.flowId) streamFlowIdEl.value = streaming.flowId;
    if (streamFlowNameEl && streaming.flowName) streamFlowNameEl.value = streaming.flowName;
    if (streamDatasetIdEl && streaming.datasetId) streamDatasetIdEl.value = streaming.datasetId;
    if (streamSchemaIdEl && streaming.schemaId) streamSchemaIdEl.value = streaming.schemaId;
    if (streamXdmKeyEl && streaming.xdmKey) streamXdmKeyEl.value = streaming.xdmKey;
  }

  function clearStreamingFields() {
    if (streamUrlEl) streamUrlEl.value = '';
    if (streamFlowIdEl) streamFlowIdEl.value = '';
    if (streamDatasetIdEl) streamDatasetIdEl.value = '';
    if (streamSchemaIdEl) streamSchemaIdEl.value = '';
    if (streamXdmKeyEl) streamXdmKeyEl.value = '_demoemea';
    // Keep streamFlowName at the canonical default; user can override.
  }

  async function loadConnectionFromFirestore(silent) {
    try {
      const res = await fetch('/api/generic-profile-connection' + querySuffix());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        if (!silent) showInfraMessage(data.error || 'Failed to load saved connection.', 'error');
        return false;
      }
      const rec = data.record;
      if (rec && rec.streaming) {
        fillStreamingFields(rec.streaming);
        if (!silent) showInfraMessage('Loaded saved Generic Profile connection for this sandbox.', 'success');
        return true;
      }
      if (!silent) {
        showInfraMessage('No saved connection for this sandbox yet — run the 4 setup steps and Save connection.', '');
      }
      return false;
    } catch (e) {
      if (!silent) showInfraMessage(e.message || 'Network error loading connection.', 'error');
      return false;
    }
  }

  async function saveConnectionToFirestore(extraInfra) {
    const sb = getSandboxName();
    if (!sb) {
      showInfraMessage('Pick a sandbox first.', 'error');
      return false;
    }
    const body = { sandbox: sb, streaming: getStreamingPayload() };
    if (extraInfra && typeof extraInfra === 'object' && Object.keys(extraInfra).length) {
      body.infra = extraInfra;
    }
    try {
      const res = await fetch('/api/generic-profile-connection' + querySuffix(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        showInfraMessage(data.error || 'Save failed.', 'error');
        return false;
      }
      return true;
    } catch (e) {
      showInfraMessage(e.message || 'Network error saving connection.', 'error');
      return false;
    }
  }

  // ---------- Setup wizard ----------
  function applyStepResultToFields(data) {
    if (!data || typeof data !== 'object') return;
    if (streamDatasetIdEl && data.datasetId) streamDatasetIdEl.value = String(data.datasetId);
    if (streamSchemaIdEl && data.schemaId) streamSchemaIdEl.value = String(data.schemaId);
    if (streamXdmKeyEl && data.xdmKey) streamXdmKeyEl.value = String(data.xdmKey);
  }

  async function runStep(step, btn) {
    const labels = {
      createSchema: 'Creating schema…',
      attachFieldGroups: 'Attaching field groups…',
      createDataset: 'Creating dataset…',
      httpFlow: 'Loading HTTP flow instructions…',
    };
    const busy = [stepCreateSchemaBtn, stepAttachFgBtn, stepCreateDatasetBtn, stepHttpFlowBtn].filter(Boolean);
    busy.forEach((b) => { b.disabled = true; });
    showInfraMessage(labels[step] || 'Working…', '');
    try {
      const res = await fetch('/api/generic-profile-infra/step' + querySuffix(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showInfraMessage(data.error || 'Step request failed', 'error');
        return;
      }
      if (data.ok === false) {
        showInfraMessage(
          data.error ||
            (data.profileCoreMixinMissing
              ? 'Import "Profile Core v2" in this sandbox first, then run step 2 again.'
              : 'Step failed.'),
          'error'
        );
        return;
      }
      applyStepResultToFields(data);
      try {
        const infra = {};
        if (data.schemaId) infra.schemaId = data.schemaId;
        if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
        if (data.datasetId) infra.datasetId = data.datasetId;
        if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
        if (data.analyticsFieldGroupId) infra.analyticsFieldGroupId = data.analyticsFieldGroupId;
        if (Object.keys(infra).length) await saveConnectionToFirestore(infra);
      } catch (e) {
        console.warn('[generic-profile] infra sync:', e && e.message);
      }
      const msg =
        data.message ||
        (data.manual && Array.isArray(data.nextSteps) ? data.nextSteps.join(' ') : 'Step completed.');
      showInfraMessage(msg, 'success');
      if (Array.isArray(data.nextSteps) && data.nextSteps.length) {
        console.info('[generic-profile-infra] Next steps:', data.nextSteps.join('\n'));
      }
    } catch (e) {
      showInfraMessage(e.message || 'Network error', 'error');
    } finally {
      busy.forEach((b) => { b.disabled = false; });
    }
  }

  async function checkInfra() {
    if (!checkInfraBtn) return;
    checkInfraBtn.disabled = true;
    showInfraMessage('Checking…', '');
    try {
      const res = await fetch('/api/generic-profile-infra/status' + querySuffix());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        showInfraMessage(data.error || 'Status request failed', 'error');
        return;
      }
      const ps = data.prepSteps || {};
      const parts = [
        data.ready ? 'Ready for streaming (after URL + Flow ID set).' : 'Not fully ready yet.',
        `Profile Core v2 mixin: ${data.profileCoreMixinFound ? 'yes' : 'no'}`,
        `Customer Analytics field group: ${data.analyticsFieldGroupFound ? 'yes' : 'no'}`,
        `Schema: ${data.schemaFound ? 'yes' : 'no'}`,
        `Primary email descriptor: ${data.primaryEmailDescriptor ? 'yes' : 'no'}`,
        `Dataset: ${data.datasetFound ? `yes (Profile-enabled: ${data.datasetProfileEnabled ? 'yes' : 'no'})` : 'no'}`,
        `Wizard: 1 schema ${ps.step1_schemaShell ? '✓' : '—'} · 2 field groups+ID ${ps.step2_fieldGroupsIdentity ? '✓' : '—'} · 3 dataset ${ps.step3_dataset ? '✓' : '—'} · 4 HTTP ${ps.step4_readyForManualHttpFlow ? 'ready' : '—'}`,
      ];
      showInfraMessage(parts.join(' · '), data.ready ? 'success' : '');
      try {
        const infra = {};
        if (data.schemaId) infra.schemaId = data.schemaId;
        if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
        if (data.datasetId) infra.datasetId = data.datasetId;
        if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
        if (data.analyticsFieldGroupId) infra.analyticsFieldGroupId = data.analyticsFieldGroupId;
        if (Object.keys(infra).length) await saveConnectionToFirestore(infra);
      } catch (e) {
        console.warn('[generic-profile] status sync:', e && e.message);
      }
    } catch (e) {
      showInfraMessage(e.message || 'Network error', 'error');
    } finally {
      checkInfraBtn.disabled = false;
    }
  }

  async function fetchFlowFromAep() {
    if (!fetchFlowFromAepBtn) return;
    fetchFlowFromAepBtn.disabled = true;
    showInfraMessage('Looking up dataflow in Flow Service…', '');
    try {
      const flowId = trimVal(streamFlowIdEl);
      const flowName = trimVal(streamFlowNameEl);
      const extra = {};
      if (flowId) extra.flowId = flowId;
      if (!flowId && flowName) extra.flowName = flowName;
      const res = await fetch('/api/generic-profile-infra/flow-lookup' + querySuffix(extra));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        showInfraMessage(data.error || 'Flow lookup failed', 'error');
        return;
      }
      if (streamUrlEl && data.url) streamUrlEl.value = data.url;
      if (streamFlowIdEl && data.flowId) streamFlowIdEl.value = data.flowId;
      if (streamFlowNameEl && data.flowName) streamFlowNameEl.value = data.flowName;
      showInfraMessage('Fetched URL & Flow ID from AEP. Click Save connection to persist for this sandbox.', 'success');
    } catch (e) {
      showInfraMessage(e.message || 'Network error', 'error');
    } finally {
      fetchFlowFromAepBtn.disabled = false;
    }
  }

  // ---------- Customer Analytics editor wiring ----------
  function renderChurn() { if (churnValueEl) churnValueEl.textContent = `${churnEl.value || 0}%`; }
  function renderPropensity() { if (propensityValueEl) propensityValueEl.textContent = `${propensityEl.value || 0}%`; }
  function renderAov() {
    const n = parseInt(aovEl.value || '0', 10) || 0;
    if (aovValueEl) aovValueEl.textContent = `$${n.toLocaleString('en-US')}`;
  }

  function randomBetween(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function randomLoyaltyPointsForTier(tier) {
    switch (String(tier || '').toLowerCase()) {
      case 'platinum': return randomBetween(50000, 200000);
      case 'gold':     return randomBetween(20000, 60000);
      case 'silver':   return randomBetween(5000, 25000);
      case 'bronze':   return randomBetween(500, 7500);
      default:         return randomBetween(500, 50000);
    }
  }

  /**
   * Build the `updates: [{path, value}]` array for /api/profile/update.
   * Empty / unset fields are skipped (so we never overwrite existing profile data with defaults).
   * Path-routing rule (per profileStreamingCore.js): paths starting with `loyalty.`, `person.`, `personalEmail.`
   * land at the XDM root; everything else goes under `_demoemea`.
   */
  function buildUpdatesFromForm() {
    const updates = [];
    const push = (path, value) => updates.push({ path, value });

    // Tenant analytics (under _demoemea)
    const churnRaw = churnEl ? String(churnEl.value || '').trim() : '';
    const propRaw = propensityEl ? String(propensityEl.value || '').trim() : '';
    const aovRaw = aovEl ? String(aovEl.value || '').trim() : '';
    const npsRaw = npsEl ? String(npsEl.value || '').trim() : '';
    if (churnRaw !== '') push('scoring.churn.churnPrediction', Number(churnRaw));
    if (propRaw !== '') push('scoring.core.propensityScore', Number(propRaw));
    if (npsRaw !== '') push('scoring.nps', parseInt(npsRaw, 10));
    if (aovRaw !== '') push('commerce.averageOrderValue', Number(aovRaw));

    // Tenant preferences
    const ch = preferredChannelEl ? trimVal(preferredChannelEl) : '';
    if (ch) push('preferences.preferredChannel', ch);
    const lang = languageEl ? trimVal(languageEl) : '';
    // Language goes to root personalEmail.language (XDM standard); also mirror under tenant prefs for completeness.
    if (lang) {
      push('personalEmail.language', lang);
      push('preferences.preferredLanguage', lang);
    }

    // Person.gender — root via PROFILE_STREAM_ROOT_PATH_PREFIXES
    const gender = genderEl ? trimVal(genderEl) : '';
    if (gender) push('person.gender', gender);

    // Loyalty — root
    const tier = loyaltyTierEl ? trimVal(loyaltyTierEl) : '';
    if (tier) push('loyalty.tier', tier);
    const pts = loyaltyPointsEl ? trimVal(loyaltyPointsEl) : '';
    if (pts !== '') push('loyalty.points', Number(pts));

    return updates;
  }

  function applyProfileFindResultToForm(found) {
    if (!found || typeof found !== 'object') return;
    // The /api/profile/table response is sandbox-specific; we look for keys in the entity object.
    // Extract a single entity object (handle several shapes):
    let entity = null;
    if (found.entity && typeof found.entity === 'object') entity = found.entity;
    if (!entity && found.profile && typeof found.profile === 'object') entity = found.profile;
    if (!entity && Array.isArray(found.entities) && found.entities.length) entity = found.entities[0];
    if (!entity && Array.isArray(found.profiles) && found.profiles.length) entity = found.profiles[0];
    if (!entity && Array.isArray(found.results) && found.results.length) entity = found.results[0];
    if (!entity) return;

    const get = (obj, path) => {
      const keys = path.split('.');
      let cur = obj;
      for (const k of keys) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[k];
      }
      return cur;
    };

    const tenant = entity._demoemea && typeof entity._demoemea === 'object' ? entity._demoemea : {};
    const churn = get(tenant, 'scoring.churn.churnPrediction');
    if (churn != null && churnEl) { churnEl.value = String(churn); renderChurn(); }
    const prop = get(tenant, 'scoring.core.propensityScore');
    if (prop != null && propensityEl) { propensityEl.value = String(prop); renderPropensity(); }
    const nps = get(tenant, 'scoring.nps');
    if (nps != null && npsEl) npsEl.value = String(nps);
    const aov = get(tenant, 'commerce.averageOrderValue');
    if (aov != null && aovEl) { aovEl.value = String(aov); renderAov(); }
    const ch = get(tenant, 'preferences.preferredChannel');
    if (ch != null && preferredChannelEl) preferredChannelEl.value = String(ch);
    const lang = get(tenant, 'preferences.preferredLanguage') || get(entity, 'personalEmail.language');
    if (lang != null && languageEl) languageEl.value = String(lang);
    const gender = get(entity, 'person.gender');
    if (gender != null && genderEl) genderEl.value = String(gender);
    const tier = get(entity, 'loyalty.tier');
    if (tier != null && loyaltyTierEl) loyaltyTierEl.value = String(tier);
    const pts = get(entity, 'loyalty.points');
    if (pts != null && loyaltyPointsEl) loyaltyPointsEl.value = String(pts);
  }

  // ---------- Find / Update / Generate ----------
  function ensureStreamingReady() {
    const s = getStreamingPayload();
    const missing = [];
    if (!s.url) missing.push('Collection URL');
    if (!s.flowId) missing.push('Flow ID');
    if (!s.datasetId) missing.push('Dataset ID');
    if (!s.schemaId) missing.push('Schema $id');
    if (missing.length) {
      const det = document.getElementById('genericProfileInfraDetails');
      if (det) det.open = true;
      setMessage(
        messageEl,
        `Streaming connection missing: ${missing.join(', ')}. Run setup or click Fetch URL & Flow ID, then Save connection.`,
        'error'
      );
      return null;
    }
    return s;
  }

  async function findProfile() {
    const email = getCurrentScaledEmail();
    if (!email) {
      setMessage(messageEl, 'Enter a base email first.', 'warning');
      baseEmailEl.focus();
      return;
    }
    findProfileBtn.disabled = true;
    setMessage(messageEl, `Looking up ${email}…`, '');
    try {
      const url = '/api/profile/table' + querySuffix({ entityIdNS: 'email', entityId: email });
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(messageEl, data.error || `Lookup failed (HTTP ${res.status}).`, 'error');
        return;
      }
      // Try to display headline plus apply known analytics fields if present.
      applyProfileFindResultToForm(data);
      const found =
        (data && (data.entity || data.profile)) ||
        (Array.isArray(data && data.entities) && data.entities.length) ||
        (Array.isArray(data && data.profiles) && data.profiles.length) ||
        (Array.isArray(data && data.results) && data.results.length);
      if (!found) {
        setMessage(
          messageEl,
          `No existing profile for ${email} in this sandbox. Click Generate or Update to create one.`,
          ''
        );
        return;
      }
      setMessage(messageEl, `Found profile for ${email}. Form populated where available.`, 'success');
    } catch (e) {
      setMessage(messageEl, e.message || 'Network error', 'error');
    } finally {
      findProfileBtn.disabled = false;
    }
  }

  async function postProfileUpdate(email, updates, streaming, dryRun) {
    const sb = getSandboxName();
    const body = {
      email,
      sandbox: sb || undefined,
      updates,
      streaming,
      ...(dryRun ? { dryRun: true } : {}),
    };
    const clientReq = {
      method: 'POST',
      url: `${window.location.origin}/api/profile/update`,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
    if (debugEl && debugClientReqEl) {
      debugEl.hidden = false;
      debugClientReqEl.textContent = JSON.stringify(clientReq, null, 2);
      if (debugStatusEl) debugStatusEl.textContent = '…';
      if (debugResponseEl) debugResponseEl.textContent = '';
    }
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (debugEl) {
      if (debugStatusEl) debugStatusEl.textContent = `${res.status} ${res.ok ? 'OK' : ''}`;
      if (debugResponseEl) debugResponseEl.textContent = JSON.stringify(data, null, 2);
    }
    return { res, data };
  }

  async function updateProfile() {
    const email = getCurrentScaledEmail();
    if (!email) {
      setMessage(messageEl, 'Enter a base email first.', 'warning');
      baseEmailEl.focus();
      return;
    }
    const streaming = ensureStreamingReady();
    if (!streaming) return;
    const updates = buildUpdatesFromForm();
    if (!updates.length) {
      setMessage(messageEl, 'No fields to update — fill at least one Customer Analytics field.', 'warning');
      return;
    }
    updateProfileBtn.disabled = true;
    setMessage(messageEl, `Updating ${email}…`, '');
    try {
      const dryRun = !!(dryRunEl && dryRunEl.checked);
      const { res, data } = await postProfileUpdate(email, updates, streaming, dryRun);
      if (!res.ok) {
        setMessage(messageEl, data.error || `Update failed (HTTP ${res.status}).`, 'error');
        return;
      }
      const okMsg = data.message || `Update sent for ${email}.`;
      setMessage(messageEl, okMsg + (dryRun ? ' (dry run)' : ''), 'success');
    } catch (e) {
      setMessage(messageEl, e.message || 'Network error', 'error');
    } finally {
      updateProfileBtn.disabled = false;
    }
  }

  async function generateProfiles() {
    const base = trimVal(baseEmailEl);
    if (!base || !base.includes('@')) {
      setMessage(messageEl, 'Enter a valid base email like apalmer@adobetest.com first.', 'warning');
      baseEmailEl.focus();
      return;
    }
    const streaming = ensureStreamingReady();
    if (!streaming) return;
    const updates = buildUpdatesFromForm();
    if (!updates.length) {
      setMessage(messageEl, 'Add at least one Customer Analytics field before generating.', 'warning');
      return;
    }
    const count = Math.max(1, Math.min(100, parseInt(generateCountEl.value || '1', 10) || 1));
    const dryRun = !!(dryRunEl && dryRunEl.checked);

    generateBtn.disabled = true;
    setMessage(messageEl, `Generating ${count} profile${count === 1 ? '' : 's'}…`, '');
    let successCount = 0;
    let lastError = '';
    let lastEmail = '';
    try {
      for (let i = 0; i < count; i++) {
        const n = parseInt(counterEl.value || '1', 10) || 1;
        const email = scaleEmail(base, n, new Date());
        if (!email) {
          lastError = 'Could not scale email — invalid base format.';
          break;
        }
        lastEmail = email;
        try {
          const { res, data } = await postProfileUpdate(email, updates, streaming, dryRun);
          if (!res.ok) {
            lastError = data.error || `HTTP ${res.status}`;
            break;
          }
          successCount += 1;
        } catch (e) {
          lastError = e.message || 'Network error';
          break;
        }
        // Always bump counter after a successful send so retries don't collide.
        bumpCounter();
      }
      if (successCount === count && !lastError) {
        setMessage(
          messageEl,
          `Generated ${successCount} profile${successCount === 1 ? '' : 's'}${dryRun ? ' (dry run)' : ''}. Latest: ${lastEmail}.`,
          'success'
        );
      } else if (successCount > 0) {
        setMessage(
          messageEl,
          `Generated ${successCount}/${count} profile${count === 1 ? '' : 's'} before stopping. Last error: ${lastError}`,
          'warning'
        );
      } else {
        setMessage(messageEl, `Generate failed: ${lastError || 'unknown error'}.`, 'error');
      }
    } finally {
      generateBtn.disabled = false;
    }
  }

  // ---------- Wire events ----------
  if (checkInfraBtn) checkInfraBtn.addEventListener('click', checkInfra);
  if (stepCreateSchemaBtn) stepCreateSchemaBtn.addEventListener('click', () => runStep('createSchema', stepCreateSchemaBtn));
  if (stepAttachFgBtn) stepAttachFgBtn.addEventListener('click', () => runStep('attachFieldGroups', stepAttachFgBtn));
  if (stepCreateDatasetBtn) stepCreateDatasetBtn.addEventListener('click', () => runStep('createDataset', stepCreateDatasetBtn));
  if (stepHttpFlowBtn) stepHttpFlowBtn.addEventListener('click', () => runStep('httpFlow', stepHttpFlowBtn));

  if (loadFromFirebaseBtn) loadFromFirebaseBtn.addEventListener('click', () => loadConnectionFromFirestore(false));
  if (fetchFlowFromAepBtn) fetchFlowFromAepBtn.addEventListener('click', fetchFlowFromAep);
  if (saveStreamBtn) {
    saveStreamBtn.addEventListener('click', async () => {
      saveStreamBtn.disabled = true;
      try {
        const ok = await saveConnectionToFirestore();
        if (ok) showInfraMessage('Connection saved for this sandbox.', 'success');
      } finally {
        saveStreamBtn.disabled = false;
      }
    });
  }

  if (baseEmailEl) {
    baseEmailEl.addEventListener('input', () => {
      // When the base email changes, reload the counter for the new (sandbox, base, today) key.
      loadCounterForCurrentContext();
    });
    baseEmailEl.addEventListener('change', loadCounterForCurrentContext);
  }
  if (counterEl) {
    counterEl.addEventListener('input', () => {
      const n = parseInt(counterEl.value || '1', 10) || 1;
      persistCounter(n);
      updateEmailPreview();
    });
  }
  if (resetCounterBtn) {
    resetCounterBtn.addEventListener('click', () => {
      counterEl.value = '1';
      persistCounter(1);
      updateEmailPreview();
    });
  }

  // Customer Analytics
  if (churnEl) churnEl.addEventListener('input', renderChurn);
  if (propensityEl) propensityEl.addEventListener('input', renderPropensity);
  if (aovEl) aovEl.addEventListener('input', renderAov);
  document.querySelectorAll('.analytics-randomize').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-target') || '');
      if (!target) return;
      const min = parseFloat(target.min || '0');
      const max = parseFloat(target.max || '100');
      const step = parseFloat(target.step || '1') || 1;
      const span = max - min;
      const rand = min + Math.random() * span;
      target.value = String(Math.round(rand / step) * step);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  if (loyaltyRandomBtn && loyaltyTierEl && loyaltyPointsEl) {
    loyaltyRandomBtn.addEventListener('click', () => {
      const tier = trimVal(loyaltyTierEl);
      loyaltyPointsEl.value = String(randomLoyaltyPointsForTier(tier));
    });
  }

  if (findProfileBtn) findProfileBtn.addEventListener('click', findProfile);
  if (updateProfileBtn) updateProfileBtn.addEventListener('click', updateProfile);
  if (generateBtn) generateBtn.addEventListener('click', generateProfiles);

  // Sandbox change: reload connection + counter context.
  function onSandboxChange() {
    clearStreamingFields();
    loadConnectionFromFirestore(true);
    loadCounterForCurrentContext();
  }
  if (sandboxSelect) {
    sandboxSelect.addEventListener('change', onSandboxChange);
  }
  window.addEventListener('aep-global-sandbox-change', onSandboxChange);

  // Initial render
  renderChurn();
  renderPropensity();
  renderAov();
  loadCounterForCurrentContext();
  // Defer initial connection load so the sandbox dropdown finishes loading first.
  setTimeout(() => loadConnectionFromFirestore(true), 750);
})();
