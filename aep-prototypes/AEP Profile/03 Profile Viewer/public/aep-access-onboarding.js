(function (global) {
  'use strict';

  var OVERLAY_ID = 'aepAccessOnboardingOverlay';
  var FORCE_QUERY = /(?:^|[?&])accessSetup=1(?:&|$)/;
  var FORCE_ONBOARDING_FLAG = 'aepAccessForceOnboarding';
  /** Max wall-clock age for the hosted lab’s Google @adobe gate (re-prompt / sign-in), not Firebase refresh-token lifetime. Override before this script: `window.AEP_LAB_GOOGLE_SESSION_MAX_MS = 3*24*60*60*1000`. */
  var DEFAULT_LAB_GOOGLE_SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
  var LAB_GOOGLE_SESSION_MAX_MS =
    typeof global.AEP_LAB_GOOGLE_SESSION_MAX_MS === 'number' &&
    isFinite(global.AEP_LAB_GOOGLE_SESSION_MAX_MS) &&
    global.AEP_LAB_GOOGLE_SESSION_MAX_MS > 0
      ? global.AEP_LAB_GOOGLE_SESSION_MAX_MS
      : DEFAULT_LAB_GOOGLE_SESSION_MAX_MS;
  global.AEP_LAB_GOOGLE_SESSION_MAX_MS = LAB_GOOGLE_SESSION_MAX_MS;
  var LS_GOOGLE_VERIFIED_AT = 'aepLabGoogleVerifiedAt';
  /** Survives the sign-out auth tick so the modal keeps “session expired” copy until Google save succeeds. */
  var LS_REAUTH_PENDING = 'aepLabGoogleReauthPending';
  /** If `verifiedAt` is this many ms ahead of `Date.now()`, treat clock as skewed and force re-verify. */
  var VERIFIED_AT_FUTURE_SKEW_MS = 5 * 60 * 1000;

  function injectStyles() {
    if (document.getElementById('aepAccessOnboardingStyle')) return;
    var style = document.createElement('style');
    style.id = 'aepAccessOnboardingStyle';
    style.textContent =
      '.aep-access-onb-overlay{position:fixed;inset:0;z-index:14000;display:flex;align-items:center;justify-content:center;padding:20px;}' +
      '.aep-access-onb-overlay[hidden]{display:none !important;}' +
      '.aep-access-onb-backdrop{position:absolute;inset:0;background:var(--dash-bg);opacity:0.72;backdrop-filter:blur(2px);}' +
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
      '.aep-access-onb-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap;}' +
      '.aep-access-onb-msg{min-height:20px;color:var(--dash-text-secondary);font-size:13px;flex:1 1 220px;}' +
      '.aep-access-onb-msg.err{color:var(--dash-danger);}' +
      '.aep-access-onb-msg.ok{color:var(--dash-success);}' +
      '.aep-access-onb-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.95em;color:var(--dash-text);}' +
      '.aep-access-onb-step[hidden]{display:none !important;}' +
      '.aep-access-onb-step-actions{margin-top:14px;}';
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
    wrap.setAttribute('aria-labelledby', 'aepAccessOnbTitleSignIn');
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="aep-access-onb-backdrop"></div>' +
      '<div class="aep-access-onb-card">' +
      '<div id="aepAccessOnbStepSignIn" class="aep-access-onb-step">' +
      '<p id="aepAccessOnbKickerSignIn" class="aep-access-onb-kicker">Step 1 of 2</p>' +
      '<h2 id="aepAccessOnbTitleSignIn" class="aep-access-onb-title">Sign in with Google</h2>' +
      '<p id="aepAccessOnbCopySignIn" class="aep-access-onb-copy">Use your Adobe <strong>@adobe.com</strong> Google account. After you verify, you will choose <strong>Adobe sandbox</strong> vs <strong>no Adobe sandbox</strong> access.</p>' +
      '<div class="aep-access-onb-step-actions">' +
      '<button type="button" class="dashboard-btn-primary" id="aepAccessOnbGoogleBtn">Continue with Google</button>' +
      '</div></div>' +
      '<div id="aepAccessOnbStepMode" class="aep-access-onb-step" hidden>' +
      '<p class="aep-access-onb-kicker">Step 2 of 2</p>' +
      '<h2 id="aepAccessOnbTitleMode" class="aep-access-onb-title">Choose your lab access mode</h2>' +
      '<p class="aep-access-onb-copy">Adobe sandbox unlocks full AEP APIs with the sandbox selector. No Adobe sandbox keeps Brand Scraper and related tools on a workspace profile (admin approval may apply).</p>' +
      '<div class="aep-access-onb-choices">' +
      '<label class="aep-access-onb-choice"><input type="radio" name="aepAccessOnbMode" id="aepAccessOnbSandbox" value="sandbox" checked>' +
      '<span><strong>Adobe sandbox</strong><br><small>Use the standard sandbox selector and AEP APIs.</small></span></label>' +
      '<label class="aep-access-onb-choice"><input type="radio" name="aepAccessOnbMode" id="aepAccessOnbWorkspace" value="workspace">' +
      '<span><strong>No Adobe sandbox</strong><br><small>Use non-AEP tools with your own workspace profile.</small></span></label>' +
      '</div>' +
      '<div id="aepAccessOnbWorkspaceForm" class="aep-access-onb-grid" style="display:none">' +
      '<div><label for="aepAccessOnbFirstName">First name</label><input id="aepAccessOnbFirstName" type="text" maxlength="80" autocomplete="given-name"></div>' +
      '<div><label for="aepAccessOnbLastName">Last name</label><input id="aepAccessOnbLastName" type="text" maxlength="80" autocomplete="family-name"></div>' +
      '<p class="full aep-access-onb-copy" style="margin:0">No-sandbox mode uses your Google <span class="aep-access-onb-mono">@adobe.com</span> email. New workspace access stays <strong>pending</strong> until an admin approves it.</p>' +
      '</div>' +
      '</div>' +
      '<div class="aep-access-onb-foot">' +
      '<p id="aepAccessOnbMsg" class="aep-access-onb-msg" role="status" aria-live="polite"></p>' +
      '<button type="button" class="dashboard-btn-primary" id="aepAccessOnbSaveBtn" hidden>Save and continue</button>' +
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

  function readVerifiedAtRaw() {
    try {
      return localStorage.getItem(LS_GOOGLE_VERIFIED_AT) || '';
    } catch (_e) {
      return '';
    }
  }

  function parseVerifiedAtMs(raw) {
    var n = parseInt(String(raw || '').trim(), 10);
    return isFinite(n) && n > 0 ? n : NaN;
  }

  function writeVerifiedAt(ts) {
    try {
      localStorage.setItem(LS_GOOGLE_VERIFIED_AT, String(ts));
    } catch (_e) {}
  }

  function clearVerifiedAt() {
    try {
      localStorage.removeItem(LS_GOOGLE_VERIFIED_AT);
    } catch (_e2) {}
  }

  function clearLabGoogleReauthPending() {
    try {
      localStorage.removeItem(LS_REAUTH_PENDING);
    } catch (_e) {}
  }

  function isLabGoogleReauthPending() {
    try {
      return localStorage.getItem(LS_REAUTH_PENDING) === '1';
    } catch (_e2) {
      return false;
    }
  }

  function recordSuccessfulLabGoogleVerification() {
    clearLabGoogleReauthPending();
    writeVerifiedAt(Date.now());
  }

  function bootstrapVerifiedAtFromFirebaseUser(user) {
    if (parseVerifiedAtMs(readVerifiedAtRaw())) return;
    var meta = user && user.metadata;
    var iso = meta && (meta.lastSignInTime || meta.lastLoginAt);
    if (!iso) return;
    var t = Date.parse(String(iso));
    if (isFinite(t) && t > 0) writeVerifiedAt(t);
  }

  function setOnboardingCopyVariant(variant) {
    var kicker = document.getElementById('aepAccessOnbKickerSignIn');
    var title = document.getElementById('aepAccessOnbTitleSignIn');
    if (!kicker || !title) return;
    if (variant === 'session-expired') {
      kicker.textContent = 'Session expired';
      title.textContent = 'Sign in again';
    } else {
      kicker.textContent = 'Step 1 of 2';
      title.textContent = 'Sign in with Google';
    }
  }

  function setUiStep(step) {
    var signInEl = document.getElementById('aepAccessOnbStepSignIn');
    var modeEl = document.getElementById('aepAccessOnbStepMode');
    var saveBtn = document.getElementById('aepAccessOnbSaveBtn');
    var wrap = document.getElementById(OVERLAY_ID);
    if (!signInEl || !modeEl || !saveBtn) return;
    var isOne = step === 1;
    signInEl.hidden = !isOne;
    modeEl.hidden = isOne;
    saveBtn.hidden = isOne;
    if (wrap) {
      wrap.setAttribute('aria-labelledby', isOne ? 'aepAccessOnbTitleSignIn' : 'aepAccessOnbTitleMode');
    }
  }

  function syncRadiosFromScope() {
    if (!global.AepAccessScope) return;
    var sandboxRadio = document.getElementById('aepAccessOnbSandbox');
    var workspaceRadio = document.getElementById('aepAccessOnbWorkspace');
    if (!sandboxRadio || !workspaceRadio) return;
    if (global.AepAccessScope.getAccessMode() === 'workspace') {
      workspaceRadio.checked = true;
      sandboxRadio.checked = false;
    } else {
      sandboxRadio.checked = true;
      workspaceRadio.checked = false;
    }
  }

  function prefillWorkspaceNamesFromUser(user) {
    var fnEl = document.getElementById('aepAccessOnbFirstName');
    var lnEl = document.getElementById('aepAccessOnbLastName');
    if (!fnEl || !lnEl || !user) return;
    if (String(fnEl.value || '').trim() && String(lnEl.value || '').trim()) return;
    var dn = user.displayName ? String(user.displayName).trim() : '';
    if (!dn) return;
    var parts = dn.split(/\s+/);
    if (parts.length === 1) {
      fnEl.value = parts[0];
    } else {
      fnEl.value = parts[0];
      lnEl.value = parts.slice(1).join(' ');
    }
  }

  function expireLabGoogleGateAndSignOut(auth) {
    clearVerifiedAt();
    try {
      localStorage.setItem(LS_REAUTH_PENDING, '1');
    } catch (_e) {}
    if (!auth) return Promise.resolve(true);
    return auth
      .signOut()
      .catch(function () {})
      .then(function () {
        return true;
      });
  }

  /**
   * Lab gate TTL: @adobe Google + explicit access mode + stored verification age.
   * Skips users without an explicit mode (including no-sandbox signup not finished) so we do not loop on pending flows.
   */
  function enforceLabGoogleSessionMaxAgeAsync(auth, user) {
    if (!auth || !global.AepAccessScope) return Promise.resolve(false);
    if (!user || !isAdobeGoogleUser(user)) return Promise.resolve(false);
    if (!global.AepAccessScope.hasExplicitMode()) return Promise.resolve(false);
    bootstrapVerifiedAtFromFirebaseUser(user);
    var verifiedAt = parseVerifiedAtMs(readVerifiedAtRaw());
    if (!isFinite(verifiedAt)) {
      writeVerifiedAt(Date.now());
      return Promise.resolve(false);
    }
    var now = Date.now();
    if (verifiedAt > now + VERIFIED_AT_FUTURE_SKEW_MS) {
      return expireLabGoogleGateAndSignOut(auth);
    }
    if (now - verifiedAt <= LAB_GOOGLE_SESSION_MAX_MS) return Promise.resolve(false);
    return expireLabGoogleGateAndSignOut(auth);
  }

  function maybeOpenOnboardingAfterAuthCheck(labSessionJustExpired) {
    var reauthPending = isLabGoogleReauthPending();
    var explicitMode = global.AepAccessScope && global.AepAccessScope.hasExplicitMode();
    var needsGoogle = !hasAdobeGoogleLabSession();
    var useExpiredShell =
      !!labSessionJustExpired ||
      !!(reauthPending && explicitMode && needsGoogle);

    var shouldOpen = !!labSessionJustExpired || shouldAutoOpenOnboarding();
    if (!shouldOpen) return;

    if (!useExpiredShell) clearForceOpenFlag();

    if (useExpiredShell) {
      setOnboardingCopyVariant('session-expired');
      setMsg('Session expired — sign in with Google again to continue.', 'err');
    } else {
      setOnboardingCopyVariant('default');
    }
    show();
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

  function validateWorkspaceNames() {
    var firstName = String((document.getElementById('aepAccessOnbFirstName') || {}).value || '').trim();
    var lastName = String((document.getElementById('aepAccessOnbLastName') || {}).value || '').trim();
    if (!firstName) return { ok: false, error: 'First name is required.' };
    if (!lastName) return { ok: false, error: 'Last name is required.' };
    return { ok: true, firstName: firstName, lastName: lastName };
  }

  function hide() {
    var overlay = ensureOverlay();
    overlay.hidden = true;
    document.body.classList.remove('aep-access-onboarding-open');
    setOnboardingCopyVariant('default');
    setMsg('', '');
    setUiStep(1);
  }

  function show() {
    var overlay = ensureOverlay();
    overlay.hidden = false;
    document.body.classList.add('aep-access-onboarding-open');
    syncRadiosFromScope();
    try {
      if (global.__aepOnboardingPreferWorkspace) {
        selectWorkspaceMode();
        global.__aepOnboardingPreferWorkspace = false;
      }
    } catch (_pw) {}
    if (hasAdobeGoogleLabSession()) {
      setUiStep(2);
      refreshModeChoiceUi();
      var focusEl = document.getElementById('aepAccessOnbSandbox');
      if (focusEl) focusEl.focus();
    } else {
      if (!isLabGoogleReauthPending()) setMsg('', '');
      setUiStep(1);
      var gBtn = document.getElementById('aepAccessOnbGoogleBtn');
      if (gBtn) gBtn.focus();
    }
  }

  function ensureFirebaseAuth() {
    if (typeof firebase === 'undefined') return null;
    if (!firebase.apps.length && global.firebaseDatabaseConfig) {
      firebase.initializeApp(global.firebaseDatabaseConfig);
    }
    return firebase.auth ? firebase.auth() : null;
  }

  function isAdobeGoogleUser(user) {
    if (!user || !user.email) return false;
    var email = String(user.email).trim().toLowerCase();
    if (!email.endsWith('@adobe.com')) return false;
    var data = user.providerData || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].providerId === 'google.com') return true;
    }
    return false;
  }

  function hasAdobeGoogleLabSession() {
    var auth = ensureFirebaseAuth();
    if (!auth) return false;
    return isAdobeGoogleUser(auth.currentUser);
  }

  function shouldAutoOpenOnboarding() {
    if (!global.AepAccessScope) return false;
    var needsModeSetup = !global.AepAccessScope.hasExplicitMode();
    var needsGoogle = !hasAdobeGoogleLabSession();
    if (shouldForceOpen()) return true;
    if (needsModeSetup) return true;
    if (global.AepAccessScope.hasExplicitMode() && needsGoogle) return true;
    return false;
  }

  function ensureAdobeGoogleSession() {
    var auth = ensureFirebaseAuth();
    if (!auth) {
      return Promise.resolve({ ok: false, error: 'Firebase auth is not available on this page.' });
    }
    if (isAdobeGoogleUser(auth.currentUser)) {
      return Promise.resolve({ ok: true, user: auth.currentUser });
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return auth
      .signInWithPopup(provider)
      .then(function (cred) {
        var user = cred && cred.user;
        var email = String((user && user.email) || '').trim().toLowerCase();
        if (!email.endsWith('@adobe.com')) {
          return auth.signOut().then(function () {
            return { ok: false, error: 'Use your Adobe Google account (email must end in @adobe.com).' };
          });
        }
        if (!isAdobeGoogleUser(user)) {
          return auth.signOut().then(function () {
            return { ok: false, error: 'Please choose Sign in with Google using your Adobe @adobe.com account.' };
          });
        }
        return { ok: true, user: user };
      })
      .catch(function (e) {
        var code = String((e && e.code) || '');
        if (code === 'auth/user-disabled') {
          return {
            ok: false,
            error:
              'This account is pending admin approval or has been disabled. Try again after your no-sandbox access is approved.',
          };
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          return { ok: false, error: 'Sign-in was cancelled.' };
        }
        return { ok: false, error: String((e && e.message) || e || 'Google sign-in failed.') };
      });
  }

  function requestWorkspaceGoogleRegister(idToken, firstName, lastName) {
    return fetch('/api/lab/workspace-auth/register-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: idToken,
        firstName: firstName,
        lastName: lastName,
      }),
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
          return {
            ok: true,
            pendingApproval: !!resp.body.pendingApproval,
            emailSent: !!resp.body.emailSent,
            workspaceName: String((resp.body && resp.body.workspaceName) || ''),
            workspaceSlug: String((resp.body && resp.body.workspaceSlug) || ''),
          };
        }
        return {
          ok: false,
          code: String((resp.body && resp.body.code) || ''),
          error: (resp.body && resp.body.error) || 'Workspace signup request failed.',
        };
      })
      .catch(function (e) {
        return { ok: false, error: String((e && e.message) || e || 'Workspace signup request failed.') };
      });
  }

  function ensureApprovedWorkspaceGoogleAuth(user, input) {
    return user
      .getIdToken(true)
      .then(function (idToken) {
        return requestWorkspaceGoogleRegister(idToken, input.firstName, input.lastName);
      })
      .then(function (reg) {
        if (!reg || !reg.ok) return reg;
        if (reg.pendingApproval) {
          return {
            ok: false,
            pending: true,
            error: reg.emailSent
              ? 'Signup submitted. Approval email sent to admin. You will be signed out until the account is approved.'
              : 'Signup submitted, but approval email could not be sent. Contact the admin. You will be signed out until approved.',
          };
        }
        return { ok: true, workspaceName: reg.workspaceName, workspaceSlug: reg.workspaceSlug };
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
          return { ok: false, error: 'Could not read Firebase credentials after sign-in.' };
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

  function refreshModeChoiceUi() {
    var workspaceMode = selectedMode() === 'workspace';
    setWorkspaceFormVisible(workspaceMode);
    setMsg(
      workspaceMode
        ? 'No-sandbox mode uses your Google identity; admin approval may apply to new signups.'
        : 'Adobe sandbox uses your .env-backed sandbox selector and AEP APIs.',
      '',
    );
  }

  function wire() {
    ensureOverlay();
    var sandboxRadio = document.getElementById('aepAccessOnbSandbox');
    var workspaceRadio = document.getElementById('aepAccessOnbWorkspace');
    var saveBtn = document.getElementById('aepAccessOnbSaveBtn');
    var googleBtn = document.getElementById('aepAccessOnbGoogleBtn');
    if (!sandboxRadio || !workspaceRadio || !saveBtn || !googleBtn) return;

    function onModeChange() {
      refreshModeChoiceUi();
    }
    sandboxRadio.addEventListener('change', onModeChange);
    workspaceRadio.addEventListener('change', onModeChange);

    googleBtn.addEventListener('click', function () {
      googleBtn.disabled = true;
      setMsg('Opening Google sign-in…', '');
      ensureAdobeGoogleSession()
        .then(function (session) {
          if (!session || !session.ok) {
            setMsg((session && session.error) || 'Google sign-in is required.', 'err');
            return;
          }
          prefillWorkspaceNamesFromUser(session.user);
          setUiStep(2);
          syncRadiosFromScope();
          try {
            if (global.__aepOnboardingPreferWorkspace) {
              selectWorkspaceMode();
              global.__aepOnboardingPreferWorkspace = false;
            }
          } catch (_pw2) {}
          refreshModeChoiceUi();
          setMsg('Choose your access mode, then save.', '');
          if (sandboxRadio) sandboxRadio.focus();
        })
        .finally(function () {
          googleBtn.disabled = false;
        });
    });

    saveBtn.addEventListener('click', function () {
      if (!global.AepAccessScope) return;
      if (!hasAdobeGoogleLabSession()) {
        setMsg('Use “Continue with Google” first, then choose your mode.', 'err');
        setUiStep(1);
        return;
      }
      saveBtn.disabled = true;
      var alreadySignedIn = hasAdobeGoogleLabSession();
      setMsg(alreadySignedIn ? 'Saving…' : 'Opening Google sign-in…', '');

      ensureAdobeGoogleSession().then(function (session) {
        if (!session || !session.ok) {
          setMsg((session && session.error) || 'Google sign-in is required.', 'err');
          if (!hasAdobeGoogleLabSession()) setUiStep(1);
          saveBtn.disabled = false;
          return;
        }

        var user = session.user;
        var adobeEmail = String((user && user.email) || '').trim().toLowerCase();
        var mode = selectedMode();
        setMsg('Saving…', '');

        if (mode === 'sandbox') {
          global.AepAccessScope.setAccessMode('sandbox');
          recordSuccessfulLabGoogleVerification();
          setMsg('Saved.', 'ok');
          refreshSummary();
          try {
            global.dispatchEvent(new CustomEvent('aep-lab-google-session-updated'));
          } catch (_ev) {}
          setTimeout(function () { hide(); }, 220);
          saveBtn.disabled = false;
          return;
        }

        var input = validateWorkspaceNames();
        if (!input.ok) {
          setMsg(input.error, 'err');
          saveBtn.disabled = false;
          return;
        }

        var workspaceName = (input.firstName + ' ' + input.lastName).trim();
        var workspaceSlug = workspaceSlugFromProfile(global.AepAccessScope, adobeEmail, input.firstName, input.lastName);
        if (!workspaceSlug) {
          setMsg('Could not generate a workspace identifier. Try a different name.', 'err');
          saveBtn.disabled = false;
          return;
        }

        return ensureApprovedWorkspaceGoogleAuth(user, input).then(function (authResult) {
          if (!authResult || !authResult.ok) {
            setMsg((authResult && authResult.error) || 'Could not complete workspace signup.', 'err');
            if (authResult && authResult.pending) {
              var authInst = ensureFirebaseAuth();
              if (authInst) {
                authInst.signOut().catch(function () {});
              }
            }
            saveBtn.disabled = false;
            return;
          }

          return saveWorkspaceProfile({
            firstName: input.firstName,
            lastName: input.lastName,
            adobeEmail: adobeEmail,
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
            recordSuccessfulLabGoogleVerification();
            setMsg('Saved. You are in no-sandbox mode.', 'ok');
            refreshSummary();
            try {
              global.dispatchEvent(new CustomEvent('aep-lab-google-session-updated'));
            } catch (_ev2) {}
            setTimeout(function () { hide(); }, 250);
            saveBtn.disabled = false;
          });
        });
      });
    });
  }

  function init() {
    if (!global.AepAccessScope) return;
    wire();
    refreshSummary();

    global.addEventListener('aep-access-scope-change', refreshSummary);
    global.addEventListener('aep-access-forced-logout', function (event) {
      var detail = event && event.detail ? event.detail : {};
      if (!detail.requireOnboarding) return;
      clearForceOpenFlag();
      show();
      selectWorkspaceMode();
      setMsg('Your no-sandbox account is no longer active. Sign in with Google again to continue.', 'err');
    });

    var auth = ensureFirebaseAuth();
    if (!auth) {
      maybeOpenOnboardingAfterAuthCheck(false);
      return;
    }
    auth.onAuthStateChanged(function (user) {
      enforceLabGoogleSessionMaxAgeAsync(auth, user).then(function (expired) {
        maybeOpenOnboardingAfterAuthCheck(expired);
      });
    });
  }

  global.AepAccessOnboarding = {
    init: init,
    open: show,
    close: hide,
    hasAdobeGoogleLabSession: hasAdobeGoogleLabSession,
  };
})(typeof window !== 'undefined' ? window : this);
