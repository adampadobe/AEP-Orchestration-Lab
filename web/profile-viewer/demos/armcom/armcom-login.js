/**
 * Arm Account popout — hub, sign-in, and register modes (KSIA lab pairing pattern).
 */
(function () {
  'use strict';

  var LAB_SOURCE = 'armcom-lab';
  var SHELL_SOURCE = 'armcom-demo-shell';

  var QUICK_LINKS = [
    { label: 'Account', href: '#' },
    { label: 'Products', href: '#' },
    { label: 'Tools and Software', href: '#' },
    { label: 'Support Cases', href: '#' },
  ];

  var DEV_LINKS = [{ label: 'Dashboard', href: 'developer/index.html' }];

  var MANAGE_LINKS = [{ label: 'Profile and Settings', href: '#' }];

  function assetPrefix() {
    var path = String(location.pathname || '');
    var marker = '/demos/armcom/';
    var idx = path.indexOf(marker);
    if (idx === -1) return '';
    var rest = path.slice(idx + marker.length);
    var depth = (rest.match(/\//g) || []).length;
    return depth ? '../'.repeat(depth) : '';
  }

  function resolveHref(href) {
    if (!href || href === '#') return '#';
    return assetPrefix() + href;
  }

  function linkList(items) {
    return (
      '<ul class="armcom-account-popout-links">' +
      items
        .map(function (item) {
          var href = resolveHref(item.href);
          return (
            '<li><a href="' +
            href +
            '" data-armcom-account-link="1">' +
            item.label +
            '</a></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function buildPopoutMarkup() {
    return (
      '<div class="armcom-account-popout" id="armcomAccountPopout" role="dialog" aria-labelledby="armcomAccountTitle" hidden>' +
      '<div class="armcom-account-popout-inner">' +
      '<div class="armcom-account-popout-panel" id="armcomAccountHub" data-mode="hub">' +
      '<p class="armcom-account-popout-kicker">ARM ACCOUNT</p>' +
      '<h2 class="armcom-account-popout-title" id="armcomAccountTitle">Arm Account</h2>' +
      '<p class="armcom-account-popout-subtitle" id="armcomAccountSubtitle">Log in to access your Arm Account.</p>' +
      '<button type="button" class="armcom-account-popout-cta" id="armcomAccountLoginBtn">Login</button>' +
      '<p class="armcom-account-popout-register">Need an Arm ID? <a href="#" id="armcomAccountRegisterLink">Register here</a></p>' +
      '<hr class="armcom-account-popout-divider" aria-hidden="true">' +
      '<div class="armcom-account-popout-section">' +
      '<p class="armcom-account-popout-section-title">Quick Links</p>' +
      linkList(QUICK_LINKS) +
      '</div>' +
      '<div class="armcom-account-popout-section">' +
      '<p class="armcom-account-popout-section-title">Developer Program</p>' +
      linkList(DEV_LINKS) +
      '</div>' +
      '<div class="armcom-account-popout-section">' +
      '<p class="armcom-account-popout-section-title">Manage your account</p>' +
      linkList(MANAGE_LINKS) +
      '</div>' +
      '</div>' +
      '<div class="armcom-account-popout-panel" id="armcomAccountSignIn" data-mode="signin" hidden>' +
      '<button type="button" class="armcom-account-popout-back" id="armcomAccountBackSignIn" aria-label="Back to account menu">‹ Back</button>' +
      '<p class="armcom-account-popout-kicker">ARM ACCOUNT</p>' +
      '<h2 class="armcom-account-popout-title">Sign in</h2>' +
      '<p class="armcom-account-popout-subtitle">Use your Arm ID email and password.</p>' +
      '<div class="armcom-account-popout-fields">' +
      '<div class="armcom-account-popout-field">' +
      '<label for="armcomSignInEmail">Email address</label>' +
      '<input type="text" id="armcomSignInEmail" placeholder="you@company.com" autocomplete="username" spellcheck="false">' +
      '</div>' +
      '<div class="armcom-account-popout-field">' +
      '<label for="armcomSignInPassword">Password</label>' +
      '<input type="password" id="armcomSignInPassword" placeholder="••••••••" autocomplete="current-password">' +
      '</div>' +
      '</div>' +
      '<p class="armcom-account-popout-error" id="armcomSignInError" hidden></p>' +
      '<button type="button" class="armcom-account-popout-cta" id="armcomSignInSubmit">' +
      '<span id="armcomSignInSubmitLabel">Sign in</span>' +
      '<span class="armcom-account-popout-spinner" id="armcomSignInSpinner" hidden></span>' +
      '</button>' +
      '</div>' +
      '<div class="armcom-account-popout-panel" id="armcomAccountRegister" data-mode="register" hidden>' +
      '<button type="button" class="armcom-account-popout-back" id="armcomAccountBackRegister" aria-label="Back to account menu">‹ Back</button>' +
      '<p class="armcom-account-popout-kicker">ARM ACCOUNT</p>' +
      '<h2 class="armcom-account-popout-title">Register</h2>' +
      '<p class="armcom-account-popout-subtitle">Create your Arm ID to access products, tools, and support.</p>' +
      '<div class="armcom-account-popout-fields">' +
      '<div class="armcom-account-popout-field">' +
      '<label for="armcomRegisterFirst">First name</label>' +
      '<input type="text" id="armcomRegisterFirst" placeholder="First name" autocomplete="given-name">' +
      '</div>' +
      '<div class="armcom-account-popout-field">' +
      '<label for="armcomRegisterLast">Last name</label>' +
      '<input type="text" id="armcomRegisterLast" placeholder="Last name" autocomplete="family-name">' +
      '</div>' +
      '<div class="armcom-account-popout-field">' +
      '<label for="armcomRegisterEmail">Email address</label>' +
      '<input type="text" id="armcomRegisterEmail" placeholder="you@company.com" autocomplete="email" spellcheck="false">' +
      '</div>' +
      '</div>' +
      '<p class="armcom-account-popout-error" id="armcomRegisterError" hidden></p>' +
      '<button type="button" class="armcom-account-popout-cta" id="armcomRegisterSubmit">' +
      '<span id="armcomRegisterSubmitLabel">Create Arm ID</span>' +
      '<span class="armcom-account-popout-spinner" id="armcomRegisterSpinner" hidden></span>' +
      '</button>' +
      '</div>' +
      '<div class="armcom-account-popout-panel armcom-account-popout-signed" id="armcomAccountSigned" data-mode="signed" hidden>' +
      '<p class="armcom-account-popout-kicker">ARM ACCOUNT</p>' +
      '<h2 class="armcom-account-popout-title">Welcome, <span id="armcomAccountWelcomeName">Guest</span></h2>' +
      '<p class="armcom-account-popout-subtitle" id="armcomAccountWelcomeMsg">You\'re signed in. Your profile is paired for personalisation.</p>' +
      '<button type="button" class="armcom-account-popout-cta" id="armcomAccountDoneBtn">Continue</button>' +
      '</div>' +
      '</div></div>'
    );
  }

  function mountPopout() {
    var accountBtn = document.getElementById('armcomAccountBtn');
    if (!accountBtn || document.getElementById('armcomAccountPopout')) return;

    var anchor = accountBtn.closest('.armcom-account-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = 'armcom-account-anchor';
      accountBtn.parentNode.insertBefore(anchor, accountBtn);
      anchor.appendChild(accountBtn);
    }

    anchor.insertAdjacentHTML('beforeend', buildPopoutMarkup());
    wirePopout(accountBtn);
  }

  function wirePopout(accountBtn) {
    var popout = document.getElementById('armcomAccountPopout');
    var hub = document.getElementById('armcomAccountHub');
    var signIn = document.getElementById('armcomAccountSignIn');
    var register = document.getElementById('armcomAccountRegister');
    var signed = document.getElementById('armcomAccountSigned');
    var loginBtn = document.getElementById('armcomAccountLoginBtn');
    var registerLink = document.getElementById('armcomAccountRegisterLink');
    var backSignIn = document.getElementById('armcomAccountBackSignIn');
    var backRegister = document.getElementById('armcomAccountBackRegister');
    var signInSubmit = document.getElementById('armcomSignInSubmit');
    var registerSubmit = document.getElementById('armcomRegisterSubmit');
    var signInEmail = document.getElementById('armcomSignInEmail');
    var signInPassword = document.getElementById('armcomSignInPassword');
    var registerFirst = document.getElementById('armcomRegisterFirst');
    var registerLast = document.getElementById('armcomRegisterLast');
    var registerEmail = document.getElementById('armcomRegisterEmail');
    var signInError = document.getElementById('armcomSignInError');
    var registerError = document.getElementById('armcomRegisterError');
    var signInLabel = document.getElementById('armcomSignInSubmitLabel');
    var registerLabel = document.getElementById('armcomRegisterSubmitLabel');
    var signInSpinner = document.getElementById('armcomSignInSpinner');
    var registerSpinner = document.getElementById('armcomRegisterSpinner');
    var welcomeName = document.getElementById('armcomAccountWelcomeName');
    var doneBtn = document.getElementById('armcomAccountDoneBtn');

    if (!popout || !accountBtn) return;

    var currentMode = 'hub';
    var isOpen = false;
    var signedInName = null;

    function showPanel(mode) {
      currentMode = mode;
      [hub, signIn, register, signed].forEach(function (panel) {
        if (!panel) return;
        panel.hidden = panel.getAttribute('data-mode') !== mode;
      });
    }

    function openPopout(mode) {
      isOpen = true;
      popout.hidden = false;
      accountBtn.setAttribute('aria-expanded', 'true');
      showPanel(mode || (signedInName ? 'signed' : 'hub'));
      if (mode === 'signin' && signInEmail) {
        setTimeout(function () {
          signInEmail.focus();
        }, 30);
      }
      if (mode === 'register' && registerFirst) {
        setTimeout(function () {
          registerFirst.focus();
        }, 30);
      }
    }

    function closePopout() {
      isOpen = false;
      popout.hidden = true;
      accountBtn.setAttribute('aria-expanded', 'false');
      if (!signedInName) showPanel('hub');
    }

    function togglePopout() {
      if (isOpen) closePopout();
      else openPopout(signedInName ? 'signed' : 'hub');
    }

    function clearErrors() {
      if (signInError) {
        signInError.hidden = true;
        signInError.textContent = '';
      }
      if (registerError) {
        registerError.hidden = true;
        registerError.textContent = '';
      }
    }

    function setSubmitLoading(which, on) {
      var btn = which === 'signin' ? signInSubmit : registerSubmit;
      var label = which === 'signin' ? signInLabel : registerLabel;
      var spinner = which === 'signin' ? signInSpinner : registerSpinner;
      if (btn) btn.disabled = on;
      if (label) {
        label.textContent =
          which === 'signin'
            ? on
              ? 'Signing in…'
              : 'Sign in'
            : on
              ? 'Creating…'
              : 'Create Arm ID';
      }
      if (spinner) spinner.hidden = !on;
    }

    function showFormError(which, msg) {
      var el = which === 'signin' ? signInError : registerError;
      if (!el) return;
      el.textContent = msg;
      el.hidden = false;
      setSubmitLoading(which, false);
    }

    function postLoginRequest(payload) {
      var msg = {
        source: LAB_SOURCE,
        type: 'login-request',
        email: payload.email,
        firstName: payload.firstName || null,
        lastName: payload.lastName || null,
        mode: payload.mode || 'signin',
      };
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
      } else {
        window.postMessage(msg, '*');
      }
    }

    function showSignedIn(firstName) {
      signedInName = firstName || 'Guest';
      if (welcomeName) welcomeName.textContent = signedInName;
      accountBtn.classList.add('is-signed-in');
      accountBtn.setAttribute('aria-label', 'Arm Account — signed in as ' + signedInName);
      showPanel('signed');
      if (window.ArmcomEvents && typeof window.ArmcomEvents.showActivationToast === 'function') {
        window.ArmcomEvents.showActivationToast();
      }
    }

    function isValidEmail(email) {
      return !!email && email.indexOf('@') > 0;
    }

    accountBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePopout();
    });

    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        clearErrors();
        openPopout('signin');
      });
    }

    if (registerLink) {
      registerLink.addEventListener('click', function (e) {
        e.preventDefault();
        clearErrors();
        openPopout('register');
      });
    }

    if (backSignIn) {
      backSignIn.addEventListener('click', function () {
        clearErrors();
        showPanel('hub');
      });
    }

    if (backRegister) {
      backRegister.addEventListener('click', function () {
        clearErrors();
        showPanel('hub');
      });
    }

    if (doneBtn) {
      doneBtn.addEventListener('click', closePopout);
    }

    document.addEventListener('click', function (e) {
      if (!isOpen) return;
      if (popout.contains(e.target) || accountBtn.contains(e.target)) return;
      closePopout();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closePopout();
    });

    popout.querySelectorAll('[data-armcom-account-link]').forEach(function (link) {
      link.addEventListener('click', function () {
        closePopout();
      });
    });

    if (signInSubmit) {
      signInSubmit.addEventListener('click', function () {
        var email = signInEmail ? signInEmail.value.trim() : '';
        if (!isValidEmail(email)) {
          showFormError('signin', 'Please enter a valid email address.');
          return;
        }
        clearErrors();
        setSubmitLoading('signin', true);
        postLoginRequest({ email: email, mode: 'signin' });
        window._armcomLoginTimeout = window.setTimeout(function () {
          showFormError('signin', 'Could not reach the profile service. Try again.');
        }, 10000);
      });
    }

    if (registerSubmit) {
      registerSubmit.addEventListener('click', function () {
        var first = registerFirst ? registerFirst.value.trim() : '';
        var last = registerLast ? registerLast.value.trim() : '';
        var email = registerEmail ? registerEmail.value.trim() : '';
        if (!first || !last) {
          showFormError('register', 'Please enter your first and last name.');
          return;
        }
        if (!isValidEmail(email)) {
          showFormError('register', 'Please enter a valid email address.');
          return;
        }
        clearErrors();
        setSubmitLoading('register', true);
        postLoginRequest({
          email: email,
          firstName: first,
          lastName: last,
          mode: 'register',
        });
        window._armcomRegisterTimeout = window.setTimeout(function () {
          showFormError('register', 'Could not reach the profile service. Try again.');
        }, 10000);
      });
    }

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== SHELL_SOURCE) return;
      if (ev.data.type !== 'login-complete') return;

      clearTimeout(window._armcomLoginTimeout);
      clearTimeout(window._armcomRegisterTimeout);
      setSubmitLoading('signin', false);
      setSubmitLoading('register', false);

      if (ev.data.found) {
        if (
          window.ArmcomPersonalizedBanner &&
          typeof window.ArmcomPersonalizedBanner.onRegistrationComplete === 'function'
        ) {
          window.ArmcomPersonalizedBanner.onRegistrationComplete({
            email: ev.data.email,
            firstName: ev.data.firstName,
            company: ev.data.company,
          });
        }
        showSignedIn(ev.data.firstName || null);
      } else if (currentMode === 'register') {
        showFormError('register', 'No Arm profile found for that email. Check the address and try again.');
      } else {
        showFormError('signin', 'No Arm profile found for that email. Check the address and try again.');
      }
    });
  }

  function init() {
    mountPopout();
    if (!document.getElementById('armcomAccountBtn')) {
      window.setTimeout(mountPopout, 50);
    }
  }

  window.ArmcomLogin = { init: init, mount: mountPopout };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
