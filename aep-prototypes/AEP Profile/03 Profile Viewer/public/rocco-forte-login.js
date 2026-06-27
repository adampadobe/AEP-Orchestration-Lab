/**
 * Rocco Forte Hotels — site login modal (KSIA / Etihad lab pairing pattern).
 */
(function roccoForteLogin(global) {
  'use strict';

  var LAB_SOURCE = 'rocco-forte-lab';
  var SHELL_SOURCE = 'rocco-forte-demo-shell';

  function mountLoginChrome() {
    if (document.getElementById('rfLoginBtn')) return;

    var utils = document.createElement('div');
    utils.className = 'rf-top-utils';
    utils.id = 'rfTopUtils';
    utils.innerHTML =
      '<button type="button" id="rfLoginBtn" class="rf-login-btn" aria-haspopup="dialog">Login or Sign up</button>';
    document.body.appendChild(utils);

    var overlay = document.createElement('div');
    overlay.id = 'rfLoginOverlay';
    overlay.className = 'rf-login-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'rfLoginTitle');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="rf-login-backdrop" id="rfLoginBackdrop"></div>' +
      '<div class="rf-login-card">' +
      '<button type="button" class="rf-login-close" id="rfLoginClose" aria-label="Close">&times;</button>' +
      '<div id="rfLoginForm">' +
      '<div class="rf-login-logo" aria-hidden="true">' +
      '<img src="rocco-forte-demo-assets/logo.png" alt="" width="120" height="42">' +
      '</div>' +
      '<h2 class="rf-login-title" id="rfLoginTitle">Sign in to Rocco Forte Friends</h2>' +
      '<p class="rf-login-subtitle">Access your profile, preferences, and personalised offers across our hotels.</p>' +
      '<div class="rf-login-fields">' +
      '<div class="rf-login-field">' +
      '<label for="rfLoginEmail">Email address</label>' +
      '<input type="text" id="rfLoginEmail" placeholder="you@example.com" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="rf-login-field">' +
      '<label for="rfLoginPassword">Password</label>' +
      '<input type="password" id="rfLoginPassword" placeholder="••••••••" autocomplete="current-password">' +
      '</div>' +
      '</div>' +
      '<p id="rfLoginError" class="rf-login-error" hidden></p>' +
      '<button type="button" id="rfLoginSubmit" class="rf-login-submit">' +
      '<span id="rfLoginSubmitLabel">Sign in</span>' +
      '<span id="rfLoginSpinner" class="rf-login-spinner" hidden></span>' +
      '</button>' +
      '<p class="rf-login-guest-link"><a href="#" id="rfLoginAsGuest">Continue as guest</a></p>' +
      '</div>' +
      '<div id="rfLoginSuccess" hidden>' +
      '<div class="rf-login-logo" aria-hidden="true">' +
      '<img src="rocco-forte-demo-assets/logo.png" alt="" width="120" height="42">' +
      '</div>' +
      '<h2 class="rf-login-title">Welcome, <span id="rfLoginWelcomeName">Guest</span></h2>' +
      '<p class="rf-login-subtitle" id="rfLoginWelcomeMsg">You\'re signed in. Your profile is paired for personalisation.</p>' +
      '<button type="button" class="rf-login-submit" id="rfLoginDone">Continue</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    wireLoginModal();
  }

  function wireLoginModal() {
    var overlay = document.getElementById('rfLoginOverlay');
    var backdrop = document.getElementById('rfLoginBackdrop');
    var closeBtn = document.getElementById('rfLoginClose');
    var loginBtn = document.getElementById('rfLoginBtn');
    var submitBtn = document.getElementById('rfLoginSubmit');
    var emailInput = document.getElementById('rfLoginEmail');
    var submitLabel = document.getElementById('rfLoginSubmitLabel');
    var spinner = document.getElementById('rfLoginSpinner');
    var errorEl = document.getElementById('rfLoginError');
    var formEl = document.getElementById('rfLoginForm');
    var successEl = document.getElementById('rfLoginSuccess');
    var welcomeName = document.getElementById('rfLoginWelcomeName');
    var doneBtn = document.getElementById('rfLoginDone');
    var guestLink = document.getElementById('rfLoginAsGuest');

    if (!overlay || !loginBtn) return;

    function openModal() {
      overlay.hidden = false;
      formEl.hidden = false;
      successEl.hidden = true;
      errorEl.hidden = true;
      errorEl.textContent = '';
      if (submitBtn) submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Sign in';
      if (spinner) spinner.hidden = true;
      document.body.classList.add('rf-login-modal-open');
      global.setTimeout(function () {
        if (emailInput) emailInput.focus();
      }, 50);
    }

    function closeModal() {
      overlay.hidden = true;
      document.body.classList.remove('rf-login-modal-open');
    }

    function setLoading(on) {
      if (submitBtn) submitBtn.disabled = on;
      if (submitLabel) submitLabel.textContent = on ? 'Signing in…' : 'Sign in';
      if (spinner) spinner.hidden = !on;
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
      setLoading(false);
    }

    function showSuccess(firstName) {
      formEl.hidden = true;
      successEl.hidden = false;
      welcomeName.textContent = firstName || 'Guest';
      if (loginBtn) {
        loginBtn.textContent = firstName ? 'Hi, ' + firstName : 'My Account';
        loginBtn.classList.add('is-signed-in');
      }
    }

    function postLoginRequest(email) {
      var msg = { source: LAB_SOURCE, type: 'login-request', email: email };
      global.postMessage(msg, '*');
    }

    loginBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (doneBtn) doneBtn.addEventListener('click', closeModal);
    if (guestLink) {
      guestLink.addEventListener('click', function (e) {
        e.preventDefault();
        closeModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var email = emailInput ? emailInput.value.trim() : '';
        if (!email || email.indexOf('@') === -1) {
          showError('Please enter a valid email address.');
          return;
        }
        setLoading(true);
        errorEl.hidden = true;
        postLoginRequest(email);
        global._rfLoginTimeout = global.setTimeout(function () {
          showError('Could not reach the profile service. Try again.');
        }, 10000);
      });
    }

    global.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== SHELL_SOURCE) return;
      if (ev.data.type !== 'login-complete') return;
      global.clearTimeout(global._rfLoginTimeout);
      setLoading(false);
      if (ev.data.found) {
        showSuccess(ev.data.firstName);
      } else {
        showError('No profile found for that email. Check the address and try again.');
      }
    });
  }

  global.RoccoForteLogin = { mount: mountLoginChrome, LAB_SOURCE: LAB_SOURCE, SHELL_SOURCE: SHELL_SOURCE };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountLoginChrome);
  } else {
    mountLoginChrome();
  }
})(typeof window !== 'undefined' ? window : globalThis);
