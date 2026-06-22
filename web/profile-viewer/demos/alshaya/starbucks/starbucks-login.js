/**
 * Starbucks site login modal — pairs with lab shell via postMessage (KSIA / Etihad pattern).
 */
(function () {
  'use strict';

  var LAB_SOURCE = 'starbucks-lab';
  var SHELL_SOURCE = 'starbucks-demo-shell';

  var overlay = null;
  var openModalFn = null;

  function mountLoginOverlay() {
    if (document.getElementById('sbLoginOverlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'sbLoginOverlay';
    overlay.className = 'sb-login-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'sbLoginTitle');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="sb-login-backdrop" id="sbLoginBackdrop"></div>' +
      '<div class="sb-login-card">' +
      '<button type="button" class="sb-login-close" id="sbLoginClose" aria-label="Close">&times;</button>' +
      '<div id="sbLoginForm">' +
      '<div class="sb-login-logo" aria-hidden="true"><img src="assets/logo.png" alt="" width="56" height="56"></div>' +
      '<h2 class="sb-login-title" id="sbLoginTitle">Sign in to Starbucks Rewards</h2>' +
      '<p class="sb-login-subtitle" id="sbLoginSubtitle">Access your Stars balance, offers, and personalised rewards across the UAE.</p>' +
      '<div class="sb-login-fields">' +
      '<div class="sb-login-field">' +
      '<label for="sbLoginEmail">Email address</label>' +
      '<input type="text" id="sbLoginEmail" placeholder="you@example.com" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="sb-login-field">' +
      '<label for="sbLoginPassword">Password</label>' +
      '<input type="password" id="sbLoginPassword" placeholder="••••••••" autocomplete="current-password">' +
      '</div>' +
      '</div>' +
      '<p id="sbLoginError" class="sb-login-error" hidden></p>' +
      '<button type="button" id="sbLoginSubmit" class="sb-btn sb-btn-primary sb-login-submit">' +
      '<span id="sbLoginSubmitLabel">Sign in</span>' +
      '<span id="sbLoginSpinner" class="sb-login-spinner" hidden></span>' +
      '</button>' +
      '<p class="sb-login-guest-link"><a href="#" id="sbLoginAsGuest">Continue as guest</a></p>' +
      '</div>' +
      '<div id="sbLoginSuccess" hidden>' +
      '<div class="sb-login-logo" aria-hidden="true"><img src="assets/logo.png" alt="" width="56" height="56"></div>' +
      '<h2 class="sb-login-title">Welcome, <span id="sbLoginWelcomeName">Guest</span></h2>' +
      '<p class="sb-login-subtitle" id="sbLoginWelcomeMsg">You\'re signed in. Your profile is paired for personalisation.</p>' +
      '<button type="button" class="sb-btn sb-btn-primary sb-login-submit" id="sbLoginDone">Continue</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    wireLoginModal();
  }

  function wireLoginModal() {
    var backdrop = document.getElementById('sbLoginBackdrop');
    var closeBtn = document.getElementById('sbLoginClose');
    var submitBtn = document.getElementById('sbLoginSubmit');
    var emailInput = document.getElementById('sbLoginEmail');
    var submitLabel = document.getElementById('sbLoginSubmitLabel');
    var spinner = document.getElementById('sbLoginSpinner');
    var errorEl = document.getElementById('sbLoginError');
    var formEl = document.getElementById('sbLoginForm');
    var successEl = document.getElementById('sbLoginSuccess');
    var welcomeName = document.getElementById('sbLoginWelcomeName');
    var welcomeMsg = document.getElementById('sbLoginWelcomeMsg');
    var doneBtn = document.getElementById('sbLoginDone');
    var guestLink = document.getElementById('sbLoginAsGuest');
    var titleEl = document.getElementById('sbLoginTitle');
    var subtitleEl = document.getElementById('sbLoginSubtitle');

    if (!overlay) return;

    function openModal(options) {
      options = options || {};
      overlay.hidden = false;
      formEl.hidden = false;
      successEl.hidden = true;
      errorEl.hidden = true;
      errorEl.textContent = '';
      if (submitBtn) submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = options.mode === 'join' ? 'Join Rewards' : 'Sign in';
      if (spinner) spinner.hidden = true;
      if (titleEl) {
        titleEl.textContent =
          options.mode === 'join' ? 'Join Starbucks Rewards' : 'Sign in to Starbucks Rewards';
      }
      if (subtitleEl) {
        subtitleEl.textContent =
          options.mode === 'join'
            ? 'Create your Rewards account to start earning Stars on every visit.'
            : 'Access your Stars balance, offers, and personalised rewards across the UAE.';
      }
      document.body.style.overflow = 'hidden';
      setTimeout(function () {
        if (emailInput) emailInput.focus();
      }, 50);
    }

    openModalFn = openModal;

    function closeModal() {
      overlay.hidden = true;
      document.body.style.overflow = '';
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

    function updateHeaderSignedIn(firstName) {
      var signIn = document.getElementById('sbSignInBtn');
      var join = document.getElementById('sbJoinRewardsBtn');
      if (signIn) {
        signIn.textContent = firstName ? 'Hi, ' + firstName : 'My Account';
        signIn.classList.add('is-signed-in');
      }
      if (join) join.hidden = true;
    }

    function showSuccess(firstName) {
      formEl.hidden = true;
      successEl.hidden = false;
      welcomeName.textContent = firstName || 'Guest';
      welcomeMsg.textContent = 'You\'re signed in. Your profile is paired for personalisation.';
      updateHeaderSignedIn(firstName);
    }

    function postLoginRequest(email) {
      var msg = { source: LAB_SOURCE, type: 'login-request', email: email };
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
      } else {
        window.postMessage(msg, '*');
      }
    }

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
        window._sbLoginTimeout = window.setTimeout(function () {
          showError('Could not reach the profile service. Try again.');
        }, 10000);
      });
    }

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== SHELL_SOURCE) return;
      if (ev.data.type !== 'login-complete') return;
      clearTimeout(window._sbLoginTimeout);
      setLoading(false);
      if (ev.data.found) {
        showSuccess(ev.data.firstName);
        if (window.StarbucksLabEvents && typeof window.StarbucksLabEvents.emit === 'function') {
          window.StarbucksLabEvents.emit('starbucks.account.login', {
            method: 'email',
            memberRecognised: true,
          });
        }
      } else {
        showError('No Starbucks profile found for that email. Check the address and try again.');
      }
    });
  }

  window.StarbucksLogin = {
    mount: mountLoginOverlay,
    open: function (options) {
      mountLoginOverlay();
      if (typeof openModalFn === 'function') openModalFn(options);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountLoginOverlay);
  } else {
    mountLoginOverlay();
  }
})();
