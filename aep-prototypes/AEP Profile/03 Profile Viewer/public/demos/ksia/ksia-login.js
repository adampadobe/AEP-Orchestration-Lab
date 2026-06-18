/**
 * KSIA site login modal — pairs with lab shell via postMessage (Etihad pattern).
 */
(function () {
  'use strict';

  var LAB_SOURCE = 'ksia-airport-lab';
  var SHELL_SOURCE = 'ksia-demo-shell';

  function assetPrefix() {
    if (window.KsiaChrome && typeof window.KsiaChrome.assetPrefix === 'function') {
      return window.KsiaChrome.assetPrefix();
    }
    var path = String(location.pathname || '');
    var marker = '/demos/ksia/';
    var idx = path.indexOf(marker);
    if (idx === -1) return '';
    var rest = path.slice(idx + marker.length);
    var depth = (rest.match(/\//g) || []).length;
    return depth ? '../'.repeat(depth) : '';
  }

  function mountLoginChrome() {
    if (document.getElementById('ksiaLoginBtn')) return;

    var utils = document.createElement('div');
    utils.className = 'ksia-top-utils';
    utils.id = 'ksiaTopUtils';
    utils.innerHTML =
      '<button type="button" id="ksiaLoginBtn" class="ksia-login-btn" aria-haspopup="dialog">Login or Sign up</button>';
    document.body.appendChild(utils);

    var overlay = document.createElement('div');
    overlay.id = 'ksiaLoginOverlay';
    overlay.className = 'ksia-login-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ksiaLoginTitle');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="ksia-login-backdrop" id="ksiaLoginBackdrop"></div>' +
      '<div class="ksia-login-card">' +
      '<button type="button" class="ksia-login-close" id="ksiaLoginClose" aria-label="Close">&times;</button>' +
      '<div id="ksiaLoginForm">' +
      '<div class="ksia-login-logo" aria-hidden="true">' +
      '<img src="' +
      assetPrefix() +
      'assets/logo.png" alt="" width="56" height="56">' +
      '</div>' +
      '<h2 class="ksia-login-title" id="ksiaLoginTitle">Sign in to KSIA</h2>' +
      '<p class="ksia-login-subtitle">Access your AIVC wallet, flight updates, and personalised airport services.</p>' +
      '<div class="ksia-login-fields">' +
      '<div class="ksia-login-field">' +
      '<label for="ksiaLoginEmail">Email address</label>' +
      '<input type="text" id="ksiaLoginEmail" placeholder="you@example.com" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="ksia-login-field">' +
      '<label for="ksiaLoginPassword">Password</label>' +
      '<input type="password" id="ksiaLoginPassword" placeholder="••••••••" autocomplete="current-password">' +
      '</div>' +
      '</div>' +
      '<p id="ksiaLoginError" class="ksia-login-error" hidden></p>' +
      '<button type="button" id="ksiaLoginSubmit" class="ksia-btn ksia-btn-primary ksia-login-submit">' +
      '<span id="ksiaLoginSubmitLabel">Sign in</span>' +
      '<span id="ksiaLoginSpinner" class="ksia-login-spinner" hidden></span>' +
      '</button>' +
      '<p class="ksia-login-guest-link"><a href="#" id="ksiaLoginAsGuest">Continue as guest</a></p>' +
      '</div>' +
      '<div id="ksiaLoginSuccess" hidden>' +
      '<div class="ksia-login-logo" aria-hidden="true">' +
      '<img src="' +
      assetPrefix() +
      'assets/logo.png" alt="" width="56" height="56">' +
      '</div>' +
      '<h2 class="ksia-login-title">Welcome, <span id="ksiaLoginWelcomeName">Guest</span></h2>' +
      '<p class="ksia-login-subtitle" id="ksiaLoginWelcomeMsg">You\'re signed in. Your profile is paired for personalisation.</p>' +
      '<button type="button" class="ksia-btn ksia-btn-primary ksia-login-submit" id="ksiaLoginDone">Continue</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    wireLoginModal();
  }

  function wireLoginModal() {
    var overlay = document.getElementById('ksiaLoginOverlay');
    var backdrop = document.getElementById('ksiaLoginBackdrop');
    var closeBtn = document.getElementById('ksiaLoginClose');
    var loginBtn = document.getElementById('ksiaLoginBtn');
    var submitBtn = document.getElementById('ksiaLoginSubmit');
    var emailInput = document.getElementById('ksiaLoginEmail');
    var submitLabel = document.getElementById('ksiaLoginSubmitLabel');
    var spinner = document.getElementById('ksiaLoginSpinner');
    var errorEl = document.getElementById('ksiaLoginError');
    var formEl = document.getElementById('ksiaLoginForm');
    var successEl = document.getElementById('ksiaLoginSuccess');
    var welcomeName = document.getElementById('ksiaLoginWelcomeName');
    var welcomeMsg = document.getElementById('ksiaLoginWelcomeMsg');
    var doneBtn = document.getElementById('ksiaLoginDone');
    var guestLink = document.getElementById('ksiaLoginAsGuest');

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
      document.body.style.overflow = 'hidden';
      setTimeout(function () {
        if (emailInput) emailInput.focus();
      }, 50);
    }

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

    function showSuccess(firstName) {
      formEl.hidden = true;
      successEl.hidden = false;
      welcomeName.textContent = firstName || 'Guest';
      welcomeMsg.textContent = 'You\'re signed in. Your profile is paired for personalisation.';
      if (loginBtn) {
        loginBtn.textContent = firstName ? 'Hi, ' + firstName : 'My Account';
        loginBtn.classList.add('is-signed-in');
      }
    }

    function postLoginRequest(email) {
      var msg = { source: LAB_SOURCE, type: 'login-request', email: email };
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
      } else {
        window.postMessage(msg, '*');
      }
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
        window._ksiaLoginTimeout = window.setTimeout(function () {
          showError('Could not reach the profile service. Try again.');
        }, 10000);
      });
    }

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== SHELL_SOURCE) return;
      if (ev.data.type !== 'login-complete') return;
      clearTimeout(window._ksiaLoginTimeout);
      setLoading(false);
      if (ev.data.found) {
        showSuccess(ev.data.firstName);
        if (window.KsiaLabEvents && typeof window.KsiaLabEvents.emit === 'function') {
          window.KsiaLabEvents.emit('ksia.account.login', {
            method: 'email',
            memberRecognised: true,
          });
        }
      } else {
        showError('No KSIA profile found for that email. Check the address and try again.');
      }
    });
  }

  window.KsiaLogin = { mount: mountLoginChrome };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountLoginChrome);
  } else {
    mountLoginChrome();
  }
})();
