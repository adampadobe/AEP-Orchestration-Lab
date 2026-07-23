/**
 * Industry Profile Generation – Snowflake page logic.
 *
 * Phase 1 scope (per docs/SNOWFLAKE_INTEGRATION.md):
 *   - Reads/writes per-lab-user, per-AEP-sandbox Snowflake connection config via
 *     /api/snowflake/config (functions/snowflakeService.js → Firestore +
 *     Secret Manager).
 *   - Runs a server-side connection test via /api/snowflake/connection-test
 *     so users can validate the static-egress-IP allowlist round-trips
 *     without leaving the lab.
 *
 * Auth: requires Portal sign-in with an Adobe @adobe.com Firebase account (not anonymous).
 * aep-lab-sandbox-sync.js still boots anonymous auth for other lab features; this page
 * rejects anonymous tokens on /api/snowflake/* and prompts sign-in before Save.
 */

(function () {
  'use strict';

  var LS_SANDBOX = 'aepGlobalSandboxName';
  /** Anonymous Firebase uid from this browser before Portal login — sent once for migration. */
  var LS_LEGACY_ANON_UID = 'aepLabSnowflakeLegacyAnonymousUid';
  /** Base-profile generate runs only (separate from Agentic full-gen batches). */
  var LS_SF_BASE_GEN_BATCHES = 'aepLabSnowflakeBaseProfileBatchesV1';
  var MAX_SF_BASE_BATCH_HISTORY = 20;
  var STATIC_EGRESS_IP = '34.58.81.28';
  /** Max PEM / PKCS#8 file size read in the browser before Save. */
  var KEY_FILE_MAX_BYTES = 256 * 1024;

  /**
   * Public connection defaults from AgenticAI Demo `snowflake_settings.py`
   * (`get_snowflake_connection_kwargs` env fallbacks). Never put private keys here.
   */
  var PRESET_AGENTIC_TRAVEL_DEMO = {
    account: 'dh96551.west-europe.azure',
    user: 'AEP_INTEGRATION_1',
    role: '',
    warehouse: 'AEP_WH',
    database: 'TRAVEL_DATABASE',
    schema: 'AEP_SCHEMA',
    authMethod: 'keyPair',
  };
  /** Immediate UI fallback; authenticated catalog responses remain the source of truth. */
  var INDUSTRY_UI_FALLBACKS = {
    travel: {
      table: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
      events: ['website', 'mobile', 'booking', 'checkin', 'call', 'disruption', 'inflight', 'hotel', 'loyalty', 'pos'],
    },
    fsi: {
      table: 'AGENTIC_FSI_PROFILE_CUSTOMER',
      events: ['digital', 'transaction', 'application', 'advisory', 'products'],
    },
    retail: {
      table: 'AGENTIC_RETAIL_PROFILE_CUSTOMER',
      events: ['order', 'browse', 'return', 'service', 'rewards'],
    },
    telecom: {
      table: 'AGENTIC_TELECOM_PROFILE_CUSTOMER',
      events: ['usage', 'billing', 'service', 'network', 'devices'],
    },
    media: {
      table: 'AGENTIC_MEDIA_PROFILE_CUSTOMER',
      events: ['viewing', 'engagement', 'billing', 'download', 'watchlist'],
    },
    sports: {
      table: 'AGENTIC_SPORTS_PROFILE_CUSTOMER',
      events: ['attendance', 'merchandise', 'engagement', 'betting', 'membership'],
    },
  };

  var els = {};
  /** True after a successful Test connection in this page session (reset on Save / Clear / reload). */
  var lastSnowflakeTestOk = false;
  /** Last GET /api/snowflake/config metadata (configState, lab user uid prefix). */
  var lastConfigMeta = {
    configState: '',
    labUserUidPrefix: '',
    labUserEmail: '',
    labUserDisplayName: '',
    presetNote: '',
    credentialScope: 'user',
  };
  /** True when GET /api/snowflake/config last reported hasCredential (Secret Manager). */
  var lastHasCredential = false;
  /** credentialSetAt from last GET/POST config (for badge timestamp). */
  var lastCredentialSetAt = null;
  /** Monotonic token — ignore stale loadConfig fetch responses. */
  var loadConfigSeq = 0;
  /** Rows last returned from /api/snowflake/agentic/query-profiles (for enrich payload). */
  var loadedProfiles = [];
  /** Last governed industry manifest returned by the catalog endpoint. */
  var industryCatalog = null;

  function $(id) {
    return document.getElementById(id);
  }

  function readSandbox() {
    try {
      var v = String(localStorage.getItem(LS_SANDBOX) || '').trim();
      return v;
    } catch (_) {
      return '';
    }
  }

  function readIndustry() {
    return els.industry ? String(els.industry.value || 'travel').trim().toLowerCase() : 'travel';
  }

  function titleCase(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
  }

  function formatBatchLabelFromIso(isoString) {
    var date = isoString ? new Date(isoString) : new Date();
    if (Number.isNaN(date.getTime())) return 'Unknown batch';
    var dd = String(date.getDate()).padStart(2, '0');
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    var hh = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    return dd + '-' + mm + ' - ' + hh + ':' + min;
  }

  function safeGetBaseBatchHistory() {
    try {
      var raw = localStorage.getItem(LS_SF_BASE_GEN_BATCHES);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveBaseBatchHistory(history) {
    try {
      localStorage.setItem(LS_SF_BASE_GEN_BATCHES, JSON.stringify(history.slice(0, MAX_SF_BASE_BATCH_HISTORY)));
    } catch (_) {
      /* quota / private mode */
    }
  }

  function renderBaseBatchHistorySelect(selectedBatchId) {
    var select = els.genBatchHistorySelect;
    if (!select) return;
    var history = safeGetBaseBatchHistory();
    select.textContent = '';
    if (!history.length) {
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'No saved batches yet';
      select.appendChild(opt0);
      select.value = '';
      return;
    }
    for (var i = 0; i < history.length; i++) {
      var b = history[i];
      var opt = document.createElement('option');
      opt.value = String(b.id || '');
      opt.textContent = String(b.label || b.id || 'batch');
      select.appendChild(opt);
    }
    if (selectedBatchId && history.some(function (x) { return String(x.id) === String(selectedBatchId); })) {
      select.value = String(selectedBatchId);
    } else {
      select.value = String(history[0].id || '');
    }
  }

  function appendBaseBatchHistory(result) {
    var createdAt = new Date().toISOString();
    var batch = {
      id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 8),
      createdAt: createdAt,
      label: formatBatchLabelFromIso(createdAt),
      result: result,
    };
    var history = safeGetBaseBatchHistory();
    history.unshift(batch);
    saveBaseBatchHistory(history);
    renderBaseBatchHistorySelect(batch.id);
    return batch;
  }

  function getBaseBatchById(batchId) {
    if (!batchId) return null;
    var history = safeGetBaseBatchHistory();
    for (var i = 0; i < history.length; i++) {
      if (String(history[i].id) === String(batchId)) return history[i];
    }
    return null;
  }

  function loadBaseBatchIntoResult(batchId) {
    var batch = getBaseBatchById(batchId);
    if (!batch || !batch.result) return;
    showGenerateResult(batch.result);
    setGenerateMessage('Loaded saved batch ' + (batch.label || batch.id) + '.', 'info');
    if (els.genResult) els.genResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function syncSfGenCountDisplay() {
    if (!els.genCount || !els.genCountDisplay) return;
    els.genCountDisplay.textContent = String(els.genCount.value);
  }

  /** True when Global values sandbox is Adam's dev sandbox (technical name contains `apalmer`). */
  function hasPortalLogin() {
    try {
      var f = window.firebase;
      if (!f || !f.auth) return false;
      var u = f.auth().currentUser;
      if (!u || u.isAnonymous) return false;
      var email = String(u.email || '').trim().toLowerCase();
      return email.endsWith('@adobe.com');
    } catch (_) {
      return false;
    }
  }

  function portalLoginLabel() {
    try {
      var f = window.firebase;
      if (!f || !f.auth) return '';
      var u = f.auth().currentUser;
      if (!u || u.isAnonymous) return '';
      return String(u.email || u.displayName || '').trim();
    } catch (_) {
      return '';
    }
  }

  function captureLegacyAnonymousUid() {
    try {
      var f = window.firebase;
      if (!f || !f.auth) return;
      var u = f.auth().currentUser;
      if (u && u.isAnonymous && u.uid) {
        localStorage.setItem(LS_LEGACY_ANON_UID, String(u.uid));
      }
    } catch (_) {}
  }

  function readLegacyAnonymousUid(currentUid) {
    try {
      var legacy = String(localStorage.getItem(LS_LEGACY_ANON_UID) || '').trim();
      if (!legacy || legacy === String(currentUid || '')) return '';
      return legacy;
    } catch (_) {
      return '';
    }
  }

  function clearLegacyAnonymousUidAfterMigration(body) {
    if (!body || !body.migratedFromAnonymous) return;
    try {
      localStorage.removeItem(LS_LEGACY_ANON_UID);
    } catch (_) {}
  }

  function labUserIdentityHint(body) {
    var email = (body && body.labUserEmail) || lastConfigMeta.labUserEmail || portalLoginLabel();
    if (email) return ' Linked to Portal user ' + email + '.';
    var prefix = (body && body.labUserUidPrefix) || lastConfigMeta.labUserUidPrefix;
    return prefix ? ' Lab user id: ' + prefix + '.' : '';
  }

  function portalLoginRequiredMessage() {
    return (
      'Sign in to the Portal with your Adobe @adobe.com account before configuring Snowflake. ' +
      'Open home.html and use Login — anonymous browser auth cannot own Snowflake credentials.'
    );
  }

  function openPortalLoginHint() {
    if (window.AepAccessOnboarding && typeof window.AepAccessOnboarding.open === 'function') {
      window.AepAccessOnboarding.open();
      return;
    }
    try {
      window.location.assign('home.html?accessSetup=1');
    } catch (_) {}
  }

  function isApalmerSandbox(sandbox) {
    return String(sandbox || '').toLowerCase().indexOf('apalmer') !== -1;
  }

  function isSandboxSharedCredential(sandbox) {
    return isApalmerSandbox(sandbox) || String(sandbox || '').toLowerCase().indexOf('kirkham') !== -1;
  }

  function sandboxSharedLabel(sandbox) {
    return isSandboxSharedCredential(sandbox)
      ? ' (shared across browsers on sandbox ' + sandbox + ')'
      : '';
  }

  /**
   * @param {boolean} onlyFillEmpty — when true, only writes a field if it is blank (used after load when no saved config).
   * @param {boolean} force — when true with onlyFillEmpty false, overwrites all preset-mapped fields from PRESET_AGENTIC_TRAVEL_DEMO.
   */
  function applyAgenticTravelPreset(onlyFillEmpty, force) {
    var p = PRESET_AGENTIC_TRAVEL_DEMO;
    function setField(el, val) {
      if (!el) return;
      if (onlyFillEmpty && String(el.value || '').trim() && !force) return;
      el.value = val;
    }
    setField(els.account, p.account);
    setField(els.user, p.user);
    setField(els.role, p.role);
    setField(els.warehouse, p.warehouse);
    setField(els.database, p.database);
    setField(els.schema, p.schema);
    if (els.authMethod) {
      if (!onlyFillEmpty || !String(els.authMethod.value || '').trim() || force) {
        els.authMethod.value = p.authMethod;
      }
    }
    reflectAuthMethod();
    refreshConnectionUi();
  }

  function setConnectionSummaryTone(tone) {
    var st = els.connectionSummaryStatus;
    if (!st) return;
    st.classList.remove(
      'sf-gen-connection-summary-status--verified',
      'sf-gen-connection-summary-status--incomplete',
      'sf-gen-connection-summary-status--connected'
    );
    if (tone) st.classList.add('sf-gen-connection-summary-status--' + tone);
  }

  function readConnectionAccount() {
    return els.account ? els.account.value.trim() : '';
  }

  function readConnectionUser() {
    return els.user ? els.user.value.trim() : '';
  }

  /** Single source of truth: GET config hasCredential + populated account field. */
  function isConnectionReady() {
    return lastHasCredential && !!readConnectionAccount();
  }

  function needsCredentialAction() {
    return !lastHasCredential;
  }

  function syncConnectionPanelOpen() {
    if (!els.connectionDetails) return;
    if (lastSnowflakeTestOk || isConnectionReady()) {
      els.connectionDetails.open = false;
      return;
    }
    els.connectionDetails.open = true;
  }

  function applyCredentialBadge(hasCredential) {
    var badge = els.credentialBadge;
    var badgeText = els.credentialBadgeText;
    if (badge) badge.hidden = !hasCredential;
    if (!badgeText) return;
    if (hasCredential) {
      var when = lastCredentialSetAt
        ? ' (saved ' + new Date(lastCredentialSetAt).toLocaleString() + ')'
        : '';
      badgeText.textContent = 'Credential stored in Secret Manager' + when;
    } else {
      badgeText.textContent = '';
    }
  }

  function credentialActionHintText() {
    var sandbox = readSandbox();
    var shared = isSandboxSharedCredential(sandbox);
    if (shared) {
      return (
        'Paste your .p8 and Save once to store in Secret Manager for sandbox ' +
        sandbox +
        ' (shared across browsers).'
      );
    }
    var uidHint = labUserIdentityHint(lastConfigMeta);
    var configState = lastConfigMeta.configState || '';
    if (configState === 'preset_only' || configState === 'saved_no_credential') {
      return 'Paste your PEM private key and Save once.' + uidHint;
    }
    return 'No credential saved yet for this lab user — paste one to enable connection tests.' + uidHint;
  }

  function credentialReadyHintText() {
    if (lastConfigMeta.credentialScope === 'sandbox_shared') {
      return 'Private key is not shown in the browser. Paste PEM only to replace the sandbox-shared key in Secret Manager.';
    }
    return 'Private key is not shown in the browser. Paste PEM only to replace the stored key.';
  }

  function syncCredentialFieldVisibility() {
    var hasCred = lastHasCredential;
    var needsKey = !hasCred;
    var replaceDetails = els.credentialReplaceDetails;
    var hint = els.credentialHint;
    var row = els.credentialRow;

    applyCredentialBadge(hasCred);

    if (row) row.classList.toggle('sf-gen-cred-row--ready', hasCred);
    if (row) row.classList.toggle('sf-gen-cred-row--needs-action', needsKey);

    if (hint) {
      if (needsKey) {
        hint.hidden = false;
        hint.textContent = credentialActionHintText();
      } else {
        hint.hidden = false;
        hint.textContent = credentialReadyHintText();
      }
    }

    if (replaceDetails) {
      replaceDetails.classList.toggle('sf-gen-cred-replace--needs-key', needsKey);
      replaceDetails.hidden = false;
      replaceDetails.open = needsKey;
    }

    if (els.credentialReplaceSummary) {
      els.credentialReplaceSummary.hidden = needsKey;
      if (!needsKey) {
        els.credentialReplaceSummary.textContent =
          'Stored in Secret Manager — expand to replace key';
      }
    }
  }

  /** Re-render connection summary + credential row from module state (no GET). */
  function refreshConnectionUi() {
    syncCredentialFieldVisibility();
    updateConnectionSummary();
  }

  function updateConnectionSummary() {
    var st = els.connectionSummaryStatus;
    if (!st) return;
    setConnectionSummaryTone('');
    var sandbox = readSandbox();
    if (!sandbox) {
      st.textContent = 'Pick a sandbox in Global values';
      syncConnectionPanelOpen();
      return;
    }
    if (lastSnowflakeTestOk) {
      st.textContent = 'Connected — expand to edit or retest';
      setConnectionSummaryTone('connected');
      syncConnectionPanelOpen();
      return;
    }
    if (isConnectionReady()) {
      st.textContent = 'Snowflake ready — credential in Secret Manager';
      setConnectionSummaryTone('verified');
      syncConnectionPanelOpen();
      return;
    }

    var account = readConnectionAccount();
    var user = readConnectionUser();
    var configState = lastConfigMeta.configState || '';

    if (configState === 'saved_no_credential' && account && user) {
      st.textContent = 'Incomplete — add credential & Save';
      setConnectionSummaryTone('incomplete');
    } else if (configState === 'preset_only' && account && user) {
      st.textContent = 'Incomplete — paste key & Save';
      setConnectionSummaryTone('incomplete');
    } else if (account && user) {
      st.textContent = 'Incomplete — add credential & Save';
      setConnectionSummaryTone('incomplete');
    } else if (account || user) {
      st.textContent = 'Incomplete — expand to finish';
      setConnectionSummaryTone('incomplete');
    } else {
      st.textContent = 'Not configured — expand to edit';
    }
    syncConnectionPanelOpen();
  }

  function syncConnectionUi(rec) {
    if (rec === null) {
      lastHasCredential = false;
      lastCredentialSetAt = null;
    } else if (rec && typeof rec.hasCredential === 'boolean') {
      lastHasCredential = rec.hasCredential;
      if ('credentialSetAt' in rec) lastCredentialSetAt = rec.credentialSetAt || null;
    }
    refreshConnectionUi();
  }

  function rememberConfigMeta(body, rec) {
    var configState = (rec && rec.configState) || '';
    if (!configState && rec) {
      if (rec.account && rec.hasCredential) configState = 'saved_ready';
      else if (rec.account && !rec.hasCredential) configState = 'saved_no_credential';
      else if (rec.presetSource && rec.hasCredential) configState = 'preset_with_credential';
      else if (rec.presetSource) configState = 'preset_only';
      else if (rec.docExists) configState = 'saved_incomplete';
      else configState = 'empty';
    }
    lastHasCredential = !!(rec && rec.hasCredential);
    lastCredentialSetAt = (rec && rec.credentialSetAt) || null;
    lastConfigMeta = {
      configState: configState,
      labUserUidPrefix: (body && body.labUserUidPrefix) || lastConfigMeta.labUserUidPrefix || '',
      labUserEmail: (body && body.labUserEmail) || lastConfigMeta.labUserEmail || '',
      labUserDisplayName: (body && body.labUserDisplayName) || lastConfigMeta.labUserDisplayName || '',
      presetNote: (rec && rec.presetNote) || '',
      credentialScope: (rec && rec.credentialScope) || 'user',
    };
    clearLegacyAnonymousUidAfterMigration(body);
  }

  function labUserUidHint(body) {
    return labUserIdentityHint(body);
  }

  function configLoadMessage(rec, sandbox, body) {
    var state = rec && rec.configState;
    var uidHint = labUserUidHint(body);
    if (state === 'saved_ready') {
      var sharedNote = rec && rec.credentialScope === 'sandbox_shared' ? sandboxSharedLabel(sandbox) : '';
      return 'Loaded saved Snowflake config for sandbox "' + sandbox + '".' + sharedNote + uidHint;
    }
    if (state === 'saved_no_credential') {
      return (
        'Loaded saved connection fields for sandbox "' + sandbox +
        '". Paste your PEM private key and Save once.' +
        uidHint
      );
    }
    if (state === 'preset_with_credential') {
      return (
        (rec.presetNote ||
          'Credential is saved for this lab user but connection fields were empty.') +
        uidHint +
        ' Click Save with the preset values (or edit fields first).'
      );
    }
    if (state === 'preset_only') {
      var sharedPreset =
        isSandboxSharedCredential(sandbox)
          ? ' Paste your .p8 and Save once to store in Secret Manager for sandbox ' +
            sandbox +
            ' (shared across browsers).'
          : ' Paste your PEM private key and Save once (connection fields are preset, not saved to Firestore until you Save).';
      return (
        'AgenticAI travel defaults applied for sandbox "' + sandbox + '".' +
        sharedPreset +
        uidHint
      );
    }
    if (rec && rec.account) {
      return 'Loaded config for sandbox "' + sandbox + '".' + uidHint;
    }
    return 'No saved config yet for sandbox "' + sandbox + '" — fill the form and save.' + uidHint;
  }

  function authHeaders() {
    return new Promise(function (resolve) {
      try {
        var f = window.firebase;
        if (!f || !f.auth) {
          resolve({});
          return;
        }
        var u = f.auth().currentUser;
        if (!u) {
          resolve({});
          return;
        }
        u.getIdToken().then(function (t) {
          resolve(t ? { Authorization: 'Bearer ' + t } : {});
        }).catch(function () {
          resolve({});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  function ensureFirebaseReady() {
    if (window.__aepLabSyncReady && typeof window.__aepLabSyncReady.then === 'function') {
      return window.__aepLabSyncReady;
    }
    return Promise.resolve();
  }

  function setMessage(text, tone, extras) {
    var node = els.message;
    if (!node) return;
    if (!text) {
      node.hidden = true;
      node.removeAttribute('data-tone');
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.setAttribute('data-tone', tone || 'info');
    node.textContent = '';
    var p = document.createElement('div');
    p.textContent = text;
    node.appendChild(p);
    if (extras && extras.hints && extras.hints.length) {
      var ul = document.createElement('ul');
      for (var i = 0; i < extras.hints.length; i++) {
        var li = document.createElement('li');
        li.textContent = extras.hints[i];
        ul.appendChild(li);
      }
      node.appendChild(ul);
    }
  }

  function setDebug(endpoint, request, status, response) {
    if (els.debugEndpoint) els.debugEndpoint.textContent = endpoint || '';
    if (els.debugRequest) els.debugRequest.textContent = request ? safeStringify(request) : '';
    if (els.debugStatus) els.debugStatus.textContent = status == null ? '' : String(status);
    if (els.debugResponse) els.debugResponse.textContent = response ? safeStringify(response) : '';
    if (els.debug) els.debug.hidden = false;
  }

  function safeStringify(v) {
    try {
      return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    } catch (_) {
      return String(v);
    }
  }

  function setBusy(busy) {
    if (els.form) els.form.setAttribute('aria-busy', busy ? 'true' : 'false');
    var ids = ['saveBtn', 'testBtn', 'clearCredBtn', 'fillPresetBtn'];
    for (var i = 0; i < ids.length; i++) {
      var b = els[ids[i]];
      if (b) b.disabled = !!busy;
    }
  }

  function isKeyPairMode() {
    return els.authMethod && els.authMethod.value === 'keyPair';
  }

  function reflectAuthMethod() {
    var method = els.authMethod ? els.authMethod.value : 'password';
    if (els.passphraseRow) els.passphraseRow.hidden = method !== 'keyPair';
    if (els.keyPairExtras) els.keyPairExtras.hidden = method !== 'keyPair';
    if (els.keyDropTarget) {
      if (method === 'keyPair') {
        els.keyDropTarget.classList.add('sf-gen-key-drop-target--keypair');
      } else {
        els.keyDropTarget.classList.remove('sf-gen-key-drop-target--keypair');
        els.keyDropTarget.classList.remove('sf-gen-key-drop-target--active');
      }
    }
    if (!els.credentialLabel) return;
    if (method === 'keyPair') {
      els.credentialLabel.textContent = 'Private key (PEM, including BEGIN/END lines)';
      els.credential.placeholder =
        'Paste PEM, use Choose file…, or drop a .p8 here — leave blank to keep the previously saved value';
    } else if (method === 'pat') {
      els.credentialLabel.textContent = 'Programmatic access token';
      els.credential.placeholder = 'Paste PAT — leave blank to keep the previously saved value';
    } else {
      els.credentialLabel.textContent = 'Password';
      els.credential.placeholder = 'Paste password — leave blank to keep the previously saved value';
    }
  }

  function looksLikePemPrivateKey(text) {
    var t = String(text || '').trim();
    if (t.indexOf('-----BEGIN') === -1) return false;
    if (t.indexOf('-----END') === -1) return false;
    return /PRIVATE KEY|RSA PRIVATE KEY|ENCRYPTED PRIVATE KEY|EC PRIVATE KEY/.test(t);
  }

  function ingestKeyFile(file) {
    if (!file) return Promise.reject(new Error('No file selected.'));
    if (file.size > KEY_FILE_MAX_BYTES) {
      return Promise.reject(new Error('File is too large (max 256 KB).'));
    }
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var text = String(r.result || '').replace(/^\uFEFF/, '').trim();
        if (!looksLikePemPrivateKey(text)) {
          reject(new Error('File does not look like a PEM private key (expected -----BEGIN … PRIVATE KEY-----).'));
          return;
        }
        if (els.credential) els.credential.value = text;
        resolve(text.length);
      };
      r.onerror = function () {
        reject(new Error('Could not read file.'));
      };
      r.readAsText(file);
    });
  }

  function bindKeyFileUi() {
    if (!els.keyFilePick || !els.keyFile || !els.keyDropTarget) return;

    els.keyFilePick.addEventListener('click', function () {
      if (!isKeyPairMode()) return;
      els.keyFile.click();
    });

    els.keyFile.addEventListener('change', function (e) {
      var input = e.target;
      var f = input && input.files && input.files[0];
      if (!f) return;
      ingestKeyFile(f)
        .then(function () {
          setMessage('Loaded private key from file "' + f.name + '". Review the PEM, then Save.', 'success');
        })
        .catch(function (err) {
          setMessage(err && err.message ? err.message : String(err), 'error');
        })
        .then(function () {
          input.value = '';
        });
    });

    var dropDepth = 0;
    els.keyDropTarget.addEventListener('dragenter', function (e) {
      if (!isKeyPairMode()) return;
      e.preventDefault();
      e.stopPropagation();
      dropDepth++;
      els.keyDropTarget.classList.add('sf-gen-key-drop-target--active');
    });
    els.keyDropTarget.addEventListener('dragleave', function (e) {
      if (!isKeyPairMode()) return;
      e.preventDefault();
      e.stopPropagation();
      dropDepth = Math.max(0, dropDepth - 1);
      if (dropDepth === 0) els.keyDropTarget.classList.remove('sf-gen-key-drop-target--active');
    });
    els.keyDropTarget.addEventListener('dragover', function (e) {
      if (!isKeyPairMode()) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.dataTransfer.dropEffect = 'copy';
      } catch (_) {}
    });
    els.keyDropTarget.addEventListener('drop', function (e) {
      if (!isKeyPairMode()) return;
      e.preventDefault();
      e.stopPropagation();
      dropDepth = 0;
      els.keyDropTarget.classList.remove('sf-gen-key-drop-target--active');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) {
        setMessage('Drop a single .p8 or PEM file (not a folder).', 'info');
        return;
      }
      ingestKeyFile(f)
        .then(function () {
          setMessage('Loaded private key from dropped file "' + f.name + '". Review the PEM, then Save.', 'success');
        })
        .catch(function (err) {
          setMessage(err && err.message ? err.message : String(err), 'error');
        });
    });
  }

  function reflectCredentialState(rec) {
    syncConnectionUi(rec);
  }

  function applyRecordToForm(rec) {
    if (!rec) {
      reflectCredentialState(null);
      return;
    }
    if (els.account) els.account.value = rec.account || '';
    if (els.user) els.user.value = rec.user || '';
    if (els.role) els.role.value = rec.role || '';
    if (els.warehouse) els.warehouse.value = rec.warehouse || '';
    if (els.database) els.database.value = rec.database || '';
    if (els.schema) els.schema.value = rec.schema || '';
    if (els.authMethod && rec.authMethod) els.authMethod.value = rec.authMethod;
    reflectAuthMethod();
    reflectCredentialState(rec);
  }

  function readForm() {
    var payload = {
      sandbox: readSandbox(),
      account: els.account ? els.account.value.trim() : '',
      user: els.user ? els.user.value.trim() : '',
      role: els.role ? els.role.value.trim() : '',
      warehouse: els.warehouse ? els.warehouse.value.trim() : '',
      database: els.database ? els.database.value.trim() : '',
      schema: els.schema ? els.schema.value.trim() : '',
      authMethod: els.authMethod ? els.authMethod.value : 'password',
    };
    if (els.credential && els.credential.value.trim().length > 0) {
      payload.credential = els.credential.value;
    }
    if (payload.authMethod === 'keyPair' && els.keyPassphrase && els.keyPassphrase.value.length > 0) {
      payload.keyPassphrase = els.keyPassphrase.value;
    }
    return payload;
  }

  function snowflakeQuerySuffix(currentUid) {
    var legacy = readLegacyAnonymousUid(currentUid);
    return legacy ? '&legacyAnonymousUid=' + encodeURIComponent(legacy) : '';
  }

  function attachLegacyAnonymousPayload(payload, currentUid) {
    var legacy = readLegacyAnonymousUid(currentUid);
    if (legacy) payload.legacyAnonymousUid = legacy;
    return payload;
  }

  function handleSnowflakeAuthError(body) {
    if (body && body.code === 'AUTH_PORTAL_LOGIN_REQUIRED') {
      setMessage(portalLoginRequiredMessage(), 'error');
      return true;
    }
    return false;
  }

  function currentFirebaseUid() {
    try {
      var f = window.firebase;
      if (!f || !f.auth || !f.auth().currentUser) return '';
      return String(f.auth().currentUser.uid || '');
    } catch (_) {
      return '';
    }
  }

  function loadConfig() {
    var sandbox = readSandbox();
    var seq = ++loadConfigSeq;
    lastSnowflakeTestOk = false;
    captureLegacyAnonymousUid();
    if (!sandbox) {
      syncConnectionUi(null);
      setMessage(
        'Pick a sandbox from Global values before configuring Snowflake. Credentials bind to your Portal login, per sandbox.',
        'info'
      );
      return Promise.resolve();
    }
    if (!hasPortalLogin()) {
      syncConnectionUi(null);
      setMessage(portalLoginRequiredMessage(), 'error');
      return Promise.resolve();
    }
    setBusy(true);
    setMessage('Loading saved Snowflake config…', 'info');
    return authHeaders().then(function (h) {
      if (!h.Authorization) {
        setMessage('Firebase auth is initializing — refresh the page in a second.', 'info');
        return null;
      }
      var url =
        '/api/snowflake/config?sandbox=' +
        encodeURIComponent(sandbox) +
        snowflakeQuerySuffix(currentFirebaseUid());
      return fetch(url, { headers: h }).then(function (res) {
        return res.json().then(function (body) {
          if (seq !== loadConfigSeq) return;
          setDebug('GET ' + url, null, res.status, body);
          if (res.ok && body && body.ok) {
            var rec = body.record || null;
            lastSnowflakeTestOk = false;
            rememberConfigMeta(body, rec);
            applyRecordToForm(rec);
            if (body.migratedFromAnonymous) {
              setMessage(
                'Migrated Snowflake config from your previous anonymous browser session.' +
                  labUserIdentityHint(body),
                'success'
              );
            }
            if (isApalmerSandbox(sandbox) && (!rec || !rec.account)) {
              applyAgenticTravelPreset(true, false);
              var mergedRec = Object.assign({}, rec || {}, {
                account: PRESET_AGENTIC_TRAVEL_DEMO.account,
                user: PRESET_AGENTIC_TRAVEL_DEMO.user,
                hasCredential: !!(rec && rec.hasCredential),
              });
              if (!mergedRec.configState) {
                mergedRec.configState = mergedRec.hasCredential ? 'preset_with_credential' : 'preset_only';
              }
              rememberConfigMeta(body, mergedRec);
              reflectCredentialState(mergedRec);
              if (!body.migratedFromAnonymous) {
                setMessage(configLoadMessage(mergedRec, sandbox, body), 'info');
              }
            } else if (!body.migratedFromAnonymous) {
              setMessage(configLoadMessage(rec, sandbox, body), 'info');
            }
          } else if (!handleSnowflakeAuthError(body)) {
            setMessage((body && body.error) || ('Failed to load config (HTTP ' + res.status + ')'), 'error');
          }
        });
      });
    }).catch(function (e) {
      setMessage('Network error while loading config: ' + (e && e.message || e), 'error');
    }).then(function () {
      setBusy(false);
    });
  }

  function saveConfig() {
    if (!hasPortalLogin()) {
      setMessage(portalLoginRequiredMessage(), 'error');
      openPortalLoginHint();
      return;
    }
    var payload = readForm();
    if (!payload.sandbox) {
      setMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    if (!payload.account || !payload.user) {
      setMessage('Account and user are required before saving.', 'error');
      return;
    }
    setBusy(true);
    setMessage('Saving connection…', 'info');
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setMessage('Sign-in not ready yet — try again in a second.', 'error');
        setBusy(false);
        return;
      }
      attachLegacyAnonymousPayload(payload, currentFirebaseUid());
      var url = '/api/snowflake/config';
      var body = JSON.stringify(payload);
      // Redact secret-like fields from the debug pane.
      var debugPayload = Object.assign({}, payload);
      if (debugPayload.credential) debugPayload.credential = '«redacted, length=' + payload.credential.length + '»';
      if (debugPayload.keyPassphrase) debugPayload.keyPassphrase = '«redacted»';
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: body,
      }).then(function (res) {
        return res.json().then(function (data) {
          setDebug('POST ' + url, debugPayload, res.status, data);
          if (res.ok && data && data.ok) {
            lastSnowflakeTestOk = false;
            rememberConfigMeta(data, data.record || null);
            applyRecordToForm(data.record || null);
            if (els.credential) els.credential.value = '';
            if (els.keyPassphrase) els.keyPassphrase.value = '';
            setMessage(
              'Saved for ' + (portalLoginLabel() || 'your Portal account') +
                '. Click Test connection to validate the IP allowlist round-trip.',
              'success'
            );
          } else if (!handleSnowflakeAuthError(data)) {
            setMessage((data && data.error) || ('Save failed (HTTP ' + res.status + ')'), 'error');
          }
        });
      }).catch(function (e) {
        setMessage('Network error while saving: ' + (e && e.message || e), 'error');
      }).then(function () {
        setBusy(false);
      });
    });
  }

  function testConnection() {
    if (!hasPortalLogin()) {
      setMessage(portalLoginRequiredMessage(), 'error');
      openPortalLoginHint();
      return;
    }
    var sandbox = readSandbox();
    if (!sandbox) {
      setMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    setBusy(true);
    setMessage('Opening Snowflake connection (egress via static IP ' + STATIC_EGRESS_IP + ')…', 'info');
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setMessage('Sign-in not ready yet — try again in a second.', 'error');
        setBusy(false);
        return;
      }
      var testPayload = attachLegacyAnonymousPayload({ sandbox: sandbox }, currentFirebaseUid());
      var url = '/api/snowflake/connection-test';
      var body = JSON.stringify(testPayload);
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: body,
      }).then(function (res) {
        return res.json().then(function (data) {
          setDebug('POST ' + url, testPayload, res.status, data);
          var result = data && data.result;
          if (res.ok && result && result.ok) {
            var line = 'Connected — Snowflake ' + (result.version || 'unknown') +
              ' (account ' + (result.account || '?') + ').';
            lastSnowflakeTestOk = true;
            refreshConnectionUi();
            setMessage(line, 'success');
          } else {
            lastSnowflakeTestOk = false;
            refreshConnectionUi();
            var msg = (result && result.error && result.error.message) || (data && data.error) ||
              'Connection test failed (HTTP ' + res.status + ').';
            if (!handleSnowflakeAuthError(data)) {
              var hints = result && result.error && Array.isArray(result.error.hints) ? result.error.hints : [];
              setMessage(msg, 'error', { hints: hints });
            }
          }
        });
      }).catch(function (e) {
        setMessage('Network error during connection test: ' + (e && e.message || e), 'error');
      }).then(function () {
        setBusy(false);
      });
    });
  }

  function clearCredential() {
    if (!hasPortalLogin()) {
      setMessage(portalLoginRequiredMessage(), 'error');
      openPortalLoginHint();
      return;
    }
    var sandbox = readSandbox();
    if (!sandbox) {
      setMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    if (!window.confirm('Delete the stored Snowflake credential for sandbox "' + sandbox + '"?\n\nThis removes the secret in Secret Manager. Connection tests will fail until a new credential is saved.')) {
      return;
    }
    setBusy(true);
    setMessage('Clearing stored credential…', 'info');
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setMessage('Sign-in not ready yet — try again in a second.', 'error');
        setBusy(false);
        return;
      }
      var url = '/api/snowflake/config';
      var payload = attachLegacyAnonymousPayload(
        { sandbox: sandbox, clearCredential: true, clearKeyPassphrase: true },
        currentFirebaseUid()
      );
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (data) {
          setDebug('POST ' + url, payload, res.status, data);
          if (res.ok && data && data.ok) {
            rememberConfigMeta(data, data.record || null);
            applyRecordToForm(data.record || null);
            setMessage('Credential cleared.', 'info');
          } else {
            setMessage((data && data.error) || ('Clear failed (HTTP ' + res.status + ')'), 'error');
          }
        });
      }).catch(function (e) {
        setMessage('Network error while clearing: ' + (e && e.message || e), 'error');
      }).then(function () {
        setBusy(false);
      });
    });
  }

  function setGenerateMessage(text, tone, extras) {
    var node = els.genMessage;
    if (!node) return;
    if (!text) {
      node.hidden = true;
      node.removeAttribute('data-tone');
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.setAttribute('data-tone', tone || 'info');
    node.textContent = '';
    var p = document.createElement('div');
    p.textContent = text;
    node.appendChild(p);
    if (extras && extras.hints && extras.hints.length) {
      var ul = document.createElement('ul');
      for (var i = 0; i < extras.hints.length; i++) {
        var li = document.createElement('li');
        li.textContent = extras.hints[i];
        ul.appendChild(li);
      }
      node.appendChild(ul);
    }
  }

  function setGenerateDebug(endpoint, request, status, response) {
    if (els.genDebugEndpoint) els.genDebugEndpoint.textContent = endpoint || '';
    if (els.genDebugRequest) els.genDebugRequest.textContent = request ? safeStringify(request) : '';
    if (els.genDebugStatus) els.genDebugStatus.textContent = status == null ? '' : String(status);
    if (els.genDebugResponse) els.genDebugResponse.textContent = response ? safeStringify(response) : '';
    if (els.genDebug) els.genDebug.hidden = false;
  }

  function setGenerateBusy(busy) {
    if (els.genForm) els.genForm.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (els.generateBtn) els.generateBtn.disabled = !!busy;
    if (els.genBatchLoadBtn) els.genBatchLoadBtn.disabled = !!busy;
    if (els.genBatchClearBtn) els.genBatchClearBtn.disabled = !!busy;
  }

  function showGenerateResult(result) {
    if (!els.genResult) return;
    if (!result || !result.ok) {
      els.genResult.hidden = true;
      return;
    }
    els.genResult.hidden = false;
    if (els.genResultRowcount) els.genResultRowcount.textContent = String(result.rowcount || 0);
    if (els.genResultTable) els.genResultTable.textContent = result.table || '—';
    if (els.genResultSample) {
      els.genResultSample.textContent = Array.isArray(result.sample) && result.sample.length
        ? safeStringify(result.sample)
        : '(no rows generated)';
    }
  }

  function readGenerateForm() {
    var count = els.genCount ? parseInt(els.genCount.value, 10) : 10;
    if (!Number.isFinite(count) || count <= 0) count = 10;
    var batchSize = els.genBatchSize ? parseInt(els.genBatchSize.value, 10) : NaN;
    var payload = {
      sandbox: readSandbox(),
      count: count,
      industry: readIndustry(),
    };
    if (Number.isFinite(batchSize) && batchSize > 0) payload.batchSize = batchSize;
    return payload;
  }

  function setIndustryMessage(text, tone) {
    var node = els.industryMessage;
    if (!node) return;
    node.hidden = !text;
    node.textContent = text || '';
    if (text) node.setAttribute('data-tone', tone || 'info');
    else node.removeAttribute('data-tone');
  }

  function setIndustryBusy(busy) {
    [els.industry, els.industryRefreshBtn, els.industryDryRunBtn, els.industryProvisionBtn]
      .forEach(function (node) { if (node) node.disabled = !!busy; });
    if (!busy) {
      if (els.industryDryRunBtn) els.industryDryRunBtn.disabled = !industryCatalog;
      if (els.industryProvisionBtn) {
        var recipe = industryCatalog && selectedProvisionRecipe(industryCatalog.manifest);
        var missing = industryCatalog && industryCatalog.tableCheck
          ? Number(industryCatalog.tableCheck.missingCount)
          : null;
        els.industryProvisionBtn.disabled =
          !industryCatalog || (recipe && recipe.provisionMode === 'preinstalled') || missing === 0;
      }
    }
  }

  function selectedProvisionRecipe(manifest) {
    var recipes = manifest && Array.isArray(manifest.provisionRecipes)
      ? manifest.provisionRecipes
      : [];
    var industry = readIndustry();
    var preferred = industry === 'travel'
      ? 'travel.agentic_all.preinstalled.v1'
      : industry + '.all.v1';
    return recipes.find(function (recipe) { return recipe.id === preferred; }) || recipes[0] || null;
  }

  function profileSignal(profile) {
    var columns = profile && profile.columns || {};
    var keys = [
      'CUSTOMERSEGMENT', 'FANSEGMENT', 'CREDITSCOREBAND', 'PLANTIER',
      'SUBSCRIPTIONTIER', 'PREFERREDCABINCLASS', 'LOYALTYID',
    ];
    for (var i = 0; i < keys.length; i++) {
      if (columns[keys[i]] != null && columns[keys[i]] !== '') return columns[keys[i]];
    }
    return '—';
  }

  function renderEventTypes(types) {
    if (!els.eventTypes) return;
    els.eventTypes.textContent = '';
    (Array.isArray(types) ? types : []).forEach(function (type, index) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = type;
      input.checked = index === 0;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + titleCase(type)));
      els.eventTypes.appendChild(label);
    });
  }

  function reflectIndustrySelection() {
    var industry = readIndustry();
    var fallback = INDUSTRY_UI_FALLBACKS[industry] || INDUSTRY_UI_FALLBACKS.travel;
    [els.industryProfileTable, els.queryTableName, els.generateTargetTable].forEach(function (node) {
      if (node) node.textContent = fallback.table;
    });
    renderEventTypes(fallback.events);
    if (els.travelAdvanced) els.travelAdvanced.hidden = industry !== 'travel';
    if (els.travelRunnerHint) els.travelRunnerHint.hidden = industry !== 'travel';
    if (els.profileBundleBtn) els.profileBundleBtn.hidden = industry === 'travel';
  }

  function renderIndustryCatalog(result) {
    industryCatalog = result || null;
    var manifest = result && result.manifest;
    if (!manifest) return;
    var profileTables = manifest.phaseTables && manifest.phaseTables.profile;
    var profileTable = (profileTables && profileTables[0])
      || (manifest.baseProfiles && manifest.baseProfiles.table)
      || (manifest.dualLoad && manifest.dualLoad.defaultTargetTable)
      || '—';
    [els.industryProfileTable, els.queryTableName, els.generateTargetTable].forEach(function (node) {
      if (node) node.textContent = profileTable;
    });
    renderEventTypes(manifest.enrichEventTypes);

    var tableCheck = result.tableCheck || { tables: {}, existingCount: 0, missingCount: 0 };
    var allTables = Array.isArray(manifest.allTables) ? manifest.allTables : [];
    if (els.industryTableGrid) {
      els.industryTableGrid.textContent = '';
      allTables.forEach(function (table) {
        var status = tableCheck.tables && tableCheck.tables[table];
        var item = document.createElement('div');
        item.className = 'sf-gen-table-status ' +
          (status && status.exists ? 'sf-gen-table-status--ready' : 'sf-gen-table-status--missing');
        var name = document.createElement('code');
        name.textContent = table;
        var badge = document.createElement('span');
        badge.textContent = status && status.exists ? 'Ready' : 'Missing';
        item.appendChild(name);
        item.appendChild(badge);
        els.industryTableGrid.appendChild(item);
      });
    }
    if (els.industryReadinessStatus) {
      els.industryReadinessStatus.textContent = tableCheck.missingCount === 0
        ? allTables.length + ' of ' + allTables.length + ' tables ready'
        : tableCheck.existingCount + ' ready · ' + tableCheck.missingCount + ' missing';
    }
    if (els.industryTableDetailsStatus) {
      els.industryTableDetailsStatus.textContent = tableCheck.missingCount === 0
        ? allTables.length + ' tables ready'
        : tableCheck.missingCount + ' of ' + allTables.length + ' tables missing';
    }
    var recipe = selectedProvisionRecipe(manifest);
    var travelPreinstalled = recipe && recipe.provisionMode === 'preinstalled';
    if (els.industryProvisionBtn) {
      els.industryProvisionBtn.disabled = travelPreinstalled || tableCheck.missingCount === 0;
      els.industryProvisionBtn.textContent = travelPreinstalled ? 'Travel tables are preinstalled' : 'Create missing tables';
    }
    if (els.travelAdvanced) els.travelAdvanced.hidden = readIndustry() !== 'travel';
    if (els.travelRunnerHint) els.travelRunnerHint.hidden = readIndustry() !== 'travel';
    if (els.profileBundleBtn) els.profileBundleBtn.hidden = readIndustry() === 'travel';
  }

  function loadIndustryCatalog(checkTables) {
    var sandbox = readSandbox();
    if (!sandbox) {
      setIndustryMessage('Pick a sandbox from Global values first.', 'error');
      return Promise.resolve();
    }
    setIndustryBusy(true);
    setIndustryMessage('Checking the governed ' + titleCase(readIndustry()) + ' manifest…', 'info');
    return authHeaders().then(function (h) {
      if (!h.Authorization) throw new Error('Sign-in not ready yet.');
      return fetch('/api/snowflake/industry-catalog', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({
          sandbox: sandbox,
          industry: readIndustry(),
          checkTables: checkTables !== false,
        }),
      });
    }).then(function (res) {
      return res.json().then(function (body) {
        var result = body && body.result;
        if (!res.ok || !result || !result.ok) {
          throw new Error((result && result.error && result.error.message) || body.error || 'Catalog check failed.');
        }
        renderIndustryCatalog(result);
        setIndustryMessage(
          result.tableCheckSkipped ? 'Industry manifest loaded.' : 'Snowflake readiness check completed.',
          'success'
        );
      });
    }).catch(function (error) {
      if (els.industryTableDetails) els.industryTableDetails.open = true;
      setIndustryMessage(error && error.message || String(error), 'error');
    }).then(function () {
      setIndustryBusy(false);
    });
  }

  function provisionIndustry(dryRun) {
    var manifest = industryCatalog && industryCatalog.manifest;
    var recipe = selectedProvisionRecipe(manifest);
    if (!recipe) {
      setIndustryMessage('Load the industry manifest before provisioning.', 'error');
      return;
    }
    setIndustryBusy(true);
    setIndustryMessage(dryRun ? 'Preparing allowlisted SQL preview…' : 'Creating missing allowlisted tables…', 'info');
    authHeaders().then(function (h) {
      if (!h.Authorization) throw new Error('Sign-in not ready yet.');
      return fetch('/api/snowflake/provision', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({
          sandbox: readSandbox(),
          industry: readIndustry(),
          recipe_id: recipe.id,
          dry_run: !!dryRun,
        }),
      });
    }).then(function (res) {
      return res.json().then(function (body) {
        var result = body && body.result;
        if (!res.ok || !result || !result.ok) {
          throw new Error((result && result.error && result.error.message) || body.error || 'Provisioning failed.');
        }
        if (els.industryProvisionOut) {
          els.industryProvisionOut.hidden = false;
          els.industryProvisionOut.textContent = safeStringify(result);
        }
        setIndustryMessage(dryRun ? 'Provisioning preview ready.' : 'Table provisioning completed.', 'success');
        if (!dryRun) return loadIndustryCatalog(true);
      });
    }).catch(function (error) {
      setIndustryMessage(error && error.message || String(error), 'error');
    }).then(function () {
      setIndustryBusy(false);
    });
  }

  function setUpdaterMessage(text, tone, extras) {
    var node = els.updaterMessage;
    if (!node) return;
    if (!text) {
      node.hidden = true;
      node.removeAttribute('data-tone');
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.setAttribute('data-tone', tone || 'info');
    node.textContent = '';
    var p = document.createElement('div');
    p.textContent = text;
    node.appendChild(p);
    if (extras && extras.hints && extras.hints.length) {
      var ul = document.createElement('ul');
      for (var i = 0; i < extras.hints.length; i++) {
        var li = document.createElement('li');
        li.textContent = extras.hints[i];
        ul.appendChild(li);
      }
      node.appendChild(ul);
    }
  }

  function setUpdaterBusy(busy) {
    if (els.updaterForm) els.updaterForm.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (els.loadProfilesBtn) els.loadProfilesBtn.disabled = !!busy;
    if (els.enrichBtn) els.enrichBtn.disabled = !!busy;
    if (els.profileBundleBtn) els.profileBundleBtn.disabled = !!busy;
  }

  function setFullGenMessage(text, tone) {
    var node = els.fullGenMessage;
    if (!node) return;
    if (!text) {
      node.hidden = true;
      node.removeAttribute('data-tone');
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.setAttribute('data-tone', tone || 'info');
    node.textContent = text;
  }

  function setFullGenBusy(busy) {
    if (els.fullGenForm) els.fullGenForm.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (els.fullGenBtn) els.fullGenBtn.disabled = !!busy;
  }

  function renderProfileRows(rows) {
    loadedProfiles = Array.isArray(rows) ? rows : [];
    var tb = els.profileTbody;
    if (!tb) return;
    tb.textContent = '';
    for (var i = 0; i < loadedProfiles.length; i++) {
      var r = loadedProfiles[i];
      var tr = document.createElement('tr');
      var td0 = document.createElement('td');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'sf-pick';
      cb.setAttribute('data-idx', String(i));
      td0.appendChild(cb);
      tr.appendChild(td0);
      function cell(t) {
        var td = document.createElement('td');
        td.textContent = t == null ? '' : String(t);
        tr.appendChild(td);
      }
      cell(r.crmId);
      cell(r.email);
      cell(profileSignal(r));
      cell(r.createdAt);
      tb.appendChild(tr);
    }
    if (els.selectAll) els.selectAll.checked = false;
  }

  function loadProfiles() {
    var sandbox = readSandbox();
    if (!sandbox) {
      setUpdaterMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    setUpdaterBusy(true);
    setUpdaterMessage('Loading profiles…', 'info');
    if (els.profileBundleOut) els.profileBundleOut.hidden = true;
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setUpdaterMessage('Sign-in not ready yet — try again in a second.', 'error');
        setUpdaterBusy(false);
        return;
      }
      var url = '/api/snowflake/agentic/query-profiles';
      var body = JSON.stringify({
        sandbox: sandbox,
        filterType: els.filterType ? els.filterType.value : 'all',
        timePeriod: els.timePeriod ? els.timePeriod.value : 'all_time',
        limit: els.queryLimit ? parseInt(els.queryLimit.value, 10) : 50,
        industry: readIndustry(),
      });
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: body,
      }).then(function (res) {
        return res.json().then(function (data) {
          var result = data && data.result;
          if (res.ok && result && result.ok && Array.isArray(result.profiles)) {
            renderProfileRows(result.profiles);
            setUpdaterMessage('Loaded ' + result.profiles.length + ' profile(s).', 'success');
          } else {
            var msg = (result && result.error && result.error.message) || (data && data.error) ||
              ('Query failed (HTTP ' + res.status + ').');
            var hints = result && result.error && Array.isArray(result.error.hints) ? result.error.hints : [];
            setUpdaterMessage(msg, 'error', { hints: hints });
            renderProfileRows([]);
          }
        });
      }).catch(function (e) {
        setUpdaterMessage('Network error: ' + (e && e.message || e), 'error');
      }).then(function () {
        setUpdaterBusy(false);
      });
    });
  }

  function getCheckedEventTypes() {
    var root = els.eventTypes;
    if (!root) return [];
    var out = [];
    var inputs = root.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].checked) out.push(inputs[i].value);
    }
    return out;
  }

  function enrichSelected() {
    var sandbox = readSandbox();
    if (!sandbox) {
      setUpdaterMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    var picks = document.querySelectorAll('.sf-pick:checked');
    var profiles = [];
    for (var i = 0; i < picks.length; i++) {
      var idx = parseInt(picks[i].getAttribute('data-idx'), 10);
      if (!Number.isFinite(idx) || !loadedProfiles[idx]) continue;
      var p = loadedProfiles[idx];
      profiles.push({
        crmId: p.crmId,
        ecid: p.ecid,
        email: p.email,
        phoneNumber: p.phoneNumber || '+447425627462',
        loyaltyId: p.loyaltyId,
      });
    }
    if (!profiles.length) {
      setUpdaterMessage('Select at least one profile row.', 'error');
      return;
    }
    var eventTypes = getCheckedEventTypes();
    if (!eventTypes.length) {
      setUpdaterMessage('Select at least one event type.', 'error');
      return;
    }
    setUpdaterBusy(true);
    setUpdaterMessage('Enriching ' + profiles.length + ' profile(s)… This may take several minutes.', 'info');
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setUpdaterMessage('Sign-in not ready yet — try again in a second.', 'error');
        setUpdaterBusy(false);
        return;
      }
      var url = '/api/snowflake/agentic/enrich-profiles';
      var payload = {
        sandbox: sandbox,
        industry: readIndustry(),
        profiles: profiles,
        eventTypes: eventTypes,
      };
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (data) {
          var result = data && data.result;
          if (res.status === 501) {
            setUpdaterMessage(
              (data.result && data.result.error && data.result.error.message) ||
                'Full enrich is not configured (set AGENTIC_TRAVEL_RUNNER_URL on the Cloud Function).',
              'error'
            );
            return;
          }
          if (res.ok && data && data.ok && data.result && data.result.ok) {
            if (data.result.data) {
              var st = data.result.data.enrichment_status || {};
              var lr = st.last_result || {};
              setUpdaterMessage(st.message || 'Enrichment finished.', lr.success === false ? 'error' : 'success');
            } else {
              setUpdaterMessage(
                'Enrichment finished: ' + Number(data.result.insertedRowCount || 0) + ' row(s) inserted.',
                'success'
              );
            }
          } else {
            var msg = (data.result && data.result.error && data.result.error.message) || (data && data.error) ||
              ('Enrich failed (HTTP ' + res.status + ').');
            setUpdaterMessage(msg, 'error');
          }
        });
      }).catch(function (e) {
        setUpdaterMessage('Network error: ' + (e && e.message || e), 'error');
      }).then(function () {
        setUpdaterBusy(false);
      });
    });
  }

  function selectedProfile() {
    var picks = document.querySelectorAll('.sf-pick:checked');
    if (picks.length !== 1) return null;
    var idx = parseInt(picks[0].getAttribute('data-idx'), 10);
    return Number.isFinite(idx) ? loadedProfiles[idx] || null : null;
  }

  function viewProfileBundle() {
    var profile = selectedProfile();
    if (!profile) {
      setUpdaterMessage('Select exactly one profile row to view its bundle.', 'error');
      return;
    }
    if (readIndustry() === 'travel') {
      setUpdaterMessage('Profile bundle readback is available for FSI, retail, telecom, media, and sports.', 'info');
      return;
    }
    setUpdaterBusy(true);
    setUpdaterMessage('Loading the complete industry profile bundle…', 'info');
    authHeaders().then(function (h) {
      if (!h.Authorization) throw new Error('Sign-in not ready yet.');
      return fetch('/api/snowflake/agentic/profile-bundle', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({
          sandbox: readSandbox(),
          industry: readIndustry(),
          email: profile.email,
          ecid: profile.ecid,
          crmId: profile.crmId,
          eventLimit: 25,
        }),
      });
    }).then(function (res) {
      return res.json().then(function (body) {
        var result = body && body.result;
        if (!res.ok || !result || !result.ok) {
          throw new Error((result && result.error && result.error.message) || body.error || 'Bundle lookup failed.');
        }
        if (els.profileBundleOut) {
          els.profileBundleOut.hidden = false;
          els.profileBundleOut.textContent = safeStringify(result);
        }
        setUpdaterMessage('Profile bundle loaded with ' + result.totalReturnedRows + ' event/enrichment row(s).', 'success');
      });
    }).catch(function (error) {
      setUpdaterMessage(error && error.message || String(error), 'error');
    }).then(function () {
      setUpdaterBusy(false);
    });
  }

  function runFullPhasedGenerate() {
    var sandbox = readSandbox();
    if (!sandbox) {
      setFullGenMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    var count = els.fullGenCount ? parseInt(els.fullGenCount.value, 10) : 5;
    if (!Number.isFinite(count) || count < 1) count = 5;
    if (count > 1000) {
      setFullGenMessage('Maximum 1000 per run.', 'error');
      return;
    }
    setFullGenBusy(true);
    if (els.fullGenResult) {
      els.fullGenResult.hidden = true;
      els.fullGenResult.textContent = '';
    }
    setFullGenMessage('Running full phased generate… This may take several minutes.', 'info');
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setFullGenMessage('Sign-in not ready yet — try again in a second.', 'error');
        setFullGenBusy(false);
        return;
      }
      var url = '/api/snowflake/agentic/generate-full';
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({ sandbox: sandbox, count: count }),
      }).then(function (res) {
        return res.json().then(function (data) {
          var result = data && data.result;
          if (res.status === 501) {
            setFullGenMessage(
              (data.result && data.result.error && data.result.error.message) ||
                'Runner not configured. See services/agentic-travel-runner in the repo.',
              'error'
            );
            return;
          }
          if (res.ok && data && data.ok && data.result && data.result.ok && data.result.data) {
            var st = data.result.data.generation_status || {};
            var lr = st.last_result || {};
            setFullGenMessage(st.message || 'Done.', lr.success === false ? 'error' : 'success');
            if (els.fullGenResult) {
              els.fullGenResult.hidden = false;
              els.fullGenResult.textContent = safeStringify(data.result.data);
            }
          } else {
            setFullGenMessage(
              (data.result && data.result.error && data.result.error.message) || (data && data.error) ||
                ('Generate failed (HTTP ' + res.status + ').'),
              'error'
            );
          }
        });
      }).catch(function (e) {
        setFullGenMessage('Network error: ' + (e && e.message || e), 'error');
      }).then(function () {
        setFullGenBusy(false);
      });
    });
  }

  function describePhaseTables() {
    var sandbox = readSandbox();
    if (!sandbox) {
      setFullGenMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    var phase = els.phaseSelect ? els.phaseSelect.value : 'phase1';
    setFullGenBusy(true);
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setFullGenMessage('Sign-in not ready yet.', 'error');
        setFullGenBusy(false);
        return;
      }
      var url = '/api/snowflake/agentic/table-structure';
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({ sandbox: sandbox, phase: phase }),
      }).then(function (res) {
        return res.json().then(function (data) {
          var result = data && data.result;
          if (res.ok && result && result.ok && result.structure_text) {
            if (els.phaseStructureOut) {
              els.phaseStructureOut.hidden = false;
              els.phaseStructureOut.textContent = result.structure_text;
            }
            setFullGenMessage('Loaded structure for ' + phase + '.', 'success');
          } else {
            var msg = (result && result.error && result.error.message) || (data && data.error) || 'Failed.';
            setFullGenMessage(msg, 'error');
          }
        });
      }).catch(function (e) {
        setFullGenMessage('Network error: ' + (e && e.message || e), 'error');
      }).then(function () {
        setFullGenBusy(false);
      });
    });
  }

  function generateProfiles() {
    if (!hasPortalLogin()) {
      setGenerateMessage(portalLoginRequiredMessage(), 'error');
      openPortalLoginHint();
      return;
    }
    var payload = readGenerateForm();
    if (!payload.sandbox) {
      setGenerateMessage('Pick a sandbox from Global values first.', 'error');
      return;
    }
    if (payload.count > 1000) {
      setGenerateMessage('Maximum 1000 profiles per run.', 'error');
      return;
    }
    setGenerateBusy(true);
    if (els.genResult) els.genResult.hidden = true;
    setGenerateMessage(
      'Generating ' + payload.count + ' ' + titleCase(payload.industry) + ' profile' +
        (payload.count === 1 ? '' : 's') + ' (egress IP ' + STATIC_EGRESS_IP + ')…',
      'info'
    );
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setGenerateMessage('Sign-in not ready yet — try again in a second.', 'error');
        setGenerateBusy(false);
        return;
      }
      var url = '/api/snowflake/generate-industry-profiles';
      var body = JSON.stringify(payload);
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: body,
      }).then(function (res) {
        return res.json().then(function (data) {
          setGenerateDebug('POST ' + url, payload, res.status, data);
          var result = data && data.result;
          if (res.ok && result && result.ok) {
            appendBaseBatchHistory(result);
            setGenerateMessage(
              'Inserted ' + result.rowcount + ' ' + titleCase(payload.industry) + ' profile' + (result.rowcount === 1 ? '' : 's') +
                ' into ' + result.table + '.',
              'success'
            );
            showGenerateResult(result);
          } else {
            var msg = (result && result.error && result.error.message) || (data && data.error) ||
              ('Generation failed (HTTP ' + res.status + ').');
            var hints = result && result.error && Array.isArray(result.error.hints) ? result.error.hints : [];
            setGenerateMessage(msg, 'error', { hints: hints });
            showGenerateResult(null);
          }
        });
      }).catch(function (e) {
        setGenerateMessage('Network error during generation: ' + (e && e.message || e), 'error');
      }).then(function () {
        setGenerateBusy(false);
      });
    });
  }

  function bind() {
    els.form = $('sfConfigForm');
    els.account = $('sfAccount');
    els.user = $('sfUser');
    els.role = $('sfRole');
    els.warehouse = $('sfWarehouse');
    els.database = $('sfDatabase');
    els.schema = $('sfSchema');
    els.authMethod = $('sfAuthMethod');
    els.credential = $('sfCredential');
    els.credentialLabel = $('sfCredentialLabel');
    els.credentialHint = $('sfCredentialHint');
    els.credentialBadge = $('sfCredentialBadge');
    els.credentialBadgeText = $('sfCredentialBadgeText');
    els.credentialRow = $('sfCredentialRow');
    els.credentialReplaceDetails = $('sfCredentialReplaceDetails');
    els.credentialReplaceSummary = $('sfCredentialReplaceSummary');
    els.credentialInputBlock = $('sfCredentialInputBlock');
    els.passphraseRow = $('sfPassphraseRow');
    els.keyPassphrase = $('sfKeyPassphrase');
    els.saveBtn = $('sfSaveBtn');
    els.testBtn = $('sfTestBtn');
    els.clearCredBtn = $('sfClearCredBtn');
    els.fillPresetBtn = $('sfFillPresetBtn');
    els.keyPairExtras = $('sfKeyPairExtras');
    els.keyFile = $('sfKeyFile');
    els.keyFilePick = $('sfKeyFilePick');
    els.keyDropTarget = $('sfKeyDropTarget');
    els.connectionDetails = $('sfConnectionDetails');
    els.connectionSummaryStatus = $('sfConnectionSummaryStatus');
    els.message = $('sfConfigMessage');
    els.debug = $('sfConfigDebug');
    els.debugEndpoint = $('sfDebugEndpoint');
    els.debugRequest = $('sfDebugRequest');
    els.debugStatus = $('sfDebugStatus');
    els.debugResponse = $('sfDebugResponse');

    els.industry = $('sfIndustry');
    els.industryProfileTable = $('sfIndustryProfileTable');
    els.queryTableName = $('sfQueryTableName');
    els.generateTargetTable = $('sfGenerateTargetTable');
    els.industryReadinessStatus = $('sfIndustryReadinessStatus');
    els.industryTableDetails = $('sfIndustryTableDetails');
    els.industryTableDetailsStatus = $('sfIndustryTableDetailsStatus');
    els.industryTableGrid = $('sfIndustryTableGrid');
    els.industryRefreshBtn = $('sfIndustryRefreshBtn');
    els.industryDryRunBtn = $('sfIndustryDryRunBtn');
    els.industryProvisionBtn = $('sfIndustryProvisionBtn');
    els.industryMessage = $('sfIndustryMessage');
    els.industryProvisionOut = $('sfIndustryProvisionOut');
    els.travelAdvanced = $('sfTravelAdvanced');
    els.travelRunnerHint = $('sfTravelRunnerHint');

    els.genForm = $('sfGenerateForm');
    els.genCount = $('sfGenCount');
    els.genCountDisplay = $('sfGenCountDisplay');
    els.genBatchHistorySelect = $('sfGenBatchHistorySelect');
    els.genBatchLoadBtn = $('sfGenBatchLoadBtn');
    els.genBatchClearBtn = $('sfGenBatchClearBtn');
    els.genBatchSize = $('sfGenBatchSize');
    els.generateBtn = $('sfGenerateBtn');
    els.genMessage = $('sfGenerateMessage');
    els.genResult = $('sfGenerateResult');
    els.genResultRowcount = $('sfGenResultRowcount');
    els.genResultTable = $('sfGenResultTable');
    els.genResultSample = $('sfGenResultSample');
    els.genDebug = $('sfGenerateDebug');
    els.genDebugEndpoint = $('sfGenDebugEndpoint');
    els.genDebugRequest = $('sfGenDebugRequest');
    els.genDebugStatus = $('sfGenDebugStatus');
    els.genDebugResponse = $('sfGenDebugResponse');

    if (els.authMethod) {
      els.authMethod.addEventListener('change', function () {
        reflectAuthMethod();
        lastSnowflakeTestOk = false;
        refreshConnectionUi();
      });
    }
    if (els.saveBtn) els.saveBtn.addEventListener('click', saveConfig);
    if (els.testBtn) els.testBtn.addEventListener('click', testConnection);
    if (els.clearCredBtn) els.clearCredBtn.addEventListener('click', clearCredential);
    if (els.fillPresetBtn) {
      els.fillPresetBtn.addEventListener('click', function () {
        applyAgenticTravelPreset(false, true);
        setMessage(
          'Filled AgenticAI travel defaults. Paste your PEM private key and Save once.',
          'info'
        );
      });
    }
    if (els.form) {
      els.form.addEventListener('input', function () {
        lastSnowflakeTestOk = false;
        refreshConnectionUi();
      });
      els.form.addEventListener('change', function () {
        lastSnowflakeTestOk = false;
        refreshConnectionUi();
      });
    }
    if (els.generateBtn) els.generateBtn.addEventListener('click', generateProfiles);
    if (els.genCount && els.genCountDisplay) {
      els.genCount.addEventListener('input', syncSfGenCountDisplay);
      syncSfGenCountDisplay();
    }
    if (els.genBatchLoadBtn) {
      els.genBatchLoadBtn.addEventListener('click', function () {
        var sel = els.genBatchHistorySelect;
        var id = sel && sel.value;
        if (!id) return;
        loadBaseBatchIntoResult(id);
      });
    }
    if (els.genBatchClearBtn) {
      els.genBatchClearBtn.addEventListener('click', function () {
        try {
          localStorage.removeItem(LS_SF_BASE_GEN_BATCHES);
        } catch (_) {}
        renderBaseBatchHistorySelect();
        setGenerateMessage('Batch history cleared.', 'info');
      });
    }
    renderBaseBatchHistorySelect();
    (function initBaseBatchViewport() {
      var sel = els.genBatchHistorySelect;
      var firstId = sel && sel.value;
      if (firstId) loadBaseBatchIntoResult(firstId);
    })();

    els.updaterForm = $('sfUpdaterForm');
    els.filterType = $('sfFilterType');
    els.timePeriod = $('sfTimePeriod');
    els.queryLimit = $('sfQueryLimit');
    els.loadProfilesBtn = $('sfLoadProfilesBtn');
    els.profileTbody = $('sfProfileTbody');
    els.selectAll = $('sfSelectAll');
    els.eventTypes = $('sfEventTypes');
    reflectIndustrySelection();
    els.enrichBtn = $('sfEnrichBtn');
    els.profileBundleBtn = $('sfProfileBundleBtn');
    els.profileBundleOut = $('sfProfileBundleOut');
    els.updaterMessage = $('sfUpdaterMessage');
    els.fullGenForm = $('sfFullGenForm');
    els.fullGenCount = $('sfFullGenCount');
    els.fullGenBtn = $('sfFullGenBtn');
    els.fullGenMessage = $('sfFullGenMessage');
    els.fullGenResult = $('sfFullGenResult');
    els.phaseSelect = $('sfPhaseSelect');
    els.phaseStructureBtn = $('sfPhaseStructureBtn');
    els.phaseStructureOut = $('sfPhaseStructureOut');

    if (els.loadProfilesBtn) els.loadProfilesBtn.addEventListener('click', loadProfiles);
    if (els.enrichBtn) els.enrichBtn.addEventListener('click', enrichSelected);
    if (els.profileBundleBtn) els.profileBundleBtn.addEventListener('click', viewProfileBundle);
    if (els.industryRefreshBtn) {
      els.industryRefreshBtn.addEventListener('click', function () { loadIndustryCatalog(true); });
    }
    if (els.industryDryRunBtn) {
      els.industryDryRunBtn.addEventListener('click', function () { provisionIndustry(true); });
    }
    if (els.industryProvisionBtn) {
      els.industryProvisionBtn.addEventListener('click', function () { provisionIndustry(false); });
    }
    if (els.industry) {
      els.industry.addEventListener('change', function () {
        industryCatalog = null;
        reflectIndustrySelection();
        loadedProfiles = [];
        renderProfileRows([]);
        if (els.profileBundleOut) els.profileBundleOut.hidden = true;
        if (els.industryProvisionOut) els.industryProvisionOut.hidden = true;
        loadIndustryCatalog(true);
      });
    }
    if (els.fullGenBtn) els.fullGenBtn.addEventListener('click', runFullPhasedGenerate);
    if (els.phaseStructureBtn) els.phaseStructureBtn.addEventListener('click', describePhaseTables);
    if (els.selectAll) {
      els.selectAll.addEventListener('change', function () {
        var on = els.selectAll.checked;
        var picks = document.querySelectorAll('.sf-pick');
        for (var i = 0; i < picks.length; i++) picks[i].checked = on;
      });
    }

    bindKeyFileUi();

    document.addEventListener('aep-lab-sandbox-synced', function () {
      loadConfig().then(function () { return loadIndustryCatalog(true); });
    });
    window.addEventListener('storage', function (e) {
      if (e && e.key === LS_SANDBOX) loadConfig();
    });
    reflectAuthMethod();
    syncConnectionUi(null);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    ensureFirebaseReady().then(function () {
      return loadConfig();
    }).then(function () {
      return loadIndustryCatalog(true);
    });
  });
})();
