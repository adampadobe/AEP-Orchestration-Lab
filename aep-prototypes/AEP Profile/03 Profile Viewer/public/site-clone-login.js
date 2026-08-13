/**
 * Site-clone demo login modal — pairs with lab shell via postMessage (KSIA / Rocco Forte pattern).
 * Configure via window.SiteCloneLoginConfig before this script loads.
 */
(function siteCloneLogin(global) {
  'use strict';

  var DEFAULT_CFG = {
    labSource: 'site-clone-lab',
    shellSource: 'site-clone-demo-shell',
    brandName: 'Brand',
    title: 'Sign in',
    subtitle: 'Access your profile, preferences, and personalised offers.',
    logoSrc: '',
    logoWidth: 120,
    logoHeight: 42,
    accentColor: '',
    accentHoverColor: '',
    btnTop: '16px',
    profileNotFoundMessage: 'No profile found for that email. Check the address and try again.',
    postLoginUrl: '',
    postLoginDelayMs: 600,
  };

  function readConfig() {
    var raw = global.SiteCloneLoginConfig || {};
    var cfg = {};
    var k;
    for (k in DEFAULT_CFG) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_CFG, k)) cfg[k] = DEFAULT_CFG[k];
    }
    for (k in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, k) && raw[k] != null && raw[k] !== '') {
        cfg[k] = raw[k];
      }
    }
    if (!cfg.title || cfg.title === DEFAULT_CFG.title) {
      cfg.title = 'Sign in to ' + String(cfg.brandName || 'Brand');
    }
    return cfg;
  }

  function applyBrandTokens(cfg) {
    var root = document.documentElement;
    if (cfg.accentColor) root.style.setProperty('--scl-accent', cfg.accentColor);
    if (cfg.accentHoverColor) root.style.setProperty('--scl-accent-hover', cfg.accentHoverColor);
    if (cfg.btnTop) root.style.setProperty('--scl-btn-top', cfg.btnTop);
  }

  function logoHtml(cfg) {
    if (!cfg.logoSrc) return '';
    return (
      '<div class="scl-login-logo" aria-hidden="true">' +
      '<img src="' +
      String(cfg.logoSrc).replace(/"/g, '&quot;') +
      '" alt="" width="' +
      Number(cfg.logoWidth || 120) +
      '" height="' +
      Number(cfg.logoHeight || 42) +
      '">' +
      '</div>'
    );
  }

  function mountLoginChrome() {
    if (document.getElementById('sclLoginBtn')) return;

    var cfg = readConfig();
    applyBrandTokens(cfg);

    var utils = document.createElement('div');
    utils.className = 'scl-top-utils';
    utils.id = 'sclTopUtils';
    utils.innerHTML =
      '<button type="button" id="sclLoginBtn" class="scl-login-btn" aria-haspopup="dialog">Login or Sign up</button>';
    document.body.appendChild(utils);

    var overlay = document.createElement('div');
    overlay.id = 'sclLoginOverlay';
    overlay.className = 'scl-login-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'sclLoginTitle');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="scl-login-backdrop" id="sclLoginBackdrop"></div>' +
      '<div class="scl-login-card">' +
      '<button type="button" class="scl-login-close" id="sclLoginClose" aria-label="Close">&times;</button>' +
      '<div id="sclLoginForm">' +
      logoHtml(cfg) +
      '<h2 class="scl-login-title" id="sclLoginTitle">' +
      String(cfg.title).replace(/</g, '&lt;') +
      '</h2>' +
      '<p class="scl-login-subtitle">' +
      String(cfg.subtitle).replace(/</g, '&lt;') +
      '</p>' +
      '<div class="scl-login-fields">' +
      '<div class="scl-login-field">' +
      '<label for="sclLoginEmail">Email address</label>' +
      '<input type="text" id="sclLoginEmail" placeholder="you@example.com" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="scl-login-field">' +
      '<label for="sclLoginPassword">Password</label>' +
      '<input type="password" id="sclLoginPassword" placeholder="••••••••" autocomplete="current-password">' +
      '</div>' +
      '</div>' +
      '<p id="sclLoginError" class="scl-login-error" hidden></p>' +
      '<button type="button" id="sclLoginSubmit" class="scl-login-submit">' +
      '<span id="sclLoginSubmitLabel">Sign in</span>' +
      '<span id="sclLoginSpinner" class="scl-login-spinner" hidden></span>' +
      '</button>' +
      '<p class="scl-login-guest-link"><a href="#" id="sclLoginAsGuest">Continue as guest</a></p>' +
      '</div>' +
      '<div id="sclLoginSuccess" hidden>' +
      logoHtml(cfg) +
      '<h2 class="scl-login-title">Welcome, <span id="sclLoginWelcomeName">Guest</span></h2>' +
      '<p class="scl-login-subtitle" id="sclLoginWelcomeMsg">You\'re signed in. Your profile is paired for personalisation.</p>' +
      '<button type="button" class="scl-login-submit" id="sclLoginDone">Continue</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    wireLoginModal(cfg);
  }

  function wireLoginModal(cfg) {
    var overlay = document.getElementById('sclLoginOverlay');
    var backdrop = document.getElementById('sclLoginBackdrop');
    var closeBtn = document.getElementById('sclLoginClose');
    var loginBtn = document.getElementById('sclLoginBtn');
    var submitBtn = document.getElementById('sclLoginSubmit');
    var emailInput = document.getElementById('sclLoginEmail');
    var submitLabel = document.getElementById('sclLoginSubmitLabel');
    var spinner = document.getElementById('sclLoginSpinner');
    var errorEl = document.getElementById('sclLoginError');
    var formEl = document.getElementById('sclLoginForm');
    var successEl = document.getElementById('sclLoginSuccess');
    var welcomeName = document.getElementById('sclLoginWelcomeName');
    var doneBtn = document.getElementById('sclLoginDone');
    var guestLink = document.getElementById('sclLoginAsGuest');

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
      document.body.classList.add('scl-login-modal-open');
      global.setTimeout(function () {
        if (emailInput) emailInput.focus();
      }, 50);
    }

    function closeModal() {
      overlay.hidden = true;
      document.body.classList.remove('scl-login-modal-open');
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
      try {
        global.sessionStorage.setItem('siteCloneLoginEmail', emailInput ? emailInput.value.trim() : '');
        global.sessionStorage.setItem('siteCloneLoginFirstName', firstName || '');
      } catch (_e) {}
      if (cfg.postLoginUrl) {
        global.setTimeout(function () {
          global.location.assign(String(cfg.postLoginUrl));
        }, Math.max(0, Number(cfg.postLoginDelayMs) || 0));
      }
    }

    function postLoginRequest(email) {
      var msg = { source: cfg.labSource, type: 'login-request', email: email };
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(msg, '*');
      } else {
        global.postMessage(msg, '*');
      }
    }

    loginBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (doneBtn) {
      doneBtn.addEventListener('click', function () {
        if (cfg.postLoginUrl) {
          global.location.assign(String(cfg.postLoginUrl));
          return;
        }
        closeModal();
      });
    }
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
        global._sclLoginTimeout = global.setTimeout(function () {
          showError('Could not reach the profile service. Try again.');
        }, 10000);
      });
    }

    global.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== cfg.shellSource) return;
      if (ev.data.type !== 'login-complete') return;
      global.clearTimeout(global._sclLoginTimeout);
      setLoading(false);
      if (ev.data.found) {
        showSuccess(ev.data.firstName);
      } else {
        showError(cfg.profileNotFoundMessage);
      }
    });
  }

  global.SiteCloneLogin = { mount: mountLoginChrome, readConfig: readConfig };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountLoginChrome);
  } else {
    mountLoginChrome();
  }
})(typeof window !== 'undefined' ? window : globalThis);
