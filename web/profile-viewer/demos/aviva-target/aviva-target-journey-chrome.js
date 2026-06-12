/**
 * Mounts the Aviva Target lab strip on direct journey page loads (motor URLs, landing, registration).
 * Skipped inside the lab shell iframe (parent already has the strip) and during VEC compose only.
 * Uses shared/env-bar.js for env bar CSS + script chain (single version manifest).
 */
(function () {
  'use strict';

  var PV = '/profile-viewer/';
  var MANIFEST_VERSION = '20260612-env-bar';

  if (window.__avivaTargetJourneyChromeBooted) return;

  function isVecCompose() {
    if (window.AvivaTargetVec && typeof window.AvivaTargetVec.isVecCompose === 'function') {
      return window.AvivaTargetVec.isVecCompose();
    }
    var s = String(location.search || '') + String(location.hash || '');
    s = s.toLowerCase();
    return s.indexOf('adobe_authoring_enabled') !== -1 || s.indexOf('mboxdisable=1') !== -1;
  }

  function inLabShellIframe() {
    try {
      return (
        window.top !== window &&
        /aviva-target-demo\.html$/i.test(String(window.top.location.pathname || ''))
      );
    } catch (_e) {
      return false;
    }
  }

  if (isVecCompose() || inLabShellIframe()) return;

  window.__avivaTargetJourneyChromeBooted = true;

  function ensureThemePaint() {
    if (document.documentElement.getAttribute('data-aep-theme')) return;
    try {
      var d = document.documentElement;
      if (localStorage.getItem('aepTheme') === 'dark') d.setAttribute('data-aep-theme', 'dark');
      if (localStorage.getItem('aepSidebarCollapsed') === '1') d.setAttribute('data-sidebar-collapsed', '');
    } catch (_e) {}
  }

  function linkCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('Failed to load ' + src));
      };
      document.body.appendChild(script);
    });
  }

  function mountStripMarkup() {
    if (document.getElementById('avivaTargetDemoTopAnchor')) return;

    document.body.classList.add('aviva-target-demo-page', 'home-dashboard-concierge', 'aviva-target-journey-chrome-page');

    var anchor = document.createElement('div');
    anchor.className = 'aviva-target-demo-top-anchor';
    anchor.id = 'avivaTargetDemoTopAnchor';
    anchor.innerHTML =
      '<section class="aviva-target-demo-id-banner" aria-label="Aviva Target demo controls">' +
      '<div class="aviva-target-demo-id-inner aep-demo-id-inner"' +
      ' data-demo-env-strip-mount="site-clone-shell"' +
      ' data-demo-env-strip-variant="spectrum"' +
      ' data-demo-env-strip-title="Aviva Target (web)"' +
      ' data-demo-env-strip-subtitle="Active Configuration"' +
      ' data-demo-env-strip-prefix="avivaTarget"' +
      ' data-demo-env-strip-selected-script-id="avivaTargetSelectedScript"' +
      ' data-demo-env-strip-script-preview-class="aviva-target-demo-script-preview"' +
      ' data-demo-env-strip-message-id="avivaTargetMessage"' +
      ' data-demo-env-strip-profile-btn-label="Look up profile"' +
      ' data-demo-env-strip-bc-bottom="1"' +
      ' data-demo-env-strip-disclaimer="Embedded Aviva car insurance journey for Adobe Target A/B demos. Not affiliated with Aviva."></div>' +
      '</section>';

    document.body.insertBefore(anchor, document.body.firstChild);

    if (!document.getElementById('profileViewerModalMount')) {
      var modalMount = document.createElement('div');
      modalMount.id = 'profileViewerModalMount';
      modalMount.setAttribute('data-aep-profile-viewer-modal-mount', '1');
      document.body.appendChild(modalMount);
    }

    if (!document.querySelector('.dashboard-shell')) {
      var shell = document.createElement('div');
      shell.className = 'dashboard-shell';
      shell.innerHTML =
        '<aside class="dashboard-sidebar" aria-label="Primary"></aside>' +
        '<div class="dashboard-main-wrap"><main class="dashboard-main app-page aviva-target-demo-empty-main" aria-hidden="true"></main></div>';
      document.body.appendChild(shell);
    }
  }

  function initFlyoutSidebar() {
    var body = document.body;
    if (!body.classList.contains('aviva-target-demo-page')) return;
    var sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar) return;

    var mq = window.matchMedia('(max-width: 768px)');
    var hideTimer = null;

    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function setFlyoutOpen(open) {
      body.classList.toggle('aviva-target-demo-page--nav-open', open);
    }

    function scheduleClose() {
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setFlyoutOpen(false);
      }, 450);
    }

    sidebar.addEventListener('mouseenter', function () {
      if (!mq.matches) {
        clearHideTimer();
        setFlyoutOpen(true);
      }
    });
    sidebar.addEventListener('mouseleave', function () {
      if (!mq.matches) scheduleClose();
    });
    document.addEventListener(
      'mousemove',
      function (e) {
        if (mq.matches) return;
        if (e.clientX <= 24) {
          clearHideTimer();
          setFlyoutOpen(true);
          return;
        }
        var r = sidebar.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          clearHideTimer();
          setFlyoutOpen(true);
          return;
        }
        if (body.classList.contains('aviva-target-demo-page--nav-open')) scheduleClose();
      },
      { passive: true },
    );
    mq.addEventListener('change', function () {
      clearHideTimer();
      if (mq.matches) body.classList.remove('aviva-target-demo-page--nav-open');
    });
    setFlyoutOpen(false);
  }

  function bootLabStack() {
    window.SiteCloneDemoEnv = Object.assign(
      {
        storagePrefix: 'avivaTarget',
        webPushBySandboxKey: 'avivaTargetWebPushOnInjectBySandbox',
        webPushLegacyKey: 'avivaTargetWebPushOnInjectToggle',
        webPushToggleId: 'avivaTargetWebPushOnInjectToggle',
        bcOnInjectToggleId: 'avivaTargetBcOnInjectToggle',
        bcStyleSelectId: 'avivaTargetBcStyleSelect',
      },
      window.SiteCloneDemoEnv || {},
    );

    window.envBarConfig = {
      prefix: 'avivaTarget',
      variant: 'spectrum',
      mode: 'journey',
      basePath: PV,
      autoInit: false,
      features: { webPush: true, bc: true, decisioning: true },
      labCoreScript: 'demos/aviva-target/aviva-target-lab-core.js',
      siteCloneDemoEnv: window.SiteCloneDemoEnv,
    };

    var prereqScripts = [
      PV + 'firebase-database-config.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
      PV + 'aep-global-sandbox.js',
      PV + 'aep-lab-sandbox-sync.js?v=20260514-id-token-health',
      PV + 'email-cache.js',
      PV + 'identity-picker.js',
      PV + 'shared/profile-viewer-modal.js?v=20260601-modal-central',
      PV + 'aep-profile-drawer.js?v=20260521-ns-autodetect',
      PV + 'aep-demo-web-push.js?v=20260512-lab-push',
      PV + 'aep-demo-generator-targets.js?v=20260508',
      PV + 'site-clone-bc-env.js?v=20260605-tags-sandbox-restore',
    ];

    var chain = prereqScripts.reduce(function (p, src) {
      return p.then(function () {
        return loadScript(src);
      });
    }, Promise.resolve());

    chain
      .then(function () {
        return loadScript(PV + 'shared/env-bar.js?v=' + MANIFEST_VERSION);
      })
      .then(function () {
        if (!window.envBar || typeof window.envBar.init !== 'function') {
          throw new Error('shared/env-bar.js did not expose window.envBar');
        }
        return window.envBar.init(window.envBarConfig);
      })
      .then(function () {
        if (typeof window.initAvivaTargetLab === 'function') {
          window.initAvivaTargetLab({ iframeIds: [] });
        }
        initFlyoutSidebar();
        return loadScript(PV + 'aep-theme.js?v=20260421-fs-helper');
      })
      .then(function () {
        return loadScript(PV + 'aep-theme-prefs.js?v=20260416d');
      })
      .then(function () {
        var nav = document.createElement('script');
        nav.src = PV + 'aep-lab-nav.js?v=20260608-aviva-target-nav';
        nav.defer = true;
        document.body.appendChild(nav);
      })
      .catch(function (err) {
        console.warn('[aviva-target-journey-chrome]', err);
      });
  }

  function start() {
    ensureThemePaint();
    linkCss(PV + 'style.css');
    linkCss(PV + 'home.css?v=20260514-customer-demos-nav');
    linkCss(PV + 'aviva-target-demo.css?v=20260604-journey-chrome');
    linkCss(PV + 'aep-profile-drawer.css?v=20260521-refresh-btn-lightfix');
    linkCss(PV + 'shared/profile-viewer-modal.css?v=20260601-modal-central');
    linkCss(PV + 'aep-theme.css?v=20260423b-fs-helper');
    linkCss(PV + 'aep-theme-palettes.css?v=20260416c');
    mountStripMarkup();
    bootLabStack();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
