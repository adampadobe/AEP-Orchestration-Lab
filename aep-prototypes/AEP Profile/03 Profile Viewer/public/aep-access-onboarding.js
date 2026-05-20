(function (global) {
  'use strict';

  var OVERLAY_ID = 'aepAccessOnboardingOverlay';
  var GATE_LAYER_ID = 'aepAccessOnboardingGateLayer';
  /** Home dashboard markup lives in an inert <template> until the lab gate clears (see home.html). */
  var DEFERRED_HOME_DASHBOARD_TEMPLATE_ID = 'aepDeferredDashboardShell';
  var DEFERRED_HOME_DASHBOARD_MOUNT_ID = 'aepDashboardMount';
  /** Fired on window after the deferred home dashboard fragment is inserted (one rAF). */
  var DEFERRED_HOME_DASHBOARD_MOUNTED_EVENT = 'aep-deferred-dashboard-mounted';
  var didMountDeferredHomeDashboard = false;
  /** True while the lab gate should block the shell (between show() and hide()). */
  var gateInteractionLockActive = false;
  var gateDomObserver = null;
  var gateEnforcerTimer = null;
  var gateLayerAttrObserver = null;
  var dialogWrapAttrObserver = null;
  var gateRecoverScheduled = null;
  var gateLayerElRef = null;
  var dialogWrapElRef = null;
  var FORCE_QUERY = /(?:^|[?&])accessSetup=1(?:&|$)/;
  var FORCE_ONBOARDING_FLAG = 'aepAccessForceOnboarding';
  /** Max wall-clock age for the hosted lab Adobe-email gate (re-prompt), not Firebase refresh-token lifetime. */
  var DEFAULT_LAB_EMAIL_SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
  var LAB_EMAIL_SESSION_MAX_MS =
    typeof global.AEP_LAB_EMAIL_SESSION_MAX_MS === 'number' &&
    isFinite(global.AEP_LAB_EMAIL_SESSION_MAX_MS) &&
    global.AEP_LAB_EMAIL_SESSION_MAX_MS > 0
      ? global.AEP_LAB_EMAIL_SESSION_MAX_MS
      : typeof global.AEP_LAB_GOOGLE_SESSION_MAX_MS === 'number' &&
          isFinite(global.AEP_LAB_GOOGLE_SESSION_MAX_MS) &&
          global.AEP_LAB_GOOGLE_SESSION_MAX_MS > 0
        ? global.AEP_LAB_GOOGLE_SESSION_MAX_MS
        : DEFAULT_LAB_EMAIL_SESSION_MAX_MS;
  global.AEP_LAB_EMAIL_SESSION_MAX_MS = LAB_EMAIL_SESSION_MAX_MS;
  global.AEP_LAB_GOOGLE_SESSION_MAX_MS = LAB_EMAIL_SESSION_MAX_MS;

  var LS_EMAIL_VERIFIED_AT = 'aepLabEmailVerifiedAt';
  var LS_GOOGLE_VERIFIED_AT_LEGACY = 'aepLabGoogleVerifiedAt';
  /** Survives the sign-out auth tick so the modal keeps “session expired” copy until sign-in succeeds. */
  var LS_REAUTH_PENDING = 'aepLabEmailReauthPending';
  var LS_GOOGLE_REAUTH_LEGACY = 'aepLabGoogleReauthPending';
  /** If `verifiedAt` is this many ms ahead of `Date.now()`, treat clock as skewed and force re-verify. */
  var VERIFIED_AT_FUTURE_SKEW_MS = 5 * 60 * 1000;
  var MIN_LAB_PASSWORD_LEN = 8;
  /** Shown when lab access is pending (login, auth listener, or reopening setup while still signed in). */
  var PENDING_LAB_ACCESS_MSG =
    'Your lab access is pending administrator approval. Wait for an administrator to approve your account, then sign in with Log in below to continue lab setup.';
  /** After successful Create account + server signup approval request (user is signed out). */
  var POST_SIGNUP_PENDING_MSG =
    'Your registration was submitted. An administrator must approve your account before you can sign in. Wait for approval, then use Log in below to continue lab setup.';
  /**
   * Tab-scoped sessionStorage so a full page refresh keeps the step-1 “awaiting approval” hold panel
   * instead of resetting to Create account (lab-only; cleared when the tab closes).
   *
   * Keys:
   * - `aepLabSignupPendingAwaitingApproval` — `'1'` while the user should see the hold UI after signup
   *   pending and/or lab access status pending (typically signed out).
   * - `aepLabSignupPendingHoldKind` — `postSignup` (Create account → pendingApproval) vs `labStatus`
   *   (login / status check → pending).
   * - `aepLabOnboardingLastSignupEmail` — prefilled when switching from hold to Log in (existing).
   */
  var SS_ONBOARDING_LAST_SIGNUP_EMAIL = 'aepLabOnboardingLastSignupEmail';
  var SS_SIGNUP_PENDING_AWAITING_APPROVAL = 'aepLabSignupPendingAwaitingApproval';
  var SS_SIGNUP_PENDING_HOLD_KIND = 'aepLabSignupPendingHoldKind';
  var HOLD_KIND_POST_SIGNUP = 'postSignup';
  var HOLD_KIND_LAB_STATUS = 'labStatus';
  var step1LoginMode = false;
  var step1SessionExpiredShell = false;
  /** Step 1 “holding” panel: post-signup pending or signed-in-as-pending lockout (no form, single Log in). */
  var step1HoldMode = false;
  var step1HoldMessage = '';

  function migrateLegacyLabLocalStorage() {
    try {
      if (!localStorage.getItem(LS_EMAIL_VERIFIED_AT)) {
        var legV = localStorage.getItem(LS_GOOGLE_VERIFIED_AT_LEGACY);
        if (legV) {
          localStorage.setItem(LS_EMAIL_VERIFIED_AT, legV);
          localStorage.removeItem(LS_GOOGLE_VERIFIED_AT_LEGACY);
        }
      }
      if (localStorage.getItem(LS_REAUTH_PENDING) !== '1' && localStorage.getItem(LS_GOOGLE_REAUTH_LEGACY) === '1') {
        localStorage.setItem(LS_REAUTH_PENDING, '1');
        localStorage.removeItem(LS_GOOGLE_REAUTH_LEGACY);
      }
    } catch (_e) {}
  }

  function syncStep1AuthUi() {
    var title = document.getElementById('aepAccessOnbTitleSignIn');
    var primary = document.getElementById('aepAccessOnbPrimaryAuthBtn');
    var secondary = document.getElementById('aepAccessOnbSecondaryAuthBtn');
    var confirmWrap = document.getElementById('aepAccessOnbConfirmWrap');
    var pwd = document.getElementById('aepAccessOnbPassword');
    var holdPanel = document.getElementById('aepAccessOnbHoldPanel');
    var holdCopy = document.getElementById('aepAccessOnbHoldCopy');
    var credentialWrap = document.getElementById('aepAccessOnbStep1CredentialWrap');
    var emailForm = document.getElementById('aepAccessOnbEmailForm');
    var step1Intro = document.getElementById('aepAccessOnbCopySignIn');
    var step1Actions = document.getElementById('aepAccessOnbStep1Actions');
    if (!primary || !secondary) return;

    if (step1HoldMode) {
      var kickerHold = document.getElementById('aepAccessOnbKickerSignIn');
      if (kickerHold) kickerHold.textContent = 'Pending approval';
      if (holdPanel) holdPanel.hidden = false;
      if (holdCopy) holdCopy.textContent = step1HoldMessage || PENDING_LAB_ACCESS_MSG;
      if (credentialWrap) {
        credentialWrap.hidden = true;
      } else {
        if (emailForm) emailForm.hidden = true;
        if (step1Intro) step1Intro.hidden = true;
        if (step1Actions) step1Actions.hidden = true;
      }
      if (title) title.textContent = 'Awaiting administrator approval';
      if (confirmWrap) confirmWrap.hidden = true;
      return;
    }

    if (holdPanel) holdPanel.hidden = true;
    if (credentialWrap) {
      credentialWrap.hidden = false;
    } else {
      if (emailForm) emailForm.hidden = false;
      if (step1Intro) step1Intro.hidden = false;
      if (step1Actions) step1Actions.hidden = false;
    }

    if (step1LoginMode) {
      if (title) title.textContent = step1SessionExpiredShell ? 'Sign in again' : 'Log in';
      primary.textContent = 'Log in';
      primary.setAttribute('class', 'dashboard-btn-primary');
      secondary.textContent = 'Create an account';
      secondary.setAttribute('class', 'dashboard-btn-outline');
      if (confirmWrap) confirmWrap.hidden = true;
      if (pwd) pwd.setAttribute('autocomplete', 'current-password');
    } else {
      if (title) title.textContent = 'Create an account';
      primary.textContent = 'Create account';
      primary.setAttribute('class', 'dashboard-btn-primary');
      secondary.textContent = 'Login';
      secondary.setAttribute('class', 'dashboard-btn-outline');
      if (confirmWrap) confirmWrap.hidden = false;
      if (pwd) pwd.setAttribute('autocomplete', 'new-password');
    }
  }

  function setStep1HoldMode(on, message) {
    step1HoldMode = !!on;
    step1HoldMessage = on ? String(message || '') : '';
    syncStep1AuthUi();
    if (on) {
      var holdBtn = document.getElementById('aepAccessOnbHoldLoginBtn');
      try {
        if (holdBtn && typeof holdBtn.focus === 'function') {
          global.setTimeout(function () {
            holdBtn.focus();
          }, 0);
        }
      } catch (_f) {}
    }
  }

  function clearStep1HoldMode(opts) {
    opts = opts || {};
    step1HoldMode = false;
    step1HoldMessage = '';
    if (opts.preferLogin) {
      setStep1AuthMode(true, { clearSessionExpired: true });
    }
    var kicker = document.getElementById('aepAccessOnbKickerSignIn');
    if (kicker && !step1SessionExpiredShell) kicker.textContent = 'Step 1 of 2';
    syncStep1AuthUi();
  }

  function setStep1AuthMode(isLogin, opts) {
    opts = opts || {};
    step1LoginMode = !!isLogin;
    if (opts.sessionExpired) step1SessionExpiredShell = true;
    if (opts.clearSessionExpired) step1SessionExpiredShell = false;
    syncStep1AuthUi();
  }

  function injectStyles() {
    if (document.getElementById('aepAccessOnboardingStyle')) return;
    var style = document.createElement('style');
    style.id = 'aepAccessOnboardingStyle';
    style.textContent =
      'body.aep-access-onboarding-open{overflow:hidden;}' +
      '.aep-access-onb-gate{position:fixed;inset:0;z-index:13990;pointer-events:auto;background:var(--dash-bg);opacity:0.72;backdrop-filter:blur(2px);}' +
      '.aep-access-onb-gate[hidden]{display:none !important;}' +
      '.aep-access-onb-overlay{position:fixed;inset:0;z-index:14000;display:flex;align-items:center;justify-content:center;padding:20px;pointer-events:none;}' +
      '.aep-access-onb-overlay[hidden]{display:none !important;}' +
      'body.aep-access-gate-active #aepAccessOnboardingGateLayer{display:block!important;visibility:visible!important;}' +
      'body.aep-access-gate-active #aepAccessOnboardingOverlay{display:flex!important;visibility:visible!important;}' +
      '.aep-access-onb-card{position:relative;z-index:1;width:min(640px,100%);pointer-events:auto;background:var(--dash-surface);border:1px solid var(--dash-border);border-radius:16px;box-shadow:var(--dash-shadow);padding:22px 80px;}' +
      '@media (max-width:640px){.aep-access-onb-card{padding-left:16px;padding-right:16px;}}' +
      '.dashboard-main.aep-access-gate-locked{pointer-events:none;user-select:none;}' +
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
      '.aep-access-onb-step1-credentials[hidden]{display:none !important;}' +
      '.aep-access-onb-hold-copy{margin-top:0}' +
      '.aep-access-onb-hold-actions{margin-top:4px}' +
      '.aep-access-onb-step-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px;}' +
      '.aep-access-onb-step2-foot{display:flex;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;gap:10px;}';
    document.head.appendChild(style);
  }

  function getDashboardMainEl() {
    return document.querySelector('.dashboard-main') || document.querySelector('main.dashboard-main');
  }

  function supportsInertAttribute() {
    return typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
  }

  function applyShellInteractionLock() {
    var main = getDashboardMainEl();
    if (!main) return;
    if (supportsInertAttribute()) {
      main.inert = true;
    } else {
      main.classList.add('aep-access-gate-locked');
    }
  }

  function clearShellInteractionLock() {
    var main = getDashboardMainEl();
    if (!main) return;
    if (supportsInertAttribute()) {
      main.inert = false;
    } else {
      main.classList.remove('aep-access-gate-locked');
    }
  }

  function isGateLockElement(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el === gateLayerElRef || el === dialogWrapElRef) return true;
    } catch (_e) {}
    return el.id === GATE_LAYER_ID || el.id === OVERLAY_ID;
  }

  /**
   * DevTools can set inline `display:none` / `visibility:hidden` on the gate layer; the `hidden` attribute alone
   * does not undo that. While the interaction lock is active, strip hiding inline display/visibility and clear `hidden`.
   */
  function normalizeGateElementVisibility(el) {
    if (!gateInteractionLockActive || !el) return;
    if (!isGateLockElement(el)) return;
    try {
      el.hidden = false;
      var st = el.style;
      if (!st || typeof st.getPropertyValue !== 'function') return;
      var disp = String(st.getPropertyValue('display') || '').trim().toLowerCase();
      if (disp === 'none') st.removeProperty('display');
      var vis = String(st.getPropertyValue('visibility') || '').trim().toLowerCase();
      if (vis === 'hidden' || vis === 'collapse') st.removeProperty('visibility');
    } catch (_e2) {}
  }

  function enforceGateLayerOrder(gate, dialog) {
    if (!gate || !dialog || !document.body) return;
    if (!document.body.contains(gate)) document.body.appendChild(gate);
    if (!document.body.contains(dialog)) document.body.appendChild(dialog);
    try {
      document.body.insertBefore(gate, dialog);
    } catch (_e) {}
  }

  function flushGateDomRecovery() {
    gateRecoverScheduled = null;
    if (!gateInteractionLockActive) return;
    var gate = gateLayerElRef || document.getElementById(GATE_LAYER_ID);
    var dialog = dialogWrapElRef || document.getElementById(OVERLAY_ID);
    if (!gate || !dialog) return;
    enforceGateLayerOrder(gate, dialog);
    gate.hidden = false;
    dialog.hidden = false;
    normalizeGateElementVisibility(gate);
    normalizeGateElementVisibility(dialog);
  }

  function scheduleGateDomRecovery() {
    if (!gateInteractionLockActive) return;
    if (gateRecoverScheduled) return;
    gateRecoverScheduled = setTimeout(flushGateDomRecovery, 40);
  }

  function startGateDomObserver() {
    if (gateDomObserver || typeof MutationObserver === 'undefined') return;

    // Watches document.body childList — catches element deletion
    gateDomObserver = new MutationObserver(function () {
      if (!gateInteractionLockActive) return;
      var gate = gateLayerElRef || document.getElementById(GATE_LAYER_ID);
      var dialog = dialogWrapElRef || document.getElementById(OVERLAY_ID);
      if (!gate || !dialog || !document.body.contains(gate) || !document.body.contains(dialog)) {
        scheduleGateDomRecovery();
        return;
      }
      // Re-show if hidden attribute was set on either element; strip inline display/visibility tampering.
      if (gate.hidden) gate.hidden = false;
      if (dialog.hidden) dialog.hidden = false;
      normalizeGateElementVisibility(gate);
      normalizeGateElementVisibility(dialog);
    });
    gateDomObserver.observe(document.body, { childList: true, subtree: false });

    // Also watch the elements themselves for hidden/style attribute tampering
    function replaceAttrObserver(prev, el) {
      if (prev) {
        prev.disconnect();
      }
      if (!el || typeof MutationObserver === 'undefined') return null;
      var elObs = new MutationObserver(function () {
        if (!gateInteractionLockActive) return;
        normalizeGateElementVisibility(el);
      });
      elObs.observe(el, { attributes: true, attributeFilter: ['hidden', 'style'] });
      return elObs;
    }

    var gate = gateLayerElRef || document.getElementById(GATE_LAYER_ID);
    var dialog = dialogWrapElRef || document.getElementById(OVERLAY_ID);
    gateLayerAttrObserver = replaceAttrObserver(gateLayerAttrObserver, gate);
    dialogWrapAttrObserver = replaceAttrObserver(dialogWrapAttrObserver, dialog);
  }

  function stopGateDomObserver() {
    if (gateRecoverScheduled) {
      clearTimeout(gateRecoverScheduled);
      gateRecoverScheduled = null;
    }
    if (gateLayerAttrObserver) {
      gateLayerAttrObserver.disconnect();
      gateLayerAttrObserver = null;
    }
    if (dialogWrapAttrObserver) {
      dialogWrapAttrObserver.disconnect();
      dialogWrapAttrObserver = null;
    }
    if (gateDomObserver) {
      gateDomObserver.disconnect();
      gateDomObserver = null;
    }
  }

  function startGateEnforcer() {
    if (gateEnforcerTimer) return;
    gateEnforcerTimer = setInterval(function () {
      if (!gateInteractionLockActive) {
        stopGateEnforcer();
        return;
      }
      var gate = gateLayerElRef || document.getElementById(GATE_LAYER_ID);
      var dialog = dialogWrapElRef || document.getElementById(OVERLAY_ID);
      if (gate && gate.hidden) gate.hidden = false;
      if (gate) normalizeGateElementVisibility(gate);
      if (dialog && dialog.hidden) dialog.hidden = false;
      if (dialog) normalizeGateElementVisibility(dialog);
      applyShellInteractionLock();
    }, 400);
  }

  function stopGateEnforcer() {
    if (gateEnforcerTimer) {
      clearInterval(gateEnforcerTimer);
      gateEnforcerTimer = null;
    }
  }

  function ensureAccessGateDom() {
    var gate = document.getElementById(GATE_LAYER_ID);
    var wrap = document.getElementById(OVERLAY_ID);
    if (gate && wrap) {
      gateLayerElRef = gate;
      dialogWrapElRef = wrap;
      enforceGateLayerOrder(gate, wrap);
      return wrap;
    }
    injectStyles();

    if (!gate) {
      gate = document.createElement('div');
      gate.id = GATE_LAYER_ID;
      gate.className = 'aep-access-onb-gate';
      gate.setAttribute('aria-hidden', 'true');
      gate.hidden = true;
      document.body.appendChild(gate);
    }
    gateLayerElRef = gate;

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = OVERLAY_ID;
      wrap.className = 'aep-access-onb-overlay';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-labelledby', 'aepAccessOnbTitleSignIn');
      wrap.hidden = true;
      wrap.innerHTML =
        '<div class="aep-access-onb-card">' +
        '<div id="aepAccessOnbStepSignIn" class="aep-access-onb-step">' +
        '<p id="aepAccessOnbKickerSignIn" class="aep-access-onb-kicker">Step 1 of 2</p>' +
        '<h2 id="aepAccessOnbTitleSignIn" class="aep-access-onb-title">Create an account</h2>' +
        '<div id="aepAccessOnbHoldPanel" class="aep-access-onb-hold" hidden>' +
        '<p id="aepAccessOnbHoldCopy" class="aep-access-onb-copy aep-access-onb-hold-copy"></p>' +
        '<div class="aep-access-onb-step-actions aep-access-onb-hold-actions">' +
        '<button type="button" class="dashboard-btn-primary" id="aepAccessOnbHoldLoginBtn">Log in</button>' +
        '</div></div>' +
        '<div id="aepAccessOnbStep1CredentialWrap" class="aep-access-onb-step1-credentials">' +
        '<p id="aepAccessOnbCopySignIn" class="aep-access-onb-copy">Use your Adobe <strong>@adobe.com</strong> email and password. New accounts are reviewed by an administrator; after approval, sign in again to choose <strong>Adobe sandbox</strong> vs <strong>no Adobe sandbox</strong> access.</p>' +
        '<div id="aepAccessOnbEmailForm" class="aep-access-onb-grid" style="grid-template-columns:1fr">' +
        '<div class="full"><label for="aepAccessOnbEmail">Adobe email</label><input id="aepAccessOnbEmail" type="email" autocomplete="username" inputmode="email" spellcheck="false" maxlength="200" placeholder="you@adobe.com"></div>' +
        '<div class="full"><label for="aepAccessOnbPassword">Password</label><input id="aepAccessOnbPassword" type="password" autocomplete="new-password" maxlength="128"></div>' +
        '<div id="aepAccessOnbConfirmWrap" class="full"><label for="aepAccessOnbPasswordConfirm">Confirm password</label><input id="aepAccessOnbPasswordConfirm" type="password" autocomplete="new-password" maxlength="128"></div>' +
        '</div>' +
        '<div id="aepAccessOnbStep1Actions" class="aep-access-onb-step-actions">' +
        '<button type="button" class="dashboard-btn-primary" id="aepAccessOnbPrimaryAuthBtn">Create account</button>' +
        '<button type="button" class="dashboard-btn-outline" id="aepAccessOnbSecondaryAuthBtn">Login</button>' +
        '</div></div></div>' +
        '<div id="aepAccessOnbStepMode" class="aep-access-onb-step" hidden>' +
        '<p class="aep-access-onb-kicker">Step 2 of 2</p>' +
        '<h2 id="aepAccessOnbTitleMode" class="aep-access-onb-title">Choose your lab access mode</h2>' +
        '<p class="aep-access-onb-copy">After you sign in, choose <strong>Adobe sandbox</strong> (full AEP APIs and sandbox selector) or <strong>no Adobe sandbox</strong> (workspace profile for Brand Scraper and related tools). This step is available once your account is approved.</p>' +
        '<div class="aep-access-onb-choices">' +
        '<label class="aep-access-onb-choice"><input type="radio" name="aepAccessOnbMode" id="aepAccessOnbSandbox" value="sandbox" checked>' +
        '<span><strong>Adobe sandbox</strong><br><small>Use the standard sandbox selector and AEP APIs.</small></span></label>' +
        '<label class="aep-access-onb-choice"><input type="radio" name="aepAccessOnbMode" id="aepAccessOnbWorkspace" value="workspace">' +
        '<span><strong>No Adobe sandbox</strong><br><small>Use non-AEP tools with your own workspace profile.</small></span></label>' +
        '</div>' +
        '<div id="aepAccessOnbWorkspaceForm" class="aep-access-onb-grid" style="display:none">' +
        '<div><label for="aepAccessOnbFirstName">First name</label><input id="aepAccessOnbFirstName" type="text" maxlength="80" autocomplete="given-name"></div>' +
        '<div><label for="aepAccessOnbLastName">Last name</label><input id="aepAccessOnbLastName" type="text" maxlength="80" autocomplete="family-name"></div>' +
        '<p class="full aep-access-onb-copy" style="margin:0">No-sandbox mode uses your <span class="aep-access-onb-mono">@adobe.com</span> lab account. First-time workspace setup runs after your lab account is already approved.</p>' +
        '</div>' +
        '<div class="aep-access-onb-step2-foot">' +
        '<button type="button" class="dashboard-btn-primary" id="aepAccessOnbSaveBtn">Save and continue</button>' +
        '</div>' +
        '</div>' +
        '<div class="aep-access-onb-foot">' +
        '<p id="aepAccessOnbMsg" class="aep-access-onb-msg" role="status" aria-live="polite"></p>' +
        '</div></div>';
      document.body.appendChild(wrap);
    }
    dialogWrapElRef = wrap;
    enforceGateLayerOrder(gate, wrap);
    return wrap;
  }

  function ensureOverlay() {
    return ensureAccessGateDom();
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
    try {
      localStorage.removeItem(FORCE_ONBOARDING_FLAG);
    } catch (_e) {}
  }

  function readVerifiedAtRaw() {
    try {
      return localStorage.getItem(LS_EMAIL_VERIFIED_AT) || '';
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
      localStorage.setItem(LS_EMAIL_VERIFIED_AT, String(ts));
    } catch (_e) {}
  }

  function clearVerifiedAt() {
    try {
      localStorage.removeItem(LS_EMAIL_VERIFIED_AT);
      localStorage.removeItem(LS_GOOGLE_VERIFIED_AT_LEGACY);
    } catch (_e2) {}
  }

  function isPendingApprovalRefreshHoldActive() {
    try {
      return global.sessionStorage.getItem(SS_SIGNUP_PENDING_AWAITING_APPROVAL) === '1';
    } catch (_e) {
      return false;
    }
  }

  function readPendingHoldKind() {
    try {
      var k = global.sessionStorage.getItem(SS_SIGNUP_PENDING_HOLD_KIND) || '';
      if (k === HOLD_KIND_LAB_STATUS) return HOLD_KIND_LAB_STATUS;
      return HOLD_KIND_POST_SIGNUP;
    } catch (_e2) {
      return HOLD_KIND_POST_SIGNUP;
    }
  }

  function setPendingApprovalSessionHold(kind) {
    try {
      global.sessionStorage.setItem(SS_SIGNUP_PENDING_AWAITING_APPROVAL, '1');
      global.sessionStorage.setItem(
        SS_SIGNUP_PENDING_HOLD_KIND,
        kind === HOLD_KIND_LAB_STATUS ? HOLD_KIND_LAB_STATUS : HOLD_KIND_POST_SIGNUP,
      );
    } catch (_e) {}
  }

  function clearPendingApprovalSessionHold() {
    try {
      global.sessionStorage.removeItem(SS_SIGNUP_PENDING_AWAITING_APPROVAL);
      global.sessionStorage.removeItem(SS_SIGNUP_PENDING_HOLD_KIND);
    } catch (_e) {}
  }

  function tryRestorePendingApprovalHoldFromSession() {
    if (step1SessionExpiredShell) return false;
    if (!isPendingApprovalRefreshHoldActive()) return false;
    var msg =
      readPendingHoldKind() === HOLD_KIND_LAB_STATUS ? PENDING_LAB_ACCESS_MSG : POST_SIGNUP_PENDING_MSG;
    setUiStep(1);
    setStep1HoldMode(true, msg);
    setMsg('', '');
    return true;
  }

  function clearLabGateStorageForPendingLockout() {
    try {
      if (global.AepAccessScope && typeof global.AepAccessScope.clearLabGateMode === 'function') {
        global.AepAccessScope.clearLabGateMode();
      }
    } catch (_e) {}
    clearVerifiedAt();
    try {
      localStorage.setItem(FORCE_ONBOARDING_FLAG, '1');
    } catch (_e2) {}
  }

  function signOutAndShowPendingApproval(auth, message) {
    var authInst = auth || ensureFirebaseAuth();
    try {
      var u = authInst && authInst.currentUser;
      if (u && u.email) {
        global.sessionStorage.setItem(SS_ONBOARDING_LAST_SIGNUP_EMAIL, String(u.email).trim().toLowerCase());
      }
    } catch (_s) {}
    setPendingApprovalSessionHold(HOLD_KIND_LAB_STATUS);
    var p = !authInst ? Promise.resolve() : authInst.signOut().catch(function () {});
    return p.then(function () {
      show();
      setUiStep(1);
      setStep1HoldMode(true, message || PENDING_LAB_ACCESS_MSG);
      setMsg('', '');
    });
  }

  function fetchLabAccessStatusWithIdToken(idToken) {
    return fetch('/api/lab/lab-access/status', {
      headers: { Authorization: 'Bearer ' + String(idToken || '') },
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .then(function (body) {
        if (!body || body.ok !== true) return 'error';
        return String(body.status || 'error');
      });
  }

  function verifyAdobeUserApprovedOrLockout(auth, user) {
    if (!auth || !user || !isAdobeLabFirebaseUser(user)) {
      return Promise.resolve(false);
    }
    return user
      .getIdToken(false)
      .then(function (idToken) {
        return fetchLabAccessStatusWithIdToken(idToken);
      })
      .then(function (status) {
        if (status === 'pending') {
          return signOutAndShowPendingApproval(auth, PENDING_LAB_ACCESS_MSG).then(function () {
            return true;
          });
        }
        return false;
      })
      .catch(function () {
        return false;
      });
  }

  function clearLabEmailReauthPending() {
    try {
      localStorage.removeItem(LS_REAUTH_PENDING);
      localStorage.removeItem(LS_GOOGLE_REAUTH_LEGACY);
    } catch (_e) {}
  }

  function isLabEmailReauthPending() {
    try {
      return (
        localStorage.getItem(LS_REAUTH_PENDING) === '1' || localStorage.getItem(LS_GOOGLE_REAUTH_LEGACY) === '1'
      );
    } catch (_e2) {
      return false;
    }
  }

  function recordSuccessfulLabEmailVerification() {
    clearLabEmailReauthPending();
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

  function setOnboardingCopyVariant(variant, opts) {
    opts = opts || {};
    if (variant === 'default' && !opts.force && (step1HoldMode || isPendingApprovalRefreshHoldActive())) {
      return;
    }
    clearStep1HoldMode();
    var kicker = document.getElementById('aepAccessOnbKickerSignIn');
    if (!kicker) return;
    if (variant === 'session-expired') {
      kicker.textContent = 'Session expired';
      setStep1AuthMode(true, { sessionExpired: true });
    } else {
      kicker.textContent = 'Step 1 of 2';
      setStep1AuthMode(false, { clearSessionExpired: true });
    }
  }

  function setUiStep(step) {
    var signInEl = document.getElementById('aepAccessOnbStepSignIn');
    var modeEl = document.getElementById('aepAccessOnbStepMode');
    var wrap = document.getElementById(OVERLAY_ID);
    if (!signInEl || !modeEl) return;
    var isOne = step === 1;
    signInEl.hidden = !isOne;
    modeEl.hidden = isOne;
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
    if (dn) {
      var parts = dn.split(/\s+/);
      if (parts.length === 1) {
        fnEl.value = parts[0];
      } else {
        fnEl.value = parts[0];
        lnEl.value = parts.slice(1).join(' ');
      }
      return;
    }
    var local = String((user.email || '').split('@')[0] || '').trim();
    if (local && !fnEl.value.trim()) {
      fnEl.value = local.charAt(0).toUpperCase() + local.slice(1);
    }
  }

  function expireLabEmailGateAndSignOut(auth) {
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
   * Lab gate TTL: @adobe Firebase user + explicit access mode + stored verification age.
   * Skips users without an explicit mode (including no-sandbox signup not finished) so we do not loop on pending flows.
   */
  function enforceLabEmailSessionMaxAgeAsync(auth, user) {
    if (!auth || !global.AepAccessScope) return Promise.resolve(false);
    if (!user || !isAdobeLabFirebaseUser(user)) return Promise.resolve(false);
    if (!global.AepAccessScope.hasExplicitMode()) return Promise.resolve(false);
    bootstrapVerifiedAtFromFirebaseUser(user);
    var verifiedAt = parseVerifiedAtMs(readVerifiedAtRaw());
    if (!isFinite(verifiedAt)) {
      writeVerifiedAt(Date.now());
      return Promise.resolve(false);
    }
    var now = Date.now();
    if (verifiedAt > now + VERIFIED_AT_FUTURE_SKEW_MS) {
      return expireLabEmailGateAndSignOut(auth);
    }
    if (now - verifiedAt <= LAB_EMAIL_SESSION_MAX_MS) return Promise.resolve(false);
    return expireLabEmailGateAndSignOut(auth);
  }

  function maybeOpenOnboardingAfterAuthCheck(labSessionJustExpired) {
    var reauthPending = isLabEmailReauthPending();
    var explicitMode = global.AepAccessScope && global.AepAccessScope.hasExplicitMode();
    var needsFirebase = !hasAdobeLabFirebaseSession();
    var useExpiredShell =
      !!labSessionJustExpired || !!(reauthPending && explicitMode && needsFirebase);

    var shouldOpen = !!labSessionJustExpired || shouldAutoOpenOnboarding();
    if (!shouldOpen) {
      mountDeferredHomeDashboardIfNeeded();
      return;
    }

    if (!useExpiredShell) clearForceOpenFlag();

    if (useExpiredShell) {
      setOnboardingCopyVariant('session-expired');
      setMsg('Session expired — sign in again with your Adobe email and password.', 'err');
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
    gateInteractionLockActive = false;
    stopGateDomObserver();
    stopGateEnforcer();
    clearShellInteractionLock();
    var gate = gateLayerElRef || document.getElementById(GATE_LAYER_ID);
    var overlay = dialogWrapElRef || document.getElementById(OVERLAY_ID);
    if (gate) gate.hidden = true;
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('aep-access-gate-active');
    document.body.classList.remove('aep-access-onboarding-open');
    setOnboardingCopyVariant('default', { force: true });
    setMsg('', '');
    setUiStep(1);
    mountDeferredHomeDashboardIfNeeded();
  }

  /**
   * Inserts the real home dashboard from <template id="aepDeferredDashboardShell"> into #aepDashboardMount.
   * Client-side UX / casual DevTools bypass only: the HTML document is still public (view-source, saved offline,
   * etc.) and does not replace server-side API authentication.
   */
  function mountDeferredHomeDashboardIfNeeded() {
    if (didMountDeferredHomeDashboard) return;
    // Do not mount real dashboard markup while pending approval or the gate lock is on (session reload / race).
    // Pending flows rely on sessionStorage + step1HoldMode + show()/hide(); we skip getLabAccessStatus here to avoid extra token/API work.
    if (isPendingApprovalRefreshHoldActive() || step1HoldMode) return;
    if (gateInteractionLockActive) return;
    var mount = document.getElementById(DEFERRED_HOME_DASHBOARD_MOUNT_ID);
    var tpl = document.getElementById(DEFERRED_HOME_DASHBOARD_TEMPLATE_ID);
    if (!mount || !tpl || !tpl.content) return;
    didMountDeferredHomeDashboard = true;
    try {
      mount.classList.remove('aep-dashboard-mount--pending');
    } catch (_c) {}
    mount.textContent = '';
    mount.appendChild(document.importNode(tpl.content, true));
    requestAnimationFrame(function () {
      try {
        global.dispatchEvent(new CustomEvent(DEFERRED_HOME_DASHBOARD_MOUNTED_EVENT));
      } catch (_ev) {}
    });
  }

  function show() {
    migrateLegacyLabLocalStorage();
    var overlay = ensureAccessGateDom();
    var gate = gateLayerElRef || document.getElementById(GATE_LAYER_ID);
    gateInteractionLockActive = true;
    if (gate) gate.hidden = false;
    overlay.hidden = false;
    if (gate) normalizeGateElementVisibility(gate);
    normalizeGateElementVisibility(overlay);
    enforceGateLayerOrder(gate, overlay);
    applyShellInteractionLock();
    startGateDomObserver();
    startGateEnforcer();
    document.body.classList.add('aep-access-gate-active');
    document.body.classList.add('aep-access-onboarding-open');
    syncRadiosFromScope();
    try {
      if (global.__aepOnboardingPreferWorkspace) {
        selectWorkspaceMode();
        global.__aepOnboardingPreferWorkspace = false;
      }
    } catch (_pw) {}

    function focusEmailField() {
      var emailEl = document.getElementById('aepAccessOnbEmail');
      if (emailEl) emailEl.focus();
    }

    if (hasAdobeLabFirebaseSession()) {
      var auth0 = ensureFirebaseAuth();
      var user0 = auth0 && auth0.currentUser;
      if (!user0) {
        if (!isLabEmailReauthPending()) setMsg('', '');
        setUiStep(1);
        syncStep1AuthUi();
        focusEmailField();
        return;
      }
      user0
        .getIdToken(false)
        .then(function (idToken) {
          return fetchLabAccessStatusWithIdToken(idToken);
        })
        .then(function (status) {
          if (status === 'pending') {
            return signOutAndShowPendingApproval(auth0, PENDING_LAB_ACCESS_MSG);
          }
          if (status === 'approved' || status === 'missing') {
            setUiStep(2);
            refreshModeChoiceUi();
            var focusEl = document.getElementById('aepAccessOnbSandbox');
            if (focusEl) focusEl.focus();
            return;
          }
          if (!isLabEmailReauthPending()) setMsg('', '');
          setUiStep(1);
          syncStep1AuthUi();
          focusEmailField();
        })
        .catch(function () {
          if (!isLabEmailReauthPending()) setMsg('', '');
          setUiStep(1);
          syncStep1AuthUi();
          focusEmailField();
        });
      return;
    }

    if (!isLabEmailReauthPending()) setMsg('', '');
    if (tryRestorePendingApprovalHoldFromSession()) return;
    setUiStep(1);
    syncStep1AuthUi();
    focusEmailField();
  }

  function ensureFirebaseAuth() {
    if (typeof firebase === 'undefined') return null;
    if (!firebase.apps.length && global.firebaseDatabaseConfig) {
      firebase.initializeApp(global.firebaseDatabaseConfig);
    }
    return firebase.auth ? firebase.auth() : null;
  }

  function isAdobeLabFirebaseUser(user) {
    if (!user || !user.email) return false;
    var email = String(user.email).trim().toLowerCase();
    return email.endsWith('@adobe.com');
  }

  function hasAdobeLabFirebaseSession() {
    var auth = ensureFirebaseAuth();
    if (!auth) return false;
    return isAdobeLabFirebaseUser(auth.currentUser);
  }

  function shouldAutoOpenOnboarding() {
    if (!global.AepAccessScope) return false;
    var needsModeSetup = !global.AepAccessScope.hasExplicitMode();
    var needsFirebase = !hasAdobeLabFirebaseSession();
    if (shouldForceOpen()) return true;
    if (needsModeSetup) return true;
    if (global.AepAccessScope.hasExplicitMode() && needsFirebase) return true;
    return false;
  }

  function mapFirebaseAuthError(e) {
    var code = String((e && e.code) || '');
    if (code === 'auth/user-disabled') {
      return PENDING_LAB_ACCESS_MSG;
    }
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'Incorrect password. Try again or reset your password in Firebase if your org allows it.';
    }
    if (code === 'auth/user-not-found') {
      return 'No account found for that email — check spelling or use Create account first.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'That email is already registered — use Login.';
    }
    if (code === 'auth/weak-password') {
      return 'Password is too weak. Use at least ' + MIN_LAB_PASSWORD_LEN + ' characters.';
    }
    if (code === 'auth/invalid-email') {
      return 'Enter a valid email address.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Email/password sign-in is disabled for this Firebase project. Ask an admin to enable Email/Password in Firebase Authentication.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many attempts. Wait a moment and try again.';
    }
    return String((e && e.message) || e || 'Sign-in failed.');
  }

  function registerLabAdobeAccount(rawEmail, password, confirm) {
    var auth = ensureFirebaseAuth();
    if (!auth) {
      return Promise.resolve({ ok: false, error: 'Firebase auth is not available on this page.' });
    }
    var email = String(rawEmail || '').trim().toLowerCase();
    if (!email.endsWith('@adobe.com')) {
      return Promise.resolve({ ok: false, error: 'Use an Adobe email address ending in @adobe.com.' });
    }
    if (!password || String(password).length < MIN_LAB_PASSWORD_LEN) {
      return Promise.resolve({
        ok: false,
        error: 'Password must be at least ' + MIN_LAB_PASSWORD_LEN + ' characters.',
      });
    }
    if (String(password) !== String(confirm || '')) {
      return Promise.resolve({ ok: false, error: 'Passwords do not match.' });
    }
    return auth
      .createUserWithEmailAndPassword(email, password)
      .then(function (cred) {
        return { ok: true, user: cred && cred.user };
      })
      .catch(function (e) {
        return { ok: false, error: mapFirebaseAuthError(e) };
      });
  }

  function signInLabAdobeAccount(rawEmail, password) {
    var auth = ensureFirebaseAuth();
    if (!auth) {
      return Promise.resolve({ ok: false, error: 'Firebase auth is not available on this page.' });
    }
    var email = String(rawEmail || '').trim().toLowerCase();
    if (!email.endsWith('@adobe.com')) {
      return Promise.resolve({ ok: false, error: 'Use an Adobe email address ending in @adobe.com.' });
    }
    if (!password) {
      return Promise.resolve({ ok: false, error: 'Enter your password.' });
    }
    return auth
      .signInWithEmailAndPassword(email, password)
      .then(function (cred) {
        return { ok: true, user: cred && cred.user };
      })
      .catch(function (e) {
        return { ok: false, error: mapFirebaseAuthError(e) };
      });
  }

  function ensureAdobeLabFirebaseSession() {
    var auth = ensureFirebaseAuth();
    if (!auth) {
      return Promise.resolve({ ok: false, error: 'Firebase auth is not available on this page.' });
    }
    if (isAdobeLabFirebaseUser(auth.currentUser)) {
      return Promise.resolve({ ok: true, user: auth.currentUser });
    }
    return Promise.resolve({
      ok: false,
      error: 'Sign in with your Adobe @adobe.com email and password first.',
    });
  }

  function requestLabAccessApprovalSignup(idToken) {
    var origin = '';
    try {
      origin = String((global.location && global.location.origin) || '') || '';
    } catch (_o) {
      origin = '';
    }
    return fetch('/api/lab/lab-access/request-approval-signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + String(idToken || ''),
      },
      body: JSON.stringify({ origin: origin }),
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
            alreadyPending: !!resp.body.alreadyPending,
            emailSent: !!resp.body.emailSent,
          };
        }
        return {
          ok: false,
          code: String((resp.body && resp.body.code) || ''),
          error: (resp.body && resp.body.error) || 'Lab signup approval request failed.',
        };
      })
      .catch(function (e) {
        return { ok: false, error: String((e && e.message) || e || 'Lab signup approval request failed.') };
      });
  }

  function requestLabAccessApprovalAfterStep2(idToken, firstName, lastName) {
    var origin = '';
    try {
      origin = String((global.location && global.location.origin) || '') || '';
    } catch (_o) {
      origin = '';
    }
    return fetch('/api/lab/lab-access/request-approval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + String(idToken || ''),
      },
      body: JSON.stringify({
        firstName: firstName != null ? String(firstName) : '',
        lastName: lastName != null ? String(lastName) : '',
        origin: origin,
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
            alreadyPending: !!resp.body.alreadyPending,
            emailSent: !!resp.body.emailSent,
          };
        }
        if (resp.status === 403 && String((resp.body && resp.body.code) || '') === 'pending_approval') {
          return {
            ok: true,
            pendingApproval: true,
            alreadyPending: true,
            emailSent: false,
          };
        }
        return {
          ok: false,
          code: String((resp.body && resp.body.code) || ''),
          error: (resp.body && resp.body.error) || 'Lab access approval request failed.',
        };
      })
      .catch(function (e) {
        return { ok: false, error: String((e && e.message) || e || 'Lab access approval request failed.') };
      });
  }

  function requestWorkspaceRegisterFromIdToken(idToken, firstName, lastName) {
    return fetch('/api/lab/workspace-auth/register-from-id-token', {
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
            alreadyPending: !!resp.body.alreadyPending,
            emailSent: !!resp.body.emailSent,
            workspaceName: String((resp.body && resp.body.workspaceName) || ''),
            workspaceSlug: String((resp.body && resp.body.workspaceSlug) || ''),
          };
        }
        if (resp.status === 403 && String((resp.body && resp.body.code) || '') === 'pending_approval') {
          return {
            ok: true,
            pendingApproval: true,
            alreadyPending: true,
            emailSent: false,
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

  function ensureApprovedWorkspaceLabAuth(user, input) {
    return user
      .getIdToken(true)
      .then(function (idToken) {
        return requestWorkspaceRegisterFromIdToken(idToken, input.firstName, input.lastName);
      })
      .then(function (reg) {
        if (!reg || !reg.ok) return reg;
        if (reg.pendingApproval) {
          return {
            ok: false,
            pending: true,
            alreadyPending: !!reg.alreadyPending,
            error: reg.alreadyPending
              ? 'Your lab access is still pending admin approval. You will be signed out until it is approved.'
              : reg.emailSent
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
            return res.json().catch(function () {
              return {};
            });
          })
          .then(function (json) {
            return json && json.ok
              ? { ok: true, profile: json.profile || null }
              : { ok: false, error: (json && json.error) || 'Failed to save profile.' };
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
    summaryEl.textContent =
      scope.mode === 'workspace'
        ? 'No-sandbox workspace: ' + (scope.workspaceName || scope.scopeId || 'not configured')
        : 'Adobe sandbox mode';
  }

  function refreshModeChoiceUi() {
    var workspaceMode = selectedMode() === 'workspace';
    setWorkspaceFormVisible(workspaceMode);
    setMsg(
      workspaceMode
        ? 'No-sandbox mode uses your Adobe lab account; enter your name below for your workspace profile.'
        : 'Adobe sandbox uses your .env-backed sandbox selector and AEP APIs. You can enable it here once your @adobe.com account is approved.',
      '',
    );
  }

  function dispatchLabSessionUpdated() {
    try {
      global.dispatchEvent(new CustomEvent('aep-lab-email-session-updated'));
    } catch (_ev) {}
    try {
      global.dispatchEvent(new CustomEvent('aep-lab-google-session-updated'));
    } catch (_ev2) {}
  }

  function wire() {
    ensureOverlay();
    var sandboxRadio = document.getElementById('aepAccessOnbSandbox');
    var workspaceRadio = document.getElementById('aepAccessOnbWorkspace');
    var saveBtn = document.getElementById('aepAccessOnbSaveBtn');
    var primaryAuthBtn = document.getElementById('aepAccessOnbPrimaryAuthBtn');
    var secondaryAuthBtn = document.getElementById('aepAccessOnbSecondaryAuthBtn');
    var holdLoginBtn = document.getElementById('aepAccessOnbHoldLoginBtn');
    if (!sandboxRadio || !workspaceRadio || !saveBtn || !primaryAuthBtn || !secondaryAuthBtn) return;
    syncStep1AuthUi();

    if (holdLoginBtn) {
      holdLoginBtn.addEventListener('click', function () {
        clearStep1HoldMode({ preferLogin: true });
        var emailEl = document.getElementById('aepAccessOnbEmail');
        try {
          var lastE = global.sessionStorage.getItem(SS_ONBOARDING_LAST_SIGNUP_EMAIL) || '';
          if (emailEl && lastE) emailEl.value = lastE;
        } catch (_le) {}
        setMsg('', '');
        if (emailEl) emailEl.focus();
      });
    }

    function onModeChange() {
      refreshModeChoiceUi();
    }
    sandboxRadio.addEventListener('change', onModeChange);
    workspaceRadio.addEventListener('change', onModeChange);

    function readStep1Fields() {
      var emailEl = document.getElementById('aepAccessOnbEmail');
      var passEl = document.getElementById('aepAccessOnbPassword');
      var confEl = document.getElementById('aepAccessOnbPasswordConfirm');
      return {
        email: emailEl ? String(emailEl.value || '').trim() : '',
        password: passEl ? String(passEl.value || '') : '',
        confirm: confEl ? String(confEl.value || '') : '',
      };
    }

    function afterStep1AuthSuccess(session) {
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
    }

    function proceedAfterLogin(user) {
      return user
        .getIdToken(true)
        .then(function (idToken) {
          return fetchLabAccessStatusWithIdToken(idToken);
        })
        .then(function (status) {
          if (status === 'pending') {
            return signOutAndShowPendingApproval(ensureFirebaseAuth(), PENDING_LAB_ACCESS_MSG);
          }
          if (status === 'approved' || status === 'missing') {
            clearPendingApprovalSessionHold();
            afterStep1AuthSuccess({ ok: true, user: user });
            return;
          }
          setMsg('Could not verify lab access status. Try again in a moment.', 'err');
        })
        .catch(function () {
          setMsg('Could not verify lab access status. Try again in a moment.', 'err');
        });
    }

    secondaryAuthBtn.addEventListener('click', function () {
      if (step1LoginMode) {
        setStep1AuthMode(false, { clearSessionExpired: true });
        setMsg('', '');
      } else {
        setStep1AuthMode(true, {});
        setMsg('', '');
      }
    });

    primaryAuthBtn.addEventListener('click', function () {
      var fields = readStep1Fields();
      primaryAuthBtn.disabled = true;
      secondaryAuthBtn.disabled = true;
      setMsg(step1LoginMode ? 'Signing in…' : 'Creating account…', '');
      if (step1LoginMode) {
        signInLabAdobeAccount(fields.email, fields.password).then(function (session) {
          if (!session || !session.ok) {
            primaryAuthBtn.disabled = false;
            secondaryAuthBtn.disabled = false;
            setMsg((session && session.error) || 'Something went wrong.', 'err');
            return;
          }
          primaryAuthBtn.disabled = true;
          secondaryAuthBtn.disabled = true;
          setMsg('Verifying lab access…', '');
          proceedAfterLogin(session.user).finally(function () {
            primaryAuthBtn.disabled = false;
            secondaryAuthBtn.disabled = false;
          });
        });
        return;
      }
      registerLabAdobeAccount(fields.email, fields.password, fields.confirm)
        .then(function (session) {
          if (!session || !session.ok) {
            primaryAuthBtn.disabled = false;
            secondaryAuthBtn.disabled = false;
            setMsg((session && session.error) || 'Something went wrong.', 'err');
            return;
          }
          setMsg('Submitting access request…', '');
          return session.user
            .getIdToken(true)
            .then(function (idToken) {
              return requestLabAccessApprovalSignup(idToken);
            })
            .then(function (reg) {
              primaryAuthBtn.disabled = false;
              secondaryAuthBtn.disabled = false;
              if (!reg || !reg.ok) {
                setMsg(
                  (reg && reg.error) || 'Could not submit your lab access request. Try again or contact an administrator.',
                  'err',
                );
                return;
              }
              if (!reg.pendingApproval) {
                afterStep1AuthSuccess({ ok: true, user: session.user });
                return;
              }
              clearLabGateStorageForPendingLockout();
              try {
                global.sessionStorage.setItem(SS_ONBOARDING_LAST_SIGNUP_EMAIL, String(fields.email || '').trim().toLowerCase());
              } catch (_se) {}
              setPendingApprovalSessionHold(HOLD_KIND_POST_SIGNUP);
              var authInst = ensureFirebaseAuth();
              var msg = POST_SIGNUP_PENDING_MSG;
              if (!reg.emailSent && !reg.alreadyPending) {
                msg +=
                  ' We could not email the administrator automatically; please contact your lab admin if you do not hear back.';
              }
              var pOut = authInst ? authInst.signOut().catch(function () {}) : Promise.resolve();
              return pOut.then(function () {
                setUiStep(1);
                setStep1HoldMode(true, msg);
                setMsg('', '');
              });
            })
            .catch(function (e) {
              primaryAuthBtn.disabled = false;
              secondaryAuthBtn.disabled = false;
              setMsg(String((e && e.message) || e || 'Request failed.'), 'err');
            });
        })
        .catch(function (e) {
          primaryAuthBtn.disabled = false;
          secondaryAuthBtn.disabled = false;
          setMsg(String((e && e.message) || e || 'Something went wrong.'), 'err');
        });
    });

    saveBtn.addEventListener('click', function () {
      if (!global.AepAccessScope) return;
      if (!hasAdobeLabFirebaseSession()) {
        setMsg('Sign in with your Adobe email and password first, then choose your mode.', 'err');
        setUiStep(1);
        syncStep1AuthUi();
        return;
      }
      saveBtn.disabled = true;
      var alreadySignedIn = hasAdobeLabFirebaseSession();
      setMsg(alreadySignedIn ? 'Saving…' : 'Checking sign-in…', '');

      ensureAdobeLabFirebaseSession().then(function (session) {
        if (!session || !session.ok) {
          setMsg((session && session.error) || 'Sign in is required.', 'err');
          if (!hasAdobeLabFirebaseSession()) {
            setUiStep(1);
            syncStep1AuthUi();
          }
          saveBtn.disabled = false;
          return;
        }

        var user = session.user;
        var adobeEmail = String((user && user.email) || '').trim().toLowerCase();
        var mode = selectedMode();
        setMsg('Saving…', '');

        if (mode === 'sandbox') {
          return user
            .getIdToken(true)
            .then(function (idToken) {
              return requestLabAccessApprovalAfterStep2(idToken, '', '');
            })
            .then(function (reg) {
              if (!reg || !reg.ok) {
                setMsg((reg && reg.error) || 'Could not complete lab access setup.', 'err');
                saveBtn.disabled = false;
                return;
              }
              if (reg.pendingApproval) {
                clearLabGateStorageForPendingLockout();
                var authInst = ensureFirebaseAuth();
                return signOutAndShowPendingApproval(authInst, PENDING_LAB_ACCESS_MSG).finally(function () {
                  saveBtn.disabled = false;
                });
              }
              global.AepAccessScope.setAccessMode('sandbox');
              recordSuccessfulLabEmailVerification();
              setMsg('Saved.', 'ok');
              refreshSummary();
              dispatchLabSessionUpdated();
              setTimeout(function () {
                hide();
              }, 220);
              saveBtn.disabled = false;
            });
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

        return ensureApprovedWorkspaceLabAuth(user, input).then(function (authResult) {
          if (!authResult || !authResult.ok) {
            setMsg((authResult && authResult.error) || 'Could not complete workspace signup.', 'err');
            if (authResult && authResult.pending) {
              clearLabGateStorageForPendingLockout();
              var authInstW = ensureFirebaseAuth();
              return signOutAndShowPendingApproval(authInstW, PENDING_LAB_ACCESS_MSG).finally(function () {
                saveBtn.disabled = false;
              });
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
            try {
              localStorage.removeItem('aepGlobalSandboxName');
            } catch (_e) {}
            recordSuccessfulLabEmailVerification();
            setMsg('Saved. You are in no-sandbox mode.', 'ok');
            refreshSummary();
            dispatchLabSessionUpdated();
            setTimeout(function () {
              hide();
            }, 250);
            saveBtn.disabled = false;
          });
        });
      });
    });
  }

  function init() {
    if (!global.AepAccessScope) return;
    migrateLegacyLabLocalStorage();
    wire();
    refreshSummary();

    global.addEventListener('aep-access-scope-change', refreshSummary);
    global.addEventListener('aep-access-forced-logout', function (event) {
      var detail = event && event.detail ? event.detail : {};
      if (!detail.requireOnboarding) return;
      clearForceOpenFlag();
      show();
      selectWorkspaceMode();
      setMsg('Your no-sandbox account is no longer active. Sign in again with your Adobe email and password.', 'err');
    });

    var auth = ensureFirebaseAuth();
    if (!auth) {
      maybeOpenOnboardingAfterAuthCheck(false);
      return;
    }
    auth.onAuthStateChanged(function (user) {
      verifyAdobeUserApprovedOrLockout(auth, user).then(function (lockedOut) {
        if (lockedOut) return;
        enforceLabEmailSessionMaxAgeAsync(auth, user).then(function (expired) {
          maybeOpenOnboardingAfterAuthCheck(expired);
        });
      });
    });
  }

  global.AepAccessOnboarding = {
    init: init,
    open: show,
    close: hide,
    hasAdobeLabFirebaseSession: hasAdobeLabFirebaseSession,
    /** @deprecated Use hasAdobeLabFirebaseSession */
    hasAdobeGoogleLabSession: hasAdobeLabFirebaseSession,
  };
})(typeof window !== 'undefined' ? window : this);
