/**
 * Profile Generation – Snowflake (in development) page logic.
 *
 * Phase 1 scope (per docs/SNOWFLAKE_INTEGRATION.md):
 *   - Reads/writes per-lab-user, per-AEP-sandbox Snowflake connection config via
 *     /api/snowflake/config (functions/snowflakeService.js → Firestore +
 *     Secret Manager).
 *   - Runs a server-side connection test via /api/snowflake/connection-test
 *     so users can validate the static-egress-IP allowlist round-trips
 *     without leaving the lab.
 *
 * Auth: relies on the same anonymous-Firebase-auth pattern that
 * aep-lab-sandbox-sync.js boots (window.__aepLabSyncReady). The Cloud Functions
 * require a Firebase ID token Bearer; anonymous sign-in is enough.
 */

(function () {
  'use strict';

  var LS_SANDBOX = 'aepGlobalSandboxName';
  var STATIC_EGRESS_IP = '34.58.81.28';

  var els = {};

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
    var ids = ['saveBtn', 'testBtn', 'clearCredBtn'];
    for (var i = 0; i < ids.length; i++) {
      var b = els[ids[i]];
      if (b) b.disabled = !!busy;
    }
  }

  function reflectAuthMethod() {
    var method = els.authMethod ? els.authMethod.value : 'password';
    if (els.passphraseRow) els.passphraseRow.hidden = method !== 'keyPair';
    if (!els.credentialLabel) return;
    if (method === 'keyPair') {
      els.credentialLabel.textContent = 'Private key (PEM, including BEGIN/END lines)';
      els.credential.placeholder = '-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY----- — leave blank to keep the previously saved value';
    } else if (method === 'pat') {
      els.credentialLabel.textContent = 'Programmatic access token';
      els.credential.placeholder = 'Paste PAT — leave blank to keep the previously saved value';
    } else {
      els.credentialLabel.textContent = 'Password';
      els.credential.placeholder = 'Paste password — leave blank to keep the previously saved value';
    }
  }

  function reflectCredentialState(rec) {
    var node = els.credentialStatus;
    if (!node) return;
    if (rec && rec.hasCredential) {
      var when = rec.credentialSetAt ? ' (saved ' + new Date(rec.credentialSetAt).toLocaleString() + ')' : '';
      node.textContent = 'Credential is stored in Secret Manager' + when + '. Leave the field blank to keep it.';
      node.setAttribute('data-state', 'set');
    } else {
      node.textContent = 'No credential saved yet — paste one to enable connection tests.';
      node.setAttribute('data-state', 'missing');
    }
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

  function loadConfig() {
    var sandbox = readSandbox();
    if (!sandbox) {
      setMessage(
        'Pick a sandbox from Global values before configuring Snowflake. The connection is saved per lab user, per sandbox.',
        'info'
      );
      return Promise.resolve();
    }
    setBusy(true);
    setMessage('Loading saved Snowflake config…', 'info');
    return authHeaders().then(function (h) {
      if (!h.Authorization) {
        setMessage('Anonymous Firebase auth is initializing — refresh the page in a second.', 'info');
        return null;
      }
      var url = '/api/snowflake/config?sandbox=' + encodeURIComponent(sandbox);
      return fetch(url, { headers: h }).then(function (res) {
        return res.json().then(function (body) {
          setDebug('GET ' + url, null, res.status, body);
          if (res.ok && body && body.ok) {
            applyRecordToForm(body.record || null);
            setMessage(
              body.record && body.record.account
                ? 'Loaded saved config for sandbox ' + sandbox + '.'
                : 'No saved config yet for sandbox ' + sandbox + ' — fill the form and save.',
              'info'
            );
          } else {
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
            applyRecordToForm(data.record || null);
            if (els.credential) els.credential.value = '';
            if (els.keyPassphrase) els.keyPassphrase.value = '';
            setMessage('Saved. Click Test connection to validate the IP allowlist round-trip.', 'success');
          } else {
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
      var url = '/api/snowflake/connection-test';
      var body = JSON.stringify({ sandbox: sandbox });
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: body,
      }).then(function (res) {
        return res.json().then(function (data) {
          setDebug('POST ' + url, { sandbox: sandbox }, res.status, data);
          var result = data && data.result;
          if (res.ok && result && result.ok) {
            var line = 'Connected — Snowflake ' + (result.version || 'unknown') +
              ' (account ' + (result.account || '?') + ').';
            setMessage(line, 'success');
          } else {
            var msg = (result && result.error && result.error.message) || (data && data.error) ||
              'Connection test failed (HTTP ' + res.status + ').';
            var hints = result && result.error && Array.isArray(result.error.hints) ? result.error.hints : [];
            setMessage(msg, 'error', { hints: hints });
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
      var payload = { sandbox: sandbox, clearCredential: true, clearKeyPassphrase: true };
      fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (data) {
          setDebug('POST ' + url, payload, res.status, data);
          if (res.ok && data && data.ok) {
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

  function copyStaticIp() {
    var copy = STATIC_EGRESS_IP;
    var ok = function () {
      var prev = els.copyBtn ? els.copyBtn.textContent : '';
      if (els.copyBtn) {
        els.copyBtn.textContent = 'Copied!';
        setTimeout(function () { if (els.copyBtn) els.copyBtn.textContent = prev || 'Copy'; }, 1500);
      }
    };
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copy).then(ok).catch(function () { ok(); });
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = copy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok();
      } catch (_) {}
    }
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
      table: (els.genTable && els.genTable.value.trim()) || 'BASE_PROFILES',
      industry: els.genIndustry ? els.genIndustry.value : '',
    };
    if (Number.isFinite(batchSize) && batchSize > 0) payload.batchSize = batchSize;
    return payload;
  }

  function generateProfiles() {
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
      'Generating ' + payload.count + ' base profile' + (payload.count === 1 ? '' : 's') +
        ' into ' + payload.table + ' (egress IP ' + STATIC_EGRESS_IP + ')…',
      'info'
    );
    authHeaders().then(function (h) {
      if (!h.Authorization) {
        setGenerateMessage('Sign-in not ready yet — try again in a second.', 'error');
        setGenerateBusy(false);
        return;
      }
      var url = '/api/snowflake/generate-base-profiles';
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
            setGenerateMessage(
              'Inserted ' + result.rowcount + ' base profile' + (result.rowcount === 1 ? '' : 's') +
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
    els.credentialStatus = $('sfCredentialStatus');
    els.passphraseRow = $('sfPassphraseRow');
    els.keyPassphrase = $('sfKeyPassphrase');
    els.saveBtn = $('sfSaveBtn');
    els.testBtn = $('sfTestBtn');
    els.clearCredBtn = $('sfClearCredBtn');
    els.copyBtn = $('sfCopyIpBtn');
    els.message = $('sfConfigMessage');
    els.debug = $('sfConfigDebug');
    els.debugEndpoint = $('sfDebugEndpoint');
    els.debugRequest = $('sfDebugRequest');
    els.debugStatus = $('sfDebugStatus');
    els.debugResponse = $('sfDebugResponse');

    els.genForm = $('sfGenerateForm');
    els.genCount = $('sfGenCount');
    els.genTable = $('sfGenTable');
    els.genIndustry = $('sfGenIndustry');
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

    if (els.authMethod) els.authMethod.addEventListener('change', reflectAuthMethod);
    if (els.saveBtn) els.saveBtn.addEventListener('click', saveConfig);
    if (els.testBtn) els.testBtn.addEventListener('click', testConnection);
    if (els.clearCredBtn) els.clearCredBtn.addEventListener('click', clearCredential);
    if (els.copyBtn) els.copyBtn.addEventListener('click', copyStaticIp);
    if (els.generateBtn) els.generateBtn.addEventListener('click', generateProfiles);

    document.addEventListener('aep-lab-sandbox-synced', function () {
      loadConfig();
    });
    window.addEventListener('storage', function (e) {
      if (e && e.key === LS_SANDBOX) loadConfig();
    });
    reflectAuthMethod();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    ensureFirebaseReady().then(function () {
      loadConfig();
    });
  });
})();
