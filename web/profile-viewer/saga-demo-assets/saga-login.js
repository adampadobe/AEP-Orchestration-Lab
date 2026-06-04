/**
 * Saga Cruises lab — MySaga login modal (Etihad-style).
 * Posts login-request to parent; parent loads profile + saga.identity.stitch on ECID.
 */
(function () {
  'use strict';

  var SHELL_SOURCE = 'saga-demo-shell';
  var LAB_SOURCE = 'saga-cruises-lab';

  function ensureModalDom() {
    if (document.getElementById('sagaLoginOverlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'sagaLoginOverlay';
    overlay.className = 'saga-login-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'sagaLoginTitle');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="saga-login-backdrop" id="sagaLoginBackdrop"></div>' +
      '<div class="saga-login-card">' +
      '  <button type="button" class="saga-login-close" id="sagaLoginClose" aria-label="Close">' +
      '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '  </button>' +
      '  <div id="sagaLoginForm">' +
      '    <img class="saga-login-logo" src="images/saga_logo.svg" width="118" height="32" alt="" aria-hidden="true">' +
      '    <h2 class="saga-login-title" id="sagaLoginTitle">Log in to MySaga</h2>' +
      '    <p class="saga-login-subtitle">View your quotes and manage holiday and cruise bookings.</p>' +
      '    <div class="saga-login-fields">' +
      '      <div class="saga-login-field">' +
      '        <label for="sagaLoginEmail">Email address</label>' +
      '        <input type="email" id="sagaLoginEmail" placeholder="you@example.com" autocomplete="email" spellcheck="false">' +
      '      </div>' +
      '      <div class="saga-login-field">' +
      '        <label for="sagaLoginPassword">Password</label>' +
      '        <input type="password" id="sagaLoginPassword" placeholder="••••••••" autocomplete="current-password">' +
      '      </div>' +
      '    </div>' +
      '    <p id="sagaLoginError" class="saga-login-error" hidden></p>' +
      '    <button type="button" id="sagaLoginSubmit" class="saga-btn saga-btn--dark saga-login-submit">' +
      '      <span id="sagaLoginSubmitLabel">Log in</span>' +
      '      <span id="sagaLoginSpinner" class="saga-login-spinner" hidden></span>' +
      '    </button>' +
      '    <p class="saga-login-guest-link"><a href="#" id="sagaLoginAsGuest">Continue as guest</a></p>' +
      '  </div>' +
      '  <div id="sagaLoginSuccess" hidden>' +
      '    <img class="saga-login-logo" src="images/saga_logo.svg" width="118" height="32" alt="" aria-hidden="true">' +
      '    <h2 class="saga-login-title">Welcome back, <span id="sagaLoginWelcomeName">Guest</span></h2>' +
      '    <p class="saga-login-subtitle" id="sagaLoginWelcomeMsg">You\'re signed in to MySaga.</p>' +
      '    <button type="button" class="saga-btn saga-btn--dark saga-login-submit" id="sagaLoginDone">Continue</button>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(overlay);
  }

  function initSagaLoginModal() {
    ensureModalDom();

    var overlay = document.getElementById('sagaLoginOverlay');
    var backdrop = document.getElementById('sagaLoginBackdrop');
    var closeBtn = document.getElementById('sagaLoginClose');
    var submitBtn = document.getElementById('sagaLoginSubmit');
    var emailInput = document.getElementById('sagaLoginEmail');
    var submitLabel = document.getElementById('sagaLoginSubmitLabel');
    var spinner = document.getElementById('sagaLoginSpinner');
    var errorEl = document.getElementById('sagaLoginError');
    var formEl = document.getElementById('sagaLoginForm');
    var successEl = document.getElementById('sagaLoginSuccess');
    var welcomeName = document.getElementById('sagaLoginWelcomeName');
    var welcomeMsg = document.getElementById('sagaLoginWelcomeMsg');
    var doneBtn = document.getElementById('sagaLoginDone');
    var guestLink = document.getElementById('sagaLoginAsGuest');

    if (!overlay) return;

    function headerLoginButtons() {
      return document.querySelectorAll('.saga-btn--login, [data-saga-open-login="1"]');
    }

    function openModal() {
      overlay.hidden = false;
      formEl.hidden = false;
      successEl.hidden = true;
      errorEl.hidden = true;
      errorEl.textContent = '';
      if (submitBtn) submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Log in';
      if (spinner) spinner.hidden = true;
      document.body.style.overflow = 'hidden';
      requestPrefillFromParent();
      window.setTimeout(function () {
        if (emailInput) emailInput.focus();
      }, 50);
    }

    function closeModal() {
      overlay.hidden = true;
      document.body.style.overflow = '';
      if (location.hash === '#login') {
        try {
          history.replaceState(null, '', location.pathname + location.search);
        } catch (_e) {
          location.hash = '';
        }
      }
    }

    function requestPrefillFromParent() {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: LAB_SOURCE, type: 'login-modal-open' }, '*');
        }
      } catch (_e2) {
        /* noop */
      }
    }

    function setLoading(on) {
      if (submitBtn) submitBtn.disabled = on;
      if (submitLabel) submitLabel.textContent = on ? 'Signing in…' : 'Log in';
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
      welcomeMsg.textContent = 'You\'re signed in to MySaga.';
      headerLoginButtons().forEach(function (btn) {
        if (btn.tagName === 'BUTTON') {
          btn.textContent = firstName ? 'Hi, ' + firstName : 'MySaga';
          btn.classList.add('is-signed-in');
        }
      });
    }

    function bindOpenLogin(el) {
      if (!el || el.getAttribute('data-saga-login-bound') === '1') return;
      el.setAttribute('data-saga-login-bound', '1');
      el.addEventListener('click', function (e) {
        if (el.tagName === 'A') e.preventDefault();
        openModal();
      });
    }

    headerLoginButtons().forEach(bindOpenLogin);
    document.querySelectorAll('a[href="#login"], a[href*="saga-home.html#login"]').forEach(bindOpenLogin);

    closeBtn && closeBtn.addEventListener('click', closeModal);
    backdrop && backdrop.addEventListener('click', closeModal);
    doneBtn && doneBtn.addEventListener('click', closeModal);
    guestLink &&
      guestLink.addEventListener('click', function (e) {
        e.preventDefault();
        closeModal();
      });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    submitBtn &&
      submitBtn.addEventListener('click', function () {
        var email = emailInput ? emailInput.value.trim() : '';
        if (!email || email.indexOf('@') === -1) {
          showError('Please enter a valid email address.');
          return;
        }
        setLoading(true);
        errorEl.hidden = true;
        if (window.SagaCruisesLabEvents && typeof window.SagaCruisesLabEvents.requestLogin === 'function') {
          window.SagaCruisesLabEvents.requestLogin(email);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: LAB_SOURCE, type: 'login-request', email: email }, '*');
        }
        window._sagaLoginTimeout = window.setTimeout(function () {
          showError('Could not reach the profile service. Try again.');
        }, 10000);
      });

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== SHELL_SOURCE) return;
      if (ev.data.type === 'login-prefill') {
        var pre = String(ev.data.email || '').trim();
        if (pre && emailInput && !emailInput.value.trim()) emailInput.value = pre;
        return;
      }
      if (ev.data.type !== 'login-complete') return;
      window.clearTimeout(window._sagaLoginTimeout);
      setLoading(false);
      if (ev.data.found) {
        showSuccess(ev.data.firstName);
        if (window.SagaCruisesLabEvents && typeof window.SagaCruisesLabEvents.emit === 'function') {
          window.SagaCruisesLabEvents.emit(
            'application.login',
            {
              method: 'email',
              travelBrand: 'Saga',
              memberRecognised: true,
            },
            'Saga — MySaga login',
            location.href.split('#')[0],
          );
        }
      } else {
        showError('No MySaga account found for that email. Check the address and try again.');
      }
    });

    if (location.hash === '#login') {
      window.setTimeout(openModal, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSagaLoginModal);
  } else {
    initSagaLoginModal();
  }
})();
