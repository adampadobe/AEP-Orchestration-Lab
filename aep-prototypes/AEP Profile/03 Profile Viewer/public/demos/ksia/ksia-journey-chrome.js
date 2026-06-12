/**
 * Mounts the KSIA lab strip on direct journey page loads (demos/ksia/* URLs).
 * Skipped inside the lab shell iframe and during VEC compose.
 */
(function () {
  'use strict';

  var PV = '/profile-viewer/';
  var BUILD = '20260612';

  if (window.__ksiaJourneyChromeBooted) return;

  function inLabShellIframe() {
    try {
      return window.top !== window && /ksia-demo\.html$/i.test(String(window.top.location.pathname || ''));
    } catch (_e) {
      return false;
    }
  }

  if (inLabShellIframe()) return;

  window.__ksiaJourneyChromeBooted = true;

  function ensureThemePaint() {
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
    if (document.getElementById('ksiaDemoTopAnchor')) return;

    document.body.classList.add('ksia-demo-page', 'home-dashboard-concierge', 'ksia-journey-chrome-page');

    var anchor = document.createElement('div');
    anchor.className = 'ksia-demo-top-anchor';
    anchor.id = 'ksiaDemoTopAnchor';
    anchor.innerHTML =
      '<section class="ksia-demo-id-banner" aria-label="KSIA demo controls">' +
      '<div class="ksia-demo-id-inner aep-demo-id-inner">' +
      '<section class="aep-demo-env-section" id="aepDemoEnvSection" aria-label="AEP environment">' +
      '<div class="aep-demo-env-editor" id="aepDemoEnvEditor">' +
      '<div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">' +
      '<span class="aep-demo-env-kicker">Environment</span>' +
      '<div class="aep-demo-env-editor-grid">' +
      '<div class="form-row"><label for="sandboxSelect">Sandbox</label>' +
      '<select id="sandboxSelect" class="sandbox-select"><option value="">Loading sandboxes…</option></select></div>' +
      '<div id="ksiaSdkConfigFieldsMount" data-demo-env-strip-mount="site-clone-tags" data-demo-env-strip-prefix="ksia"></div>' +
      '<div class="form-row"><label for="generatorTarget">Event destination</label>' +
      '<select id="generatorTarget"></select></div></div>' +
      '<div id="ksiaSdkConfigSummary" class="ksia-sdk-summary mod-sdk-summary--below-env-grid" hidden>' +
      '<span id="ksiaSdkConfigSummaryText"></span>' +
      '<button type="button" id="ksiaChangeSdkConfigBtn" class="btn-lookup">Change SDK config</button></div></div>' +
      '<div class="aep-demo-env-compact" id="aepDemoEnvCompact" hidden>' +
      '<span class="aep-demo-env-compact-text" id="aepDemoEnvCompactText"></span>' +
      '<button type="button" id="aepDemoEnvExpandBtn" class="btn-lookup aep-demo-env-expand-btn">Change environment</button></div></div></section>' +
      '<section class="aep-demo-profile-section" id="aepDemoProfileSection" aria-label="Profile lookup">' +
      '<span class="aep-demo-env-kicker">Profile lookup</span>' +
      '<div class="aep-demo-profile-section-grid">' +
      '<div class="form-row"><label for="ksiaNs">Namespace</label>' +
      '<select id="ksiaNs" class="sandbox-select"><option value="email">Email</option><option value="ecid">ECID</option>' +
      '<option value="crmId">CRM ID</option><option value="loyaltyId">Loyalty ID</option><option value="phone">Phone</option></select></div>' +
      '<div class="form-row"><label for="customerEmail">Identifier value</label>' +
      '<input type="text" id="customerEmail" placeholder="Enter identifier" autocomplete="off"></div>' +
      '<div class="mod-demo-profile-actions">' +
      '<button type="button" id="queryProfileBtn" class="btn-lookup">Look up profile</button>' +
      '<span class="mod-demo-ecid-hint" id="ecidHint">ECID: <strong id="infoEcid">—</strong></span>' +
      '<div id="siteCloneBcPrefsMount" data-demo-env-strip-mount="site-clone-bc-prefs"></div></div></div></section></div>' +
      '<p class="ksia-demo-script-preview">Selected script: <code id="ksiaSelectedScript">None</code></p>' +
      '<p id="ksiaMessage" class="ksia-demo-message" role="status" hidden></p></section>';

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
        '<div class="dashboard-main-wrap"><main class="dashboard-main app-page ksia-demo-empty-main" aria-hidden="true"></main></div>';
      document.body.appendChild(shell);
    }
  }

  function initFlyoutSidebar() {
    var body = document.body;
    var sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar) return;
    var mq = window.matchMedia('(max-width: 768px)');
    var hideTimer = null;
    function clearHideTimer() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
    function setFlyoutOpen(open) {
      body.classList.toggle('ksia-demo-page--nav-open', open);
    }
    sidebar.addEventListener('mouseenter', function () {
      if (!mq.matches) {
        clearHideTimer();
        setFlyoutOpen(true);
      }
    });
    sidebar.addEventListener('mouseleave', function () {
      if (!mq.matches) {
        hideTimer = setTimeout(function () {
          setFlyoutOpen(false);
        }, 450);
      }
    });
    document.addEventListener(
      'mousemove',
      function (e) {
        if (mq.matches) return;
        if (e.clientX <= 24) {
          clearHideTimer();
          setFlyoutOpen(true);
        }
      },
      { passive: true },
    );
  }

  function bootLabStack() {
    window.SiteCloneDemoEnv = Object.assign(
      {
        storagePrefix: 'ksia',
        webPushBySandboxKey: 'ksiaWebPushOnInjectBySandbox',
        webPushLegacyKey: 'ksiaWebPushOnInjectToggle',
        webPushToggleId: 'ksiaWebPushOnInjectToggle',
        bcOnInjectToggleId: 'ksiaBcOnInjectToggle',
        bcStyleSelectId: 'ksiaBcStyleSelect',
      },
      window.SiteCloneDemoEnv || {},
    );

    var scripts = [
      PV + 'firebase-database-config.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
      PV + 'aep-global-sandbox.js',
      PV + 'aep-lab-sandbox-sync.js?v=20260514-id-token-health',
      PV + 'email-cache.js',
      PV + 'identity-picker.js',
      PV + 'shared/profile-viewer-modal.js?v=20260601-modal-central',
      PV + 'aep-profile-drawer.js?v=20260521-ns-autodetect',
      PV + 'shared/demo-env-strip.js?v=20260601-env-strip-mount-sync',
      PV + 'shared/demo-env-bar-bootstrap.js?v=20260602-env-bar-bootstrap',
      PV + 'demo-tags-injection.js?v=20260605-tags-sandbox-restore',
      PV + 'aep-demo-env-bar.js?v=20260601-launch-unset-expand',
      PV + 'aep-demo-generator-targets.js?v=20260508',
      PV + 'site-clone-bc-env.js?v=20260605-tags-sandbox-restore',
      PV + 'demos/ksia/ksia-lab-core.js?v=' + BUILD,
    ];

    var chain = Promise.resolve();
    scripts.forEach(function (src) {
      chain = chain.then(function () {
        return loadScript(src);
      });
    });

    chain
      .then(function () {
        if (typeof window.initKsiaLab === 'function') {
          window.initKsiaLab({ iframeIds: [] });
        }
        initFlyoutSidebar();
        return loadScript(PV + 'aep-theme.js?v=20260421-fs-helper');
      })
      .then(function () {
        return loadScript(PV + 'aep-theme-prefs.js?v=20260416d');
      })
      .then(function () {
        var nav = document.createElement('script');
        nav.src = PV + 'aep-lab-nav.js?v=20260612-ksia-nav';
        nav.defer = true;
        document.body.appendChild(nav);
      })
      .catch(function (err) {
        console.warn('[ksia-journey-chrome]', err);
      });
  }

  function start() {
    ensureThemePaint();
    linkCss(PV + 'style.css');
    linkCss(PV + 'home.css?v=20260514-customer-demos-nav');
    linkCss(PV + 'ksia-demo.css?v=' + BUILD);
    linkCss(PV + 'shared/demo-env-bar.bundle.css?v=20260602-env-bar-bundle');
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
