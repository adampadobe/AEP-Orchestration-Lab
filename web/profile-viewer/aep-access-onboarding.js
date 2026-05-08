(function (global) {
  'use strict';

  var OVERLAY_ID = 'aepAccessOnboardingOverlay';
  var FORCE_QUERY = /(?:^|[?&])accessSetup=1(?:&|$)/;
  var FORCE_ONBOARDING_FLAG = 'aepAccessForceOnboarding';

  function injectStyles() {
    if (document.getElementById('aepAccessOnboardingStyle')) return;
    var style = document.createElement('style');
    style.id = 'aepAccessOnboardingStyle';
    style.textContent =
      '.aep-access-onb-overlay{position:fixed;inset:0;z-index:14000;display:flex;align-items:center;justify-content:center;padding:20px;}' +
      '.aep-access-onb-overlay[hidden]{display:none !important;}' +
      '.aep-access-onb-backdrop{position:absolute;inset:0;background:rgba(8,10,18,.62);backdrop-filter:blur(2px);}' +
      '.aep-access-onb-card{position:relative;z-index:1;width:min(640px,100%);background:var(--dash-surface);border:1px solid var(--dash-border);border-radius:16px;box-shadow:var(--dash-shadow);padding:22px;}' +
      '.aep-access-onb-kicker{margin:0 0 6px;color:var(--dash-text-secondary);font-size:12px;text-transform:uppercase;letter-spacing:.08em;}' +
      '.aep-access-onb-title{margin:0 0 10px;font-size:24px;line-height:1.2;}' +
      '.aep-access-onb-copy{margin:0 0 14px;color:var(--dash-text-secondary);}' +
      '.aep-access-onb-choices{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0 8px;}' +
      '.aep-access-onb-choice{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border:1px solid var(--dash-border);border-radius:12px;background:var(--dash-surface-alt);min-width:260px;}' +
      '.aep-access-onb-grid{display:grid;gap:10px;margin-top:12px;grid-template-columns:1fr 1fr;}' +
      '.aep-access-onb-grid .full{grid-column:1 / -1;}' +
      '.aep-access-onb-grid label{display:block;font-weight:600;margin-bottom:4px;}' +
      '.aep-access-onb-grid input{width:100%;padding:10px 12px;border:1px solid var(--dash-input-border);border-radius:10px;background:var(--dash-input-bg);color:var(--dash-text);}' +
      '.aep-access-onb-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;}' +
      '.aep-access-onb-msg{min-height:20px;color:var(--dash-text-secondary);font-size:13px;}' +
      '.aep-access-onb-msg.err{color:var(--dash-danger);}' +
      '.aep-access-onb-msg.ok{color:var(--dash-success);}';
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) return existing;
    injectStyles();
    var wrap = document.createElement('div');
    wrap.id = OVERLAY_ID;
    wrap.className = 'aep-access-onb-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'aepAccessOnbTitle');
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="aep-access-onb-backdrop"></div>' +
      '<div class="aep-access-onb-card">' +
      '<p class="aep-access-onb-kicker">First-time setup</p>' +
      '<h2 id="aepAccessOnbTitle" class="aep-access-onb-title">Choose your lab access mode</h2>' +
      '<p class="aep-access-onb-copy">Pick Adobe sandbox mode if you have AEP access. Pick no-sandbox mode for tools like Brand Scraper and Client Journey asset work.</p>' +
      '<div class="aep-access-onb-choices">' +
      '<label class="aep-access-onb-choice"><input type="radio" name="aepAccessOnbMode" id="aepAccessOnbSandbox" value="sandbox" checked>' +
      '<span><strong>Adobe sandbox</strong><br><small>Use the standard sandbox selector and AEP APIs.</small></span></label>' +
      '<label class="aep-access-onb-choice"><input type="radio" name="aepAccessOnbMode" id="aepAccessOnbWorkspace" value="workspace">' +
      '<span><strong>No Adobe sandbox</strong><br><small>Use non-AEP tools with your own workspace profile.</small></span></label>' +
      '</div>' +
      '<div id="aepAccessOnbWorkspaceForm" class="aep-access-onb-grid" style="display:none">' +
      '<div><label for="aepAccessOnbFirstName">First name</label><input id="aepAccessOnbFirstName" type="text" maxlength="80" autocomplete="given-name"></div>' +
      '<div><label for="aepAccessOnbLastName">Last name</label><input id="aepAccessOnbLastName" type="text" maxlength="80" autocomplete="family-name"></div>' +
      '<div class="full"><label for="aepAccessOnbEmail">Adobe email address</label><input id="aepAccessOnbEmail" type="email" maxlength="160" autocomplete="email" placeholder="name@adobe.com"></div>' +
      '<div><label for="aepAccessOnbPassword">Password</label><input id="aepAccessOnbPassword" type="password" maxlength="160" autocomplete="new-password" placeholder="At least 8 characters"></div>' +
      '<div><label for="aepAccessOnbPasswordConfirm">Confirm password</label><input id="aepAccessOnbPasswordConfirm" type="password" maxlength="160" autocomplete="new-password" placeholder="Re-enter password"></div>' +
      '<p class="full aep-access-onb-copy" style="margin:0">Sign up once. Your account remains pending until admin approval.</p>' +
      '</div>' +
      '<div class="aep-access-onb-foot">' +
      '<p id="aepAccessOnbMsg" class="aep-access-onb-msg" role="status" aria-live="polite"></p>' +
      '<button type="button" class="dashboard-btn-primary" id="aepAccessOnbSaveBtn">Save and continue</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function shouldForceOpen() {
    var fromQuery = false;
    try {
      fromQuery = FORCE_QUERY.test(String(global.location.search || ''));
    } catch (_e) {
      fromQuery = false;
    }
    if (fromQuery) return true;
    try {
      return localStorage.getItem(FORCE_ONBOARDING_FLAG) === '1';
    } catch (_e2) {
      return false;
    }
  }

  function clearForceOpenFlag() {
    try { localStorage.removeItem(FORCE_ONBOARDING_FLAG); } catch (_e) {}
  }

  function workspaceSlugFromProfile(scope, email, firstName, lastName) {
    var localPart = String(email || '').split('@')[0] || '';
    var fromEmail = scope.toSlug(localPart);
    if (fromEmail) return fromEmail.slice(0, 64);
    return scope.toSlug((firstName || '') + '-' + (lastName || '')).slice(0, 64);
  }

  function setMsg(text, cls) {
    var msg = document.getElementById('aepAccessOnbMsg');
    if (!msg) return;
    msg.textContent = text || '';
    msg.className = cls ? 'aep-access-onb-msg ' + cls : 'aep-access-onb-msg';
  }

  function setWorkspaceFormVisible(isVisible) {
    var form = document.getElementById('aepAccessOnbWorkspaceForm');
    if (form) form.style.display = isVisible ? 'grid' : 'none';
  }

  function selectedMode() {
    var workspace = document.getElementById('aepAccessOnbWorkspace');
    return workspace && workspace.checked ? 'workspace' : 'sandbox';
  }

  function selectWorkspaceMode() {
    var sandboxRadio = document.getElementById('aepAccessOnbSandbox');
    var workspaceRadio = document.getElementById('aepAccessOnbWorkspace');
    if (!workspaceRadio || !sandboxRadio) return;
    workspaceRadio.checked = true;
    sandboxRadio.checked = false;
    setWorkspaceFormVisible(true);
  }

  function validateWorkspaceInput() {
    var firstName = String((document.getElementById('aepAccessOnbFirstName') || {}).value || '').trim();
    var lastName = String((document.getElementById('aepAccessOnbLastName') || {}).value || '').trim();
    var adobeEmail = String((document.getElementById('aepAccessOnbEmail') || {}).value || '').trim().toLowerCase();
    var password = String((document.getElementById('aepAccessOnbPassword') || {}).value || '');
    var confirmPassword = String((document.getElementById('aepAccessOnbPasswordConfirm') || {}).value || '');
    if (!firstName) return { ok: false, error: 'First name is required.' };
    if (!lastName) return { ok: false, error: 'Last name is required.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adobeEmail)) return { ok: false, error: 'Enter a valid Adobe email address.' };
    if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    if (password !== confirmPassword) return { ok: false, error: 'Passwords do not match.' };
    return { ok: true, firstName: firstName, lastName: lastName, adobeEmail: adobeEmail, password: password };
  }

  function hide() {
    var overlay = ensureOverlay();
    overlay.hidden = true;
    document.body.classList.remove('aep-access-onboarding-open');
  }

  function show() {
    var overlay = ensureOverlay();
    overlay.hidden = false;
    document.body.classList.add('aep-access-onboarding-open');
    var first = document.getElementById('aepAccessOnbSandbox');
    if (first) first.focus();
  }

  function ensureFirebaseAuth() {
    if (typeof firebase === 'undefined') return null;
    if (!firebase.apps.length && global.firebaseDatabaseConfig) {
      firebase.initializeApp(global.firebaseDatabaseConfig);
    }
    return firebase.auth ? firebase.auth() : null;
  }

  function signInWorkspaceUser(email, password) {
    var auth = ensureFirebaseAuth();
    if (!auth) return Promise.resolve({ ok: false, error: 'Firebase auth is not available.' });
    return auth
      .signInWithEmailAndPassword(email, password)
      .then(function (cred) {
        return { ok: true, user: cred && cred.user ? cred.user : null };
      })
      .catch(function (e) {
        var code = String((e && e.code) || '');
        if (code === 'auth/user-disabled') {
          return { ok: false, pending: true, error: 'Account pending approval. You will be able to log in after approval.' };
        }
        if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
          return { ok: false, needsSignup: true };
        }
        if (code === 'auth/wrong-password') {
          return { ok: false, error: 'Incorrect email or password.' };
        }
        return { ok: false, error: String((e && e.message) || e || 'Could not sign in.') };
      });
  }

  function requestWorkspaceSignup(payload) {
    return fetch('/api/lab/workspace-auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (json) {
            return { status: res.status, body: json || {} };
          });
      })
      .then(function (resp) {
        if (resp.status >= 200 && resp.status < 300 && resp.body && resp.body.ok) {
          return { ok: true, pendingApproval: !!resp.body.pendingApproval, emailSent: !!resp.body.emailSent };
        }
        return {
          ok: false,
          code: String((resp.body && resp.body.code) || ''),
          error: (resp.body && resp.body.error) || 'Signup request failed.',
        };
      })
      .catch(function (e) {
        return { ok: false, error: String((e && e.message) || e || 'Signup request failed.') };
      });
  }

  function ensureApprovedWorkspaceAuth(input) {
    return signInWorkspaceUser(input.adobeEmail, input.password).then(function (signInResult) {
      if (signInResult && signInResult.ok) return { ok: true };
      if (signInResult && signInResult.pending) return signInResult;
      if (signInResult && !signInResult.needsSignup) return signInResult;
      return requestWorkspaceSignup({
        firstName: input.firstName,
        lastName: input.lastName,
        adobeEmail: input.adobeEmail,
        password: input.password,
      }).then(function (signupResult) {
        if (signupResult && signupResult.code === 'already_active') {
          return { ok: false, error: 'Incorrect email or password.' };
        }
        if (!signupResult.ok) return signupResult;
        return {
          ok: false,
          pending: true,
          error: signupResult.emailSent
            ? 'Signup submitted. Approval email sent to admin. Please try signing in after approval.'
            : 'Signup submitted, but approval email could not be sent. Contact the admin.',
        };
      });
    });
  }

  function saveWorkspaceProfile(payload) {
    var sync = global.AepLabSandboxSync;
    if (!sync || typeof sync.getAuthHeaders !== 'function') {
      return Promise.resolve({ ok: false, error: 'Firebase sync is not ready on this page.' });
    }
    var wait = sync.whenReady && typeof sync.whenReady.then === 'function' ? sync.whenReady : Promise.resolve();
    return wait
      .then(function () {
        return sync.getAuthHeaders();
      })
      .then(function (headers) {
        if (!headers || !headers.Authorization) {
          return { ok: false, error: 'Could not sign in to Firebase.' };
        }
        return fetch('/api/lab/workspace-profile', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; });
          })
          .then(function (json) {
            return json && json.ok ? { ok: true, profile: json.profile || null } : { ok: false, error: (json && json.error) || 'Failed to save profile.' };
          })
          .catch(function (e) {
            return { ok: false, error: String((e && e.message) || e || 'Failed to save profile.') };
          });
      });
  }

  function refreshSummary() {
    if (!global.AepAccessScope) return;
    var summaryEl = document.getElementById('aepAccessModeSummary');
    if (!summaryEl) return;
    var scope = global.AepAccessScope.getScope();
    summaryEl.textContent = scope.mode === 'workspace'
      ? ('No-sandbox workspace: ' + (scope.workspaceName || scope.scopeId || 'not configured'))
      : 'Adobe sandbox mode';
  }

  function wire() {
    ensureOverlay();
    var sandboxRadio = document.getElementById('aepAccessOnbSandbox');
    var workspaceRadio = document.getElementById('aepAccessOnbWorkspace');
    var saveBtn = document.getElementById('aepAccessOnbSaveBtn');
    if (!sandboxRadio || !workspaceRadio || !saveBtn) return;

    function onModeChange() {
      var workspaceMode = selectedMode() === 'workspace';
      setWorkspaceFormVisible(workspaceMode);
      setMsg(workspaceMode ? 'No-sandbox mode requires signup and admin approval.' : '', '');
    }
    sandboxRadio.addEventListener('change', onModeChange);
    workspaceRadio.addEventListener('change', onModeChange);
    onModeChange();

    saveBtn.addEventListener('click', function () {
      if (!global.AepAccessScope) return;
      var mode = selectedMode();
      saveBtn.disabled = true;
      setMsg('Saving…', '');

      if (mode === 'sandbox') {
        global.AepAccessScope.setAccessMode('sandbox');
        setMsg('Saved.', 'ok');
        refreshSummary();
        setTimeout(function () { hide(); }, 220);
        saveBtn.disabled = false;
        return;
      }

      var input = validateWorkspaceInput();
      if (!input.ok) {
        setMsg(input.error, 'err');
        saveBtn.disabled = false;
        return;
      }

      var workspaceName = (input.firstName + ' ' + input.lastName).trim();
      var workspaceSlug = workspaceSlugFromProfile(global.AepAccessScope, input.adobeEmail, input.firstName, input.lastName);
      if (!workspaceSlug) {
        setMsg('Could not generate a workspace identifier. Try a different email.', 'err');
        saveBtn.disabled = false;
        return;
      }

      ensureApprovedWorkspaceAuth(input).then(function (authResult) {
        if (!authResult || !authResult.ok) {
          setMsg((authResult && authResult.error) || 'Could not sign in.', 'err');
          saveBtn.disabled = false;
          return;
        }

        return saveWorkspaceProfile({
          firstName: input.firstName,
          lastName: input.lastName,
          adobeEmail: input.adobeEmail,
          workspaceName: workspaceName,
          workspaceSlug: workspaceSlug,
        }).then(function (result) {
          if (!result || !result.ok) {
            setMsg((result && result.error) || 'Failed to save workspace profile.', 'err');
            saveBtn.disabled = false;
            return;
          }
          global.AepAccessScope.setWorkspaceName(workspaceName);
          global.AepAccessScope.setWorkspaceSlug(workspaceSlug);
          global.AepAccessScope.setAccessMode('workspace');
          try { localStorage.removeItem('aepGlobalSandboxName'); } catch (_e) {}
          setMsg('Saved. You are in no-sandbox mode.', 'ok');
          refreshSummary();
          setTimeout(function () { hide(); }, 250);
          saveBtn.disabled = false;
        });
      });
    });
  }

  function init() {
    if (!global.AepAccessScope) return;
    wire();
    refreshSummary();

    var needsSetup = !global.AepAccessScope.hasExplicitMode();
    if (needsSetup || shouldForceOpen()) {
      clearForceOpenFlag();
      show();
    }
    global.addEventListener('aep-access-scope-change', refreshSummary);
    global.addEventListener('aep-access-forced-logout', function (event) {
      var detail = event && event.detail ? event.detail : {};
      if (!detail.requireOnboarding) return;
      clearForceOpenFlag();
      show();
      selectWorkspaceMode();
      setMsg('Your no-sandbox account is no longer active. Sign up again to continue.', 'err');
    });
  }

  global.AepAccessOnboarding = {
    init: init,
    open: show,
    close: hide,
  };
})(typeof window !== 'undefined' ? window : this);
