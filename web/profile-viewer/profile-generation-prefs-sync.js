/**
 * Firestore sync for profile generation prefs (GET/PUT /api/lab/generation-prefs,
 * POST /api/lab/generation-prefs/next-email).
 * Requires Firebase Auth via AepLabSandboxSync.
 */
(function attachProfileGenerationPrefsSync(global) {
  'use strict';

  var API = '/api/lab/generation-prefs';
  var NEXT_EMAIL_API = '/api/lab/generation-prefs/next-email';
  var saveTimer = null;
  var pullInFlight = null;
  var syncState = {
    status: 'idle',
    lastSavedAt: null,
    serverBaseEmail: '',
    sandbox: '',
    error: null,
  };
  var statusTargets = [];

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

  function isValidEmail(email) {
    var v = String(email || '').trim();
    return v.length >= 6 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
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
    );
    if (!text) return;
    if (syncState.status === 'saving') el.classList.add('profile-gen-prefs-sync--saving');
    else if (syncState.status === 'saved') el.classList.add('profile-gen-prefs-sync--saved');
    else if (syncState.status === 'error') el.classList.add('profile-gen-prefs-sync--error');
    else if (syncState.status === 'pulled') el.classList.add('profile-gen-prefs-sync--pulled');
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
    if (!Shared || !prefs || typeof prefs !== 'object') return;
    var sb = String(sandbox || prefs.sandbox || getSandboxName() || '').trim();
    if (!sb) return;

    if (prefs.baseEmail != null) {
      var serverEmail = String(prefs.baseEmail || '').trim();
      var localEmail = String(Shared.readBaseEmail(sb) || '').trim();
      if (serverEmail) {
        Shared.writeBaseEmail(sb, serverEmail);
      } else if (!localEmail) {
        Shared.writeBaseEmail(sb, '');
      }
    }
    if (prefs.mobilePhone != null) {
      var serverMobile = String(prefs.mobilePhone || '').trim();
      var localMobile = String(Shared.readBaseMobile(sb) || '').trim();
      if (serverMobile) {
        Shared.writeBaseMobile(sb, serverMobile);
      } else if (!localMobile) {
        Shared.writeBaseMobile(sb, '');
      }
    }
    if (Number.isFinite(Number(prefs.counterN)) && prefs.counterN > 0) {
      Shared.persistCounter(sb, prefs.baseEmail || Shared.readBaseEmail(sb), Number(prefs.counterN));
    }
    try {
      document.dispatchEvent(new CustomEvent('aep-profile-gen-prefs-applied', {
        detail: { sandbox: sb, prefs: prefs },
      }));
    } catch (_e2) {}
  }

  function maybeMigrateLocalToServer(sandbox, serverPrefs) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb) return Promise.resolve(serverPrefs);
    var Shared = global.AepProfileGenShared;
    if (!Shared) return Promise.resolve(serverPrefs);

    var serverEmail = serverPrefs && String(serverPrefs.baseEmail || '').trim();
    if (serverEmail) return Promise.resolve(serverPrefs);

    var localEmail = String(Shared.readBaseEmail(sb) || '').trim();
    if (!isValidEmail(localEmail)) return Promise.resolve(serverPrefs);

    var patch = { baseEmail: localEmail };
    var localMobile = String(Shared.readBaseMobile(sb) || '').trim();
    if (localMobile) patch.mobilePhone = localMobile;

    return savePatch(patch, sb).then(function (result) {
      return result && result.ok && result.prefs ? result.prefs : serverPrefs;
    });
  }

  function pull(sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb) return Promise.resolve(null);
    if (pullInFlight) return pullInFlight;

    notifySyncState({ status: 'saving', sandbox: sb, error: null });

    pullInFlight = authHeaders()
      .then(function (headers) {
        return fetch(API + '?sandbox=' + encodeURIComponent(sb), {
          method: 'GET',
          headers: Object.assign({ Accept: 'application/json' }, headers || {}),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        if (!out.res.ok || !out.data || out.data.ok === false) {
          notifySyncState({
            status: 'error',
            sandbox: sb,
            error: (out.data && out.data.error) || ('HTTP ' + out.res.status),
          });
          return null;
        }
        applyPrefsToLocal(out.data.prefs, sb);
        return out.data.prefs;
      })
      .then(function (prefs) {
        if (!prefs) return null;
        return maybeMigrateLocalToServer(sb, prefs);
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
        notifySyncState({
          status: 'error',
          sandbox: sb,
          error: String((err && err.message) || err || 'Network error'),
        });
        return null;
      })
      .finally(function () {
        pullInFlight = null;
      });

    return pullInFlight;
  }

  function savePatch(patch, sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb || !patch || typeof patch !== 'object') return Promise.resolve({ ok: false, error: 'invalid patch' });

    notifySyncState({ status: 'saving', sandbox: sb, error: null });

    return authHeaders()
      .then(function (headers) {
        return fetch(API, {
          method: 'PUT',
          headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, headers || {}),
          body: JSON.stringify(Object.assign({ sandbox: sb }, patch)),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        if (!out.res.ok || !out.data || out.data.ok === false) {
          var err = (out.data && out.data.error) || ('HTTP ' + out.res.status);
          notifySyncState({ status: 'error', sandbox: sb, error: err });
          return { ok: false, error: err, status: out.res.status };
        }
        applyPrefsToLocal(out.data.prefs, sb);
        notifySyncState({
          status: 'saved',
          sandbox: sb,
          lastSavedAt: new Date().toISOString(),
          serverBaseEmail: String(out.data.prefs.baseEmail || ''),
          error: null,
        });
        return { ok: true, prefs: out.data.prefs };
      })
      .catch(function (err) {
        var msg = String((err && err.message) || err || 'Network error');
        notifySyncState({ status: 'error', sandbox: sb, error: msg });
        return { ok: false, error: msg };
      });
  }

  function scheduleSave(patch, sandbox) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      savePatch(patch, sandbox);
    }, 400);
  }

  function persistPrefsField(patch, sandbox) {
    scheduleSave(patch, sandbox);
  }

  /**
   * Atomically reserve next scaled email (advances shared counter in Firestore).
   * Falls back to local Shared.incrementCounter when API unavailable.
   */
  function reserveNextEmail(sandbox, baseEmail) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    var Shared = global.AepProfileGenShared;

    return authHeaders()
      .then(function (headers) {
        return fetch(NEXT_EMAIL_API, {
          method: 'POST',
          headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, headers || {}),
          body: JSON.stringify({ sandbox: sb }),
        }).then(function (res) {
          return res.json().then(function (data) {
            return { res: res, data: data };
          });
        });
      })
      .then(function (out) {
        if (out.res.ok && out.data && out.data.ok !== false && out.data.scaledEmail) {
          if (Shared) {
            Shared.persistCounter(sb, out.data.baseEmail || baseEmail, out.data.nextCounterN);
          }
          return {
            ok: true,
            scaledEmail: out.data.scaledEmail,
            counterN: out.data.counterN,
            nextCounterN: out.data.nextCounterN,
            source: 'firestore',
          };
        }
        if (!Shared) {
          return { ok: false, error: (out.data && out.data.error) || 'Profile generation prefs API failed' };
        }
        var base = String(baseEmail || Shared.readBaseEmail(sb) || '').trim();
        if (!base.includes('@')) {
          return { ok: false, error: 'Valid base email required' };
        }
        var n = Shared.readCounter(sb, base);
        var email = Shared.scaleEmail(base, n, new Date());
        var next = Shared.incrementCounter(sb, base);
        return { ok: true, scaledEmail: email, counterN: n, nextCounterN: next, source: 'localStorage' };
      })
      .catch(function (err) {
        if (!Shared) {
          return { ok: false, error: String((err && err.message) || err || 'Network error') };
        }
        var base = String(baseEmail || Shared.readBaseEmail(sb) || '').trim();
        if (!base.includes('@')) {
          return { ok: false, error: 'Valid base email required' };
        }
        var n = Shared.readCounter(sb, base);
        var email = Shared.scaleEmail(base, n, new Date());
        var next = Shared.incrementCounter(sb, base);
        return { ok: true, scaledEmail: email, counterN: n, nextCounterN: next, source: 'localStorage' };
      });
  }

  function onSandboxChange() {
    pull(getSandboxName());
  }

  function bootPull() {
    var authReady = global.AepLabSandboxSync && global.AepLabSandboxSync.whenReady
      ? global.AepLabSandboxSync.whenReady.catch(function () {})
      : Promise.resolve();
    authReady.then(function () {
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

  global.AepProfileGenPrefsSync = {
    pull: pull,
    savePatch: savePatch,
    scheduleSave: scheduleSave,
    persistPrefsField: persistPrefsField,
    reserveNextEmail: reserveNextEmail,
    applyPrefsToLocal: applyPrefsToLocal,
    getSyncState: function () { return Object.assign({}, syncState); },
    bindSyncStatus: bindSyncStatus,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBindStatusElements);
  } else {
    autoBindStatusElements();
  }

  setTimeout(bootPull, 300);
})(window);
