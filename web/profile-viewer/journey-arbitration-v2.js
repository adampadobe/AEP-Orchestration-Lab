/**
 * Journey arbitration v2 — nav hide visibility + sync AJO iframe theme + industry toolbar (postMessage to pipeline demo).
 */
(function () {
  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_EDP_INDUSTRY = 'aepEdpIndustry';

  var INDUSTRY_LABEL_UI = {
    retail: 'Retail',
    fsi: 'FSI',
    travel: 'Travel',
    media: 'Media',
    sports: 'Sports',
    telecommunications: 'Telecommunications',
    public: 'Public',
    healthcare: 'Healthcare',
  };

  var INDUSTRY_ORDER = ['retail', 'fsi', 'travel', 'media', 'sports', 'telecommunications', 'public', 'healthcare'];

  var INDUSTRY_ICON_INNER = {
    retail:
      '<circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />',
    fsi:
      '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />',
    travel:
      '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />',
    media: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" />',
    sports:
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />',
    telecommunications: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" />',
    public:
      '<line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" />',
    healthcare:
      '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.3.3 0 1 0 .6.3"/><path d="M8 15v1a6 6 0 0 0 12 0v-4"/>',
  };

  function industryIconMarkup(key) {
    var inner = INDUSTRY_ICON_INNER[key] || INDUSTRY_ICON_INNER.media;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        inner +
        '</svg>'
    );
  }

  function migrateIndustryKey(k) {
    if (!k) return 'media';
    var leg = { telco: 'telecommunications', automotive: 'sports' };
    return leg[k] || k;
  }

  function isValidIndustry(k) {
    return INDUSTRY_ORDER.indexOf(k) >= 0;
  }

  function getJaV2IndustryKey() {
    var b = migrateIndustryKey(document.body && document.body.getAttribute('data-dce-industry'));
    if (isValidIndustry(b)) return b;
    return 'media';
  }

  function postJaV2IndustryToIframe(key) {
    var frame = document.getElementById('jaV2Iframe');
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        { source: 'aep-profile-viewer', type: 'ja-v2-set-industry', industry: key },
        '*'
      );
    } catch (err) {}
  }

  function jaV2BuildIndustryMenu() {
    var menu = document.getElementById('ja-v2-industry-menu');
    if (!menu || menu.getAttribute('data-ja-v2-built') === '1') return;
    menu.setAttribute('data-ja-v2-built', '1');
    menu.innerHTML = '';
    INDUSTRY_ORDER.forEach(function (key) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.className = 'dce-edp-dropdown-item';
      btn.setAttribute('data-dce-industry', key);
      var ico = document.createElement('span');
      ico.className = 'dce-edp-menu-ico';
      ico.innerHTML = industryIconMarkup(key);
      var lab = document.createElement('span');
      lab.className = 'dce-edp-menu-label';
      lab.textContent = INDUSTRY_LABEL_UI[key];
      btn.appendChild(ico);
      btn.appendChild(lab);
      menu.appendChild(btn);
    });
  }

  function jaV2SyncIndustryChrome(key) {
    var ico = document.getElementById('ja-v2-industry-ico');
    if (ico) ico.innerHTML = industryIconMarkup(key);
    document.querySelectorAll('#ja-v2-industry-menu .dce-edp-dropdown-item').forEach(function (b) {
      var on = b.getAttribute('data-dce-industry') === key;
      b.classList.toggle('dce-edp-dropdown-item--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function jaV2SetIndustry(key, persist, skipPost) {
    key = migrateIndustryKey(key);
    if (!isValidIndustry(key)) key = 'media';
    try {
      document.body.setAttribute('data-dce-industry', key);
      if (persist !== false) {
        localStorage.setItem(LS_INDUSTRY, key);
        localStorage.setItem(LS_EDP_INDUSTRY, key);
      }
    } catch (e) {}
    var pgLbl = document.getElementById('ja-v2-industry-label');
    if (pgLbl) pgLbl.textContent = INDUSTRY_LABEL_UI[key] || INDUSTRY_LABEL_UI.media;
    jaV2SyncIndustryChrome(key);
    if (!skipPost) postJaV2IndustryToIframe(key);
  }

  function jaV2InitIndustryFromStorage() {
    var key = getJaV2IndustryKey();
    jaV2SetIndustry(key, false, true);
  }

  function jaV2BindIndustryUi() {
    var scope = document.getElementById('jaV2IndustryScope');
    if (!scope || scope.getAttribute('data-ja-v2-bound') === '1') return;
    scope.setAttribute('data-ja-v2-bound', '1');
    jaV2BuildIndustryMenu();

    var ddBtn = document.getElementById('ja-v2-industry-btn');
    var ddMenu = document.getElementById('ja-v2-industry-menu');
    if (ddBtn && ddMenu) {
      function closeIndustryMenu() {
        ddMenu.hidden = true;
        ddBtn.setAttribute('aria-expanded', 'false');
      }
      ddBtn.addEventListener('click', function (e) {
        e.preventDefault();
        ddMenu.hidden = !ddMenu.hidden;
        ddBtn.setAttribute('aria-expanded', ddMenu.hidden ? 'false' : 'true');
      });
      ddMenu.querySelectorAll('[data-dce-industry]').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.preventDefault();
          var raw = item.getAttribute('data-dce-industry');
          var k = migrateIndustryKey(raw);
          if (k && isValidIndustry(k)) jaV2SetIndustry(k, true);
          closeIndustryMenu();
        });
      });
      document.addEventListener('click', function (e) {
        if (!ddMenu.hidden && ddBtn && !ddBtn.contains(e.target) && !ddMenu.contains(e.target)) {
          closeIndustryMenu();
        }
      });
    }
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
      var nk = migrateIndustryKey(e.newValue);
      if (isValidIndustry(nk)) jaV2SetIndustry(nk, false);
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
