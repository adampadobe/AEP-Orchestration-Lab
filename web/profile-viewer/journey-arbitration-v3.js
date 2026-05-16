/**
 * Journey arbitration v3 — nav hide visibility + sync iframe theme + fullscreen + industry toolbar (postMessage to anatomy embed).
 */
(function () {
  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_EDP_INDUSTRY = 'aepEdpIndustry';

  var jaV3IndustryToolbar =
    typeof window.aepDceIndustryToolbarInit === 'function'
      ? window.aepDceIndustryToolbarInit({
          scopeId: 'jaV3IndustryScope',
          btnId: 'ja-v3-industry-btn',
          menuId: 'ja-v3-industry-menu',
          labelId: 'ja-v3-industry-label',
          icoId: 'ja-v3-industry-ico',
          builtAttr: 'data-ja-v3-built',
          boundAttr: 'data-ja-v3-bound',
          iframeId: 'jaV3Iframe',
          postMessageType: 'ja-v2-set-industry',
        })
      : null;

  function getJaV3IndustryKey() {
    return jaV3IndustryToolbar ? jaV3IndustryToolbar.getIndustryKey() : 'media';
  }

  function postJaV3IndustryToIframe(key) {
    if (jaV3IndustryToolbar) jaV3IndustryToolbar.postToIframe(key);
  }

  function jaV3SetIndustry(key, persist, skipPost) {
    if (jaV3IndustryToolbar) jaV3IndustryToolbar.setIndustry(key, persist, skipPost);
  }

  function bootJaV3Industry() {
    if (jaV3IndustryToolbar) jaV3IndustryToolbar.boot();
  }

  var LS_NAV = 'aepNavHideInDev_journeyArbitrationV3';
  var BRIDGE_ID = 'ja-v3-iframe-bridge';
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
    var blocked = document.getElementById('jaV3Blocked');
    var mount = document.getElementById('jaV3Mount');
    var frame = document.getElementById('jaV3Iframe');
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
    var mount = document.getElementById('jaV3Mount');
    if (mount && mount.hidden) return;
    var frame = document.getElementById('jaV3Iframe');
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
    var frame = document.getElementById('jaV3Iframe');
    if (!frame) return;
    frame.addEventListener('load', function () {
      syncIframeTheme();
      var k = getJaV3IndustryKey();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          postJaV3IndustryToIframe(k);
        });
      });
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
    if (e.key === LS_INDUSTRY || e.key === LS_EDP_INDUSTRY) {
      if (!jaV3IndustryToolbar) return;
      var nk = jaV3IndustryToolbar.migrateIndustryKey(e.newValue);
      if (jaV3IndustryToolbar.isValidIndustry(nk)) jaV3SetIndustry(nk, false);
    }
  });
  window.addEventListener('aep-theme-change', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(syncIframeTheme);
    });
  });

  var FS_ICON_ENTER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM17.75,2.5h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';
  var FS_ICON_EXIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM3.25,17h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  function jaV3GetFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function jaV3RequestFs(el) {
    if (!el) return Promise.reject(new Error('No element.'));
    if (typeof el.requestFullscreen === 'function') return el.requestFullscreen();
    if (typeof el.webkitRequestFullscreen === 'function') return el.webkitRequestFullscreen();
    if (typeof el.msRequestFullscreen === 'function') return el.msRequestFullscreen();
    return Promise.reject(new Error('Full screen is not supported in this browser.'));
  }

  function jaV3ExitFs() {
    if (!jaV3GetFullscreenElement()) return Promise.resolve();
    if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
    if (typeof document.webkitExitFullscreen === 'function') return document.webkitExitFullscreen();
    if (typeof document.msExitFullscreen === 'function') return document.msExitFullscreen();
    return Promise.reject(new Error('Unable to exit full screen.'));
  }

  function jaV3SyncFullscreenBtn() {
    var btn = document.getElementById('ja-v3-fullscreen-btn');
    var mount = document.getElementById('jaV3Mount');
    if (!btn || !mount) return;
    var active = jaV3GetFullscreenElement() === mount;
    btn.innerHTML = active ? FS_ICON_EXIT : FS_ICON_ENTER;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    var label = active ? 'Exit full screen' : 'Enter full screen';
    btn.setAttribute('aria-label', label);
    btn.setAttribute(
      'title',
      active ? 'Leave embed fullscreen (Esc).' : 'Fill the screen with the pipeline. Press Esc to exit.'
    );
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (e1) {}
  }

  function jaV3BindFullscreen() {
    var btn = document.getElementById('ja-v3-fullscreen-btn');
    var mount = document.getElementById('jaV3Mount');
    if (!btn || !mount || btn.getAttribute('data-ja-v3-fs-bound') === '1') return;
    btn.setAttribute('data-ja-v3-fs-bound', '1');
    jaV3SyncFullscreenBtn();
    btn.addEventListener('click', function () {
      var on = jaV3GetFullscreenElement() === mount;
      var p = on ? jaV3ExitFs() : jaV3RequestFs(mount);
      Promise.resolve(p)
        .catch(function () {})
        .finally(jaV3SyncFullscreenBtn);
    });
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'msfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, jaV3SyncFullscreenBtn);
    });
  }

  function bootJaV3Page() {
    bootJaV3Industry();
    jaV3BindFullscreen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindIframe();
      bootJaV3Page();
    });
  } else {
    bindIframe();
    bootJaV3Page();
  }
})();
