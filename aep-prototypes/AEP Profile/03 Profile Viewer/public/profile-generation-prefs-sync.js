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
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function applyPrefsToLocal(prefs, sandbox) {
    var Shared = global.AepProfileGenShared;
    if (!Shared || !prefs || typeof prefs !== 'object') return;
    var sb = String(sandbox || prefs.sandbox || getSandboxName() || '').trim();
    if (!sb) return;

    if (prefs.baseEmail != null) {
      Shared.writeBaseEmail(sb, String(prefs.baseEmail || ''));
    }
    if (prefs.mobilePhone != null) {
      Shared.writeBaseMobile(sb, String(prefs.mobilePhone || ''));
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

  function pull(sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb) return Promise.resolve(null);
    if (pullInFlight) return pullInFlight;

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
        if (!out.res.ok || !out.data || out.data.ok === false) return null;
        applyPrefsToLocal(out.data.prefs, sb);
        return out.data.prefs;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        pullInFlight = null;
      });

    return pullInFlight;
  }

  function savePatch(patch, sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb || !patch || typeof patch !== 'object') return Promise.resolve(null);

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
        if (!out.res.ok || !out.data || out.data.ok === false) return null;
        applyPrefsToLocal(out.data.prefs, sb);
        return out.data.prefs;
      })
      .catch(function () {
        return null;
      });
  }

  function scheduleSave(patch, sandbox) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      savePatch(patch, sandbox);
    }, 400);
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

  global.addEventListener('aep-global-sandbox-change', onSandboxChange);

  global.AepProfileGenPrefsSync = {
    pull: pull,
    savePatch: savePatch,
    scheduleSave: scheduleSave,
    reserveNextEmail: reserveNextEmail,
    applyPrefsToLocal: applyPrefsToLocal,
  };

  setTimeout(function () {
    pull(getSandboxName());
  }, 1200);
})(window);
