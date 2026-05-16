/**
 * Journey arbitration v2 — nav hide visibility + sync AJO iframe theme + industry toolbar (postMessage to pipeline demo).
 */
(function () {
  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_EDP_INDUSTRY = 'aepEdpIndustry';

  var jaV2IndustryToolbar =
    typeof window.aepDceIndustryToolbarInit === 'function'
      ? window.aepDceIndustryToolbarInit({
          scopeId: 'jaV2IndustryScope',
          btnId: 'ja-v2-industry-btn',
          menuId: 'ja-v2-industry-menu',
          labelId: 'ja-v2-industry-label',
          icoId: 'ja-v2-industry-ico',
          builtAttr: 'data-ja-v2-built',
          boundAttr: 'data-ja-v2-bound',
          iframeId: 'jaV2Iframe',
          postMessageType: 'ja-v2-set-industry',
        })
      : null;

  function getJaV2IndustryKey() {
    return jaV2IndustryToolbar ? jaV2IndustryToolbar.getIndustryKey() : 'media';
  }

  function postJaV2IndustryToIframe(key) {
    if (jaV2IndustryToolbar) jaV2IndustryToolbar.postToIframe(key);
  }

  function jaV2SetIndustry(key, persist, skipPost) {
    if (jaV2IndustryToolbar) jaV2IndustryToolbar.setIndustry(key, persist, skipPost);
  }

  function bootJaV2Industry() {
    if (jaV2IndustryToolbar) jaV2IndustryToolbar.boot();
  }

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
      var k = getJaV2IndustryKey();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          postJaV2IndustryToIframe(k);
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
      if (!jaV2IndustryToolbar) return;
      var nk = jaV2IndustryToolbar.migrateIndustryKey(e.newValue);
      if (jaV2IndustryToolbar.isValidIndustry(nk)) jaV2SetIndustry(nk, false);
    }
  });
  window.addEventListener('aep-theme-change', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(syncIframeTheme);
    });
  });

  function bootJaV2Industry() {
    jaV2BindIndustryUi();
    jaV2InitIndustryFromStorage();
  }

  /* Embed fullscreen — same Spectrum S2 SVG paths as aep-fullscreen.js (targets #jaV2Mount only). */
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

  function jaV2GetFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function jaV2RequestFs(el) {
    if (!el) return Promise.reject(new Error('No element.'));
    if (typeof el.requestFullscreen === 'function') return el.requestFullscreen();
    if (typeof el.webkitRequestFullscreen === 'function') return el.webkitRequestFullscreen();
    if (typeof el.msRequestFullscreen === 'function') return el.msRequestFullscreen();
    return Promise.reject(new Error('Full screen is not supported in this browser.'));
  }

  function jaV2ExitFs() {
    if (!jaV2GetFullscreenElement()) return Promise.resolve();
    if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
    if (typeof document.webkitExitFullscreen === 'function') return document.webkitExitFullscreen();
    if (typeof document.msExitFullscreen === 'function') return document.msExitFullscreen();
    return Promise.reject(new Error('Unable to exit full screen.'));
  }

  function jaV2SyncFullscreenBtn() {
    var btn = document.getElementById('ja-v2-fullscreen-btn');
    var mount = document.getElementById('jaV2Mount');
    if (!btn || !mount) return;
    var active = jaV2GetFullscreenElement() === mount;
    btn.innerHTML = active ? FS_ICON_EXIT : FS_ICON_ENTER;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    var label = active ? 'Exit full screen' : 'Enter full screen';
    btn.setAttribute('aria-label', label);
    btn.setAttribute(
      'title',
      active ? 'Leave embed fullscreen (Esc).' : 'Fill the screen with the pipeline demo. Press Esc to exit.'
    );
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (e1) {}
  }

  function jaV2BindFullscreen() {
    var btn = document.getElementById('ja-v2-fullscreen-btn');
    var mount = document.getElementById('jaV2Mount');
    if (!btn || !mount || btn.getAttribute('data-ja-v2-fs-bound') === '1') return;
    btn.setAttribute('data-ja-v2-fs-bound', '1');
    jaV2SyncFullscreenBtn();
    btn.addEventListener('click', function () {
      var on = jaV2GetFullscreenElement() === mount;
      var p = on ? jaV2ExitFs() : jaV2RequestFs(mount);
      Promise.resolve(p)
        .catch(function () {})
        .finally(jaV2SyncFullscreenBtn);
    });
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'msfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, jaV2SyncFullscreenBtn);
    });
  }

  function bootJaV2Page() {
    bootJaV2Industry();
    jaV2BindFullscreen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindIframe();
      bootJaV2Page();
    });
  } else {
    bindIframe();
    bootJaV2Page();
  }
})();
