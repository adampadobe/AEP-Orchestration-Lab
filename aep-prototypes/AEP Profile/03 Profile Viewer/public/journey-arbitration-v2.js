/**
 * Journey arbitration v2 — nav hide visibility + sync AJO iframe theme to parent --dash-* tokens.
 */
(function () {
  var LS_NAV = 'aepNavHideInDev_journeyArbitrationV2';
  var BRIDGE_ID = 'ja-v2-iframe-bridge';
  var BRIDGE_HREF = 'journey-arbitration-v2-iframe-bridge.css?v=20260427b';

  var DASH_AND_MENU = [
    '--dash-bg',
    '--dash-surface',
    '--dash-surface-alt',
    '--dash-mock-rail-bg',
    '--dash-sidebar',
    '--dash-border',
    '--dash-text',
    '--dash-text-secondary',
    '--dash-muted',
    '--dash-blue',
    '--dash-input-bg',
    '--dash-input-border',
    '--dash-hover',
    '--dash-code-bg',
    '--dash-success-bg',
    '--dash-success-border',
    '--dash-success-text',
    '--dash-error-bg',
    '--dash-error-border',
    '--dash-error-text',
    '--dash-warning-bg',
    '--dash-warning-border',
    '--dash-warning-text',
    '--dash-info-bg',
    '--dash-info-border',
    '--dash-info-text',
    '--dash-hero-grad',
    '--dash-radius',
    '--dash-radius-sm',
    '--dash-shadow',
    '--dash-shadow-hover',
    '--menu-bg',
    '--menu-fg',
    '--menu-fg-muted',
    '--menu-accent',
    '--menu-nav-active-bg',
    '--menu-nav-active-fg',
    '--menu-hover',
    '--app-bg',
    '--panel-bg',
    '--panel-bg-alt',
  ];

  function applyVisibility() {
    var hide = false;
    try {
      hide = localStorage.getItem(LS_NAV) === '1';
    } catch (e) {}
    var blocked = document.getElementById('jaV2Blocked');
    var mount = document.getElementById('jaV2Mount');
    var frame = document.getElementById('jaV2Iframe');
    if (blocked && mount) {
      blocked.hidden = !hide;
      mount.hidden = hide;
    }
    if (frame) {
      try {
        frame.tabIndex = hide ? -1 : 0;
      } catch (e2) {}
    }
  }

  function copyDashTokensToIframeRoot(iframeDoc) {
    var srcEl = document.body;
    if (!srcEl || !iframeDoc || !iframeDoc.documentElement) return;
    var dst = iframeDoc.documentElement;
    var cs = getComputedStyle(srcEl);
    for (var i = 0; i < DASH_AND_MENU.length; i++) {
      var name = DASH_AND_MENU[i];
      var v = cs.getPropertyValue(name);
      if (v && String(v).trim()) dst.style.setProperty(name, String(v).trim());
    }
  }

  function ensureIframeBridge(iframeDoc) {
    if (!iframeDoc || !iframeDoc.head) return;
    if (iframeDoc.getElementById(BRIDGE_ID)) return;
    var link = iframeDoc.createElement('link');
    link.id = BRIDGE_ID;
    link.rel = 'stylesheet';
    link.href = BRIDGE_HREF;
    iframeDoc.head.appendChild(link);
  }

  function syncIframeTheme() {
    var mount = document.getElementById('jaV2Mount');
    if (mount && mount.hidden) return;
    var frame = document.getElementById('jaV2Iframe');
    if (!frame) return;
    try {
      var doc = frame.contentDocument;
      if (!doc || !doc.documentElement) return;
      copyDashTokensToIframeRoot(doc);
      ensureIframeBridge(doc);
    } catch (err) {
      /* cross-origin or sandbox */
    }
  }

  function bindIframe() {
    var frame = document.getElementById('jaV2Iframe');
    if (!frame) return;
    frame.addEventListener('load', function () {
      syncIframeTheme();
    });
    try {
      if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
        syncIframeTheme();
      }
    } catch (e) {}
  }

  applyVisibility();
  window.addEventListener('aep-nav-indev-visibility-change', function () {
    window.location.reload();
  });
  window.addEventListener('storage', function (e) {
    if (e.key === LS_NAV) window.location.reload();
    if (e.key === 'aepTheme') syncIframeTheme();
  });
  window.addEventListener('aep-theme-change', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(syncIframeTheme);
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindIframe);
  } else {
    bindIframe();
  }
})();
