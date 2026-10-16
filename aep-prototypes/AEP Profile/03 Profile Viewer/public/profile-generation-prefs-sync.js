/**
 * Firestore sync for profile generation prefs (GET/PUT /api/lab/generation-prefs,
 * POST /api/lab/generation-prefs/next-email).
 * Requires Firebase Auth via AepLabSandboxSync.
 */
(function attachProfileGenerationPrefsSync(global) {
  'use strict';

  var API = '/api/lab/generation-prefs';
  var NEXT_EMAIL_API = '/api/lab/generation-prefs/next-email';
  var saveTimers = Object.create(null);
  var pendingSavePatches = Object.create(null);
  var pulls = Object.create(null);
  var saves = Object.create(null);
  var mutations = Object.create(null);
  var saveErrors = Object.create(null);
  var contextVersion = 0;
  var lastResumePullAt = 0;
  var AUTH_READY_CAP_MS = 2500;
  var syncState = {
    status: 'idle',
    lastSavedAt: null,
    serverBaseEmail: '',
    sandbox: '',
    error: null,
  };
  var statusTargets = [];

  function userId() {
    var auth = global.firebase && global.firebase.auth && global.firebase.auth();
    return auth && auth.currentUser ? auth.currentUser.uid : '';
  }

  function contextFor(sandbox) {
    var uid = userId();
    var auth = global.firebase && global.firebase.auth && global.firebase.auth();
    var signedIn = !!(auth && auth.currentUser && !auth.currentUser.isAnonymous);
    return { uid: uid, sandbox: sandbox, key: uid + ':' + sandbox, version: contextVersion, signedIn: signedIn };
  }

  function isCurrent(context) {
    return context.uid === userId() && context.sandbox === getSandboxName() && context.version === contextVersion;
  }

  function requireCurrent(context) {
    if (!isCurrent(context)) throw new Error('Account or sandbox changed. Refresh generation preferences.');
  }

  function notifyChange() {
    try {
      global.localStorage.setItem('aepGenerationPrefsChanged', String(Date.now()));
    } catch (error) {
      console.warn('Shared preferences changed, but cross-tab notification failed:', error.message);
    }
  }

  function capAuthWait(promise) {
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        global.setTimeout(function () {
          resolve(null);
        }, AUTH_READY_CAP_MS);
      }),
    ]);
  }

  function whenAuthReady() {
    var base;
    if (global.AepLabSandboxSync && global.AepLabSandboxSync.whenReady) {
      base = global.AepLabSandboxSync.whenReady.catch(function () {
        return null;
      });
    } else if (global.__aepLabSyncReady && typeof global.__aepLabSyncReady.then === 'function') {
      base = global.__aepLabSyncReady.catch(function () {
        return null;
      });
    } else {
      base = Promise.resolve(null);
    }
    return capAuthWait(base);
  }

  function authHeaders() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getAuthHeaders === 'function') {
      return global.AepLabSandboxSync.getAuthHeaders();
    }
    return Promise.resolve({});
  }

  function getSandboxName() {
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getSandbox === 'function') {
      return String(global.AepLabSandboxSync.getSandbox() || '').trim();
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function notifySyncState(patch) {
    syncState = Object.assign({}, syncState, patch || {});
    try {
      global.dispatchEvent(new CustomEvent('aep-profile-gen-prefs-sync-state', {
        detail: Object.assign({}, syncState),
      }));
    } catch (_e) {}
    renderAllStatusTargets();
  }

  function formatSyncStatusText() {
    var sb = syncState.sandbox || getSandboxName();
    if (syncState.status === 'saving') {
      return 'Saving generation prefs for sandbox ' + sb + '…';
    }
    if (syncState.status === 'saved') {
      var email = String(syncState.serverBaseEmail || '').trim();
      if (email) {
        return 'Synced to server (' + sb + '): ' + email;
      }
      return 'Synced to server (' + sb + '). Set a base email on Profile generation.';
    }
    if (syncState.status === 'error') {
      return 'Server sync failed: ' + String(syncState.error || 'unknown error');
    }
    if (syncState.status === 'local-only') {
      return 'Using local prefs for ' + sb + ' — open Home and sign in to sync with MCP and other devices.';
    }
    if (syncState.status === 'pulled') {
      var pulled = String(syncState.serverBaseEmail || '').trim();
      if (pulled) {
        return 'Server (' + sb + '): ' + pulled;
      }
      return 'Server has no base email for ' + sb + ' — edits here sync when signed in.';
    }
    return '';
  }

  function renderStatusTarget(el) {
    if (!el) return;
    var text = formatSyncStatusText();
    el.textContent = text;
    el.hidden = !text;
    el.classList.remove(
      'profile-gen-prefs-sync--saving',
      'profile-gen-prefs-sync--saved',
      'profile-gen-prefs-sync--error',
      'profile-gen-prefs-sync--pulled',
      'profile-gen-prefs-sync--local-only',
    );
    if (!text) return;
    if (syncState.status === 'saving') el.classList.add('profile-gen-prefs-sync--saving');
    else if (syncState.status === 'saved') el.classList.add('profile-gen-prefs-sync--saved');
    else if (syncState.status === 'error') el.classList.add('profile-gen-prefs-sync--error');
    else if (syncState.status === 'pulled') el.classList.add('profile-gen-prefs-sync--pulled');
    else if (syncState.status === 'local-only') el.classList.add('profile-gen-prefs-sync--local-only');
  }

  function renderAllStatusTargets() {
    for (var i = 0; i < statusTargets.length; i++) {
      renderStatusTarget(statusTargets[i]);
    }
  }

  function bindSyncStatus(target) {
    if (!target) return;
    if (statusTargets.indexOf(target) < 0) statusTargets.push(target);
    target.classList.add('profile-gen-prefs-sync-status');
    renderStatusTarget(target);
  }

  function applyPrefsToLocal(prefs, sandbox) {
    var Shared = global.AepProfileGenShared;
    if (!prefs || typeof prefs !== 'object') return;
    var sb = String(sandbox || prefs.sandbox || getSandboxName() || '').trim();
    if (!sb) return;

    if (Shared && prefs.baseEmail != null) {
      var serverEmail = String(prefs.baseEmail || '').trim();
      if (serverEmail) {
        Shared.writeBaseEmail(sb, serverEmail);
      } else {
        Shared.writeBaseEmail(sb, '');
      }
    }
    if (Shared && prefs.mobilePhone != null) {
      var serverMobile = String(prefs.mobilePhone || '').trim();
      var localMobile = String(Shared.readBaseMobile(sb) || '').trim();
      if (serverMobile) {
        Shared.writeBaseMobile(sb, serverMobile);
      } else if (!localMobile) {
        Shared.writeBaseMobile(sb, '');
      }
    }
    if (Shared && Number.isFinite(Number(prefs.counterN)) && prefs.counterN > 0) {
      Shared.persistCounter(sb, prefs.baseEmail || Shared.readBaseEmail(sb), Number(prefs.counterN));
    }
    try {
      global.dispatchEvent(new CustomEvent('aep-profile-gen-prefs-applied', {
        detail: { sandbox: sb, prefs: prefs },
      }));
    } catch (_e2) {}
  }

  function pull(sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb) return Promise.resolve(null);
    var context = contextFor(sb);
    var mutation;
    if (pulls[context.key]) return pulls[context.key];

    notifySyncState({ status: 'saving', sandbox: sb, error: null });

    var request = flushPendingSave(sb).then(function (saved) {
      return whenAuthReady();
    })
      .then(function () {
        return authHeaders();
      })
      .then(function (headers) {
        requireCurrent(context);
        mutation = mutations[context.key] || 0;
        if (!headers || !headers.Authorization) {
          if (context.signedIn) throw new Error('Sign-in could not be confirmed. Sign in through Home and refresh.');
          notifySyncState({ status: 'local-only', sandbox: sb, error: null });
          return null;
        }
        return fetch(API + '?sandbox=' + encodeURIComponent(sb), {
          method: 'GET',
          headers: Object.assign({ Accept: 'application/json' }, headers || {}),
        }).then(function (res) {
          return res.json().then(function (data) {
            return { res: res, data: data };
          });
        });
      })
      .then(function (out) {
        requireCurrent(context);
        if (mutation !== (mutations[context.key] || 0)) {
          throw new Error('Preferences changed while loading. Refresh shared settings again.');
        }
        if (!out) return null;
        if (!out.res.ok || !out.data || out.data.ok === false) {
          var apiErr = (out.data && out.data.error) || ('HTTP ' + out.res.status);
          if (!context.signedIn && out.res.status === 401 && /firebase auth or x-aep-lab-mcp-key required/i.test(String(apiErr))) {
            notifySyncState({ status: 'local-only', sandbox: sb, error: null });
            return null;
          }
          notifySyncState({
            status: 'error',
            sandbox: sb,
            error: apiErr,
          });
          return null;
        }
        saveErrors[context.key] = null;
        applyPrefsToLocal(out.data.prefs, sb);
        return out.data.prefs;
      })
      .then(function (prefs) {
        if (prefs) {
          notifySyncState({
            status: 'pulled',
            sandbox: sb,
            serverBaseEmail: String(prefs.baseEmail || ''),
            error: null,
          });
        }
        return prefs;
      })
      .catch(function (err) {
        if (isCurrent(context)) notifySyncState({
          status: 'error',
          sandbox: sb,
          error: String((err && err.message) || err || 'Network error'),
        });
        return null;
      })
      .finally(function () {
        if (pulls[context.key] === request) delete pulls[context.key];
      });
    pulls[context.key] = request;
    return request;
  }

  function savePatch(patch, sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    var context = contextFor(sb);
    mutations[context.key] = (mutations[context.key] || 0) + 1;
    context.mutation = mutations[context.key];
    var previous = saves[context.key] || Promise.resolve({ ok: true });
    var request = previous.then(function () {
      if (!isCurrent(context)) return { ok: false, error: 'Account or sandbox changed. Save again in the current context.' };
      return performSave(patch, sb, context);
    }).then(function (result) {
      saveErrors[context.key] = result.ok ? null : result;
      return result;
    }).finally(function () {
      if (saves[context.key] === request) delete saves[context.key];
    });
    saves[context.key] = request;
    return request;
  }

  function performSave(patch, sandbox, context) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb || !patch || typeof patch !== 'object') return Promise.resolve({ ok: false, error: 'invalid patch' });

    return whenAuthReady()
      .then(function () {
        return authHeaders();
      })
      .then(function (headers) {
        requireCurrent(context);
        if (!headers || !headers.Authorization) {
          if (context.signedIn) throw new Error('Sign-in could not be confirmed. Sign in through Home and save again.');
          notifySyncState({ status: 'local-only', sandbox: sb, error: null });
          return { ok: false, error: 'no-auth', localOnly: true };
        }
        notifySyncState({ status: 'saving', sandbox: sb, error: null });
        return fetch(API, {
          method: 'PUT',
          headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, headers || {}),
          body: JSON.stringify(Object.assign({ sandbox: sb }, patch)),
        }).then(function (res) {
          return res.json().then(function (data) {
            return { res: res, data: data };
          });
        });
      })
      .then(function (out) {
        requireCurrent(context);
        if (!out || out.localOnly) return out || { ok: false, error: 'no-auth', localOnly: true };
        if (!out.res.ok || !out.data || out.data.ok === false) {
          var err = (out.data && out.data.error) || ('HTTP ' + out.res.status);
          if (!context.signedIn && out.res.status === 401 && /firebase auth or x-aep-lab-mcp-key required/i.test(String(err))) {
            notifySyncState({ status: 'local-only', sandbox: sb, error: null });
            return { ok: false, error: err, localOnly: true, status: out.res.status };
          }
          notifySyncState({ status: 'error', sandbox: sb, error: err });
          return { ok: false, error: err, status: out.res.status };
        }
        if (context.mutation === mutations[context.key]) applyPrefsToLocal(out.data.prefs, sb);
        notifySyncState({
          status: context.mutation === mutations[context.key] ? 'saved' : 'saving',
          sandbox: sb,
          lastSavedAt: new Date().toISOString(),
          serverBaseEmail: String(out.data.prefs.baseEmail || ''),
          error: null,
        });
        notifyChange();
        return { ok: true, prefs: out.data.prefs };
      })
      .catch(function (err) {
        var msg = String((err && err.message) || err || 'Network error');
        if (isCurrent(context)) notifySyncState({ status: 'error', sandbox: sb, error: msg });
        return { ok: false, error: msg };
      });
  }

  function scheduleSave(patch, sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb || !patch || typeof patch !== 'object') return;
    var context = contextFor(sb);
    var key = context.key;
    mutations[key] = (mutations[key] || 0) + 1;
    pendingSavePatches[key] = Object.assign({}, pendingSavePatches[key] || {}, patch);
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(function () {
      var pendingPatch = pendingSavePatches[key];
      delete pendingSavePatches[key];
      delete saveTimers[key];
      if (isCurrent(context)) savePatch(pendingPatch, sb);
    }, 400);
  }

  function persistPrefsField(patch, sandbox) {
    scheduleSave(patch, sandbox);
  }

  function flushPendingSave(sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    var key = contextFor(sb).key;
    var patch = pendingSavePatches[key];
    if (!patch) return saves[key] || Promise.resolve(saveErrors[key] || { ok: true, skipped: true });
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    delete pendingSavePatches[key];
    delete saveTimers[key];
    return savePatch(patch, sb);
  }

  function reserveLocalEmail(sb, baseEmail, Shared) {
    if (!Shared) {
      return { ok: false, error: 'Profile generation preferences are unavailable' };
    }
    var base = String(baseEmail || Shared.readBaseEmail(sb) || '').trim();
    if (!base.includes('@')) {
      return { ok: false, error: 'Valid base email required' };
    }
    var n = Shared.readCounter(sb, base);
    var email = Shared.scaleEmail(base, n, new Date());
    var next = Shared.incrementCounter(sb, base);
    return { ok: true, scaledEmail: email, counterN: n, nextCounterN: next, source: 'localStorage' };
  }

  /**
   * Atomically reserve the next scaled email in Firestore for signed-in users.
   * Local-only sessions retain the device counter, but authenticated failures
   * stop generation so the UI cannot silently diverge from MCP.
   */
  function reserveNextEmail(sandbox, baseEmail) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    var Shared = global.AepProfileGenShared;
    var authenticated = false;
    var context = contextFor(sb);

    return flushPendingSave(sb)
      .then(function (saveResult) {
        if (saveResult && saveResult.ok === false && !saveResult.localOnly) {
          return { saveError: saveResult.error || 'Could not save generation preferences' };
        }
        return whenAuthReady()
          .then(function () {
            return authHeaders();
          });
      })
      .then(function (headers) {
        requireCurrent(context);
        if (headers && headers.saveError) return headers;
        authenticated = !!(headers && headers.Authorization);
        if (!authenticated) {
          if (context.signedIn) throw new Error('Sign-in could not be confirmed. Sign in through Home before generating.');
          return { localOnly: true };
        }
        return fetch(NEXT_EMAIL_API, {
          method: 'POST',
          headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, headers || {}),
          body: JSON.stringify({ sandbox: sb, expectedBaseEmail: String(baseEmail || '').trim() }),
        }).then(function (res) {
          return res.json().then(function (data) {
            return { res: res, data: data };
          });
        });
      })
      .then(function (out) {
        requireCurrent(context);
        if (out.saveError) {
          return { ok: false, error: 'Shared email counter unavailable: ' + out.saveError };
        }
        if (out.localOnly) {
          notifySyncState({ status: 'local-only', sandbox: sb, error: null });
          return reserveLocalEmail(sb, baseEmail, Shared);
        }
        if (out.res.ok && out.data && out.data.ok !== false && out.data.scaledEmail) {
          if (Shared) {
            Shared.persistCounter(sb, out.data.baseEmail || baseEmail, out.data.nextCounterN);
          }
          notifyChange();
          return {
            ok: true,
            scaledEmail: out.data.scaledEmail,
            counterN: out.data.counterN,
            nextCounterN: out.data.nextCounterN,
            source: 'firestore',
          };
        }
        var apiError = (out.data && out.data.error) || ('HTTP ' + out.res.status);
        notifySyncState({ status: 'error', sandbox: sb, error: apiError });
        return { ok: false, error: 'Shared email counter unavailable: ' + apiError };
      })
      .catch(function (err) {
        var message = String((err && err.message) || err || 'Network error');
        if (!isCurrent(context)) return { ok: false, error: message };
        if (!authenticated && !context.signedIn) {
          notifySyncState({ status: 'local-only', sandbox: sb, error: null });
          return reserveLocalEmail(sb, baseEmail, Shared);
        }
        notifySyncState({ status: 'error', sandbox: sb, error: message });
        return { ok: false, error: 'Shared email counter unavailable: ' + message };
      });
  }

  function onSandboxChange() {
    contextVersion += 1;
    pulls = Object.create(null);
    Object.keys(saveTimers).forEach(function (key) { clearTimeout(saveTimers[key]); });
    saveTimers = Object.create(null);
    pendingSavePatches = Object.create(null);
    notifySyncState({ status: 'idle', sandbox: getSandboxName(), serverBaseEmail: '', error: null });
    global.dispatchEvent(new CustomEvent('aep-profile-gen-prefs-applied', {
      detail: { sandbox: getSandboxName(), contextChanged: true },
    }));
    pull(getSandboxName());
  }

  function bindCounterOverride(counter, resetButton, onApplied) {
    if (!counter || !resetButton) return;
    counter.readOnly = true;
    counter.setAttribute('aria-label', 'Next email counter (read only)');
    resetButton.title = 'Reset the shared daily UTC counter for this account and sandbox';
    var details = document.createElement('details');
    details.className = 'profile-gen-counter-advanced';
    var summary = document.createElement('summary');
    summary.textContent = 'Advanced email counter';
    var warning = document.createElement('p');
    warning.className = 'field-hint';
    warning.textContent = 'Lowering or resetting the counter can reuse addresses. Shared across industries for your account and sandbox; resets at midnight UTC.';
    var label = document.createElement('label');
    label.htmlFor = counter.id + 'Override';
    label.textContent = 'New next counter';
    var input = document.createElement('input');
    input.id = label.htmlFor;
    input.type = 'number';
    input.min = '1';
    input.max = '9007199254739991';
    input.step = '1';
    input.value = '1';
    var apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-secondary';
    apply.textContent = 'Override counter...';
    var status = document.createElement('p');
    status.className = 'field-hint';
    status.setAttribute('role', 'status');
    var preview = resetButton.parentNode;
    preview.parentNode.insertBefore(details, preview.nextSibling);
    [summary, warning, label, input, apply, resetButton, status].forEach(function (node) { details.appendChild(node); });
    function change(n) {
      if (!Number.isSafeInteger(n) || n < 1 || n > 9007199254739991) {
        status.textContent = 'Enter a positive whole counter within the allowed range.';
        return;
      }
      if (!global.confirm('Set the shared next email counter to ' + n +
        '? Lowering it can reuse addresses already generated today.')) return;
      var context = contextFor(getSandboxName());
      apply.disabled = resetButton.disabled = true;
      status.textContent = 'Saving counter...';
      savePatch({ counterN: n }, context.sandbox).then(function (result) {
        apply.disabled = resetButton.disabled = false;
        if (!isCurrent(context)) {
          status.textContent = 'Account or sandbox changed. Refresh settings before overriding.';
          return;
        }
        if (result.ok) {
          onApplied(result.prefs.counterN);
          status.textContent = 'Shared counter saved.';
        } else if (result.localOnly) {
          onApplied(n);
          status.textContent = 'Device-only counter updated. Sign in to share settings.';
        } else status.textContent = 'Counter was not changed: ' + result.error;
      });
    }
    apply.addEventListener('click', function () { change(Number(input.value)); });
    resetButton.addEventListener('click', function () { change(1); });
  }

  function pullOnResume() {
    if (document.hidden) return;
    var sb = getSandboxName();
    var key = contextFor(sb).key;
    if (!sb || pendingSavePatches[key]) return;
    var now = Date.now();
    if (now - lastResumePullAt < 1000) return;
    lastResumePullAt = now;
    pull(sb);
  }

  function bootPull() {
    whenAuthReady().then(function () {
      pull(getSandboxName());
    });
  }

  function autoBindStatusElements() {
    try {
      var nodes = document.querySelectorAll('[data-profile-gen-prefs-sync]');
      for (var i = 0; i < nodes.length; i++) {
        bindSyncStatus(nodes[i]);
      }
    } catch (_e) {}
  }

  global.addEventListener('aep-global-sandbox-change', onSandboxChange);
  global.addEventListener('aep-lab-sandbox-synced', onSandboxChange);
  global.addEventListener('focus', pullOnResume);
  global.addEventListener('storage', function (event) {
    if (event.key === 'aepGenerationPrefsChanged') pullOnResume();
  });
  document.addEventListener('visibilitychange', pullOnResume);

  global.AepProfileGenPrefsSync = {
    pull: pull,
    savePatch: savePatch,
    scheduleSave: scheduleSave,
    persistPrefsField: persistPrefsField,
    reserveNextEmail: reserveNextEmail,
    flushPendingSave: flushPendingSave,
    applyPrefsToLocal: applyPrefsToLocal,
    getSyncState: function () { return Object.assign({}, syncState); },
    bindSyncStatus: bindSyncStatus,
    bindCounterOverride: bindCounterOverride,
    notifyChange: notifyChange,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBindStatusElements);
  } else {
    autoBindStatusElements();
  }

  setTimeout(bootPull, 300);
  whenAuthReady().then(function () {
    if (global.firebase && global.firebase.auth) {
      var uid = userId();
      global.firebase.auth().onAuthStateChanged(function () {
        if (uid !== userId()) {
          uid = userId();
          onSandboxChange();
        }
      });
    }
  });
})(window);
