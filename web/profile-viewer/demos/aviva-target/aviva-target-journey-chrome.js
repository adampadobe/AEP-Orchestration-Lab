/**
 * Mounts the Aviva Target lab strip on direct journey page loads (motor URLs, landing, registration).
 * Skipped inside the lab shell iframe (parent already has the strip) and during VEC compose only.
 */
(function () {
  'use strict';

  var PV = '/profile-viewer/';
  var BUILD = '20260604-journey-chrome';

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
      script.onload = function () {
        resolve();
      };
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
      '<div class="aviva-target-demo-id-inner aep-demo-id-inner">' +
      '<section class="aep-demo-env-section" id="aepDemoEnvSection" aria-label="AEP environment">' +
      '<div class="aep-demo-env-editor" id="aepDemoEnvEditor">' +
      '<div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">' +
      '<span class="aep-demo-env-kicker">Environment</span>' +
      '<div class="aep-demo-env-editor-grid">' +
      '<div class="form-row"><label for="sandboxSelect">Sandbox</label>' +
      '<select id="sandboxSelect" class="sandbox-select" aria-label="Select AEP sandbox">' +
      '<option value="">Loading sandboxes…</option></select></div>' +
      '<div id="avivaTargetSdkConfigFieldsMount" data-demo-env-strip-mount="site-clone-tags" data-demo-env-strip-prefix="avivaTarget"></div>' +
      '<div class="form-row"><label for="generatorTarget">Event destination</label>' +
      '<select id="generatorTarget" aria-label="Edge or DCS streaming target"></select></div>' +
      '</div>' +
      '<div id="avivaTargetSdkConfigSummary" class="aviva-target-sdk-summary mod-sdk-summary--below-env-grid" hidden>' +
      '<span id="avivaTargetSdkConfigSummaryText"></span>' +
      '<button type="button" id="avivaTargetChangeSdkConfigBtn" class="btn-lookup">Change SDK config</button>' +
      '</div></div>' +
      '<div class="aep-demo-env-compact" id="aepDemoEnvCompact" hidden>' +
      '<span class="aep-demo-env-compact-text" id="aepDemoEnvCompactText"></span>' +
      '<button type="button" id="aepDemoEnvExpandBtn" class="btn-lookup aep-demo-env-expand-btn">Change environment</button>' +
      '</div></div></section>' +
      '<section class="aep-demo-profile-section" id="aepDemoProfileSection" aria-label="Profile lookup">' +
      '<span class="aep-demo-env-kicker">Profile lookup</span>' +
      '<div class="aep-demo-profile-section-grid">' +
      '<div class="form-row"><label for="avivaTargetNs">Namespace</label>' +
      '<select id="avivaTargetNs" class="sandbox-select" aria-label="Identity namespace">' +
      '<option value="email">Email</option><option value="ecid" selected>ECID</option>' +
      '<option value="crmId">CRM ID</option><option value="loyaltyId">Loyalty ID</option>' +
      '<option value="phone">Phone</option></select></div>' +
      '<div class="form-row"><label for="customerEmail">Identifier value</label>' +
      '<input type="text" id="customerEmail" placeholder="ECID or email" autocomplete="off" spellcheck="false"></div>' +
      '<div class="mod-demo-profile-actions">' +
      '<button type="button" id="queryProfileBtn" class="btn-lookup">Look up profile</button>' +
      '<span class="mod-demo-ecid-hint" id="ecidHint" aria-live="polite">ECID: <strong id="infoEcid">—</strong></span>' +
      '</div></div></section></div>' +
      '<p class="aviva-target-demo-script-preview">Selected script: <code id="avivaTargetSelectedScript">None</code></p>' +
      '<p id="avivaTargetMessage" class="aviva-target-demo-message" role="status" aria-live="polite" hidden></p>' +
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

    var scripts = [
      PV + 'firebase-database-config.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
      PV + 'aep-global-sandbox.js',
      PV + 'aep-lab-sandbox-sync.js?v=20260420-theme-per-sandbox',
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
      PV + 'demos/aviva-target/aviva-target-lab-core.js?v=' + BUILD,
    ];

    var chain = Promise.resolve();
    scripts.forEach(function (src) {
      chain = chain.then(function () {
        return loadScript(src);
      });
    });

    chain
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
    linkCss(PV + 'shared/demo-env-bar.bundle.css?v=20260623-env-inline');
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
