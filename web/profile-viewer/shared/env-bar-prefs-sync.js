/**
 * Firestore sync for unified env bar prefs (GET/POST /api/lab/env-bar-preferences).
 * Requires Firebase Auth via AepLabSandboxSync (anonymous or Adobe sign-in).
 */
(function attachLabEnvBarPrefsSync(global) {
  'use strict';

  var API = '/api/lab/env-bar-preferences';
  var pushTimer = null;
  var pullInFlight = null;
  var readyResolve;
  var readyReject;
  var booted = false;
  var AUTH_READY_CAP_MS = 2000;

  var readyPromise = new Promise(function (resolve, reject) {
    readyResolve = resolve;
    readyReject = reject;
  });

  function prefsModule() {
    return global.AepLabEnvBarPrefs || null;
  }

  function tagsInjectInProgress() {
    if (global.AepLabTagsInjectGuard && typeof global.AepLabTagsInjectGuard.isInProgress === 'function') {
      if (global.AepLabTagsInjectGuard.isInProgress()) return true;
    }
    try {
      var prefix = '';
      if (global.envBarConfig) {
        prefix = String(global.envBarConfig.storagePrefix || global.envBarConfig.prefix || '').trim();
      }
      if (!prefix) return false;
      return global.sessionStorage.getItem(prefix + 'InjectInProgress') === '1';
    } catch (_e) {
      return false;
    }
  }

  function authHeaders() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getAuthHeaders === 'function') {
      return global.AepLabSandboxSync.getAuthHeaders();
    }
    return Promise.resolve({});
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

  function pull() {
    if (pullInFlight) return pullInFlight;
    pullInFlight = whenAuthReady()
      .then(function () {
        return authHeaders();
      })
      .then(function (headers) {
        if (!headers || !headers.Authorization) return null;
        return global.fetch(API, { method: 'GET', headers: headers, cache: 'no-store' });
      })
      .then(function (res) {
        if (!res) return null;
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            if (!res.ok || !body || !body.ok) return null;
            return body.preferences || null;
          });
      })
      .then(function (prefs) {
        if (prefs && prefsModule()) prefsModule().importFromSync(prefs);
        return prefs;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        pullInFlight = null;
      });
    return pullInFlight;
  }

  function pushNow() {
    var mod = prefsModule();
    if (!mod) return Promise.resolve(null);
    if (tagsInjectInProgress()) {
      return Promise.resolve(null);
    }
    return whenAuthReady()
      .then(function () {
        return authHeaders();
      })
      .then(function (headers) {
        if (!headers || !headers.Authorization) return null;
        var payload = mod.exportForSync();
        return global.fetch(API, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (body) {
                if (res.ok && body && body.ok && body.preferences && mod.importFromSync) {
                  var exported = mod.exportForSync();
                  var serverJson = JSON.stringify(body.preferences);
                  var localJson = JSON.stringify(exported);
                  if (serverJson !== localJson) {
                    mod.importFromSync(body.preferences);
                  }
                }
                return body;
              });
          });
      })
      .catch(function () {
        return null;
      });
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushNow();
    }, 2000);
  }

  function bindListeners() {
    global.addEventListener('aep-lab-env-bar-prefs-change', schedulePush);
    global.addEventListener('aep-global-sandbox-change', function (ev) {
      var mod = prefsModule();
      if (!mod) return;
      var detail = ev && ev.detail ? ev.detail : {};
      if (tagsInjectInProgress() && detail.source === 'sync') {
        return;
      }
      var name =
        detail.name != null
          ? String(detail.name || '').trim()
          : global.AepGlobalSandbox && global.AepGlobalSandbox.getSandboxName
            ? String(global.AepGlobalSandbox.getSandboxName() || '').trim()
            : '';
      if (name && name !== mod.getSelectedSandbox()) {
        mod.setSelectedSandbox(name, { explicit: detail.source === 'user' });
      } else if (!name) {
        schedulePush();
      }
    });
  }

  function boot() {
    if (booted) return readyPromise;
    booted = true;
    bindListeners();
    whenAuthReady()
      .then(function () {
        return pull();
      })
      .then(function () {
        if (readyResolve) readyResolve(null);
      })
      .catch(function (err) {
        if (readyReject) readyReject(err);
        else if (readyResolve) readyResolve(null);
      });
    return readyPromise;
  }

  boot();

  global.AepLabEnvBarPrefsSync = {
    whenReady: readyPromise,
    pull: pull,
    pushNow: pushNow,
    schedulePush: schedulePush,
  };
})(typeof window !== 'undefined' ? window : globalThis);
